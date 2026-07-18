/**
 * @file 本文件负责创建应用业务路由并解析设置表单。
 */
import { Hono } from "@hono/hono";
import {
  hashPassword,
  normalizeUsername,
  readAuthSession,
  validUsername,
  verifyPassword,
} from "./auth.ts";
import { getMessages, normalizeLocale } from "./locales/index.ts";
import type {
  AppSettings,
  KeywordRule,
  MatchLocation,
  PollIntervalUnit,
  PollSort,
  TopicRule,
} from "./models.ts";
import {
  normalizeNotificationEmailService,
  normalizeNotificationWebhookService,
} from "./notification_services.ts";
import type { AppContext } from "./services/app_context.ts";
import { renderDashboard } from "./views/dashboard.ts";
import { renderPendingMatches } from "./views/dashboard.ts";
import { renderHistory } from "./views/history.ts";
import {
  applyMatchTableQuery,
  matchTableSignature,
  parseMatchTableQuery,
} from "./views/match_table.ts";
import { renderSettings } from "./views/settings.ts";
import {
  createRandomTestMatchRecord,
  NotificationConfigError,
  NotificationDeliveryError,
} from "./services/notifier.ts";

/**
 * 设置表单中支持的关键词匹配位置。
 */
const matchLocations: MatchLocation[] = ["title", "body", "comments", "replies"];
/**
 * 手动轮询后用于触发前端进度条重置的查询参数名。
 */
const pollResetParam = "pollReset";
/**
 * 手动轮询前进度条起始宽度查询参数名。
 */
const pollResetStartParam = "pollResetStart";

/**
 * 创建应用业务路由。
 *
 * @param context 应用运行时上下文。
 * @return Hono 路由应用。
 */
export function createRoutes(context: AppContext): Hono {
  const app = new Hono();

  app.get("/healthz", (c) =>
    c.json({
      deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID") ?? "local",
      service: "heybox-topic-notifier",
      status: "ok",
    }));

  app.get("/", async (c) => {
    const url = new URL(c.req.url);
    const storage = await storageForRequest(c, context);
    await context.scheduler?.tick();
    const { pendingMatches, settings, state } = await storage.getDashboardSnapshot();
    const pendingTable = applyMatchTableQuery(
      pendingMatches,
      parseMatchTableQuery(new URL(c.req.url).searchParams),
    );
    return c.html(renderDashboard({
      initialNextPollProgress: initialNextPollProgress(url.searchParams),
      pendingTable,
      returnTo: withoutPollResetFlag(`${url.pathname}${url.search}`),
      settings,
      state,
    }));
  });

  app.get("/dashboard-state", async (c) => {
    const url = new URL(c.req.url);
    if (url.searchParams.get("tick") === "1") {
      await context.scheduler?.tick();
    }
    url.searchParams.delete("tick");
    const storage = await storageForRequest(c, context);
    const { pendingMatches, settings, state } = await storage.getDashboardSnapshot();
    const pendingTable = applyMatchTableQuery(
      pendingMatches,
      parseMatchTableQuery(url.searchParams),
    );
    const messages = getMessages(settings.locale);

    return c.json({
      lastPollAt: state.lastPollAt ?? null,
      latestMatch: state.latestMatch
        ? {
          title: state.latestMatch.post.title,
          url: state.latestMatch.post.url,
        }
        : null,
      pendingHtml: renderPendingMatches(pendingTable, messages, settings.locale),
      pendingSignature: matchTableSignature(pendingTable),
      polling: {
        enabled: settings.polling.enabled,
        intervalUnit: settings.polling.intervalUnit,
        intervalValue: settings.polling.intervalValue,
      },
      totalMatches: state.totalMatches,
    });
  });

  app.get("/settings", async (c) => {
    const url = new URL(c.req.url);
    const storage = await storageForRequest(c, context);
    const session = await authSessionForRequest(c, context);
    const settings = await storage.getSettings();
    const account = session ? await context.storage.getAccountById(session.userId) : undefined;
    return c.html(renderSettings({
      account,
      accountStatus: accountStatusFromSearch(url.searchParams),
      settings,
    }));
  });

  app.post("/account", async (c) => {
    const session = await authSessionForRequest(c, context);
    if (!session) {
      return c.redirect("/login?locale=zh-CN&returnTo=%2Fsettings", 303);
    }

    const account = await context.storage.getAccountById(session.userId);
    if (!account) {
      return c.redirect(accountSettingsRedirect("notFound"), 303);
    }

    const form = await c.req.parseBody();
    const accountAction = String(form.accountAction ?? "");
    const username = normalizeUsername(String(form.username ?? ""));
    const currentPassword = String(form.currentPassword ?? "");
    const newPassword = String(form.newPassword ?? "");
    const confirmPassword = String(form.confirmPassword ?? "");

    if (accountAction !== "username" && accountAction !== "password") {
      return c.redirect("/settings", 303);
    }

    if (!(await verifyPassword(currentPassword, account))) {
      return c.redirect(accountSettingsRedirect("currentPassword", accountAction), 303);
    }

    if (accountAction === "username") {
      if (!validUsername(username)) {
        return c.redirect(accountSettingsRedirect("username", "username"), 303);
      }

      const updated = await context.storage.updateAccount({ ...account, username });
      if (!updated) {
        return c.redirect(accountSettingsRedirect("exists", "username"), 303);
      }

      return c.redirect("/settings?account=updated", 303);
    }

    if (accountAction === "password") {
      if (newPassword.length < 8) {
        return c.redirect(accountSettingsRedirect("password", "password"), 303);
      }

      if (newPassword !== confirmPassword) {
        return c.redirect(accountSettingsRedirect("confirmPassword", "password"), 303);
      }

      if (await verifyPassword(newPassword, account)) {
        return c.redirect(accountSettingsRedirect("samePassword", "password"), 303);
      }

      const updated = await context.storage.updateAccount({
        ...account,
        ...(await hashPassword(newPassword)),
      });
      if (!updated) {
        return c.redirect(accountSettingsRedirect("notFound"), 303);
      }

      return c.redirect("/settings?account=updated", 303);
    }

    return c.redirect("/settings", 303);
  });

  app.post("/account/verify-password", async (c) => {
    const session = await authSessionForRequest(c, context);
    if (!session) {
      return new Response(null, { status: 401 });
    }

    const account = await context.storage.getAccountById(session.userId);
    if (!account) {
      return new Response(null, { status: 404 });
    }

    const form = await c.req.parseBody();
    const currentPassword = String(form.currentPassword ?? "");
    return new Response(null, {
      status: await verifyPassword(currentPassword, account) ? 204 : 403,
    });
  });

  app.post("/settings", async (c) => {
    const storage = await storageForRequest(c, context);
    const form = await c.req.parseBody();
    const currentSettings = await storage.getSettings();
    await storage.saveSettings(settingsFromForm(form, currentSettings));
    if (c.req.header("x-autosave") === "1") {
      return new Response(null, { status: 204 });
    }
    return c.redirect("/settings");
  });

  app.get("/history", async (c) => {
    const storage = await storageForRequest(c, context);
    const settings = await storage.getSettings();
    const history = await storage.listHistory();
    const historyTable = applyMatchTableQuery(
      history,
      parseMatchTableQuery(new URL(c.req.url).searchParams),
    );
    return c.html(renderHistory({ historyTable, settings }));
  });

  app.post("/run-now", async (c) => {
    const storage = await optionalStorageForRequest(c, context);
    const form = await formDataOrEmpty(c.req.raw);
    try {
      if (storage) {
        await context.poller.runOnce(storage);
      } else {
        await context.poller.runOnce();
      }
      return c.redirect(
        withPollResetFlag(safeRedirectPath(form.get("returnTo"), "/"), form.get("pollResetStart")),
      );
    } catch (error) {
      return notificationErrorResponse(error);
    }
  });

  app.post("/simulate-match", async (c) => {
    const storage = await storageForRequest(c, context);
    const form = await formDataOrEmpty(c.req.raw);
    const settings = await storage.getSettings();
    await storage.saveMatch(createRandomTestMatchRecord(settings, 1, "simulation"));
    return c.redirect(safeRedirectPath(form.get("returnTo"), "/"));
  });

  app.post("/test-notify", async (c) => {
    const storage = await storageForRequest(c, context);
    const settings = await storage.getSettings();
    try {
      await context.notifier.sendTest(settings);
      if (c.req.header("x-test-notify") === "1") {
        return c.text(getMessages(settings.locale).testNotifySent);
      }
      return c.redirect("/");
    } catch (error) {
      return notificationErrorResponse(error);
    }
  });

  app.post("/matches/complete", async (c) => {
    const storage = await storageForRequest(c, context);
    const form = await c.req.raw.formData();
    const ids = form.getAll("matchId").map(String);
    if (ids.length > 0) {
      await storage.completeMatches(ids);
    }
    return c.redirect(safeRedirectPath(form.get("returnTo"), "/"));
  });

  app.post("/matches/delete", async (c) => {
    const storage = await storageForRequest(c, context);
    const form = await c.req.raw.formData();
    const ids = form.getAll("matchId").map(String);
    if (ids.length > 0) {
      await storage.deleteMatches(ids);
    }
    return c.redirect(safeRedirectPath(form.get("returnTo"), "/history"));
  });

  app.get("/static/app.css", async () => {
    const css = await Deno.readTextFile(new URL("../static/app.css", import.meta.url));
    return new Response(css, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/css; charset=utf-8",
      },
    });
  });

  app.get("/static/settings.js", async () => {
    const script = await Deno.readTextFile(new URL("../static/settings.js", import.meta.url));
    return new Response(script, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/javascript; charset=utf-8",
      },
    });
  });

  return app;
}

/**
 * 获取当前请求对应的用户存储，缺失存储时抛错。
 *
 * @param c Hono 请求上下文的最小结构。
 * @param context 应用运行时上下文。
 * @return 当前请求用户作用域存储。
 */
async function storageForRequest(
  c: { req: { header(name: string): string | undefined } },
  context: AppContext,
) {
  const storage = await optionalStorageForRequest(c, context);
  if (!storage) {
    throw new Error("Storage is not configured for this route.");
  }
  return storage;
}

/**
 * 获取当前请求对应的用户存储，缺失存储时返回 undefined。
 *
 * @param c Hono 请求上下文的最小结构。
 * @param context 应用运行时上下文。
 * @return 当前请求用户作用域存储。
 */
async function optionalStorageForRequest(
  c: { req: { header(name: string): string | undefined } },
  context: AppContext,
) {
  const storage = (context as { storage?: AppContext["storage"] }).storage;
  if (!storage) {
    return undefined;
  }

  const session = await readAuthSession(c.req.header("cookie"), storage);
  return "forUser" in storage ? storage.forUser(session?.userId ?? "default") : storage;
}

/**
 * 将通知相关错误转换为 HTTP 响应。
 *
 * @param error 原始错误。
 * @return 错误响应。
 */
async function authSessionForRequest(
  c: { req: { header(name: string): string | undefined } },
  context: AppContext,
) {
  const storage = (context as { storage?: AppContext["storage"] }).storage;
  return storage ? await readAuthSession(c.req.header("cookie"), storage) : undefined;
}

type AccountErrorCode =
  | "confirmPassword"
  | "currentPassword"
  | "exists"
  | "notFound"
  | "password"
  | "samePassword"
  | "username";

function accountSettingsRedirect(error: AccountErrorCode, mode?: "password" | "username"): string {
  return `/settings?accountError=${error}${mode ? `&accountMode=${mode}` : ""}`;
}

function accountStatusFromSearch(searchParams: URLSearchParams) {
  const error = searchParams.get("accountError");
  if (isAccountErrorCode(error)) {
    const mode = accountModeFromSearch(searchParams.get("accountMode"));
    return { code: error, mode, type: "error" as const };
  }

  return searchParams.get("account") === "updated"
    ? { code: "updated" as const, type: "success" as const }
    : undefined;
}

function accountModeFromSearch(value: string | null): "password" | "username" | undefined {
  return value === "password" || value === "username" ? value : undefined;
}

function isAccountErrorCode(value: string | null): value is AccountErrorCode {
  return value === "confirmPassword" ||
    value === "currentPassword" ||
    value === "exists" ||
    value === "notFound" ||
    value === "password" ||
    value === "samePassword" ||
    value === "username";
}

function notificationErrorResponse(error: unknown): Response {
  if (error instanceof NotificationConfigError) {
    return new Response(error.message, {
      headers: { "content-type": "text/plain; charset=utf-8" },
      status: 400,
    });
  }

  if (error instanceof NotificationDeliveryError) {
    return new Response(error.message, {
      headers: { "content-type": "text/plain; charset=utf-8" },
      status: 502,
    });
  }

  throw error;
}

/**
 * 规范化表单中的返回路径。
 *
 * @param value 原始返回路径。
 * @param fallback 允许的兜底路径。
 * @return 安全的返回路径。
 */
function safeRedirectPath(value: FormDataEntryValue | null, fallback: "/" | "/history"): string {
  if (typeof value !== "string") {
    return fallback;
  }

  try {
    const url = new URL(value, "http://local");
    if (url.origin !== "http://local" || url.pathname !== fallback) {
      return fallback;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

/**
 * 给路径追加轮询重置标记。
 *
 * @param path 原始路径。
 * @param startWidth 进度条起始宽度。
 * @return 带轮询重置标记的路径。
 */
function withPollResetFlag(path: string, startWidth: FormDataEntryValue | null): string {
  const url = new URL(path, "http://local");
  url.searchParams.set(pollResetParam, "1");
  const normalizedStartWidth = normalizePollResetStart(startWidth);
  if (normalizedStartWidth) {
    url.searchParams.set(pollResetStartParam, normalizedStartWidth);
  }
  return `${url.pathname}${url.search}`;
}

/**
 * 移除路径中的轮询重置标记。
 *
 * @param path 原始路径。
 * @return 移除轮询重置标记后的路径。
 */
function withoutPollResetFlag(path: string): string {
  const url = new URL(path, "http://local");
  url.searchParams.delete(pollResetParam);
  url.searchParams.delete(pollResetStartParam);
  return `${url.pathname}${url.search}`;
}

/**
 * 从查询参数中读取初始下次轮询进度。
 *
 * @param params URL 查询参数。
 * @return 初始进度百分比，未指定时返回 undefined。
 */
function initialNextPollProgress(params: URLSearchParams): string | undefined {
  if (params.get(pollResetParam) !== "1") {
    return undefined;
  }
  return normalizePollResetStart(params.get(pollResetStartParam)) ?? "0";
}

/**
 * 规范化轮询重置起始宽度。
 *
 * @param value 原始起始宽度。
 * @return 0 到 100 之间的宽度字符串。
 */
function normalizePollResetStart(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return String(Math.max(0, Math.min(100, parsed)));
}

/**
 * 读取请求表单，读取失败时返回空表单。
 *
 * @param request 原始请求。
 * @return 表单数据。
 */
async function formDataOrEmpty(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    return new FormData();
  }
}

/**
 * 从表单数据生成应用设置。
 *
 * @param form 表单数据。
 * @param currentSettings 当前应用设置。
 * @return 新的应用设置。
 */
export function settingsFromForm(
  form: Record<string, FormDataEntryValue | FormDataEntryValue[]>,
  currentSettings: AppSettings,
): AppSettings {
  const activeKeywordTarget = String(form.activeKeywordTarget ?? "common").trim() || "common";
  const keywordRules = keywordRulesFromForm(form);
  const commonKeywordRules = activeKeywordTarget === "common"
    ? keywordRules
    : keywordRulesFromJson(form.commonKeywordRulesJson) ?? currentSettings.commonKeywordRules;
  const topics = topicsFromForm(form, currentSettings, activeKeywordTarget, keywordRules);

  return {
    ...currentSettings,
    activeKeywordTarget,
    commonKeywordRules,
    darkMode: form.darkMode === "on",
    locale: normalizeLocale(String(form.locale ?? currentSettings.locale)),
    notificationEmailAddress: String(form.notificationEmailAddress ?? "").trim(),
    notificationEmailApiToken: String(form.notificationEmailApiToken ?? ""),
    notificationEmailApiUrl: String(form.notificationEmailApiUrl ?? "").trim(),
    notificationEmailFrom: String(form.notificationEmailFrom ?? "").trim(),
    notificationEmailService: normalizeNotificationEmailService(form.notificationEmailService),
    notificationProvider: normalizeNotificationProvider(form.notificationProvider),
    notificationPushPlusToken: String(
      form.notificationPushPlusSecret ?? form.notificationPushPlusToken ?? "",
    ).trim(),
    notificationServerChanSendKey: String(form.notificationServerChanSendKey ?? "").trim(),
    notificationSmtpHost: String(form.notificationSmtpHost ?? "").trim(),
    notificationSmtpPassword: String(form.notificationSmtpPassword ?? ""),
    notificationSmtpPort: normalizePositiveInteger(
      form.notificationSmtpPort,
      currentSettings.notificationSmtpPort,
    ),
    notificationSmtpSecure: form.notificationSmtpSecure === "on",
    notificationSmtpUsername: String(form.notificationSmtpUsername ?? "").trim(),
    notificationWebhookService: normalizeNotificationWebhookService(
      form.notificationWebhookService,
    ),
    notificationWebhookUrl: String(form.notificationWebhookUrl ?? "").trim(),
    notificationWxPusherSpt: String(form.notificationWxPusherSpt ?? "").trim(),
    polling: {
      enabled: form.pollEnabled === "on",
      intervalUnit: normalizePollIntervalUnit(
        form.pollIntervalUnit,
        currentSettings.polling.intervalUnit,
      ),
      intervalValue: normalizePollIntervalValue(
        form.pollIntervalValue,
        normalizePollIntervalUnit(form.pollIntervalUnit, currentSettings.polling.intervalUnit),
        currentSettings.polling.intervalValue,
      ),
      postLimit: normalizePositiveInteger(form.pollPostLimit, currentSettings.polling.postLimit),
      sort: normalizePollSort(form.pollSort, currentSettings.polling.sort),
    },
    themeColor: normalizeThemeColor(form.themeColor, currentSettings.themeColor),
    topics,
  };
}

/**
 * 从表单字段中解析关键词规则。
 *
 * @param form 表单数据。
 * @return 关键词规则列表。
 */
function keywordRulesFromForm(
  form: Record<string, FormDataEntryValue | FormDataEntryValue[]>,
): KeywordRule[] {
  return formIndexes(form, /^keyword_(\d+)$/).map((index) => {
    const keyword = String(form[`keyword_${index}`] ?? "").trim();
    const locations = matchLocations.filter((location) =>
      form[`keyword_${index}_location_${location}`] === "on"
    );
    const caseSensitive = form[`keyword_${index}_caseSensitive`] === "on";
    const useRegex = form[`keyword_${index}_useRegex`] === "on";

    return { caseSensitive, keyword, locations, useRegex };
  }).filter((rule) => rule.keyword.length > 0 && rule.locations.length > 0);
}

/**
 * 从表单字段中解析话题规则。
 *
 * @param form 表单数据。
 * @param currentSettings 当前应用设置。
 * @param activeKeywordTarget 当前正在编辑关键词的目标。
 * @param activeKeywordRules 当前活动关键词规则。
 * @return 话题规则列表。
 */
function topicsFromForm(
  form: Record<string, FormDataEntryValue | FormDataEntryValue[]>,
  currentSettings: AppSettings,
  activeKeywordTarget: string,
  activeKeywordRules: KeywordRule[],
): TopicRule[] {
  const existingTopics = new Map(currentSettings.topics.map((topic) => [topic.id, topic]));

  return formIndexes(form, /^topic_(\d+)_id$/).map((index) => {
    const id = String(form[`topic_${index}_id`] ?? "").trim();
    const existingTopic = existingTopics.get(id);
    const submittedKeywordRules = keywordRulesFromJson(form[`topic_${index}_keywordRulesJson`]);
    const keywordRules = activeKeywordTarget === id
      ? activeKeywordRules
      : submittedKeywordRules ?? existingTopic?.keywordRules ?? [];

    return {
      enabled: form[`topic_${index}_enabled`] === "on",
      id,
      keywordRules,
      note: String(form[`topic_${index}_note`] ?? "").trim(),
    };
  }).filter((topic) => topic.id.length > 0);
}

/**
 * 从 JSON 字符串中解析关键词规则。
 *
 * @param value 表单中的 JSON 字段值。
 * @return 关键词规则列表，无法解析时返回 undefined。
 */
function keywordRulesFromJson(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
): KeywordRule[] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return undefined;
    }

    return parsed.map((rule) => {
      const keyword = typeof rule?.keyword === "string" ? rule.keyword.trim() : "";
      const locations = Array.isArray(rule?.locations)
        ? rule.locations.filter(isMatchLocation)
        : [];
      const caseSensitive = rule?.caseSensitive === true;
      const useRegex = rule?.useRegex === true;

      return { caseSensitive, keyword, locations, useRegex };
    }).filter((rule) => rule.keyword.length > 0 && rule.locations.length > 0);
  } catch {
    return undefined;
  }
}

/**
 * 判断值是否为合法匹配位置。
 *
 * @param value 待判断值。
 * @return 是合法匹配位置时返回 true。
 */
function isMatchLocation(value: unknown): value is MatchLocation {
  return value === "title" || value === "body" || value === "comments" || value === "replies";
}

/**
 * 从表单字段名中提取索引列表。
 *
 * @param form 表单数据。
 * @param pattern 字段名匹配正则。
 * @return 按升序排列的索引列表。
 */
function formIndexes(
  form: Record<string, FormDataEntryValue | FormDataEntryValue[]>,
  pattern: RegExp,
): number[] {
  return Array.from(
    new Set(
      Object.keys(form)
        .map((key) => key.match(pattern)?.[1])
        .filter((value): value is string => value !== undefined)
        .map(Number),
    ),
  ).toSorted((left, right) => left - right);
}

/**
 * 规范化通知渠道。
 *
 * @param value 表单字段值。
 * @return 合法通知渠道。
 */
function normalizeNotificationProvider(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
): AppSettings["notificationProvider"] {
  return value === "disabled" || value === "email" || value === "webhook" ? value : "webhook";
}

/**
 * 规范化正整数表单字段。
 *
 * @param value 表单字段值。
 * @param fallback 兜底值。
 * @return 合法正整数。
 */
function normalizePositiveInteger(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  fallback: number,
): number {
  const numericValue = Number(typeof value === "string" ? value : undefined);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : fallback;
}

/**
 * 规范化轮询排序方式。
 *
 * @param value 表单字段值。
 * @param fallback 兜底排序方式。
 * @return 合法轮询排序方式。
 */
function normalizePollSort(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  fallback: PollSort,
): PollSort {
  return value === "publishTime" || value === "smart" || value === "replyTime" ? value : fallback;
}

/**
 * 规范化轮询间隔单位。
 *
 * @param value 表单字段值。
 * @param fallback 兜底轮询间隔单位。
 * @return 合法轮询间隔单位。
 */
function normalizePollIntervalUnit(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  fallback: PollIntervalUnit,
): PollIntervalUnit {
  return value === "second" || value === "minute" || value === "hour" || value === "day" ||
      value === "week" || value === "month"
    ? value
    : fallback;
}

/**
 * 规范化轮询间隔数值。
 *
 * @param value 表单字段值。
 * @param unit 轮询间隔单位。
 * @param fallback 兜底间隔数值。
 * @return 合法轮询间隔数值。
 */
function normalizePollIntervalValue(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  unit: PollIntervalUnit,
  fallback: number,
): number {
  const intervalValue = normalizePositiveInteger(value, fallback);
  return unit === "second" ? Math.max(3, intervalValue) : intervalValue;
}

/**
 * 规范化主题颜色。
 *
 * @param value 表单字段值。
 * @param fallback 兜底主题颜色。
 * @return 合法主题颜色。
 */
function normalizeThemeColor(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  fallback: string,
): string {
  const color = typeof value === "string" ? value.trim() : "";
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : fallback;
}
