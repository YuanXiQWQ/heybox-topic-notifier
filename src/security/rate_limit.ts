/**
 * @file 本文件提供公开部署下的轻量服务端频率限制能力。
 */
import type { RateLimitHit } from "../storage/kv.ts";
import { logSecurityAuditEvent } from "./audit_log.ts";
import { base64UrlEncode } from "./crypto_utils.ts";

/**
 * 频率限制策略。
 */
export type RateLimitPolicy = {
  limit: number;
  scope: string;
  windowMs: number;
};

/**
 * 频率限制所需的最小存储能力。
 */
type RateLimitStorage = {
  recordRateLimitHit?: (
    keyParts: readonly string[],
    limit: number,
    windowMs: number,
  ) => Promise<RateLimitHit>;
};

/**
 * 频率限制审计日志上下文。
 */
type RateLimitAuditContext = {
  request?: Request;
  userId?: string;
};

/**
 * 注册接口每小时允许的尝试次数。
 */
const registrationLimit = 5;
/**
 * 手动触发轮询每十分钟允许的次数。
 */
const manualPollLimit = 6;
/**
 * 调试类操作每十分钟允许的次数。
 */
const debugOperationLimit = 10;
/**
 * 账号敏感操作每十分钟允许的次数。
 */
const accountOperationLimit = 10;
/**
 * 一分钟对应的毫秒数。
 */
const minuteMs = 60 * 1000;
/**
 * 一小时对应的毫秒数。
 */
const hourMs = 60 * minuteMs;

/**
 * 公开部署下使用的默认频率限制策略。
 */
export const publicRateLimitPolicies = {
  accountSensitiveOperation: {
    limit: accountOperationLimit,
    scope: "account-sensitive-operation",
    windowMs: 10 * minuteMs,
  },
  debugOperation: {
    limit: debugOperationLimit,
    scope: "debug-operation",
    windowMs: 10 * minuteMs,
  },
  manualPoll: {
    limit: manualPollLimit,
    scope: "manual-poll",
    windowMs: 10 * minuteMs,
  },
  registration: {
    limit: registrationLimit,
    scope: "registration",
    windowMs: hourMs,
  },
} as const satisfies Record<string, RateLimitPolicy>;

/**
 * 根据存储、策略和访问者标识检查频率限制，超过限制时返回 429 响应。
 *
 * @param storage 支持频率限制计数的存储对象。
 * @param policy 频率限制策略。
 * @param identifier 访问者标识。
 * @param auditContext 审计日志上下文。
 * @return 未触发限制时返回 undefined，否则返回 429 响应。
 */
export async function rateLimitExceededResponseFor(
  storage: RateLimitStorage | undefined,
  policy: RateLimitPolicy,
  identifier: string,
  auditContext: RateLimitAuditContext = {},
): Promise<Response | undefined> {
  if (!storage?.recordRateLimitHit) {
    return undefined;
  }

  const keyParts = [policy.scope, await hashedIdentifier(identifier)];
  const hit = await storage.recordRateLimitHit(keyParts, policy.limit, policy.windowMs);
  if (!hit.allowed) {
    logSecurityAuditEvent({
      code: "rate_limit_exceeded",
      details: {
        count: hit.count,
        identifierHash: keyParts[1],
        limit: hit.limit,
        resetAt: hit.resetAt,
        retryAfterSeconds: hit.retryAfterSeconds,
        scope: policy.scope,
      },
      level: "warn",
      message: `限流已触发：${policy.scope}。`,
      request: auditContext.request,
      userId: auditContext.userId,
    });
  }

  return hit.allowed ? undefined : rateLimitExceededResponse(hit);
}

/**
 * 从请求头中提取客户端频率限制标识。
 *
 * @param header 读取请求头的函数。
 * @return 客户端频率限制标识。
 */
export function clientRateLimitIdentifier(
  header: (name: string) => string | undefined,
): string {
  const forwardedFor = header("x-forwarded-for")?.split(",")[0]?.trim();
  const explicitAddress = header("cf-connecting-ip")?.trim() ||
    header("x-real-ip")?.trim() ||
    header("fly-client-ip")?.trim() ||
    forwardedFor;
  return explicitAddress ? `client:${explicitAddress}` : "client:unknown";
}

/**
 * 生成已登录用户频率限制标识。
 *
 * @param userId 用户 ID。
 * @return 已登录用户频率限制标识。
 */
export function userRateLimitIdentifier(userId: string): string {
  return `user:${userId}`;
}

/**
 * 创建频率限制超限响应。
 *
 * @param hit 频率限制命中结果。
 * @return HTTP 429 响应。
 */
function rateLimitExceededResponse(hit: RateLimitHit): Response {
  return new Response("Too many requests. Try again later.", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "retry-after": String(hit.retryAfterSeconds),
      "x-ratelimit-limit": String(hit.limit),
      "x-ratelimit-remaining": String(Math.max(0, hit.limit - hit.count)),
      "x-ratelimit-reset": hit.resetAt,
    },
    status: 429,
  });
}

/**
 * 对访问者标识做哈希，避免将原始 IP 或用户 ID 直接写入限流键。
 *
 * @param identifier 原始访问者标识。
 * @return Base64URL 编码的 SHA-256 哈希。
 */
async function hashedIdentifier(identifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identifier));
  return base64UrlEncode(new Uint8Array(digest));
}
