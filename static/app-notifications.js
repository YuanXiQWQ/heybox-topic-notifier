/** @file 管理当前浏览器的系统通知权限和与账号绑定的 Web Push 订阅。 */
void initializeApplicationNotifications();

/**
 * 初始化通知开关，只在用户已授权的设备上恢复订阅。
 * @return {Promise<void>} 初始化完成。
 */
async function initializeApplicationNotifications() {
  const toggle = document.querySelector("[data-app-notifications]");
  const status = document.querySelector("[data-app-notifications-status]");
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

  if (globalThis.appNative) {
    /**
     * 同步本机权限和后台通道状态，未配置厂商推送时保留明确提示。
     * @param {object} info 原生设备状态。
     */
    const applyNativeState = (info) => {
      toggle.checked = info.notifications.enabled;
      toggle.disabled = !info.notifications.supported;
      showStatus(
        info.notifications.enabled &&
          info.notifications.backgroundPushConfigured === false
          ? toggle.dataset.backgroundUnavailable
          : "",
      );
    };
    try {
      const info = await globalThis.applicationNativeReady;
      applyNativeState(info);
      document.addEventListener("application-native-state", (event) => {
        applyNativeState(event.detail);
      });
      toggle.addEventListener("change", async (event) => {
        event.stopPropagation();
        const enabled = toggle.checked;
        toggle.disabled = true;
        showStatus("");
        try {
          applyNativeState(await globalThis.appNative.notifications(enabled));
        } catch {
          toggle.checked = !enabled;
          showStatus(toggle.dataset.failed);
        } finally {
          toggle.disabled = false;
        }
      });
    } catch {
      showStatus(toggle.dataset.unavailable);
    }
    return;
  }

  if (
    !globalThis.isSecureContext || !("serviceWorker" in navigator) ||
    !("PushManager" in globalThis) || !("Notification" in globalThis)
  ) {
    toggle.title = toggle.dataset.unsupported;
    return;
  }
  try {
    const response = await fetch("/api/app-notifications/status", {
      cache: "no-store",
    });
    if (!response.ok || response.redirected) throw new Error("unavailable");
    const config = await response.json();
    if (!config.publicKey) {
      toggle.title = toggle.dataset.unavailable;
      return;
    }
    const registration = await navigator.serviceWorker.register("/app-sw.js", {
      scope: "/",
    });
    await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

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
        body: JSON.stringify({ enabled, subscription: subscription?.toJSON() }),
      });
      if (!saved.ok || saved.redirected) throw new Error("subscription");
    };

    if (subscription && Notification.permission === "granted") {
      const device = await browserSubscriptionId(subscription.endpoint);
      const current = await fetch(
        `/api/app-notifications/status?device=${device}`,
        { cache: "no-store", redirect: "error" },
      );
      if (!current.ok) throw new Error("unavailable");
      const state = await current.json();
      toggle.checked = state.userId === config.userId && state.enabled === true;
    }
    toggle.disabled = false;
    toggle.addEventListener("change", async (event) => {
      event.stopPropagation();
      const enabled = toggle.checked;
      toggle.disabled = true;
      showStatus("");
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
      } catch {
        toggle.checked = !enabled;
        showStatus(toggle.dataset.failed);
      } finally {
        toggle.disabled = false;
      }
    });
  } catch {
    toggle.title = toggle.dataset.unavailable;
  }
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
