/** @file 以现有设置控件维护本设备原生偏好，不写入账号的跨端设置。 */
(() => {
  const native = globalThis.appNative;
  if (!native) return;
  const rows = [...document.querySelectorAll("[data-app-device-platform]")];
  const labels = JSON.parse(document.getElementById("application-messages")?.textContent || "{}");
  const busy = new Set();
  /**
   * 根据平台和本设备实际状态更新控件。
   * @param {object} state 原生状态。
   */
  function render(state) {
    for (const row of rows) {
      row.hidden = row.dataset.appDevicePlatform !== state.platform || !state.preferences;
      if (busy.has(row)) continue;
      for (const input of row.querySelectorAll("[data-app-preference]")) {
        const value = state.preferences?.[input.dataset.appPreference];
        input.checked = input.type === "radio" ? value === input.value : value === true;
      }
    }
  }
  /**
   * 保存操作期间锁定当前行，失败时恢复设备实际值并显示现有错误小字。
   * @param {HTMLElement} row 操作所在行。
   * @param {() => Promise<object>} operation 受限原生操作。
   * @return {Promise<void>} 操作与反馈完成。
   */
  async function save(row, operation) {
    const controls = row.querySelectorAll("input, button");
    const status = row.querySelector("[data-app-preference-status]");
    busy.add(row);
    controls.forEach((control) => { control.disabled = true; });
    status.hidden = true;
    try {
      const state = await operation(); busy.delete(row); render(state);
    } catch {
      busy.delete(row);
      try { render(await native.info()); } catch { /* 保留当前页面，允许重试。 */ }
      status.textContent = labels.autoSaveError || "";
      status.dataset.state = "error";
      status.hidden = false;
    } finally {
      busy.delete(row); controls.forEach((control) => { control.disabled = false; });
    }
  }
  for (const row of rows) {
    row.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.dataset.appPreference) return;
      const value = input.type === "radio" ? input.value : input.checked;
      void save(row, () => native.preferences({[input.dataset.appPreference]: value}));
    });
    row.querySelector("[data-app-reset-window]")?.addEventListener("click", () => void save(row, () => native.resetWindow()));
  }
  document.addEventListener("application-native-state", (event) => render(event.detail));
  /** 合并页面记录刷新事件，网络异常由常驻服务继续重试。 */
  let refreshingBadge;
  /** 在本地记录提交后请求新的工作区计数，不产生新命中通知。 */
  function refreshBadge() {
    if (!native.refreshBadge || refreshingBadge) return;
    refreshingBadge = native.refreshBadge().then(localBadge).catch(() => {}).finally(() => { refreshingBadge = undefined; });
  }
  for (const event of ["application-sync-complete", "application-records-rendered"]) {
    document.addEventListener(event, refreshBadge);
  }
  /** 串行发送最新离线记录快照，后续事件不会被正在执行的原生请求丢弃。 */
  let badgeChanges = Promise.resolve();
  /** 按原编辑顺序提交待同步记录，网络不可达也立即更新本机角标。 */
  function localBadge() {
    if (!native.localBadge || !globalThis.applicationSync) return;
    badgeChanges = badgeChanges.catch(() => {}).then(async () => {
      const sync = globalThis.applicationSync;
      await sync.ready;
      const pending = await globalThis.AppLocalStore.pending(sync.userId);
      const records = new Map();
      pending.filter(operation => operation.kind === "record").sort((left,right) => {
        for (const key of ["editedAt","counter","deviceId","operationId"]) {
          if (left.stamp[key] !== right.stamp[key]) return left.stamp[key] > right.stamp[key] ? 1 : -1;
        }
        return 0;
      }).forEach(operation => {
        for (const record of operation.records || []) {
          if (record.id && record.postId) records.set(record.id,{...record,workspace:operation.target === "/matches/restore"});
        }
      });
      await native.localBadge({userId:sync.userId,records:[...records.values()]});
    });
    void badgeChanges.catch(() => {});
  }
  document.addEventListener("application-local-records", localBadge);
  document.addEventListener("application-records-rendered", localBadge);
  document.addEventListener("DOMContentLoaded", localBadge);
  globalThis.addEventListener("online", refreshBadge);
  document.addEventListener("DOMContentLoaded", refreshBadge);
  void globalThis.applicationNativeReady?.then(render).catch(() => {});
})();
