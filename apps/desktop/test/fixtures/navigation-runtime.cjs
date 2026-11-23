/** @file 使用中文应用名和真实 Electron 协议验证导航、重新开窗及离线快照。 */
const {app, BrowserWindow, session, net, ipcMain} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createServer} = require('node:http');
const {once} = require('node:events');
const {createHash} = require('node:crypto');
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
  const url = new URL(request.url, 'http://localhost');
  const pathname = url.pathname;
  response.setHeader('cache-control', 'no-store');
  if (pathname === '/account') {
    if (request.method !== 'POST') { response.writeHead(404); response.end('Account POST endpoint'); return; }
    let body = '';
    for await (const chunk of request) body += chunk;
    assert.equal(new URLSearchParams(body).get('displayName'), 'First Trumpet');
    response.writeHead(303, {location: '/settings?account=updated', 'set-cookie': 'redirect-test=ok; Path=/; HttpOnly; SameSite=Lax'});
    response.end();
  } else if (pathname === '/preserve-method') {
    for await (const _chunk of request) { /* 消费第一跳表单，外层浏览器负责 307 重放。 */ }
    response.writeHead(307, {location: '/echo'}); response.end();
  } else if (pathname === '/echo') {
    let body = '';
    for await (const chunk of request) body += chunk;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({method: request.method, body}));
  } else if (pathname === '/api/sync/session') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({userId: 'navigation-test'}));
  } else if (pathname === '/app-sw.js' || pathname.startsWith('/static/')) {
    response.setHeader('content-type', 'application/javascript');
    response.setHeader('service-worker-allowed', '/');
    const file = pathname === '/app-sw.js' ? '/static/app-sw.js' : pathname;
    response.end(await fs.readFile(path.join(root, file)));
  } else {
    if (url.searchParams.get('account') === 'updated') assert.match(request.headers.cookie || '', /redirect-test=ok/);
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
 * 在断网的真实协议和 Service Worker 下读取终章，验证区间、缓存恢复与播放器定位。
 * @return {Promise<void>} 安装资源与浏览器实际读取的字节及媒体元数据相符。
 */
async function verifyOfflineFinale() {
  const asset = '/static/fun/lobotomy-corp/Assets/Resources/sounds/creature/silentorchestra/Sym_movment_5_finale.ogg';
  const original = await fs.readFile(path.join(root, asset));
  const size = original.length;
  window.webContents.setAudioMuted(true);
  const result = await window.webContents.executeJavaScript(`(async (asset, size) => {
    const url = asset + '?offline-audio';
    const request = (range) => fetch(url, {headers: {range}});
    const partial = await request('bytes=100-109');
    const suffix = await request('bytes=-4');
    const invalid = await request('bytes=' + size + '-');
    const head = await fetch(url, {method: 'HEAD'});
    const cache = await caches.open('heybox-app-resources-v1');
    await cache.put(new Request(url, {headers: {range: 'bytes=100-109'}}),
      new Response(new Uint8Array(10), {headers: {'content-type': 'audio/ogg'}}));
    const file = await (await fetch(url)).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', file);
    const media = new Audio(url);
    const duration = await new Promise((resolve, reject) => {
      media.onloadedmetadata = () => {
        if (!Number.isFinite(media.duration)) { reject(new Error('无法确定终章时长')); return; }
        media.currentTime = media.duration - 0.25;
      };
      media.onseeked = () => media.play().catch(reject);
      media.onended = () => resolve(media.duration);
      media.onerror = () => reject(new Error(media.error.message));
      media.load();
    });
    return {partial: [partial.status, partial.headers.get('content-range'), partial.headers.get('content-length'),
      ...new Uint8Array(await partial.arrayBuffer())], suffix: [...new Uint8Array(await suffix.arrayBuffer())],
      invalid: [invalid.status, invalid.headers.get('content-range')], head: [head.status, head.headers.get('content-length'),
      (await head.arrayBuffer()).byteLength], digest: [...new Uint8Array(digest)], duration};
  })(` + JSON.stringify(asset) + ',' + size + ')', true);
  assert.deepEqual(result.partial, [206, 'bytes 100-109/' + size, '10', ...original.subarray(100, 110)]);
  assert.deepEqual(result.suffix, [...original.subarray(-4)]);
  assert.deepEqual(result.invalid, [416, 'bytes */' + size]);
  assert.deepEqual(result.head, [200, String(size), 0]);
  assert.deepEqual(result.digest, [...createHash('sha256').update(original).digest()]);
  assert.ok(Math.abs(result.duration - 34.274989) < 0.01, String(result.duration));
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
    // 警报彩蛋依据最终响应地址确认账户已保存；协议转发不能吞掉 303 的目标地址。
    const saved = await window.webContents.executeJavaScript(`fetch('/account', {
      method: 'POST', body: new URLSearchParams({accountAction: 'displayName', displayName: 'First Trumpet'})
    }).then(async response => ({status: response.status, url: response.url, redirected: response.redirected, body: await response.text()}))`);
    console.log('ACCOUNT_REDIRECT', JSON.stringify({status: saved.status, url: saved.url, redirected: saved.redirected}));
    assert.equal(saved.status, 200);
    assert.equal(saved.url, origin + '/settings?account=updated');
    assert.equal(saved.redirected, true);
    const replayed = await window.webContents.executeJavaScript(`fetch('/preserve-method', {
      method: 'POST', body: new URLSearchParams({value: 'preserved'})
    }).then(response=>response.json())`);
    assert.deepEqual(replayed, {method: 'POST', body: 'value=preserved'});
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
    if (normalized) await verifyOfflineFinale();
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
