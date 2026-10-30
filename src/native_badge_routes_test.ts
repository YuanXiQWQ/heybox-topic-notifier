/** @file 验证工作区角标接口的认证、账号隔离和计数来源。 */
import { assertEquals } from "@std/assert";
import { createRoutes } from "./routes.ts";
import { createKvStorage } from "./storage/kv.ts";
import { defaultAppSettingsFromEnv } from "./services/default_settings.ts";
import { sessionTokenHash } from "./auth/session.ts";
import type { AppContext } from "./services/app_context.ts";
import { createTursoStorage } from "./storage/turso.ts";
import { MemorySqlClient } from "./storage/sqlite_test_helpers.ts";
import type { Storage } from "./storage/types.ts";

Deno.test("native badge counts only authenticated pending posts, not history or notification events", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const storage = createKvStorage(defaultAppSettingsFromEnv(), {openKv: () => Promise.resolve(kv)});
    const app = createRoutes({storage} as AppContext);
    const now = new Date().toISOString();
    for (const userId of ["alice", "bob"]) {
      await storage.saveAccount({id:userId,username:userId,createdAt:now});
      await storage.saveSession({tokenHash:await sessionTokenHash(userId),userId,username:userId,createdAt:now,expiresAt:new Date(Date.now()+60000).toISOString()});
      await storage.forUser(userId).saveMatch({id:userId,keyword:"help",location:"title",matchedAt:now,post:{id:userId,title:"help",body:"",excerpt:"",comments:[],commentReplies:[],url:"https://example.com",publishedAt:now}});
    }
    const alice = storage.forUser("alice");
    await alice.nativeNotifications!.save({id:await sessionTokenHash("test"),cursor:"",createdAt:Date.now(),title:"test",body:"notification only",path:"/"});
    assertEquals((await app.request("/api/native/badge")).status,401);
    const pending = await app.request("/api/native/badge",{headers:{cookie:"heybox_session=alice"}});
    assertEquals(pending.headers.get("cache-control"),"no-store");
    assertEquals(await pending.json(),{userId:"alice",count:1});
    const snapshot=await app.request("/api/native/badge?records=1",{headers:{cookie:"heybox_session=alice"}});
    assertEquals(await snapshot.json(),{userId:"alice",count:1,records:[{id:"alice",postId:"alice"}]});
    const fallback = await app.request("/api/native/badge?records=1&version=alice:1", {headers:{cookie:"heybox_session=alice"}});
    assertEquals(await fallback.json(), {userId:"alice",count:1,records:[{id:"alice",postId:"alice"}]});
    await alice.completeMatches(["alice"]);
    assertEquals(await (await app.request("/api/native/badge",{headers:{cookie:"heybox_session=alice"}})).json(),{userId:"alice",count:0});
    assertEquals(await (await app.request("/api/native/badge",{headers:{cookie:"heybox_session=bob"}})).json(),{userId:"bob",count:1});
  } finally { kv.close(); }
});

Deno.test("native combined polling authenticates once, preserves pagination and isolates channel failures", async () => {
  const client = new MemorySqlClient();
  try {
    const storage = createTursoStorage(defaultAppSettingsFromEnv(), { client });
    const now = new Date().toISOString();
    for (const userId of ["alice", "bob"]) {
      await storage.saveAccount({id:userId,username:userId,createdAt:now});
      await storage.saveSession({tokenHash:await sessionTokenHash(userId),userId,username:userId,createdAt:now,expiresAt:new Date(Date.now()+60000).toISOString()});
    }
    const alice = storage.forUser("alice");
    await alice.saveMatch({id:"a",keyword:"help",location:"title",matchedAt:now,post:{id:"post",title:"help",body:"",excerpt:"",comments:[],commentReplies:[],url:"https://example.com",publishedAt:now}});
    for (let i = 0; i < 101; i++) await alice.nativeNotifications!.save({id:await sessionTokenHash(`event-${i}`),cursor:"",createdAt:Date.now(),title:"test",body:"notification only",path:"/"});
    let authReads = 0, badgeFails = false, inboxFails = false;
    const wrapped: Storage = {
      ...storage,
      /** @param {string} hash 会话摘要。 @return {ReturnType<Storage["getSession"]>} 会话记录。 */
      getSession(hash) { authReads++; return storage.getSession(hash); },
      /** @param {string} userId 账号。 @return {ReturnType<Storage["forUser"]>} 可单独模拟两路故障的真实存储。 */
      forUser(userId) {
        const user = storage.forUser(userId);
        return {
          ...user,
          /** @return {Promise<string>} 当前版本。 */
          getDashboardVersion() { if (badgeFails) throw new Error("private database failure"); return user.getDashboardVersion!(); },
          nativeNotifications: {
            ...user.nativeNotifications!,
            /** @param {string | undefined} after 已消费游标。 @return {ReturnType<NonNullable<typeof user.nativeNotifications>["read"]>} 原生事件批次。 */
            read(after) { if (inboxFails) throw new Error("private inbox failure"); return user.nativeNotifications!.read(after); },
          },
        };
      },
    };
    const app = createRoutes({storage:wrapped} as AppContext);
    const headers = {cookie:"heybox_session=alice"};
    assertEquals((await app.request("/api/native/notifications?badge=1")).status,401);
    assertEquals((await app.request("/api/native/notifications?badge=1&after=invalid",{headers})).status,400);
    authReads = 0;
    const response = await app.request("/api/native/notifications?badge=1&after=", {headers});
    assertEquals(authReads,1);
    assertEquals(response.headers.get("cache-control"),"no-store");
    const first = await response.json();
    assertEquals(first.events.length,100);
    assertEquals(first.badge.count,1);
    const second = await (await app.request(`/api/native/notifications?after=${encodeURIComponent(first.cursor)}`,{headers})).json();
    assertEquals(second.events.length,1);
    assertEquals(second.badge,undefined);
    const unchanged = await (await app.request(`/api/native/notifications?badge=1&after=${encodeURIComponent(second.cursor)}&badgeVersion=${encodeURIComponent(first.badge.version)}`,{headers})).json();
    assertEquals(unchanged.events,[]);
    assertEquals(unchanged.badge,{userId:"alice",version:first.badge.version,unchanged:true});
    const foreign = await (await app.request(`/api/native/notifications?badge=1&after=&badgeVersion=${encodeURIComponent(first.badge.version)}`,{headers:{cookie:"heybox_session=bob"}})).json();
    assertEquals(foreign.events,[]);
    assertEquals(foreign.badge.userId,"bob");
    assertEquals(foreign.badge.records,[]);
    badgeFails = true;
    const badgeFailure = await (await app.request("/api/native/notifications?badge=1&after=",{headers})).json();
    assertEquals(badgeFailure.events.length,100);
    assertEquals(badgeFailure.badge,{error:"unavailable"});
    badgeFails = false; inboxFails = true;
    const inboxFailure = await (await app.request("/api/native/notifications?badge=1&after=",{headers})).json();
    assertEquals(inboxFailure.error,"unavailable");
    assertEquals(inboxFailure.events,undefined);
    assertEquals(inboxFailure.badge.count,1);
    badgeFails = true;
    const bothFailed = await (await app.request("/api/native/notifications?badge=1&after=",{headers})).json();
    assertEquals(bothFailed,{userId:"alice",error:"unavailable",badge:{error:"unavailable"}});
  } finally { client.close(); }
});
