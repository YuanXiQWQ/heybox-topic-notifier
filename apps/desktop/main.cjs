/** @file 管理 Windows 窗口、托盘、系统通知、离线资源和 Release 自动更新。 */
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  Notification,
  ipcMain,
  nativeImage,
  net,
  powerMonitor,
  safeStorage,
  session,
  shell,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { applicationOrigin, assetPath, externalUrl } = require("./policy.cjs");
const { deviceState } = require("./state.cjs");
const { browserLogin } = require("./login.cjs");
const config = require("./config.json");

/** 固定来源在发行构建时配置；开发预览只允许显式指定回环服务。 */
const origin = applicationOrigin(
  !app.isPackaged && process.env.HEYBOX_PREVIEW_ORIGIN || config.origin,
  !app.isPackaged,
);
/** 安装资源包含完整彩蛋，离线时无需再次下载。 */
const resources = app.isPackaged
  ? path.join(process.resourcesPath, "static")
  : path.resolve(__dirname, "../generated/static");
/** 主窗口保持驻留，使关窗后托盘仍可接收通知。 */
let window;
/** 托盘引用必须保持存活。 */
let tray;
/** 设备私有持久状态。 */
let device;
/** 应用会话保留 Cookie、IndexedDB 和 Service Worker。 */
let webSession;
/** 显式退出或更新时允许关闭最后一个窗口。 */
let quitting = false;
/** 防止重复退出事件同时执行持久化屏障。 */
let preparingExit;
/** 通知轮询与更新检查各自合并并发触发。 */
let polling;
let checking;
/** 设备开关变更序号使旧的开启请求不能覆盖较新的关闭操作。 */
let notificationRevision = 0;
/** 当前会话展示的通知，退出登录时撤回。 */
const visibleNotifications = new Set();
/** 原生更新进度不依赖服务器部署版本。 */
let update = { status: "idle", version: undefined, progress: 0 };

app.setAppUserModelId("io.github.yuanxiqwq.heyboxnotifier");
app.enableSandbox();
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => showWindow());
  app.on("before-quit", (event) => {
    if (quitting || !window || window.isDestroyed()) return;
    event.preventDefault();
    preparingExit ??= prepareExit().then(() => {
      quitting = true;
      app.quit();
    }).catch(() => {
      showWindow();
    }).finally(() => {
      preparingExit = undefined;
    });
  });
  app.on("window-all-closed", () => {});
  void app.whenReady().then(start).catch((error) => {
    console.error("Application startup failed:", error.message);
    app.quit();
  });
}

/**
 * 等待页面本地事务，保存失败时保持窗口以便用户重试。
 * @return {Promise<void>} 可以退出或安装更新。
 */
async function prepareExit() {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }
  await window.webContents.executeJavaScript(
    "globalThis.applicationSync?.prepareForExit()",
    true,
  );
}

/**
 * 启动受隔离的应用会话和托盘，不向渲染页面开放 Node 权限。
 * @return {Promise<void>} 初始化完成。
 */
async function start() {
  device = await deviceState(app.getPath("userData"), safeStorage);
  if (
    device.value.updateVersion &&
    newerVersion(device.value.updateVersion, app.getVersion())
  ) update.version = device.value.updateVersion;
  else {
    delete device.value.updateVersion;
    await device.save();
  }
  webSession = session.fromPartition("persist:heybox-app");
  await installAssets();
  webSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  );
  webSession.setPermissionCheckHandler(() => false);
  webSession.cookies.on("changed", (_event, cookie, _cause, removed) => {
    if (
      cookie.name === "heybox_session" &&
      (removed ||
        device.value.notifications?.session !== cookieFingerprint(cookie.value))
    ) void disableNotifications();
  });
  window = new BrowserWindow({
    width: 1200,
    height: 840,
    minWidth: 360,
    minHeight: 480,
    show: false,
    title: "小黑盒话题提醒",
    webPreferences: {
      session: webSession,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });
  window.removeMenu();
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (externalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== origin) {
      event.preventDefault();
      if (externalUrl(url)) void shell.openExternal(url);
    }
  });
  window.webContents.on(
    "will-attach-webview",
    (event) => event.preventDefault(),
  );
  window.webContents.on("did-finish-load", () => emitState());
  const icon = nativeImage.createFromPath(path.join(resources, "favicon.png"));
  tray = new Tray(icon.resize({ width: 20, height: 20 }));
  tray.setToolTip("小黑盒话题提醒");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "打开",
        click: () => showWindow(),
      },
      {
        label: "检查更新",
        click: () => {
          showWindow("/about");
          void checkUpdate();
        },
      },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ]),
  );
  tray.on("double-click", () => showWindow());
  installBridge();
  installUpdater();
  powerMonitor.on("resume", () => {
    void pollNotifications();
    void checkUpdate();
  });
  setInterval(() => void pollNotifications(), 15000).unref();
  setInterval(() => void checkUpdate(), 6 * 60 * 60 * 1000).unref();
  await window.loadURL(origin + "/").catch(() => {});
  void pollNotifications();
  void checkUpdate();
}

/**
 * 在服务不可达时读取同路径安装资源，脚本在线时优先跟随当前网页版本。
 * @return {Promise<void>} 协议处理器就绪。
 */
async function installAssets() {
  const scheme = new URL(origin).protocol.slice(0, -1);
  await webSession.protocol.handle(scheme, async (request) => {
    const local = assetPath(resources, request.url, origin);
    if (local) {
      const script = /\.(?:js|css|json)$/.test(local);
      if (script) {
        try {
          const response = await webSession.fetch(request, {
            bypassCustomProtocolHandlers: true,
          });
          if (response.ok) return response;
        } catch { /* 离线脚本使用安装包版本。 */ }
      }
      try {
        if ((await fs.stat(local)).isFile()) {
          return await net.fetch(pathToFileURL(local).href, {
            headers: request.headers,
          });
        }
      } catch { /* 未打包的资源继续由本站处理。 */ }
    }
    return webSession.fetch(request, { bypassCustomProtocolHandlers: true });
  });
}

/**
 * 验证 IPC 仅来自本窗口可信顶层页面，拒绝子框架和其它来源。
 * @param {object} event IPC 发送者。
 */
function authorize(event) {
  if (
    event.sender !== window?.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    new URL(event.senderFrame.url).origin !== origin
  ) throw new Error("Untrusted application frame");
}
/**
 * 注册固定原生功能，页面只能调用有限的业务能力。
 */
function installBridge() {
  /**
   * 为每个处理器统一验证调用来源。
   * @param {string} name 通道。
   * @param {Function} handler 处理器。
   */
  function handle(name, handler) {
    ipcMain.handle(name, (event, ...args) => {
      authorize(event);
      return handler(...args);
    });
  }
  handle("app:info", info);
  handle(
    "app:sign-in",
    browserLogin({
      origin,
      session: webSession,
      openExternal: (url) => shell.openExternal(url),
      complete: () => showWindow("/"),
    }),
  );
  handle("app:notifications", setNotifications);
  handle("app:check-update", checkUpdate);
  handle("app:download-update", async () => {
    if (update.status !== "available" && update.status !== "error") {
      throw new Error("No update available");
    }
    update.status = "downloading";
    emitState();
    try {
      await autoUpdater.downloadUpdate();
    } catch {
      update.status = "error";
      emitState();
    }
    return info();
  });
  handle("app:install-update", async () => {
    if (update.status !== "downloaded") throw new Error("Update not ready");
    await prepareExit();
    quitting = true;
    autoUpdater.quitAndInstall(false, true);
  });
  handle("app:seen-update", async (section) => {
    if (!["settings", "about", "dismissed"].includes(section)) {
      throw new Error("Invalid update section");
    }
    device.value["updateSeen_" + section] = update.version;
    if (section === "about") device.value.updateSeen_settings = update.version;
    await device.save();
    emitState();
    return info();
  });
}

/**
 * 返回当前设备能力和更新层级标记，不泄露会话、文件路径或通知正文。
 * @return {object} 页面可见状态。
 */
function info() {
  return {
    platform: "windows",
    version: app.getVersion(),
    notifications: {
      supported: Notification.isSupported(),
      enabled: device.value.notifications?.enabled === true,
    },
    update: {
      ...update,
      settingsUnread: Boolean(
        update.version && device.value.updateSeen_settings !== update.version,
      ),
      aboutUnread: Boolean(
        update.version && device.value.updateSeen_about !== update.version,
      ),
      prompt: Boolean(
        update.version && device.value.updateSeen_dismissed !== update.version,
      ),
    },
  };
}
/**
 * 推送不含敏感数据的原生状态。
 */
function emitState() {
  if (window && !window.isDestroyed()) {
    window.webContents.send("app:state", info());
  }
}
/**
 * 打开主窗口或受限本站路径。
 * @param {string | undefined} route 可选本站路径。
 */
function showWindow(route) {
  if (!window || window.isDestroyed()) return;
  if (route && route.startsWith("/") && !route.startsWith("//")) {
    void window.loadURL(origin + route);
  }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
/**
 * 生成会话绑定摘要，不把 Cookie 明文保存到设备设置。
 * @param {string} value 会话令牌。
 * @return {string} 摘要。
 */
function cookieFingerprint(value) {
  return createHash("sha256").update(value).digest("hex");
}
/**
 * 读取当前认证会话摘要。
 * @return {Promise<string>} 摘要或空值。
 */
async function sessionFingerprint() {
  const cookies = await webSession.cookies.get({
    url: origin,
    name: "heybox_session",
  });
  return cookies[0] ? cookieFingerprint(cookies[0].value) : "";
}
/**
 * 读取账号通知接口，拒绝跳转到登录页后误当作 JSON 成功。
 * @param {string | undefined} after 消费游标。
 * @return {Promise<object>} 服务端通知批次。
 */
async function readNotifications(after) {
  const url = origin + "/api/native/notifications" +
    (after === undefined ? "" : "?after=" + encodeURIComponent(after));
  const response = await webSession.fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Notifications unavailable");
  return response.json();
}
/**
 * 开启时绑定当前账号和会话，并从当前游标开始；关闭时立即撤回可见通知。
 * @param {boolean} enabled 当前设备开关。
 * @return {Promise<object>} 原生状态。
 */
async function setNotifications(enabled) {
  if (typeof enabled !== "boolean") {
    throw new Error("Invalid notification preference");
  }
  if (!enabled) {
    await disableNotifications();
    return info();
  }
  if (!Notification.isSupported()) throw new Error("Notifications unsupported");
  const revision = ++notificationRevision;
  const before = await sessionFingerprint();
  const batch = await readNotifications();
  const fingerprint = await sessionFingerprint();
  if (
    !fingerprint || fingerprint !== before ||
    revision !== notificationRevision || typeof batch.userId !== "string"
  ) {
    throw new Error("Authentication required");
  }
  device.value.notifications = {
    enabled: true,
    userId: batch.userId,
    session: fingerprint,
    cursor: batch.cursor,
    seen: [],
  };
  await device.save();
  emitState();
  return info();
}
/**
 * 停用设备通知并撤回当前进程创建的系统提示。
 * @return {Promise<void>} 设备偏好已保存。
 */
async function disableNotifications() {
  if (!device) return;
  notificationRevision++;
  device.value.notifications = { enabled: false };
  for (const notification of visibleNotifications) notification.close();
  visibleNotifications.clear();
  await device.save();
  emitState();
}
/**
 * 合并通知补取，关窗驻留和休眠恢复使用同一消费游标。
 * @return {Promise<void>} 本次读取结束。
 */
function pollNotifications() {
  polling ??= consumeNotifications().catch(() => {}).finally(() => {
    polling = undefined;
  });
  return polling;
}
/**
 * 在账号和会话仍相同时展示通知；只有成功处理的事件才推进游标。
 * @return {Promise<void>} 通知处理结束。
 */
async function consumeNotifications() {
  const binding = device.value.notifications;
  if (!binding?.enabled) return;
  const initialSession = await sessionFingerprint();
  if (device.value.notifications !== binding) return;
  if (initialSession !== binding.session) {
    await disableNotifications();
    return;
  }
  const batch = await readNotifications(binding.cursor);
  if (device.value.notifications !== binding) return;
  const fingerprint = await sessionFingerprint();
  if (device.value.notifications !== binding) return;
  if (batch.userId !== binding.userId || fingerprint !== binding.session) {
    await disableNotifications();
    return;
  }
  for (const event of batch.events) {
    const current = await sessionFingerprint();
    if (device.value.notifications !== binding) return;
    if (current !== binding.session) {
      await disableNotifications();
      return;
    }
    if (!binding.seen.includes(event.id)) {
      const notification = new Notification({
        title: String(event.title).slice(0, 120),
        body: String(event.body).slice(0, 300),
        silent: false,
      });
      notification.on("click", async () => {
        try {
          const current = await sessionFingerprint();
          if (
            device.value.notifications === binding &&
            current === binding.session
          ) showWindow(event.path);
        } catch { /* 已过期通知的点击不切换当前账号页面。 */ }
      });
      notification.on("close", () => visibleNotifications.delete(notification));
      visibleNotifications.add(notification);
      notification.show();
      binding.seen = [...binding.seen, event.id].slice(-2048);
    }
    binding.cursor = event.cursor;
    await device.save();
  }
}
/**
 * 连接 Release 更新状态；下载与安装始终等待用户在应用内确认。
 */
function installUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on("update-available", (release) => {
    update = { status: "available", version: release.version, progress: 0 };
    device.value.updateVersion = release.version;
    void device.save();
    emitState();
  });
  autoUpdater.on("update-not-available", () => {
    update.status = update.version ? "error" : "current";
    emitState();
  });
  autoUpdater.on("download-progress", (progress) => {
    update.status = "downloading";
    update.progress = progress.percent;
    emitState();
  });
  autoUpdater.on("update-downloaded", () => {
    update.status = "downloaded";
    update.progress = 100;
    emitState();
  });
  autoUpdater.on("error", () => {
    update.status = "error";
    emitState();
  });
}

/**
 * 比较正式发行版本，只有实际运行版本达到目标后才清除版本红点。
 * @param {string} candidate 目标版本。
 * @param {string} installed 已安装版本。
 * @return {boolean} 是否仍待升级。
 */
function newerVersion(candidate, installed) {
  const left = candidate.split(".").map(Number),
    right = installed.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}
/**
 * 检查 GitHub Release；开发运行不执行安装版更新。
 * @return {Promise<object>} 检查后的状态。
 */
function checkUpdate() {
  checking ??= (async () => {
    if (!app.isPackaged) {
      update.status = "development";
      return info();
    }
    if (["downloading", "downloaded"].includes(update.status)) return info();
    update.status = "checking";
    emitState();
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      update.status = "error";
      emitState();
    }
    return info();
  })().finally(() => {
    checking = undefined;
  });
  return checking;
}
