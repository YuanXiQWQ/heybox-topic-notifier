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
  const frame = {
    url: "https://heybox-topic-notifier.yuanxiqwq.deno.net/settings",
  };
  const contents = {
    mainFrame: frame,
    isDestroyed: () => false,
    executeJavaScript: async () => {},
    send: () => {},
  };
  const window = { webContents: contents, isDestroyed: () => false };
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
    Notification: { isSupported: () => true },
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
    AbortSignal,
  };
  const setup = vm.runInNewContext(
    fs.readFileSync(filename, "utf8") +
      "\n((w,d) => { window=w; device=d; update={status:'downloaded',version:'1.1.0'}; installBridge(); return {info,prepareExit}; })",
    context,
  );
  const api = setup(window, device);
  return {
    api,
    contents,
    device,
    handlers,
    event: { sender: contents, senderFrame: frame },
    installs: () => installs,
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
