/**
 * @file 本文件从环境变量构建账号默认设置，不加载页面或通知发送模块。
 */
import { normalizeLocale } from "../locales/locale.ts";
import type { AppSettings, KeywordRule, PollSort } from "../models.ts";
import {
  normalizeNotificationEmailService,
  normalizeNotificationWebhookService,
} from "../notification_services.ts";

/**
 * 从环境变量创建默认应用设置。
 *
 * 轮询开关固定为关闭，账号需要到设置页手动开启后才会参与轮询。
 *
 * @return {AppSettings} 默认应用设置。
 */
export function defaultAppSettingsFromEnv(): AppSettings {
  const defaultKeywordRules: KeywordRule[] = ["求助", "怎么", "卡住", "打不开"]
    .map((keyword) => ({
      keyword,
      locations: ["title", "body", "comments", "replies"],
    }));
  return {
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
    notificationServerChanSendKey:
      Deno.env.get("NOTIFIER_SERVER_CHAN_SEND_KEY") ?? "",
    notificationSmtpHost: Deno.env.get("NOTIFIER_SMTP_HOST") ?? "",
    notificationSmtpPassword: Deno.env.get("NOTIFIER_SMTP_PASSWORD") ?? "",
    notificationSmtpPort: positiveIntegerFromEnv("NOTIFIER_SMTP_PORT", 465),
    notificationSmtpSecure: Deno.env.get("NOTIFIER_SMTP_SECURE") !== "false",
    notificationSmtpUsername: Deno.env.get("NOTIFIER_SMTP_USERNAME") ?? "",
    notificationWebhookService: notificationWebhookServiceFromEnv(),
    notificationWebhookUrl: Deno.env.get("NOTIFIER_WEBHOOK_URL") ?? "",
    notificationWxPusherSpt: Deno.env.get("NOTIFIER_WXPUSHER_SPT") ?? "",
    polling: {
      enabled: false,
      intervalUnit: "minute",
      intervalValue: positiveIntegerFromEnv("POLL_INTERVAL_MINUTES", 1),
      postLimit: positiveIntegerFromEnv("POLL_POST_LIMIT", 20),
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
  };
}

/**
 * 从环境变量读取正整数配置，不合法时使用兜底值。
 *
 * @param {string} name 环境变量名称。
 * @param {number} fallback 环境变量缺失或不合法时使用的兜底值。
 * @return {number} 解析后的正整数配置。
 */
function positiveIntegerFromEnv(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * 从环境变量读取帖子排序方式。
 *
 * @return {PollSort} 轮询帖子时使用的排序方式。
 */
function pollSortFromEnv(): PollSort {
  const value = Deno.env.get("POLL_SORT");
  if (value === "publishTime" || value === "smart" || value === "replyTime") {
    return value;
  }

  return "publishTime";
}

/**
 * 从环境变量读取通知渠道。
 *
 * @return {AppSettings["notificationProvider"]} 规范化后的通知渠道。
 */
function notificationProviderFromEnv(): AppSettings["notificationProvider"] {
  const value = Deno.env.get("NOTIFIER_PROVIDER");
  return value === "disabled" || value === "email" || value === "webhook"
    ? value
    : "webhook";
}

/**
 * 从环境变量读取 Webhook 通知服务类型。
 *
 * @return {AppSettings["notificationWebhookService"]} 规范化后的 Webhook 通知服务类型。
 */
function notificationWebhookServiceFromEnv(): AppSettings[
  "notificationWebhookService"
] {
  return normalizeNotificationWebhookService(
    Deno.env.get("NOTIFIER_WEBHOOK_SERVICE"),
  );
}

/**
 * 从环境变量读取邮件通知服务类型。
 *
 * @return {AppSettings["notificationEmailService"]} 规范化后的邮件通知服务类型。
 */
function notificationEmailServiceFromEnv(): AppSettings[
  "notificationEmailService"
] {
  return normalizeNotificationEmailService(
    Deno.env.get("NOTIFIER_EMAIL_SERVICE"),
  );
}
