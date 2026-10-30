/** @file 为命中和服务故障复用邮件、Webhook、浏览器推送与原生收件箱的独立投递流程。 */
import type { AppSettings, MatchRecord } from "../models.ts";
import type { Storage } from "../storage/types.ts";
import type { createNotifier, NotificationRequest } from "./notifier.ts";
import { sendIndependentNotifications } from "./application_notifier.ts";
import { enqueueNativeNotifications } from "./native_notifications.ts";
import type { notifyBrowsers } from "./web_push.ts";
import type { ServiceNotification } from "./service_notification.ts";

/** 可注入各通道以离线验证故障隔离，不实际发送通知。 */
type Options = {
  other?: () => Promise<ReturnType<typeof createNotifier>>;
  browsers?: typeof notifyBrowsers;
  native?: typeof enqueueNativeNotifications;
};

/**
 * 创建账号通知器，按需加载外部通知模块。
 * @param {Storage} storage 权威存储。
 * @param {Options} options 可注入通道。
 * @return {object} 命中和服务通知方法。
 */
export function createPollingNotifier(storage: Storage, options: Options = {}) {
  let notifierPromise: Promise<ReturnType<typeof createNotifier>> | undefined;
  /**
   * 独立尝试其它通知与各应用通道，任一受理即返回成功。
   * @param {NotificationRequest} request 邮件或 Webhook 载荷。
   * @param {MatchRecord[] | ServiceNotification} content 应用通知内容。
   * @param {AppSettings} settings 用户设置。
   * @param {string | undefined} userId 所属账号。
   * @return {Promise<import("./notifier.ts").NotifyResult>} 聚合投递结果。
   */
  async function send(
    request: NotificationRequest,
    content: MatchRecord[] | ServiceNotification,
    settings: AppSettings,
    userId?: string,
  ) {
    return await sendIndependentNotifications(
      settings.notificationProvider,
      async () => {
        notifierPromise ??=
          (options.other
            ? options.other()
            : import("./notifier.ts").then((module) => module.createNotifier()))
            .catch((error) => {
              notifierPromise = undefined;
              throw error;
            });
        return await (await notifierPromise).sendNotification(
          request,
          settings,
        );
      },
      async () => {
        if (!userId) return false;
        const results = await Promise.allSettled([
          Promise.resolve().then(async () =>
            (options.browsers ??
              (await import("./web_push.ts")).notifyBrowsers)(
                storage,
                userId,
                content,
                settings,
              )
          ),
          Promise.resolve().then(() =>
            (options.native ?? enqueueNativeNotifications)(
              storage,
              userId,
              content,
              settings,
            )
          ),
        ]);
        for (const result of results) {
          if (result.status === "rejected") {
            console.warn(
              "应用通知通道暂时不可用。",
            );
          }
        }
        return results.some((result) =>
          result.status === "fulfilled" && result.value
        );
      },
    );
  }
  return {
    /**
     * 发送批量命中通知。
     * @param {MatchRecord[]} records 命中记录。
     * @param {AppSettings} settings 用户设置。
     * @param {string | undefined} userId 所属账号。
     * @return {Promise<import("./notifier.ts").NotifyResult>} 投递结果。
     */
    sendMatches(
      records: MatchRecord[],
      settings: AppSettings,
      userId?: string,
    ) {
      return send({ type: "matches", records }, records, settings, userId);
    },
    /**
     * 发送不产生工作区业务记录的服务通知。
     * @param {ServiceNotification} notification 服务消息。
     * @param {AppSettings} settings 用户设置。
     * @param {string | undefined} userId 所属账号。
     * @return {Promise<import("./notifier.ts").NotifyResult>} 投递结果。
     */
    sendService(
      notification: ServiceNotification,
      settings: AppSettings,
      userId?: string,
    ) {
      return send(
        { type: "service", notification },
        notification,
        settings,
        userId,
      );
    },
  };
}
