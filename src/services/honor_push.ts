/** @file 通过荣耀官方 HTTPS 接口发送无业务正文的唤醒消息，由应用校验账号后补取通知。 */
import type { Storage } from "../storage/types.ts";
import type { NativePushDevice } from "../storage/native_push_types.ts";
import type { NativeNotification } from "../storage/native_notifications.ts";

/** 服务端应用凭据，不下发到客户端。 */
export type HonorPushConfig = {
  appId: string;
  clientId: string;
  clientSecret: string;
};
/** 短时应用级令牌只在服务端内存缓存。 */
let authorization:
  | { key: string; token: string; expiresAt: number }
  | undefined;

/**
 * 仅在完整配置存在时启用荣耀通道。
 * @return {HonorPushConfig | undefined} 有效配置。
 */
export function honorPushConfig(): HonorPushConfig | undefined {
  const appId = Deno.env.get("HONOR_PUSH_APP_ID")?.trim() ?? "";
  const clientId = Deno.env.get("HONOR_PUSH_CLIENT_ID")?.trim() ?? "";
  const clientSecret = Deno.env.get("HONOR_PUSH_CLIENT_SECRET")?.trim() ?? "";
  return /^[0-9]+$/.test(appId) && clientId && clientSecret
    ? { appId, clientId, clientSecret }
    : undefined;
}

/**
 * 获取短时应用鉴权令牌，拒绝把凭据转发到重定向地址。
 * @param {HonorPushConfig} config 官方应用配置。
 * @param {typeof fetch} fetcher HTTPS 请求实现。
 * @return {Promise<string>} 应用级访问令牌。
 */
async function accessToken(
  config: HonorPushConfig,
  fetcher: typeof fetch,
): Promise<string> {
  const key = JSON.stringify(config);
  if (authorization?.key === key && authorization.expiresAt > Date.now()) {
    return authorization.token;
  }
  const response = await fetcher("https://iam.developer.honor.com/auth/token", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  if (!response.ok) throw new Error("Honor authorization unavailable");
  const data = await response.json();
  if (
    typeof data.access_token !== "string" || !data.access_token ||
    !Number.isFinite(data.expires_in) || data.expires_in <= 0
  ) throw new Error("Invalid Honor authorization");
  authorization = {
    key,
    token: data.access_token,
    expiresAt: Date.now() +
      Math.max(0, Math.min(data.expires_in, 3600) - 60) * 1000,
  };
  return authorization.token;
}

/**
 * 只发送事件标识，通知正文在设备验证当前会话后从本站获取。
 * @param {NativePushDevice} device 厂商设备。
 * @param {NativeNotification} event 已持久化事件。
 * @param {HonorPushConfig} config 官方应用配置。
 * @param {typeof fetch} fetcher HTTPS 请求实现。
 * @return {Promise<"sent" | "expired">} 厂商受理或明确 token 失效。
 */
export async function deliverHonorPush(
  device: NativePushDevice,
  event: NativeNotification,
  config: HonorPushConfig,
  fetcher: typeof fetch = fetch,
): Promise<"sent" | "expired"> {
  const token = await accessToken(config, fetcher);
  const response = await fetcher(
    `https://push-api.cloud.honor.com/api/v1/${config.appId}/sendMessage`,
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        timestamp: String(Date.now()),
      },
      body: JSON.stringify({
        data: JSON.stringify({ type: "matches", eventId: event.id }),
        token: [device.token],
        android: { ttl: "86400s" },
      }),
    },
  );
  if (response.status === 401) authorization = undefined;
  if (!response.ok) throw new Error("Honor delivery unavailable");
  const result = await response.json();
  if (
    Array.isArray(result.data?.expireTokens) &&
    result.data.expireTokens.includes(device.token)
  ) return "expired";
  if (
    result.code !== 200 || result.data?.sendResult !== true ||
    result.data?.failTokens?.includes(device.token)
  ) throw new Error("Honor delivery rejected");
  return "sent";
}

/**
 * 验证设备仍属于当前会话，独立投递并仅清理被检查过的失效绑定。
 * @param {Storage} storage 权威存储。
 * @param {string} userId 账号。
 * @param {NativeNotification} event 已保存事件。
 * @param {object} options 可注入配置与传输以运行离线测试。
 * @return {Promise<boolean>} 是否至少有一个厂商接受事件。
 */
export async function notifyHonorDevices(
  storage: Storage,
  userId: string,
  event: NativeNotification,
  options: { config?: HonorPushConfig; deliver?: typeof deliverHonorPush } = {},
): Promise<boolean> {
  const config = options.config ?? honorPushConfig();
  if (!config || !storage.nativePush) return false;
  let accepted = false;
  for (const device of await storage.nativePush.list(userId)) {
    try {
      const session = await storage.getSession(device.sessionHash);
      if (
        !session || session.userId !== userId ||
        Date.parse(session.expiresAt) <= Date.now()
      ) {
        await storage.nativePush.remove(device.id, userId, device.sessionHash);
        continue;
      }
      const result = await (options.deliver ?? deliverHonorPush)(
        device,
        event,
        config,
      );
      if (result === "expired") {
        await storage.nativePush.remove(device.id, userId, device.sessionHash);
      } else accepted = true;
    } catch {
      console.warn("荣耀通知投递暂时不可用。");
    }
  }
  return accepted;
}
