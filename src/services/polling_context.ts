/**
 * @file 本文件组装定时检查所需的轻量服务，在实际通知时加载通知模块。
 */
import { createPollScheduler } from "../crons.ts";
import { createAppStorage } from "../storage/factory.ts";
import { defaultAppSettingsFromEnv } from "./default_settings.ts";
import { createMatcher } from "./matcher.ts";
import { createHeyboxTopicSource } from "./heybox_topic_source.ts";
import { withDetailRelay } from "./heybox_detail_relay.ts";
import { withDetailFailover } from "./heybox_detail_failover.ts";
import { requireHeyboxDeviceId } from "./heybox_device_identity.ts";
import { createPoller } from "./poller.ts";
import { createPollingNotifier } from "./polling_notifier.ts";
import { cachePollSchedule } from "../storage/poll_schedule_cache.ts";

/** 供网页请求与定时任务共享的轮询依赖。 */
export type PollingContext = ReturnType<typeof createPollingContext>;

/**
 * 创建轻量轮询上下文；Oracle 优先、Deno 备用，两路按所有账号共享的滚动预算取数。
 *
 * @param {{cacheSchedule?: boolean, durableNotifications?: boolean}} options 常驻进程的快照缓存与持久投递。
 * @return {object} 默认设置、存储、数据源、匹配器、轮询器与调度器。
 */
export function createPollingContext(
  options: { cacheSchedule?: boolean; durableNotifications?: boolean } = {},
) {
  const defaultSettings = defaultAppSettingsFromEnv();
  const backend = createAppStorage(defaultSettings, {
    notificationOutbox: options.durableNotifications,
  });
  const storage = options.cacheSchedule ? cachePollSchedule(backend) : backend;
  const matcher = createMatcher();
  const signatureMode = Deno.env.get("HEYBOX_SIGNATURE_MODE");
  const configuredDeviceId = Deno.env.get("HEYBOX_DEVICE_ID");
  const directSource = createHeyboxTopicSource({
    cookie: Deno.env.get("HEYBOX_COOKIE") ?? undefined,
    deviceId: configuredDeviceId?.trim()
      ? requireHeyboxDeviceId(configuredDeviceId)
      : undefined,
    signatureMode: signatureMode === "app" || signatureMode === "web"
      ? signatureMode
      : undefined,
    userAgent: Deno.env.get("HEYBOX_USER_AGENT") ?? undefined,
  });
  const relayUrl = Deno.env.get("HEYBOX_DETAIL_RELAY_URL");
  const relayToken = Deno.env.get("HEYBOX_DETAIL_RELAY_TOKEN");
  if (Boolean(relayUrl) !== Boolean(relayToken)) {
    throw new Error("Configure both detail relay URL and token");
  }
  const source = relayUrl && relayToken
    ? withDetailFailover(
      directSource,
      withDetailRelay(directSource, {
        url: relayUrl,
        token: relayToken,
      }),
      {
        requestsPerMinute: Number(
          Deno.env.get("HEYBOX_DETAIL_REQUESTS_PER_MINUTE") ?? "3",
        ),
      },
    )
    : directSource;
  const pollingNotifier = createPollingNotifier(storage);
  const poller = createPoller({
    matcher,
    source,
    storage,
    notifier: pollingNotifier,
  });
  const scheduler = createPollScheduler({ poller, storage });
  return {
    defaultSettings,
    storage,
    matcher,
    source,
    poller,
    scheduler,
    notificationDelivery: pollingNotifier.flush,
  };
}
