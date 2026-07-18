/**
 * @file 本文件负责组装应用运行所需的配置、存储、服务和调度器上下文。
 */
import { normalizeLocale } from "../locales/index.ts";
import type { AppSettings, KeywordRule, PollSort } from "../models.ts";
import {
  normalizeNotificationEmailService,
  normalizeNotificationWebhookService,
} from "../notification_services.ts";
import { createPollScheduler } from "../crons.ts";
import { createKvStorage } from "../storage/kv.ts";
import { createMatcher } from "./matcher.ts";
import { createHeyboxTopicSource } from "./heybox_topic_source.ts";
import type { HeyboxSignatureMode } from "./heybox_signer.ts";
import { createNotifier } from "./notifier.ts";
import { createPoller } from "./poller.ts";

/**
 * 应用启动配置。
 */
export type AppConfig = {
  defaultSettings: AppSettings;
  port: number;
};

/**
 * 应用运行时上下文类型。
 */
export type AppContext = ReturnType<typeof createAppContext>;

/**
 * 创建应用运行时上下文。
 *
 * @return 包含配置、存储、匹配器、通知器、数据源、轮询器和调度器的上下文对象。
 */
export function createAppContext() {
  const defaultKeywordRules: KeywordRule[] = ["求助", "怎么", "卡住", "打不开"].map((keyword) => ({
    keyword,
    locations: ["title", "body", "comments", "replies"],
  }));

  const config: AppConfig = {
    defaultSettings: {
      activeKeywordTarget: "common",
      commonKeywordRules: defaultKeywordRules,
      darkMode: false,
      locale: normalizeLocale(Deno.env.get("APP_LOCALE")),
      notificationEmailAddress: Deno.env.get("NOTIFIER_EMAIL_ADDRESS") ?? "",
      notificationEmailApiToken: Deno.env.get("NOTIFIER_EMAIL_API_TOKEN") ?? "",
      notificationEmailApiUrl: Deno.env.get("NOTIFIER_EMAIL_API_URL") ?? "",
      notificationEmailFrom: Deno.env.get("NOTIFIER_EMAIL_FROM") ?? "",
      notificationEmailService: notificationEmailServiceFromEnv(),
      notificationProvider: notificationProviderFromEnv(),
      notificationPushPlusToken: Deno.env.get("NOTIFIER_PUSHPLUS_TOKEN") ?? "",
      notificationServerChanSendKey: Deno.env.get("NOTIFIER_SERVER_CHAN_SEND_KEY") ?? "",
      notificationSmtpHost: Deno.env.get("NOTIFIER_SMTP_HOST") ?? "",
      notificationSmtpPassword: Deno.env.get("NOTIFIER_SMTP_PASSWORD") ?? "",
      notificationSmtpPort: positiveIntegerFromEnv("NOTIFIER_SMTP_PORT", 465),
      notificationSmtpSecure: Deno.env.get("NOTIFIER_SMTP_SECURE") !== "false",
      notificationSmtpUsername: Deno.env.get("NOTIFIER_SMTP_USERNAME") ?? "",
      notificationWebhookService: notificationWebhookServiceFromEnv(),
      notificationWebhookUrl: Deno.env.get("NOTIFIER_WEBHOOK_URL") ?? "",
      notificationWxPusherSpt: Deno.env.get("NOTIFIER_WXPUSHER_SPT") ?? "",
      polling: {
        enabled: Deno.env.get("POLL_ENABLED") === "true",
        intervalUnit: "minute",
        intervalValue: positiveIntegerFromEnv("POLL_INTERVAL_MINUTES", 1),
        postLimit: positiveIntegerFromEnv(
          "POLL_POST_LIMIT",
          positiveIntegerFromEnv("HEYBOX_POST_LIMIT", 20),
        ),
        sort: pollSortFromEnv(),
      },
      themeColor: "#bd7fff",
      topics: [
        {
          enabled: true,
          id: Deno.env.get("HEYBOX_TOPIC_ID") ?? "12099",
          keywordRules: [],
          note: "蔚蓝",
        },
      ],
    },
    port: Number(Deno.env.get("PORT") ?? "8000"),
  };

  const storage = createKvStorage(config.defaultSettings);
  const matcher = createMatcher();
  const notifier = createNotifier();
  const source = createHeyboxTopicSource({
    cookie: Deno.env.get("HEYBOX_COOKIE") ?? undefined,
    deviceId: Deno.env.get("HEYBOX_DEVICE_ID") ?? undefined,
    signatureMode: heyboxSignatureModeFromEnv(),
    userAgent: Deno.env.get("HEYBOX_USER_AGENT") ?? undefined,
  });
  const poller = createPoller({ matcher, notifier, source, storage });
  const scheduler = createPollScheduler({ poller, storage });

  return {
    config,
    matcher,
    notifier,
    poller,
    scheduler,
    source,
    storage,
  };
}

/**
 * 从环境变量读取正整数配置，不合法时使用兜底值。
 *
 * @param name 环境变量名称。
 * @param fallback 环境变量缺失或不合法时使用的兜底值。
 * @return 解析后的正整数配置。
 */
function positiveIntegerFromEnv(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * 从环境变量读取帖子排序方式。
 *
 * @return 轮询帖子时使用的排序方式。
 */
function pollSortFromEnv(): PollSort {
  const value = Deno.env.get("POLL_SORT");
  if (value === "publishTime" || value === "smart" || value === "replyTime") {
    return value;
  }

  switch (Deno.env.get("HEYBOX_SORT_FILTER")) {
    case "hot-rank":
      return "smart";
    case "reply":
    case "comment-time":
      return "replyTime";
    case "create":
      return "publishTime";
    default:
      return "publishTime";
  }
}

/**
 * 从环境变量读取通知渠道。
 *
 * @return 规范化后的通知渠道。
 */
function notificationProviderFromEnv(): AppSettings["notificationProvider"] {
  const value = Deno.env.get("NOTIFIER_PROVIDER");
  return value === "disabled" || value === "email" || value === "webhook" ? value : "webhook";
}

/**
 * 从环境变量读取 Webhook 通知服务类型。
 *
 * @return 规范化后的 Webhook 通知服务类型。
 */
function notificationWebhookServiceFromEnv(): AppSettings["notificationWebhookService"] {
  return normalizeNotificationWebhookService(Deno.env.get("NOTIFIER_WEBHOOK_SERVICE"));
}

/**
 * 从环境变量读取邮件通知服务类型。
 *
 * @return 规范化后的邮件通知服务类型。
 */
function notificationEmailServiceFromEnv(): AppSettings["notificationEmailService"] {
  return normalizeNotificationEmailService(Deno.env.get("NOTIFIER_EMAIL_SERVICE"));
}

/**
 * 从环境变量读取小黑盒签名模式。
 *
 * @return 支持的签名模式，未配置或不合法时返回 undefined。
 */
function heyboxSignatureModeFromEnv(): HeyboxSignatureMode | undefined {
  const value = Deno.env.get("HEYBOX_SIGNATURE_MODE");
  return value === "app" || value === "web" ? value : undefined;
}
