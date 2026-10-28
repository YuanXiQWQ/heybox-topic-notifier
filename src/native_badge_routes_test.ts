/** @file 验证工作区角标接口的认证、账号隔离和计数来源。 */
import { assertEquals } from "@std/assert";
import { createRoutes } from "./routes.ts";
import { createKvStorage } from "./storage/kv.ts";
import { defaultAppSettingsFromEnv } from "./services/default_settings.ts";
import { sessionTokenHash } from "./auth/session.ts";
import type { AppContext } from "./services/app_context.ts";

Deno.test("native badge counts only authenticated pending posts, not history or notification events", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const storage = createKvStorage(defaultAppSettingsFromEnv(), {openKv: () => Promise.resolve(kv)});
    const app = createRoutes({storage} as AppContext);
    const now = new Date().toISOString();
    for (const userId of ["alice", "bob"]) {
      await storage.saveSession({tokenHash:await sessionTokenHash(userId),userId,username:userId,createdAt:now,expiresAt:new Date(Date.now()+60000).toISOString()});
      await storage.forUser(userId).saveMatch({id:userId,keyword:"help",location:"title",matchedAt:now,post:{id:userId,title:"help",body:"",excerpt:"",comments:[],commentReplies:[],url:"https://example.com",publishedAt:now}});
    }
    const alice = storage.forUser("alice");
    await alice.nativeNotifications!.save({id:await sessionTokenHash("test"),cursor:"",createdAt:Date.now(),title:"test",body:"notification only",path:"/"});
    assertEquals((await app.request("/api/native/badge")).status,401);
    const pending = await app.request("/api/native/badge",{headers:{cookie:"heybox_session=alice"}});
    assertEquals(pending.headers.get("cache-control"),"no-store");
    assertEquals(await pending.json(),{userId:"alice",count:1});
    await alice.completeMatches(["alice"]);
    assertEquals(await (await app.request("/api/native/badge",{headers:{cookie:"heybox_session=alice"}})).json(),{userId:"alice",count:0});
    assertEquals(await (await app.request("/api/native/badge",{headers:{cookie:"heybox_session=bob"}})).json(),{userId:"bob",count:1});
  } finally { kv.close(); }
});
