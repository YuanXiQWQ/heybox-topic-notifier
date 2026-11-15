/** @file 验证固定 SDK 身份的磁盘恢复、独占锁、原子更新和损坏拒绝。 */
import { assertEquals, assertRejects } from "@std/assert";
import {
  createSdkIdentity,
  openSdkIdentity,
} from "../src/services/heybox_sdk_identity.ts";
import { openSdkCaptcha } from "../src/services/heybox_sdk_captcha.ts";

/** 所有测试文件限定在明确授权的隔离目录内。 */
const base = "临时文件/native-sdk-tests";

/**
 * 使用独立的私有目录验证实际文件行为，结束后清理本次创建的目录。
 * @param {(path: string) => Promise<void>} run 文件验收逻辑。
 * @return {Promise<void>} 验证和清理已完成。
 */
async function withDirectory(
  run: (path: string) => Promise<void>,
): Promise<void> {
  await Deno.mkdir(base, { recursive: true });
  const path = await Deno.makeTempDir({ dir: base, prefix: "identity-" });
  if (Deno.build.os !== "windows") await Deno.chmod(path, 0o700);
  try {
    await run(path);
  } finally {
    await Deno.remove(path, { recursive: true });
  }
}

Deno.test("SDK state requires explicit initialization, survives restart and rejects a second writer", () =>
  withDirectory(async (path) => {
    await assertRejects(() => openSdkIdentity(path));
    const seed = createSdkIdentity(1800000000000);
    const first = await openSdkIdentity(path, seed);
    const saved = {
      ...seed,
      registeredId: "a".repeat(88),
      registeredAt: 1800000000100,
      refreshRequired: false,
      retryAt: 1800000900000,
    };
    try {
      await assertRejects(() => openSdkIdentity(path));
      await assertRejects(() =>
        first.save({ ...saved, bindingId: "0123456789abcdef" })
      );
      await assertRejects(() =>
        first.save({ ...saved, sessionId: "1800000000000-99999" })
      );
      await first.save(saved);
    } finally {
      first.close();
    }
    const restored = await openSdkIdentity(path);
    try {
      assertEquals(restored.read(), saved);
    } finally {
      restored.close();
    }
    await assertRejects(() => openSdkIdentity(path, seed));
    if (Deno.build.os !== "windows") {
      assertEquals(
        (await Deno.stat(path + "/identity.json")).mode! & 0o777,
        0o600,
      );
    }
  }));

Deno.test("SDK state rejects partial writes and never replaces a corrupted identity", () =>
  withDirectory(async (path) => {
    const store = await openSdkIdentity(path, createSdkIdentity());
    store.close();
    const file = path + "/identity.json";
    const original = await Deno.readTextFile(file);
    const changed = JSON.parse(original);
    changed.state.retryAt = 123;
    for (const invalid of ["", "{", "null", JSON.stringify(changed)]) {
      await Deno.writeTextFile(file, invalid);
      await assertRejects(() => openSdkIdentity(path));
      await assertRejects(() => openSdkIdentity(path, createSdkIdentity()));
      assertEquals(await Deno.readTextFile(file), invalid);
    }
  }));

Deno.test("CAPTCHA disk state survives restart, binds the identity and excludes verification receipts", () =>
  withDirectory(async (path) => {
    const identity = await openSdkIdentity(path, createSdkIdentity());
    try {
      const binding = identity.read().bindingId;
      const captcha = await openSdkCaptcha(path, binding);
      assertEquals(captcha.read(), null);
      const challenge = {
        id: crypto.randomUUID(),
        appId: "1234567890",
        postId: "123",
        createdAt: 1800000000000,
        attemptedAt: 0,
      };
      await captcha.save(challenge);
      assertEquals((await openSdkCaptcha(path, binding)).read(), challenge);
      await assertRejects(() => openSdkCaptcha(path, "f".repeat(16)));
      const file = path + "/captcha.json";
      const saved = JSON.parse(await Deno.readTextFile(file));
      assertEquals(Object.keys(saved.challenge).sort(), [
        "appId",
        "attemptedAt",
        "createdAt",
        "id",
        "postId",
      ]);
      await captcha.save(null);
      assertEquals((await openSdkCaptcha(path, binding)).read(), null);
      for (
        const invalid of [
          "",
          "{",
          "null",
          JSON.stringify({
            ...saved,
            challenge: { ...challenge, ticket: "private" },
          }),
        ]
      ) {
        await Deno.writeTextFile(file, invalid);
        await assertRejects(() => openSdkCaptcha(path, binding));
        assertEquals(await Deno.readTextFile(file), invalid);
      }
    } finally {
      identity.close();
    }
  }));
