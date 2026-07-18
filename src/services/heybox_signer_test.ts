/**
 * @file 本文件验证小黑盒签名算法的固定样例输出。
 */
import { buildAppHkey, buildHkey, createHeyboxSignatureParams } from "./heybox_signer.ts";

Deno.test("buildHkey matches captured Heybox topic feed request", () => {
  const hkey = buildHkey(
    "/bbs/app/topic/feeds",
    1782848432,
    "E65BCD34EDC1167882EA3E44BF10F8CE",
  );

  assertEquals(hkey, "T33YT09");
});

Deno.test("buildHkey matches captured Heybox topic menu request", () => {
  const hkey = buildHkey(
    "/bbs/app/topic/menu",
    1782848432,
    "5218527D078077C1357DC50BDC7DD9F3",
  );

  assertEquals(hkey, "SZ3T237");
});

Deno.test("buildAppHkey matches translated app signer vector", () => {
  const hkey = buildAppHkey(
    "/bbs/app/topic/feeds",
    1782848432,
    "mcfuUBmVtL9fXAFIXoQsOLBYNOFFuzCt",
  );

  assertEquals(hkey, "UTFY980");
});

Deno.test("buildAppHkey normalizes app feed paths", () => {
  const hkey = buildAppHkey(
    "/bbs/app/feeds/",
    1721618176,
    "mcfuUBmVtL9fXAFIXoQsOLBYNOFFuzCt",
  );

  assertEquals(hkey, "9SZC880");
});

Deno.test("createHeyboxSignatureParams can emit app-style nonce", () => {
  const signature = createHeyboxSignatureParams(
    "/bbs/app/topic/feeds",
    new Date(1782848432 * 1000),
    () => 0,
    "app",
  );

  assertEquals(signature.nonce, "00000000000000000000000000000000");
  assertEquals(signature.time, 1782848432);
  assertEquals(
    signature.hkey,
    buildAppHkey("/bbs/app/topic/feeds", signature.time, signature.nonce),
  );
});

/**
 * 断言两个值严格相等。
 *
 * @param actual 实际值。
 * @param expected 期望值。
 * @return 断言通过时无返回值。
 */
function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}
