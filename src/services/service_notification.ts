/** @file 定义独立于帖子记录的服务通知，以及 AI 回退命中的统一说明。 */
import type { AppSettings, MatchRecord } from "../models.ts";
import { getMessages } from "../locales/index.ts";

/** 可通过所有通知通道投递的服务状态消息，不产生工作区记录。 */
export type ServiceNotification = {
  id: string;
  title: string;
  body: string;
  path: string;
};

/**
 * 创建本地化的 AI 故障通知，不包含接口凭据或未经清理的上游响应。
 * @param {string} id 当前故障通知的稳定标识。
 * @param {AppSettings} settings 用户语言设置。
 * @return {ServiceNotification} 故障通知。
 */
export function aiFailureNotification(
  id: string,
  settings: AppSettings,
): ServiceNotification {
  const messages = getMessages(settings.locale);
  return {
    id,
    title: messages.notificationAiFailureTitle,
    body: messages.notificationAiFailureBody,
    path: "/settings",
  };
}

/**
 * 为包含 AI 回退命中的通知添加前置说明。
 * @param {MatchRecord[]} records 本次通知的命中。
 * @param {AppSettings} settings 用户语言设置。
 * @return {string} 回退说明；没有回退命中时为空。
 */
export function aiFallbackNotice(
  records: MatchRecord[],
  settings: AppSettings,
): string {
  return records.some((record) => record.aiFallback)
    ? getMessages(settings.locale).notificationAiFallback
    : "";
}
