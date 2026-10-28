/** @file 核对实际打包的 Electron 和 Node.js 版本，拒绝包含已知未修复运行时的发行。 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

/** Node.js 2026 年 10 月安全公告中各维护分支的最低修复版本。 */
const minimumNodeVersions = {22: "22.23.4", 24: "24.22.1", 26: "26.12.1"};

/**
 * 比较正式运行时版本，不把未知主版本或预发行版本当作已验证的安全版本。
 * @param {string} version 实际 Node.js 版本。
 * @return {boolean} 是否达到该维护分支的安全更新下限。
 */
function hasSecurityFix(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return false;
  const actual = version.split(".").map(Number);
  const minimum = minimumNodeVersions[actual[0]]?.split(".").map(Number);
  if (!minimum) return false;
  for (let index = 0; index < actual.length; index++) {
    if (actual[index] !== minimum[index]) return actual[index] > minimum[index];
  }
  return true;
}

/**
 * 仅以 Node 模式运行打包的主程序，读取内置版本，不启动页面或使用用户数据。
 * @param {string} executable 待验证的打包程序路径。
 * @return {{electron:string,node:string,chrome:string}} 已通过核验的实际运行时版本。
 */
function verify(executable) {
  const target = path.resolve(executable);
  if (!fs.statSync(target).isFile()) throw new Error("Packaged executable is missing");
  const versions = JSON.parse(execFileSync(target, ["-p", "JSON.stringify(process.versions)"], {
    encoding: "utf8", windowsHide: true, timeout: 30000,
    env: {...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_OPTIONS: ""},
  }).trim());
  const expected = require("../desktop/package.json").devDependencies.electron;
  if (versions.electron !== expected) throw new Error(`Expected Electron ${expected}, found ${versions.electron}`);
  if (!hasSecurityFix(versions.node)) throw new Error(`Node.js security baseline is not satisfied: ${versions.node}`);
  return {electron: versions.electron, node: versions.node, chrome: versions.chrome};
}

module.exports = {hasSecurityFix, verify};
if (require.main === module) {
  try {
    if (!process.argv[2]) throw new Error("Pass the packaged executable path");
    console.log(JSON.stringify(verify(process.argv[2])));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
