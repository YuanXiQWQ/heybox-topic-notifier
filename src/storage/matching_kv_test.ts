/** @file 使用真实内存 KV 检查判定缓存的租约与有界持久化。 */
import { createKvMatchingStore } from "./matching_kv.ts";
import { verifyMatchingStore } from "./matching_store_test_helpers.ts";

Deno.test("KV matching cache isolates leases and bounds pending storage", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    await verifyMatchingStore(
      createKvMatchingStore(() => Promise.resolve(kv), "one"),
      createKvMatchingStore(() => Promise.resolve(kv), "two"),
    );
  } finally {
    kv.close();
  }
});
