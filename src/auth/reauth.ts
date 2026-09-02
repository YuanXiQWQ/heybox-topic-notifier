/**
 * @file 本文件提供敏感操作再认证配置和强认证事件判断能力。
 */
import type {
  AuthenticationEvent,
  AuthenticationEventMethod,
  AuthenticationEventPurpose,
} from "../models.ts";

/**
 * 默认再认证复用窗口秒数。
 */
export const defaultReauthMaxAgeSeconds = 10 * 60;

/**
 * 再认证配置。
 */
export type ReauthConfig = {
  maxAgeSeconds: number;
};

/**
 * 从环境变量读取再认证配置。
 *
 * @param readEnv 环境变量读取函数。
 * @return 再认证配置。
 */
export function reauthConfigFromEnv(
  readEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): ReauthConfig {
  return {
    maxAgeSeconds: positiveIntegerFromEnv(
      readEnv,
      "AUTH_REAUTH_MAX_AGE_SECONDS",
      defaultReauthMaxAgeSeconds,
    ),
  };
}

/**
 * 创建强认证事件。
 *
 * @param input 强认证事件输入。
 * @return 强认证事件。
 */
export function createStrongAuthenticationEvent(input: {
  method: AuthenticationEventMethod;
  now?: Date;
  purpose: AuthenticationEventPurpose;
  userId: string;
}): AuthenticationEvent {
  return {
    authenticatedAt: (input.now ?? new Date()).toISOString(),
    method: input.method,
    purpose: input.purpose,
    strength: "strong",
    userId: input.userId,
  };
}

/**
 * 判断认证事件是否仍可用于敏感操作再认证。
 *
 * @param event 认证事件。
 * @param config 再认证配置。
 * @param now 当前时间。
 * @return 事件有效且足够强时返回 true。
 */
export function isRecentStrongAuthenticationEvent(
  event: AuthenticationEvent | undefined,
  config: ReauthConfig,
  now = new Date(),
): boolean {
  if (!event || event.strength !== "strong") {
    return false;
  }

  const authenticatedAt = Date.parse(event.authenticatedAt);
  if (!Number.isFinite(authenticatedAt)) {
    return false;
  }

  const ageMs = now.getTime() - authenticatedAt;
  return ageMs >= 0 && ageMs <= config.maxAgeSeconds * 1000;
}

/**
 * 从环境变量读取正整数。
 *
 * @param readEnv 环境变量读取函数。
 * @param name 环境变量名称。
 * @param fallback 兜底值。
 * @return 正整数。
 */
function positiveIntegerFromEnv(
  readEnv: (name: string) => string | undefined,
  name: string,
  fallback: number,
): number {
  const value = Number(readEnv(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
