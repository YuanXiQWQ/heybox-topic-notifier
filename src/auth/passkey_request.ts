/** @file 在登录、二次验证和设置路由之间共享 Passkey 请求格式与失败次数限制。 */
import type { Context } from "@hono/hono";
import type { PendingPasskeyChallenge } from "../models.ts";
import type { Storage } from "../storage/types.ts";
import type {
  PasskeyAuthenticationOptionsResult,
  PasskeyRegistrationOptionsResult,
} from "./passkey.ts";

/** 单个 Passkey 挑战允许的最大失败次数。 */
export const passkeyChallengeMaxAttempts = 5;

/**
 * 将挑战编号和公开选项交给客户端。
 * @param {PasskeyAuthenticationOptionsResult | PasskeyRegistrationOptionsResult} result 挑战生成结果。
 * @return {object} 客户端发起认证或注册所需的响应体。
 */
export function passkeyOptionsResponse(
  result: PasskeyAuthenticationOptionsResult | PasskeyRegistrationOptionsResult,
) {
  return { challengeId: result.challenge.id, optionsJSON: result.optionsJSON };
}

/**
 * 判断请求体或凭证是否为 JSON 对象。
 * @param {unknown} value 待判断的字段。
 * @return {boolean} 是否为非空且非数组的对象。
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 读取 Passkey 的 JSON 请求，无效输入按空对象校验。
 * @param {Context} c 请求上下文。
 * @return {Promise<Record<string, unknown>>} 请求字段。
 */
export async function passkeyJsonPayload(
  c: Context,
): Promise<Record<string, unknown>> {
  try {
    const payload = await c.req.json();
    return isRecord(payload) ? payload : {};
  } catch {
    return {};
  }
}

/**
 * 记录一次失败尝试，达到上限时作废挑战。
 * @param {Storage} storage 挑战所在的存储。
 * @param {PendingPasskeyChallenge} challenge 待更新的挑战。
 */
export async function recordPasskeyChallengeFailure(
  storage: Storage,
  challenge: PendingPasskeyChallenge,
): Promise<void> {
  const attempts = Math.max(0, challenge.attempts) + 1;
  if (attempts >= passkeyChallengeMaxAttempts) {
    await storage.deletePendingPasskeyChallenge(challenge.id);
    return;
  }
  await storage.savePendingPasskeyChallenge({ ...challenge, attempts });
}
