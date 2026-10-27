/** @file 接收系统通知，并按账号隔离缓存页面、公共资源和离线编辑快照。 */
if (typeof importScripts === "function") importScripts("/static/app-sync/store.js");
/** 公共资源缓存不包含账号页面和业务请求。 */
const applicationResourceCache = "heybox-app-resources-v1";
self.addEventListener("install", (event) => { event.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener("message", (event) => { event.waitUntil(handleApplicationMessage(event)); });
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/logout" && event.request.method === "POST") {
    event.respondWith(clearApplicationSession().then(() => fetch(event.request)));
  } else if (event.request.method === "GET" && event.request.mode === "navigate" && ["/", "/settings", "/history", "/about"].includes(url.pathname)) {
    event.respondWith(applicationPage(event.request));
  } else if (event.request.method === "GET" && (url.pathname.startsWith("/static/") || url.pathname === "/favicon.ico")) {
    event.respondWith(applicationResource(event.request));
  }
});

/**
 * 退出时关闭离线页面入口，保留属于原账号的加密待同步操作。
 * @return {Promise<void>} 本机账号入口已清除。
 */
async function clearApplicationSession() {
  await self.AppLocalStore.writeState("__device", "active-user", null);
}

/**
 * 校验页面账号，并预取页面已声明的同源公共脚本与样式。
 * @param {ExtendableMessageEvent} event 页面消息。
 * @return {Promise<void>} 消息处理完成。
 */
async function handleApplicationMessage(event) {
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  if (event.data?.type === "app-session") {
    try {
      const response = await fetch("/api/sync/session", { cache: "no-store", redirect: "error" });
      if (!response.ok) return;
      const session = await response.json();
      if (session.userId === event.data.userId) await self.AppLocalStore.writeState("__device", "active-user", session.userId);
    } catch { /* 离线时不切换已经验证的账号。 */ }
  }
  if (event.data?.type === "app-resources" && Array.isArray(event.data.urls)) {
    await Promise.allSettled(event.data.urls.slice(0, 40).map(async (value) => {
      const url = new URL(value, self.location.origin);
      if (url.origin === self.location.origin && url.pathname.startsWith("/static/")) await applicationResource(new Request(url));
    }));
  }
  if (event.data?.type === "app-pages") {
    await Promise.allSettled(["/", "/settings", "/history", "/about", "/?range=all&page=1&pageSize=all", "/history?range=all&page=1&pageSize=all"].map((path) => applicationPage(new Request(self.location.origin + path))));
  }
}

/**
 * 优先获取最新公共资源，网络失败时读取已缓存版本。
 * @param {Request} request 同源资源请求。
 * @return {Promise<Response>} 在线或已缓存的资源。
 */
async function applicationResource(request) {
  const cache = await caches.open(applicationResourceCache);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached && !/\.(?:js|css)(?:\?|$)/.test(request.url)) return rangeResponse(request, cached);
  try {
    const response = await fetch(request);
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
  const range = request.headers.get("range");
  if (!range) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return response;
  const bytes = await response.arrayBuffer();
  const start = match[1] ? Number(match[1]) : Math.max(0, bytes.byteLength - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.byteLength - 1) : bytes.byteLength - 1;
  if (start > end || start >= bytes.byteLength) return new Response(null, { status: 416, headers: { "content-range": `bytes */${bytes.byteLength}` } });
  const headers = new Headers(response.headers);
  headers.set("content-range", `bytes ${start}-${end}/${bytes.byteLength}`);
  headers.set("content-length", String(end - start + 1));
  headers.set("accept-ranges", "bytes");
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

/**
 * 在当前账号内缓存页面，待同步设置优先使用本地编辑快照。
 * @param {Request} request 页面请求。
 * @return {Promise<Response>} 在线页面或当前账号离线页面。
 */
async function applicationPage(request) {
  const url = new URL(request.url);
  const name = `page:${url.pathname}${url.search}`;
  const store = self.AppLocalStore;
  let active = await store.readState("__device", "active-user");
  try {
    const identity = await fetch("/api/sync/session", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (identity.redirected || identity.status === 401 || identity.status === 403) {
      await clearApplicationSession();
      active = null;
    } else if (identity.ok) {
      active = (await identity.json()).userId;
      await store.writeState("__device", "active-user", active);
    }
  } catch { /* 网络不可达时只允许使用此前验证过的本机账号。 */ }
  const local = active ? await store.readState(active, name) : undefined;
  if (local?.html && url.pathname === "/settings" && (await store.pending(active)).some((operation) => operation.kind === "settings")) return localPageResponse(local);
  try {
    const response = await fetch(new Request(request, { signal: AbortSignal.timeout(10000) }));
    if (response.status >= 500 && local?.html) return localPageResponse(local);
    const userId = response.headers.get("x-app-user");
    if (response.ok && userId && !response.redirected) {
      await store.writeState("__device", "active-user", userId);
      await store.writeState(userId, name, { html: await response.clone().text(), headers: [...response.headers] });
    } else if (response.redirected && new URL(response.url).pathname === "/login") await clearApplicationSession();
    return response;
  } catch (error) {
    if (local?.html) return localPageResponse(local);
    throw error;
  }
}

/**
 * 重建私有离线 HTML 响应，保持安全头并去除与快照长度不符的传输头。
 * @param {{html: string, headers?: [string, string][]}} local 加密存储中的页面。
 * @return {Response} 禁止共享缓存的离线页面。
 */
function localPageResponse(local) {
  const headers = new Headers(local.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-app-offline", "1");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  if (!headers.has("content-security-policy")) headers.set("content-security-policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline'; img-src 'self' https://cdn.max-c.com data: blob:; font-src 'self' data:");
  for (const name of ["content-length", "content-encoding", "etag"]) headers.delete(name);
  return new Response(local.html, { headers });
}
self.addEventListener("push", (event) => {
  event.waitUntil(showApplicationNotification(event));
});
self.addEventListener("notificationclick", (event) => {
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
      !payload || typeof payload.userId !== "string" ||
      typeof payload.title !== "string" ||
      typeof payload.body !== "string" || typeof payload.tag !== "string" ||
      typeof payload.deviceId !== "string"
    ) return;
    const response = await fetch(
      `/api/app-notifications/status?device=${
        encodeURIComponent(payload.deviceId)
      }`,
      { credentials: "include", cache: "no-store", redirect: "error" },
    );
    if (!response.ok) return;
    const status = await response.json();
    if (status.userId !== payload.userId || !status.enabled) return;
    await self.registration.showNotification(payload.title.slice(0, 120), {
      body: payload.body.slice(0, 600),
      tag: payload.tag,
      renotify: false,
      icon: "/favicon.ico",
      data: { path: payload.path },
    });
  } catch {
    // 无法确认会话归属时不展示缓存中的账号内容。
  }
}

/**
 * 打开通知指向的本站页面，复用已有窗口并阻止外部地址导航。
 * @param {{path?: string} | undefined} data 通知路径。
 * @return {Promise<void>} 窗口操作完成。
 */
async function openApplicationNotification(data) {
  let url = new URL("/", self.location.origin);
  try {
    const requested = new URL(data?.path || "/", self.location.origin);
    if (
      requested.origin === self.location.origin &&
      ["/", "/history"].includes(requested.pathname)
    ) url = requested;
  } catch {
    // 无效路径使用工作区首页。
  }
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of windows) {
    if (new URL(client.url).origin !== self.location.origin) continue;
    await client.navigate(url.href);
    await client.focus();
    return;
  }
  await self.clients.openWindow(url.href);
}
