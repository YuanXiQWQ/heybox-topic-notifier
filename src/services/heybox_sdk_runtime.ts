/** @file 有界启动无界面的 JVM 执行器，官方 SDK 文件必须与已验证版本一致。 */
import { isAbsolute, join } from "node:path";
import type { SdkRuntimeInput } from "./heybox_sdk_registration.ts";

/** 官方 1.3.400/build1149 APK 内 ARM64 原生库的 SHA-256。 */
const expectedLibrarySha256 =
  "294fdbaeea83a95c2de92fb608f82228c8041149ce539152a261d85433d4136c";
/** 子进程输入与输出均限定为一 MiB。 */
const maximumBytes = 1024 * 1024;
/** JVM 一次采集的最长时间，不常驻完整 Android 系统。 */
const collectTimeoutMs = 20000;

/** 运行器的已安装路径，均由部署配置提供。 */
export type SdkRuntimeOptions = {
  java: string;
  directory: string;
  stateDirectory: string;
  library: string;
};

/**
 * 校验原生库并准备隔离工作目录，返回每次运行均有限时的 SDK 封装器。
 * @param {SdkRuntimeOptions} options 已安装的 JVM、构建产物、原生库与私有状态路径。
 * @return {Promise<(input: SdkRuntimeInput) => Promise<string>>} 返回原生 SDK 报文的执行函数。
 */
export async function createSdkRuntime(
  options: SdkRuntimeOptions,
): Promise<(input: SdkRuntimeInput) => Promise<string>> {
  if (
    Deno.build.os !== "linux" ||
    Object.values(options).some((path) => !isAbsolute(path))
  ) {
    throw new Error("SDK runtime requires absolute Linux paths");
  }
  const library = await Deno.readFile(options.library);
  const hash = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", library)),
  ].map((v) => v.toString(16).padStart(2, "0")).join("");
  if (hash !== expectedLibrarySha256) {
    throw new Error("SDK library version mismatch");
  }
  const workingDirectory = join(options.stateDirectory, "runtime");
  await Deno.mkdir(workingDirectory, { recursive: true, mode: 0o700 });

  /**
   * 读取子进程有界标准输出，任何多余日志都不能冒充注册报文。
   * @param {ReadableStream<Uint8Array>} stream 子进程标准输出。
   * @return {Promise<string>} 完整 SDK JSON。
   */
  async function readOutput(
    stream: ReadableStream<Uint8Array>,
  ): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text = "", bytes = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) return text + decoder.decode();
        bytes += next.value.byteLength;
        if (bytes > maximumBytes) throw new Error("SDK output exceeds limit");
        text += decoder.decode(next.value, { stream: true });
      }
    } finally {
      await reader.cancel();
    }
  }

  return async (input: SdkRuntimeInput): Promise<string> => {
    const bytes = new TextEncoder().encode(JSON.stringify(input));
    if (bytes.length > maximumBytes) throw new Error("SDK input exceeds limit");
    const child = new Deno.Command(options.java, {
      args: [
        "--add-opens=java.base/sun.security.x509=ALL-UNNAMED",
        "-Xmx128m",
        "-cp",
        `${join(options.directory, "target/classes")}:${
          join(options.directory, "target/lib/*")
        }`,
        "NativeSdkRuntime",
        options.library,
        join(options.directory, "public-cert.txt"),
      ],
      cwd: workingDirectory,
      stdin: "piped",
      stdout: "piped",
      stderr: "null",
    }).spawn();
    const timeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch { /* 子进程可能已退出。 */ }
    }, collectTimeoutMs);
    try {
      const input = (async () => {
        const writer = child.stdin.getWriter();
        try {
          await writer.write(bytes);
          await writer.close();
        } finally {
          writer.releaseLock();
        }
      })();
      const [body, status] = await Promise.all([
        readOutput(child.stdout),
        child.status,
        input,
      ]);
      if (!status.success || !body) throw new Error();
      return body;
    } catch {
      try {
        child.kill("SIGKILL");
      } catch { /* 已退出的进程无需再次终止。 */ }
      await child.status;
      throw new Error("SDK runtime unavailable");
    } finally {
      clearTimeout(timeout);
    }
  };
}
