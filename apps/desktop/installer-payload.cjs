/** @file 在编译安装器时从实际发行归档生成逐文件校验指令，避免只检查主程序。 */
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { createReadStream } = require("node:fs");

/**
 * 转义 NSIS 字符串，禁止把归档文件名解释成安装脚本。
 * @param {string} value 原始文件名。
 * @return {string} 双引号内的 NSIS 字符串。
 */
function nsisString(value) {
  if (/[\r\n\0]/.test(value)) throw new Error("Invalid package filename");
  return value.replaceAll("$", () => "$$").replaceAll('"', '$\\"');
}

/**
 * 遍历真实归档内容并计算摘要，不接受链接或目录外路径。
 * @param {string} root 解包根目录。
 * @param {string} relative 相对目录。
 * @return {Promise<Array<{name:string,sha256:string}>>} 安装文件清单。
 */
async function inventory(root, relative = "") {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Package links are unsupported");
    if (entry.isDirectory()) result.push(...await inventory(root, name));
    else if (entry.isFile()) {
      const hash = createHash("sha256");
      for await (const bytes of createReadStream(path.join(root, name))) hash.update(bytes);
      result.push({ name: name.replaceAll("/", "\\"), sha256: hash.digest("hex").toUpperCase() });
    } else throw new Error("Unsupported package entry");
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 从构建器实际使用的归档生成安装期完整性校验宏。
 * @param {string} archive x64 发行归档。
 * @param {string} output 编译器分配的临时 include 文件。
 * @param {string} uninstaller 已完成签名阶段的卸载器。
 * @param {string} uninstallName 安装目录内的卸载器名称。
 * @return {Promise<void>} 完整清单已写入，临时解包内容已清理。
 */
async function generate(archive, output, uninstaller, uninstallName) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "heybox-package-manifest-"));
  try {
    const sevenZip = require.resolve("electron-winstaller/vendor/7z-x64.exe");
    execFileSync(sevenZip, ["x", path.resolve(archive), "-o" + folder, "-y"], { stdio: "pipe", windowsHide: true });
    const files = await inventory(folder);
    if (!files.some(file => file.name === "resources\\app.asar") || !files.some(file => file.name.endsWith(".exe"))) {
      throw new Error("Incomplete application archive");
    }
    if (path.basename(uninstallName) !== uninstallName) throw new Error("Invalid uninstaller name");
    const uninstallHash = createHash("sha256");
    for await (const bytes of createReadStream(uninstaller)) uninstallHash.update(bytes);
    files.push({name: uninstallName, sha256: uninstallHash.digest("hex").toUpperCase()});
    await fs.writeFile(output, [
      "; @file 从当前发行归档生成的安装文件摘要，不能手动编辑。",
      "!macro AppVerifyPayload",
      ...files.map(file => `  !insertmacro AppRequireInstalledFile "${nsisString(file.name)}" "${file.sha256}"`),
      "!macroend", "",
    ].join("\n"), "utf8");
  } finally {
    // mkdtemp 返回本函数新建的绝对目录，清理不接受外部提供的路径。
    await fs.rm(folder, { recursive: true, force: true });
  }
}
module.exports = { inventory, nsisString, generate };
if (require.main === module) generate(...process.argv.slice(2)).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
