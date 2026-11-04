/** @file 启动真实 Electron 验证中文应用名下的导航，并自动清理隔离浏览器数据。 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

test('Chinese desktop app loads navigation, reopened windows and offline pages', {skip: process.platform !== 'win32', timeout: 60000}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'heybox-navigation-test-'));
  const env = {...process.env};
  delete env.ELECTRON_RUN_AS_NODE;
  let child, timer;
  try {
    const result = await new Promise((resolve, reject) => {
      child = spawn(require('electron'), [path.join(__dirname, 'fixtures/navigation-runtime.cjs'), directory], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env,
      });
      let output = '';
      child.stdout.on('data', value => { output += value; });
      child.stderr.on('data', value => { output += value; });
      timer = setTimeout(() => child.kill(), 45000);
      child.once('error', reject);
      child.once('exit', code => resolve({code, output}));
    });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /NATIVE_NAVIGATION_OK/);
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null) child.kill();
    await fs.rm(directory, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});
  }
});
