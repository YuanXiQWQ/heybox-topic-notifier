/** @file 集中验证原生应用的来源、外部链接和本地资源路径。 */
const path = require("node:path");

/**
 * 检查可信来源，只允许 HTTPS 或开发时的回环地址。
 * @param {string} value 配置地址。
 * @param {boolean} development 是否开发环境。
 * @return {string} 规范化来源。
 */
function applicationOrigin(value, development) {
  const url = new URL(value);
  if (
    url.username || url.password ||
    (url.protocol !== "https:" &&
      !(development && url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)))
  ) throw new Error("Invalid application origin");
  return url.origin;
}
/**
 * 只允许打开普通网页链接，拒绝系统命令和本地文件协议。
 * @param {string} value 链接。
 * @return {boolean} 是否可交给系统浏览器。
 */
function externalUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username &&
      !url.password;
  } catch {
    return false;
  }
}
/**
 * 将本站静态 URL 转换成安装资源路径，拒绝编码穿越和目录访问。
 * @param {string} root 静态资源根。
 * @param {string} value 请求 URL。
 * @param {string} origin 固定业务来源。
 * @return {string | undefined} 受限的绝对资源路径。
 */
function assetPath(root, value, origin) {
  const url = new URL(value);
  if (url.origin !== origin || !url.pathname.startsWith("/static/")) return;
  let relative;
  try {
    relative = decodeURIComponent(url.pathname.slice(8));
  } catch {
    return;
  }
  if (!relative || relative.includes("\\") || relative.includes(":")) return;
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) return;
  return resolved;
}
module.exports = { applicationOrigin, externalUrl, assetPath };
