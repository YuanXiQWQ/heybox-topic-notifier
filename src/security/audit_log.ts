/**
 * @file 本文件提供面向公开部署的服务端安全审计日志工具。
 */

/**
 * 安全审计日志等级。
 */
export type SecurityAuditLevel = "info" | "warn";

/**
 * 安全审计日志事件。
 */
export type SecurityAuditEvent = {
  code: string;
  details?: Record<string, unknown>;
  level?: SecurityAuditLevel;
  message: string;
  request?: Request;
  userId?: string;
};

/**
 * 审计日志中单个文本字段的最大长度。
 */
const maxAuditTextLength = 240;

/**
 * 写入一条安全审计日志。
 *
 * @param event 安全审计事件。
 * @return 无返回值。
 */
export function logSecurityAuditEvent(event: SecurityAuditEvent): void {
  const level = event.level ?? "info";
  const requestFields = event.request ? requestAuditFields(event.request) : {};
  const entry = {
    event: "security_audit",
    level,
    time: new Date().toISOString(),
    code: auditText(event.code),
    message: auditText(event.message),
    ...requestFields,
    ...(event.userId ? { userId: auditText(event.userId) } : {}),
    ...(event.details ? { details: sanitizeAuditDetails(event.details) } : {}),
  };
  const line = JSON.stringify(entry);

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

/**
 * 将文本清理成适合写入审计日志的短字段。
 *
 * @param value 原始文本。
 * @return 清理后的日志文本。
 */
export function auditText(value: string): string {
  const normalized = value.replaceAll(/[\r\n\t]+/g, " ").trim();
  return normalized.length > maxAuditTextLength
    ? `${normalized.slice(0, maxAuditTextLength)}...`
    : normalized;
}

/**
 * 提取请求中可安全记录的审计字段。
 *
 * @param request 当前请求。
 * @return 请求审计字段。
 */
function requestAuditFields(request: Request): Record<string, string> {
  const url = new URL(request.url);
  return {
    method: request.method,
    path: url.pathname,
  };
}

/**
 * 清理审计日志详情，避免写入超长文本或复杂对象。
 *
 * @param details 原始详情。
 * @return 清理后的详情。
 */
function sanitizeAuditDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    sanitized[auditText(key)] = sanitizeAuditValue(value);
  }

  return sanitized;
}

/**
 * 清理审计详情中的单个值。
 *
 * @param value 原始值。
 * @return 可安全序列化的日志值。
 */
function sanitizeAuditValue(value: unknown): unknown {
  if (typeof value === "string") {
    return auditText(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return auditText(String(value));
}
