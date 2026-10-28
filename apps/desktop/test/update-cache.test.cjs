/** @file 验证完整更新缓存保留、强制中断残留清理与目录边界。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { repairUpdateCache } = require("../update-cache.cjs");

/** @param {Function} run 测试操作。 @return {Promise<void>} 隔离缓存验证完毕。 */
async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "heybox-update-test-"));
  const pending = path.join(root, "pending");
  await fs.mkdir(pending);
  const updater = { getOrCreateDownloadHelper: () => Promise.resolve({cacheDir:root, cacheDirForPendingUpdate:pending}) };
  try { await run({root,pending,updater}); }
  finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^heybox-update-test-/);
    await fs.rm(root, {recursive:true, force:true});
  }
}

test("verified installer survives while interrupted temporary downloads are removed", () => fixture(async ({pending,updater}) => {
  const bytes = Buffer.from("complete installer");
  await fs.writeFile(path.join(pending,"setup.exe"),bytes);
  await fs.writeFile(path.join(pending,"update-info.json"),JSON.stringify({fileName:"setup.exe",sha512:createHash("sha512").update(bytes).digest("base64")}));
  await fs.writeFile(path.join(pending,"temp-next.exe"),"partial");
  assert.equal(await repairUpdateCache(updater),true);
  assert.deepEqual((await fs.readdir(pending)).sort(),["setup.exe","update-info.json"]);
}));

test("truncated or modified installers and orphaned partial files cannot remain installable", () => fixture(async ({pending,updater}) => {
  const expected = createHash("sha512").update("complete").digest("base64");
  for (const bytes of ["part", "modified"]) {
    await fs.writeFile(path.join(pending,"setup.exe"),bytes);
    await fs.writeFile(path.join(pending,"update-info.json"),JSON.stringify({fileName:"setup.exe",sha512:expected}));
    assert.equal(await repairUpdateCache(updater),false);
    assert.deepEqual(await fs.readdir(pending),[]);
  }
  await fs.writeFile(path.join(pending,"temp-setup.exe"),"partial");
  assert.equal(await repairUpdateCache(updater),false);
  assert.deepEqual(await fs.readdir(pending),[]);
}));

test("malformed metadata never causes cleanup outside the pending cache", () => fixture(async ({root,pending,updater}) => {
  await fs.writeFile(path.join(root,"outside.exe"),"keep");
  await fs.writeFile(path.join(pending,"update-info.json"),JSON.stringify({fileName:"../outside.exe",sha512:"invalid"}));
  assert.equal(await repairUpdateCache(updater),false);
  assert.equal(await fs.readFile(path.join(root,"outside.exe"),"utf8"),"keep");
}));
