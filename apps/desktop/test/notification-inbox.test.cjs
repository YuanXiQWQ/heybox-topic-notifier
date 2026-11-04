/** @file 验证桌面通知的账号绑定、游标确认和点击跳转。 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {harness} = require('./support/main-process.cjs');

test('notification cursor advances only after system display and failed events remain retryable', async () => {
  const context = harness();
  await context.handlers.get('app:notifications')(context.event, true);
  context.readWith(() => ({
    userId: 'alice',
    events: [{
      id: 'one',
      cursor: 'one',
      title: 'Title',
      body: 'Body',
      path: '/history',
    }],
  }));
  context.displayWith('');
  const pending = context.api.inbox.poll();
  while (!context.shown.length) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(context.device.value.notifications.cursor, '');
  assert.equal(context.device.value.notifications.seen.length, 0);
  context.shown[0].events.get('failed')();
  await assert.rejects(() => pending, /Notification failed/);
  assert.equal(context.device.value.notifications.cursor, '');
  assert.equal(context.shown[0].closed, true);
  context.displayWith('show');
  await context.api.inbox.poll();
  assert.equal(context.device.value.notifications.cursor, 'one');
  assert.equal(context.shown.length, 2);
});

test('notification navigation rechecks the account after saving pending edits', async () => {
  const context = harness();
  await context.handlers.get('app:notifications')(context.event, true);
  context.readWith(() => ({
    userId: 'alice',
    events: [{
      id: 'one',
      cursor: 'one',
      title: 'Title',
      body: 'Body',
      path: '/history',
    }],
  }));
  await context.api.inbox.poll();
  context.contents.executeJavaScript = () => {
    context.changeCookie('session-b');
    return Promise.resolve();
  };
  await context.shown[0].events.get('click')();
  assert.equal(context.opened.length, 0);
});

test('notification backlog merges across pages and confirms filtered tails', async () => {
  const context = harness();
  await context.handlers.get('app:notifications')(context.event, true);
  let page = 0;
  context.readWith(() => ({
    userId: 'alice', cursor: String(++page), hasMore: page < 3,
    events: page === 3 ? [] : [{
      id: 'post-' + page,
      cursor: String(page),
      title: 'App',
      body: 'Post ' + page,
      path: '/history'
    }],
  }));
  const pending = context.api.inbox.poll();
  assert.equal(context.api.inbox.poll(), pending);
  await pending;
  assert.equal(context.shown.length, 1);
  assert.equal(context.shown[0].data.title, 'App (2)');
  assert.equal(context.shown[0].data.body, 'Post 1\nPost 2');
  assert.match(context.shown[0].data.icon, /[\\/]favicon\.png$/);
  assert.equal(context.device.value.notifications.cursor, '3');
  assert.equal(context.device.value.notifications.seen.length, 2);
  context.readWith(() => ({
    userId: 'alice', cursor: '4', events: [{id: 'post-1', cursor: '4'}],
  }));
  await context.api.inbox.poll();
  assert.equal(context.shown.length, 1);
  assert.equal(context.device.value.notifications.cursor, '4');
});

test('notification setup cannot bind a response from an account replaced during the request', async () => {
  const context = harness();
  context.readWith(() => {
    context.changeCookie('session-b');
    return {userId: 'alice', cursor: ''};
  });
  await assert.rejects(
      () => context.handlers.get('app:notifications')(context.event, true),
      /Authentication/,
  );
  assert.equal(context.api.info().notifications.enabled, false);
});

test('removing the bound session cookie withdraws visible notifications without waiting for another poll', async () => {
  const context = harness();
  await context.handlers.get('app:notifications')(context.event, true);
  context.readWith(() => ({
    userId: 'alice', cursor: '1', events: [{id: 'n1', title: 'Title', body: 'Body'}],
  }));
  await context.api.inbox.poll();
  context.cookies.emit('changed', {}, {name: 'heybox_session', value: 'session-a'}, 'explicit', true);
  assert.equal(context.device.value.notifications.enabled, false);
  assert.equal(context.shown[0].closed, true);
});

test('a delayed enable request cannot undo a newer disable action', async () => {
  const context = harness();
  context.readWith(async () => {
    await context.handlers.get('app:notifications')(context.event, false);
    return {userId: 'alice', cursor: ''};
  });
  await assert.rejects(
      () => context.handlers.get('app:notifications')(context.event, true),
      /Authentication/,
  );
  assert.equal(context.api.info().notifications.enabled, false);
});

test('notifications recheck the account after a pending request and before opening a clicked alert', async () => {
  const context = harness();
  await context.handlers.get('app:notifications')(context.event, true);
  const event = {
    id: 'event',
    cursor: '0000000000000001:event',
    title: 'Private title',
    body: 'Private body',
    path: '/history',
  };
  context.readWith(() => Promise.resolve({userId: 'alice', events: [event]}));
  await context.api.inbox.poll();
  assert.equal(context.shown.length, 1);
  context.changeCookie('session-b');
  await context.shown[0].events.get('click')();
  assert.equal(context.opened.length, 0);

  context.changeCookie('session-a');
  context.readWith(() => {
    context.changeCookie('session-b');
    return {userId: 'alice', events: [{...event, id: 'second'}]};
  });
  await context.api.inbox.poll();
  assert.equal(context.shown.length, 1);
  assert.equal(context.shown[0].closed, true);
});
