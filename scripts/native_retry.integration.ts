/** @file 在专用临时目录验证原生详情冷却文件的互斥、持久恢复和损坏拒绝。 */
import { assertEquals, assertRejects } from "@std/assert";
import { openNativeRetryFile } from "../src/services/heybox_native_retry_file.ts";

/** 本测试只能在明确授予写入权限的隔离目录内创建文件。 */
const directory = "临时文件/native-retry-tests";
/** 合成绑定，仅用于文件格式与恢复检查。 */
const binding = "0123456789abcdef";

/**
 * 创建唯一临时文件路径，运行结束后删除该文件和本次空目录。
 * @param {(path: string) => Promise<void>} run 有实际文件操作的验证。
 * @return {Promise<void>} 验证和清理均完成。
 */
async function withStateFile(
  run: (path: string) => Promise<void>,
): Promise<void> {
  await Deno.mkdir(directory, { recursive: true });
  const temporary = await Deno.makeTempDir({
    dir: directory,
    prefix: "state-",
  });
  const path = `${temporary}/retry.json`;
  try {
    await run(path);
  } finally {
    await Deno.remove(path).catch((error) => {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    });
    await Deno.remove(temporary);
  }
}

Deno.test("native retry file restores the confirmed deadline and holds an exclusive lock", () =>
  withStateFile(async (path) => {
    const first = await openNativeRetryFile(path, binding);
    try {
      assertEquals(first.retryAt, 0);
      await first.persist(123456789);
      await assertRejects(() => openNativeRetryFile(path, binding));
    } finally {
      first.close();
    }
    const second = await openNativeRetryFile(path, binding);
    try {
      assertEquals(second.retryAt, 123456789);
    } finally {
      second.close();
    }
    const content = await Deno.readTextFile(path);
    assertEquals(content.includes(binding), false);
    assertEquals(Object.keys(JSON.parse(content)).sort(), [
      "binding",
      "checksum",
      "retryAt",
      "version",
    ]);
  }));

Deno.test("native retry file rejects another device without resetting the deadline", () =>
  withStateFile(async (path) => {
    const state = await openNativeRetryFile(path, binding);
    try {
      await state.persist(987654321);
    } finally {
      state.close();
    }
    const before = await Deno.readTextFile(path);
    await assertRejects(() => openNativeRetryFile(path, "fedcba9876543210"));
    assertEquals(await Deno.readTextFile(path), before);
  }));

Deno.test("native retry file rejects empty, truncated and unsupported persisted state", () =>
  withStateFile(async (path) => {
    for (const invalid of ["", "{", "null", "{}", "x".repeat(1025)]) {
      await Deno.writeTextFile(path, invalid);
      await assertRejects(() => openNativeRetryFile(path, binding));
      assertEquals(await Deno.readTextFile(path), invalid);
    }
  }));

Deno.test("native retry file rejects a partial update that remains valid JSON", () =>
  withStateFile(async (path) => {
    const file = await openNativeRetryFile(path, binding);
    try {
      await file.persist(1794579999000);
    } finally {
      file.close();
    }
    const state = JSON.parse(await Deno.readTextFile(path));
    state.retryAt = 1794579900000;
    const incomplete = JSON.stringify(state);
    await Deno.writeTextFile(path, incomplete);
    await assertRejects(() => openNativeRetryFile(path, binding));
    assertEquals(await Deno.readTextFile(path), incomplete);
  }));
