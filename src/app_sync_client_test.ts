/** @file 验证本地队列可靠落盘、加密隔离、重启恢复和离线页面账号检查。 */
import { runInNewContext } from "node:vm";
import { IDBFactory } from "fake-indexeddb";
import { assert, assertEquals, assertRejects } from "@std/assert";

Deno.test("cached scripts survive service failures without hiding missing resources", async () => {
  const source = await Deno.readTextFile(new URL("../static/app-sw.js", import.meta.url));
  let status = 503;
  let saved = "cached-script";
  const api = runInNewContext(source + "\n({applicationResource})", {
    URL, Request, Response, Headers,
    self: { addEventListener() {} },
    fetch: () => Promise.resolve(new Response("online-resource", { status })),
    caches: { open: () => Promise.resolve({
      match: () => Promise.resolve(new Response(saved)),
      put: async (_request: Request, response: Response) => { saved = await response.text(); },
    }) },
  });
  const request = new Request("https://example.com/static/settings.js?v=1");
  assertEquals(await (await api.applicationResource(request)).text(), "cached-script");
  assertEquals(saved, "cached-script");
  status = 404;
  assertEquals((await api.applicationResource(request)).status, 404);
  status = 200;
  assertEquals(await (await api.applicationResource(request)).text(), "online-resource");
  assertEquals(saved, "online-resource");
});

Deno.test("worker navigation fetches online pages without AbortSignal.timeout", async () => {
  const timers: { callback: () => void; delay: number }[] = [];
  const requests: AbortSignal[] = [];
  const api = runInNewContext(
    await Deno.readTextFile(new URL("../static/app-sw.js", import.meta.url)) + "\n({applicationPage})",
    {
      URL, Request, Response, Headers, AbortController,
      AbortSignal: {},
      setTimeout(callback: () => void, delay: number) { timers.push({ callback, delay }); },
      self: { addEventListener() {}, AppLocalStore: {
        readState: () => Promise.resolve(undefined),
        writeState: () => Promise.resolve(),
        pending: () => Promise.resolve([]),
      } },
      fetch(input: string | Request, options?: RequestInit) {
        requests.push(input instanceof Request ? input.signal : options!.signal as AbortSignal);
        return Promise.resolve(input === "/api/sync/session"
          ? Response.json({ userId: "alice" })
          : new Response("online-workspace"));
      },
    },
  );
  const response = await api.applicationPage(new Request("https://example.com/"));
  assertEquals(await response.text(), "online-workspace");
  assertEquals(timers.map((timer) => timer.delay), [5000, 10000]);
  assertEquals(requests.every((signal) => !signal.aborted), true);
  timers.forEach((timer) => timer.callback());
  assertEquals(requests.every((signal) => signal.aborted), true);
});

Deno.test("local sync queue encrypts snapshots and atomically survives reloads", async () => {
  const source = await Deno.readTextFile(
    new URL("../static/app-sync/store.js", import.meta.url),
  );
  const indexedDB = new IDBFactory();
  const globals = {
    indexedDB,
    crypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    structuredClone,
  };
  const store = runInNewContext(source + "\nAppLocalStore", globals);
  const first = {
    stamp: { operationId: "one", editedAt: 1000 },
    body: "private-secret",
    target: "/settings",
  };
  await store.append("alice", first, "page", { html: "private-page" });
  assertEquals(structuredClone(await store.pending("alice")), [first]);
  assertEquals(structuredClone(await store.pending("bob")), []);
  assertEquals(await store.readState("bob", "page"), undefined);
  await assertRejects(() =>
    store.append("alice", first, "page", { html: "must-not-commit" })
  );
  assertEquals(structuredClone(await store.readState("alice", "page")), {
    html: "private-page",
  });
  const reopened = runInNewContext(source + "\nAppLocalStore", { ...globals });
  assertEquals(structuredClone(await reopened.pending("alice")), [first]);
  await reopened.acknowledge("alice", "one");
  assertEquals(structuredClone(await store.pending("alice")), []);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("heybox-app-local", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const raw = await new Promise<unknown[]>((resolve, reject) => {
    const request = database.transaction("state").objectStore("state").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert(!JSON.stringify(raw).includes("private-page"));
  assert(!JSON.stringify(raw).includes("private-secret"));
  database.close();
});

Deno.test("offline page cache verifies account changes and media byte ranges", async () => {
  const source = await Deno.readTextFile(
    new URL("../static/app-sw.js", import.meta.url),
  );
  const values = new Map<string, unknown>([["__device:active-user", "alice"], [
    "alice:page:/settings",
    { html: "alice-private" },
  ]]);
  const scope = {
    URL,
    Request,
    Response,
    Headers,
    AbortSignal,
    self: {
      addEventListener() {},
      location: { origin: "https://example.com" },
      AppLocalStore: {
        readState: (user: string, name: string) =>
          Promise.resolve(values.get(`${user}:${name}`)),
        writeState: (user: string, name: string, value: unknown) => {
          values.set(`${user}:${name}`, value);
          return Promise.resolve();
        },
        pending: () => Promise.resolve([]),
      },
    },
    fetch: (_request: unknown): Promise<Response> =>
      Promise.reject(new Error("offline")),
  };
  const api = runInNewContext(
    source + "\n({applicationPage, rangeResponse})",
    scope,
  );
  const request = new Request("https://example.com/settings");
  assertEquals(
    await (await api.applicationPage(request)).text(),
    "alice-private",
  );
  scope.fetch = (input) =>
    input === "/api/sync/session"
      ? Promise.resolve(Response.json({ userId: "bob" }))
      : Promise.reject(new Error("offline"));
  await assertRejects(() => api.applicationPage(request));
  assertEquals(values.get("__device:active-user"), "bob");
  const partial = await api.rangeResponse(
    new Request("https://example.com/static/video.mp4", {
      headers: { range: "bytes=2-4" },
    }),
    new Response(new Uint8Array([0, 1, 2, 3, 4, 5])),
  );
  assertEquals(partial.status, 206);
  assertEquals(partial.headers.get("content-range"), "bytes 2-4/6");
  assertEquals([...new Uint8Array(await partial.arrayBuffer())], [2, 3, 4]);
});
