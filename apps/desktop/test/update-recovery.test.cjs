/** @file 验证安装失败标记的输入边界与编译期发行文件清单。 */
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {createHash} = require("node:crypto");
const {readInstallFailure, clearInstallFailure} = require("../update-recovery.cjs");
const {inventory, nsisString} = require("../installer-payload.cjs");

test("failure marker clearing preserves the recovery backup and rejects malformed markers", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "heybox-recovery-test-"));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const executable = path.join(root, "app", "notifier.exe");
  const backup = path.join(root, "app.heybox-update-backup");
  await fs.mkdir(backup);
  const marker = path.join(backup, "failure.json");
  assert.equal(await readInstallFailure(executable), undefined);
  await fs.writeFile(path.join(backup, "old-version.bin"), "preserve");
  await fs.writeFile(marker, JSON.stringify({version: "3.10.2"}));
  assert.equal(await readInstallFailure(executable), "3.10.2");
  await clearInstallFailure(executable);
  assert.equal(await readInstallFailure(executable), undefined);
  assert.equal(await fs.readFile(path.join(backup, "old-version.bin"), "utf8"), "preserve");
  for (const data of ['{', '{"version":"../3.10.2"}', '{"version":"3.10.2-beta"}', 'x'.repeat(1025)]) {
    await fs.writeFile(marker, data);
    await assert.rejects(readInstallFailure(executable));
  }
});

test("package inventory detects changed DLLs, includes nested Unicode assets and escapes script syntax", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "heybox-inventory-test-"));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, "resources", "中文"), {recursive:true});
  await fs.writeFile(path.join(root, "runtime.dll"), "original");
  await fs.writeFile(path.join(root, "resources", "中文", "资源.bin"), "asset");
  const before = await inventory(root);
  assert.equal(before.length, 2);
  assert.ok(before.some(file => file.name === "resources\\中文\\资源.bin"));
  assert.equal(before.find(file => file.name === "runtime.dll").sha256, createHash("sha256").update("original").digest("hex").toUpperCase());
  await fs.writeFile(path.join(root, "runtime.dll"), "changed");
  const after = await inventory(root);
  assert.notEqual(before.find(file => file.name === "runtime.dll").sha256, after.find(file => file.name === "runtime.dll").sha256);
  assert.equal(nsisString('$INSTDIR".txt'), '$$INSTDIR$\\".txt');
  assert.throws(() => nsisString("a\n!system command"));
});

test("manual retry tolerates an administrator-owned failure marker but reports other IO errors", async t => {
  const unlink = t.mock.method(fs, "unlink");
  for (const code of ["EACCES", "EPERM", "ENOENT"]) {
    unlink.mock.mockImplementation(() => Promise.reject(Object.assign(new Error(code), {code})));
    await clearInstallFailure(path.join(os.tmpdir(), "app", "notifier.exe"));
  }
  unlink.mock.mockImplementation(() => Promise.reject(Object.assign(new Error("IO"), {code: "EIO"})));
  await assert.rejects(clearInstallFailure(path.join(os.tmpdir(), "app", "notifier.exe")), {code: "EIO"});
});
