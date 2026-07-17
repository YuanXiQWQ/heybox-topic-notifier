import { getMessages } from "../locales/index.ts";
import type { AppSettings, MatchRecord } from "../models.ts";
import { renderHistory } from "./history.ts";
import { applyMatchTableQuery, compactPages, parseMatchTableQuery } from "./match_table.ts";
import type { MatchTableResult } from "./match_table.ts";
import { renderMatchRecordsSection } from "./match_table_view.ts";
import { renderSettings } from "./settings.ts";

Deno.test("parseMatchTableQuery normalizes unsupported values", () => {
  const query = parseMatchTableQuery(new URLSearchParams("range=bad&page=-1&pageSize=777"));

  assertEquals(query, {
    from: "",
    page: 1,
    pageSize: 10,
    range: "all",
    to: "",
  });
});

Deno.test("applyMatchTableQuery filters by recent matched time and paginates", () => {
  const now = new Date("2026-06-30T12:00:00.000Z");
  const result = applyMatchTableQuery([
    record("1", "2026-06-30T11:59:00.000Z"),
    record("2", "2026-06-30T10:00:00.000Z"),
    record("3", "2026-06-30T11:30:00.000Z"),
  ], {
    from: "",
    page: 1,
    pageSize: 1,
    range: "hour",
    to: "",
  }, now);

  assertEquals(result.records.map((item) => item.id), ["1"]);
  assertEquals(result.totalRecords, 2);
  assertEquals(result.totalPages, 2);
});

Deno.test("applyMatchTableQuery supports custom China-time range", () => {
  const result = applyMatchTableQuery([
    record("inside", "2026-06-30T06:30:00.000Z"),
    record("outside", "2026-06-30T08:30:00.000Z"),
  ], {
    from: "2026-06-30T14:00",
    page: 1,
    pageSize: "all",
    range: "custom",
    to: "2026-06-30T15:00",
  });

  assertEquals(result.records.map((item) => item.id), ["inside"]);
});

Deno.test("compactPages keeps edges and current page vicinity", () => {
  assertEquals(compactPages(8, 20), [1, 2, 3, "...", 7, 8, 9, "...", 19, 20]);
});

Deno.test("renderMatchRecordsSection opens post title links in a new tab", () => {
  const html = renderMatchRecordsSection({
    action: {
      bulkButtonAttribute: "data-test-bulk",
      emptySelectionMessage: "empty",
      icon: "",
      label: "complete",
      rowCheckboxAttribute: "data-test-row",
      selectAllAttribute: "data-test-all",
    },
    emptyMessage: "empty",
    filterToggleId: "test-filter",
    formAction: "/matches/complete",
    heading: "heading",
    headingId: "heading-id",
    locale: "zh-CN",
    messages: getMessages("zh-CN"),
    path: "/",
    table: table([record("title-link", "2026-06-30T12:00:00.000Z")]),
    titleLinkClass: "pending-title-link",
  });

  assertIncludes(
    html,
    `<a class="match-table-title-link pending-title-link" href="https://example.com/title-link" target="_blank" rel="noopener noreferrer">title-link</a>`,
  );
});

Deno.test("renderMatchRecordsSection marks timestamps for live relative updates", () => {
  const match = record("relative-time", "2026-06-30T12:05:00.000Z");
  match.post.publishedAt = "2026-06-30T12:00:00.000Z";
  const html = renderMatchRecordsSection({
    action: {
      bulkButtonAttribute: "data-test-bulk",
      emptySelectionMessage: "empty",
      icon: "",
      label: "complete",
      rowCheckboxAttribute: "data-test-row",
      selectAllAttribute: "data-test-all",
    },
    emptyMessage: "empty",
    filterToggleId: "test-filter",
    formAction: "/matches/complete",
    heading: "heading",
    headingId: "heading-id",
    locale: "zh-CN",
    messages: getMessages("zh-CN"),
    path: "/",
    table: table([match]),
    titleLinkClass: "pending-title-link",
  });

  assertIncludes(html, `data-relative-time="2026-06-30T12:00:00.000Z"`);
  assertIncludes(html, `data-relative-time="2026-06-30T12:05:00.000Z"`);
  assertIncludes(html, `window["__matchTableRelativeTimeUpdate"]`);
});

Deno.test("renderHistory keeps history post titles emphasized", () => {
  const html = renderHistory({
    historyTable: table([record("history-link", "2026-06-30T12:00:00.000Z")]),
    settings: settings(),
  });

  assertIncludes(
    html,
    `<a class="match-table-title-link pending-title-link" href="https://example.com/history-link" target="_blank" rel="noopener noreferrer">history-link</a>`,
  );
});

Deno.test("settings and history pages keep the app tab title", () => {
  const appSettings = settings();
  const historyHtml = renderHistory({
    historyTable: table([]),
    settings: appSettings,
  });
  const settingsHtml = renderSettings({ settings: appSettings });

  assertIncludes(historyHtml, "<title>小黑盒话题提醒</title>");
  assertIncludes(settingsHtml, "<title>小黑盒话题提醒</title>");
  assertIncludes(historyHtml, "<h1>命中历史</h1>");
  assertIncludes(settingsHtml, "<h1>设置</h1>");
});

function table(records: MatchRecord[]): MatchTableResult {
  return {
    from: "",
    page: 1,
    pageSize: 10,
    range: "all",
    records,
    to: "",
    totalPages: 1,
    totalRecords: records.length,
  };
}

function record(id: string, matchedAt: string): MatchRecord {
  return {
    id,
    keyword: "求助",
    location: "title",
    matchedAt,
    post: {
      body: "",
      commentReplies: [],
      comments: [],
      excerpt: "",
      id,
      publishedAt: matchedAt,
      title: id,
      url: `https://example.com/${id}`,
    },
  };
}

function settings(): AppSettings {
  return {
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
    notificationWebhookService: "pushPlus",
    notificationWebhookUrl: "",
    notificationWxPusherSpt: "",
    polling: {
      enabled: false,
      intervalUnit: "minute",
      intervalValue: 1,
      postLimit: 20,
      sort: "publishTime",
    },
    themeColor: "#bd7fff",
    topics: [],
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertIncludes(actual: string, expected: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`Expected output to include ${expected}`);
  }
}
