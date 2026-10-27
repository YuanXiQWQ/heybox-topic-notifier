/** @file 验证系统浏览器无法启动时，登录交接可重新发起且不泄露 PKCE verifier。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { browserLogin } = require("../login.cjs");

test("failed browser launch releases the pending login and keeps proof local", async () => {
  const requests = [];
  const opened = [];
  const id = "12345678-1234-1234-1234-123456789abc";
  const start = browserLogin({
    origin: "https://example.com",
    session: {
      fetch: (url, options) => {
        requests.push({ url, ...options });
        return Promise.resolve(
          new Response(
            JSON.stringify({ id, path: `/auth/native/approve?id=${id}` }),
          ),
        );
      },
    },
    openExternal: (url) => {
      opened.push(url);
      return Promise.reject(new Error("No browser"));
    },
    complete: () => assert.fail("No authorization was completed"),
  });
  await assert.rejects(start, /No browser/);
  await assert.rejects(start, /No browser/);
  assert.equal(requests.length, 2);
  const first = JSON.parse(requests[0].body),
    second = JSON.parse(requests[1].body);
  assert.match(first.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.challenge, second.challenge);
  assert.deepEqual(Object.keys(first), ["challenge"]);
  assert.equal(opened[0], `https://example.com/auth/native/approve?id=${id}`);
});
