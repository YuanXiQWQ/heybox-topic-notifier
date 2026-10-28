/** @file 通过实际 HTTP 流和独立 Node 进程验证更新下载的退出、强制中断及续传。 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fork} = require('node:child_process');
const {createServer} = require('node:http');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {restoreResume} = require('../resumable-download.cjs');
/** 测试数据超过检查点周期，保证强杀时既有持久前缀也有未提交尾部。 */
const bytes = Buffer.alloc(12 * 1024 * 1024, 73);

/**
 * 启动独立下载进程并收集退出结果。
 * @param {object} options 隔离目录和本机 HTTP 地址。
 * @param {string} mode 强杀、正常暂停或完成。
 * @return {Promise<void>} 子进程按预期结束。
 */
function transfer(options, mode) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname,'fixtures/download-process.cjs'), [JSON.stringify(options)], {windowsHide:true, stdio:['ignore','ignore','pipe','ipc']});
    let requested = false, outcome, stderr = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Download child timeout')); }, 20000);
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('message', message => {
      if (message.type !== 'progress') outcome = message.type;
      if (mode !== 'complete' && !requested && message.transferred >= 6 * 1024 * 1024) {
        requested = true;
        if (mode === 'kill') child.kill('SIGKILL'); else child.send('pause');
      }
    });
    child.on('exit', code => {
      clearTimeout(timeout);
      try {
        if (mode === 'kill') assert.equal(requested, true);
        else { assert.equal(code, 0, stderr); assert.equal(outcome, mode === 'pause' ? 'paused' : 'complete'); }
        resolve();
      } catch (error) { reject(error); }
    });
  });
}

for (const mode of ['pause','kill']) {
  test(`real HTTP download resumes after process ${mode}`, async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(),'heybox-download-process-'));
    const ranges = [];
    const server = createServer((request, response) => {
      const start = Number(/^bytes=(\d+)-$/.exec(request.headers.range || '')?.[1] || 0);
      ranges.push(start);
      response.writeHead(start ? 206 : 200, {'content-length':bytes.length-start, ...(start ? {'content-range':`bytes ${start}-${bytes.length-1}/${bytes.length}`} : {})});
      let offset = start;
      const timer = setInterval(() => {
        const end = Math.min(offset + 256 * 1024, bytes.length);
        response.write(bytes.subarray(offset,end)); offset = end;
        if (offset === bytes.length) { clearInterval(timer); response.end(); }
      }, 8);
      response.on('close', () => clearInterval(timer));
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const options = {root:path.join(base,'resume'), destination:path.join(base,'setup.exe'), url:'https://github.com/owner/repo/releases/download/test/setup.exe', sha512:createHash('sha512').update(bytes).digest('base64'), endpoint:`http://127.0.0.1:${server.address().port}/setup.exe`};
    try {
      await transfer(options,mode);
      const before = (await fs.stat(path.join(options.root,'installer.part'))).size;
      const saved = await restoreResume(options.root);
      assert.ok(saved.offset >= 4 * 1024 * 1024);
      assert.ok(saved.offset < bytes.length);
      if (mode === 'kill') assert.ok(before > saved.offset);
      assert.equal((await fs.stat(path.join(options.root,'installer.part'))).size,saved.offset);
      await transfer(options,'complete');
      assert.deepEqual(ranges,[0,saved.offset]);
      assert.deepEqual(await fs.readFile(options.destination),bytes);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      assert.equal(path.dirname(base),path.resolve(os.tmpdir()));
      assert.match(path.basename(base),/^heybox-download-process-/);
      await fs.rm(base,{recursive:true,force:true});
    }
  });
}
