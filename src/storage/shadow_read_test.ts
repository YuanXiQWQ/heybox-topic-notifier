/**
 * @file 本文件验证影子读取不会改变权威结果，并能发现差异和查询错误。
 */
import type { AppSettings, UserSession } from "../models.ts";
import {
  createShadowReadStorage,
  type ShadowReadComparison,
} from "./shadow_read.ts";
import type { Storage, UserStorage } from "./types.ts";

Deno.test("shadow reads return authoritative data and report differences", async () => {
  const comparisons: ShadowReadComparison[] = [];
  const tasks: Promise<void>[] = [];
  const authoritativeCalls: string[] = [];
  const shadowCalls: string[] = [];
  const storage = createShadowReadStorage(
    storageStub("authoritative", authoritativeCalls),
    storageStub("shadow", shadowCalls),
    {
      defer: (task) => tasks.push(task),
      onComparison: (comparison) => comparisons.push(comparison),
    },
  );

  const result = await storage.getSession("token-hash");
  await storage.saveSession(testSession());
  await Promise.all(tasks);

  assertEquals(result?.username, "authoritative");
  assertEquals(authoritativeCalls, ["getSession", "saveSession"]);
  assertEquals(shadowCalls, ["getSession"]);
  assertEquals(comparisons.map(({ method, status }) => ({ method, status })), [
    { method: "getSession", status: "mismatch" },
  ]);
});

Deno.test("shadow reads compare user-scoped results and contain errors", async () => {
  const comparisons: ShadowReadComparison[] = [];
  const tasks: Promise<void>[] = [];
  const shadow = storageStub("shadow", []);
  shadow.forUser = () => ({
    getSettings: () => Promise.reject(new Error("shadow unavailable")),
  } as unknown as UserStorage);
  const storage = createShadowReadStorage(
    storageStub("authoritative", []),
    shadow,
    {
      defer: (task) => tasks.push(task),
      onComparison: (comparison) => comparisons.push(comparison),
    },
  );

  const result = await storage.forUser("alice-id").getSettings();
  await Promise.all(tasks);

  assertEquals(result, defaultSettings);
  assertEquals(comparisons[0].method, "getSettings");
  assertEquals(comparisons[0].status, "error");
});

/**
 * 创建影子读取测试使用的存储替身。
 *
 * @param {string} name 存储名称。
 * @param {string[]} calls 调用记录。
 * @return {Storage} 存储替身。
 */
function storageStub(name: string, calls: string[]): Storage {
  return {
    forUser: (userId: string) => ({
      getSettings: () => {
        calls.push(`${userId}:getSettings`);
        return Promise.resolve(defaultSettings);
      },
    } as unknown as UserStorage),
    getSession: (tokenHash: string) => {
      calls.push("getSession");
      return Promise.resolve({ ...testSession(), tokenHash, username: name });
    },
    saveSession: () => {
      calls.push("saveSession");
      return Promise.resolve();
    },
  } as unknown as Storage;
}

/**
 * 创建测试会话。
 *
 * @return {UserSession} 测试会话。
 */
function testSession(): UserSession {
  return {
    createdAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2026-10-01T00:00:00.000Z",
    tokenHash: "token-hash",
    userId: "alice-id",
    username: "alice",
  };
}

/**
 * 断言两个值的 JSON 表示相等。
 *
 * @param {unknown} actual 实际值。
 * @param {unknown} expected 期望值。
 */
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Values are not equal.");
  }
}

/**
 * 影子读取测试使用的最小设置。
 */
const defaultSettings = { locale: "zh-CN" } as AppSettings;
