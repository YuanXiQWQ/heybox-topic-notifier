/** @file 仅向可信顶层页面暴露固定原生操作，不暴露 IPC、文件系统或进程对象。 */
const { contextBridge, ipcRenderer } = require("electron");
/** 原生操作只接受有限参数，主进程再次验证来源和内容。 */
const api = Object.freeze({
  /** @return {Promise<object>} 当前应用和设备状态。 */
  info: () => ipcRenderer.invoke("app:info"),
  /** @return {Promise<object>} 系统浏览器登录的配对码。 */
  signIn: () => ipcRenderer.invoke("app:sign-in"),
  /** @param {boolean} enabled 通知开关。 @return {Promise<object>} 实际启用状态。 */
  notifications: (enabled) => ipcRenderer.invoke("app:notifications", enabled),
  /** @return {Promise<object>} 发行检查状态。 */
  checkUpdate: () => ipcRenderer.invoke("app:check-update"),
  /** @return {Promise<object>} 下载状态。 */
  downloadUpdate: () => ipcRenderer.invoke("app:download-update"),
  /** @return {Promise<void>} 退出并执行已校验更新。 */
  installUpdate: () => ipcRenderer.invoke("app:install-update"),
  /** @param {string} section 已查看层级。 @return {Promise<object>} 更新提示状态。 */
  seenUpdate: (section) => ipcRenderer.invoke("app:seen-update", section),
  /** @param {Function} listener 原生状态变化回调。 */
  onState: (listener) => {
    ipcRenderer.on("app:state", (_event, state) => listener(state));
  },
});
contextBridge.exposeInMainWorld("appNative", api);
