import { normalizeLocale } from "../locales/index.ts";
import type { AppSettings, KeywordRule } from "../models.ts";
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
      notificationProvider: "webhook",
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
