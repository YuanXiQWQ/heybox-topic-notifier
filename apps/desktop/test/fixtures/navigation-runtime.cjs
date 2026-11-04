/** @file 使用中文应用名和真实 Electron 协议验证导航、重新开窗及离线快照。 */
const {app, BrowserWindow, session, net, ipcMain} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createServer} = require('node:http');
const {once} = require('node:events');
const {installAssets} = require('../../assets.cjs');
const {applicationUserAgent} = require('../../policy.cjs');
/** 测试只访问回环服务，不复用正式账号、通知标识或持久入口。 */
const root = path.resolve(__dirname, '../../../..');
app.setPath('userData', process.argv[2]);
app.setName('小黑盒话题提醒');
app.setAppUserModelId('io.github.yuanxiqwq.heyboxnotifier.navigation-test');
app.enableSandbox();
app.on('window-all-closed', () => {});
let window, server, offline = false;

/**
 * 返回最小导航页面和仓库中的真实浏览器脚本。
 * @param {import('node:http').IncomingMessage} request 本机请求。
 * @param {import('node:http').ServerResponse} response 测试响应。
 */
async function respond(request, response) {
  if (offline) { request.socket.destroy(); return; }
  const pathname = new URL(request.url, 'http://localhost').pathname;
  response.setHeader('cache-control', 'no-store');
  if (pathname === '/api/sync/session') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({userId: 'navigation-test'}));
  } else if (pathname === '/app-sw.js' || pathname.startsWith('/static/')) {
    response.setHeader('content-type', 'application/javascript');
    response.setHeader('service-worker-allowed', '/');
    const file = pathname === '/app-sw.js' ? '/static/app-sw.js' : pathname;
    response.end(await fs.readFile(path.join(root, file)));
  } else {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.setHeader('x-app-user', 'navigation-test');
    response.end(`<!doctype html><html><head><script src="/static/device-preferences.js"></script></head><body>
      <h1>${pathname}</h1><nav data-app-navigation><form action="/settings"><button>设置</button></form><form action="/history"><button>历史</button></form></nav>
      <script>window.applicationSync={prepareForExit:async()=>{}};window.workerReady=navigator.serviceWorker.register('/app-sw.js',{scope:'/'}).then(()=>navigator.serviceWorker.ready).then(()=>navigator.serviceWorker.controller||new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true})));</script>
      <script src="/static/app-navigation.js"></script></body></html>`);
  }
}

/**
 * 创建使用正式预加载桥的不可见测试窗口。
 * @param {import('electron').Session} webSession 隔离会话。
 * @return {import('electron').BrowserWindow} 测试窗口。
 */
function createWindow(webSession) {
  return new BrowserWindow({show: false, webPreferences: {
    session: webSession, preload: path.resolve(__dirname, '../../preload.cjs'),
    sandbox: true, contextIsolation: true, nodeIntegration: false,
  }});
}

/**
 * 在原生窗口中确认页面内容与导航布局均已加载。
 * @param {string} pathname 预期页面路径。
 * @return {Promise<void>} 页面通过验证。
 */
async function verify(pathname) {
  const state = await window.webContents.executeJavaScript('({heading:document.querySelector("h1")?.textContent,platform:document.documentElement.dataset.applicationPlatform})');
  assert.equal(state.heading, pathname);
  assert.equal(state.platform, 'windows');
}

/**
 * 覆盖中文宿主的旧网络标记和规范后的网络标记，不依赖模拟 Request 实现。
 * @return {Promise<void>} 全部场景通过。
 */
async function run() {
  server = createServer((request, response) => {
    void respond(request, response).catch(() => { response.writeHead(500); response.end(); });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const legacyAgent = app.userAgentFallback;
  assert.match(legacyAgent, /小黑盒话题提醒/);
  ipcMain.handle('app:info', () => ({navigation: {canGoBack: true}}));
  for (const normalized of [false, true]) {
    console.log(`CASE normalized=${normalized}`);
    offline = false;
    app.userAgentFallback = normalized ? applicationUserAgent(legacyAgent) : legacyAgent;
    const webSession = session.fromPartition(`navigation-${normalized}`);
    await installAssets(webSession, origin, path.join(root, 'static'), net);
    window = createWindow(webSession);
    await window.loadURL(origin + '/');
    console.log('INITIAL_LOADED');
    await window.webContents.executeJavaScript('workerReady');
    for (const route of ['/settings', '/history']) {
      const finished = once(window.webContents, 'did-finish-load');
      await window.webContents.executeJavaScript(`document.querySelector('form[action="${route}"] button').click()`);
      await finished;
      await verify(route);
    }
    window.destroy();
    window = createWindow(webSession);
    await window.loadURL(origin + '/');
    console.log('REOPENED_LOADED');
    await verify('/');
    offline = true;
    await window.loadURL(origin + '/settings');
    await verify('/settings');
    window.destroy();
    window = undefined;
    await webSession.closeAllConnections();
  }
}

app.whenReady().then(run).then(() => {
  console.log('NATIVE_NAVIGATION_OK');
  server.closeAllConnections();
  server.close();
  app.exit(0);
}).catch((error) => {
  console.error(error.stack);
  window?.destroy();
  server?.closeAllConnections();
  server?.close();
  app.exit(1);
});
