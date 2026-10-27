/** @file 验证浏览器订阅并通过标准 Web Push 发送与账号会话绑定的系统通知。 */
// @deno-types="npm:@types/web-push@3.6.4"
import webPush from "web-push";
import { createECDH } from "node:crypto";
import { Buffer } from "node:buffer";
import { getMessages } from "../locales/index.ts";
import type { AppSettings, MatchRecord } from "../models.ts";
import { sessionTokenHash } from "../auth/session.ts";
import type { Storage } from "../storage/types.ts";
import type {
  BrowserPushSubscription,
  WebPushDevice,
} from "../storage/web_push_types.ts";
import { validateHttpEndpoint } from "./outbound_security.ts";

/** 浏览器推送服务的固定允许主机，不接受用户任意指定出站服务。 */
const pushHosts = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "*.notify.windows.com",
  "web.push.apple.com",
];
/** VAPID 公私钥及发行者联系信息。 */
export type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};
/** 推送载荷只允许打开本站路径。 */
export type AppNotification = {
  userId: string;
  deviceId?: string;
  title: string;
  body: string;
  tag: string;
  path: string;
};

/**
 * 读取完整有效的 VAPID 配置；未配置时保持其它通知方式可用。
 * @return {WebPushConfig | undefined} 可用的浏览器推送配置。
 */
export function webPushConfig(): WebPushConfig | undefined {
  const publicKey = Deno.env.get("WEB_PUSH_PUBLIC_KEY")?.trim() ?? "";
  const privateKey = Deno.env.get("WEB_PUSH_PRIVATE_KEY")?.trim() ?? "";
  const subject = Deno.env.get("WEB_PUSH_SUBJECT")?.trim() ?? "";
  if (
    !/^[A-Za-z0-9_-]{87}$/.test(publicKey) ||
    !/^[A-Za-z0-9_-]{43}$/.test(privateKey) ||
    !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject)
  ) return undefined;
  try {
    const pair = createECDH("prime256v1");
    pair.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (pair.getPublicKey().toString("base64url") !== publicKey) {
      return undefined;
    }
    return { publicKey, privateKey, subject };
  } catch {
    return undefined;
  }
}

/**
 * 从不可信 JSON 提取浏览器订阅并拒绝非推送服务和非法加密材料。
 * @param {unknown} value 客户端提交的数据。
 * @return {BrowserPushSubscription | undefined} 通过校验的订阅。
 */
export function parseBrowserSubscription(
  value: unknown,
): BrowserPushSubscription | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<BrowserPushSubscription>;
  if (
    typeof item.endpoint !== "string" || item.endpoint.length > 2048 ||
    !item.keys ||
    !/^[A-Za-z0-9_-]{22}$/.test(item.keys.auth) ||
    !/^[A-Za-z0-9_-]{87}$/.test(item.keys.p256dh)
  ) return undefined;
  const endpoint = validateHttpEndpoint(item.endpoint, {
    allowedHosts: pushHosts,
    serviceLabel: "Web Push",
  });
  if (!endpoint.ok || new URL(endpoint.value).hash) return undefined;
  return {
    endpoint: endpoint.value,
    keys: { auth: item.keys.auth, p256dh: item.keys.p256dh },
  };
}

/**
 * 发送加密通知；失效订阅返回 expired，临时错误由调用方记录。
 * @param {WebPushDevice} device 订阅设备。
 * @param {AppNotification} notification 通知载荷。
 * @param {WebPushConfig} config VAPID 配置。
 * @param {typeof fetch} fetcher 出站请求实现。
 * @return {Promise<"sent" | "expired">} 推送服务受理状态，不代表用户已阅读。
 */
export async function deliverWebPush(
  device: WebPushDevice,
  notification: AppNotification,
  config: WebPushConfig,
  fetcher: typeof fetch = fetch,
): Promise<"sent" | "expired"> {
  const subscription = parseBrowserSubscription(device.subscription);
  if (!subscription) return "expired";
  const request = webPush.generateRequestDetails(
    subscription,
    JSON.stringify(notification),
    {
      TTL: 3600,
      urgency: "normal",
      vapidDetails: config,
    },
  );
  const response = await fetcher(request.endpoint, {
    method: "POST",
    headers: request.headers,
    body: request.body ? new Uint8Array(request.body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  await response.body?.cancel();
  if (response.status === 404 || response.status === 410) return "expired";
  if (!response.ok) throw new Error(`Web Push HTTP ${response.status}`);
  return "sent";
}

/**
 * 独立向账号的有效浏览器会话发送命中通知，失效设备不会阻塞其它设备。
 * @param {Storage} storage 权威存储。
 * @param {string} userId 命中所属账号。
 * @param {MatchRecord[]} records 本轮新增命中。
 * @param {AppSettings} settings 用户语言设置。
 * @param {object} options 可注入的配置与投递器。
 * @return {Promise<boolean>} 是否至少被一个推送服务受理。
 */
export async function notifyBrowsers(
  storage: Storage,
  userId: string,
  records: MatchRecord[],
  settings: AppSettings,
  options: { config?: WebPushConfig; deliver?: typeof deliverWebPush } = {},
): Promise<boolean> {
  const config = options.config ?? webPushConfig();
  if (!config || !storage.webPush || records.length === 0) return false;
  const tag = await sessionTokenHash(
    `${userId}:${records.map((record) => record.id).sort().join("\n")}`,
  );
  const messages = getMessages(settings.locale);
  const notification: AppNotification = {
    userId,
    tag,
    title: messages.appName,
    body: records.slice(0, 3).map((record) => record.post.title.slice(0, 160))
      .join("\n"),
    path: "/",
  };
  let sent = false;
  for (const device of await storage.webPush.list(userId)) {
    try {
      const session = await storage.getSession(device.sessionHash);
      if (
        !session || session.userId !== userId ||
        Date.parse(session.expiresAt) <= Date.now()
      ) {
        await storage.webPush.remove(device.id, userId, device.sessionHash);
        continue;
      }
      const outcome = await (options.deliver ?? deliverWebPush)(device, {
        ...notification,
        deviceId: device.id,
      }, config);
      if (outcome === "expired") {
        await storage.webPush.remove(device.id, userId, device.sessionHash);
      } else sent = true;
    } catch {
      // 仅记录不可识别订阅的状态，避免日志泄露 endpoint 和加密密钥。
      console.warn("浏览器通知投递失败。");
    }
  }
  return sent;
}
