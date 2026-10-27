/** @file 接收 Web Push 系统通知，并将通知点击限制到当前站点。 */
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
