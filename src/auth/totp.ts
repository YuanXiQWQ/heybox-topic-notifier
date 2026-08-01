/**
 * @file 本文件提供 Authenticator / TOTP 密钥生成、加密、URI 生成和验证码校验能力。
 */
import {
  base64UrlEncode,
  constantTimeEquals,
} from "../security/crypto_utils.ts";

/**
 * 默认 TOTP 发行方名称。
 */
export const defaultTotpIssuer = "蔚蓝社区提醒";
/**
 * 默认 TOTP secret 字节数。
 */
export const defaultTotpSecretBytes = 20;
/**
 * 默认 TOTP 位数。
 */
export const defaultTotpDigits = 6;
/**
 * 默认 TOTP 时间步长秒数。
 */
export const defaultTotpPeriodSeconds = 30;
/**
 * 默认允许校验当前时间步前后各一个窗口。
 */
export const defaultTotpVerificationWindow = 1;

/**
 * TOTP 配置。
 */
export type TotpConfig = {
  digits: number;
  issuer: string;
  periodSeconds: number;
  secretBytes: number;
  secretEncryptionKey: string;
  verificationWindow: number;
};

/**
 * TOTP 验证码配置。
 */
export type TotpCodeConfig = Pick<
  TotpConfig,
  "digits" | "periodSeconds" | "verificationWindow"
>;

/**
 * TOTP secret 生成结果。
 */
export type TotpSecretMaterial = {
  secretBase32: string;
  secretEncrypted: string;
};

/**
 * TOTP 配置错误。
 */
export class TotpConfigError extends Error {
}

/**
 * TOTP 输入验证错误。
 */
export class TotpValidationError extends Error {
}

/**
 * Base32 字母表。
 */
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/**
 * TOTP 加密载荷版本。
 */
const encryptedTotpSecretVersion = "v1";
/**
 * AES-GCM IV 字节数。
 */
const aesGcmIvBytes = 12;
/**
 * 默认 TOTP 验证码配置。
 */
const defaultTotpCodeConfig: TotpCodeConfig = {
  digits: defaultTotpDigits,
  periodSeconds: defaultTotpPeriodSeconds,
  verificationWindow: defaultTotpVerificationWindow,
};

/**
 * 从环境变量读取 TOTP 配置。
 *
 * @param readEnv 环境变量读取函数。
 * @return TOTP 配置。
 */
export function totpConfigFromEnv(
  readEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): TotpConfig {
  return {
    digits: integerInRangeFromEnv(
      readEnv,
      "AUTH_TOTP_DIGITS",
      defaultTotpDigits,
      6,
      8,
    ),
    issuer: readEnv("AUTH_TOTP_ISSUER")?.trim() || defaultTotpIssuer,
    periodSeconds: positiveIntegerFromEnv(
      readEnv,
      "AUTH_TOTP_PERIOD_SECONDS",
      defaultTotpPeriodSeconds,
    ),
    secretBytes: positiveIntegerFromEnv(
      readEnv,
      "AUTH_TOTP_SECRET_BYTES",
      defaultTotpSecretBytes,
    ),
    secretEncryptionKey: readEnv("AUTH_TOTP_SECRET_ENCRYPTION_KEY") ??
      readEnv("AUTH_TOTP_SECRET_KEY") ?? "",
    verificationWindow: nonNegativeIntegerFromEnv(
      readEnv,
      "AUTH_TOTP_VERIFICATION_WINDOW",
      defaultTotpVerificationWindow,
    ),
  };
}

/**
 * 生成并加密 TOTP secret。
 *
 * @param config TOTP 配置。
 * @return TOTP secret 明文 Base32 和密文。
 */
export async function createTotpSecretMaterial(
  config: Pick<TotpConfig, "secretEncryptionKey"> & Partial<TotpConfig>,
): Promise<TotpSecretMaterial> {
  const secret = generateTotpSecret(config.secretBytes);
  return {
    secretBase32: base32Encode(secret),
    secretEncrypted: await encryptTotpSecret(
      secret,
      config.secretEncryptionKey,
    ),
  };
}

/**
 * 生成随机 TOTP secret。
 *
 * @param byteLength secret 字节数。
 * @return 随机 secret 字节。
 */
export function generateTotpSecret(
  byteLength = defaultTotpSecretBytes,
): Uint8Array {
  return crypto.getRandomValues(
    new Uint8Array(positiveInteger(byteLength, defaultTotpSecretBytes)),
  );
}

/**
 * 将字节编码为无填充 Base32。
 *
 * @param bytes 待编码字节。
 * @return Base32 字符串。
 */
export function base32Encode(bytes: Uint8Array): string {
  let output = "";
  let buffer = 0;
  let bits = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += base32Alphabet[(buffer << (5 - bits)) & 31];
  }

  return output;
}

/**
 * 解码无填充或带填充的 Base32 secret。
 *
 * @param value Base32 字符串。
 * @return 解码后的字节。
 */
export function base32Decode(value: string): Uint8Array {
  const normalized = value.toUpperCase().replaceAll(/[\s=]/g, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const character of normalized) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) {
      throw new TotpValidationError("Invalid Base32 secret.");
    }

    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * 加密 TOTP secret。
 *
 * @param secret TOTP secret 字节。
 * @param encryptionKey 服务端加密密钥。
 * @return 加密后的可存储字符串。
 */
export async function encryptTotpSecret(
  secret: Uint8Array,
  encryptionKey: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(aesGcmIvBytes));
  const key = await importTotpEncryptionKey(encryptionKey);
  const encrypted = await crypto.subtle.encrypt(
    { iv: arrayBufferFromBytes(iv), name: "AES-GCM" },
    key,
    arrayBufferFromBytes(secret),
  );

  return [
    encryptedTotpSecretVersion,
    base64UrlEncode(iv),
    base64UrlEncode(new Uint8Array(encrypted)),
  ].join(".");
}

/**
 * 解密 TOTP secret。
 *
 * @param encryptedSecret 已加密 secret。
 * @param encryptionKey 服务端加密密钥。
 * @return 解密后的 TOTP secret 字节。
 */
export async function decryptTotpSecret(
  encryptedSecret: string,
  encryptionKey: string,
): Promise<Uint8Array> {
  try {
    const [version, ivText, cipherText, extra] = encryptedSecret.split(".");
    if (
      version !== encryptedTotpSecretVersion ||
      !ivText ||
      !cipherText ||
      extra !== undefined
    ) {
      throw new TotpConfigError("Invalid encrypted TOTP secret.");
    }

    const key = await importTotpEncryptionKey(encryptionKey);
    const decrypted = await crypto.subtle.decrypt(
      { iv: arrayBufferFromBytes(base64UrlDecode(ivText)), name: "AES-GCM" },
      key,
      arrayBufferFromBytes(base64UrlDecode(cipherText)),
    );
    return new Uint8Array(decrypted);
  } catch (error) {
    if (error instanceof TotpConfigError) {
      throw error;
    }
    throw new TotpConfigError("Could not decrypt TOTP secret.");
  }
}

/**
 * 生成 TOTP 验证码。
 *
 * @param secret TOTP secret 字节。
 * @param config TOTP 验证码配置。
 * @param now 当前时间。
 * @return TOTP 验证码。
 */
export async function generateTotpCode(
  secret: Uint8Array,
  config: Partial<TotpCodeConfig> = {},
  now = new Date(),
): Promise<string> {
  const normalizedConfig = normalizedTotpCodeConfig(config);
  return await generateHotpCode(
    secret,
    totpCounter(now, normalizedConfig.periodSeconds),
    normalizedConfig.digits,
  );
}

/**
 * 校验 TOTP 验证码。
 *
 * @param code 用户提交的验证码。
 * @param secret TOTP secret 字节。
 * @param config TOTP 验证码配置。
 * @param now 当前时间。
 * @return 验证码匹配时返回 true。
 */
export async function verifyTotpCode(
  code: string,
  secret: Uint8Array,
  config: Partial<TotpCodeConfig> = {},
  now = new Date(),
): Promise<boolean> {
  const normalizedConfig = normalizedTotpCodeConfig(config);
  const normalizedCode = normalizeTotpCode(code, normalizedConfig.digits);
  if (!normalizedCode) {
    return false;
  }

  const currentCounter = totpCounter(now, normalizedConfig.periodSeconds);
  let verified = false;
  for (
    let offset = -normalizedConfig.verificationWindow;
    offset <= normalizedConfig.verificationWindow;
    offset += 1
  ) {
    const candidate = await generateHotpCode(
      secret,
      currentCounter + offset,
      normalizedConfig.digits,
    );
    verified = constantTimeEquals(normalizedCode, candidate) || verified;
  }
  return verified;
}

/**
 * 解密并校验 TOTP 验证码。
 *
 * @param code 用户提交的验证码。
 * @param encryptedSecret 已加密 TOTP secret。
 * @param config TOTP 配置。
 * @param now 当前时间。
 * @return 验证码匹配时返回 true。
 */
export async function verifyEncryptedTotpCode(
  code: string,
  encryptedSecret: string,
  config: TotpConfig,
  now = new Date(),
): Promise<boolean> {
  const secret = await decryptTotpSecret(
    encryptedSecret,
    config.secretEncryptionKey,
  );
  return await verifyTotpCode(code, secret, config, now);
}

/**
 * 生成 Authenticator 识别的 otpauth URI。
 *
 * @param options otpauth URI 参数。
 * @return otpauth URI。
 */
export function totpOtpAuthUri(options: {
  accountName: string;
  digits?: number;
  issuer: string;
  periodSeconds?: number;
  secretBase32: string;
}): string {
  const digits = integerInRange(options.digits, defaultTotpDigits, 6, 8);
  const period = positiveInteger(
    options.periodSeconds,
    defaultTotpPeriodSeconds,
  );
  const issuer = options.issuer.trim() || defaultTotpIssuer;
  const accountName = options.accountName.trim();
  if (!accountName) {
    throw new TotpValidationError("TOTP account name is required.");
  }

  const secret = options.secretBase32.trim().replaceAll(/\s/g, "")
    .toUpperCase();
  base32Decode(secret);
  const params = new URLSearchParams({
    algorithm: "SHA1",
    digits: String(digits),
    issuer,
    period: String(period),
    secret,
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${
    encodeURIComponent(accountName)
  }?${params.toString()}`;
}

/**
 * 生成 HOTP 验证码。
 *
 * @param secret HOTP secret。
 * @param counter 计数器。
 * @param digits 验证码位数。
 * @return HOTP 验证码。
 */
async function generateHotpCode(
  secret: Uint8Array,
  counter: number,
  digits: number,
): Promise<string> {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    return "".padStart(digits, "0");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    arrayBufferFromBytes(secret),
    { hash: "SHA-1", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      arrayBufferFromBytes(counterBytes(counter)),
    ),
  );
  const offset = signature[signature.length - 1] & 0x0f;
  const binary = ((signature[offset] & 0x7f) << 24) |
    (signature[offset + 1] << 16) |
    (signature[offset + 2] << 8) |
    signature[offset + 3];

  return String(binary % 10 ** digits).padStart(digits, "0");
}

/**
 * 将计数器转换为 8 字节大端序。
 *
 * @param value 计数器值。
 * @return 计数器字节。
 */
function counterBytes(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  let remaining = BigInt(value);
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

/**
 * 计算当前 TOTP 计数器。
 *
 * @param now 当前时间。
 * @param periodSeconds 时间步长秒数。
 * @return TOTP 计数器。
 */
function totpCounter(now: Date, periodSeconds: number): number {
  return Math.floor(now.getTime() / 1000 / periodSeconds);
}

/**
 * 规范化 TOTP 验证码。
 *
 * @param code 原始验证码。
 * @param digits 验证码位数。
 * @return 合法验证码。
 */
function normalizeTotpCode(
  code: string,
  digits: number,
): string | undefined {
  const normalized = code.trim().replaceAll(/\s/g, "");
  return new RegExp(`^[0-9]{${digits}}$`).test(normalized)
    ? normalized
    : undefined;
}

/**
 * 规范化 TOTP 验证码配置。
 *
 * @param config TOTP 验证码配置。
 * @return 规范化后的配置。
 */
function normalizedTotpCodeConfig(
  config: Partial<TotpCodeConfig>,
): TotpCodeConfig {
  return {
    digits: integerInRange(
      config.digits,
      defaultTotpCodeConfig.digits,
      6,
      8,
    ),
    periodSeconds: positiveInteger(
      config.periodSeconds,
      defaultTotpCodeConfig.periodSeconds,
    ),
    verificationWindow: nonNegativeInteger(
      config.verificationWindow,
      defaultTotpCodeConfig.verificationWindow,
    ),
  };
}

/**
 * 导入 TOTP AES-GCM 加密密钥。
 *
 * @param encryptionKey 服务端加密密钥。
 * @return CryptoKey。
 */
async function importTotpEncryptionKey(
  encryptionKey: string,
): Promise<CryptoKey> {
  const normalized = encryptionKey.trim();
  if (!normalized) {
    throw new TotpConfigError("TOTP secret encryption key is required.");
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  return await crypto.subtle.importKey(
    "raw",
    digest,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Base64URL 解码。
 *
 * @param value Base64URL 字符串。
 * @return 解码后的字节。
 */
function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

/**
 * 将字节复制为明确的 ArrayBuffer，便于传入 Web Crypto。
 *
 * @param bytes 原始字节。
 * @return 复制后的 ArrayBuffer。
 */
function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

/**
 * 从环境变量读取正整数。
 *
 * @param readEnv 环境变量读取函数。
 * @param name 环境变量名。
 * @param fallback 兜底值。
 * @return 正整数。
 */
function positiveIntegerFromEnv(
  readEnv: (name: string) => string | undefined,
  name: string,
  fallback: number,
): number {
  return positiveInteger(Number(readEnv(name)), fallback);
}

/**
 * 从环境变量读取非负整数。
 *
 * @param readEnv 环境变量读取函数。
 * @param name 环境变量名。
 * @param fallback 兜底值。
 * @return 非负整数。
 */
function nonNegativeIntegerFromEnv(
  readEnv: (name: string) => string | undefined,
  name: string,
  fallback: number,
): number {
  return nonNegativeInteger(Number(readEnv(name)), fallback);
}

/**
 * 从环境变量读取指定范围内的整数。
 *
 * @param readEnv 环境变量读取函数。
 * @param name 环境变量名。
 * @param fallback 兜底值。
 * @param min 最小值。
 * @param max 最大值。
 * @return 范围内整数。
 */
function integerInRangeFromEnv(
  readEnv: (name: string) => string | undefined,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  return integerInRange(Number(readEnv(name)), fallback, min, max);
}

/**
 * 规范化正整数。
 *
 * @param value 待规范化值。
 * @param fallback 兜底值。
 * @return 正整数。
 */
function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

/**
 * 规范化非负整数。
 *
 * @param value 待规范化值。
 * @param fallback 兜底值。
 * @return 非负整数。
 */
function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

/**
 * 规范化指定范围内的整数。
 *
 * @param value 待规范化值。
 * @param fallback 兜底值。
 * @param min 最小值。
 * @param max 最大值。
 * @return 范围内整数。
 */
function integerInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === "number" &&
      Number.isInteger(value) &&
      value >= min &&
      value <= max
    ? value
    : fallback;
}
