/**
 * @file 静态重建 1.3.400/build1149 的普通 ShaderManager 签名。
 * 不生成风控令牌或动态 _rnd；离线一致性不代表服务端接受请求。
 */
import type { HeyboxSignatureParams } from "./heybox_signer.ts";

const encoder = new TextEncoder();
// libglesv3_1.so 的公开协议常量：getObjType 取解码字符串的前 32 个 ASCII 字节。
// 这里不能再按 A–P 半字节编码解码；setBlendMode 使用的是另一条初始化路径。
const signingKey = "LFEJGJJOKCEHODNMNFIKKONFBKIHJFKB";
const nonceAlphabet =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * 生成 build1149 的普通原生请求签名及日期相关 nonce。
 * @param path 请求的绝对路径，不包含查询串。
 * @param deviceId 与请求 imei 相同的固定设备 ID。
 * @param heyboxId 用户 ID；匿名请求使用 -1。
 * @param now 请求时间。
 * @param random 可注入的随机数来源，取值范围为 [0, 1)。
 * @return 普通签名参数，不包含 x_xhh_tokenid 或 _rnd。
 */
export async function createHeyboxNativeSignatureParams(
  path: string,
  deviceId: string,
  heyboxId = "-1",
  now = new Date(),
  random: () => number = secureRandom,
): Promise<HeyboxSignatureParams> {
  const time = Math.floor(now.getTime() / 1000);
  const hkey = await buildNativeAppHkey(path, time, deviceId, heyboxId);
  const date = now.getUTCFullYear() * 10000 +
    (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  const pool = Array.from(
    { length: 32 },
    (_, index) => nonceAlphabet[(date + 705 + index * 7) % 62],
  );
  const nonce = Array.from({ length: 32 }, () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error("Invalid native nonce random value");
    }
    return pool[Math.floor(value * pool.length)];
  }).join("");
  return { hkey, nonce, time };
}

/**
 * 计算普通原生 hkey：路径、时间、设备 ID 和用户 ID 的 HMAC-SHA512 加自定义 CRC。
 * @param path 请求的绝对路径，不折叠中间斜杠。
 * @param time 非负整数秒级时间戳。
 * @param deviceId 与原生 DebugInfo 中一致的设备 ID。
 * @param heyboxId 用户 ID，默认为匿名标识 -1。
 * @return 无前导零填充的大写十六进制校验值。
 */
export async function buildNativeAppHkey(
  path: string,
  time: number,
  deviceId: string,
  heyboxId = "-1",
): Promise<string> {
  if (
    !path.startsWith("/") || /[?#\0]/.test(path) ||
    !Number.isSafeInteger(time) || time < 0 ||
    !deviceId || deviceId.includes("\0") ||
    !/^(?:-1|\d+)$/.test(heyboxId)
  ) {
    throw new Error("Invalid native signature input");
  }
  const normalizedPath = path.endsWith("/") ? path : `${path}/`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${normalizedPath}${time}${deviceId}${heyboxId}`),
    ),
  );
  // 0x05ad2511 的位反转；init=xorout=0xffffffff，refin=refout=true。
  let crc = 0xffffffff;
  for (const byte of digest) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0x88a4b5a0 : 0);
    }
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).toUpperCase();
}

/** 提供均匀随机数，供原生 nonce 从当天的 32 字符池中有放回抽取。 */
function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
}
