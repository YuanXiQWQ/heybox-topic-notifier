/** @file 为应用会话转发在线请求，并在离线时读取经过路径校验的安装资源。 */
const fs = require('node:fs/promises');
const {pathToFileURL} = require('node:url');
const {assetPath} = require('./policy.cjs');

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
    const local = assetPath(resources, request.url, origin);
    if (local) {
      const script = /\.(?:js|css|json)$/.test(local);
      if (script) {
        try {
          const response = await webSession.fetch(request, {bypassCustomProtocolHandlers: true});
          if (response.ok) return response;
        } catch { /* 离线脚本使用安装包版本。 */ }
      }
      try {
        if ((await fs.stat(local)).isFile()) {
          return await net.fetch(pathToFileURL(local).href, {headers: request.headers});
        }
      } catch { /* 未打包的资源继续由本站处理。 */ }
    }
    return webSession.fetch(request, {bypassCustomProtocolHandlers: true});
  });
}

module.exports = {installAssets};
