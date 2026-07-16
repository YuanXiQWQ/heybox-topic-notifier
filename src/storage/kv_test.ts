import type { AppSettings, MatchRecord } from "../models.ts";
import { createKvStorage, latestMatchByMatchedTime } from "./kv.ts";

Deno.test("latestMatchByMatchedTime prefers the newest match before post time", () => {
  const olderMatchNewerPost = record("older-match-newer-post", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T12:00:00.000Z",
  });
  const newerMatchOlderPost = record("newer-match-older-post", {
    matchedAt: "2026-07-12T11:00:00.000Z",
    publishedAt: "2026-07-12T09:00:00.000Z",
  });

  assertEquals(
    latestMatchByMatchedTime([olderMatchNewerPost, newerMatchOlderPost])?.id,
    "newer-match-older-post",
  );
});

Deno.test("latestMatchByMatchedTime uses post time within the same match batch", () => {
  const olderPost = record("older-post", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T09:00:00.000Z",
  });
  const newerPost = record("newer-post", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T12:00:00.000Z",
  });

  assertEquals(latestMatchByMatchedTime([olderPost, newerPost])?.id, "newer-post");
});

Deno.test("deleteMatches removes records from match history", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  const match = record("match-id", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T09:00:00.000Z",
  });

  await storage.saveMatch(match);

  assertEquals((await storage.listHistory()).map((item) => item.id), ["match-id"]);

  await storage.deleteMatches([match.id]);

  assertEquals(await storage.listHistory(), []);
});

Deno.test("getDashboardSnapshot reads matches once for state and pending rows", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  await storage.saveMatch(record("pending-id", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T09:00:00.000Z",
  }));
  await storage.saveMatch({
    ...record("completed-id", {
      matchedAt: "2026-07-12T11:00:00.000Z",
      publishedAt: "2026-07-12T10:00:00.000Z",
    }),
    completedAt: "2026-07-12T12:00:00.000Z",
  });

  kv.resetStats();

  const snapshot = await storage.getDashboardSnapshot();

  assertEquals(kv.listCalls, 1);
  assertEquals(kv.getCalls, 2);
  assertEquals(snapshot.state.totalMatches, 2);
  assertEquals(snapshot.state.latestMatch?.id, "completed-id");
  assertEquals(snapshot.pendingMatches.map((item) => item.id), ["pending-id"]);
});

function record(
  id: string,
  options: { matchedAt: string; publishedAt: string },
): MatchRecord {
  return {
    id,
    keyword: "keyword",
    location: "title",
    matchedAt: options.matchedAt,
    post: {
      body: "",
      commentReplies: [],
      comments: [],
      excerpt: "",
      id,
      publishedAt: options.publishedAt,
      title: id,
      url: `https://example.com/${id}`,
    },
  };
}

const defaultSettings: AppSettings = {
  activeKeywordTarget: "common",
  commonKeywordRules: [],
  darkMode: false,
  locale: "zh-CN",
  notificationEmailAddress: "",
  notificationEmailApiToken: "",
  notificationEmailApiUrl: "",
  notificationEmailFrom: "",
  notificationEmailService: "smtp",
  notificationProvider: "disabled",
  notificationPushPlusToken: "",
  notificationServerChanSendKey: "",
  notificationSmtpHost: "",
  notificationSmtpPassword: "",
  notificationSmtpPort: 465,
  notificationSmtpSecure: true,
  notificationSmtpUsername: "",
  notificationWebhookService: "custom",
  notificationWebhookUrl: "",
  notificationWxPusherSpt: "",
  polling: {
    enabled: true,
    intervalUnit: "minute",
    intervalValue: 1,
    postLimit: 20,
    sort: "replyTime",
  },
  themeColor: "#bd7fff",
  topics: [],
};

class MemoryKv {
  #entries = new Map<string, { key: Deno.KvKey; value: unknown }>();
  getCalls = 0;
  listCalls = 0;

  get<T>(
    key: Deno.KvKey,
  ): Promise<{ key: Deno.KvKey; value: T | null; versionstamp: string | null }> {
    this.getCalls += 1;
    const entry = this.#entries.get(this.#key(key));
    return Promise.resolve({
      key,
      value: entry ? entry.value as T : null,
      versionstamp: entry ? "1" : null,
    });
  }

  set(key: Deno.KvKey, value: unknown): Promise<Deno.KvCommitResult> {
    this.#entries.set(this.#key(key), { key, value });
    return Promise.resolve({ ok: true, versionstamp: "1" });
  }

  delete(key: Deno.KvKey): Promise<void> {
    this.#entries.delete(this.#key(key));
    return Promise.resolve();
  }

  async *list<T>(
    selector: Deno.KvListSelector,
  ): AsyncIterableIterator<Deno.KvEntry<T>> {
    this.listCalls += 1;
    const prefix = "prefix" in selector ? selector.prefix : [];
    for (const entry of this.#entries.values()) {
      if (!this.#startsWith(entry.key, prefix)) {
        continue;
      }

      yield {
        key: entry.key,
        value: entry.value as T,
        versionstamp: "1",
      };
    }
  }

  #key(key: Deno.KvKey): string {
    return JSON.stringify(key);
  }

  resetStats(): void {
    this.getCalls = 0;
    this.listCalls = 0;
  }

  #startsWith(key: Deno.KvKey, prefix: Deno.KvKey): boolean {
    return prefix.every((part, index) => key[index] === part);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}
