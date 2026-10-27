/** @file 管理当前浏览器的系统通知权限和与账号绑定的 Web Push 订阅。 */
void initializeApplicationNotifications();

/**
 * 初始化当前设备通知开关，展示初始化状态并允许失败后重试；权限仅由用户操作请求。
 * @return {Promise<void>} 初始化完成。
 */
async function initializeApplicationNotifications() {
  const toggle = document.querySelector("[data-app-notifications]");
  const status = document.querySelector("[data-app-notifications-status]");
  const retry = document.querySelector("[data-app-notifications-retry]");
  if (
    !(toggle instanceof HTMLInputElement) || !(status instanceof HTMLElement)
  ) return;

  /**
   * 按现有行内状态样式展示必要的操作反馈。
   * @param {string} message 提示文案。
   */
  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  /**
   * 限时加载设备能力，失败时保留可见原因和重试入口，不让迟到结果改写界面。
   * @param {(signal: AbortSignal) => Promise<object>} load 只读取状态的初始化操作。
   * @param {(info: object) => void} apply 成功后应用状态。
   * @return {Promise<void>} 本次初始化完成。
   */
  async function prepare(load, apply) {
    toggle.disabled = true;
    if (retry) retry.hidden = true;
    showStatus(toggle.dataset.loading);
    const controller = new AbortController();
    let timer;
    try {
      const info = await Promise.race([
        load(controller.signal),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("unavailable"));
          }, 15000);
        }),
      ]);
      showStatus("");
      apply(info);
    } catch (error) {
      showStatus(
        error?.message === "unconfigured"
          ? toggle.dataset.unconfigured
          : toggle.dataset.unavailable,
      );
      if (retry) retry.hidden = false;
    } finally {
      clearTimeout(timer);
    }
  }

  if (globalThis.appNative) {
    /**
     * 同步本机权限和后台通道状态，定期补取时提示系统调度可能延迟。
     * @param {object} info 原生设备状态。
     */
    const applyNativeState = (info) => {
      toggle.checked = info.notifications.enabled;
      toggle.disabled = !info.notifications.supported;
      showStatus(
        !info.notifications.supported
          ? toggle.dataset.unsupported
          : info.notifications.enabled &&
              info.notifications.backgroundPushConfigured === false
          ? toggle.dataset.backgroundUnavailable
          : "",
      );
    };
    document.addEventListener("application-native-state", (event) => {
      if (retry) retry.hidden = true;
      applyNativeState(event.detail);
    });
    toggle.addEventListener("change", async (event) => {
      event.stopPropagation();
      const enabled = toggle.checked;
      toggle.disabled = true;
      showStatus(toggle.dataset.loading);
      let supported = true;
      try {
        const info = await globalThis.appNative.notifications(enabled);
        supported = info.notifications.supported;
        applyNativeState(info);
      } catch {
        toggle.checked = !enabled;
        showStatus(toggle.dataset.failed);
      } finally {
        toggle.disabled = !supported;
      }
    });
    retry?.addEventListener(
      "click",
      () => prepare(() => globalThis.appNative.info(), applyNativeState),
    );
    await prepare(() => globalThis.applicationNativeReady, applyNativeState);
    return;
  }

  if (
    !globalThis.isSecureContext || !("serviceWorker" in navigator) ||
    !("PushManager" in globalThis) || !("Notification" in globalThis)
  ) {
    showStatus(toggle.dataset.unsupported);
    return;
  }
  let config, registration, subscription;

  /**
   * 读取服务器能力、活动 Service Worker 与当前会话的订阅；不申请权限或创建订阅。
   * @param {AbortSignal} signal 初始化超时或取消信号。
   * @return {Promise<object>} 完整的浏览器推送状态。
   */
  async function loadBrowserState(signal) {
    const response = await fetch("/api/app-notifications/status", {
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (!response.ok || response.redirected) throw new Error("unavailable");
    const config = await response.json();
    if (!config.publicKey) {
      throw new Error("unconfigured");
    }
    await navigator.serviceWorker.register("/app-sw.js", {
      scope: "/",
    });
    const registration = await navigator.serviceWorker.ready;
    signal.throwIfAborted();
    const subscription = await registration.pushManager.getSubscription();
    let enabled = false;

    if (subscription && Notification.permission === "granted") {
      const device = await browserSubscriptionId(subscription.endpoint);
      const current = await fetch(
        `/api/app-notifications/status?device=${device}`,
        { cache: "no-store", redirect: "error", signal },
      );
      if (!current.ok) throw new Error("unavailable");
      const state = await current.json();
      enabled = state.userId === config.userId && state.enabled === true;
    }
    return { config, registration, subscription, enabled };
  }

  /**
   * 保存完整的初始化结果，允许用户开启或关闭当前浏览器通知。
   * @param {object} info 浏览器通知状态。
   */
  function applyBrowserState(info) {
    ({ config, registration, subscription } = info);
    toggle.checked = info.enabled;
    toggle.disabled = false;
    if (Notification.permission === "denied") showStatus(toggle.dataset.denied);
  }

  /**
   * 将当前订阅启用状态提交给服务端；成功前不宣称已保存。
   * @param {boolean} enabled 是否启用。
   * @return {Promise<void>} 保存结果。
   */
  const saveSubscription = async (enabled) => {
    const csrf = document.querySelector('input[name="csrfToken"]')?.value;
    const saved = await fetch("/api/app-notifications/subscription", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf || "",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ enabled, subscription: subscription?.toJSON() }),
    });
    if (!saved.ok || saved.redirected) throw new Error("subscription");
  };

  toggle.addEventListener("change", async (event) => {
    event.stopPropagation();
    const enabled = toggle.checked;
    toggle.disabled = true;
    showStatus(toggle.dataset.loading);
    try {
      if (enabled) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toggle.checked = false;
          showStatus(toggle.dataset.denied);
          return;
        }
        const publicKey = decodePushKey(config.publicKey);
        if (
          subscription &&
          !samePushKey(subscription.options.applicationServerKey, publicKey)
        ) {
          await subscription.unsubscribe();
          subscription = null;
        }
        subscription ??= await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });
        await saveSubscription(true);
      } else {
        if (subscription) {
          await saveSubscription(false);
        }
      }
      showStatus("");
    } catch {
      toggle.checked = !enabled;
      showStatus(toggle.dataset.failed);
    } finally {
      toggle.disabled = false;
    }
  });
  retry?.addEventListener(
    "click",
    () => prepare(loadBrowserState, applyBrowserState),
  );
  await prepare(loadBrowserState, applyBrowserState);
}

/**
 * 生成订阅标识，用于读取当前会话的启用状态，不在 URL 中传递完整端点。
 * @param {string} endpoint 推送端点。
 * @return {Promise<string>} Base64URL 编码的 SHA-256 摘要。
 */
async function browserSubscriptionId(endpoint) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)),
  );
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replaceAll("=", "");
}

/**
 * 比较浏览器订阅与部署公钥，避免密钥轮换后继续使用无法投递的订阅。
 * @param {ArrayBuffer | null} existing 已有订阅公钥。
 * @param {Uint8Array} expected 部署公钥。
 * @return {boolean} 公钥是否相同。
 */
function samePushKey(existing, expected) {
  if (!existing) return false;
  const bytes = new Uint8Array(existing);
  return bytes.length === expected.length &&
    bytes.every((byte, index) => byte === expected[index]);
}

/**
 * 将 VAPID Base64URL 公钥转换为浏览器订阅要求的字节数组。
 * @param {string} value Base64URL 公钥。
 * @return {Uint8Array} 公钥字节。
 */
function decodePushKey(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    (char) => char.charCodeAt(0),
  );
}
