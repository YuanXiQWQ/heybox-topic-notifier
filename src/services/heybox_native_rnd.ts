/**
 * @file 静态重建 build1149 在 2026-11-07 返回的动态签名版本 14。
 * 仅实现已审读的公式，不下载、解释执行或加载服务端代码。
 * 这不是匿名风控令牌；服务端接受性与稳定性必须另外实测。
 */
const mask64 = (1n << 64n) - 1n;
const roundConstants = [
  0x428a2f98d728ae22n,
  0x7137449123ef65cdn,
  0xb5c0fbcfec4d3b2fn,
  0xe9b5dba58189dbbcn,
  0x3956c25bf348b538n,
  0x59f111f1b605d019n,
  0x923f82a4af194f9bn,
  0xab1c5ed5da6d8118n,
  0xd807aa98a3030242n,
  0x12835b0145706fben,
  0x243185be4ee4b28cn,
  0x550c7dc3d5ffb4e2n,
  0x72be5d74f27b896fn,
  0x80deb1fe3b1696b1n,
  0x9bdc06a725c71235n,
  0xc19bf174cf692694n,
  0xe49b69c19ef14ad2n,
  0xefbe4786384f25e3n,
  0x0fc19dc68b8cd5b5n,
  0x240ca1cc77ac9c65n,
  0x2de92c6f592b0275n,
  0x4a7484aa6ea6e483n,
  0x5cb0a9dcbd41fbd4n,
  0x76f988da831153b5n,
  0x983e5152ee66dfabn,
  0xa831c66d2db43210n,
  0xb00327c898fb213fn,
  0xbf597fc7beef0ee4n,
  0xc6e00bf33da88fc2n,
  0xd5a79147930aa725n,
  0x06ca6351e003826fn,
  0x142929670a0e6e70n,
  0x27b70a8546d22ffcn,
  0x2e1b21385c26c926n,
  0x4d2c6dfc5ac42aedn,
  0x53380d139d95b3dfn,
  0x650a73548baf63den,
  0x766a0abb3c77b2a8n,
  0x81c2c92e47edaee6n,
  0x92722c851482353bn,
  0xa2bfe8a14cf10364n,
  0xa81a664bbc423001n,
  0xc24b8b70d0f89791n,
  0xc76c51a30654be30n,
  0xd192e819d6ef5218n,
  0xd69906245565a910n,
  0xf40e35855771202an,
  0x106aa07032bbd1b8n,
  0x19a4c116b8d2d0c8n,
  0x1e376c085141ab53n,
  0x2748774cdf8eeb99n,
  0x34b0bcb5e19b48a8n,
  0x391c0cb3c5c95a63n,
  0x4ed8aa4ae3418acbn,
  0x5b9cca4f7763e373n,
  0x682e6ff3d6b2b8a3n,
  0x748f82ee5defb2fcn,
  0x78a5636f43172f60n,
  0x84c87814a1f0ab72n,
  0x8cc702081a6439ecn,
  0x7ba0ea2d98160007n,
  0x7eabf2d0c21f964an,
  0x8dbe8d038b409545n,
  0x90bb1721582e8285n,
  0x99a2ad45936d4e61n,
  0x9f86e289fe03e73an,
  0xa84c4472faa9a82fn,
  0xb3df34fce89e0532n,
  0xb99bb8d7b173534fn,
  0xbc76cbab1aea1f9cn,
  0xc226a69a780f3cc3n,
  0xd304f19aa233957dn,
  0xde1be20a212129ddn,
  0xe39bb43755141950n,
  0xee84927cea48ddd2n,
  0xf3edd2773c523b67n,
  0xfbfdfe53a8d32f2an,
  0x0bee2c7ab77e9e25n,
  0x0e90181cf1b09e56n,
  0x25f57204c725bed8n,
];
const initialState = [
  0x6a09e667f3bcc908n,
  0xbb67ae8584caa73bn,
  0x3c6ef372fe94f82bn,
  0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n,
  0x9b05688c2b3e6c1fn,
  0x1f83d9abfb41bd6bn,
  0x5be0cd19137e2179n,
];

/** 将输入作为 64 位字循环右移，保留低 64 位。 */
function rotateRight(value: bigint, bits: bigint): bigint {
  return ((value >> bits) | (value << (64n - bits))) & mask64;
}

/** 计算版本 14 使用的 SHA-512 变体，包含自定义轮常量、旋转量与选择函数。 */
function digestV14(input: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(Math.ceil((input.length + 17) / 128) * 128);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setBigUint64(bytes.length - 8, BigInt(input.length) * 8n);
  const state = [...initialState];
  for (let offset = 0; offset < bytes.length; offset += 128) {
    const words: bigint[] = Array(80).fill(0n);
    for (let index = 0; index < 16; index++) {
      words[index] = view.getBigUint64(offset + index * 8);
    }
    for (let index = 16; index < 80; index++) {
      const x = words[index - 15];
      const y = words[index - 2];
      const s0 = rotateRight(x, 1n) ^ rotateRight(x, 8n) ^ (x >> 7n);
      const s1 = rotateRight(y, 38n) ^ rotateRight(y, 55n) ^ (y >> 6n);
      words[index] = (s1 + words[index - 7] + s0 + words[index - 16]) & mask64;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 80; index++) {
      const s1 = rotateRight(e, 14n) ^ rotateRight(e, 18n) ^
        rotateRight(e, 41n);
      const choice = (e & (f ^ g)) ^ f;
      const t1 = (h + s1 + choice + roundConstants[index] + words[index]) &
        mask64;
      const s0 = rotateRight(a, 21n) ^ rotateRight(a, 31n) ^
        rotateRight(a, 39n);
      const majority = (a & (b | c)) | (b & c);
      [a, b, c, d, e, f, g, h] = [
        (t1 + s0 + majority) & mask64,
        a,
        b,
        c,
        (d + t1) & mask64,
        e,
        f,
        g,
      ];
    }
    const working = [a, b, c, d, e, f, g, h];
    for (let index = 0; index < 8; index++) {
      state[index] = (state[index] + working[index]) & mask64;
    }
  }
  const output = new Uint8Array(64);
  const outputView = new DataView(output.buffer);
  state.forEach((word, index) => outputView.setBigUint64(index * 8, word));
  return output;
}

/** 使用版本 14 的内外填充值 0x52 和 0x6c 计算双层摘要。 */
function hmacV14(key: Uint8Array, message: Uint8Array): Uint8Array {
  const normalizedKey = key.length > 128 ? digestV14(key) : key;
  const inner = new Uint8Array(128 + message.length).fill(0x52, 0, 128);
  const outer = new Uint8Array(192).fill(0x6c, 0, 128);
  for (let index = 0; index < normalizedKey.length; index++) {
    inner[index] ^= normalizedKey[index];
    outer[index] ^= normalizedKey[index];
  }
  inner.set(message, 128);
  outer.set(digestV14(inner), 128);
  return digestV14(outer);
}

/** 按原生 eE2/eE3 的 127 字节上限及逐字节规则转换 ASCII 协议字段。 */
function transformInput(input: string, secondPass: boolean): Uint8Array {
  const bytes = Uint8Array.from(
    input.slice(0, 127),
    (char) => char.charCodeAt(0),
  );
  for (let index = 0; index < bytes.length; index++) {
    const byte = bytes[index];
    const value = (byte & 0x7f) ^ 0x37;
    bytes[index] = value === 0 || (index + 1) % 3 === 0
      ? ((byte & 7) << 4) ^ 0x37
      : value;
  }
  if (secondPass) {
    for (let index = 0; index < bytes.length; index++) {
      const byte = bytes[index];
      const value = (byte & 0x7f) ^ 0x46;
      bytes[index] = value === 0 || (index + 1) % 5 === 0
        ? ((byte & 0x1f) << 2) ^ 0x46
        : value;
    }
  }
  return bytes;
}

/**
 * 生成版本 14 的 _rnd；输入必须与同一请求的普通签名和查询参数保持一致。
 * @param path 绝对请求路径；确保结尾有斜杠但不折叠内部斜杠。
 * @param time 同一请求的秒级时间戳。
 * @param deviceId 同一请求的 imei。
 * @param heyboxId 匿名时为 -1。
 * @param osVersion 同一请求的 Android 系统版本。
 * @param appVersion 仅支持已静态核对的 1.3.400。
 * @return 带版本前缀的校验值，不含任何风控令牌。
 */
export function buildNativeRndV14(
  path: string,
  time: number,
  deviceId: string,
  heyboxId = "-1",
  osVersion = "14",
  appVersion = "1.3.400",
): string {
  if (
    !path.startsWith("/") || /[?#]/.test(path) ||
    !Number.isSafeInteger(time) || time < 0 || !deviceId || !osVersion ||
    !/^(?:-1|\d+)$/.test(heyboxId) || appVersion !== "1.3.400" ||
    [path, deviceId, osVersion].some((value) => /[^\x20-\x7e]/.test(value))
  ) {
    throw new Error("Invalid native rnd14 signature input");
  }
  const normalizedPath = path.endsWith("/") ? path : `${path}/`;
  const key = transformInput(`${normalizedPath}${time}`, false);
  const message = transformInput(
    `${deviceId}${heyboxId}${osVersion}${appVersion}`,
    true,
  );
  const hex = Array.from(
    hmacV14(key, message),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  let crc = 0xffffffff;
  for (const char of hex) {
    crc ^= char.charCodeAt(0);
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xad350290 : 0);
    }
  }
  return `14:${((crc ^ 0xffffffff) >>> 0).toString(16).toUpperCase()}`;
}
