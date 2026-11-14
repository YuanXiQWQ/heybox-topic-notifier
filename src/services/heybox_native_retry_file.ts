/** @file 用独占文件保存固定匿名设备的冷却检查点，不写入 SDK 标识或接口鉴权。 */

/** 限定单个检查点的大小，截断或格式异常时停止恢复。 */
const maximumStateBytes = 1024;

/**
 * 计算确定性的完整性摘要，用于识别格式仍合法的部分写入。
 * @param {string} text 设备编号或规范状态文本。
 * @return {Promise<string>} 小写 SHA-256 十六进制摘要。
 */
async function digest(text: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
      ),
    ),
  ].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * 打开并独占冷却文件；缺失时创建，已有空文件或损坏内容不能自动重置。
 * @param {string} path 运行账号专用的状态文件路径。
 * @param {string} deviceId 已核对的固定设备编号，仅保存其摘要。
 * @return {Promise<object>} 已恢复的期限、同步落盘方法和关闭方法。
 */
export async function openNativeRetryFile(path: string, deviceId: string) {
  if (!path || !/^[a-f0-9]{16}$/.test(deviceId)) {
    throw new Error("Invalid native retry file configuration");
  }
  const binding = await digest(deviceId);
  let created = false;
  let file: Deno.FsFile;
  try {
    file = await Deno.open(path, {
      read: true,
      write: true,
      createNew: true,
      mode: 0o600,
    });
    created = true;
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
    file = await Deno.open(path, { read: true, write: true });
  }
  try {
    if (!await file.tryLock(true)) throw new Error("Native retry file in use");
    let retryAt = 0;
    /**
     * 写入并同步当前文件后才允许后续请求；中途损坏由下次启动拒绝恢复。
     * @param {number} value 冷却期限，零表示没有已知冷却。
     * @return {Promise<void>} 字节和文件长度均已持久化。
     */
    const persist = async (value: number): Promise<void> => {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error("Invalid native retry deadline");
      }
      const state = { version: 1, binding, retryAt: value };
      const checksum = await digest(JSON.stringify(state));
      const bytes = new TextEncoder().encode(
        JSON.stringify({ ...state, checksum }) + "\n",
      );
      await file.seek(0, Deno.SeekMode.Start);
      let written = 0;
      while (written < bytes.length) {
        const count = await file.write(bytes.subarray(written));
        if (count === 0) throw new Error("Native retry write stalled");
        written += count;
      }
      await file.truncate(bytes.length);
      await file.sync();
    };
    if (created) {
      await persist(0);
    } else {
      const size = (await file.stat()).size;
      if (size < 1 || size > maximumStateBytes) {
        throw new Error("Invalid native retry file size");
      }
      const bytes = new Uint8Array(size);
      let read = 0;
      while (read < size) {
        const count = await file.read(bytes.subarray(read));
        if (!count) throw new Error("Incomplete native retry file");
        read += count;
      }
      const state = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
      if (
        state?.version !== 1 || state.binding !== binding ||
        !Number.isSafeInteger(state.retryAt) || state.retryAt < 0 ||
        Object.keys(state).some((key) =>
          !["version", "binding", "retryAt", "checksum"].includes(key)
        )
      ) throw new Error("Invalid native retry checkpoint");
      if (
        state.checksum !==
          await digest(
            JSON.stringify({ version: 1, binding, retryAt: state.retryAt }),
          )
      ) {
        throw new Error("Incomplete native retry write");
      }
      retryAt = state.retryAt;
    }
    return {
      retryAt,
      persist,
      /** 关闭描述符即释放独占锁，保留检查点供同一设备恢复。 */
      close: () => file.close(),
    };
  } catch {
    file.close();
    throw new Error("Native retry checkpoint unavailable");
  }
}
