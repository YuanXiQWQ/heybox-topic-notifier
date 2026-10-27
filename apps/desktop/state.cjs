/** @file 用 Windows 账号保护的加密文件保存设备设置和通知消费游标。 */
const fs = require("node:fs/promises");
const path = require("node:path");

/**
 * 创建顺序落盘的设备状态存储，失败时保留已有文件。
 * @param {string} directory 应用私有目录。
 * @param {object} encryption 系统加密适配器。
 * @return {Promise<object>} 当前状态与保存函数。
 */
async function deviceState(directory, encryption) {
  const file = path.join(directory, "device-state.bin");
  let value = {};
  try {
    value = JSON.parse(encryption.decryptString(await fs.readFile(file)));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let writing = Promise.resolve();
  /**
   * 顺序提交整个设备状态，以替换文件保证进程终止时不产生半份 JSON。
   * @return {Promise<void>} 落盘结果。
   */
  function save() {
    const snapshot = JSON.stringify(value);
    writing = writing.catch(() => {}).then(async () => {
      if (!encryption.isEncryptionAvailable()) {
        throw new Error("Device encryption unavailable");
      }
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(file + ".tmp", encryption.encryptString(snapshot));
      await fs.rename(file + ".tmp", file);
    });
    return writing;
  }
  return { value, save };
}
module.exports = { deviceState };
