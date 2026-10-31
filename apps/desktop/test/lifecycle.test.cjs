/** @file 验证原生桥来源限制、分层更新提示和退出前的本地持久化屏障。 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

/**
 * 以依赖替身执行真实主进程逻辑，不启动应用窗口或网络连接。
 * @param {object} options 可选真实更新器与缓存校验器。
 * @return {object} 原生事件和受控窗口。
 */
function harness(options = {}) {
  const handlers = new Map(), events = new Map();
  let cacheReady = true;
  let installs = 0, downloads = 0, quitting = 0;
  const installOptions = [];
  const updaterEvents = new Map();
  const updater = options.updater || { quitAndInstall: (...options) => { installs++; installOptions.push(options); }, downloadUpdate: () => { downloads++; return Promise.resolve(); }, on: (name, fn) => updaterEvents.set(name, fn) };
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
    getLoginItemSettings: () => ({openAtLogin: app.login === true}),
    setLoginItemSettings: (value) => { app.login = value.openAtLogin; },
    getPath: () => "C:/App/notifier.exe",
    setJumpList: (value) => { app.jumpList = value; },
    quit: () => quitting++,
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
    screen: {getDisplayMatching: () => ({workAreaSize: {width: 1024, height: 768}})},
  };
  const filename = path.join(__dirname, "../main.cjs"),
    localRequire = createRequire(filename);
  const context = {
    require: (name) =>
      name === "electron"
        ? electron
        : name === "./update-cache.cjs"
        ? {repairUpdateCache: options.repairUpdateCache || (() => Promise.resolve(cacheReady))}
        : name === "electron-updater"
        ? { autoUpdater: updater }
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
      "\n((w,d,s) => { window=w; device=d; webSession=s; update={status:'downloaded',version:'1.1.0'}; installBridge(); return {checkUpdate,markConfirmedResume:(value)=>{confirmedResumeDigest=value;update.status='idle';},downloadUpdate,markCachedUpdate:()=>{installCachedUpdateOnStart=true;},info,prepareExit,showWindow,consumeNotifications,setNotifications,disableNotifications,setPreferences,handleWindowClose,resetWindow,installUpdater,installJumpList,handleLaunchAction}; })",
    context,
  );
  const api = setup(window, device, {
    cookies: { get: () => Promise.resolve(cookie ? [{ value: cookie }] : []) },
    fetch: () => Promise.resolve({ ok: true, json: () => read() }),
  });
  return {
    api, app, window, updater, updaterEvents, setCacheReady: value => { cacheReady=value; }, downloads: () => downloads, quitting: () => quitting,
    contents,
    device,
    handlers,
    event: { sender: contents, senderFrame: frame },
    installs: () => installs,
    installOptions,
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

test("a rolled-back release cannot auto-install again or hide its update warning", async () => {
  const context = harness();
  context.device.value.autoUpdate = true;
  context.device.value.failedUpdateVersion = "1.1.0";
  context.api.installUpdater();
  context.updaterEvents.get("update-available")({version:"1.1.0"});
  assert.equal(context.updater.autoDownload, false);
  assert.equal(context.updater.autoInstallOnAppQuit, false);
  assert.equal(context.api.info().update.status, "error");
  assert.equal(context.api.info().update.silent, false);
  assert.equal(context.api.info().update.prompt, true);
  await context.api.setPreferences({autoUpdate:true});
  assert.equal(context.downloads(), 0);
  context.updaterEvents.get("update-available")({version:"1.2.0"});
  assert.equal(context.updater.autoDownload, true);
  assert.equal(context.updater.autoInstallOnAppQuit, false);
  await context.updaterEvents.get("update-downloaded")();
  assert.equal(context.updater.autoInstallOnAppQuit, true);
});

test("explicit retry re-enables download after a rollback without changing the auto-update preference", async () => {
  const context = harness();
  context.device.value.autoUpdate = false;
  context.device.value.failedUpdateVersion = "1.1.0";
  context.api.installUpdater();
  context.updaterEvents.get("update-available")({version:"1.1.0"});
  await context.handlers.get("app:download-update")(context.event);
  assert.equal(context.device.value.failedUpdateVersion, undefined);
  assert.equal(context.device.value.autoUpdate, false);
  assert.equal(context.downloads(), 1);
  assert.equal(context.updater.autoInstallOnAppQuit, true);
});

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

test("restart update waits for durable edits, skips the wizard and relaunches; storage failure aborts", async () => {
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
  assert.deepEqual(context.installOptions, [[true, true]]);
  const failing = harness();
  failing.contents.executeJavaScript = () =>
    Promise.reject(new Error("Disk full"));
  await assert.rejects(
    () => failing.handlers.get("app:install-update")(failing.event),
    /Disk full/,
  );
  assert.equal(failing.installs(), 0);
});


test("device preferences validate input and use the Windows startup state", async () => {
  const context = harness();
  await assert.rejects(context.api.setPreferences({path: "untrusted"}));
  await assert.rejects(context.api.setPreferences({closeAction: "hide"}));
  await assert.rejects(context.api.setPreferences({launchAtLogin: "yes"}));
  await context.api.setPreferences({closeAction: "quit", launchAtLogin: true});
  assert.equal(context.api.info().preferences.closeAction, "quit");
  assert.equal(context.api.info().preferences.launchAtLogin, true);
  context.app.login = false;
  assert.equal(context.api.info().preferences.launchAtLogin, false);
});

test("window reset fits the active monitor and taskbar tasks restrict navigation", async () => {
  const context = harness(), calls = [];
  Object.assign(context.window, {isMaximized: () => true, unmaximize: () => calls.push("unmaximize"), getBounds: () => ({}), setSize: (...size) => calls.push(size), center: () => calls.push("center")});
  context.api.resetWindow();
  assert.deepEqual(calls, ["unmaximize", [1024, 768], "center"]);
  context.api.installJumpList();
  assert.deepEqual(Array.from(context.app.jumpList[0].items, item => item.args || item.type), ["--app-open=/", "--app-open=/settings", "--app-open=/history", "separator", "--app-quit"]);
  context.api.handleLaunchAction(["--app-open=https://untrusted.example"]);
  assert.equal(context.opened.length, 0);
  context.api.handleLaunchAction(["--app-open=/settings"]);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(context.opened[0], /\/settings$/);
  context.api.handleLaunchAction(["--app-quit"]);
  assert.equal(context.quitting(), 1);
});

test("automatic downloads suppress reminders and failures restore manual recovery", async () => {
  const context = harness();
  context.api.installUpdater();
  await context.api.setPreferences({autoUpdate: true});
  context.updaterEvents.get("update-available")({version: "1.2.0"});
  assert.equal(context.updater.autoDownload, true);
  assert.equal(context.api.info().update.silent, true);
  assert.equal(context.api.info().update.settingsUnread, false);
  await context.updaterEvents.get("update-downloaded")();
  assert.equal(context.device.value.autoUpdateReady, "1.2.0");
  assert.equal(context.installs(), 0);
  assert.equal(context.updater.autoInstallOnAppQuit, true);
  await context.api.setPreferences({autoUpdate:false});
  assert.equal(context.updater.autoInstallOnAppQuit,false);
  await context.api.setPreferences({autoUpdate:true});
  context.updaterEvents.get("error")();
  assert.equal(context.api.info().update.silent, false);
  assert.equal(context.api.info().update.prompt, true);
  context.device.save = () => Promise.reject(new Error("disk full"));
  await context.updaterEvents.get("update-downloaded")();
  assert.equal(context.api.info().update.status, "error");
});


test("closing hides to tray, restores the window, and preserves the chosen exit action", async () => {
  const context = harness();
  let hidden=0, shown=0, prevented=0;
  context.window.hide=()=>hidden++;
  context.window.show=()=>shown++;
  context.window.minimize=()=>assert.fail("Closing must hide the window instead of minimizing it");
  const event={preventDefault:()=>prevented++};
  context.api.handleWindowClose(event);
  assert.equal(hidden,1);
  assert.equal(context.quitting(),0);
  await context.api.showWindow();
  assert.equal(shown,1);
  await context.api.setPreferences({closeAction:"minimize"});
  context.api.handleWindowClose(event);
  assert.equal(hidden,2);
  await context.api.setPreferences({closeAction:"quit"});
  context.api.handleWindowClose(event);
  assert.equal(context.quitting(),1);
  assert.equal(hidden,2);
  assert.equal(prevented,3);
  context.device.save=()=>Promise.reject(new Error("disk full"));
  await assert.rejects(context.api.setPreferences({closeAction:"minimize"}));
  assert.equal(context.api.info().preferences.closeAction,"quit");
});


test("cached automatic update waits for local writes before restarting on the next launch", async () => {
  const context = harness();
  context.api.installUpdater();
  await context.api.setPreferences({autoUpdate:true});
  let release;
  context.contents.executeJavaScript=()=>new Promise(resolve=>{release=resolve;});
  context.updaterEvents.get("update-available")({version:"1.2.0"});
  context.api.markCachedUpdate();
  const downloaded=context.updaterEvents.get("update-downloaded")();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(context.installs(),0);
  release();
  await downloaded;
  assert.equal(context.installs(),1);
  assert.deepEqual(context.installOptions, [[true, true]]);
});


test("normal exit cancels and awaits an unfinished download before cleaning the cache", async () => {
  const context=harness();
  let cancelled=false, cleaned=false;
  context.updater.downloadUpdate=token=>new Promise((_resolve,reject)=>{token.onCancel(()=>{cancelled=true;setImmediate(()=>{cleaned=true;reject(new Error("cancelled"));});});});
  const transfer=context.api.downloadUpdate().catch(()=>{});
  await context.api.prepareExit();
  await transfer;
  assert.equal(cancelled,true);
  assert.equal(cleaned,true);
  await assert.rejects(context.api.downloadUpdate(),/closing/);
});

test("installation refuses a corrupt cache and disables automatic installation", async () => {
  const context=harness();
  context.setCacheReady(false);
  await assert.rejects(context.handlers.get("app:install-update")(context.event),/incomplete/);
  assert.equal(context.installs(),0);
  assert.equal(context.updater.autoInstallOnAppQuit,false);
});

test("startup restores both automatic download and installation preferences", () => {
  for (const enabled of [false, true]) {
    const context = harness();
    context.device.value.autoUpdate = enabled;
    context.updater.autoInstallOnAppQuit = !enabled;
    context.api.installUpdater();
    assert.equal(context.updater.autoDownload, enabled);
    assert.equal(context.updater.autoInstallOnAppQuit, enabled);
  }
});

test("enabling automatic updates after download registers quit installation using the complete cache", async () => {
  const context = harness();
  context.api.installUpdater();
  await context.updaterEvents.get("update-downloaded")();
  assert.equal(context.device.value.autoUpdateReady, undefined);
  let registered = false, reused = 0;
  context.updater.downloadUpdate = async () => {
    reused++;
    await context.updaterEvents.get("update-downloaded")();
    registered = context.updater.autoInstallOnAppQuit;
  };
  await context.api.setPreferences({autoUpdate:true});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reused, 1);
  assert.equal(registered, true);
  assert.equal(context.device.value.autoUpdateReady, "1.1.0");
  assert.equal(context.api.info().update.status, "downloaded");
  assert.equal(context.api.info().update.silent, true);
  await context.api.setPreferences({closeAction:"quit"});
  assert.equal(reused, 1);
});

test("startup resumes confirmed downloads only when the official newer release has the same digest", async () => {
  for (const [available, digest, downloads] of [[false,"confirmed",0],[true,"different",0],[true,"confirmed",1]]) {
    const context=harness();
    context.api.markConfirmedResume("confirmed");
    context.updater.checkForUpdates=()=>Promise.resolve({isUpdateAvailable:available,updateInfo:{files:[{sha512:digest}]}});
    await context.api.checkUpdate();
    assert.equal(context.downloads(),downloads);
    if (downloads) assert.equal(context.updater.autoInstallOnAppQuit,true);
  }
});

test("checking after downloading and dismissing a release discovers the latest release", async () => {
  const context = harness();
  context.api.installUpdater();
  context.updaterEvents.get("update-available")({version:"3.10.12"});
  await context.handlers.get("app:download-update")(context.event);
  await context.updaterEvents.get("update-downloaded")();
  await context.handlers.get("app:seen-update")(context.event, "dismissed");
  let checks = 0;
  context.updater.checkForUpdates = async () => {
    checks++;
    const updateInfo = {version:"3.11.0"};
    context.updaterEvents.get("update-available")(updateInfo);
    return {isUpdateAvailable:true, updateInfo};
  };
  const state = await context.api.checkUpdate();
  assert.equal(checks, 1);
  assert.equal(state.update.version, "3.11.0");
  assert.equal(state.update.status, "available");
  assert.equal(state.update.prompt, true);
  assert.equal(context.downloads(), 1);
  assert.equal(context.updater.autoInstallOnAppQuit, false);
  await assert.rejects(context.handlers.get("app:install-update")(context.event), /not ready/);
  await context.api.setPreferences({closeAction:"quit"});
  await context.api.prepareExit();
  assert.equal(context.updater.autoInstallOnAppQuit, false);
  assert.equal(context.installs(), 0);
});

test("a recheck of the same downloaded release reuses the downloader and keeps restart available", async () => {
  const context = harness();
  context.api.installUpdater();
  context.updater.checkForUpdates = async () => {
    const updateInfo = {version:"1.1.0"};
    context.updaterEvents.get("update-available")(updateInfo);
    return {isUpdateAvailable:true, updateInfo};
  };
  let reused = 0;
  context.updater.downloadUpdate = async () => {
    reused++;
    await context.updaterEvents.get("update-downloaded")();
  };
  const state = await context.api.checkUpdate();
  assert.equal(reused, 1);
  assert.equal(state.update.version, "1.1.0");
  assert.equal(state.update.status, "downloaded");
});

test("a withdrawn release clears pending prompts and cannot install the cached old package", async () => {
  const context = harness();
  context.device.value.autoUpdate = true;
  context.device.value.autoUpdateReady = "1.1.0";
  context.device.value.updateVersion = "1.1.0";
  context.api.installUpdater();
  context.updater.checkForUpdates = async () => {
    context.updaterEvents.get("update-not-available")();
    return {isUpdateAvailable:false};
  };
  const state = await context.api.checkUpdate();
  assert.equal(state.update.status, "current");
  assert.equal(state.update.version, undefined);
  assert.equal(state.update.prompt, false);
  assert.equal(context.device.value.autoUpdateReady, undefined);
  assert.equal(context.device.value.updateVersion, undefined);
  await context.api.prepareExit();
  assert.equal(context.updater.autoInstallOnAppQuit, false);
});

test("failed rechecks report failure instead of claiming the downloaded release is latest", async () => {
  const context = harness();
  context.api.installUpdater();
  context.updater.checkForUpdates = async () => { throw new Error("offline"); };
  assert.equal((await context.api.checkUpdate()).update.status, "error");
  assert.equal(context.updater.autoInstallOnAppQuit, false);
  assert.equal(context.downloads(), 0);
});

test("simultaneous rechecks share a request while an active download is not interrupted", async () => {
  const context = harness();
  context.api.installUpdater();
  let complete, checks = 0;
  context.updater.checkForUpdates = () => {
    checks++;
    return new Promise(resolve => { complete = resolve; });
  };
  const first = context.api.checkUpdate();
  const second = context.api.checkUpdate();
  assert.equal(first, second);
  complete({isUpdateAvailable:false});
  await first;
  context.updaterEvents.get("download-progress")({percent:50});
  assert.equal((await context.api.checkUpdate()).update.status, "downloading");
  assert.equal(checks, 1);
});

test("a newer automatic download cannot trigger the previous cached startup restart", async () => {
  const context = harness();
  context.device.value.autoUpdate = true;
  context.device.value.autoUpdateReady = "1.1.0";
  context.api.installUpdater();
  context.api.markCachedUpdate();
  context.updater.checkForUpdates = async () => {
    const updateInfo = {version:"1.2.0"};
    context.updaterEvents.get("update-available")(updateInfo);
    assert.equal(context.updater.autoInstallOnAppQuit, false);
    assert.equal(context.device.value.autoUpdateReady, undefined);
    return {isUpdateAvailable:true, updateInfo, downloadPromise:Promise.resolve(), cancellationToken:{cancel(){}}};
  };
  await context.api.checkUpdate();
  await context.updaterEvents.get("update-downloaded")();
  assert.equal(context.device.value.autoUpdateReady, "1.2.0");
  assert.equal(context.updater.autoInstallOnAppQuit, true);
  assert.equal(context.installs(), 0);
});

test("real NSIS updater replaces a deferred release while preserving same-release cache reuse", async () => {
  const { NsisUpdater } = require("electron-updater/out/NsisUpdater");
  const { DownloadedUpdateHelper } = require("electron-updater/out/DownloadedUpdateHelper");
  const { repairUpdateCache } = require("../update-cache.cjs");
  const { createHash } = require("node:crypto");
  const os = require("node:os");
  const disk = fs.promises;
  const root = await disk.mkdtemp(path.join(os.tmpdir(), "heybox-recheck-test-"));
  try {
    let version = "3.10.12", checks = 0, transfers = 0;
    const quits = [], installed = [];
    const updater = new NsisUpdater(null, {
      version:"3.10.11", isPackaged:true, onQuit:callback => quits.push(callback),
    });
    updater.logger = {info(){}, warn(){}, error(){}, debug(){}};
    updater.downloadedUpdateHelper = new DownloadedUpdateHelper(root);
    updater.disableDifferentialDownload = true;
    /** @return {Promise<object>} 隔离发行源的当前清单。 */
    updater.getUpdateInfoAndProvider = async () => {
      checks++;
      const bytes = Buffer.from(`isolated installer ${version}`);
      const file = {url:"setup.exe", sha512:createHash("sha512").update(bytes).digest("base64"), size:bytes.length};
      return {
        info:{version, files:[file]},
        provider:{resolveFiles:info => info.files.map(item => ({url:new URL(item.url,"https://updates.invalid/"), info:item}))},
      };
    };
    updater.httpExecutor = {
      /** @param {URL} url 隔离下载地址。 @param {string} target 临时安装包路径。 */
      async download(url, target) {
        assert.equal(url.hostname, "updates.invalid");
        transfers++;
        await disk.writeFile(target, `isolated installer ${version}`);
      },
    };
    /** @return {Promise<null>} 隔离测试数据不执行发行签名检查。 */
    updater.verifySignature = async () => null;
    /** @return {boolean} 记录待安装文件，禁止运行测试数据。 */
    updater.doInstall = () => { installed.push(fs.readFileSync(updater.installerPath,"utf8")); return true; };
    const context = harness({updater, repairUpdateCache});
    context.api.installUpdater();
    assert.equal((await context.api.checkUpdate()).update.version, "3.10.12");
    await context.handlers.get("app:download-update")(context.event);
    await context.handlers.get("app:seen-update")(context.event,"dismissed");
    assert.equal((await context.api.checkUpdate()).update.status,"downloaded");
    assert.equal(transfers,1);
    assert.equal(await repairUpdateCache(updater),true);
    version = "3.11.0";
    const next = await context.api.checkUpdate();
    assert.equal(checks,3);
    assert.equal(next.update.version,version);
    assert.equal(next.update.status,"available");
    assert.equal(next.update.prompt,true);
    assert.equal(updater.autoInstallOnAppQuit,false);
    for (const quit of quits) quit(0);
    assert.deepEqual(installed,[]);
    await context.handlers.get("app:download-update")(context.event);
    assert.equal(context.api.info().update.status,"downloaded");
    assert.equal(transfers,2);
    assert.equal(await repairUpdateCache(updater),true);
    assert.equal(updater.downloadedUpdateHelper.versionInfo.version,version);
    await context.api.prepareExit();
    for (const quit of quits) quit(0);
    assert.deepEqual(installed,["isolated installer 3.11.0"]);
  } finally {
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    assert.match(path.basename(root),/^heybox-recheck-test-/);
    await disk.rm(root,{recursive:true,force:true});
  }
});
