/** @file 用 Windows 账号保护的加密文件保存设备设置和通知消费游标。 */
const fs = require('node:fs/promises');
const path = require('node:path');

/**
 * 本设备的窗口、更新与通知偏好，缺省字段由使用方按设备默认值处理。
 * @typedef {object} DesktopDevicePreferences
 * @property {'minimize'|'quit'} [closeAction] 关闭窗口时的行为。
 * @property {boolean} [autoUpdate] 是否自动下载并安装更新。
 * @property {string} [autoUpdateReady] 已校验并可在退出时安装的版本。
 * @property {string} [failedUpdateVersion] 暂停自动重试的失败版本。
 * @property {string} [updateVersion] 最近发现的新版本。
 * @property {string} [updateSeen_settings] 已查看设置导航提示的版本。
 * @property {string} [updateSeen_about] 已查看关于入口提示的版本。
 * @property {string} [updateSeen_dismissed] 已关闭更新确认的版本。
 * @property {{enabled: boolean, userId?: string, session?: string, cursor?: string, seen?: string[]}} [notifications] 本机通知绑定及去重游标。
 */

/**
 * 创建顺序落盘的设备状态存储，失败时保留已有文件。
 * @param {string} directory 应用私有目录。
 * @param {Pick<import('electron').SafeStorage, 'decryptString'|'encryptString'|'isEncryptionAvailable'>} encryption 系统加密适配器。
 * @return {Promise<{value: DesktopDevicePreferences, save: () => Promise<void>}>} 当前状态与保存函数。
 */
async function deviceState(directory, encryption) {
  const file = path.join(directory, 'device-state.bin');
  /** @type {DesktopDevicePreferences} */
  let value = {};
  try {
    value = JSON.parse(encryption.decryptString(await fs.readFile(file)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let writing = Promise.resolve();

  /**
   * 顺序提交整个设备状态，以替换文件保证进程终止时不产生半份 JSON。
   * @return {Promise<void>} 落盘结果。
   */
  function save() {
    const snapshot = JSON.stringify(value);
    writing = writing.catch(() => {
    }).then(async () => {
      if (!encryption.isEncryptionAvailable()) {
        throw new Error('Device encryption unavailable');
      }
      await fs.mkdir(directory, {recursive: true});
      await fs.writeFile(file + '.tmp', encryption.encryptString(snapshot));
      await fs.rename(file + '.tmp', file);
    });
    return writing;
  }

  return {value, save};
}

module.exports = {deviceState};
