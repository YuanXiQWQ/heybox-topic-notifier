import { normalizeLocale } from "../locales/index.ts";
import type { AppSettings, KeywordRule, PollSort } from "../models.ts";
import { createKvStorage } from "../storage/kv.ts";
import { createMatcher } from "./matcher.ts";
import { createHeyboxTopicSource } from "./heybox_topic_source.ts";
import { createMockTopicSource } from "./mock_topic_source.ts";
import { createNotifier } from "./notifier.ts";
import { createPoller } from "./poller.ts";

export type AppConfig = {
  defaultSettings: AppSettings;
  pollEnabled: boolean;
  port: number;
  topicSource: "heybox" | "mock";
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
      polling: {
        intervalMinutes: positiveIntegerFromEnv("POLL_INTERVAL_MINUTES", 1),
        postLimit: positiveIntegerFromEnv(
          "POLL_POST_LIMIT",
          positiveIntegerFromEnv("HEYBOX_POST_LIMIT", 20),
        ),
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
    },
    pollEnabled: Deno.env.get("POLL_ENABLED") === "true",
    port: Number(Deno.env.get("PORT") ?? "8000"),
    topicSource: Deno.env.get("TOPIC_SOURCE") === "heybox" ? "heybox" : "mock",
  };

  const storage = createKvStorage(config.defaultSettings);
  const matcher = createMatcher();
  const notifier = createNotifier();
  const source = config.topicSource === "heybox"
    ? createHeyboxTopicSource({
      cookie: Deno.env.get("HEYBOX_COOKIE") ?? undefined,
      deviceId: Deno.env.get("HEYBOX_DEVICE_ID") ?? undefined,
      userAgent: Deno.env.get("HEYBOX_USER_AGENT") ?? undefined,
    })
    : createMockTopicSource();
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

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function pollSortFromEnv(): PollSort {
  const value = Deno.env.get("POLL_SORT");
  if (value === "publishTime" || value === "smart" || value === "replyTime") {
    return value;
  }

  switch (Deno.env.get("HEYBOX_SORT_FILTER")) {
    case "hot-rank":
      return "smart";
    case "comment-time":
      return "replyTime";
    default:
      return "publishTime";
  }
}
