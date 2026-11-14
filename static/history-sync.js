/** @file 对可见历史页面增量刷新，保留查询、选择和离线操作。 */
(() => {
  /** 版本只在成功应用同一查询响应后推进，并合并并发刷新。 */
  let version = "", inFlight = false;
  /**
   * 获取历史表格的当前版本，正在提交或切换查询时丢弃旧响应。
   * @return {Promise<void>} 本次同步结束。
   */
  async function refresh() {
    if (document.hidden || inFlight || location.pathname !== "/history") return;
    const current = document.querySelector("[data-match-table-section]");
    if (!current || current.querySelector('[data-match-table-submitting="true"]')) return;
    const query = location.search;
    const token = globalThis.applicationSync?.beginRecordRefresh();
    inFlight = true;
    try {
      const response = await fetch("/history" + query, {
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { "x-match-table-refresh": "1", "x-history-version": version },
      });
      if (response.status === 304 || !response.ok) return;
      const html = await response.text();
      if (token && !globalThis.applicationSync.isRecordRefreshCurrent(token)) return;
      if (query !== location.search || !current.isConnected || current.querySelector('[data-match-table-submitting="true"]')) return;
      const next = new DOMParser().parseFromString(html, "text/html").querySelector("[data-match-table-section]");
      if (!next) return;
      if (next.dataset.matchTableSignature !== current.dataset.matchTableSignature || token?.projected) {
        const selected = new Set([...current.querySelectorAll('input[name="matchId"]:checked')].map(input => input.value));
        for (const input of next.querySelectorAll('input[name="matchId"]')) input.checked = selected.has(input.value);
        current.replaceWith(next);
        globalThis.__matchTableFilterInit?.();
        globalThis.__adaptivePaginationUpdate?.();
        globalThis.__matchTableRelativeTimeUpdate?.();
        // 此处使用标准浏览器 API 或页面声明的宿主接口；IDE 的跨脚本推断不完整。
        // noinspection JSCheckFunctionSignatures
        globalThis.__matchTableOverflowUpdate?.();
        document.dispatchEvent(new CustomEvent("application-records-rendered", {detail: {recordReadAt: token?.readAt}}));
      }
      version = response.headers.get("x-history-version") ?? "";
    } catch { /* 离线或暂时失败时保留当前页面及本地编辑。 */ }
    finally { inFlight = false; }
  }
  setInterval(() => void refresh(), 5000);
  document.addEventListener("visibilitychange", () => void refresh());
  globalThis.addEventListener("online", () => void refresh());
  document.addEventListener("application-sync-complete", () => { version = ""; void refresh(); });
  void refresh();
})();
