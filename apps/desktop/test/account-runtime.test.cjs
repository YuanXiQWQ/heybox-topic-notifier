/** @file 用隔离 Electron 检查 First Trumpet 保存与白夜入场音频，不访问真实账号。 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

test('First Trumpet saves without a 404 and WhiteNight entry audio follows each stage', {timeout: 180000}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'heybox-account-test-'));
  const env = {...process.env};
  delete env.ELECTRON_RUN_AS_NODE;
  let child, timer;
  try {
    const result = await new Promise((resolve, reject) => {
      child = spawn(require('electron'), [path.join(__dirname, 'fixtures/account-runtime.cjs'), directory], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env,
      });
      let output = '';
      child.stdout.on('data', value => { output += value; });
      child.stderr.on('data', value => { output += value; });
      timer = setTimeout(() => child.kill(), 160000);
      child.once('error', reject);
      child.once('exit', code => resolve({code, output}));
    });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /FIRST_TRUMPET_ACCOUNT_OK/);
    assert.match(result.output, /ADVENT_FONT_OK/);
    assert.equal((result.output.match(/WHITE_NIGHT_ENTRY_OK/g) || []).length, 2);
    assert.match(result.output, /PLAGUE_DOCTOR_ENTRY_OK/);
    console.log(result.output.trim());
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null) child.kill();
    await fs.rm(directory, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});
  }
});
