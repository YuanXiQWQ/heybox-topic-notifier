/** @file 使用固定匿名身份完成正常 SDK 配置握手、原生采集封装和注册续期。 */
import { Buffer } from "node:buffer";
import { createHeyboxSmConfigExchange } from "./heybox_sdk_config.ts";
import type { SdkIdentityStore } from "./heybox_sdk_identity.ts";

/** 原生采集器的私密输入，仅经子进程标准输入传输。 */
export type SdkRuntimeInput = {
  config: Record<string, unknown>;
  dynamic: { key: string; iv: string; collectors: string[]; messageId: string };
  sdkPayload: Record<string, string | number>;
};
/** SDK 刷新依赖，网络和采集可在离线测试中独立替换。 */
export type SdkRegistrationOptions = {
  identity: SdkIdentityStore;
  collect: (input: SdkRuntimeInput) => Promise<string>;
  fetchFn?: typeof fetch;
  now?: () => number;
};
/** SDK 注册失败和中途中断的最小冷却，不随令牌更换清除详情冷却。 */
const registrationCooldownMs = 900000;
/** 配置和注册响应的最大字节数。 */
const maximumResponseBytes = 1024 * 1024;

/**
 * 读取有界 SDK 响应并解析 JSON，错误不包含请求内容或加密材料。
 * @param {Response} response SDK HTTP 响应。
 * @return {Promise<Record<string, unknown>>} SDK 响应对象。
 */
async function readSdkResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error("SDK response unavailable");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > maximumResponseBytes) {
        throw new Error("SDK response exceeds limit");
      }
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const value = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid SDK response");
  }
  return value;
}

/**
 * 创建串行合并的刷新入口，使用现有服务端标识申请新令牌，失败时保留身份。
 * @param {SdkRegistrationOptions} options 持久状态、官方原生封装器和 HTTP 传输。
 * @return {() => Promise<void>} 完成注册并持久化的刷新函数。
 */
export function createSdkRefresher(
  options: SdkRegistrationOptions,
): () => Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;
  let pending: Promise<void> | undefined;

  /**
   * 发送一次 SDK 请求，限制目标、重定向、耗时和响应大小。
   * @param {string} path 已固定的 SDK 路径。
   * @param {string} body 原生报文或配置握手报文。
   * @return {Promise<Record<string, unknown>>} 已解析的 SDK 响应。
   */
  async function request(
    path: string,
    body: string,
  ): Promise<Record<string, unknown>> {
    return await readSdkResponse(
      await fetchFn(`https://fp-it.fengkongcloud.com${path}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      }),
    );
  }

  /**
   * 执行同一身份的一次完整配置、采集与注册流程。
   * @return {Promise<void>} 新令牌已持久化，或保留失败冷却并报错。
   */
  async function refresh(): Promise<void> {
    const state = options.identity.read();
    if (state.retryAt > now()) throw new Error("SDK registration cooling down");
    await options.identity.save({
      ...state,
      refreshRequired: true,
      retryAt: now() + registrationCooldownMs,
    });
    try {
      const exchange = createHeyboxSmConfigExchange({
        sessionId: state.sessionId,
        cachedDeviceId: state.registeredId,
      });
      const response = await request("/v3/cloudconf", exchange.body);
      if (response.code !== 1100) throw new Error();
      const config = exchange.decode(response);
      if (config.dynamicStatus !== "ready" || !config.dynamic) {
        throw new Error();
      }
      const body = await options.collect({
        config: config.value,
        dynamic: {
          ...config.dynamic,
          key: Buffer.from(config.dynamic.key).toString("base64"),
          iv: Buffer.from(config.dynamic.iv).toString("base64"),
        },
        sdkPayload: {
          a1: "all",
          a2: state.registeredId,
          a5: "",
          a6: "android",
          a7: "3.17.2",
          a9: now(),
          a11: "default",
          a80: state.sessionId,
          a96: "0yD85BjYvGFAvHaSQ1mc",
          a97: state.registeredId,
          a136: "build1",
        },
      });
      if (Buffer.byteLength(body) > maximumResponseBytes) throw new Error();
      const envelope = JSON.parse(body);
      if (
        envelope.organization !== "0yD85BjYvGFAvHaSQ1mc" ||
        envelope.appId !== "default" ||
        envelope.msgId !== config.dynamic.messageId ||
        typeof envelope.data !== "string" || !envelope.data
      ) throw new Error();
      const registration = await request("/deviceprofile/v4", body);
      const id = (registration.detail as { deviceId?: unknown } | undefined)
        ?.deviceId;
      if (
        registration.code !== 1100 || typeof id !== "string" ||
        !/^[A-Za-z0-9+/=_-]{88}$/.test(id)
      ) throw new Error();
      await options.identity.save({
        ...state,
        registeredId: id,
        registeredAt: now(),
        refreshRequired: false,
        retryAt: 0,
      });
    } catch {
      throw new Error("SDK registration unavailable");
    }
  }

  return () => {
    pending ??= refresh().finally(() => pending = undefined);
    return pending;
  };
}
