/** @file 验证版本 14 的离线合成向量；不代表原生样本一致性或真实稳定性。 */
import { assertEquals, assertThrows } from "@std/assert";
import { buildNativeRndV14 } from "./heybox_native_rnd.ts";
// 期望值来自独立 Python 数学参考：十六轮分组、环形状态索引、正向 CRC 多项式。
const vectors = [
  [
    "/bbs/app/link/tree",
    1700000000,
    "0123456789abcdef0123456789abcdef",
    "-1",
    "14",
    "14:46B73B37",
  ],
  [
    "/bbs/app/topic/feeds/",
    1700000000,
    "0123456789abcdef0123456789abcdef",
    "-1",
    "14",
    "14:88777394",
  ],
  [
    "/bbs/app/link/tree",
    1700000001,
    "0123456789abcdef0123456789abcdef",
    "-1",
    "14",
    "14:D41B6DB3",
  ],
  [
    "/bbs/app/link/tree",
    1700000000,
    "offline-device",
    "123456",
    "12",
    "14:D1A911D0",
  ],
  [
    "/synthetic//path",
    1700000000,
    "offline-7",
    "-1",
    "14",
    "14:9793886",
  ],
  [
    "/synthetic/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/long/",
    1700000000,
    "offline-device",
    "-1",
    "14",
    "14:461B78E9",
  ],
  [
    "/synthetic/",
    1700000000,
    "7777777777777777777777777777777777777777777777777777777777777777777777777777777777777777777777777777",
    "-1",
    "14",
    "14:C70B6F1F",
  ],
  [
    "/synthetic/",
    1700000000,
    "77777777777777777777777777777777777777777777777777777777777777777777777777777777777777777777777777777",
    "-1",
    "14",
    "14:706C27FA",
  ],
  [
    "/synthetic/",
    1700000000,
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "-1",
    "14",
    "14:57A6B0EF",
  ],
  [
    "/synthetic/",
    1700000000,
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "-1",
    "14",
    "14:7F623E4F",
  ],
  [
    "/synthetic/",
    1700000000,
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "-1",
    "14",
    "14:EF90B222",
  ],
  [
    "/synthetic/",
    1700000000,
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "-1",
    "14",
    "14:B014A9BF",
  ],
  [
    "/synthetic/",
    1700000000,
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "-1",
    "14",
    "14:5B045F99",
  ],
] as const;
Deno.test("native rnd14 matches independent synthetic reference across block and truncation boundaries", () => {
  for (const [path, time, device, user, os, expected] of vectors) {
    assertEquals(buildNativeRndV14(path, time, device, user, os), expected);
  }
});
Deno.test("native rnd14 preserves path structure and omits leading zero in CRC", () => {
  assertEquals(
    buildNativeRndV14("/synthetic//path", 1700000000, "offline-7"),
    "14:9793886",
  );
  assertEquals(
    buildNativeRndV14(
      "/bbs/app/link/tree/",
      1700000000,
      "0123456789abcdef0123456789abcdef",
    ),
    "14:46B73B37",
  );
});
Deno.test("native rnd14 rejects unsupported versions and ambiguous protocol fields", () => {
  for (
    const [path, time, device, user, os, version] of [
      ["relative", 1700000000, "device", "-1", "14", "1.3.400"],
      ["/path?query=1", 1700000000, "device", "-1", "14", "1.3.400"],
      ["/path", NaN, "device", "-1", "14", "1.3.400"],
      ["/path", -1, "device", "-1", "14", "1.3.400"],
      ["/path", 1.5, "device", "-1", "14", "1.3.400"],
      ["/path", 1700000000, "", "-1", "14", "1.3.400"],
      ["/path", 1700000000, "device", "", "14", "1.3.400"],
      ["/path", 1700000000, "device", "-1", "", "1.3.400"],
      ["/path", 1700000000, "device", "-1", "14", "1.3.401"],
      ["/路径", 1700000000, "device", "-1", "14", "1.3.400"],
      ["/path", 1700000000, "device\0tail", "-1", "14", "1.3.400"],
    ] as const
  ) {
    assertThrows(() =>
      buildNativeRndV14(path, time, device, user, os, version)
    );
  }
});
