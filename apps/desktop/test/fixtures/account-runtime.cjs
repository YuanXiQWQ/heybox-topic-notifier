/** @file 在真实设置页提交 First Trumpet，并检查白夜入场钟声、警报与背景音乐。 */
const {app, BrowserWindow, session, net, ipcMain} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createServer} = require('node:http');
const {once} = require('node:events');
const {spawnSync} = require('node:child_process');
const {gzipSync} = require('node:zlib');
const {installAssets} = require('../../assets.cjs');
const {applicationUserAgent} = require('../../policy.cjs');
const root = path.resolve(__dirname, '../../../..');
app.setPath('userData', process.argv[2]);
app.setName('小黑盒话题提醒');
app.enableSandbox();
let window, server, saved = 0, badNavigation = 0, settings;

/** @param {string} expression 页面条件。 @return {Promise<void>} 条件满足或超时。 */
async function until(expression, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out: ' + expression + ' at ' + window.webContents.getURL());
}

/** @param {import('node:http').IncomingMessage} request 测试请求。 @param {import('node:http').ServerResponse} response 响应。 @return {Promise<void>} 响应结束。 */
async function respond(request, response) {
  const url = new URL(request.url, 'http://localhost');
  response.setHeader('cache-control', 'no-store');
  if (url.pathname === '/account') {
    if (request.method !== 'POST') { badNavigation++; response.writeHead(404); response.end('Not found'); return; }
    let body = '';
    for await (const chunk of request) body += chunk;
    assert.ok(body.includes('First Trumpet'), body);
    saved++;
    response.writeHead(303, {location: '/settings?account=updated'});
    response.end();
  } else if (url.pathname === '/api/sync/session') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({userId: 'responsive-test', csrfToken: 'test', serverTime: Date.now()}));
  } else if (url.pathname === '/settings') {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.setHeader('x-app-user', 'responsive-test');
    const body = gzipSync(settings);
    response.setHeader('content-encoding', 'gzip');
    response.setHeader('content-length', body.length);
    response.end(body);
  } else if (url.pathname === '/white-night-entry') {
    const fixture = await fs.readFile(path.join(root, 'apps/android/app/src/androidTest/assets/white-night-entry.html'), 'utf8');
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(fixture.replace('<meta charset="utf-8">', `<meta charset="utf-8"><script>window.entryPrepared=${url.searchParams.get('prepared') === 'true'};window.entryTransformation=${url.searchParams.get('transformation') === 'true'};</script>`));
  } else if (url.pathname === '/app-sw.js' || url.pathname.startsWith('/static/')) {
    const file = url.pathname === '/app-sw.js' ? '/static/app-sw.js' : url.pathname;
    if (!/^[\w/.-]+$/.test(file) || file.includes('..')) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/javascript');
    response.setHeader('service-worker-allowed', '/');
    response.end(await fs.readFile(path.join(root, file)));
  } else { response.writeHead(404); response.end(); }
}

/** @return {Promise<void>} 真实账户保存和彩蛋播放均通过。 */
async function run() {
  const rendered = spawnSync('deno', ['run', '--frozen', '--allow-read', '--allow-env', path.join(__dirname, 'responsive-pages.ts')], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(rendered.status, 0, rendered.stderr);
  settings = JSON.parse(rendered.stdout)['/settings:workspace'];
  server = createServer((request, response) => void respond(request, response).catch(error => { console.error(error); response.destroy(); }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  app.userAgentFallback = applicationUserAgent(app.userAgentFallback);
  ipcMain.handle('app:info', () => ({navigation: {canGoBack: true}}));
  const webSession = session.fromPartition('account-runtime');
  await installAssets(webSession, origin, path.join(root, 'static'), net);
  window = new BrowserWindow({show: false, webPreferences: {
    session: webSession, preload: path.resolve(__dirname, '../../preload.cjs'),
    sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
  }});
  await window.loadURL(origin + '/settings');
  await until('Boolean(globalThis.lobotomyCorpEasterEgg && navigator.serviceWorker.controller)');
  await window.webContents.executeJavaScript(`
    window.playedAudio=[];
    const NativeAudio=window.Audio;
    window.Audio=class extends NativeAudio {constructor(...args){super(...args);playedAudio.push(this);}};
    document.querySelector('[data-account-mode="displayName"]').click();
    const input=document.querySelector('[data-account-display-name-input]');
    input.value='First Trumpet';input.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('[data-account-save-button]').click();
  `, true);
  await until(`location.pathname==='/settings' && location.search==='?account=updated' &&
    document.querySelector('.lobotomy-corp-alert-overlay') &&
    playedAudio.some(audio=>audio.src.endsWith('emergency01_mast.ogg')&&!audio.muted&&!audio.paused&&audio.currentTime>0)`);
  assert.equal(saved, 1);
  assert.equal(badNavigation, 0);
  console.log('FIRST_TRUMPET_ACCOUNT_OK', window.webContents.getURL());
  for (const prepared of [false, true]) {
    await window.loadURL(origin + '/white-night-entry?prepared=' + prepared);
    await until(`typeof entryProbe === 'string' && entryProbe !== 'pending'`);
    const result = await window.webContents.executeJavaScript('entryProbe');
    assert.equal(result, 'passed');
    console.log('WHITE_NIGHT_ENTRY_OK', {prepared});
  }
  await window.loadURL(origin + '/white-night-entry?transformation=true');
  await until(`typeof entryProbe === 'string' && entryProbe !== 'pending'`, 90000);
  assert.equal(await window.webContents.executeJavaScript('entryProbe'), 'passed');
  console.log('PLAGUE_DOCTOR_ENTRY_OK');
}

app.whenReady().then(run).then(() => {
  window.destroy(); server.closeAllConnections(); server.close(); app.exit(0);
}).catch(error => {
  console.error(error.stack); window?.destroy(); server?.closeAllConnections(); server?.close(); app.exit(1);
});
