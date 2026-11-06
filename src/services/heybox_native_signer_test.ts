/** @file 验证静态重建签名的独立合成样例；不向任何真实服务发请求。 */
import { assertEquals, assertRejects } from "@std/assert";
import {
  buildNativeAppHkey,
  createHeyboxNativeSignatureParams,
} from "./heybox_native_signer.ts";

const deviceId = "0123456789abcdef0123456789abcdef";

// 固定期望来自 Python hmac/hashlib 和正向 CRC 多项式除法，未调用本模块生成。
Deno.test("native build1149 hkey matches independent static reference vectors", async () => {
  const vectors = [
    ["/bbs/app/link/tree", 1700000000, deviceId, "-1", "760E264C"],
    ["/bbs/app/topic/feeds/", 1700000000, deviceId, "-1", "51E17233"],
    ["/bbs/app/link/tree", 1700000001, deviceId, "-1", "764D85A"],
    [
      "/bbs/app/link/tree",
      1700000000,
      "fedcba9876543210fedcba9876543210",
      "-1",
      "5EB626C0",
    ],
    ["/bbs/app/link/tree", 1700000000, deviceId, "123456", "7391DB2A"],
    ["/synthetic//path", 1700000000, "offline-device", "-1", "73FBC7A4"],
    [
      `/synthetic/${"long/".repeat(40)}`,
      1700000000,
      "offline-device",
      "-1",
      "D9E1B8C0",
    ],
    ["/bbs/app/link/tree/", 1700000014, "offline-device", "-1", "E4736C4"],
  ] as const;
  for (const [path, time, device, user, expected] of vectors) {
    assertEquals(await buildNativeAppHkey(path, time, device, user), expected);
  }
});

Deno.test("native nonce samples the date pool with replacement and uses UTC boundaries", async () => {
  for (
    const [date, expected] of [
      ["2023-11-14T23:59:59Z", "PW3ahovCJQX4bipwDKRY5cjqxELSZ6dk"],
      ["2023-11-15T08:00:00+08:00", "QX4bipwDKRY5cjqxELSZ6dkryFMT07el"],
      ["2024-02-29T23:59:59Z", "QX4bipwDKRY5cjqxELSZ6dkryFMT07el"],
      ["2024-03-01T00:00:00Z", "07elszGNU18fmtAHOV29gnuBIPW3ahov"],
    ]
  ) {
    let index = 0;
    const signature = await createHeyboxNativeSignatureParams(
      "/bbs/app/link/tree",
      deviceId,
      "-1",
      new Date(date),
      () => index++ / 32,
    );
    assertEquals(signature.nonce, expected);
    assertEquals(signature.time, Math.floor(new Date(date).getTime() / 1000));
  }
  const first = await createHeyboxNativeSignatureParams(
    "/bbs/app/link/tree",
    deviceId,
    "-1",
    new Date(1700000000000),
    () => 0,
  );
  const last = await createHeyboxNativeSignatureParams(
    "/bbs/app/link/tree",
    deviceId,
    "-1",
    new Date(1700000000000),
    () => 0.999,
  );
  assertEquals(first.nonce, "P".repeat(32));
  assertEquals(last.nonce, "k".repeat(32));
  // 普通 hkey 不直接包含 nonce；nonce 在原生层用作请求状态索引。
  assertEquals(first.hkey, "760E264C");
  assertEquals(last.hkey, first.hkey);
});

Deno.test("native signature rejects malformed inputs without returning partial parameters", async () => {
  for (
    const [path, time, device, user] of [
      ["relative/path", 1700000000, deviceId, "-1"],
      ["/path?query=1", 1700000000, deviceId, "-1"],
      ["/path", NaN, deviceId, "-1"],
      ["/path", 1.5, deviceId, "-1"],
      ["/path", -1, deviceId, "-1"],
      ["/path", 1700000000, "", "-1"],
      ["/path", 1700000000, "device\0suffix", "-1"],
      ["/path", 1700000000, deviceId, ""],
    ] as const
  ) {
    await assertRejects(() => buildNativeAppHkey(path, time, device, user));
  }
  for (const random of [NaN, -0.1, 1, Infinity]) {
    await assertRejects(() =>
      createHeyboxNativeSignatureParams(
        "/path",
        deviceId,
        "-1",
        new Date(1700000000000),
        () => random,
      )
    );
  }
});
