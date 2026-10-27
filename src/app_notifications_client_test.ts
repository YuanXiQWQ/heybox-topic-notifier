/** @file 验证通知 Service Worker 的账号检查与安全跳转。 */
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
        selector === "[data-app-notifications-status]" ? status : toggle,
    },
    crypto,
    TextEncoder,
    Uint8Array,
    btoa,
    atob,
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

Deno.test("push worker suppresses notifications for a different logged-in account", async () => {
  const source = await Deno.readTextFile(
    new URL("../static/app-sw.js", import.meta.url),
  );
  const shown: unknown[] = [];
  const opened: string[] = [];
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
        matchAll: () => Promise.resolve([]),
        openWindow: (url: string) => {
          opened.push(url);
          return Promise.resolve();
        },
      },
    },
    URL,
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
    path: "https://evil.example/phishing",
  });
  await api.openApplicationNotification({ path: "/history" });
  assertEquals(opened, ["https://example.com/", "https://example.com/history"]);
});
