/** @file 应用内 Google 登录交给系统浏览器，邮箱和密码仍使用原有同账号登录流程。 */
(() => {
  if (!globalThis.appNative && !globalThis.HeyboxNative) return;
  const root = document.querySelector("[data-google-login]");
  if (!root) return;
  root.hidden = false;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary auth-passkey-button";
  button.textContent = root.dataset.googleLabel;
  root.append(button);
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const result = typeof globalThis.appNative?.signIn === "function"
        ? await globalThis.appNative.signIn()
        : await androidLogin();
      button.textContent = `${root.dataset.googleLabel} · ${result.code}`;
    } catch {
      button.textContent = root.dataset.googleFailed;
      button.disabled = false;
    }
  });
  /**
   * 发起 Android 受来源限制的浏览器登录，verifier 留在原生层。
   * @return {Promise<object>} 本次配对识别码。
   */
  function androidLogin() {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const previous = globalThis.HeyboxNative.onmessage;
      /** 恢复页面已有分发器，不截断通知和更新事件。 */
      const restore = () => {
        if (globalThis.HeyboxNative.onmessage === receive) {
          globalThis.HeyboxNative.onmessage = previous;
        }
      };
      const timer = setTimeout(
        () => {
          restore();
          reject(new Error("Login unavailable"));
        },
        30000,
      );
      /** @param {MessageEvent} event 原生登录回复或其它能力消息。 */
      const receive = (event) => {
        const result = JSON.parse(event.data);
        if (result.id !== id) {
          previous?.(event);
          return;
        }
        clearTimeout(timer);
        restore();
        if (result.error) reject(new Error(result.error));
        else resolve(result.value);
      };
      globalThis.HeyboxNative.onmessage = receive;
      try {
        globalThis.HeyboxNative.postMessage(
          JSON.stringify({ id, method: "login" }),
        );
      } catch (error) {
        clearTimeout(timer);
        restore();
        reject(error);
      }
    });
  }
})();
