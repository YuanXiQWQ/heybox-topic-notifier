/**
 * @file 本文件负责生成小黑盒接口请求所需的签名参数。
 */
/**
 * 小黑盒请求签名参数。
 */
export type HeyboxSignatureParams = {
  hkey: string;
  nonce: string;
  time: number;
};

/**
 * 小黑盒签名算法模式。
 */
export type HeyboxSignatureMode = "app" | "web";

/**
 * Web 端 hkey 编码使用的字符表。
 */
const hkeyAlphabet = "AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89";
/**
 * App 端 hkey 编码使用的基础字符表。
 */
const appHkeyAlphabet = "23456789BCDFGHJKMNPQRTVWXY";
/**
 * 随机 nonce 允许使用的字符表。
 */
const randomNonceAlphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
/**
 * 复用的 UTF-8 文本编码器。
 */
const encoder = new TextEncoder();

/**
 * 创建小黑盒请求签名参数。
 *
 * @param path 请求路径。
 * @param now 当前时间，默认使用系统当前时间。
 * @param random 随机数函数，默认使用 Math.random。
 * @param mode 签名模式，默认使用 Web 模式。
 * @return 可附加到请求参数中的签名信息。
 */
export function createHeyboxSignatureParams(
  path: string,
  now = new Date(),
  random = Math.random,
  mode: HeyboxSignatureMode = "web",
): HeyboxSignatureParams {
  const time = Math.floor(now.getTime() / 1000);
  const nonce = mode === "app"
    ? randomNonce(32, random)
    : md5Hex(`${time}${random()}`).toUpperCase();

  return {
    hkey: mode === "app" ? buildAppHkey(path, time, nonce) : buildHkey(path, time, nonce),
    nonce,
    time,
  };
}

/**
 * 构建 Web 模式的小黑盒 hkey。
 *
 * @param path 请求路径。
 * @param time 秒级时间戳。
 * @param nonce 请求随机串。
 * @return Web 模式 hkey。
 */
export function buildHkey(path: string, time: number, nonce: string): string {
  const normalizedPath = normalizeHkeyPath(path);
  const parts = [
    encodeByPrefix(String(time + 1), hkeyAlphabet, -2),
    encodeByAlphabet(normalizedPath, hkeyAlphabet),
    encodeByAlphabet(nonce, hkeyAlphabet),
  ];
  const interleaved = interleave(parts).slice(0, 20);
  const digest = md5Hex(interleaved);
  const checksumValues = mixBytes(
    digest.slice(-6).split("").map((char) => char.charCodeAt(0)),
  );
  const checksum = String(checksumValues.reduce((sum, value) => sum + value, 0) % 100)
    .padStart(2, "0");

  return `${encodeByPrefix(digest.slice(0, 5), hkeyAlphabet, -4)}${checksum}`;
}

/**
 * 构建 App 模式的小黑盒 hkey。
 *
 * @param path 请求路径。
 * @param time 秒级时间戳。
 * @param nonce 请求随机串。
 * @return App 模式 hkey。
 */
export function buildAppHkey(path: string, time: number, nonce: string): string {
  const normalizedPath = normalizeHkeyPath(path);
  const key = encoder.encode(base64Encode(encoder.encode(normalizedPath)));
  const timeWithNonceDigits = BigInt(time + countDigits(nonce));
  const timeBytes = new Uint8Array(8);
  timeBytes[4] = Number((timeWithNonceDigits >> 24n) & 0xffn);
  timeBytes[5] = Number((timeWithNonceDigits >> 16n) & 0xffn);
  timeBytes[6] = Number((timeWithNonceDigits >> 8n) & 0xffn);
  timeBytes[7] = Number(timeWithNonceDigits & 0xffn);

  const digest = hmacSha1(timeBytes, key);
  const offset = digest[19] & 0x0f;
  const value = signedInt32FromBigEndian(digest.subarray(offset, offset + 4));
  const positiveValue = value & 0x7fffffff;
  const alphabet = `${appHkeyAlphabet}${nonce.toUpperCase()}`;
  const quotient = Math.trunc(positiveValue / 0x3a);
  const hmacDerivedIndex = Number((1307386003n * BigInt((value >> 2) & 0x1fffffff) >> 40n) % 0x3an);
  const prefix = [
    alphabet[positiveValue - 0x3a * quotient],
    alphabet[quotient % 0x3a],
    alphabet[hmacDerivedIndex],
    alphabet[Math.trunc(positiveValue / 0x2fa28) % 0x3a],
    alphabet[Math.trunc(positiveValue / 0xacad10) % 0x3a],
  ].join("");
  const checksumValues = mixBytes(
    prefix.slice(1).split("").map((char) => char.charCodeAt(0)),
  );
  const checksum = String(checksumValues.reduce((sum, value) => sum + value, 0) % 100)
    .padStart(2, "0");

  return `${prefix}${checksum}`;
}

/**
 * 将请求路径归一化为 hkey 计算所需格式。
 *
 * @param path 原始请求路径。
 * @return 首尾带斜杠且去除空片段的路径。
 */
function normalizeHkeyPath(path: string): string {
  return `/${path.split("/").filter(Boolean).join("/")}/`;
}

/**
 * 生成指定长度的随机 nonce。
 *
 * @param length nonce 长度。
 * @param random 随机数函数。
 * @return 随机 nonce 字符串。
 */
function randomNonce(length: number, random: () => number): string {
  return Array.from({ length }, () => {
    const index = Math.min(
      randomNonceAlphabet.length - 1,
      Math.floor(Math.max(0, random()) * randomNonceAlphabet.length),
    );
    return randomNonceAlphabet[index];
  }).join("");
}

/**
 * 统计字符串中的数字字符数量。
 *
 * @param value 待统计字符串。
 * @return 数字字符数量。
 */
function countDigits(value: string): number {
  return Array.from(value).filter((char) => char >= "0" && char <= "9").length;
}

/**
 * 使用字符表前缀对字符串进行编码。
 *
 * @param value 待编码字符串。
 * @param alphabet 编码字符表。
 * @param end 字符表切片结束位置。
 * @return 编码后的字符串。
 */
function encodeByPrefix(value: string, alphabet: string, end: number): string {
  const prefix = alphabet.slice(0, end);
  return Array.from(value, (char) => prefix[char.charCodeAt(0) % prefix.length]).join("");
}

/**
 * 使用指定字符表对字符串进行编码。
 *
 * @param value 待编码字符串。
 * @param alphabet 编码字符表。
 * @return 编码后的字符串。
 */
function encodeByAlphabet(value: string, alphabet: string): string {
  return Array.from(value, (char) => alphabet[char.charCodeAt(0) % alphabet.length]).join("");
}

/**
 * 交错拼接多个字符串片段。
 *
 * @param parts 待交错拼接的字符串片段。
 * @return 交错拼接后的字符串。
 */
function interleave(parts: string[]): string {
  const maxLength = Math.max(...parts.map((part) => part.length));
  let value = "";

  for (let index = 0; index < maxLength; index += 1) {
    for (const part of parts) {
      if (index < part.length) {
        value += part[index];
      }
    }
  }

  return value;
}

/**
 * 对字节值执行签名算法需要的混合变换。
 *
 * @param values 待混合的字节值数组。
 * @return 混合后的字节值数组。
 */
function mixBytes(values: number[]): number[] {
  const mixed = [0, 0, 0, 0];
  mixed[0] = mixG(values[0]) ^ mixY(values[1]) ^ mixD(values[2]) ^ mixQ(values[3]);
  mixed[1] = mixQ(values[0]) ^ mixG(values[1]) ^ mixY(values[2]) ^ mixD(values[3]);
  mixed[2] = mixD(values[0]) ^ mixQ(values[1]) ^ mixG(values[2]) ^ mixY(values[3]);
  mixed[3] = mixY(values[0]) ^ mixD(values[1]) ^ mixQ(values[2]) ^ mixG(values[3]);
  values[0] = mixed[0];
  values[1] = mixed[1];
  values[2] = mixed[2];
  values[3] = mixed[3];
  return values;
}

/**
 * 执行有限域乘以 x 的字节混合。
 *
 * @param value 待混合字节值。
 * @return 混合后的字节值。
 */
function mixV(value: number): number {
  // 小黑盒签名算法需要按字节做有限域乘法，这里的按位运算是有意为之。
  // noinspection JSBitwiseOperatorUsage
  return (128 & value) ? (255 & ((value << 1) ^ 27)) : value << 1;
}

/**
 * 执行 Q 轮字节混合。
 *
 * @param value 待混合字节值。
 * @return 混合后的字节值。
 */
function mixQ(value: number): number {
  return mixV(value) ^ value;
}

/**
 * 执行 D 轮字节混合。
 *
 * @param value 待混合字节值。
 * @return 混合后的字节值。
 */
function mixD(value: number): number {
  return mixQ(mixV(value));
}

/**
 * 执行 Y 轮字节混合。
 *
 * @param value 待混合字节值。
 * @return 混合后的字节值。
 */
function mixY(value: number): number {
  return mixD(mixQ(mixV(value)));
}

/**
 * 执行 G 轮字节混合。
 *
 * @param value 待混合字节值。
 * @return 混合后的字节值。
 */
function mixG(value: number): number {
  return mixY(value) ^ mixD(value) ^ mixQ(value);
}

/**
 * 计算 HMAC-SHA1 摘要。
 *
 * @param data 待签名数据。
 * @param key HMAC 密钥。
 * @return SHA1 摘要字节。
 */
function hmacSha1(data: Uint8Array, key: Uint8Array): Uint8Array {
  const blockSize = 64;
  const normalizedKey = key.length > blockSize ? sha1(key) : key;
  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(normalizedKey);
  const innerKey = new Uint8Array(blockSize);
  const outerKey = new Uint8Array(blockSize);

  for (let index = 0; index < blockSize; index += 1) {
    innerKey[index] = paddedKey[index] ^ 0x36;
    outerKey[index] = paddedKey[index] ^ 0x5c;
  }

  return sha1(concatBytes(outerKey, sha1(concatBytes(innerKey, data))));
}

/**
 * 计算 SHA1 摘要。
 *
 * @param bytes 待摘要字节。
 * @return SHA1 摘要字节。
 */
function sha1(bytes: Uint8Array): Uint8Array {
  const paddedLength = sha1PaddedLength(bytes.length);
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLength = BigInt(bytes.length) * 8n;
  view.setUint32(paddedLength - 8, Number((bitLength >> 32n) & 0xffffffffn));
  view.setUint32(paddedLength - 4, Number(bitLength & 0xffffffffn));

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Array<number>(80).fill(0);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(
        words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16],
        1,
      );
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      let f: number;
      let k: number;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = unsignedAdd(rotateLeft(a, 5), f, e, k, words[index]);
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temp;
    }

    h0 = unsignedAdd(h0, a);
    h1 = unsignedAdd(h1, b);
    h2 = unsignedAdd(h2, c);
    h3 = unsignedAdd(h3, d);
    h4 = unsignedAdd(h4, e);
  }

  const digest = new Uint8Array(20);
  const digestView = new DataView(digest.buffer);
  [h0, h1, h2, h3, h4].forEach((value, index) => digestView.setUint32(index * 4, value));
  return digest;
}

/**
 * 计算 SHA1 填充后的消息长度。
 *
 * @param inputLength 原始输入长度。
 * @return 填充后的总字节长度。
 */
function sha1PaddedLength(inputLength: number): number {
  let length = inputLength + 1;
  while (length % 64 !== 56) {
    length += 1;
  }
  return length + 8;
}

/**
 * 拼接多个字节数组。
 *
 * @param chunks 待拼接的字节数组列表。
 * @return 拼接后的字节数组。
 */
function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * 将字节数组编码为 Base64 字符串。
 *
 * @param bytes 待编码字节。
 * @return Base64 编码结果。
 */
function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/**
 * 按大端序读取有符号 32 位整数。
 *
 * @param bytes 包含 32 位整数的字节数组。
 * @return 读取出的有符号整数。
 */
function signedInt32FromBigEndian(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(0);
}

/**
 * 计算字符串的 MD5 十六进制摘要。
 *
 * @param value 待摘要字符串。
 * @return MD5 十六进制摘要。
 */
function md5Hex(value: string): string {
  const bytes = encoder.encode(value);
  const paddedLength = md5PaddedLength(bytes.length);
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = Array.from(
      { length: 16 },
      (_, index) => view.getUint32(offset + index * 4, true),
    );
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let wordIndex: number;

      if (index < 16) {
        f = (b & c) | (~b & d);
        wordIndex = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        wordIndex = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        wordIndex = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        wordIndex = (7 * index) % 16;
      }

      const next = d;
      d = c;
      c = b;
      b = unsignedAdd(
        b,
        rotateLeft(unsignedAdd(a, f, md5K[index], words[wordIndex]), md5S[index]),
      );
      a = next;
    }

    a0 = unsignedAdd(a0, a);
    b0 = unsignedAdd(b0, b);
    c0 = unsignedAdd(c0, c);
    d0 = unsignedAdd(d0, d);
  }

  return [a0, b0, c0, d0].map(littleEndianHex).join("");
}

/**
 * 计算 MD5 填充后的消息长度。
 *
 * @param inputLength 原始输入长度。
 * @return 填充后的总字节长度。
 */
function md5PaddedLength(inputLength: number): number {
  let length = inputLength + 1;
  while (length % 64 !== 56) {
    length += 1;
  }
  return length + 8;
}

/**
 * 执行无符号 32 位加法。
 *
 * @param values 需要相加的数值列表。
 * @return 无符号 32 位加法结果。
 */
function unsignedAdd(...values: number[]): number {
  return values.reduce((sum, value) => (sum + value) >>> 0, 0);
}

/**
 * 对 32 位数值执行循环左移。
 *
 * @param value 待移位数值。
 * @param shift 左移位数。
 * @return 循环左移后的数值。
 */
function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/**
 * 将 32 位数值输出为小端十六进制字符串。
 *
 * @param value 待转换数值。
 * @return 小端顺序的十六进制字符串。
 */
function littleEndianHex(value: number): string {
  return [0, 8, 16, 24]
    .map((shift) => ((value >>> shift) & 0xff).toString(16).padStart(2, "0"))
    .join("");
}

/**
 * MD5 每轮循环左移位数表。
 */
const md5S = [
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
];

/**
 * MD5 每轮使用的正弦常量表。
 */
const md5K = Array.from(
  { length: 64 },
  (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0,
);
