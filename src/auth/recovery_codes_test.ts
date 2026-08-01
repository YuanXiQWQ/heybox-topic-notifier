/**
 * @file 本文件验证一次性恢复码的生成、哈希与校验行为。
 */
import {
  createRecoveryCodes,
  hashRecoveryCodes,
  verifyRecoveryCodeHash,
} from "./recovery_codes.ts";
import { assertEquals } from "../test_helpers.ts";

Deno.test("recovery codes are unique and accept normalized input", async () => {
  const codes = createRecoveryCodes();
  const hashes = await hashRecoveryCodes(codes, "test-recovery-secret");

  assertEquals(codes.length, 8);
  assertEquals(new Set(codes).size, 8);
  assertEquals(
    codes.every((code) =>
      /^[2-9A-HJ-NP-Z]{4}(?:-[2-9A-HJ-NP-Z]{4}){2}$/.test(code)
    ),
    true,
  );
  assertEquals(hashes.length, 8);
  assertEquals(
    await verifyRecoveryCodeHash(
      codes[0].toLowerCase().replaceAll("-", " "),
      hashes[0],
      "test-recovery-secret",
    ),
    true,
  );
  assertEquals(
    await verifyRecoveryCodeHash(codes[0], hashes[0], "wrong-secret"),
    false,
  );
});
