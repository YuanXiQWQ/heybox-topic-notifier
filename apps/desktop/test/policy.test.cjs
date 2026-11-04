/** @file 验证远程页面不能通过原生桥的 URL 策略访问系统文件或命令。 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {applicationOrigin, applicationUserAgent, assetPath, externalUrl} = require('../policy.cjs');

test('network product names remain ASCII without changing runtime versions', () => {
  const original = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) 小黑盒话题提醒/3.13.3 Chrome/156.0.8078.49 Electron/45.1.0';
  const result = applicationUserAgent(original);
  assert.equal(result, original.replace('小黑盒话题提醒', 'HeyboxTopicNotifier'));
  assert.doesNotThrow(() => new Headers({'user-agent': result}));
  assert.equal(applicationUserAgent(result), result);
});

test('application origins reject insecure servers and credential URLs', () => {
  assert.equal(
      applicationOrigin('https://example.com/app', false),
      'https://example.com',
  );
  assert.equal(
      applicationOrigin('http://127.0.0.1:9143', true),
      'http://127.0.0.1:9143',
  );
  assert.throws(() => applicationOrigin('http://example.com', true));
  assert.throws(() =>
      applicationOrigin('https://user:password@example.com', false)
  );
});
test('external links cannot launch local protocols', () => {
  for (
      const value of [
    'file:///C:/Windows',
    'javascript:alert(1)',
    'powershell:command',
    'ms-settings:privacy',
    'https://a:b@example.com',
  ]
      ) assert.equal(externalUrl(value), false);
  assert.equal(
      externalUrl('https://github.com/YuanXiQWQ/heybox-topic-notifier'),
      true,
  );
});
test('bundled assets stay within their directory and trusted origin', () => {
  const root = path.resolve('assets');
  assert.equal(
      assetPath(
          root,
          'https://example.com/static/fun/movie.mp4?v=1',
          'https://example.com',
      ),
      path.join(root, 'fun/movie.mp4'),
  );
  for (
      const value of [
    'https://other.com/static/file.js',
    'https://example.com/static/%2e%2e%2fsecret',
    'https://example.com/static/..%5csecret',
    'https://example.com/static/C:%5csecret',
    'https://example.com/account/avatar',
  ]
      ) assert.equal(assetPath(root, value, 'https://example.com'), undefined);
});
