/**
 * @file 本文件验证迁移期双写存储不会改变权威读取结果和失败响应。
 */
import type { AppSettings, UserSession } from "../models.ts";
import { createDualWriteStorage } from "./dual_write.ts";
import type { Storage, UserStorage } from "./types.ts";

Deno.test("dual write storage mirrors writes and keeps reads authoritative", async () => {
  const authoritativeCalls: string[] = [];
  const mirrorCalls: string[] = [];
  const authoritative = storageStub("authoritative", authoritativeCalls);
  const mirror = storageStub("mirror", mirrorCalls);
  const storage = createDualWriteStorage(authoritative, mirror);
  const session = testSession();

  await storage.saveSession(session);
  const result = await storage.getSession(session.tokenHash);
  await storage.forUser("alice-id").saveSettings(defaultSettings);

  assertEquals(result?.username, "authoritative");
  assertEquals(authoritativeCalls, [
    "saveSession",
    "getSession",
    "alice-id:saveSettings",
  ]);
  assertEquals(mirrorCalls, ["saveSession", "alice-id:saveSettings"]);
});

Deno.test("dual write storage hides mirror failure from the user response", async () => {
  const failures: string[] = [];
  const authoritative = storageStub("authoritative", []);
  const mirror = {
    ...storageStub("mirror", []),
    saveSession: () => Promise.reject(new Error("mirror unavailable")),
  } as Storage;
  const storage = createDualWriteStorage(authoritative, mirror, {
    onMirrorFailure: (failure) => failures.push(failure.method),
  });

  await storage.saveSession(testSession());

  assertEquals(failures, ["saveSession"]);
});

Deno.test("dual write storage does not mirror rejected account creation", async () => {
  const mirrorCalls: string[] = [];
  const authoritative = {
    ...storageStub("authoritative", []),
    createAccount: () => Promise.resolve(false),
  } as Storage;
  const mirror = storageStub("mirror", mirrorCalls);
  const storage = createDualWriteStorage(authoritative, mirror);

  assertEquals(
    await storage.createAccount({
      createdAt: "2026-09-01T00:00:00.000Z",
      id: "alice-id",
      username: "alice",
    }),
    false,
  );
  assertEquals(mirrorCalls, []);
});

/**
 * 创建只实现本组测试所需方法的存储替身。
 *
 * @param {string} name 存储名称。
 * @param {string[]} calls 调用记录。
 * @return {Storage} 存储替身。
 */
function storageStub(name: string, calls: string[]): Storage {
  const userStorage = (userId: string): UserStorage => ({
    getSettings: () => Promise.resolve(defaultSettings),
    saveSettings: () => {
      calls.push(`${userId}:saveSettings`);
      return Promise.resolve();
    },
  } as unknown as UserStorage);
  return {
    forUser: userStorage,
    createAccount: () => {
      calls.push("createAccount");
      return Promise.resolve(true);
    },
    getSession: (tokenHash: string) => {
      calls.push("getSession");
      return Promise.resolve({
        ...testSession(),
        tokenHash,
        username: name,
      });
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
 * 双写测试使用的默认设置。
 */
const defaultSettings = {
  locale: "zh-CN",
} as AppSettings;
