/** @file 验证通知开关的初始化反馈、失败重试、权限请求和 Service Worker 的账号隔离。 */
import { runInNewContext } from "node:vm";
import { assertEquals } from "./test_helpers.ts";

/** 测试通知行需要的最小可见控件。 */
class NotificationControl {
  checked = false;
  disabled = true;
  hidden = true;
  textContent = "";
  title = "";
  value = "csrf-test";
  dataset = {
    unsupported: "unsupported",
    unavailable: "unavailable",
    denied: "denied",
    failed: "failed",
    loading: "loading",
    unconfigured: "unconfigured",
  };
  listener?: (event: { stopPropagation(): void }) => Promise<void>;
  /**
   * 保存测试中触发的控件监听器。
   * @param {string} _name 事件名称。
   * @param {(event: {stopPropagation(): void}) => Promise<void>} listener 回调。
   */
  addEventListener(
    _name: string,
    listener: (event: { stopPropagation(): void }) => Promise<void>,
  ) {
    this.listener = listener;
  }
}

Deno.test("browser notification switch reflects server state and preserves state after failed saves", async () => {
  const source = (await Deno.readTextFile(
    new URL("../static/app-notifications.js", import.meta.url),
  ))
    .replace("void initializeApplicationNotifications();", "");
  const toggle = new NotificationControl();
  const status = new NotificationControl();
  const retry = new NotificationControl();
  let saveAllowed = false;
  let saves = 0;
  const subscription = {
    endpoint: "https://fcm.googleapis.com/push/test",
    toJSON: () => ({ endpoint: "test" }),
  };
  const registration = {
    pushManager: { getSubscription: () => Promise.resolve(subscription) },
  };
  const scope = {
    isSecureContext: true,
    HTMLInputElement: NotificationControl,
    HTMLElement: NotificationControl,
    PushManager: {},
    Notification: {
      permission: "granted",
      requestPermission: () => Promise.resolve("denied"),
    },
    navigator: {
      serviceWorker: {
        register: () => Promise.resolve(registration),
        ready: Promise.resolve(registration),
      },
    },
    document: {
      querySelector: (selector: string) =>
        selector === "[data-app-notifications-status]"
          ? status
          : selector === "[data-app-notifications-retry]"
          ? retry
          : toggle,
    },
    crypto,
    TextEncoder,
    Uint8Array,
    btoa,
    atob,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    fetch: (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        saves++;
        return Promise.resolve(
          new Response(null, { status: saveAllowed ? 200 : 503 }),
        );
      }
      return Promise.resolve(
        Response.json({
          userId: "alice",
          publicKey: "test",
          enabled: url.includes("?device="),
        }),
      );
    },
  };
  const initialize = runInNewContext(
    source + "\ninitializeApplicationNotifications",
    scope,
  );
  await initialize();
  assertEquals(toggle.checked, true);
  assertEquals(toggle.disabled, false);
  toggle.checked = false;
  await toggle.listener!({ stopPropagation() {} });
  assertEquals(toggle.checked, true);
  assertEquals(status.textContent, "failed");
  saveAllowed = true;
  toggle.checked = false;
  await toggle.listener!({ stopPropagation() {} });
  assertEquals(toggle.checked, false);
  assertEquals(status.hidden, true);
  toggle.checked = true;
  await toggle.listener!({ stopPropagation() {} });
  assertEquals(toggle.checked, false);
  assertEquals(status.textContent, "denied");
  assertEquals(saves, 2);
});

/**
 * 提供独立的浏览器通知环境，记录权限、订阅和提交；初始化超时由测试显式触发。
 * @param {Record<string, unknown>} overrides 替换的浏览器能力或原生桥。
 * @return {Promise<object>} 可操控的页面控件、环境与初始化入口。
 */
async function notificationFixture(overrides: Record<string, unknown> = {}) {
  const source = (await Deno.readTextFile(
    new URL("../static/app-notifications.js", import.meta.url),
  )).replace("void initializeApplicationNotifications();", "");
  const toggle = new NotificationControl();
  const status = new NotificationControl();
  const retry = new NotificationControl();
  const calls = { permissions: 0, subscriptions: 0, saves: 0, reads: 0 };
  const timers = new Set<() => void>();
  const config = { publicKey: "AQID", userId: "alice", enabled: false };
  const subscription = {
    endpoint: "https://fcm.googleapis.com/push/test",
    toJSON: () => ({ endpoint: "test" }),
  };
  const registration = {
    pushManager: {
      getSubscription: () => Promise.resolve(null),
      subscribe: () => {
        calls.subscriptions++;
        return Promise.resolve(subscription);
      },
    },
  };
  const scope = {
    HTMLInputElement: NotificationControl,
    HTMLElement: NotificationControl,
    isSecureContext: true,
    PushManager: {},
    Notification: {
      permission: "default",
      requestPermission: () => {
        calls.permissions++;
        return Promise.resolve("granted");
      },
    },
    navigator: {
      serviceWorker: {
        register: () => Promise.resolve(registration),
        ready: Promise.resolve(registration),
      },
    },
    document: {
      querySelector: (selector: string) =>
        selector === "[data-app-notifications-status]"
          ? status
          : selector === "[data-app-notifications-retry]"
          ? retry
          : toggle,
      addEventListener() {},
    },
    fetch: (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") calls.saves++;
      else calls.reads++;
      return Promise.resolve(Response.json(config));
    },
    crypto,
    TextEncoder,
    Uint8Array,
    btoa,
    atob,
    AbortController,
    AbortSignal,
    setTimeout: (callback: () => void) => {
      timers.add(callback);
      return callback;
    },
    clearTimeout: (callback: () => void) => timers.delete(callback),
    ...overrides,
  };
  const initialize = runInNewContext(
    source + "\ninitializeApplicationNotifications",
    scope,
  );
  return {
    toggle,
    status,
    retry,
    calls,
    config,
    registration,
    scope,
    timers,
    initialize,
  };
}

Deno.test("missing push configuration is visible and retry restores a working switch without prompting", async () => {
  const f = await notificationFixture();
  f.config.publicKey = "";
  await f.initialize();
  assertEquals(f.status.textContent, "unconfigured");
  assertEquals(f.status.hidden, false);
  assertEquals(f.toggle.disabled, true);
  assertEquals(f.retry.hidden, false);
  assertEquals(f.calls.permissions, 0);
  f.config.publicKey = "AQID";
  await f.retry.listener!({ stopPropagation() {} });
  assertEquals(f.toggle.disabled, false);
  assertEquals(f.retry.hidden, true);
  assertEquals(f.status.hidden, true);
  assertEquals(f.calls.permissions, 0);
  f.toggle.checked = true;
  const change = f.toggle.listener!({ stopPropagation() {} });
  // 权限调用必须发生在点击事件同步阶段，不能排在初始化网络等待之后。
  assertEquals(f.calls.permissions, 1);
  await change;
  assertEquals(f.calls.subscriptions, 1);
  assertEquals(f.calls.saves, 1);
  assertEquals(f.toggle.checked, true);
  assertEquals(f.toggle.disabled, false);
  assertEquals(f.status.hidden, true);
  assertEquals(f.timers.size, 0);
});

Deno.test("unsupported browsers show a visible explanation without offering an ineffective retry", async () => {
  for (
    const overrides of [
      { isSecureContext: false },
      { navigator: {} },
    ]
  ) {
    const f = await notificationFixture(overrides);
    await f.initialize();
    assertEquals(f.status.textContent, "unsupported");
    assertEquals(f.status.hidden, false);
    assertEquals(f.toggle.disabled, true);
    assertEquals(f.retry.hidden, true);
    assertEquals(f.calls.reads, 0);
  }
});

Deno.test("configuration requests and service worker failures remain visible and retryable", async () => {
  for (const failure of ["network", "http", "registration"]) {
    const f = await notificationFixture();
    const fetcher = f.scope.fetch;
    const register = f.scope.navigator.serviceWorker.register;
    if (failure === "network") {
      f.scope.fetch = () => Promise.reject(new Error("offline"));
    }
    if (failure === "http") {
      f.scope.fetch = () =>
        Promise.resolve(new Response(null, { status: 503 }));
    }
    if (failure === "registration") {
      f.scope.navigator.serviceWorker.register = () =>
        Promise.reject(new Error("worker"));
    }
    await f.initialize();
    assertEquals(f.status.textContent, "unavailable");
    assertEquals(f.status.hidden, false);
    assertEquals(f.retry.hidden, false);
    f.scope.fetch = fetcher;
    f.scope.navigator.serviceWorker.register = register;
    await f.retry.listener!({ stopPropagation() {} });
    assertEquals(f.toggle.disabled, false);
    assertEquals(f.status.hidden, true);
  }
});

Deno.test("worker activation timeout releases the UI and a late result cannot overwrite retry state", async () => {
  const f = await notificationFixture();
  let release!: (value: typeof f.registration) => void;
  f.scope.navigator.serviceWorker.ready = new Promise((resolve) => {
    release = resolve;
  });
  const initializing = f.initialize();
  assertEquals(f.status.textContent, "loading");
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const timeout of f.timers) timeout();
  await initializing;
  assertEquals(f.status.textContent, "unavailable");
  assertEquals(f.retry.hidden, false);
  f.config.publicKey = "";
  await f.retry.listener!({ stopPropagation() {} });
  release(f.registration);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(f.status.textContent, "unconfigured");
  assertEquals(f.toggle.disabled, true);
  assertEquals(f.calls.permissions, 0);
  assertEquals(f.timers.size, 0);
});

Deno.test("native initialization failure can retry through the native bridge without browser push", async () => {
  const ready = Promise.reject(new Error("bridge"));
  void ready.catch(() => {});
  const f = await notificationFixture({
    applicationNativeReady: ready,
    appNative: {
      info: () =>
        Promise.resolve({ notifications: { enabled: false, supported: true } }),
      notifications: (enabled: boolean) =>
        Promise.resolve({ notifications: { enabled, supported: true } }),
    },
  });
  await f.initialize();
  assertEquals(f.status.textContent, "unavailable");
  assertEquals(f.retry.hidden, false);
  await f.retry.listener!({ stopPropagation() {} });
  assertEquals(f.toggle.disabled, false);
  f.toggle.checked = true;
  await f.toggle.listener!({ stopPropagation() {} });
  assertEquals(f.toggle.checked, true);
  assertEquals(f.calls.reads, 0);
  assertEquals(f.calls.permissions, 0);
});

Deno.test("push worker suppresses notifications for a different logged-in account", async () => {
  const source = await Deno.readTextFile(
    new URL("../static/app-sw.js", import.meta.url),
  );
  const shown: unknown[] = [];
  const opened: string[] = [];
  const windows: {
    url: string;
    focus: () => Promise<void>;
    navigate: () => Promise<void>;
  }[] = [];
  let focused = 0, navigated = 0;
  const scope = {
    self: {
      addEventListener() {},
      location: { origin: "https://example.com" },
      registration: {
        showNotification: (...args: unknown[]) => {
          shown.push(args);
          return Promise.resolve();
        },
      },
      clients: {
        matchAll: () => Promise.resolve(windows),
        openWindow: (url: string) => {
          opened.push(url);
          return Promise.resolve();
        },
      },
    },
    URL,
    AbortSignal,
    fetch: () =>
      Promise.resolve(Response.json({ userId: "alice", enabled: true })),
  };
  const api = runInNewContext(
    source + "\n({ showApplicationNotification, openApplicationNotification })",
    scope,
  );
  const payload = {
    title: "test",
    body: "private",
    tag: "test",
    path: "/",
    userId: "bob",
    deviceId: "device",
  };
  await api.showApplicationNotification({ data: { json: () => payload } });
  assertEquals(shown.length, 0);
  await api.showApplicationNotification({
    data: { json: () => ({ ...payload, userId: "alice" }) },
  });
  assertEquals(shown.length, 1);
  scope.fetch = () =>
    Promise.resolve(Response.json({ userId: "alice", enabled: false }));
  await api.showApplicationNotification({
    data: { json: () => ({ ...payload, userId: "alice" }) },
  });
  assertEquals(shown.length, 1);
  await api.openApplicationNotification({
    userId: "alice",
    deviceId: "device",
    path: "https://evil.example/phishing",
  });
  assertEquals(opened, []);
  scope.fetch = () =>
    Promise.resolve(Response.json({ userId: "alice", enabled: true }));
  windows.push({
    url: "https://example.com/settings",
    focus: () => {
      focused++;
      return Promise.resolve();
    },
    navigate: () => {
      navigated++;
      return Promise.resolve();
    },
  });
  await api.openApplicationNotification({
    userId: "alice",
    deviceId: "device",
    path: "https://evil.example/phishing",
  });
  await api.openApplicationNotification({
    userId: "alice",
    deviceId: "device",
    path: "/history",
  });
  assertEquals(opened, ["https://example.com/", "https://example.com/history"]);
  assertEquals(navigated, 0);
  windows[0].url = "https://example.com/history";
  await api.openApplicationNotification({
    userId: "alice",
    deviceId: "device",
    path: "/history",
  });
  assertEquals(focused, 1);
  assertEquals(opened.length, 2);
  scope.fetch = () =>
    Promise.resolve(Response.json({ userId: "bob", enabled: true }));
  await api.openApplicationNotification({
    userId: "alice",
    deviceId: "device",
    path: "/history",
  });
  assertEquals(focused, 1);
});
