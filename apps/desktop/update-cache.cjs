/** @file 校验完整更新与可续传前缀，仅清理更新器专属目录中的无效残留。 */
const fs = require("node:fs/promises");
const { createReadStream } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const {restoreResume, discardResume} = require("./resumable-download.cjs");

/**
 * 流式验证完整安装包，避免将大文件一次载入内存。
 * @param {string} file 安装包路径。
 * @return {Promise<string>} SHA-512 Base64 摘要。
 */
async function digest(file) {
  const hash = createHash("sha512");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("base64");
}

/**
 * 在下载停止后验证续传检查点并清理无效临时包，完整缓存仍比对官方发行摘要。
 * @param {object} updater 固定版本的 electron-updater 实例。
 * @return {Promise<boolean>} 是否保留了校验通过的完整安装包。
 */
async function repairUpdateCache(updater) {
  const helper = await updater.getOrCreateDownloadHelper();
  const resume = path.join(helper.cacheDir,"resume");
  await restoreResume(resume);
  const directory = path.resolve(helper.cacheDirForPendingUpdate);
  if (directory !== path.join(path.resolve(helper.cacheDir), "pending")) throw new Error("Invalid update cache directory");
  let entries;
  try {
    if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error("Invalid update cache link");
    entries = await fs.readdir(directory, {withFileTypes:true});
  } catch (error) { if (error.code === "ENOENT") return false; throw error; }
  let keep;
  try {
    const metadata = JSON.parse(await fs.readFile(path.join(directory, "update-info.json"), "utf8"));
    const name = metadata.fileName;
    if (typeof name !== "string" || path.basename(name) !== name || !name.endsWith(".exe") || !/^[A-Za-z0-9+/]{86}==$/.test(metadata.sha512)) throw new Error("Invalid cached metadata");
    if (helper.fileInfo?.info.sha512 && helper.fileInfo.info.sha512 !== metadata.sha512) throw new Error("Cached metadata differs from release");
    const file = path.join(directory, name), stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || await digest(file) !== metadata.sha512) throw new Error("Invalid cached installer");
    keep = name;
  } catch (error) {
    if (error.code && !["ENOENT", "EISDIR"].includes(error.code)) throw error;
  }
  for (const entry of entries) {
    if (keep && [keep, "update-info.json", "current.blockmap"].includes(entry.name)) continue;
    // 只删除本目录的普通文件与链接，不递归进入任何目录或链接目标。
    if (entry.isFile() || entry.isSymbolicLink()) await fs.unlink(path.join(directory, entry.name));
  }
  if (keep) await discardResume(resume);
  return Boolean(keep);
}
module.exports = {repairUpdateCache};
