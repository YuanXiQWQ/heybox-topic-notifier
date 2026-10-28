/** @file 为固定 GitHub 安装源提供可校验的下载检查点、HTTP Range 续传和安全回退。 */
const fs = require("node:fs/promises");
const { createReadStream } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { CancellationError } = require("builder-util-runtime");
/** 安装包上限与每次持久化检查点的间隔，避免无界写盘。 */
const LIMIT = 1024 * 1024 * 1024, INTERVAL = 4 * 1024 * 1024;
/** 仅允许官方 Release 的下载及重定向主机。 */
const HOSTS = new Set(["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"]);

/** @param {string|URL} value 下载地址。 @return {URL} 已验证的公开 HTTPS 地址。 */
function trusted(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || !HOSTS.has(url.hostname)) throw new Error("Invalid update download source");
  return url;
}
/** @param {string} root 专属续传目录。 @return {Promise<void>} 仅清除本下载器的文件。 */
async function discardResume(root) {
  for (const name of ["installer.part", "checkpoint.json", "checkpoint.tmp"]) {
    await fs.unlink(path.join(root, name)).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}
/** @param {string} file 下载文件。 @param {number} length 校验前缀长度。 @return {Promise<object>} 可继续累积的摘要。 */
async function prefixHash(file, length) {
  const hash = createHash("sha512");
  if (length) for await (const chunk of createReadStream(file, {start:0, end:length-1})) hash.update(chunk);
  return hash;
}
/**
 * 校验持久化前缀并截去未提交尾部；强制中断不会把任意残留当作续传依据。
 * @param {string} root 专属续传目录。
 * @return {Promise<object|null>} 可用检查点与摘要状态。
 */
async function restoreResume(root) {
  await fs.mkdir(root, {recursive:true});
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error("Invalid resume directory");
  try {
    const saved = JSON.parse(await fs.readFile(path.join(root,"checkpoint.json"),"utf8"));
    trusted(saved.url);
    if (!/^[A-Za-z0-9+/]{86}==$/.test(saved.sha512) || !Number.isSafeInteger(saved.total) || saved.total <= 0 || saved.total > LIMIT ||
      !Number.isSafeInteger(saved.offset) || saved.offset < 0 || saved.offset > saved.total) throw new Error("Invalid checkpoint");
    const file = path.join(root,"installer.part"), stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < saved.offset) throw new Error("Invalid partial file");
    const hash = await prefixHash(file, saved.offset);
    if (hash.copy().digest("base64") !== saved.prefix) throw new Error("Invalid partial digest");
    await fs.truncate(file, saved.offset);
    return {...saved, hash};
  } catch (error) {
    if (error.code && !["ENOENT", "EISDIR"].includes(error.code)) throw error;
    await discardResume(root);
    return null;
  }
}
/**
 * 将已落盘的前缀摘要原子替换为恢复点，元数据不会领先于安装包数据。
 * @param {string} root 专属目录。
 * @param {object} saved 检查点及摘要对象。
 * @param {object} file 已打开的安装包文件。
 * @return {Promise<void>} 数据和检查点均持久化。
 */
async function checkpoint(root, saved, file) {
  await file.sync();
  const {hash, ...metadata} = saved;
  metadata.prefix = hash.copy().digest("base64");
  const temporary = path.join(root,"checkpoint.tmp"), output = await fs.open(temporary,"w");
  try { await output.writeFile(JSON.stringify(metadata)); await output.sync(); } finally { await output.close(); }
  await fs.rename(temporary,path.join(root,"checkpoint.json"));
}
/**
 * 续传经过校验的前缀；服务器不支持 Range 时完整重下，绝不拼接错误范围。
 * @param {object} options 目录、官方摘要、地址、取消信号和进度回调。
 * @return {Promise<void>} 完整校验包已复制到更新器的临时安装路径。
 */
async function resumeDownload({root, url, sha512, expectedSize, destination, signal, onProgress, manual = false, fetcher = fetch}) {
  url = trusted(url).href;
  if (!/^[A-Za-z0-9+/]{86}==$/.test(sha512)) throw new Error("Invalid release digest");
  let saved = await restoreResume(root);
  if (saved && (saved.sha512 !== sha512 || saved.url !== url || (expectedSize && saved.total !== expectedSize))) { await discardResume(root); saved = null; }
  let output, invalid = false;
  const idle = new AbortController();
  const combined = signal ? AbortSignal.any([signal,idle.signal]) : idle.signal;
  let timeout;
  /** 收到数据后重置空闲超时，正常长下载不受总时长限制。 */
  function keepAlive() { clearTimeout(timeout); timeout=setTimeout(() => idle.abort(),30000); }
  try {
    keepAlive();
    signal?.throwIfAborted();
    if (!saved || saved.offset < saved.total) {
      let address = url, response;
      for (let redirects=0; redirects<6; redirects++) {
        response = await fetcher(trusted(address), {redirect:"manual", signal:combined, headers:{"accept-encoding":"identity", ...(saved?.offset ? {range:`bytes=${saved.offset}-`} : {})}});
        keepAlive();
        if (response.status < 300 || response.status >= 400) break;
        const next = response.headers.get("location");
        await response.body?.cancel();
        if (!next) throw new Error("Missing download redirect");
        address = new URL(next,address).href;
      }
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
      let total;
      if (response.status === 206 && range && Number(range[1]) === (saved?.offset || 0) && Number(range[2]) === Number(range[3])-1 && (!saved || Number(range[3]) === saved.total)) total = Number(range[3]);
      else if (response.status === 200) { total = Number(response.headers.get("content-length") || expectedSize); saved = null; }
      else { await response.body?.cancel(); invalid = response.status === 206 || response.status === 416; throw new Error("Invalid download range or response"); }
      if (!Number.isSafeInteger(total) || total <= 0 || total > LIMIT || (expectedSize && total !== expectedSize) || (response.headers.get("content-encoding") && response.headers.get("content-encoding") !== "identity")) {
        await response.body?.cancel(); invalid = true; throw new Error("Invalid update size or encoding");
      }
      output = await fs.open(path.join(root,"installer.part"),saved ? "a" : "w");
      saved ??= {url,sha512,total,offset:0,hash:createHash("sha512")};
      saved.manual = saved.manual === true || manual;
      let persisted = saved.offset;
      await checkpoint(root,saved,output);
      for await (const chunk of response.body) {
        keepAlive();
        signal?.throwIfAborted();
        if (saved.offset + chunk.length > total) { invalid = true; throw new Error("Update exceeds declared size"); }
        let written=0;
        while (written < chunk.length) {
          const result = await output.write(chunk,written,chunk.length-written);
          if (!result.bytesWritten) throw new Error("Download file write stalled");
          saved.hash.update(chunk.subarray(written,written+result.bytesWritten));
          written += result.bytesWritten; saved.offset += result.bytesWritten;
        }
        if (saved.offset-persisted >= INTERVAL) { await checkpoint(root,saved,output); persisted=saved.offset; }
        onProgress?.({total,transferred:saved.offset,percent:100*saved.offset/total,bytesPerSecond:0,delta:chunk.length});
      }
      await checkpoint(root,saved,output);
      if (saved.offset !== total) throw new Error("Download interrupted");
    }
    if (saved.hash.copy().digest("base64") !== sha512) { invalid=true; throw new Error("Update digest mismatch"); }
    signal?.throwIfAborted();
    if (output) { await output.close(); output=null; }
    await fs.copyFile(path.join(root,"installer.part"),destination);
  } catch (error) {
    if (output && !invalid) await checkpoint(root,saved,output);
    throw error;
  } finally {
    clearTimeout(timeout);
    if (output) await output.close();
    if (invalid) await discardResume(root);
  }
}
/**
 * 只替换完整安装包传输，保留更新器的发行解析、校验和 NSIS 安装流程。
 * @param {object} updater 固定版本更新器。
 * @param {Function} isManual 当前传输是否已由用户主动确认。
 * @param {Function} fetcher HTTP 请求实现。
 */
function installResumableDownload(updater, isManual = () => false, fetcher = fetch) {
  updater.disableDifferentialDownload = true;
  updater.disableWebInstaller = true;
  const executor = updater.httpExecutor, original = executor.download.bind(executor);
  executor.download = async (url,destination,options) => {
    if (!options.sha512) return original(url,destination,options);
    const controller = new AbortController(), token = options.cancellationToken;
    const cancel = () => controller.abort();
    token.onCancel(cancel);
    if (token.cancelled) cancel();
    try {
      const helper = await updater.getOrCreateDownloadHelper();
      const expectedSize = updater.updateInfoAndProvider?.info.files?.find(file => file.sha512 === options.sha512)?.size;
      await resumeDownload({root:path.join(helper.cacheDir,"resume"),url,sha512:options.sha512,expectedSize,destination,signal:controller.signal,onProgress:options.onProgress,manual:isManual(),fetcher});
    } catch (error) {
      if (token.cancelled) throw new CancellationError();
      throw error;
    } finally { token.removeListener("cancel",cancel); }
  };
}
module.exports = {resumeDownload, restoreResume, discardResume, installResumableDownload};
