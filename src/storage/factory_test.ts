/**
 * @file 本文件验证存储工厂默认保持 KV，并仅按显式配置启用 Turso。
 */
import type { AppSettings } from "../models.ts";
import { createAppStorage, type StorageEnvironment } from "./factory.ts";
import type { Storage } from "./types.ts";

Deno.test("storage factory preserves KV as the default backend", () => {
  const kvStorage = {} as Storage;
  const storage = createAppStorage(defaultSettings, {
    environment: environment({}),
    kvStorage,
  });
  assertSame(storage, kvStorage);
});

Deno.test("storage factory selects Turso only when explicitly configured", () => {
  const tursoStorage = {} as Storage;
  const storage = createAppStorage(defaultSettings, {
    environment: environment({ STORAGE_READ_BACKEND: "turso" }),
    tursoStorage,
  });
  assertSame(storage, tursoStorage);
});

/**
 * 创建测试环境变量读取器。
 *
 * @param {Record<string, string>} values 环境变量值。
 * @return {StorageEnvironment} 环境变量读取器。
 */
function environment(values: Record<string, string>): StorageEnvironment {
  return {
    get: (name: string) => values[name],
  };
}

/**
 * 断言两个对象具有相同引用。
 *
 * @param {unknown} actual 实际对象。
 * @param {unknown} expected 期望对象。
 */
function assertSame(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error("Objects do not have the same identity.");
  }
}

/**
 * 存储工厂测试使用的最小默认设置。
 */
const defaultSettings = {} as AppSettings;
