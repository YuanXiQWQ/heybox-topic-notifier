/**
 * @file 本文件定义通知服务枚举和规范化工具。
 */
import type { Messages } from "./locales/types.ts";

/**
 * 支持的 Webhook 通知服务列表。
 */
export const notificationWebhookServices = [
  {
    field: "pushPlus",
    id: "pushPlus",
    labelKey: "notificationPushPlus",
  },
  {
    field: "wxPusher",
    id: "wxPusher",
    labelKey: "notificationWxPusher",
  },
  {
    field: "serverChan",
    id: "serverChan",
    labelKey: "notificationServerChan",
  },
  {
    field: "custom",
    id: "custom",
    labelKey: "notificationWebhookCustom",
  },
] as const satisfies readonly {
  field: string;
  id: string;
  labelKey: keyof Messages;
}[];

/**
 * Webhook 通知服务类型。
 */
export type NotificationWebhookService = typeof notificationWebhookServices[number]["id"];

/**
 * 支持的邮件通知服务列表。
 */
export const notificationEmailServices = [
  {
    field: "api",
    id: "api",
    labelKey: "notificationEmailApi",
  },
  {
    field: "smtp",
    id: "smtp",
    labelKey: "notificationEmailSmtp",
  },
] as const satisfies readonly {
  field: string;
  id: string;
  labelKey: keyof Messages;
}[];

/**
 * 邮件通知服务类型。
 */
export type NotificationEmailService = typeof notificationEmailServices[number]["id"];

/**
 * 规范化 Webhook 通知服务类型。
 *
 * @param value 待规范化值。
 * @return 合法的 Webhook 通知服务类型。
 */
export function normalizeNotificationWebhookService(
  value: unknown,
): NotificationWebhookService {
  return isNotificationWebhookService(value) ? value : "custom";
}

/**
 * 规范化邮件通知服务类型。
 *
 * @param value 待规范化值。
 * @return 合法的邮件通知服务类型。
 */
export function normalizeNotificationEmailService(
  value: unknown,
): NotificationEmailService {
  return isNotificationEmailService(value) ? value : "smtp";
}

/**
 * 判断值是否为合法 Webhook 通知服务类型。
 *
 * @param value 待判断值。
 * @return 是合法 Webhook 通知服务类型时返回 true。
 */
export function isNotificationWebhookService(value: unknown): value is NotificationWebhookService {
  return typeof value === "string" &&
    notificationWebhookServices.some((service) => service.id === value);
}

/**
 * 判断值是否为合法邮件通知服务类型。
 *
 * @param value 待判断值。
 * @return 是合法邮件通知服务类型时返回 true。
 */
export function isNotificationEmailService(value: unknown): value is NotificationEmailService {
  return typeof value === "string" &&
    notificationEmailServices.some((service) => service.id === value);
}
