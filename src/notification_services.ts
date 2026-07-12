import type { Messages } from "./locales/types.ts";

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

export type NotificationWebhookService = typeof notificationWebhookServices[number]["id"];

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

export type NotificationEmailService = typeof notificationEmailServices[number]["id"];

export function normalizeNotificationWebhookService(
  value: unknown,
): NotificationWebhookService {
  return isNotificationWebhookService(value) ? value : "custom";
}

export function normalizeNotificationEmailService(
  value: unknown,
): NotificationEmailService {
  return isNotificationEmailService(value) ? value : "smtp";
}

export function isNotificationWebhookService(value: unknown): value is NotificationWebhookService {
  return typeof value === "string" &&
    notificationWebhookServices.some((service) => service.id === value);
}

export function isNotificationEmailService(value: unknown): value is NotificationEmailService {
  return typeof value === "string" &&
    notificationEmailServices.some((service) => service.id === value);
}
