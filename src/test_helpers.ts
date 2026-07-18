/**
 * @file 本文件提供项目测试共用的轻量断言工具。
 */
import type { Hono } from "@hono/hono";
import type { UserAccount } from "./models.ts";
import { csrfCookieName, csrfFieldName } from "./security/csrf.ts";

/**
 * 测试请求使用的固定 CSRF 令牌。
 */
export const testCsrfToken = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/**
 * 断言两个值的 JSON 表示相等。
 *
 * @param actual 实际值。
 * @param expected 期望值。
 * @return 断言通过时无返回值。
 */
export function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

/**
 * 断言异步函数会抛出指定错误信息。
 *
 * @param fn 待执行的异步函数。
 * @param message 期望的错误信息。
 * @return 断言通过时无返回值。
 */
export async function assertRejects(
  fn: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof Error && error.message === message) {
      return;
    }
    throw error;
  }

  throw new Error(`Expected rejection with message: ${message}`);
}

/**
 * 向内存账户索引中插入唯一账户。
 *
 * @param {Map<string, UserAccount>} accountsById 按账户 ID 索引的账户集合。
 * @param {Map<string, string>} accountIdsByUsername 按规范化用户名索引的账户 ID 集合。
 * @param {UserAccount} account 待插入的账户。
 * @return {boolean} 账户唯一并成功插入时返回 true。
 */
export function addUniqueAccount(
  accountsById: Map<string, UserAccount>,
  accountIdsByUsername: Map<string, string>,
  account: UserAccount,
): boolean {
  const username = account.username.trim().toLowerCase();
  if (accountsById.has(account.id) || accountIdsByUsername.has(username)) {
    return false;
  }

  accountsById.set(account.id, account);
  accountIdsByUsername.set(username, account.id);
  return true;
}

/**
 * 为测试表单追加 CSRF 字段。
 *
 * @param {URLSearchParams} body 原始表单。
 * @return {URLSearchParams} 追加 CSRF 字段后的表单。
 */
export function testCsrfForm(body = new URLSearchParams()): URLSearchParams {
  body.set(csrfFieldName, testCsrfToken);
  return body;
}

/**
 * 为测试请求头追加 CSRF Cookie。
 *
 * @param {Record<string, string>} headers 原始请求头。
 * @return {Record<string, string>} 追加 CSRF Cookie 后的请求头。
 */
export function testCsrfHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return {
    ...headers,
    cookie: [headers.cookie, `${csrfCookieName}=${testCsrfToken}`].filter(Boolean).join("; "),
  };
}

/**
 * 提交登录请求。
 *
 * @param {Hono} app Hono 测试应用。
 * @param {string} username 用户名。
 * @param {string} password 密码。
 * @return {Promise<Response>} 登录响应。
 */
export function submitLogin(app: Hono, username: string, password: string): Promise<Response> {
  return Promise.resolve(
    app.request("/login", {
      body: testCsrfForm(new URLSearchParams({ password, username })),
      headers: testCsrfHeaders(),
      method: "POST",
    }),
  );
}

/**
 * 提交注册请求。
 *
 * @param {Hono} app Hono 测试应用。
 * @param {string} username 用户名。
 * @param {string} password 密码。
 * @param {string} confirmPassword 确认密码，默认使用密码本身。
 * @return {Promise<Response>} 注册响应。
 */
export function submitRegistration(
  app: Hono,
  username: string,
  password: string,
  confirmPassword = password,
): Promise<Response> {
  return Promise.resolve(
    app.request("/register", {
      body: testCsrfForm(new URLSearchParams({ confirmPassword, password, username })),
      headers: testCsrfHeaders(),
      method: "POST",
    }),
  );
}
