/** @file 读取安装器的失败标记，防止回滚后再次自动安装同一失败版本。 */
const fs = require("node:fs/promises");
const path = require("node:path");

/**
 * 返回与安装器约定的专用检查点文件，不接受外部提供的恢复路径。
 * @param {string} executable 当前应用程序绝对路径。
 * @return {string} 安装目录旁的失败标记路径。
 */
function failurePath(executable) {
  return path.join(path.dirname(executable) + ".heybox-update-backup", "failure.json");
}

/**
 * 读取有界标记，只接受正式版本号；读取失败时交给调用者保守停止自动安装。
 * @param {string} executable 当前应用程序绝对路径。
 * @return {Promise<string|undefined>} 失败的正式版本，或没有标记。
 */
async function readInstallFailure(executable) {
  try {
    const file = failurePath(executable);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024) throw new Error("Invalid update failure marker");
    const value = JSON.parse(await fs.readFile(file, "utf8"));
    if (!value || typeof value.version !== "string" || !/^\d+\.\d+\.\d+$/.test(value.version)) {
      throw new Error("Invalid failed update version");
    }
    return value.version;
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * 用户明确重试后尝试清除失败提示，旧版恢复备份仍由安装器核验和管理。
 * 全用户安装的标记可能需要管理员权限，此时保留到安装器处理，允许本次手动下载。
 * @param {string} executable 当前应用程序绝对路径。
 * @return {Promise<void>} 标记已清除、不存在，或留待提权后的安装器清理。
 */
async function clearInstallFailure(executable) {
  await fs.unlink(failurePath(executable)).catch(error => {
    if (!["ENOENT", "EACCES", "EPERM"].includes(error.code)) throw error;
  });
}
module.exports = { readInstallFailure, clearInstallFailure };
