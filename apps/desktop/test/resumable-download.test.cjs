/** @file 验证网络中断、退出暂停、强杀尾部、范围回退和损坏文件不会产生无效安装包。 */
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {createHash} = require("node:crypto");
const {resumeDownload,restoreResume,installResumableDownload} = require("../resumable-download.cjs");
const {CancellationToken,CancellationError} = require("builder-util-runtime");
/** 固定测试安装包与官方地址，测试不访问网络。 */
const bytes = Buffer.from("complete verified installer"), url="https://github.com/owner/repo/releases/download/1/setup.exe";
/** @param {Function} run 测试操作。 @return {Promise<void>} 隔离文件已清理。 */
async function fixture(run) {
  const base=await fs.mkdtemp(path.join(os.tmpdir(),"heybox-resume-test-"));
  const options={root:path.join(base,"resume"),destination:path.join(base,"setup.exe"),url,sha512:createHash("sha512").update(bytes).digest("base64")};
  try { await run(options); } finally {
    assert.equal(path.dirname(base),path.resolve(os.tmpdir()));
    assert.match(path.basename(base),/^heybox-resume-test-/);
    await fs.rm(base,{recursive:true,force:true});
  }
}
/** @param {object} options 下载参数。 @return {Promise<void>} 取消后留下已校验前缀。 */
async function pause(options) {
  const controller=new AbortController();
  await assert.rejects(resumeDownload({...options,signal:controller.signal,
    onProgress:()=>controller.abort(),fetcher:()=>Promise.resolve(new Response(new ReadableStream({
      start(stream) { stream.enqueue(bytes.subarray(0,8)); stream.enqueue(bytes.subarray(8)); stream.close(); }
    }),{headers:{"content-length":String(bytes.length)}}))}));
  assert.equal((await restoreResume(options.root)).offset,8);
}
test("normal cancellation checkpoints bytes and a restarted transfer requests only the remaining range",()=>fixture(async options=>{
  await pause(options);
  await resumeDownload({...options,fetcher:(_url,request)=>{
    assert.equal(request.headers.range,"bytes=8-");
    return Promise.resolve(new Response(bytes.subarray(8),{status:206,headers:{"content-range":`bytes 8-${bytes.length-1}/${bytes.length}`}}));
  }});
  assert.deepEqual(await fs.readFile(options.destination),bytes);
}));
test("a force-killed uncommitted tail is truncated and a corrupt checkpoint is discarded",()=>fixture(async options=>{
  await pause(options);
  await fs.appendFile(path.join(options.root,"installer.part"),"uncommitted");
  assert.equal((await restoreResume(options.root)).offset,8);
  assert.equal((await fs.stat(path.join(options.root,"installer.part"))).size,8);
  await fs.writeFile(path.join(options.root,"installer.part"),"corrupted");
  assert.equal(await restoreResume(options.root),null);
  await assert.rejects(fs.stat(path.join(options.root,"installer.part")),{code:"ENOENT"});
}));
test("servers ignoring Range replace the partial package instead of appending a full response",()=>fixture(async options=>{
  await pause(options);
  await resumeDownload({...options,fetcher:()=>Promise.resolve(new Response(bytes,{headers:{"content-length":String(bytes.length)}}))});
  assert.deepEqual(await fs.readFile(options.destination),bytes);
}));
test("wrong ranges and wrong final digests cannot be installed or retained for another retry",()=>fixture(async options=>{
  await pause(options);
  await assert.rejects(resumeDownload({...options,fetcher:()=>Promise.resolve(new Response(bytes,{status:206,headers:{"content-range":`bytes 0-${bytes.length-1}/${bytes.length}`}}))}));
  assert.equal(await restoreResume(options.root),null);
  await assert.rejects(resumeDownload({...options,fetcher:()=>Promise.resolve(new Response(Buffer.alloc(bytes.length),{headers:{"content-length":String(bytes.length)}}))}));
  assert.equal(await restoreResume(options.root),null);
  await assert.rejects(fs.stat(options.destination),{code:"ENOENT"});
}));
test("a different release never appends to a checkpoint from another digest",()=>fixture(async options=>{
  await pause(options);
  const next=Buffer.from("next release"),sha512=createHash("sha512").update(next).digest("base64");
  await resumeDownload({...options,sha512,fetcher:(_url,request)=>{
    assert.equal(request.headers.range,undefined);
    return Promise.resolve(new Response(next,{headers:{"content-length":String(next.length)}}));
  }});
  assert.deepEqual(await fs.readFile(options.destination),next);
}));
test("the updater adapter preserves manual intent, cancellation semantics and resumable progress",()=>fixture(async options=>{
  const updater={httpExecutor:{download:()=>{throw new Error("Full download must use adapter");}},getOrCreateDownloadHelper:()=>Promise.resolve({cacheDir:path.dirname(options.root)})};
  let requests=0;
  installResumableDownload(updater,()=>true,(_url,request)=>{
    requests++;
    if (requests===1) return Promise.resolve(new Response(new ReadableStream({start(stream){stream.enqueue(bytes.subarray(0,8));stream.enqueue(bytes.subarray(8));stream.close();}}),{headers:{"content-length":String(bytes.length)}}));
    assert.equal(request.headers.range,"bytes=8-");
    return Promise.resolve(new Response(bytes.subarray(8),{status:206,headers:{"content-range":`bytes 8-${bytes.length-1}/${bytes.length}`}}));
  });
  const token=new CancellationToken();
  await assert.rejects(updater.httpExecutor.download(new URL(url),options.destination,{sha512:options.sha512,cancellationToken:token,onProgress:()=>token.cancel()}),CancellationError);
  assert.equal((await restoreResume(options.root)).manual,true);
  assert.equal(token.listenerCount("cancel"),0);
  await updater.httpExecutor.download(new URL(url),options.destination,{sha512:options.sha512,cancellationToken:new CancellationToken()});
  assert.deepEqual(await fs.readFile(options.destination),bytes);
  assert.equal(updater.disableDifferentialDownload,true);
}));
