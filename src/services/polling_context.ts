/**
 * @file 本文件组装定时检查所需的轻量服务，在实际通知时加载通知模块。
 */
import { createPollScheduler } from "../crons.ts";
import { createAppStorage } from "../storage/factory.ts";
import { defaultAppSettingsFromEnv } from "./default_settings.ts";
import { createMatcher } from "./matcher.ts";
import { createHeyboxTopicSource } from "./heybox_topic_source.ts";
import type { createNotifier } from "./notifier.ts";
import { createPoller } from "./poller.ts";

/** 供网页请求与定时任务共享的轮询依赖。 */
export type PollingContext = ReturnType<typeof createPollingContext>;

/**
 * 创建不依赖 HTTP 路由、认证页面及翻译文案的轮询上下文。
 *
 * @return {object} 默认设置、存储、数据源、匹配器、轮询器与调度器。
 */
export function createPollingContext() {
  const defaultSettings = defaultAppSettingsFromEnv();
  const storage = createAppStorage(defaultSettings);
  const matcher = createMatcher();
  const signatureMode = Deno.env.get("HEYBOX_SIGNATURE_MODE");
  const source = createHeyboxTopicSource({
    cookie: Deno.env.get("HEYBOX_COOKIE") ?? undefined,
    deviceId: Deno.env.get("HEYBOX_DEVICE_ID") ?? undefined,
    signatureMode: signatureMode === "app" || signatureMode === "web"
      ? signatureMode
      : undefined,
    userAgent: Deno.env.get("HEYBOX_USER_AGENT") ?? undefined,
  });
  let notifierPromise: Promise<ReturnType<typeof createNotifier>> | undefined;
  const poller = createPoller({
    matcher,
    source,
    storage,
    notifier: {
      /**
       * 按需加载通知实现并发送当前轮询的命中记录。
       *
       * @param {Parameters<ReturnType<typeof createNotifier>["sendMatches"]>} args 记录与设置。
       * @return {ReturnType<ReturnType<typeof createNotifier>["sendMatches"]>} 通知发送结果。
       */
      async sendMatches(...args) {
        notifierPromise ??= import("./notifier.ts")
          .then((module) => module.createNotifier())
          .catch((error) => {
            notifierPromise = undefined;
            throw error;
          });
        return await (await notifierPromise).sendMatches(...args);
      },
    },
  });
  const scheduler = createPollScheduler({ poller, storage });
  return { defaultSettings, storage, matcher, source, poller, scheduler };
}
