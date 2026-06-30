import { normalizeLocale } from "../locales/index.ts";
import type { AppSettings } from "../models.ts";
import { createKvStorage } from "../storage/kv.ts";
import { createMatcher } from "./matcher.ts";
import { createMockTopicSource } from "./mock_topic_source.ts";
import { createNotifier } from "./notifier.ts";
import { createPoller } from "./poller.ts";

export type AppConfig = {
  defaultSettings: AppSettings;
  pollEnabled: boolean;
  port: number;
};

export type AppContext = ReturnType<typeof createAppContext>;

export function createAppContext() {
  const config: AppConfig = {
    defaultSettings: {
      keywords: ["求助", "怎么", "卡住", "打不开"],
      locale: normalizeLocale(Deno.env.get("APP_LOCALE")),
      notificationProvider: "webhook",
      topicId: Deno.env.get("HEYBOX_TOPIC_ID") ?? "12099",
    },
    pollEnabled: Deno.env.get("POLL_ENABLED") === "true",
    port: Number(Deno.env.get("PORT") ?? "8000"),
  };

  const storage = createKvStorage(config.defaultSettings);
  const matcher = createMatcher();
  const notifier = createNotifier();
  const source = createMockTopicSource();
  const poller = createPoller({ matcher, notifier, source, storage });

  return {
    config,
    matcher,
    notifier,
    poller,
    source,
    storage,
  };
}
