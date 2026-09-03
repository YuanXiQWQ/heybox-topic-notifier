/**
 * @file 本文件提供认证会话读取、创建、删除和 Cookie 序列化能力。
 */
import type { UserAccount } from "../models.ts";
import { parseCookies } from "../security/cookies.ts";
import { base64UrlEncode } from "../security/crypto_utils.ts";
import type { createKvStorage } from "../storage/kv.ts";

/**
 * 认证会话模块使用的存储能力。
 */
type SessionStorage = Pick<
  ReturnType<typeof createKvStorage>,
  "deleteSession" | "getSession" | "saveSession"
>;

/**
 * 已认证会话信息。
 */
export type AuthSession = {
  userId: string;
  username: string;
};

/**
 * 会话 Cookie 配置选项。
 */
export type SessionCookieOptions = {
  cookieName?: string;
};

/**
 * 创建会话时使用的配置选项。
 */
export type SessionRedirectOptions = SessionCookieOptions & {
  sessionMaxAgeSeconds: number;
};

/**
 * 默认登录 Cookie 名称。
 */
export const defaultSessionCookieName = "heybox_session";

/**
 * 从 Cookie 中读取已认证会话。
 *
 * @param cookieHeader Cookie 请求头。
 * @param storage 应用存储。
 * @param options 会话 Cookie 配置选项。
 * @return 有效认证会话，不存在或过期时返回 undefined。
 */
export async function readAuthSession(
  cookieHeader: string | undefined,
  storage: SessionStorage,
  options: SessionCookieOptions = {},
): Promise<AuthSession | undefined> {
  const cookieName = options.cookieName ?? defaultSessionCookieName;
  const token = parseCookies(cookieHeader).get(cookieName);
  if (!token) {
    return undefined;
  }

  const tokenHash = await sessionTokenHash(token);
  const session = await storage.getSession(tokenHash);
  if (!session) {
    return undefined;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await storage.deleteSession(tokenHash);
    return undefined;
  }

  return { userId: session.userId, username: session.username };
}

/**
 * 创建会话并返回带会话 Cookie 的重定向响应。
 *
 * @param requestUrl 当前请求 URL。
 * @param location 重定向目标。
 * @param account 用户账号。
 * @param storage 应用存储。
 * @param options 会话创建配置。
 * @return 重定向响应。
 */
export async function redirectWithSession(
  requestUrl: string,
  location: string,
  account: UserAccount,
  storage: SessionStorage,
  options: SessionRedirectOptions,
): Promise<Response> {
  const token = createSessionToken();
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() + options.sessionMaxAgeSeconds * 1000,
  );

  await storage.saveSession({
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    tokenHash: await sessionTokenHash(token),
    userId: account.id,
    username: account.username,
  });

  return new Response(null, {
    headers: {
      location,
      "set-cookie": serializeSessionCookie(requestUrl, token, {
        cookieName: options.cookieName,
        httpOnly: true,
        maxAge: options.sessionMaxAgeSeconds,
        sameSite: "Lax",
      }),
    },
    status: 303,
  });
}

/**
 * 删除 Cookie 中携带的认证会话。
 *
 * @param cookieHeader Cookie 请求头。
 * @param storage 应用存储。
 * @param options 会话 Cookie 配置选项。
 * @return 删除完成后的 Promise。
 */
export async function deleteSessionForCookie(
  cookieHeader: string | undefined,
  storage: SessionStorage,
  options: SessionCookieOptions = {},
): Promise<void> {
  const token = parseCookies(cookieHeader).get(
    options.cookieName ?? defaultSessionCookieName,
  );
  if (!token) {
    return;
  }

  await storage.deleteSession(await sessionTokenHash(token));
}

/**
 * 创建清除会话 Cookie 的 Set-Cookie 响应头值。
 *
 * @param requestUrl 当前请求 URL。
 * @param options 会话 Cookie 配置选项。
 * @return 清除会话 Cookie 的 Set-Cookie 响应头值。
 */
export function clearSessionCookie(
  requestUrl: string,
  options: SessionCookieOptions = {},
): string {
  return serializeSessionCookie(requestUrl, "", {
    cookieName: options.cookieName,
    httpOnly: true,
    maxAge: 0,
    sameSite: "Lax",
  });
}

/**
 * 创建随机会话令牌。
 *
 * @return Base64URL 编码的会话令牌。
 */
function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(bytes);
}

/**
 * 计算会话令牌哈希。
 *
 * @param token 会话令牌。
 * @return Base64URL 编码的令牌哈希。
 */
async function sessionTokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * 序列化会话 Cookie 的 Set-Cookie 响应头值。
 *
 * @param requestUrl 当前请求 URL。
 * @param value Cookie 值。
 * @param options Cookie 选项。
 * @return Set-Cookie 响应头值。
 */
function serializeSessionCookie(
  requestUrl: string,
  value: string,
  options: {
    cookieName?: string;
    httpOnly: boolean;
    maxAge: number;
    sameSite: "Lax" | "Strict";
  },
): string {
  const name = options.cookieName ?? defaultSessionCookieName;
  const secure = new URL(requestUrl).protocol === "https:";
  return [
    `${name}=${value}`,
    `Max-Age=${options.maxAge}`,
    "Path=/",
    `SameSite=${options.sameSite}`,
    options.httpOnly ? "HttpOnly" : "",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}
