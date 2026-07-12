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

export function normalizeNotificationWebhookService(
  value: unknown,
): NotificationWebhookService {
  return isNotificationWebhookService(value) ? value : "custom";
}

export function isNotificationWebhookService(value: unknown): value is NotificationWebhookService {
  return typeof value === "string" &&
    notificationWebhookServices.some((service) => service.id === value);
}
