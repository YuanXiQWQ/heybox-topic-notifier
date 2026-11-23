/** @file 接收系统通知，并按账号隔离缓存页面、公共资源和离线编辑快照。 */
if (typeof importScripts === 'function') importScripts('/static/app-sync/store.js');
/** 公共资源缓存不包含账号页面和业务请求。 */
const applicationResourceCache = 'heybox-app-resources-v1';
/** 并发页面消息共用一次预取，避免每次导航都重复加载全部页面。 */
let applicationPagePrefetch;
/** 公共资源预取依次执行，给用户发起的页面请求保留网络连接。 */
let applicationResourcePrefetch = Promise.resolve();
/** 缓存校准只使用一条后台请求，并合并同一地址，避免占满浏览器连接池。 */
let applicationResourceUpdate = Promise.resolve();
/** 当前已排队的资源更新任务。 */
const applicationResourceUpdates = new Map();
/** 已经通过服务器认证的文档；仅这些文档发起的普通站内切页可立即使用本地快照。 */
const applicationClients = new Map();
/** Worker 休眠后按文档标识恢复绑定，浏览器不会把该标识复用于另一个文档。 */
let applicationClientsReady;
/** 串行持久化文档绑定，快速连续切页也保留最后的状态。 */
let applicationClientWrites = Promise.resolve();
/** 会话失效后，已发出的校验不得重新开启旧账号入口。 */
let applicationSessionRevision = 0;
/** 按会话次序落盘，退出不会被较早请求的迟到写入撤销。 */
let applicationIdentityWrites = Promise.resolve();
/** 后台页面预取的最短间隔，普通切页的页面校准独立进行。 */
const applicationPrefetchInterval = 5 * 60 * 1000;
self.addEventListener('install', (event) => {
  // 此脚本运行于 Service Worker，self 的能力及 importScripts 导入对象由该宿主提供。
  // noinspection JSUnresolvedReference
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  // 此脚本运行于 Service Worker，self 的能力及 importScripts 导入对象由该宿主提供。
  // noinspection JSUnresolvedReference
  event.waitUntil(self.clients.claim());
});
self.addEventListener('message', (event) => {
  // 此脚本运行于 Service Worker，self 的能力及 importScripts 导入对象由该宿主提供。
  // noinspection JSUnresolvedReference
  event.waitUntil(handleApplicationMessage(event));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method === 'POST' && (event.request.mode === 'navigate' || /^\/(?:auth|account|login|logout|register)(?:\/|$)/.test(url.pathname))) {
    event.respondWith(clearApplicationSession().then(() => fetch(event.request)));
  } else if (event.request.method === 'GET' && event.request.mode === 'navigate' && ['/', '/settings', '/history', '/about'].includes(url.pathname)) {
    event.respondWith(applicationNavigation(event));
  } else if (event.request.method === 'GET' && (url.pathname.startsWith('/static/') || url.pathname === '/favicon.ico')) {
    event.respondWith(applicationResource(event.request, (task) => event.waitUntil(task)));
  }
});

/**
 * 退出时关闭离线页面入口，保留属于原账号的加密待同步操作。
 * @return {Promise<void>} 本机账号入口已清除。
 */
async function clearApplicationSession() {
  applicationSessionRevision++;
  await loadApplicationClients();
  applicationClients.clear();
  // 此脚本运行于 Service Worker，self 的能力及 importScripts 导入对象由该宿主提供。
  // noinspection JSUnresolvedReference
  await setApplicationUser(null, applicationSessionRevision);
  await rememberApplicationClient();
}

/**
 * 仅保存仍属于当前会话版本的账号结果，并串行处理异步加密与写入。
 * @param {string|null} userId 已认证账号，null 表示退出。
 * @param {number} revision 请求开始时的会话版本。
 * @return {Promise<void>} 账号状态写入或已过期跳过。
 */
function setApplicationUser(userId, revision) {
  applicationIdentityWrites = applicationIdentityWrites.catch(() => {}).then(async () => {
    if (revision === applicationSessionRevision) await self.AppLocalStore.writeState('__device', 'active-user', userId);
  });
  return applicationIdentityWrites;
}

/**
 * 从本机恢复最近的已认证文档绑定；恢复失败时只使用本轮验证结果。
 * @return {Promise<void>} 文档绑定可用。
 */
function loadApplicationClients() {
  applicationClientsReady = applicationClientsReady ?? Promise.resolve().then(async () => {
    const entries = await self.AppLocalStore.readState('__device', 'navigation-clients');
    if (Array.isArray(entries)) for (const [id, identity] of entries) applicationClients.set(id, identity);
  }).catch(() => {});
  return applicationClientsReady;
}

/**
 * 记录当前文档的已验证账号和语言，仅保留最近 32 个文档。
 * @param {string} [id] 浏览器分配的文档标识。
 * @param {{userId: string, locale?: string}} [identity] 服务端确认的账号。
 * @return {Promise<void>} 绑定保存结束。
 */
async function rememberApplicationClient(id, identity) {
  await loadApplicationClients();
  if (id && identity) applicationClients.set(id, identity);
  while (applicationClients.size > 32) applicationClients.delete(applicationClients.keys().next().value);
  applicationClientWrites = applicationClientWrites.catch(() => {}).then(() =>
    self.AppLocalStore.writeState('__device', 'navigation-clients', [...applicationClients]));
  await applicationClientWrites.catch(() => {});
}

/**
 * 校验页面账号，并预取页面已声明的同源公共脚本与样式。
 * @param {ExtendableMessageEvent} event 页面消息。
 * @return {Promise<void>} 消息处理完成。
 */
async function handleApplicationMessage(event) {
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  if (event.data?.type === 'app-session') {
    const revision = applicationSessionRevision;
    try {
      const response = await fetch('/api/sync/session', {cache: 'no-store', redirect: 'error'});
      if (!response.ok) return;
      const session = await response.json();
      if (session.userId === event.data.userId && revision === applicationSessionRevision) {
        // importScripts 将共享本地存储接口注册到 Worker 宿主。
        // noinspection JSUnresolvedReference
        await setApplicationUser(session.userId, revision);
        if (event.source.id && revision === applicationSessionRevision) await rememberApplicationClient(event.source.id, {userId: session.userId, locale: event.data.locale});
      }
    } catch { /* 离线时不切换已经验证的账号。 */
    }
  }
  if (event.data?.type === 'app-resources' && Array.isArray(event.data.urls)) {
    const urls = event.data.urls.slice(0, 40);
    applicationResourcePrefetch = applicationResourcePrefetch.then(() => prefetchApplicationResources(urls)).catch(() => {});
    await applicationResourcePrefetch;
  }
  if (event.data?.type === 'app-pages') {
    applicationPagePrefetch = applicationPagePrefetch ?? prefetchApplicationPages().finally(() => { applicationPagePrefetch = undefined; });
    await applicationPagePrefetch;
  }
}

/**
 * 同一已认证文档内的普通切页先读取本地页面；首访、刷新和带业务回调的地址仍请求服务器。
 * @param {FetchEvent} event 浏览器导航事件。
 * @return {Promise<Response>} 当前账号的页面。
 */
async function applicationNavigation(event) {
  const request = event.request;
  const url = new URL(request.url);
  const revision = applicationSessionRevision;
  await loadApplicationClients();
  let source;
  const name = `page:${url.pathname}${url.search === '?panel=polling' ? '' : url.search}`;
  let cached;
  try {
    const active = await self.AppLocalStore.readState('__device', 'active-user');
    const sourceId = event.clientId || event.replacesClientId;
    let client = sourceId ? await self.clients.get(sourceId) : undefined;
    // 旧 WebView 的导航事件不提供来源 ID，只接受与浏览器 referrer 唯一匹配的存活已认证文档。
    if (!sourceId && request.referrer && new URL(request.referrer).origin === self.location.origin) {
      const matches = (await self.clients.matchAll({type: 'window'})).filter((candidate) =>
        candidate.url === request.referrer && applicationClients.get(candidate.id)?.userId === active);
      if (matches.length === 1) client = matches[0];
    }
    source = client && applicationClients.get(client.id || sourceId);
    if (client && source?.userId === active && client.url !== request.url &&
        (!url.search || (url.pathname === '/settings' && url.search === '?panel=polling')) &&
        request.cache !== 'reload') {
      const page = await self.AppLocalStore.readState(active, name);
      // 旧页面和其它语言仍可离线回退，但不能作为正常切页的首选响应。
      if (page?.html && page.html.includes('data-app-page-cache="4"') &&
          page.html.match(/<html\b[^>]*\blang="([^"]+)"/i)?.[1] === source.locale) cached = page;
    }
  } catch { /* 本地存储或来源不可用时使用认证后的网络页面。 */ }
  if (cached) {
    if (event.resultingClientId) await rememberApplicationClient(event.resultingClientId, source);
    if (revision === applicationSessionRevision) {
      event.waitUntil(refreshApplicationNavigation(request, source, event.resultingClientId).catch(() => {}));
      return localPageResponse(cached);
    }
  }
  const response = await applicationPage(request, undefined, (task) => event.waitUntil(task));
  const userId = response.headers.get('x-app-user');
  if (response.ok && userId && event.resultingClientId) {
    const html = await response.clone().text();
    await rememberApplicationClient(event.resultingClientId, {userId, locale: html.match(/<html\b[^>]*\blang="([^"]+)"/i)?.[1]});
  }
  return response;
}

/**
 * 在后台校准已经显示的账号页面；会话变化关闭旧账号的快速导航入口。
 * @param {Request} request 当前页面请求。
 * @param {{userId: string}} source 来源文档的认证身份。
 * @param {string} clientId 新文档标识。
 * @return {Promise<void>} 网络校准完成或保留本地页面。
 */
async function refreshApplicationNavigation(request, source, clientId) {
  const response = await applicationPage(request, source);
  const client = clientId && await self.clients.get(clientId);
  const userId = response.headers.get('x-app-user');
  if (response.redirected || response.status === 401 || response.status === 403 || (userId && userId !== source.userId)) {
    applicationClients.delete(clientId);
    await rememberApplicationClient();
    client?.postMessage({type: 'app-session-changed'});
  } else if (response.ok && !response.headers.has('x-app-offline') && userId === source.userId) {
    client?.postMessage({type: 'app-page-refreshed', userId, url: request.url});
  }
  await response.body?.cancel();
}

/**
 * 只串行补齐缺失的公共资源，异常地址不阻断后续资源。
 * @param {unknown[]} urls 页面声明的资源地址。
 * @return {Promise<void>} 本批资源预取结束。
 */
async function prefetchApplicationResources(urls) {
  const cache = await caches.open(applicationResourceCache);
  for (const value of urls) {
    if (typeof value !== 'string') continue;
    try {
      const url = new URL(value, self.location.origin);
      if (url.origin === self.location.origin && url.pathname.startsWith('/static/') &&
          !await cache.match(url.href, {ignoreVary: true})) await applicationResource(new Request(url));
    } catch { /* 单项失败保留缓存，实际访问仍可以重新请求。 */ }
  }
}

/**
 * 按已验证账号串行更新离线页面，限制频率以免后台预取挤占前台导航连接。
 * @return {Promise<void>} 本次预取结束；离线失败保留现有缓存。
 */
async function prefetchApplicationPages() {
  const store = self.AppLocalStore;
  let identity;
  try {
    const response = await fetch('/api/sync/session', {cache: 'no-store', redirect: 'error', signal: applicationTimeout(5000)});
    if (!response.ok) return;
    identity = await response.json();
    if (!identity.userId) return;
  } catch { return; }
  const last = await store.readState(identity.userId, 'page-prefetch');
  if (typeof last === 'number' && Date.now() - last < applicationPrefetchInterval) return;
  let complete = true;
  for (const path of ['/', '/settings', '/history', '/about', '/?range=all&page=1&pageSize=all', '/history?range=all&page=1&pageSize=all']) {
    try {
      const response = await applicationPage(new Request(self.location.origin + path), identity);
      if (!response.ok) complete = false;
      else await prefetchPageResources(await response.text());
    } catch { complete = false; break; }
  }
  if (complete) await store.writeState(identity.userId, 'page-prefetch', Date.now());
}

/**
 * 预取页面声明的脚本、样式及静态模块依赖，首次切入已缓存页面也无需再等待这些代码。
 * @param {string} html 已认证页面的 HTML。
 * @return {Promise<void>} 公共代码资源已补齐，单项失败不会阻断导航。
 */
async function prefetchPageResources(html) {
  if (typeof caches === 'undefined') return;
  const queue = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1]);
  const visited = new Set();
  const cache = await caches.open(applicationResourceCache);
  while (queue.length && visited.size < 160) {
    const url = new URL(queue.shift(), self.location.origin);
    if (url.origin !== self.location.origin || !url.pathname.startsWith('/static/') || visited.has(url.href)) continue;
    visited.add(url.href);
    try {
      const response = await cache.match(url.href, {ignoreVary: true}) ?? await applicationResource(new Request(url));
      if (!response.ok || !url.pathname.endsWith('.js')) continue;
      const source = await response.text();
      for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^;'"]*?\s+from\s+)?["']([^"']+)["']/g)) {
        if (/^(?:\.{1,2}\/|\/static\/)/.test(match[1])) queue.push(new URL(match[1], url).href);
      }
    } catch { /* 预取失败保留已完成项，实际访问仍会重试。 */ }
  }
}

/**
 * 已缓存公共资源立即可用，脚本和样式在后台校准；首次访问仍等待网络。
 * @param {Request} request 同源资源请求。
 * @param {(task: Promise<unknown>) => void} [background] 延长 Worker 生命周期的回调。
 * @return {Promise<Response>} 在线或已缓存的资源。
 */
async function applicationResource(request, background) {
  const cache = await caches.open(applicationResourceCache);
  const cached = await cache.match(request, {ignoreVary: true});
  // 旧桌面协议可能将文件片段作为没有长度的 200 响应缓存。保留离线副本直到完整文件可读。
  if (cached && /\bElectron\//.test(self.navigator?.userAgent ?? '') && !cached.headers.has('content-length') &&
      /\.(?:ogg|wav|mp3|webm)$/i.test(new URL(request.url).pathname)) {
    const [stored] = await cache.keys(request, {ignoreVary: true});
    if (stored?.headers.has('range')) {
      const headers = new Headers(request.headers);
      headers.delete('range');
      const fullRequest = new Request(request, {headers});
      try {
        const full = await fetch(fullRequest);
        if (full.status === 200 && !full.redirected && full.headers.has('content-length')) {
          await cache.put(fullRequest, full.clone());
          return rangeResponse(request, full);
        }
      } catch { /* 文件暂不可用时沿用现有副本。 */ }
    }
  }
  if (cached && !/\.(?:js|css)(?:\?|$)/.test(request.url)) return rangeResponse(request, cached);
  if (cached && background) {
    let update = applicationResourceUpdates.get(request.url);
    if (!update) {
      update = applicationResourceUpdate.then(async () => {
        const response = await fetch(new Request(request, {signal: applicationTimeout(10000)}));
        if (response.ok && !response.redirected && response.status === 200) await cache.put(request, response);
        else if (response.status === 404 || response.status === 410) await cache.delete(request);
      }).catch(() => {}).finally(() => applicationResourceUpdates.delete(request.url));
      applicationResourceUpdate = update;
      applicationResourceUpdates.set(request.url, update);
    }
    background(update);
    return rangeResponse(request, cached);
  }
  try {
    const response = await fetch(request);
    if (response.status >= 500 && cached) return rangeResponse(request, cached);
    if (response.ok && !response.redirected && response.status === 200) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    if (cached) return rangeResponse(request, cached);
    throw error;
  }
}

/**
 * 为缓存的音视频提供字节范围响应，保持本地彩蛋媒体可寻址播放。
 * @param {Request} request 媒体请求。
 * @param {Response} response 完整缓存响应。
 * @return {Promise<Response>} 完整响应或指定字节范围。
 */
async function rangeResponse(request, response) {
  const range = request.headers.get('range');
  if (!range) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return response;
  const bytes = await response.arrayBuffer();
  const start = match[1] ? Number(match[1]) : Math.max(0, bytes.byteLength - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.byteLength - 1) : bytes.byteLength - 1;
  if (start > end || start >= bytes.byteLength) return new Response(null, {
    status: 416,
    headers: {'content-range': `bytes */${bytes.byteLength}`}
  });
  const headers = new Headers(response.headers);
  headers.set('content-range', `bytes ${start}-${end}/${bytes.byteLength}`);
  headers.set('content-length', String(end - start + 1));
  headers.set('accept-ranges', 'bytes');
  return new Response(bytes.slice(start, end + 1), {status: 206, headers});
}

/**
 * 在当前账号内缓存页面，主设置与时段子页共用最新草稿，其它查询页保持隔离。
 * @param {Request} request 页面请求。
 * @param {{userId: string}} [verifiedIdentity] 同一后台预取批次刚验证的账号。
 * @param {(task: Promise<unknown>) => void} [background] 让缓存写入在响应交还后继续完成。
 * @return {Promise<Response>} 在线页面或当前账号离线页面。
 */
async function applicationPage(request, verifiedIdentity, background) {
  const recordReadAt = Date.now();
  const sessionRevision = applicationSessionRevision;
  const url = new URL(request.url);
  const name = `page:${url.pathname}${url.pathname === '/settings' && url.search === '?panel=polling' ? '' : url.search}`;
  // 此脚本运行于 Service Worker，self 的能力及 importScripts 导入对象由该宿主提供。
  // noinspection JSUnresolvedReference
  const store = self.AppLocalStore;
  // 页面请求与会话校验并行，页面失败也必须等身份检查后才能选择本机缓存。
  const online = fetchApplicationPage(request).then(
      (response) => ({response}), (error) => ({error}),
  );
  let active;
  try { active = await store.readState('__device', 'active-user'); }
  catch { /* 本地存储不可用时仍允许加载服务器认证后的在线页面。 */ }
  try {
    if (verifiedIdentity) {
      active = verifiedIdentity.userId;
    } else {
      // 页面自身的账号头同样由服务端认证产生，不再让较慢的重复会话请求阻塞在线页面。
      const identityRequest = fetch('/api/sync/session', {cache: 'no-store', signal: applicationTimeout(5000)});
      const pageIdentity = online.then((result) => {
        const userId = result.response?.ok && !result.response.redirected && result.response.headers.get('x-app-user');
        return userId ? new Response(JSON.stringify({userId}), {headers: {'content-type': 'application/json'}}) : identityRequest;
      });
      const identity = await Promise.race([identityRequest, pageIdentity]);
      if (identity.redirected || identity.status === 401 || identity.status === 403) {
        active = null;
        if (sessionRevision === applicationSessionRevision) await clearApplicationSession();
      } else if (identity.ok) {
        active = (await identity.json()).userId;
        await setApplicationUser(active, sessionRevision);
      }
    }
  } catch { /* 网络不可达时只允许使用此前验证过的本机账号。 */
  }
  let local, hasSettingsDraft = false;
  try {
    local = active ? await store.readState(active, name) : undefined;
    hasSettingsDraft = local?.html && url.pathname === '/settings' &&
      (await store.pending(active)).some((operation) => operation.kind === 'settings');
  } catch { /* 缓存读取失败交由在线响应处理，不把存储故障当作网络失败。 */ }
  if (hasSettingsDraft) {
    void online.then((result) => result.response?.body?.cancel()).catch(() => {});
    return localPageResponse(local);
  }
  try {
    const result = await online;
    if (result.error) throw result.error;
    const response = result.response;
    if (response.status >= 500 && local?.html) return localPageResponse(local);
    const userId = response.headers.get('x-app-user');
    if (response.ok && userId && !response.redirected) {
      try { await setApplicationUser(userId, sessionRevision); }
      catch { /* 缓存写失败不阻断已经通过认证的在线页面。 */ }
      const html = (await response.text()).replace(/<html(?=[\s>])/i, `<html data-app-record-read-at="${recordReadAt}"`);
      const headers = new Headers(response.headers);
      for (const key of ['content-length', 'content-encoding']) headers.delete(key);
      const save = Promise.resolve().then(async () => {
        if (url.pathname === '/settings' && (await store.pending(userId)).some((operation) => operation.kind === 'settings')) return;
        const page = {html, headers: [...headers], recordReadAt};
        if (store.cachePage) await store.cachePage(userId, name, page, recordReadAt);
        else await store.writeState(userId, name, page);
      }).catch(() => {});
      if (background) background(save);
      else await save;
      return new Response(html, {status: response.status, headers});
    } else if (response.redirected && new URL(response.url).pathname === '/login' && sessionRevision === applicationSessionRevision) await clearApplicationSession();
    return response;
  } catch (error) {
    if (local?.html) return localPageResponse(local);
    throw error;
  }
}

/**
 * 保留导航语义并设置超时，由浏览器生成 User-Agent，避免宿主显示名污染可克隆请求头。
 * 异步函数也将请求构造时的同步异常交给页面回退逻辑。
 * @param {Request} request 同源页面导航请求。
 * @return {Promise<Response>} 在线页面响应。
 */
async function fetchApplicationPage(request) {
  const headers = [...request.headers].filter(([name]) => name.toLowerCase() !== 'user-agent');
  return await fetch(new Request(request, {headers, signal: applicationTimeout(10000)}));
}

/**
 * 为页面与通知请求设置超时，兼容缺少 AbortSignal.timeout 的 WebView。
 * @param {number} milliseconds 超时毫秒数。
 * @return {AbortSignal} 超时后取消网络读取的信号。
 */
function applicationTimeout(milliseconds) {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(milliseconds);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), milliseconds);
  return controller.signal;
}

/**
 * 重建私有离线 HTML 响应，保持安全头并去除与快照长度不符的传输头。
 * @param {{html: string, headers?: [string, string][]}} local 加密存储中的页面。
 * @return {Response} 禁止共享缓存的离线页面。
 */
function localPageResponse(local) {
  const headers = new Headers(local.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-app-offline', '1');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  if (!headers.has('content-security-policy')) headers.set('content-security-policy', 'default-src \'self\'; base-uri \'self\'; object-src \'none\'; frame-ancestors \'none\'; script-src \'self\' \'unsafe-inline\' https://accounts.google.com/gsi/client; style-src \'self\' \'unsafe-inline\'; img-src \'self\' https://cdn.max-c.com data: blob:; font-src \'self\' data:');
  for (const name of ['content-length', 'content-encoding', 'etag']) headers.delete(name);
  return new Response(local.html, {headers});
}

self.addEventListener('push', (event) => {
  event.waitUntil(showApplicationNotification(event));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openApplicationNotification(event.notification.data));
});

/**
 * 校验当前会话归属后显示通知，避免账号切换或退出后的排队消息泄露内容。
 * @param {PushEvent} event 浏览器推送事件。
 * @return {Promise<void>} 通知显示完成。
 */
async function showApplicationNotification(event) {
  try {
    const payload = event.data?.json();
    if (
        !payload || typeof payload.userId !== 'string' ||
        typeof payload.title !== 'string' ||
        typeof payload.body !== 'string' || typeof payload.tag !== 'string' ||
        typeof payload.deviceId !== 'string'
    ) return;
    const response = await fetch(
        `/api/app-notifications/status?device=${
            encodeURIComponent(payload.deviceId)
        }`,
        {credentials: 'include', cache: 'no-store', redirect: 'error'},
    );
    if (!response.ok) return;
    const status = await response.json();
    if (status.userId !== payload.userId || !status.enabled) return;
    // 此脚本运行于 Service Worker，self 的能力及 importScripts 导入对象由该宿主提供。
    // noinspection JSUnresolvedReference
    await self.registration.showNotification(payload.title.slice(0, 120), {
      body: payload.body.slice(0, 600),
      tag: payload.tag,
      renotify: false,
      icon: '/favicon.ico',
      data: {path: payload.path, userId: payload.userId, deviceId: payload.deviceId},
    });
  } catch {
    // 无法确认会话归属时不展示缓存中的账号内容。
  }
}

/**
 * 复核通知账号后打开本站页面；只聚焦已有目标页，不强制导航正在编辑的窗口。
 * @param {{path?: string, userId?: string, deviceId?: string} | undefined} data 通知所属设备、账号及路径。
 * @return {Promise<void>} 窗口操作完成。
 */
async function openApplicationNotification(data) {
  if (typeof data?.userId !== 'string' || typeof data?.deviceId !== 'string') return;
  try {
    const response = await fetch(`/api/app-notifications/status?device=${encodeURIComponent(data.deviceId)}`,
        {credentials: 'include', cache: 'no-store', redirect: 'error', signal: applicationTimeout(8000)});
    if (!response.ok) return;
    const status = await response.json();
    if (status.userId !== data.userId || !status.enabled) return;
  } catch {
    return;
  }
  let url = new URL('/', self.location.origin);
  try {
    const requested = new URL(data?.path || '/', self.location.origin);
    if (
        requested.origin === self.location.origin &&
        ['/', '/history'].includes(requested.pathname)
    ) url = requested;
  } catch {
    // 无效路径使用工作区首页。
  }
  // 此脚本运行于 Service Worker，self 的能力及 importScripts 导入对象由该宿主提供。
  // noinspection JSUnresolvedReference
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  for (const client of windows) {
    if (client.url !== url.href) continue;
    await client.focus();
    return;
  }
  // 此脚本运行于 Service Worker，self 的能力及 importScripts 导入对象由该宿主提供。
  // noinspection JSUnresolvedReference
  await self.clients.openWindow(url.href);
}
