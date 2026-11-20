/** @file 在独立的 Electron 实用进程中启动 Windows 安装器，并向主进程确认系统已创建子进程。 */
const {spawn} = require('node:child_process');

/** 启动参数仅由主进程根据已核验的发行缓存构造。 */
const [installer, elevationHelper, mode] = process.argv.slice(2);
/** NSIS 沿用已有安装范围和目录，静默更新后重新启动应用。 */
const args = ['--updated', '/S', '--force-run'];

/**
 * 等待 Windows 接受启动请求，安装器可在原应用退出后继续运行。
 * @param {boolean} elevated 是否通过发行包内的提权助手启动。
 * @return {Promise<void>} 子进程已经启动，或系统返回启动错误。
 */
function startInstaller(elevated) {
  return new Promise((resolve, reject) => {
    const child = spawn(elevated ? elevationHelper : installer, elevated ? [installer, ...args] : args,
        {detached: true, stdio: 'ignore', windowsHide: true});
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

/**
 * 按发行清单选择权限，系统要求提升权限时交由 Windows 处理授权。
 * @return {Promise<void>} 安装器或提权助手已启动。
 */
async function launch() {
  const elevated = mode === 'elevated';
  try {
    await startInstaller(elevated);
  } catch (error) {
    if (elevated || !['EACCES', 'UNKNOWN'].includes(error.code)) throw error;
    await startInstaller(true);
  }
}

void launch().then(
    () => process.parentPort.postMessage('started'),
    () => process.parentPort.postMessage('failed'),
);
