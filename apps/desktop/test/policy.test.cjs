/** @file 验证远程页面不能通过原生桥的 URL 策略访问系统文件或命令。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { applicationOrigin, assetPath, externalUrl } = require("../policy.cjs");

test("application origins reject insecure servers and credential URLs", () => {
  assert.equal(
    applicationOrigin("https://example.com/app", false),
    "https://example.com",
  );
  assert.equal(
    applicationOrigin("http://127.0.0.1:9143", true),
    "http://127.0.0.1:9143",
  );
  assert.throws(() => applicationOrigin("http://example.com", true));
  assert.throws(() =>
    applicationOrigin("https://user:password@example.com", false)
  );
});
test("external links cannot launch local protocols", () => {
  for (
    const value of [
      "file:///C:/Windows",
      "javascript:alert(1)",
      "powershell:command",
      "ms-settings:privacy",
      "https://a:b@example.com",
    ]
  ) assert.equal(externalUrl(value), false);
  assert.equal(
    externalUrl("https://github.com/YuanXiQWQ/heybox-topic-notifier"),
    true,
  );
});
test("bundled assets stay within their directory and trusted origin", () => {
  const root = path.resolve("assets");
  assert.equal(
    assetPath(
      root,
      "https://example.com/static/fun/movie.mp4?v=1",
      "https://example.com",
    ),
    path.join(root, "fun/movie.mp4"),
  );
  for (
    const value of [
      "https://other.com/static/file.js",
      "https://example.com/static/%2e%2e%2fsecret",
      "https://example.com/static/..%5csecret",
      "https://example.com/static/C:%5csecret",
      "https://example.com/account/avatar",
    ]
  ) assert.equal(assetPath(root, value, "https://example.com"), undefined);
});
