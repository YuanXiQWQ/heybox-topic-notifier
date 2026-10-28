/** @file 使用已安装的构建工具运行隔离 NSIS 恢复测试，不触碰正式应用目录。 */
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const {randomUUID} = require("node:crypto");
const {execFileSync} = require("node:child_process");
const {nsisString} = require("../installer-payload.cjs");

/**
 * 在构建器缓存内查找已下载的固定工具集，不下载或修改系统安装。
 * @param {string} prefix 工具缓存目录名前缀。
 * @param {string} suffix 工具集内的相对路径。
 * @return {Promise<string>} 已存在的绝对路径。
 */
async function cachedTool(prefix, suffix) {
  const cache = path.join(process.env.LOCALAPPDATA, "electron-builder", "Cache");
  for (const family of await fs.readdir(cache)) {
    if (!family.startsWith(prefix)) continue;
    const familyPath = path.join(cache, family);
    if (!(await fs.stat(familyPath)).isDirectory()) continue;
    for (const child of ["", ...await fs.readdir(familyPath)]) {
      const candidate = path.join(familyPath, child, suffix);
      if (await fs.stat(candidate).catch(() => undefined)) return candidate;
    }
  }
  throw new Error("Build the Windows installer first; missing tool: " + prefix);
}

/** @return {Promise<void>} 四种隔离恢复场景均执行成功，否则保留现场并返回失败。 */
async function run() {
  if (process.platform !== "win32") throw new Error("NSIS integration tests require Windows");
  const compiler = await cachedTool("nsis-3.0.4.1", "Bin/makensis.exe");
  const plugins = await cachedTool("nsis-resources-3.4.1", "plugins/x86-unicode");
  for (const scenario of ["missing-files", "corrupt-backup", "locked-target", "interrupted-restore"]) {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), "heybox-installer-test-"));
    const wrapper = path.join(folder, "test.nsi");
    const values = {TEST_ROOT:folder, TEST_ID:randomUUID(), TEST_CASE:scenario, DESKTOP_ROOT:path.resolve(__dirname,".."), PLUGIN_ROOT:plugins};
    await fs.writeFile(wrapper, Object.entries(values).map(([key,value]) => `!define ${key} "${nsisString(value)}"`).join("\n") +
      `\n!include /CHARSET=UTF8 "${nsisString(path.join(__dirname,"installer-rollback.nsi"))}"\n`, "utf8");
    try {
      execFileSync(compiler, ["/INPUTCHARSET", "UTF8", "/V2", wrapper], {stdio:"pipe", windowsHide:true, timeout:60000});
      execFileSync(path.join(folder,"installer-rollback-test.exe"), [], {stdio:"pipe", windowsHide:true, timeout:60000});
      if (await fs.readFile(path.join(folder,"passed.txt"),"utf8") !== scenario) throw new Error("Missing test completion marker");
      console.log("PASS", scenario);
      // 仅清理本次 mkdtemp 创建并完成测试的绝对目录，失败现场保留供检查。
      await fs.rm(folder, {recursive:true, force:true});
    } catch (error) {
      console.error("Installer test failed; diagnostic directory:", folder);
      if (error.stdout) console.error(String(error.stdout).slice(-4000));
      if (error.stderr) console.error(String(error.stderr).slice(-4000));
      throw error;
    }
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
