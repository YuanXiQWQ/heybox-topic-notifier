/** @file 验证整页慢请求不会阻塞已认证切页，且账号、语言、回调与本地编辑保持隔离。 */
import { runInNewContext } from "node:vm";
import { IDBFactory } from "fake-indexeddb";
import { assert, assertEquals } from "@std/assert";

/**
 * 创建共享存储与真实 Fetch 类型的 Worker 场景，网络可以独立暂停。
 * @return {Promise<object>} 导航、会话与后台任务控制接口。
 */
async function harness() {
  const html = '<html data-app-page-cache="2" lang="zh-CN"><body>cached settings</body></html>';
  const values = new Map<string, unknown>([
    ["__device:active-user", "alice"],
    ["__device:navigation-clients", [["source", {userId: "alice", locale: "zh-CN"}]]],
    ["alice:page:/settings", {html, headers: [["x-app-user", "alice"]]}],
  ]);
  const background: Promise<unknown>[] = [], messages: object[] = [];
  let onlineUser = "alice";
  const onlineHtml = html.replace("cached settings", "online settings");
  let release!: () => void;
  let gate = new Promise<void>((resolve) => release = resolve);
  const source = await Deno.readTextFile(new URL("../../static/app-sw.js", import.meta.url));
  const context = {
    URL, Request, Response, Headers, AbortSignal,
    self: {
      addEventListener() {}, location: {origin: "https://example.com"},
      clients: {
        get: (id: string) => Promise.resolve(id === "source" ? {id, url: "https://example.com/"} : {postMessage: (message: object) => messages.push(message)}),
        matchAll: () => Promise.resolve([{id: "source", url: "https://example.com/"}]),
      },
      AppLocalStore: {
        readState: (user: string, name: string) => Promise.resolve(values.get(`${user}:${name}`)),
        writeState: (user: string, name: string, value: unknown) => { values.set(`${user}:${name}`, value); return Promise.resolve(); },
        pending: () => Promise.resolve([]),
      },
    },
    fetch: async (input: string | Request) => {
      await gate;
      return input === "/api/sync/session" ? Response.json({userId: onlineUser}) : new Response(onlineHtml, {headers: {"x-app-user": onlineUser}});
    },
  };
  let api = runInNewContext(source + "\n({applicationNavigation,clearApplicationSession})", context);
  return {
    values, background, messages,
    navigate: (path = "/settings", clientId = "source", cache: RequestCache = "default", referrer = "") => api.applicationNavigation({
      request: new Request("https://example.com" + path, {cache, referrer}), clientId, resultingClientId: "destination",
      waitUntil: (task: Promise<unknown>) => background.push(task),
    }) as Promise<Response>,
    clear: () => api.clearApplicationSession(),
    release: () => release(),
    changeUser: (user: string) => { onlineUser = user; },
    restart: () => { api = runInNewContext(source + "\n({applicationNavigation,clearApplicationSession})", {...context}); },
    online: () => { release(); gate = Promise.resolve(); },
  };
}

Deno.test("warm internal navigation and worker restart return cached HTML before page and session responses", async () => {
  const app = await harness();
  const response = await app.navigate();
  assert((await response.text()).includes("cached settings"));
  assertEquals(response.headers.get("x-app-offline"), "1");
  app.restart();
  assert((await (await app.navigate()).text()).includes("cached settings"));
  app.release();
  await Promise.all(app.background);
  assert(app.messages.length > 0);
  assert(JSON.stringify(app.values.get("alice:page:/settings")).includes("online settings"));
});

Deno.test("legacy WebView navigation uses only a live authenticated same-origin referrer when clientId is empty", async () => {
  const app = await harness();
  const response = await app.navigate("/settings", "", "default", "https://example.com/");
  assert((await response.text()).includes("cached settings"));
  app.release();
  await Promise.all(app.background);
  const external = await harness();
  let finished = false;
  const next = external.navigate("/settings", "", "default", "https://outside.example/").then((response) => {finished = true; return response;});
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(finished, false);
  external.online();
  assert((await (await next).text()).includes("online settings"));
  await Promise.all(external.background);
});

for (const condition of ["unbound", "logout", "other-account", "language", "callback", "reload", "old-page"]) {
  Deno.test(`navigation bypasses fast cache for ${condition}`, async () => {
    const app = await harness();
    if (condition === "logout") await app.clear();
    if (condition === "other-account") { app.values.set("__device:active-user", "bob"); app.changeUser("bob"); }
    if (condition === "language") app.values.set("alice:page:/settings", {html: '<html data-app-page-cache="2" lang="en-US">wrong language</html>'});
    if (condition === "old-page") app.values.set("alice:page:/settings", {html: '<html lang="zh-CN">old cache</html>'});
    let finished = false;
    const pending = app.navigate(condition === "callback" ? "/settings?recoveryCodes=once" : "/settings", condition === "unbound" ? "unknown" : "source", condition === "reload" ? "reload" : "default").then((response) => {finished = true; return response;});
    await new Promise((resolve) => setTimeout(resolve, 0));
    assertEquals(finished, false);
    app.online();
    const response = await pending;
    assert((await response.text()).includes("online settings"));
    assertEquals(response.headers.get("x-app-offline"), null);
    await Promise.all(app.background);
  });
}

Deno.test("background page writes cannot overwrite edits made after the request began, including after upload acknowledgement", async () => {
  const source = await Deno.readTextFile(new URL("../../static/app-sync/store.js", import.meta.url));
  const store = runInNewContext(source + "\nAppLocalStore", {indexedDB: new IDBFactory(), crypto, TextEncoder, TextDecoder, Uint8Array, structuredClone});
  await store.writeState("alice", "page:/settings", {html: "server before"});
  const startedAt = Date.now();
  await store.append("alice", {kind: "settings", stamp: {operationId: "edit"}}, "page:/settings", {html: "user draft"});
  await store.acknowledge("alice", "edit");
  assertEquals(await store.cachePage("alice", "page:/settings", {html: "stale response"}, startedAt), false);
  assertEquals((await store.readState("alice", "page:/settings")).html, "user draft");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assertEquals(await store.cachePage("alice", "page:/settings", {html: "new server"}, Date.now()), true);
  assertEquals((await store.readState("alice", "page:/settings")).html, "new server");
  assertEquals(await store.readState("bob", "page:/settings"), undefined);
});

Deno.test("logout remains final when an older authenticated write is already encrypting", async () => {
  let active: string|null = "alice", release!: () => void;
  const source = await Deno.readTextFile(new URL("../../static/app-sw.js", import.meta.url));
  const api = runInNewContext(source + "\n({setApplicationUser,clearApplicationSession})", {
    self: {addEventListener() {}, AppLocalStore: {
      readState: () => Promise.resolve([]),
      writeState: async (_user: string, key: string, value: string|null) => {
        if (key !== "active-user") return;
        if (value === "alice") await new Promise<void>((resolve) => release = resolve);
        active = value;
      },
    }},
  });
  const older = api.setApplicationUser("alice", 0);
  while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
  const logout = api.clearApplicationSession();
  release();
  await Promise.all([older, logout]);
  assertEquals(active, null);
  await api.setApplicationUser("alice", 0);
  assertEquals(active, null);
});
