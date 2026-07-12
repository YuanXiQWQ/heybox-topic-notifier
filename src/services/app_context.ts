import { normalizeLocale } from "../locales/index.ts";
import type { AppSettings, KeywordRule, PollSort } from "../models.ts";
import { createKvStorage } from "../storage/kv.ts";
import { createMatcher } from "./matcher.ts";
import { createHeyboxHblogTopicSource } from "./heybox_hblog_topic_source.ts";
import { createHeyboxTopicSource } from "./heybox_topic_source.ts";
import type { HeyboxSignatureMode } from "./heybox_signer.ts";
import { createMockTopicSource } from "./mock_topic_source.ts";
import { createNotifier } from "./notifier.ts";
import { createPoller } from "./poller.ts";
import { createWorkerTopicSource } from "./worker_topic_source.ts";

export type AppConfig = {
  defaultSettings: AppSettings;
  pollEnabled: boolean;
  port: number;
  topicSource: "heybox" | "heybox-hblog" | "mock" | "worker";
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
    topicSource: topicSourceFromEnv(),
  };

  const storage = createKvStorage(config.defaultSettings);
  const matcher = createMatcher();
  const notifier = createNotifier();
  const source = config.topicSource === "heybox"
    ? createHeyboxTopicSource({
      cookie: Deno.env.get("HEYBOX_COOKIE") ?? undefined,
      deviceId: Deno.env.get("HEYBOX_DEVICE_ID") ?? undefined,
      signatureMode: heyboxSignatureModeFromEnv(),
      userAgent: Deno.env.get("HEYBOX_USER_AGENT") ?? undefined,
    })
    : config.topicSource === "heybox-hblog"
    ? createHeyboxHblogTopicSource({ logFilePath: requiredEnv("HEYBOX_HBLOG_NET_LOG") })
    : config.topicSource === "worker"
    ? createWorkerTopicSource({
      token: Deno.env.get("TOPIC_WORKER_TOKEN") ?? undefined,
      workerUrl: requiredEnv("TOPIC_WORKER_URL"),
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

function topicSourceFromEnv(): AppConfig["topicSource"] {
  const value = Deno.env.get("TOPIC_SOURCE");
  return value === "heybox" || value === "heybox-hblog" || value === "worker" ? value : "mock";
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
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
    case "reply":
    case "comment-time":
      return "replyTime";
    case "create":
      return "publishTime";
    default:
      return "publishTime";
  }
}

function heyboxSignatureModeFromEnv(): HeyboxSignatureMode | undefined {
  const value = Deno.env.get("HEYBOX_SIGNATURE_MODE");
  return value === "app" || value === "web" ? value : undefined;
}
