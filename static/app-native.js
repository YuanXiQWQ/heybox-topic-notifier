/** @file 复用现有设置样式连接原生通知、更新确认和分层红点。 */
(() => {
  /** Android 只提供按来源限制的消息端口，统一为与电脑端相同的 Promise 接口。 */
  if (!globalThis.appNative && globalThis.HeyboxNative) {
    const pending = new Map();
    const listeners = new Set();
    let serial = 0;
    /**
     * 发送固定能力请求，不开放任意代码执行或文件访问。
     * @param {string} method 能力名称。
     * @param {unknown} value 参数。
     * @return {Promise<unknown>} 原生回复。
     */
    const request = (method, value) => {
      return new Promise((resolve, reject) => {
        const id = String(++serial);
        /** 只计算没有原生进度的等待时间，大安装包正常下载可以超过两分钟。 */
        const timeout = () => {
          pending.delete(id);
          reject(new Error("Native request timed out"));
        };
        const item = {
          resolve,
          reject,
          method,
          timeout,
          timer: setTimeout(timeout, 120000),
        };
        pending.set(id, item);
        try {
          globalThis.HeyboxNative.postMessage(
            JSON.stringify({ id, method, value }),
          );
        } catch (error) {
          clearTimeout(item.timer);
          pending.delete(id);
          reject(error);
        }
      });
    };
    globalThis.HeyboxNative.onmessage = (message) => {
      const reply = JSON.parse(message.data);
      if (reply.type === "state") {
        if (reply.value?.update?.status === "downloading") {
          for (const item of pending.values()) {
            if (item.method !== "downloadUpdate") continue;
            clearTimeout(item.timer);
            item.timer = setTimeout(item.timeout, 120000);
          }
        }
        listeners.forEach((listener) => listener(reply.value));
        return;
      }
      const item = pending.get(reply.id);
      if (!item) return;
      pending.delete(reply.id);
      clearTimeout(item.timer);
      if (reply.error) item.reject(new Error(reply.error));
      else item.resolve(reply.value);
    };
    globalThis.appNative = Object.freeze({
      info: () => request("info"),
      signIn: () => request("login"),
      notifications: (enabled) => request("notifications", enabled),
      checkUpdate: () => request("checkUpdate"),
      downloadUpdate: () => request("downloadUpdate"),
      installUpdate: () => request("installUpdate"),
      background: () => request("background"),
      seenUpdate: (section) => request("seenUpdate", section),
      preferences: (values) => request("preferences", values),
      refreshBadge: () => request("refreshBadge"),
      onState: (listener) => listeners.add(listener),
    });
  }
  /** 网页保留浏览器通知与安装入口；只有经过原生桥接的页面显示应用能力。 */
  const native = globalThis.appNative;
  if (!native) return;
  /** 合并保存期间的重复返回手势，避免连续退过多个页面。 */
  let navigating;
  /**
   * 原生返回、通知跳转和退到后台统一等待本地保存，账号变化后放弃旧通知。
   * @param {string} target 返回、后台或本站路径。
   * @param {string | undefined} userId 通知所属账号。
   * @return {Promise<void>} 导航完成或保存失败。
   */
  globalThis.applicationNavigate = (target, userId) => {
    if (navigating) return navigating;
    const page = location.href;
    navigating = (async () => {
      if (userId && document.body.dataset.appUserId !== userId) return;
      if (
        !["back", "background"].includes(target) &&
        !["/", "/history", "/about"].includes(target)
      ) throw new Error("Invalid application route");
      await globalThis.applicationSync?.prepareForExit();
      if (
        location.href !== page ||
        (userId && document.body.dataset.appUserId !== userId)
      ) return;
      if (target === "back") history.back();
      else if (target === "background") await native.background();
      else location.assign(target);
    })().finally(() => {
      navigating = undefined;
    });
    return navigating;
  };
  /** 服务端提供当前页面语言，原生桥不硬编码界面文案。 */
  const labels = JSON.parse(
    document.getElementById("application-messages")?.textContent || "{}",
  );
  /** 当前设备状态与当前页面已经查看的更新版本。 */
  let state;
  let marked;
  let prompted;
  let dialog;
  /** 手动检查后才展示行内检查结果，启动检查通过红点和确认窗口提示更新。 */
  let updateRequested = false;
  const check = document.querySelector("[data-app-check-update]");
  const status = document.querySelector("[data-app-update-status]");
  document.querySelector("[data-app-downloads]")?.setAttribute("hidden", "");
  document.querySelector("[data-app-updates]")?.removeAttribute("hidden");
  native.onState(render);
  globalThis.applicationNativeReady = native.info().then((info) => {
    render(info);
    return info;
  });
  void globalThis.applicationNativeReady.catch(() =>
    showStatus(labels.updateFailed)
  );
  check?.addEventListener("click", async () => {
    updateRequested = true;
    check.disabled = true;
    showStatus(labels.updateChecking);
    try {
      render(await native.checkUpdate());
      if (["available", "downloaded"].includes(state.update.status)) {
        showConfirmation();
      }
    } catch {
      check.disabled = false;
      showStatus(labels.updateFailed);
    }
  });

  /**
   * 沿用行内状态反馈检查或下载结果。
   * @param {string} text 提示文案。
   */
  function showStatus(text) {
    if (status) {
      status.textContent = text || "";
      status.hidden = !text;
    }
  }
  /**
   * 设置一个独立层级的红点，保留原有元素、图标和点击范围。
   * @param {string} selector 目标。
   * @param {boolean} visible 红点状态。
   */
  function dot(selector, visible) {
    const target = document.querySelector(selector);
    if (!target) return;
    target.classList.toggle("app-update-unread", visible);
  }
  /**
   * 显示本机版本、手动检查结果和下载进度；进入页面只清除对应入口红点。
   * @param {object} next 原生状态。
   */
  function render(next) {
    state = next;
    document.documentElement.dataset.applicationPlatform = state.platform;
    const version = document.querySelector("[data-app-version]");
    if (version) version.textContent = state.version;
    const update = state.update;
    dot("[data-app-settings-link]", update.settingsUnread);
    dot("[data-app-about-link]", update.aboutUnread);
    dot("[data-app-version]", Boolean(update.version && !update.silent));
    const messages = {
      checking: labels.updateChecking,
      current: labels.updateCurrent,
      error: labels.updateFailed,
      development: labels.updateDevelopment,
      available: `${labels.updateAvailable} ${update.version ?? ""}`,
      downloaded: `${labels.updateAvailable} ${update.version ?? ""}`,
      downloading: `${labels.updateDownloading} ${
        Math.floor(update.progress ?? 0)
      }%`,
    };
    showStatus(
      updateRequested || update.status === "downloading"
        ? messages[update.status] ?? ""
        : "",
    );
    if (check) {
      check.disabled = ["checking", "downloading"].includes(update.status);
    }
    if (
      update.version && marked !== update.version &&
      ["/settings", "/about"].includes(location.pathname)
    ) {
      marked = update.version;
      void native.seenUpdate(location.pathname.slice(1)).then(render).catch(
        () => {},
      );
    }
    if (
      ["available", "downloaded"].includes(update.status) && update.prompt &&
      prompted !== update.version
    ) {
      prompted = update.version;
      showConfirmation();
    }
    if (dialog?.open) updateDialog();
    document.dispatchEvent(
      new CustomEvent("application-native-state", { detail: state }),
    );
  }
  /**
   * 创建使用现有弹窗、按钮和间距的更新确认窗口。
   */
  function showConfirmation() {
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "avatar-crop-dialog app-update-dialog";
      const heading = document.createElement("h2");
      heading.id = "app-update-heading";
      heading.textContent = labels.updateAvailable;
      const header = document.createElement("div");
      header.className = "avatar-crop-header";
      header.append(heading);
      const version = document.createElement("p");
      version.dataset.appUpdateTarget = "";
      const actions = document.createElement("div");
      actions.className = "app-update-actions";
      const later = document.createElement("button");
      later.type = "button";
      later.className = "secondary";
      later.textContent = labels.updateLater;
      later.addEventListener("click", () => dialog.close());
      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.dataset.appUpdateConfirm = "";
      confirm.addEventListener("click", async () => {
        confirm.disabled = true;
        try {
          if (state.update.status === "downloaded") {
            await globalThis.applicationSync?.prepareForExit();
            await native.installUpdate();
          } else {
            render(await native.downloadUpdate());
            if (
              state.platform === "android" &&
              state.update.status === "downloaded"
            ) {
              await globalThis.applicationSync?.prepareForExit();
              await native.installUpdate();
            }
          }
        } catch {
          showStatus(labels.updateFailed);
        } finally {
          updateDialog();
        }
      });
      actions.append(later, confirm);
      dialog.append(header, version, actions);
      dialog.setAttribute("aria-labelledby", heading.id);
      dialog.addEventListener("close", () => {
        void native.seenUpdate("dismissed").then(render).catch(() => {});
      });
      document.body.append(dialog);
    }
    updateDialog();
    if (!dialog.open) dialog.showModal();
  }
  /**
   * 下载过程中只更新确认按钮和进度，不重新创建窗口或覆盖用户焦点。
   */
  function updateDialog() {
    if (!dialog) return;
    dialog.querySelector("[data-app-update-target]").textContent =
      state.update.version ?? "";
    const button = dialog.querySelector("[data-app-update-confirm]");
    button.disabled = state.update.status === "downloading";
    button.textContent = state.update.status === "downloaded"
      ? (state.platform === "windows"
        ? labels.updateRestart
        : labels.updateDownload)
      : state.update.status === "downloading"
      ? `${labels.updateDownloading} ${Math.floor(state.update.progress ?? 0)}%`
      : labels.updateDownload;
  }
})();
