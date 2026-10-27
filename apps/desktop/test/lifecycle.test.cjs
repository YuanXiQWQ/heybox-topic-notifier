/** @file 验证原生桥来源限制、分层更新提示和退出前的本地持久化屏障。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

/**
 * 以依赖替身执行真实主进程逻辑，不启动应用窗口或网络连接。
 * @return {object} 原生事件和受控窗口。
 */
function harness() {
  const handlers = new Map(), events = new Map();
  let installs = 0;
  let cookie = "session-a";
  let read = () => Promise.resolve({ userId: "alice", cursor: "", events: [] });
  let display = "show";
  const shown = [];
  const opened = [];
  const frame = {
    url: "https://heybox-topic-notifier.yuanxiqwq.deno.net/settings",
  };
  const contents = {
    mainFrame: frame,
    isDestroyed: () => false,
    executeJavaScript: async () => {},
    send: () => {},
  };
  const window = {
    webContents: contents,
    isDestroyed: () => false,
    loadURL: (url) => opened.push(url),
    isMinimized: () => false,
    show() {},
    focus() {},
  };
  const device = { value: {}, save: async () => {} };
  const app = {
    isPackaged: true,
    setAppUserModelId() {},
    enableSandbox() {},
    requestSingleInstanceLock: () => true,
    on: (name, fn) => events.set(name, fn),
    whenReady: () => new Promise(() => {}),
    getVersion: () => "1.0.0",
  };
  const electron = {
    app,
    Notification: class {
      /** @param {object} data 系统通知载荷。 */
      constructor(data) {
        this.data = data;
        this.events = new Map();
      }
      /** @return {boolean} 测试环境支持系统通知。 */
      static isSupported() {
        return true;
      }
      /** @param {string} name 事件名。 @param {Function} fn 处理器。 */
      on(name, fn) {
        this.events.set(name, fn);
      }
      /** @param {string} name 事件名。 @param {Function} fn 单次事件回调。 */
      once(name, fn) {
        this.on(name, fn);
      }
      /** 记录真实主进程请求展示的通知。 */
      show() {
        shown.push(this);
        if (display) this.events.get(display)?.();
      }
      /** 记录通知已经撤回。 */
      close() {
        this.closed = true;
      }
    },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    shell: {},
  };
  const filename = path.join(__dirname, "../main.cjs"),
    localRequire = createRequire(filename);
  const context = {
    require: (name) =>
      name === "electron"
        ? electron
        : name === "electron-updater"
        ? { autoUpdater: { quitAndInstall: () => installs++ } }
        : localRequire(name),
    process: { resourcesPath: "resources", env: {} },
    __dirname: path.dirname(filename),
    console,
    URL,
    setInterval,
    setTimeout,
    clearTimeout,
    AbortSignal,
  };
  const setup = vm.runInNewContext(
    fs.readFileSync(filename, "utf8") +
      "\n((w,d,s) => { window=w; device=d; webSession=s; update={status:'downloaded',version:'1.1.0'}; installBridge(); return {info,prepareExit,showWindow,consumeNotifications,setNotifications,disableNotifications}; })",
    context,
  );
  const api = setup(window, device, {
    cookies: { get: () => Promise.resolve(cookie ? [{ value: cookie }] : []) },
    fetch: () => Promise.resolve({ ok: true, json: () => read() }),
  });
  return {
    api,
    contents,
    device,
    handlers,
    event: { sender: contents, senderFrame: frame },
    installs: () => installs,
    shown,
    opened,
    changeCookie: (value) => {
      cookie = value;
    },
    readWith: (fn) => {
      read = fn;
    },
    displayWith: (event) => {
      display = event;
    },
  };
}

test("native update markers clear independently and reject subframes", async () => {
  const context = harness();
  assert.throws(() =>
    context.handlers.get("app:info")({
      ...context.event,
      senderFrame: { url: context.event.senderFrame.url },
    })
  );
  await context.handlers.get("app:seen-update")(context.event, "settings");
  assert.equal(context.api.info().update.settingsUnread, false);
  assert.equal(context.api.info().update.aboutUnread, true);
  await context.handlers.get("app:seen-update")(context.event, "about");
  assert.equal(context.api.info().update.aboutUnread, false);
  assert.equal(context.api.info().update.version, "1.1.0");
});

test("native navigation waits for local writes and stays on the editor when saving fails", async () => {
  const context = harness();
  let saved;
  context.contents.executeJavaScript = () =>
    new Promise((resolve) => {
      saved = resolve;
    });
  const navigation = context.api.showWindow("/about");
  assert.equal(context.opened.length, 0);
  saved();
  await navigation;
  assert.equal(context.opened.length, 1);
  context.contents.executeJavaScript = () => Promise.reject(new Error("Disk full"));
  await context.api.showWindow("/history");
  assert.equal(context.opened.length, 1);
});

test("notification cursor advances only after system display and failed events remain retryable", async () => {
  const context = harness();
  await context.api.setNotifications(true);
  context.readWith(() => ({
    userId: "alice",
    events: [{
      id: "one",
      cursor: "one",
      title: "Title",
      body: "Body",
      path: "/history",
    }],
  }));
  context.displayWith("");
  const pending = context.api.consumeNotifications();
  while (!context.shown.length) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(context.device.value.notifications.cursor, "");
  assert.equal(context.device.value.notifications.seen.length, 0);
  context.shown[0].events.get("failed")();
  await assert.rejects(() => pending, /Notification failed/);
  assert.equal(context.device.value.notifications.cursor, "");
  assert.equal(context.shown[0].closed, true);
  context.displayWith("show");
  await context.api.consumeNotifications();
  assert.equal(context.device.value.notifications.cursor, "one");
  assert.equal(context.shown.length, 2);
});

test("notification navigation rechecks the account after saving pending edits", async () => {
  const context = harness();
  await context.api.setNotifications(true);
  context.readWith(() => ({
    userId: "alice",
    events: [{
      id: "one",
      cursor: "one",
      title: "Title",
      body: "Body",
      path: "/history",
    }],
  }));
  await context.api.consumeNotifications();
  context.contents.executeJavaScript = () => {
    context.changeCookie("session-b");
    return Promise.resolve();
  };
  await context.shown[0].events.get("click")();
  assert.equal(context.opened.length, 0);
});

test("notification setup cannot bind a response from an account replaced during the request", async () => {
  const context = harness();
  context.readWith(() => {
    context.changeCookie("session-b");
    return { userId: "alice", cursor: "" };
  });
  await assert.rejects(
    () => context.api.setNotifications(true),
    /Authentication/,
  );
  assert.equal(context.api.info().notifications.enabled, false);
});

test("a delayed enable request cannot undo a newer disable action", async () => {
  const context = harness();
  context.readWith(async () => {
    await context.api.disableNotifications();
    return { userId: "alice", cursor: "" };
  });
  await assert.rejects(
    () => context.api.setNotifications(true),
    /Authentication/,
  );
  assert.equal(context.api.info().notifications.enabled, false);
});

test("notifications recheck the account after a pending request and before opening a clicked alert", async () => {
  const context = harness();
  await context.api.setNotifications(true);
  const event = {
    id: "event",
    cursor: "0000000000000001:event",
    title: "Private title",
    body: "Private body",
    path: "/history",
  };
  context.readWith(() => Promise.resolve({ userId: "alice", events: [event] }));
  await context.api.consumeNotifications();
  assert.equal(context.shown.length, 1);
  context.changeCookie("session-b");
  await context.shown[0].events.get("click")();
  assert.equal(context.opened.length, 0);

  context.changeCookie("session-a");
  context.readWith(() => {
    context.changeCookie("session-b");
    return { userId: "alice", events: [{ ...event, id: "second" }] };
  });
  await context.api.consumeNotifications();
  assert.equal(context.shown.length, 1);
  assert.equal(context.shown[0].closed, true);
});

test("installation waits for durable edits and aborts on storage failure", async () => {
  const context = harness();
  let release;
  context.contents.executeJavaScript = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = context.handlers.get("app:install-update")(context.event);
  assert.equal(context.installs(), 0);
  release();
  await pending;
  assert.equal(context.installs(), 1);
  const failing = harness();
  failing.contents.executeJavaScript = () =>
    Promise.reject(new Error("Disk full"));
  await assert.rejects(
    () => failing.handlers.get("app:install-update")(failing.event),
    /Disk full/,
  );
  assert.equal(failing.installs(), 0);
});
