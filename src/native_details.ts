/** @file 接收受保护进程管道中的原生匿名 SDK 状态，在当前出口提供回环详情服务。 */
import { createDetailRelayHandler } from "./services/heybox_detail_relay.ts";
import { openNativeRetryFile } from "./services/heybox_native_retry_file.ts";
import {
  createNativeSessionDetails,
  type HeyboxNativeSession,
  requireNativeSession,
} from "./services/heybox_native_session.ts";

/** 每行最多八千余个字符，禁止输入完整 App 缓存。 */
const maximumLineCharacters = 8192;

/**
 * 逐行读取有界进程输入；空行、无换行的残缺输入均视为管道错误。
 * @return {AsyncGenerator<unknown>} 已解析的内存对象，不输出原始输入。
 */
async function* messages(): AsyncGenerator<unknown> {
  let buffer = "";
  for await (
    const chunk of Deno.stdin.readable.pipeThrough(new TextDecoderStream())
  ) {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      if (end === 0 || end > maximumLineCharacters) {
        throw new Error("Invalid pipe input");
      }
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      yield JSON.parse(line);
    }
    if (buffer.length > maximumLineCharacters) {
      throw new Error("Invalid pipe input");
    }
  }
  if (buffer) throw new Error("Incomplete pipe input");
}

/**
 * 绑定固定匿名设备后启动独立鉴权入口；管道中断即关闭服务，SDK 快照不落盘。
 * @return {Promise<void>} 管道和 HTTP 服务关闭完成。
 */
async function main(): Promise<void> {
  const portText = Deno.args[0] ?? "8788";
  const port = Number(portText);
  const retryPath = Deno.args[1];
  if (
    !/^(0|[1-9]\d{0,4})$/.test(portText) || port > 65535 ||
    (port !== 0 && port < 1024) || Deno.args.length > 2
  ) {
    throw new Error("Invalid native relay port");
  }
  let server: Deno.HttpServer | undefined;
  let session: HeyboxNativeSession | undefined;
  let deviceId = "";
  let retryFile: Awaited<ReturnType<typeof openNativeRetryFile>> | undefined;
  try {
    for await (const message of messages()) {
      if (!message || typeof message !== "object") {
        throw new Error("Invalid pipe message");
      }
      const value = message as Record<string, unknown>;
      if (!server) {
        if (
          typeof value.token !== "string" ||
          !/^[A-Za-z0-9_-]{32,128}$/.test(value.token) ||
          typeof value.deviceId !== "string" ||
          !/^[a-f0-9]{16}$/.test(value.deviceId) ||
          Object.keys(value).some((key) =>
            !["token", "deviceId", "session", "requirePersistentCooldown"]
              .includes(key)
          ) ||
          (value.requirePersistentCooldown !== undefined &&
            value.requirePersistentCooldown !== true) ||
          (value.requirePersistentCooldown === true && !retryPath)
        ) {
          throw new Error("Invalid native relay initialization");
        }
        deviceId = value.deviceId;
        session = requireNativeSession(value.session, deviceId, Date.now());
        if (retryPath) {
          retryFile = await openNativeRetryFile(retryPath, deviceId);
        }
        const source = createNativeSessionDetails({
          expectedDeviceId: deviceId,
          readSession: () => Promise.resolve(session),
          initialRetryAt: retryFile?.retryAt,
          persistRetryAt: retryFile?.persist,
          /**
           * 通过既有私密传输报告恢复信号，不输出身份或令牌。
           * @param {"accepted" | "rejected"} status 完整请求结果或明确令牌拒绝。
           * @param {number} retryAt 已持久化的最早重试时间。
           * @param {number} observedAt 本次请求使用的观察时间，用于关联缓存更新。
           */
          onSessionStatus: (status, retryAt, observedAt) =>
            console.log(JSON.stringify({
              event: "native_session_status",
              status,
              observedAt,
              retryAfterSeconds: Math.max(
                0,
                Math.ceil((retryAt - Date.now()) / 1000),
              ),
            })),
        });
        server = Deno.serve({
          hostname: "127.0.0.1",
          port,
          /**
           * 只报告回环端口，供启动器检查独立服务是否就绪。
           * @param {Deno.NetAddr} address 实际监听地址。
           */
          onListen: (address) =>
            console.log(
              JSON.stringify({
                event: "native_detail_listening",
                port: address.port,
              }),
            ),
        }, createDetailRelayHandler({ token: value.token, source }));
      } else {
        if (Object.keys(value).length !== 1 || !("session" in value)) {
          throw new Error("Invalid native session update");
        }
        session = requireNativeSession(value.session, deviceId, Date.now());
        console.log(JSON.stringify({ event: "native_session_observed" }));
      }
    }
  } finally {
    session = undefined;
    try {
      await server?.shutdown();
    } finally {
      retryFile?.close();
    }
  }
}

try {
  await main();
} catch {
  console.error(
    JSON.stringify({
      event: "native_detail_stopped",
      reason: "initialization_or_pipe_failed",
    }),
  );
  Deno.exitCode = 1;
}
