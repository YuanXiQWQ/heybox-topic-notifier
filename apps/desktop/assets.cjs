/** @file 为应用会话转发在线请求，并在离线时读取经过路径校验的安装资源。 */
const fs = require('node:fs/promises');
const {pathToFileURL} = require('node:url');
const {Readable} = require('node:stream');
const {assetPath} = require('./policy.cjs');

/**
 * 转发一次原生请求，将重定向交还页面，避免内部 fetch 吞掉最终地址。
 * @param {import('electron').Session} webSession 独立应用会话。
 * @param {Request} request 页面原始请求。
 * @param {import('electron').Net} net 原生网络接口。
 * @return {Promise<Response>} 当前一跳的响应。
 */
function forwardRequest(webSession, request, net) {
  return new Promise((resolve, reject) => {
    const origin = request.headers.get('origin') || undefined;
    const outgoing = net.request({
      session: webSession, url: request.url, method: request.method,
      headers: Object.fromEntries(request.headers), redirect: 'manual',
      bypassCustomProtocolHandlers: true, origin,
      credentials: request.credentials === 'same-origin' && !origin ? 'include' : request.credentials,
      cache: request.cache, referrerPolicy: request.referrerPolicy,
    });
    /** @param {Record<string, string|string[]>} values 原始响应头。 @return {Headers} 浏览器响应头。 */
    function responseHeaders(values) {
      const headers = new Headers();
      for (const [name, value] of Object.entries(values)) {
        for (const item of Array.isArray(value) ? value : [value]) headers.append(name, /[^\x00-\xff]/.test(item) ? Buffer.from(item, 'utf8').toString('latin1') : item);
      }
      return headers;
    }
    /** 页面取消请求时同时停止原生传输。 */
    function abort() { outgoing.abort(); reject(request.signal.reason || new Error('Request aborted')); }
    outgoing.on('error', reject);
    outgoing.once('close', () => request.signal.removeEventListener('abort', abort));
    outgoing.on('redirect', (status, _method, url, values) => {
      try {
        const headers = responseHeaders(values);
        headers.set('location', url);
        headers.delete('content-encoding'); headers.set('content-length', '0');
        resolve(new Response(null, {status, headers}));
      } catch (error) { reject(error); }
      outgoing.abort();
    });
    outgoing.on('response', response => {
      try {
        const headers = responseHeaders(response.headers);
        // Chromium 已解压原生响应流，转交 JS 流时不能再次声明压缩编码或压缩长度。
        if (headers.has('content-encoding')) { headers.delete('content-encoding'); headers.delete('content-length'); }
        const body = request.method === 'HEAD' || [204, 205, 304].includes(response.statusCode) ? null : Readable.toWeb(response);
        resolve(new Response(body, {status: response.statusCode, statusText: response.statusMessage, headers}));
      } catch (error) { outgoing.abort(); reject(error); }
    });
    if (request.signal.aborted) { abort(); return; }
    request.signal.addEventListener('abort', abort, {once: true});
    if (request.body) {
      const body = Readable.fromWeb(request.body);
      body.on('error', error => { outgoing.abort(); reject(error); });
      body.pipe(outgoing);
    } else outgoing.end();
  });
}

/**
 * 在服务不可达时读取同路径安装资源，脚本在线时优先跟随当前网页版本。
 * @param {import('electron').Session} webSession 应用独立会话。
 * @param {string} origin 固定业务来源。
 * @param {string} resources 安装资源的绝对目录。
 * @param {import('electron').Net} net Electron 本地文件请求接口。
 * @return {Promise<void>} 协议处理器就绪。
 */
async function installAssets(webSession, origin, resources, net) {
  const scheme = new URL(origin).protocol.slice(0, -1);
  await webSession.protocol.handle(scheme, async (request) => {
    // 由外层浏览器跟随重定向，保留 Response.url 和 POST → GET 的导航语义。
    const local = assetPath(resources, request.url, origin);
    if (local) {
      const script = /\.(?:js|css|json)$/.test(local);
      if (script) {
        try {
          const response = await forwardRequest(webSession, request, net);
          if (response.ok || (response.status >= 300 && response.status < 400)) return response;
        } catch { /* 离线脚本使用安装包版本。 */ }
      }
      try {
        if ((await fs.stat(local)).isFile()) {
          return await net.fetch(pathToFileURL(local).href, {headers: request.headers});
        }
      } catch { /* 未打包的资源继续由本站处理。 */ }
    }
    return forwardRequest(webSession, request, net);
  });
}

module.exports = {installAssets};
