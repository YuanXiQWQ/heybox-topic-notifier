/**
 * @file 本文件验证命中记录表格查询、分页和页面渲染行为。
 */
import { getMessages } from "../locales/index.ts";
import type { AppSettings, MatchRecord } from "../models.ts";
import { renderHistory } from "./history.ts";
import { applyMatchTableQuery, compactPages, parseMatchTableQuery } from "./match_table.ts";
import type { MatchTableResult } from "./match_table.ts";
import { renderMatchRecordsSection } from "./match_table_view.ts";
import { renderSettings } from "./settings.ts";

/**
 * 视图测试使用的固定 CSRF 令牌。
 */
const testCsrfToken = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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
    csrfToken: testCsrfToken,
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
  assertIncludes(html, `<input type="hidden" name="csrfToken" value="${testCsrfToken}">`);
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
    csrfToken: testCsrfToken,
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
  assertIncludes(html, `const updateKey = '__matchTableRelativeTimeUpdate';`);
  assertIncludes(html, `window[updateKey] = updateRelativeTimes;`);
});

Deno.test("renderHistory keeps history post titles emphasized", () => {
  const html = renderHistory({
    csrfToken: testCsrfToken,
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
    csrfToken: testCsrfToken,
    historyTable: table([]),
    settings: appSettings,
  });
  const settingsHtml = renderSettings({ csrfToken: testCsrfToken, settings: appSettings });

  assertIncludes(historyHtml, "<title>小黑盒话题提醒</title>");
  assertIncludes(settingsHtml, "<title>小黑盒话题提醒</title>");
  assertIncludes(historyHtml, "<h1>命中历史</h1>");
  assertIncludes(settingsHtml, "<h1>设置</h1>");
});

Deno.test("renderSettings marks navigation and locale controls with icons", () => {
  const html = renderSettings({ csrfToken: testCsrfToken, settings: settings() });

  assertIncludes(html, `<form class="nav-item" method="get" action="/">`);
  assertIncludes(html, `<form class="nav-item" method="get" action="/settings">`);
  assertIncludes(html, `<form class="nav-item" method="get" action="/history">`);
  assertIncludes(html, `<button class="nav-link-button" type="submit"><svg class="nav-icon"`);
  assertIncludes(html, `class="settings-label-with-icon"`);
  assertIncludes(html, `class="settings-label-icon"`);
  assertIncludes(html, `viewBox="0 -960 960 960"`);
  assertIncludes(html, `d="m476-80`);
  assertNotIncludes(html, `<dt>`);
});

Deno.test("renderSettings marks RTL pages and isolates technical inputs", () => {
  const appSettings: AppSettings = {
    ...settings(),
    locale: "ar-SA",
    notificationSmtpHost: "smtp.example.com",
    topics: [{ enabled: true, id: "12345", keywordRules: [], note: "" }],
  };
  const html = renderSettings({ csrfToken: testCsrfToken, settings: appSettings });

  assertIncludes(html, `lang="ar-SA"`);
  assertIncludes(html, `dir="rtl"`);
  assertIncludes(html, `name="notificationSmtpHost"\n                dir="ltr"`);
  assertIncludes(html, `name="topic_0_id" dir="ltr" value="12345"`);
});

Deno.test("renderSettings does not expose notification secrets", () => {
  const appSettings = {
    ...settings(),
    notificationEmailApiToken: "email-api-token-secret",
    notificationPushPlusToken: "pushplus-token-secret",
    notificationServerChanSendKey: "server-chan-sendkey-secret",
    notificationSmtpPassword: "smtp-password-secret",
    notificationWebhookUrl: "https://example.com/webhook/secret-token",
    notificationWxPusherSpt: "wxpusher-spt-secret",
  };
  const html = renderSettings({ csrfToken: testCsrfToken, settings: appSettings });

  assertIncludes(html, `class="secret-display-input"`);
  assertIncludes(html, `data-secret-configured="true"`);
  assertNotIncludes(html, appSettings.notificationEmailApiToken);
  assertNotIncludes(html, appSettings.notificationPushPlusToken);
  assertNotIncludes(html, appSettings.notificationServerChanSendKey);
  assertNotIncludes(html, appSettings.notificationSmtpPassword);
  assertNotIncludes(html, appSettings.notificationWebhookUrl);
  assertNotIncludes(html, appSettings.notificationWxPusherSpt);
});

/**
 * 创建表格测试数据。
 *
 * @param records 命中记录列表。
 * @return 表格计算结果。
 */
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

/**
 * 创建测试命中记录。
 *
 * @param id 记录 ID。
 * @param matchedAt 命中时间。
 * @return 测试命中记录。
 */
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

/**
 * 创建测试使用的应用设置。
 *
 * @return 应用设置。
 */
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

/**
 * 断言两个值的 JSON 表示相等。
 *
 * @param actual 实际值。
 * @param expected 期望值。
 * @return 断言通过时无返回值。
 */
function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

/**
 * 断言字符串包含指定片段。
 *
 * @param actual 实际字符串。
 * @param expected 期望包含的片段。
 * @return 断言通过时无返回值。
 */
function assertIncludes(actual: string, expected: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`Expected output to include ${expected}`);
  }
}

/**
 * 断言字符串不包含指定片段。
 *
 * @param actual 实际字符串。
 * @param expected 不期望出现的片段。
 * @return 断言通过时无返回值。
 */
function assertNotIncludes(actual: string, expected: string): void {
  if (actual.includes(expected)) {
    throw new Error(`Expected output not to include ${expected}`);
  }
}
