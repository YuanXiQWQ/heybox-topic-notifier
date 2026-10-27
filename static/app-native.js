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
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("Native request timed out"));
        }, 120000);
        pending.set(id, { resolve, reject, timer });
        globalThis.HeyboxNative.postMessage(
          JSON.stringify({ id, method, value }),
        );
      });
    };
    globalThis.HeyboxNative.onmessage = (message) => {
      const reply = JSON.parse(message.data);
      if (reply.type === "state") {
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
      notifications: (enabled) => request("notifications", enabled),
      checkUpdate: () => request("checkUpdate"),
      downloadUpdate: () => request("downloadUpdate"),
      installUpdate: () => request("installUpdate"),
      seenUpdate: (section) => request("seenUpdate", section),
      onState: (listener) => listeners.add(listener),
    });
  }
  /** 网页保留浏览器通知与安装入口；只有经过原生桥接的页面显示应用能力。 */
  const native = globalThis.appNative;
  if (!native) return;
  /** 服务端提供当前页面语言，原生桥不硬编码界面文案。 */
  const labels = JSON.parse(
    document.getElementById("application-messages")?.textContent || "{}",
  );
  /** 当前设备状态与当前页面已经查看的更新版本。 */
  let state;
  let marked;
  let prompted;
  let dialog;
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
    try {
      render(await native.checkUpdate());
      if (state.update.version) showConfirmation();
    } catch {
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
   * 显示本机版本和更新状态；进入页面只清除对应入口红点。
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
    dot("[data-app-version]", Boolean(update.version));
    const messages = {
      checking: labels.updateChecking,
      current: labels.updateCurrent,
      error: labels.updateFailed,
      development: labels.updateDevelopment,
      downloading: `${labels.updateDownloading} ${
        Math.floor(update.progress ?? 0)
      }%`,
    };
    showStatus(messages[update.status] ?? "");
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
      update.status === "available" && update.prompt &&
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
