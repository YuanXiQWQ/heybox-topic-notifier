/** @file 为桌面主进程集成测试提供独立的 Electron 会话、设备和窗口。 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {EventEmitter} = require('node:events');

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
  const updater = options.updater || {
    quitAndInstall: (...options) => {
      installs++;
      installOptions.push(options);
    }, downloadUpdate: () => {
      downloads++;
      return Promise.resolve();
    }, on: (name, fn) => updaterEvents.set(name, fn)
  };
  let cookie = 'session-a';
  let read = () => Promise.resolve({userId: 'alice', cursor: '', events: []});
  let display = 'show';
  const shown = [];
  const opened = [];
  const frame = {
    url: 'https://heybox.yuanxiqwq.top/settings',
  };
  const contents = {
    mainFrame: frame,
    isDestroyed: () => false,
    executeJavaScript: async () => {
    },
    send: () => {
    },
  };
  const window = {
    webContents: contents,
    isDestroyed: () => false,
    loadURL: (url) => opened.push(url),
    isMinimized: () => false,
    show() {
    },
    focus() {
    },
  };
  const device = {
    value: {autoUpdate: false}, save: async () => {
    }
  };
  const app = {
    isPackaged: true,
    setAppUserModelId() {
    },
    enableSandbox() {
    },
    requestSingleInstanceLock: () => true,
    on: (name, fn) => events.set(name, fn),
    whenReady: () => new Promise(() => {
    }),
    getVersion: () => '1.0.0',
    getLoginItemSettings: () => ({openAtLogin: app.login === true}),
    setLoginItemSettings: (value) => {
      app.login = value.openAtLogin;
    },
    getPath: () => 'C:/App/notifier.exe',
    setJumpList: (value) => {
      app.jumpList = value;
    },
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

      /**
       * @param {string} name 事件名。
       * @param {Function} fn 处理器。
       */
      on(name, fn) {
        this.events.set(name, fn);
      }

      /**
       * @param {string} name 事件名。
       * @param {Function} fn 单次事件回调。
       */
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
    ipcMain: {handle: (name, fn) => handlers.set(name, fn)},
    shell: {},
    screen: {getDisplayMatching: () => ({workAreaSize: {width: 1024, height: 768}})},
  };
  const filename = path.join(__dirname, '../../main.cjs'),
      localRequire = createRequire(filename);
  const context = {
    require: (name) =>
        name === 'electron'
            ? electron
            : name === './update-cache.cjs'
                ? {repairUpdateCache: options.repairUpdateCache || (() => Promise.resolve(cacheReady))}
                : name === 'electron-updater'
                    ? {autoUpdater: updater}
                    : localRequire(name),
    process: {resourcesPath: 'resources', env: {}},
    __dirname: path.dirname(filename),
    console,
    URL,
    setInterval,
    setTimeout,
    clearTimeout,
    AbortSignal,
  };
  const setup = vm.runInNewContext(
      fs.readFileSync(filename, 'utf8') +
      `
      ((w, d, s) => {
        window = w;
        device = d;
        webSession = s;
        update = {status: 'downloaded', version: '1.1.0'};
        const inbox = createNotificationInbox({
          webSession, device, origin, Notification, icon: path.join(resources, 'favicon.png'), emitState, showWindow,
        });
        installBridge(inbox);
        return {
          inbox, checkUpdate, downloadUpdate, info, prepareExit, showWindow, setPreferences,
          handleWindowClose, resetWindow, installUpdater, installJumpList, handleLaunchAction,
          markConfirmedResume(value) { confirmedResumeDigest = value; update.status = 'idle'; },
          markCachedUpdate() { installCachedUpdateOnStart = true; },
        };
      })
      `,
      context,
  );
  const cookies = new EventEmitter();
  cookies.get = () => Promise.resolve(cookie ? [{value: cookie}] : []);
  const api = setup(window, device, {
    cookies,
    fetch: () => Promise.resolve({ok: true, json: () => read()}),
  });
  return {
    api, app, window, updater, updaterEvents, setCacheReady: value => {
      cacheReady = value;
    }, downloads: () => downloads, quitting: () => quitting,
    contents,
    device,
    handlers,
    event: {sender: contents, senderFrame: frame},
    installs: () => installs,
    installOptions,
    shown,
    cookies,
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

module.exports = {harness};
