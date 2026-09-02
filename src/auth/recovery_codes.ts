/**
 * @file 本文件提供一次性恢复码的生成、哈希和校验能力。
 */
import {
  base64UrlEncode,
  constantTimeEquals,
} from "../security/crypto_utils.ts";

/**
 * 首次绑定验证器时生成的恢复码数量。
 */
export const defaultRecoveryCodeCount = 8;
/**
 * 单个恢复码的有效字符数量。
 */
const recoveryCodeCharacterCount = 12;
/**
 * 排除易混淆字符后的 32 字符字母表。
 */
const recoveryCodeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
/**
 * 恢复码哈希格式版本。
 */
const recoveryCodeHashVersion = "v1";

/**
 * 恢复码配置错误。
 */
export class RecoveryCodeConfigError extends Error {}

/**
 * 生成一组高熵一次性恢复码。
 *
 * @param {number} count 需要生成的恢复码数量。
 * @return {string[]} 带分组分隔符的恢复码。
 */
export function createRecoveryCodes(
  count = defaultRecoveryCodeCount,
): string[] {
  const normalizedCount = Number.isSafeInteger(count) && count > 0
    ? count
    : defaultRecoveryCodeCount;
  return Array.from({ length: normalizedCount }, () => {
    const bytes = crypto.getRandomValues(
      new Uint8Array(recoveryCodeCharacterCount),
    );
    const code = Array.from(
      bytes,
      (byte) => recoveryCodeAlphabet[byte & 31],
    ).join("");
    return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
  });
}

/**
 * 计算一组恢复码的服务端 HMAC 哈希。
 *
 * @param {readonly string[]} codes 恢复码明文。
 * @param {string} secret 服务端密钥。
 * @return {Promise<string[]>} 可持久化的恢复码哈希。
 */
export async function hashRecoveryCodes(
  codes: readonly string[],
  secret: string,
): Promise<string[]> {
  return await Promise.all(codes.map((code) => hashRecoveryCode(code, secret)));
}

/**
 * 校验恢复码是否匹配指定哈希。
 *
 * @param {string} code 用户提交的恢复码。
 * @param {string} storedHash 已保存的恢复码哈希。
 * @param {string} secret 服务端密钥。
 * @return {Promise<boolean>} 匹配时返回 true。
 */
export async function verifyRecoveryCodeHash(
  code: string,
  storedHash: string,
  secret: string,
): Promise<boolean> {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized || !storedHash.startsWith(`${recoveryCodeHashVersion}.`)) {
    return false;
  }
  const candidate = await hashRecoveryCode(normalized, secret);
  return constantTimeEquals(storedHash, candidate);
}

/**
 * 规范化用户输入的恢复码。
 *
 * @param {string} code 原始恢复码。
 * @return {string | undefined} 合法的无分隔符恢复码。
 */
function normalizeRecoveryCode(code: string): string | undefined {
  const normalized = code.toUpperCase().replaceAll(/[-\s]/g, "");
  return normalized.length === recoveryCodeCharacterCount &&
      Array.from(normalized).every((character) =>
        recoveryCodeAlphabet.includes(character)
      )
    ? normalized
    : undefined;
}

/**
 * 计算单个恢复码的 HMAC 哈希。
 *
 * @param {string} code 恢复码。
 * @param {string} secret 服务端密钥。
 * @return {Promise<string>} 带版本的恢复码哈希。
 */
async function hashRecoveryCode(code: string, secret: string): Promise<string> {
  const normalizedSecret = secret.trim();
  const normalizedCode = normalizeRecoveryCode(code);
  if (!normalizedSecret || !normalizedCode) {
    throw new RecoveryCodeConfigError(
      "Recovery code configuration is invalid.",
    );
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalizedSecret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(normalizedCode),
  );
  return `${recoveryCodeHashVersion}.${
    base64UrlEncode(new Uint8Array(signature))
  }`;
}
