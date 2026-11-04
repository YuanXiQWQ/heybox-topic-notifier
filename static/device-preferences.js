/** @file 在页面绘制前应用本机外观；只有用户手动选择才保存偏好。 */
(() => {
  // 原生桥在文档脚本执行前已存在，导航布局与外观一起在首屏绘制前确定。
  if (globalThis.HeyboxNative || globalThis.appNative) {
    document.documentElement.dataset.applicationPlatform = globalThis.HeyboxNative ? "android" : "windows";
  }
  /** 系统明暗变化不产生持久化偏好。 */
  const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
  /** Android 系统配置优先于固定浅色宿主主题的 WebView 媒体查询。 */
  let nativeDarkMode;
  /** 本页是否正在等待语言页面刷新。 */
  let refreshing = false;

  /**
   * 读取当前设备显式选择的值。
   * @param {string} field 偏好名称。
   * @return {string | undefined} 显式值，未选择时返回 undefined。
   */
  function read(field) {
    const prefix = `heybox-device-${field}=`;
    const item = document.cookie.split(";").map((part) => part.trim()).find(
      (part) => part.startsWith(prefix),
    );
    try {
      return item ? decodeURIComponent(item.slice(prefix.length)) : undefined;
    } catch {
      return undefined;
    }
  }

  /** 应用手动偏好或当前系统明暗，并使设置控件与实际显示一致。 */
  function apply() {
    const manual = read("darkMode");
    const dark = manual === "true" ||
      (manual !== "false" && (nativeDarkMode ?? media?.matches ?? false));
    const color = read("themeColor");
    const theme = color && /^#[a-f0-9]{6}$/i.test(color) ? color : "#bd7fff";
    document.documentElement.dataset.colorMode = dark ? "dark" : "light";
    document.documentElement.style.setProperty("--theme-color", theme);
    const darkInput = document.querySelector("[data-dark-mode-input]");
    const colorInput = document.querySelector("[data-theme-color-input]");
    const localeInput = document.querySelector('select[name="locale"]');
    if (darkInput) darkInput.checked = dark;
    if (colorInput) colorInput.value = theme;
    if (localeInput && read("locale")) localeInput.value = read("locale");
  }

  /**
   * 保存一次用户手动选择，并检查浏览器确实接纳写入。
   * @param {string} field 允许的显示偏好。
   * @param {string | boolean} value 用户选择的值。
   */
  function save(field, value) {
    const text = String(value);
    if (
      !["darkMode", "themeColor", "locale"].includes(field) ||
      (field === "darkMode" && !["true", "false"].includes(text)) ||
      (field === "themeColor" && !/^#[a-f0-9]{6}$/i.test(text)) ||
      (field === "locale" && !/^[a-z]{2}-[A-Z]{2}$/.test(text))
    ) throw new Error("Invalid device preference");
    document.cookie = `heybox-device-${field}=${
      encodeURIComponent(text)
    }; Path=/; Max-Age=31536000; SameSite=Lax${
      location.protocol === "https:" ? "; Secure" : ""
    }`;
    if (read(field) !== text) {
      throw new Error("Device preference was not saved");
    }
    apply();
  }

  /**
   * 语言变化时先保存业务编辑，再获取本设备语言页面；离线选择在联网后应用。
   * @return {Promise<void>} 页面刷新已安排或等待网络恢复。
   */
  async function refreshLanguage() {
    if (refreshing || navigator.onLine === false) return;
    refreshing = true;
    try {
      if (
        globalThis.flushSettingsEdits && !await globalThis.flushSettingsEdits()
      ) return;
      await globalThis.applicationSync?.prepareForExit();
      if (globalThis.applicationSync) {
        await globalThis.applicationSync.flush();
        const pending = await globalThis.AppLocalStore.pending(
          globalThis.applicationSync.userId,
        );
        if (pending.some((operation) => operation.kind === "settings")) return;
      }
      const url = new URL(location.href);
      url.searchParams.delete("locale");
      url.searchParams.delete("localeChanged");
      location.replace(url.href);
    } finally {
      refreshing = false;
    }
  }

  apply();
  if (media?.addEventListener) media.addEventListener("change", apply);
  else {
    // 不提供标准 change 事件接口的 WebView 通过媒体查询监听器跟随系统主题。
    // noinspection JSDeprecatedSymbols
    media?.addListener(apply);
  }
  document.addEventListener("DOMContentLoaded", apply);
  document.addEventListener("application-native-state", (event) => {
    if (typeof event.detail?.systemDarkMode === "boolean") {
      nativeDarkMode = event.detail.systemDarkMode;
      apply();
    }
  });
  globalThis.addEventListener("pageshow", apply);
  globalThis.addEventListener("languagechange", () => {
    if (!read("locale")) void refreshLanguage().catch(() => {});
  });
  globalThis.addEventListener("online", () => {
    if (read("locale") && read("locale") !== document.documentElement.lang) {
      void refreshLanguage().catch(() => {});
    }
  });
  document.addEventListener("application-sync-complete", () => {
    if (read("locale") && read("locale") !== document.documentElement.lang) {
      void refreshLanguage().catch(() => {});
    }
  });
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = /** @type {HTMLAnchorElement|null} */ (event.target.closest(".auth-language-options a[href]"));
    if (!link) return;
    const locale = new URL(link.href).searchParams.get("locale");
    if (locale) {
      try {
        save("locale", locale);
      } catch {
        event.preventDefault();
      }
    }
  });
  globalThis.applicationAppearance = Object.freeze({ save, refreshLanguage });
})();
