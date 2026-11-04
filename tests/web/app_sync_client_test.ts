/** @file 验证本地队列可靠落盘、加密隔离、重启恢复和离线页面账号检查。 */
import { runInNewContext } from "node:vm";
import { IDBFactory } from "fake-indexeddb";
import { assert, assertEquals, assertRejects } from "@std/assert";

Deno.test("edits queued during an active sync upload immediately after that request", async () => {
  const source = await Deno.readTextFile(
    new URL("../../static/app-sync/client.js", import.meta.url),
  );
  const start = source.indexOf("  async function drain(reason)");
  const end = source.indexOf("  async function applyPendingRecords()", start);
  const functions = source.slice(start, source.lastIndexOf("  /**", end));
  const queue: Array<
    {
      kind: string;
      target: string;
      body: string;
      stamp: { operationId: string };
    }
  > = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  const submitted: string[] = [];
  const context = runInNewContext(
    `let flushing, requestedFlush; const responses = new Map(); ${functions}; ({flush, responses})`,
    {
      userId: "alice",
      metadata: {},
      URLSearchParams,
      AbortSignal,
      navigator: {},
      document: { dispatchEvent() {} },
      CustomEvent,
      compareStamp: () => 0,
      store: {
        pending: () => Promise.resolve([...queue]),
        writeState: () => Promise.resolve(),
        acknowledge: () => {
          queue.shift();
          return Promise.resolve();
        },
      },
      fetch: async (path: string) => {
        if (path === "/api/sync/session") {
          if (++requests === 1) await held;
          return Response.json({
            userId: "alice",
            serverTime: Date.now(),
            csrfToken: "test",
          });
        }
        submitted.push(path);
        return new Response("saved");
      },
    },
  );
  const first = context.flush();
  while (!requests) await new Promise((resolve) => setTimeout(resolve, 0));
  queue.push({
    kind: "record",
    target: "/matches/complete",
    body: "matchId=one",
    stamp: { operationId: "one" },
  });
  const second = context.flush("submit");
  context.flush();
  context.flush();
  release();
  await Promise.all([first, second]);
  assertEquals(submitted, ["/matches/complete"]);
  assertEquals(queue.length, 0);
  assertEquals(requests, 2);
  assertEquals(await context.responses.get("one").text(), "saved");
});

Deno.test("cached scripts survive service failures without hiding missing resources", async () => {
  const source = await Deno.readTextFile(
    new URL("../../static/app-sw.js", import.meta.url),
  );
  let status = 503;
  let saved = "cached-script";
  const api = runInNewContext(source + "\n({applicationResource})", {
    URL,
    Request,
    Response,
    Headers,
    self: { addEventListener() {} },
    fetch: () => Promise.resolve(new Response("online-resource", { status })),
    caches: {
      open: () =>
        Promise.resolve({
          match: () => Promise.resolve(new Response(saved)),
          put: async (_request: Request, response: Response) => {
            saved = await response.text();
          },
        }),
    },
  });
  const request = new Request("https://example.com/static/settings.js?v=1");
  assertEquals(
    await (await api.applicationResource(request)).text(),
    "cached-script",
  );
  assertEquals(saved, "cached-script");
  status = 404;
  assertEquals((await api.applicationResource(request)).status, 404);
  status = 200;
  assertEquals(
    await (await api.applicationResource(request)).text(),
    "online-resource",
  );
  assertEquals(saved, "online-resource");
});

Deno.test("worker resource messages accept only same-origin static URL strings", async () => {
  const source = await Deno.readTextFile(
    new URL("../../static/app-sw.js", import.meta.url),
  );
  const fetched: string[] = [];
  const api = runInNewContext(source + "\n({handleApplicationMessage})", {
    URL,
    Request,
    Response,
    self: {
      addEventListener() {},
      location: { origin: "https://example.com" },
    },
    fetch: (request: Request) => {
      fetched.push(request.url);
      return Promise.resolve(new Response("asset"));
    },
    caches: {
      open: () =>
        Promise.resolve({
          match: () => Promise.resolve(undefined),
          put: () => Promise.resolve(),
        }),
    },
  });
  const data = {
    type: "app-resources",
    urls: [
      null,
      42,
      ["/static/array.js"],
      {},
      "/static/settings.js",
      "https://other.example/static/app.js",
      "/settings",
      "http://[invalid",
      "/static/app.css",
    ],
  };
  await api.handleApplicationMessage({
    source: { url: "https://other.example/" },
    data,
  });
  assertEquals(fetched, []);
  await api.handleApplicationMessage({
    source: { url: "https://example.com/settings" },
    data,
  });
  assertEquals(fetched, [
    "https://example.com/static/settings.js",
    "https://example.com/static/app.css",
  ]);
});

Deno.test("worker navigation fetches online pages without AbortSignal.timeout", async () => {
  const timers: { callback: () => void; delay: number }[] = [];
  const requests: AbortSignal[] = [];
  const api = runInNewContext(
    await Deno.readTextFile(
      new URL("../../static/app-sw.js", import.meta.url),
    ) +
      "\n({applicationPage})",
    {
      URL,
      Request,
      Response,
      Headers,
      AbortController,
      AbortSignal: {},
      setTimeout(callback: () => void, delay: number) {
        timers.push({ callback, delay });
      },
      self: {
        addEventListener() {},
        AppLocalStore: {
          readState: () => Promise.resolve(undefined),
          writeState: () => Promise.resolve(),
          pending: () => Promise.resolve([]),
        },
      },
      fetch(input: string | Request, options?: RequestInit) {
        requests.push(
          input instanceof Request
            ? input.signal
            : options!.signal as AbortSignal,
        );
        return Promise.resolve(
          input === "/api/sync/session"
            ? Response.json({ userId: "alice" })
            : new Response("online-workspace"),
        );
      },
    },
  );
  const response = await api.applicationPage(
    new Request("https://example.com/"),
  );
  assertEquals(await response.text(), "online-workspace");
  assertEquals(timers.map((timer) => timer.delay), [10000, 5000]);
  assertEquals(requests.every((signal) => !signal.aborted), true);
  timers.forEach((timer) => timer.callback());
  assertEquals(requests.every((signal) => signal.aborted), true);
});

Deno.test("native navigation delegates the host User-Agent to the browser", async () => {
  const original = new Request("https://example.com/", {
    headers: { "user-agent": "legacy-host", accept: "text/html" },
    credentials: "include",
    cache: "no-cache",
  });
  Object.defineProperty(original, "headers", {
    value: new Map([["user-agent", "小黑盒话题提醒/3.13.3"], [
      "accept",
      "text/html",
    ]]),
  });
  let forwarded!: Request;
  const api = runInNewContext(
    await Deno.readTextFile(
      new URL("../../static/app-sw.js", import.meta.url),
    ) + "\n({fetchApplicationPage})",
    {
      Request,
      AbortSignal,
      self: { addEventListener() {} },
      fetch(request: Request) {
        forwarded = request;
        return Promise.resolve(new Response("page"));
      },
    },
  );
  await api.fetchApplicationPage(original);
  assertEquals(forwarded.headers.has("user-agent"), false);
  assertEquals(forwarded.headers.get("accept"), "text/html");
  assertEquals(forwarded.credentials, "include");
  assertEquals(forwarded.cache, "no-cache");
});

Deno.test("synchronous navigation request failures still use only verified account snapshots", async () => {
  const values = new Map<string, unknown>([["__device:active-user", "alice"], [
    "alice:page:/",
    { html: "alice-private" },
  ]]);
  let userId = "alice";
  const api = runInNewContext(
    await Deno.readTextFile(
      new URL("../../static/app-sw.js", import.meta.url),
    ) + "\n({applicationPage})",
    {
      URL,
      Response,
      Headers,
      AbortSignal,
      Request: class {
        /** 模拟原生宿主请求在浏览器克隆时同步抛错。 */
        constructor() {
          throw new TypeError("Failed to construct 'Request': Invalid value");
        }
      },
      self: {
        addEventListener() {},
        AppLocalStore: {
          readState: (user: string, key: string) =>
            Promise.resolve(values.get(`${user}:${key}`)),
          writeState: (user: string, key: string, value: unknown) => {
            values.set(`${user}:${key}`, value);
            return Promise.resolve();
          },
          pending: () => Promise.resolve([]),
        },
      },
      fetch: () => Promise.resolve(Response.json({ userId })),
    },
  );
  const request = new Request("https://example.com/");
  assertEquals(
    await (await api.applicationPage(request)).text(),
    "alice-private",
  );
  userId = "bob";
  await assertRejects(() => api.applicationPage(request), TypeError);
  assertEquals(values.get("__device:active-user"), "bob");
});

Deno.test("local sync queue encrypts snapshots and atomically survives reloads", async () => {
  const source = await Deno.readTextFile(
    new URL("../../static/app-sync/store.js", import.meta.url),
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

Deno.test("navigation starts the page request while identity is pending and still isolates fallback accounts", async () => {
  const source = await Deno.readTextFile(
    new URL("../../static/app-sw.js", import.meta.url),
  );
  let identity!: (response: Response) => void;
  let pageStarted = false;
  const values = new Map<string, unknown>([["__device:active-user", "alice"], [
    "alice:page:/settings",
    { html: "alice-private" },
  ]]);
  const api = runInNewContext(source + "\n({applicationPage})", {
    URL,
    Request,
    Response,
    Headers,
    AbortSignal,
    self: {
      addEventListener() {},
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
    fetch: (input: string | Request) => {
      if (input === "/api/sync/session") {
        return new Promise<Response>((resolve) => {
          identity = resolve;
        });
      }
      pageStarted = true;
      return Promise.reject(new Error("page unavailable"));
    },
  });
  const page = api.applicationPage(new Request("https://example.com/settings"));
  assertEquals(pageStarted, true);
  while (!identity) await new Promise((resolve) => setTimeout(resolve, 0));
  identity(Response.json({ userId: "bob" }));
  await assertRejects(() => page);
  assertEquals(values.get("__device:active-user"), "bob");
});

Deno.test("background page prefetch is coalesced, serial and rate limited per account", async () => {
  const source = await Deno.readTextFile(
    new URL("../../static/app-sw.js", import.meta.url),
  );
  const values = new Map<string, unknown>();
  let userId = "alice", pages = 0, active = 0, maximum = 0;
  const api = runInNewContext(source + "\n({handleApplicationMessage})", {
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
    fetch: async (input: string | Request) => {
      if (input === "/api/sync/session") return Response.json({ userId });
      pages++;
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active--;
      return new Response("page", { headers: { "x-app-user": userId } });
    },
  });
  const event = {
    source: { url: "https://example.com/settings" },
    data: { type: "app-pages" },
  };
  await Promise.all([
    api.handleApplicationMessage(event),
    api.handleApplicationMessage(event),
  ]);
  assertEquals(pages, 6);
  assertEquals(maximum, 1);
  await api.handleApplicationMessage(event);
  assertEquals(pages, 6);
  userId = "bob";
  await api.handleApplicationMessage(event);
  assertEquals(pages, 12);
});

Deno.test("offline page cache verifies account changes and media byte ranges", async () => {
  const source = await Deno.readTextFile(
    new URL("../../static/app-sw.js", import.meta.url),
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
