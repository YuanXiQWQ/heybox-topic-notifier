/** @file 在隔离 Electron 中验证真实表单、本地落盘、慢请求、失败恢复和离线跨页。 */
const {app, BrowserWindow, ipcMain} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createServer} = require('node:http');
const {once} = require('node:events');
const {spawnSync} = require('node:child_process');
/** 渲染、资源读取和测试数据均限于当前测试实例。 */
const root = path.resolve(__dirname, '../../../..');
app.setPath('userData', process.argv[2]);
app.setName('Heybox responsiveness test');
app.setAppUserModelId('io.github.yuanxiqwq.heyboxnotifier.responsiveness-test');
app.on('window-all-closed', () => {});
let window, server, state = 'workspace', delay = 1500, status = 200, offline = false, resourceDelay = 0, posts = 0;
/** 测试页面由生产渲染器生成，避免简化 HTML 掩盖表单与脚本问题。 */
const rendered = spawnSync('deno', ['run', '--allow-read', '--allow-env', path.join(__dirname, 'responsive-pages.ts')], {cwd: root, encoding: 'utf8', windowsHide: true});
if (rendered.status !== 0) throw new Error(rendered.stderr);
const pages = JSON.parse(rendered.stdout);

/** @param {number} ms 延迟毫秒数。 @return {Promise<void>} 延迟结束。 */
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
/** @param {string} source 浏览器测试表达式。 @return {Promise<unknown>} 表达式结果。 */
async function evaluate(source) {
  try { return await window.webContents.executeJavaScript(source); }
  catch (error) { throw new Error(source + ': ' + error.message); }
}
/**
 * 等待可观测业务条件，不依赖固定页面加载时长。
 * @param {string} expression 条件表达式。
 * @param {number} timeout 最长等待毫秒数。
 * @return {Promise<void>} 条件已经满足。
 */
async function until(expression, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    await wait(20);
  }
  throw new Error('Timed out: ' + expression);
}
/**
 * 只提供本机固定资源和可控同步接口，模拟网络延迟与服务器拒绝。
 * @param {import('node:http').IncomingMessage} request 请求。
 * @param {import('node:http').ServerResponse} response 响应。
 * @return {Promise<void>} 响应结束。
 */
async function respond(request, response) {
  if (offline) { request.socket.destroy(); return; }
  const url = new URL(request.url, 'http://localhost');
  response.setHeader('cache-control', 'no-store');
  if (url.pathname === '/api/sync/session') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({userId: 'responsive-test', serverTime: Date.now(), csrfToken: 'test'}));
  } else if (url.pathname.startsWith('/matches/')) {
    posts++;
    for await (const _chunk of request) { /* 消费真实表单请求体。 */ }
    const result = status;
    await wait(delay);
    if (result === 200) state = url.pathname.endsWith('restore') ? 'workspace' : url.pathname.endsWith('delete') ? 'deleted' : 'history';
    response.writeHead(result, {'content-type': 'application/json'});
    response.end(JSON.stringify({ok: result === 200}));
  } else if (url.pathname === '/app-sw.js' || url.pathname.startsWith('/static/')) {
    await wait(resourceDelay);
    const file = url.pathname === '/app-sw.js' ? '/static/app-sw.js' : url.pathname;
    if (!/^[\w/.-]+$/.test(file) || file.includes('..')) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'application/javascript');
    response.setHeader('service-worker-allowed', '/');
    try { response.end(await fs.readFile(path.join(root, file))); }
    catch { response.writeHead(404); response.end(); }
  } else if (['/', '/history', '/settings', '/about'].includes(url.pathname)) {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.setHeader('x-app-user', 'responsive-test');
    response.end(pages[url.pathname + ':' + state]);
  } else { response.writeHead(404); response.end(); }
}
/** @return {Promise<void>} 真实交互及故障场景全部通过。 */
async function run() {
  server = createServer((request, response) => void respond(request, response).catch(error => { console.error(error); response.destroy(); }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  ipcMain.handle('app:info', () => ({navigation: {canGoBack: true}}));
  window = new BrowserWindow({show: false, width: 1280, height: 900, webPreferences: {preload: process.argv[3] === 'web' ? undefined : path.join(root, 'apps/desktop/preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false}});
  await window.loadURL(origin + '/');
  await until('Boolean(applicationSync && navigator.serviceWorker.controller)');
  await evaluate('applicationSync.ready');
  // 本机缓存准备好后再测量交互，不把首次下载资源计入点击延迟。
  await until("AppLocalStore.readState('responsive-test','page:/history').then(Boolean)");
  const clicked = Date.now();
  await evaluate(`document.querySelector('tr[data-record-id] button[type="submit"]').click()`);
  await until('!document.querySelector("tr[data-record-id]")', 700);
  const actionMs = Date.now() - clicked;
  assert.ok(actionMs < 700, `action ${actionMs}ms`);
  const exitStarted = Date.now();
  await evaluate('applicationSync.prepareForExit()');
  assert.ok(Date.now() - exitStarted < 500, 'navigation waits for network');
  assert.equal(state, 'workspace');
  const navigation = once(window.webContents, 'did-finish-load');
  await evaluate(`document.querySelector('form[action="/history"] button').click()`);
  await navigation;
  await until(`document.querySelector('tr[data-record-id]')?.dataset.recordStatus === 'history'`);
  await until("AppLocalStore.pending('responsive-test').then(items => !items.length)");
  assert.equal(state, 'history');
  // 已确认操作仍能覆盖较早缓存，断网跨页不会让移走的行复活。
  offline = true;
  await window.loadURL(origin + '/');
  await until('Boolean(applicationSync)');
  await evaluate('applicationSync.ready.then(applicationSync.applyPendingRecords)');
  assert.equal(await evaluate('document.querySelectorAll("tr[data-record-id]").length'), 0);
  offline = false;
  state = 'workspace';
  await window.loadURL(origin + '/');
  await evaluate('applicationSync.ready');
  status = 422; delay = 120;
  await evaluate(`document.querySelector('tr[data-record-id] button[type="submit"]').click()`);
  await until(`document.querySelector('[data-record-sync-status] p').textContent.includes('422')`);
  assert.equal(await evaluate('document.querySelectorAll("tr[data-record-id]").length'), 1);
  assert.equal(await evaluate("AppLocalStore.pending('responsive-test').then(items => items.length)"), 0);
  assert.equal(await evaluate('location.pathname'), '/');
  // 明确拒绝不会堵住后面的有效请求；本地写失败则完全不改变记录。
  await evaluate(`globalThis.originalAppend = AppLocalStore.append; AppLocalStore.append = async () => { throw new Error('Disk full'); }; document.querySelector('tr[data-record-id] button[type="submit"]').click()`);
  await until(`document.querySelector('[data-record-sync-status] p').textContent.includes('Disk full')`);
  assert.equal(await evaluate('document.querySelectorAll("tr[data-record-id]").length'), 1);
  await evaluate('AppLocalStore.append = originalAppend; void 0');
  status = 503;
  await evaluate(`document.querySelector('tr[data-record-id] button[type="submit"]').click()`);
  await until('!document.querySelector("tr[data-record-id]")');
  await wait(250);
  assert.equal(await evaluate("AppLocalStore.pending('responsive-test').then(items => items.length)"), 1);
  await window.loadURL(origin + '/');
  await evaluate('applicationSync.ready.then(applicationSync.applyPendingRecords)');
  assert.equal(await evaluate('document.querySelectorAll("tr[data-record-id]").length'), 0);
  status = 200;
  await evaluate('applicationSync.flush("edit")');
  assert.equal(await evaluate("AppLocalStore.pending('responsive-test').then(items => items.length)"), 0);
  resourceDelay = 1500;
  const pageStart = Date.now();
  await window.loadURL(origin + '/history');
  await until('Boolean(applicationSync)');
  assert.ok(Date.now() - pageStart < 1200, `cached navigation ${Date.now() - pageStart}ms`);
  resourceDelay = 0;
  for (const width of [1280, 390]) {
    window.setSize(width, 900);
    for (const direction of ['ltr', 'rtl']) {
      await evaluate(`document.documentElement.dir='${direction}'; document.documentElement.dataset.colorMode='dark'`);
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `overflow ${width}/${direction}`);
    }
  }
  console.log(JSON.stringify({platform: process.argv[3] || 'windows', actionMs, simulatedNetworkMs: 1500, posts}));
  console.log('RESPONSIVE_ACTIONS_OK');
}
app.whenReady().then(run).then(() => { window.destroy(); server.closeAllConnections(); server.close(); app.exit(0); }).catch(error => { console.error(error.stack); window?.destroy(); server?.closeAllConnections(); server?.close(); app.exit(1); });
