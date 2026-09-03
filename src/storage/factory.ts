/**
 * @file 本文件根据环境配置组装 KV、Turso 或迁移期双写存储。
 */
import type { AppSettings } from "../models.ts";
import { createDualWriteStorage } from "./dual_write.ts";
import { createKvStorage } from "./kv.ts";
import { createTursoStorage } from "./turso.ts";
import type { Storage } from "./types.ts";

/**
 * 可读取环境变量的最小接口。
 */
export type StorageEnvironment = {
  get(name: string): string | undefined;
};

/**
 * 存储工厂测试与依赖注入选项。
 */
export type StorageFactoryOptions = {
  environment?: StorageEnvironment;
  kvStorage?: Storage;
  tursoStorage?: Storage;
};

/**
 * 创建环境配置指定的应用存储。
 *
 * 默认配置仍然只使用 Deno KV。只有显式配置 Turso 读库或双写时，才要求
 * Turso URL 和 token，从而保证现有部署在未修改环境变量时行为完全不变。
 *
 * @param {AppSettings} defaultSettings 默认应用设置。
 * @param {StorageFactoryOptions} options 工厂依赖注入选项。
 * @return {Storage} 应用存储。
 */
export function createAppStorage(
  defaultSettings: AppSettings,
  options: StorageFactoryOptions = {},
): Storage {
  const environment = options.environment ?? Deno.env;
  const readBackend = environment.get("STORAGE_READ_BACKEND")?.trim() || "kv";
  const dualWriteBackend = environment.get("STORAGE_DUAL_WRITE")?.trim() || "";
  if (readBackend !== "kv" && readBackend !== "turso") {
    throw new Error("STORAGE_READ_BACKEND must be kv or turso.");
  }
  if (dualWriteBackend !== "" && dualWriteBackend !== "turso") {
    throw new Error("STORAGE_DUAL_WRITE must be empty or turso.");
  }

  const kvStorage = options.kvStorage ??
    (readBackend === "kv" ? createKvStorage(defaultSettings) : undefined);
  const needsTurso = readBackend === "turso" || dualWriteBackend === "turso";
  const tursoStorage = options.tursoStorage ??
    (needsTurso
      ? createTursoStorage(defaultSettings, {
        authToken: environment.get("TURSO_AUTH_TOKEN"),
        url: environment.get("TURSO_DATABASE_URL"),
      })
      : undefined);

  if (readBackend === "turso") {
    if (!tursoStorage) {
      throw new Error("Turso storage is not available.");
    }
    return tursoStorage;
  }
  if (!kvStorage) {
    throw new Error("KV storage is not available.");
  }
  return dualWriteBackend === "turso" && tursoStorage
    ? createDualWriteStorage(kvStorage, tursoStorage)
    : kvStorage;
}
