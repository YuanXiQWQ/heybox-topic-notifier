/**
 * @file 本文件提供自建 ALTCHA 工作量证明挑战的生成与校验能力。
 */
import {
  type Challenge,
  createChallenge,
  type Payload,
  type Solution,
  verifySolution,
} from "npm:altcha-lib@^2.4.0";
import { deriveKey as derivePbkdf2Key } from "npm:altcha-lib@^2.4.0/algorithms/pbkdf2";
import { base64UrlEncode } from "../security/crypto_utils.ts";

/**
 * ALTCHA 表单字段名。
 */
export const altchaResponseFieldName = "altcha";

/**
 * ALTCHA 配置。
 */
export type AltchaConfig = {
  challengeCost: number;
  challengeTtlSeconds: number;
  enabled: boolean;
  hmacKey: string;
};

/**
 * ALTCHA 验证结果。
 */
export type AltchaVerificationResult =
  | { errorCodes: string[]; success: false }
  | { payloadId: string; success: true };

/**
 * 环境变量读取函数。
 */
export type EnvReader = (name: string) => string | undefined;

/**
 * ALTCHA 默认 PBKDF2 迭代次数。
 */
const defaultChallengeCost = 1000;
/**
 * ALTCHA 默认挑战有效期（秒）。
 */
const defaultChallengeTtlSeconds = 10 * 60;
/**
 * ALTCHA 工作量证明所用算法。
 */
const altchaAlgorithm = "PBKDF2/SHA-256";
/**
 * ALTCHA 目标哈希前缀。
 */
const altchaKeyPrefix = "00";
/**
 * 可接受的 ALTCHA 载荷最大长度。
 */
const maxPayloadLength = 16_384;

/**
 * 从环境变量读取 ALTCHA 配置。
 *
 * @param {EnvReader} readEnv 环境变量读取函数。
 * @return {AltchaConfig} ALTCHA 配置。
 */
export function altchaConfigFromEnv(
  readEnv: EnvReader = (name) => Deno.env.get(name),
): AltchaConfig {
  return {
    challengeCost: positiveInteger(
      readEnv("ALTCHA_CHALLENGE_COST"),
      defaultChallengeCost,
      100,
      10_000,
    ),
    challengeTtlSeconds: positiveInteger(
      readEnv("ALTCHA_CHALLENGE_TTL_SECONDS"),
      defaultChallengeTtlSeconds,
      120,
      60 * 60,
    ),
    enabled: readEnv("ALTCHA_ENABLED") === "true",
    hmacKey: readEnv("ALTCHA_HMAC_KEY") ?? "",
  };
}

/**
 * 判断 ALTCHA 是否具有安全且完整的启用配置。
 *
 * @param {AltchaConfig} config ALTCHA 配置。
 * @return {boolean} 配置可用时返回 true。
 */
export function altchaConfigured(config: AltchaConfig): boolean {
  return config.enabled && config.hmacKey.trim().length >= 32;
}

/**
 * 创建供浏览器静默求解的 ALTCHA 挑战。
 *
 * @param {AltchaConfig} config ALTCHA 配置。
 * @param {Date} now 当前时间。
 * @return {Promise<Challenge>} 已签名的挑战。
 */
export async function createAltchaChallenge(
  config: AltchaConfig,
  now = new Date(),
): Promise<Challenge> {
  if (!altchaConfigured(config)) {
    throw new Error("ALTCHA is not configured.");
  }

  return await createChallenge({
    algorithm: altchaAlgorithm,
    cost: config.challengeCost,
    deriveKey: derivePbkdf2Key,
    expiresAt: new Date(now.getTime() + config.challengeTtlSeconds * 1000),
    hmacSignatureSecret: config.hmacKey,
    keyPrefix: altchaKeyPrefix,
  });
}

/**
 * 校验浏览器提交的 ALTCHA 工作量证明载荷。
 *
 * @param {string | undefined} rawPayload 表单中的 Base64 载荷。
 * @param {AltchaConfig} config ALTCHA 配置。
 * @return {Promise<AltchaVerificationResult>} 校验结果。
 */
export async function verifyAltchaPayload(
  rawPayload: string | undefined,
  config: AltchaConfig,
): Promise<AltchaVerificationResult> {
  if (!altchaConfigured(config)) {
    return { errorCodes: ["missing-config"], success: false };
  }

  const payload = parseAltchaPayload(rawPayload);
  if (!payload) {
    return { errorCodes: ["invalid-payload"], success: false };
  }

  const result = await verifySolution({
    challenge: payload.challenge,
    deriveKey: derivePbkdf2Key,
    hmacSignatureSecret: config.hmacKey,
    solution: payload.solution,
  }).catch(() => undefined);
  if (!result?.verified) {
    return {
      errorCodes: [result?.expired ? "expired" : "invalid-solution"],
      success: false,
    };
  }

  return { payloadId: await altchaPayloadId(rawPayload!), success: true };
}

/**
 * 解析并检查 ALTCHA Base64 载荷的基本结构。
 *
 * @param {string | undefined} rawPayload 表单中的 Base64 载荷。
 * @return {{ challenge: Challenge; solution: Solution } | undefined} 可校验的载荷。
 */
function parseAltchaPayload(
  rawPayload: string | undefined,
): { challenge: Challenge; solution: Solution } | undefined {
  if (!rawPayload || rawPayload.length > maxPayloadLength) return undefined;

  try {
    const decoded = atob(rawPayload);
    const text = new TextDecoder().decode(
      Uint8Array.from(decoded, (character) => character.charCodeAt(0)),
    );
    const payload = JSON.parse(text) as Payload;
    if (!isAltchaPayload(payload)) return undefined;
    return payload;
  } catch {
    return undefined;
  }
}

/**
 * 判断未知值是否具有 ALTCHA 载荷所需的最小结构。
 *
 * @param {unknown} value 待检查的值。
 * @return {boolean} 结构有效时返回 true。
 */
function isAltchaPayload(
  value: unknown,
): value is { challenge: Challenge; solution: Solution } {
  if (
    !isRecord(value) || !isRecord(value.challenge) || !isRecord(value.solution)
  ) {
    return false;
  }

  const parameters = value.challenge.parameters;
  return isRecord(parameters) &&
    typeof value.challenge.signature === "string" &&
    typeof parameters.algorithm === "string" &&
    typeof parameters.nonce === "string" &&
    typeof parameters.salt === "string" &&
    typeof parameters.cost === "number" &&
    typeof parameters.keyLength === "number" &&
    typeof parameters.keyPrefix === "string" &&
    typeof value.solution.counter === "number" &&
    typeof value.solution.derivedKey === "string";
}

/**
 * 判断值是否为普通对象。
 *
 * @param {unknown} value 待检查的值。
 * @return {boolean} 值为对象时返回 true。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 计算 ALTCHA 载荷的稳定匿名标识，用于一次性消费。
 *
 * @param {string} payload 原始 Base64 载荷。
 * @return {Promise<string>} Base64URL 编码的 SHA-256 摘要。
 */
async function altchaPayloadId(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * 读取边界内的正整数配置。
 *
 * @param {string | undefined} value 原始环境变量值。
 * @param {number} fallback 默认值。
 * @param {number} minimum 最小值。
 * @param {number} maximum 最大值。
 * @return {number} 规范化后的整数。
 */
function positiveInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}
