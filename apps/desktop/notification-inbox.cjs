/** @file 管理 Windows 当前设备和登录会话绑定的通知收件箱。 */
const {createHash} = require('node:crypto');

/**
 * 生成会话绑定摘要，不把 Cookie 明文保存到设备设置。
 * @param {string} value 会话令牌。
 * @return {string} 摘要。
 */
function cookieFingerprint(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * 监听会话切换，管理本设备的轮询、通知展示和已确认游标。
 * @param {object} options 设备存储、应用会话、系统通知和页面回调。
 * @param {() => void} options.emitState 通知开关变化后向页面发送设备状态。
 * @return {object} 设备开关和合并并发读取的轮询入口。
 */
function createNotificationInbox({webSession, device, origin, Notification, icon, emitState, showWindow}) {
  /** 并发轮询共用一批通知请求。 */
  let polling;
  /** 设备开关变更序号使旧的开启请求不能覆盖较新的关闭操作。 */
  let notificationRevision = 0;
  /** 当前会话展示的通知，退出登录时撤回。 */
  const visibleNotifications = new Set();

  webSession.cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (
        cookie.name === 'heybox_session' &&
        (removed ||
            device.value.notifications?.session !== cookieFingerprint(cookie.value))
    ) void disableNotifications();
  });

  /**
   * 读取当前认证会话摘要。
   * @return {Promise<string>} 摘要或空值。
   */
  async function sessionFingerprint() {
    const cookies = await webSession.cookies.get({
      url: origin,
      name: 'heybox_session',
    });
    return cookies[0] ? cookieFingerprint(cookies[0].value) : '';
  }

  /**
   * 读取账号通知接口，拒绝跳转到登录页后误当作 JSON 成功。
   * @param {string} [after] 消费游标；省略时读取当前账号的初始批次。
   * @return {Promise<object>} 服务端通知批次。
   */
  async function readNotifications(after) {
    const url = origin + '/api/native/notifications' +
        (after === undefined ? '' : '?after=' + encodeURIComponent(after));
    const response = await webSession.fetch(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('Notifications unavailable');
    return response.json();
  }

  /**
   * 开启时绑定当前账号和会话，并从当前游标开始；关闭时立即撤回可见通知。
   * @param {boolean} enabled 当前设备开关。
   * @return {Promise<void>} 设置已完成。
   */
  async function setNotifications(enabled) {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid notification preference');
    }
    if (!enabled) {
      await disableNotifications();
      return;
    }
    if (!Notification.isSupported()) throw new Error('Notifications unsupported');
    const revision = ++notificationRevision;
    const before = await sessionFingerprint();
    const batch = await readNotifications();
    const fingerprint = await sessionFingerprint();
    if (
        !fingerprint || fingerprint !== before ||
        revision !== notificationRevision || typeof batch.userId !== 'string'
    ) {
      throw new Error('Authentication required');
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
  }

  /**
   * 停用设备通知并撤回当前进程创建的系统提示。
   * @return {Promise<void>} 设备偏好已保存。
   */
  async function disableNotifications() {
    notificationRevision++;
    device.value.notifications = {enabled: false};
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
    polling ??= consumeNotifications().finally(() => {
      polling = undefined;
    });
    return polling;
  }

  /**
   * 在账号和会话仍相同时合并分页积压；成功展示摘要后确认事件和已过滤项。
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
    let cursor = binding.cursor;
    const events = [], ids = new Set(binding.seen), posts = new Set();
    // 一次补取最多十页，所有可见积压合为一条系统通知。
    for (let page = 0; page < 10; page++) {
      const batch = await readNotifications(cursor);
      const fingerprint = await sessionFingerprint();
      if (device.value.notifications !== binding) return;
      if (batch.userId !== binding.userId || fingerprint !== binding.session) {
        await disableNotifications();
        return;
      }
      for (const event of batch.events) {
        if (!ids.has(event.id)) {
          const key = event.kind === 'match' && event.postId ? 'post:' + event.postId : 'event:' + event.id;
          if (!posts.has(key)) {
            events.push(event);
            posts.add(key);
          }
          ids.add(event.id);
        }
      }
      const next = batch.cursor ?? batch.events.at(-1)?.cursor ?? cursor;
      if (next < cursor || (next === cursor && batch.events.length)) throw new Error('Invalid notification cursor');
      cursor = next;
      if (!(batch.hasMore ?? batch.events.length === 100)) break;
    }
    if (device.value.notifications !== binding) return;
    const fingerprint = await sessionFingerprint();
    if (device.value.notifications !== binding) return;
    if (fingerprint !== binding.session) {
      await disableNotifications();
      return;
    }
    if (events.length) {
      const event = events[0];
      const current = await sessionFingerprint();
      if (device.value.notifications !== binding) return;
      if (current !== binding.session) {
        await disableNotifications();
        return;
      }
      const notification = new Notification({
        title: String(event.title).slice(0, 120) + (events.length > 1 ? ` (${events.length})` : ''),
        body: events.slice(0, 3).map((item) => String(item.body)).join('\n').slice(0, 300),
        icon,
        silent: false,
      });
      notification.on('click', async () => {
        try {
          const current = await sessionFingerprint();
          if (
              device.value.notifications === binding &&
              current === binding.session
          ) {
            await showWindow(
                events.length > 1 ? '/' : event.path,
                async () =>
                    device.value.notifications === binding &&
                    await sessionFingerprint() === binding.session,
            );
          }
        } catch { /* 已过期通知的点击不切换当前账号页面。 */
        }
      });
      notification.on('close', () => visibleNotifications.delete(notification));
      visibleNotifications.add(notification);
      await showNotification(notification);
      if (device.value.notifications !== binding || await sessionFingerprint() !== binding.session) {
        notification.close();
        return;
      }
      for (const previous of visibleNotifications) if (previous !== notification) {
        previous.close();
        visibleNotifications.delete(previous);
      }
    }
    if (device.value.notifications !== binding) return;
    if (cursor === binding.cursor && !events.length) return;
    const previousCursor = binding.cursor, previousSeen = binding.seen;
    binding.cursor = cursor;
    binding.seen = [...ids].slice(-2048);
    try {
      await device.save();
    } catch (error) {
      binding.cursor = previousCursor;
      binding.seen = previousSeen;
      throw error;
    }
  }

  /**
   * 等待系统确认展示；失败或超时保留游标，下轮可重新投递。
   * @param {import('electron').Notification} notification Electron 系统通知实例。
   * @return {Promise<void>} 系统已接受展示。
   */
  function showNotification(notification) {
    return new Promise((resolve, reject) => {
      let settled = false;
      /** @param {Error} [error] 展示失败原因；省略时表示已展示。 */
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          visibleNotifications.delete(notification);
          notification.close();
          reject(error);
        } else resolve();
      };
      const timer = setTimeout(
          () => finish(new Error('Notification timed out')),
          10000,
      );
      notification.once('show', () => finish());
      notification.once('failed', () => finish(new Error('Notification failed')));
      notification.once(
          'close',
          () => finish(new Error('Notification closed before display')),
      );
      try {
        notification.show();
      } catch (error) {
        finish(error);
      }
    });
  }

  return {setEnabled: setNotifications, poll: pollNotifications};
}

module.exports = {createNotificationInbox};
