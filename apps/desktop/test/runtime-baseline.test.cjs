/** @file 验证发行运行时检查的安全版本边界，避免只更新声明却继续分发旧版。 */
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {hasSecurityFix} = require("../../scripts/verify-desktop-runtime.cjs");

test("runtime security baseline rejects affected, unsupported and prerelease Node versions", () => {
  for (const version of ["22.23.3", "24.22.0", "26.12.0", "25.2.1", "24.22.1-rc.1", "27.0.0", "invalid"]) {
    assert.equal(hasSecurityFix(version), false, version);
  }
  for (const version of ["22.23.4", "24.22.1", "24.22.2", "26.12.1", "26.13.0"]) {
    assert.equal(hasSecurityFix(version), true, version);
  }
});
