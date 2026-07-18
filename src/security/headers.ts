/**
 * @file 本文件提供公开部署时使用的 HTTP 安全响应头中间件。
 */
import type { Context, MiddlewareHandler } from "@hono/hono";

/**
 * 内容安全策略指令列表。
 */
const contentSecurityPolicyDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "img-src 'self' https://cdn.max-c.com data:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
];

/**
 * 默认写入所有响应的安全响应头。
 */
const defaultSecurityHeaders = {
  "content-security-policy": contentSecurityPolicyDirectives.join("; "),
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "origin-agent-cluster": "?1",
  "permissions-policy": [
    "camera=()",
    "geolocation=()",
    "microphone=()",
    "payment=()",
    "usb=()",
  ].join(", "),
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-dns-prefetch-control": "off",
  "x-frame-options": "DENY",
  "x-permitted-cross-domain-policies": "none",
} as const;

/**
 * HTTPS 响应使用的 HSTS 响应头值。
 */
const strictTransportSecurityHeader = "max-age=31536000; includeSubDomains";

/**
 * 创建为所有应用响应补充安全响应头的 Hono 中间件。
 *
 * @return {MiddlewareHandler} 安全响应头中间件。
 */
export function createSecurityHeadersMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    for (const [name, value] of Object.entries(defaultSecurityHeaders)) {
      setHeaderIfAbsent(c, name, value);
    }

    if (isHttpsRequest(c.req.url)) {
      setHeaderIfAbsent(c, "strict-transport-security", strictTransportSecurityHeader);
    }
  };
}

/**
 * 在响应还没有指定同名头时写入响应头。
 *
 * @param {Context} context Hono 请求上下文。
 * @param {string} name 响应头名称。
 * @param {string} value 响应头值。
 */
function setHeaderIfAbsent(context: Context, name: string, value: string): void {
  if (!context.res.headers.has(name)) {
    context.header(name, value);
  }
}

/**
 * 判断当前请求是否通过 HTTPS 访问。
 *
 * @param {string} requestUrl 当前请求 URL。
 * @return {boolean} 请求协议为 HTTPS 时返回 true。
 */
function isHttpsRequest(requestUrl: string): boolean {
  return new URL(requestUrl).protocol === "https:";
}
