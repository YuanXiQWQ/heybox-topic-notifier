/**
 * @file 本文件验证安全审计日志输出。
 */
import { logSecurityAuditEvent } from "./audit_log.ts";

Deno.test("logSecurityAuditEvent writes Chinese message without query string", () => {
  const lines: string[] = [];
  const originalWarn = console.warn;
  console.warn = (value?: unknown) => {
    lines.push(String(value));
  };

  try {
    logSecurityAuditEvent({
      code: "csrf_rejected",
      level: "warn",
      message: "CSRF 校验失败，已拒绝请求。",
      request: new Request("https://example.com/settings?token=secret", { method: "POST" }),
    });
  } finally {
    console.warn = originalWarn;
  }

  const entry = JSON.parse(lines[0]);
  assertEquals(entry.event, "security_audit");
  assertEquals(entry.level, "warn");
  assertEquals(entry.code, "csrf_rejected");
  assertEquals(entry.message, "CSRF 校验失败，已拒绝请求。");
  assertEquals(entry.method, "POST");
  assertEquals(entry.path, "/settings");
  assertEquals("token" in entry, false);
});

/**
 * 断言两个值的 JSON 表示相等。
 *
 * @param actual 实际值。
 * @param expected 期望值。
 * @return 断言通过时无返回值。
 */
function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}
