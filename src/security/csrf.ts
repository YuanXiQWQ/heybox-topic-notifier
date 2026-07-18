/**
 * @file 本文件提供 CSRF 双提交令牌的生成、渲染和校验能力。
 */
import { logSecurityAuditEvent } from "./audit_log.ts";

/**
 * CSRF Cookie 名称。
 */
export const csrfCookieName = "heybox_csrf";
/**
 * CSRF 表单字段名称。
 */
export const csrfFieldName = "csrfToken";
/**
 * CSRF 请求头名称。
 */
export const csrfHeaderName = "x-csrf-token";

/**
 * CSRF 令牌字节长度。
 */
const csrfTokenBytes = 32;
/**
 * CSRF Cookie 默认有效期秒数。
 */
const csrfMaxAgeSeconds = 60 * 60 * 24 * 30;
/**
 * Base64URL 编码后的 CSRF 令牌格式。
 */
const csrfTokenPattern = /^[A-Za-z0-9_-]{43}$/;

/**
 * 当前请求可使用的 CSRF 令牌状态。
 */
export type CsrfTokenState = {
  setCookie?: string;
  token: string;
};

/**
 * 读取请求中的 CSRF 令牌；缺失或无效时生成新令牌和 Cookie。
 *
 * @param {string | undefined} cookieHeader Cookie 请求头。
 * @param {string} requestUrl 当前请求 URL。
 * @return {CsrfTokenState} 可用于页面渲染的 CSRF 令牌状态。
 */
export function csrfTokenForRequest(
  cookieHeader: string | undefined,
  requestUrl: string,
): CsrfTokenState {
  const existingToken = csrfTokenFromCookie(cookieHeader);
  if (existingToken) {
    return { token: existingToken };
  }

  const token = createCsrfToken();
  return {
    setCookie: serializeCsrfCookie(token, requestUrl),
    token,
  };
}

/**
 * 将 CSRF Cookie 写入响应。
 *
 * @param {Response} response 原始响应。
 * @param {CsrfTokenState} state CSRF 令牌状态。
 * @return {Response} 写入 Cookie 后的响应。
 */
export function withCsrfCookie(response: Response, state: CsrfTokenState): Response {
  if (state.setCookie) {
    response.headers.append("set-cookie", state.setCookie);
  }
  return response;
}

/**
 * 渲染隐藏的 CSRF 表单字段。
 *
 * @param {string} token CSRF 令牌。
 * @return {string} 隐藏表单字段 HTML。
 */
export function csrfHiddenInput(token: string): string {
  return `<input type="hidden" name="${csrfFieldName}" value="${token}">`;
}

/**
 * 校验请求 Cookie 与提交令牌是否匹配。
 *
 * @param {string | undefined} cookieHeader Cookie 请求头。
 * @param {unknown} submittedToken 表单字段或请求头中提交的令牌。
 * @return {boolean} 令牌有效且匹配时返回 true。
 */
export function verifyCsrfToken(
  cookieHeader: string | undefined,
  submittedToken: unknown,
): boolean {
  const cookieToken = csrfTokenFromCookie(cookieHeader);
  const token = typeof submittedToken === "string" ? submittedToken : "";
  return Boolean(cookieToken) && isValidCsrfToken(token) && constantTimeEquals(cookieToken, token);
}

/**
 * 从表单对象或请求头中提取提交的 CSRF 令牌。
 *
 * @param {Record<string, FormDataEntryValue | FormDataEntryValue[]> | FormData} form 表单数据。
 * @param {string | undefined} headerToken 请求头中的 CSRF 令牌。
 * @return {string | undefined} 提交的 CSRF 令牌。
 */
export function submittedCsrfToken(
  form: Record<string, FormDataEntryValue | FormDataEntryValue[]> | FormData,
  headerToken: string | undefined,
): string | undefined {
  if (headerToken) {
    return headerToken;
  }

  const value = form instanceof FormData ? form.get(csrfFieldName) : form[csrfFieldName];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

/**
 * 创建 CSRF 校验失败响应。
 *
 * @param {Request | undefined} request 触发失败的请求。
 * @return {Response} CSRF 校验失败响应。
 */
export function csrfForbiddenResponse(request?: Request): Response {
  if (request) {
    logSecurityAuditEvent({
      code: "csrf_rejected",
      level: "warn",
      message: "CSRF 校验失败，已拒绝请求。",
      request,
    });
  }

  return new Response("Invalid CSRF token.", {
    headers: { "content-type": "text/plain; charset=utf-8" },
    status: 403,
  });
}

/**
 * 从 Cookie 请求头中读取有效 CSRF 令牌。
 *
 * @param {string | undefined} cookieHeader Cookie 请求头。
 * @return {string | undefined} 有效 CSRF 令牌。
 */
function csrfTokenFromCookie(cookieHeader: string | undefined): string | undefined {
  const token = parseCookies(cookieHeader).get(csrfCookieName);
  return isValidCsrfToken(token) ? token : undefined;
}

/**
 * 创建新的随机 CSRF 令牌。
 *
 * @return {string} Base64URL 编码的 CSRF 令牌。
 */
function createCsrfToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(csrfTokenBytes));
  return base64UrlEncode(bytes);
}

/**
 * 判断 CSRF 令牌是否符合格式。
 *
 * @param {unknown} token 待校验的令牌。
 * @return {boolean} 令牌格式有效时返回 true。
 */
function isValidCsrfToken(token: unknown): token is string {
  return typeof token === "string" && csrfTokenPattern.test(token);
}

/**
 * 序列化 CSRF Cookie。
 *
 * @param {string} token CSRF 令牌。
 * @param {string} requestUrl 当前请求 URL。
 * @return {string} Set-Cookie 头值。
 */
function serializeCsrfCookie(token: string, requestUrl: string): string {
  const secure = new URL(requestUrl).protocol === "https:";
  return [
    `${csrfCookieName}=${token}`,
    `Max-Age=${csrfMaxAgeSeconds}`,
    "Path=/",
    "SameSite=Lax",
    "HttpOnly",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

/**
 * 解析 Cookie 请求头。
 *
 * @param {string | undefined} value Cookie 请求头。
 * @return {Map<string, string>} Cookie 名值映射。
 */
function parseCookies(value: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of value?.split(";") ?? []) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    cookies.set(part.slice(0, separatorIndex).trim(), part.slice(separatorIndex + 1).trim());
  }
  return cookies;
}

/**
 * 使用常量时间比较两个字符串。
 *
 * @param {string | undefined} left 左侧字符串。
 * @param {string} right 右侧字符串。
 * @return {boolean} 两个字符串相等时返回 true。
 */
function constantTimeEquals(left: string | undefined, right: string): boolean {
  if (!left) {
    return false;
  }

  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let diff = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

/**
 * 将字节数组编码为 Base64URL 字符串。
 *
 * @param {Uint8Array} value 待编码字节。
 * @return {string} Base64URL 字符串。
 */
function base64UrlEncode(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
