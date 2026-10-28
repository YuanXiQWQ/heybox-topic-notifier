/** @file 在独立进程中运行真实下载器，验证退出暂停和进程中断后的磁盘检查点。 */
const {resumeDownload} = require('../../resumable-download.cjs');
/** 父测试进程提供的隔离下载参数，不包含用户配置。 */
const options = JSON.parse(process.argv[2]);
/** 正常退出路径使用的取消信号。 */
const controller = new AbortController();
process.on('message', message => { if (message === 'pause') controller.abort(); });
resumeDownload({
  ...options,
  signal: controller.signal,
  fetcher: (_url, request) => fetch(options.endpoint, request),
  onProgress: progress => process.send?.({type:'progress', transferred:progress.transferred}),
}).then(() => {
  process.send?.({type:'complete'});
  process.disconnect();
}, error => {
  process.send?.({type:controller.signal.aborted ? 'paused' : 'error', message:error.message});
  process.disconnect();
  if (!controller.signal.aborted) process.exitCode = 1;
});
