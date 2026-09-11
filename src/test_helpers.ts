/**
 * @file 本文件提供项目测试共用的轻量断言工具。
 */
import type { Hono } from "@hono/hono";
import { assertRejects as assertRejectsWithMessage } from "@std/assert";
import type { UserAccount } from "./models.ts";
import { csrfCookieName, csrfFieldName } from "./security/csrf.ts";
import type { RateLimitHit } from "./storage/types.ts";

export { assert, assertEquals, assertStrictEquals } from "@std/assert";

/**
 * 在测试用的树形节点中按类名查找第一个匹配节点。
 *
 * 类名按空格分词匹配，因此 `lobotomy-corp-alert-corner left-up` 也能命中
 * `lobotomy-corp-alert-corner`。
 *
 * @param {object} root 子树根节点。
 * @param {string} className 目标类名。
 * @return {object|undefined} 首个匹配节点。
 */
export function findByClass<T extends { children: T[]; className: string }>(
  root: T,
  className: string,
): T | undefined {
  if (hasTestClass(root, className)) return root;
  for (const child of root.children) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return undefined;
}

/**
 * 在测试用的树形节点中按类名收集全部匹配节点（文档顺序）。
 *
 * @param {object} root 子树根节点。
 * @param {string} className 目标类名。
 * @return {object[]} 匹配节点列表。
 */
export function findAllByClass<T extends { children: T[]; className: string }>(
  root: T,
  className: string,
): T[] {
  const matches = hasTestClass(root, className) ? [root] : [];
  for (const child of root.children) {
    matches.push(...findAllByClass(child, className));
  }
  return matches;
}

/**
 * 判断节点是否带有指定类名。
 *
 * @param {object} node 节点。
 * @param {string} className 目标类名。
 * @return {boolean} 带有该类名时返回 true。
 */
function hasTestClass(
  node: { className: string },
  className: string,
): boolean {
  return node.className.split(/\s+/).includes(className);
}

/**
 * 按类名查找必须存在的节点，缺失时给出可读的失败信息。
 *
 * @param {object} root 子树根节点。
 * @param {string} className 目标类名。
 * @return {object} 匹配节点。
 */
export function requireByClass<T extends { children: T[]; className: string }>(
  root: T,
  className: string,
): T {
  const found = findByClass(root, className);
  if (!found) {
    throw new Error(`测试 DOM 中缺少 .${className} 节点。`);
  }
  return found;
}

/**
 * 去掉 JavaScript 源码中的注释与字符串内容，只保留代码结构。
 *
 * 供「源码中不得出现某个标识符」这类检查使用：注释或字符串里提到该标识符（例如
 * 资源文件名）不属于违规，不应让检查失败。
 *
 * @param {string} source 源码文本。
 * @return {string} 去掉注释与字符串内容后的文本。
 */
export function stripJavaScriptCommentsAndStrings(source: string): string {
  let result = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "/" && source[index + 1] === "/") {
      const newline = source.indexOf("\n", index);
      index = newline < 0 ? source.length : newline;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      const close = source.indexOf("*/", index + 2);
      index = close < 0 ? source.length : close + 2;
      continue;
    }
    if (char === '"' || char === "'") {
      result += `${char}${char}`;
      index++;
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2;
          continue;
        }
        if (source[index] === char) break;
        index++;
      }
      index++;
      continue;
    }
    if (char === "`") {
      result += "``";
      index++;
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2;
          continue;
        }
        if (source[index] === "`") break;
        if (source[index] === "$" && source[index + 1] === "{") {
          let depth = 1;
          let inner = index + 2;
          while (inner < source.length && depth > 0) {
            if (source[inner] === "{") depth++;
            else if (source[inner] === "}") depth--;
            inner++;
          }
          result += stripJavaScriptCommentsAndStrings(
            source.slice(index + 2, Math.max(index + 2, inner - 1)),
          );
          index = inner;
          continue;
        }
        index++;
      }
      index++;
      continue;
    }
    result += char;
    index++;
  }
  return result;
}

/**
 * 去掉 CSS 源码中的注释。
 *
 * @param {string} source 样式表文本。
 * @return {string} 去掉注释后的文本。
 */
export function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ");
}

/**
 * 测试请求使用的固定 CSRF 令牌。
 */
export const testCsrfToken = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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
  // 包一层 async，使同步抛出的实现同样表现为 Promise 拒绝。
  await assertRejectsWithMessage(
    async () => {
      await fn();
    },
    Error,
    message,
  );
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
 * 创建测试用的内存频率限制记录器。
 *
 * @return {object} 内存频率限制记录能力。
 */
export function createMemoryRateLimitRecorder(): {
  recordRateLimitHit(
    keyParts: readonly string[],
    limit: number,
    windowMs: number,
  ): Promise<RateLimitHit>;
} {
  const entries = new Map<string, { count: number; resetAt: string }>();

  return {
    /**
     * 记录一次内存频率限制命中。
     *
     * @param {readonly string[]} keyParts 频率限制键片段。
     * @param {number} limit 当前窗口允许的最大次数。
     * @param {number} windowMs 限流窗口毫秒数。
     * @return {Promise<RateLimitHit>} 频率限制命中结果。
     */
    recordRateLimitHit(
      keyParts: readonly string[],
      limit: number,
      windowMs: number,
    ): Promise<RateLimitHit> {
      const key = JSON.stringify(keyParts);
      const now = Date.now();
      const previous = entries.get(key);
      const previousResetAt = Date.parse(previous?.resetAt ?? "");
      const hasActiveWindow = Number.isFinite(previousResetAt) &&
        previousResetAt > now;
      const resetAtMs = hasActiveWindow ? previousResetAt : now + windowMs;
      const count = hasActiveWindow ? (previous?.count ?? 0) + 1 : 1;
      const resetAt = new Date(resetAtMs).toISOString();
      entries.set(key, { count, resetAt });

      return Promise.resolve({
        allowed: count <= limit,
        count,
        limit,
        resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
      });
    },
  };
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
export function testCsrfHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  return {
    ...headers,
    cookie: [headers.cookie, `${csrfCookieName}=${testCsrfToken}`].filter(
      Boolean,
    ).join("; "),
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
export function submitLogin(
  app: Hono,
  username: string,
  password: string,
): Promise<Response> {
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
      body: testCsrfForm(
        new URLSearchParams({ confirmPassword, password, username }),
      ),
      headers: testCsrfHeaders(),
      method: "POST",
    }),
  );
}
