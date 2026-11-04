/** @file 验证认证读取只在同一请求内合并，账号撤销和不同认证配置仍重新检查。 */
import { assertEquals } from "@std/assert";
import { readAuthSessionForRequest } from "./session.ts";

Deno.test("request authentication coalesces checks without caching revoked sessions across requests", async () => {
  let reads = 0;
  let active = true;
  const storage = {
    getSession: () => {
      reads++;
      return Promise.resolve(
        active
          ? {
            tokenHash: "test",
            userId: "alice",
            username: "alice",
            createdAt: "2026-01-01T00:00:00Z",
            expiresAt: "2099-01-01T00:00:00Z",
          }
          : undefined,
      );
    },
    getAccountById: () =>
      Promise.resolve({
        id: "alice",
        username: "alice",
        createdAt: "2026-01-01T00:00:00Z",
      }),
    saveSession: () => Promise.resolve(),
    deleteSession: () => Promise.resolve(),
  };
  const request = new Request("https://example.com/", {
    headers: { cookie: "heybox_session=test" },
  });
  const values = await Promise.all(
    Array.from(
      { length: 3 },
      () => readAuthSessionForRequest(request, storage),
    ),
  );
  assertEquals(values.map((value) => value?.userId), [
    "alice",
    "alice",
    "alice",
  ]);
  assertEquals(reads, 1);
  active = false;
  assertEquals(
    await readAuthSessionForRequest(request.clone(), storage),
    undefined,
  );
  assertEquals(reads, 2);
  await readAuthSessionForRequest(request, { ...storage });
  assertEquals(reads, 3);
  assertEquals(
    await readAuthSessionForRequest(request, storage, {
      cookieName: "different",
    }),
    undefined,
  );
});
