/** @file 在设置与子页之间保留当前标签页、当前账号的阅读位置。 */
(() => {
  /** 按账号隔离同一标签页的返回位置，不跨设备同步。 */
  const key = `settings-return:${document.body.dataset.appUserId || "local"}`;

  /**
   * 读取返回坐标；存储不可用时保持链接正常导航。
   * @return {{x:number,y:number}|null} 已记录的设置坐标。
   */
  function read() {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }

  /** 保存进入子页前的位置，抽屉展开状态由设置编辑器持久保存。 */
  function remember() {
    try {
      sessionStorage.setItem(key, JSON.stringify({ x: scrollX, y: scrollY }));
    } catch { /* 禁用存储时仍允许返回设置。 */ }
  }

  /** 在布局初始化后恢复滚动，避免浏览器自动恢复与页面初始化互相覆盖。 */
  function restore() {
    const position = read();
    if (
      !position || !Number.isFinite(position.y) || !Number.isFinite(position.x)
    ) return;
    let cancelled = false;
    const events = ["wheel", "touchstart", "pointerdown", "keydown"];
    /** 用户主动操作后停止自动校准，避免争夺滚动控制。 */
    function cancel() {
      cancelled = true;
    }
    events.forEach((name) => addEventListener(name, cancel, { passive: true }));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!cancelled) scrollTo(position.x, position.y);
      })
    );
    setTimeout(() => {
      if (!cancelled) scrollTo(position.x, position.y);
      events.forEach((name) => removeEventListener(name, cancel));
    }, 350);
  }

  globalThis.settingsPageNavigation = { remember, restore };
  document.addEventListener("click", (event) => {
    if (
      event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey ||
      event.altKey
    ) return;
    const link = event.target.closest?.("[data-settings-subpage]");
    if (link && (!link.target || link.target === "_self")) remember();
  });
  addEventListener("pageshow", () => {
    if (
      location.pathname !== "/settings" ||
      new URL(location.href).searchParams.has("panel")
    ) return;
    let returning = false;
    try {
      returning = ["/about", "/settings"].includes(
        new URL(document.referrer).pathname,
      );
    } catch { /* 直接访问无来源。 */ }
    const back =
      performance.getEntriesByType("navigation")[0]?.type === "back_forward";
    if (returning || back) restore();
  });
})();
