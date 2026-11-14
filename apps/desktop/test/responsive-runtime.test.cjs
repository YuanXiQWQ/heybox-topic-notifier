/** @file 启动隐藏的隔离 Electron 实例验证操作延迟和失败恢复，结束后清理测试数据。 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

for (const platform of ['windows', 'web']) test(platform + ' local actions respond before slow uploads and recover safely', {timeout: 90000}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'heybox-responsive-test-'));
  const env = {...process.env};
  delete env.ELECTRON_RUN_AS_NODE;
  let child, timer;
  try {
    const result = await new Promise((resolve, reject) => {
      child = spawn(require('electron'), [path.join(__dirname, 'fixtures/responsive-runtime.cjs'), directory, platform], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env});
      let output = '';
      child.stdout.on('data', value => { output += value; });
      child.stderr.on('data', value => { output += value; });
      timer = setTimeout(() => child.kill(), 75000);
      child.once('error', reject);
      child.once('exit', code => resolve({code, output}));
    });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /RESPONSIVE_ACTIONS_OK/);
    console.log(result.output.trim());
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null) child.kill();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    await fs.rm(directory, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});
  }
});
