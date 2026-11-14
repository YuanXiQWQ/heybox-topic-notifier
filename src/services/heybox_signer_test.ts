/**
 * @file 本文件验证小黑盒签名算法的固定样例输出。
 */
import {
  buildAppHkey,
  buildHkey,
  createHeyboxSignatureParams,
} from "./heybox_signer.ts";
import { assertEquals } from "../test_helpers.ts";

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

Deno.test("buildAppHkey matches the statically reconstructed legacy NDKTools alphabet", () => {
  const hkey = buildAppHkey(
    "/bbs/app/topic/feeds",
    1782848432,
    "mcfuUBmVtL9fXAFIXoQsOLBYNOFFuzCt",
  );

  assertEquals(hkey, "UHFYN86");
});

Deno.test("buildAppHkey normalizes app feed paths", () => {
  const hkey = buildAppHkey(
    "/bbs/app/feeds/",
    1721618176,
    "mcfuUBmVtL9fXAFIXoQsOLBYNOFFuzCt",
  );

  assertEquals(hkey, "NSZCM54");
});

/**
 * 样例由独立 Python 标准库 HMAC-SHA1 与有限域矩阵计算生成，输入均为合成数据。
 * 字符表及截断步骤来自 1.3.400/build1149 的旧 NDKTools 静态反汇编；
 * 这些样例不是原生抓包结果，不证明新版 ShaderManager 或真实详情接口可用。
 */
Deno.test("legacy app signer covers detail paths, nonce digits, case and long HMAC keys", () => {
  const vectors = [
    ["/bbs/app/link/tree", "0".repeat(32), "0D00T98"],
    ["/bbs/app/topic/feeds", "0".repeat(32), "500T526"],
    ["/bbs/app/link/tree", "a".repeat(32), "ABAC582"],
    ["/bbs/app/topic/feeds", "a".repeat(32), "ACKAA80"],
    ["/bbs/app/link/tree", "0123456789ABCDEFGHIJKLMNOPQRSTUV", "S7WGM94"],
    ["/bbs/app/topic/feeds", "0123456789ABCDEFGHIJKLMNOPQRSTUV", "4AEL934"],
    ["/bbs/app/link/tree", "abcdefghijklmnopqrstuvwxyzABCDEF", "JBDC540"],
    ["/bbs/app/link/tree", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef", "JBDC540"],
    [
      `/synthetic/${"long-path/".repeat(8)}`,
      "0123456789ABCDEFGHIJKLMNOPQRSTUV",
      "HQ37J28",
    ],
  ];
  for (const [path, nonce, expected] of vectors) {
    assertEquals(buildAppHkey(path, 1700000000, nonce), expected);
  }
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
