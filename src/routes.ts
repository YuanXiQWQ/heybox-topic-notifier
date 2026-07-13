import { Hono } from "@hono/hono";
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

const matchLocations: MatchLocation[] = ["title", "body", "comments", "replies"];
const pollResetParam = "pollReset";
const pollResetStartParam = "pollResetStart";

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
    const settings = await context.storage.getSettings();
    const state = await context.storage.getAppState();
    const pendingMatches = await context.storage.listPendingMatches();
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
    const settings = await context.storage.getSettings();
    const state = await context.storage.getAppState();
    const pendingMatches = await context.storage.listPendingMatches();
    const pendingTable = applyMatchTableQuery(
      pendingMatches,
      parseMatchTableQuery(new URL(c.req.url).searchParams),
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
    const settings = await context.storage.getSettings();
    return c.html(renderSettings({ settings }));
  });

  app.post("/settings", async (c) => {
    const form = await c.req.parseBody();
    const currentSettings = await context.storage.getSettings();
    await context.storage.saveSettings(settingsFromForm(form, currentSettings));
    if (c.req.header("x-autosave") === "1") {
      return new Response(null, { status: 204 });
    }
    return c.redirect("/settings");
  });

  app.get("/history", async (c) => {
    const settings = await context.storage.getSettings();
    const history = await context.storage.listHistory();
    const historyTable = applyMatchTableQuery(
      history,
      parseMatchTableQuery(new URL(c.req.url).searchParams),
    );
    return c.html(renderHistory({ historyTable, settings }));
  });

  app.post("/run-now", async (c) => {
    const form = await formDataOrEmpty(c.req.raw);
    try {
      await context.poller.runOnce();
      return c.redirect(
        withPollResetFlag(safeRedirectPath(form.get("returnTo"), "/"), form.get("pollResetStart")),
      );
    } catch (error) {
      return notificationErrorResponse(error);
    }
  });

  app.post("/simulate-match", async (c) => {
    const form = await formDataOrEmpty(c.req.raw);
    const settings = await context.storage.getSettings();
    await context.storage.saveMatch(createRandomTestMatchRecord(settings, 1, "simulation"));
    return c.redirect(safeRedirectPath(form.get("returnTo"), "/"));
  });

  app.post("/test-notify", async (c) => {
    const settings = await context.storage.getSettings();
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
    const form = await c.req.raw.formData();
    const ids = form.getAll("matchId").map(String);
    if (ids.length > 0) {
      await context.storage.completeMatches(ids);
    }
    return c.redirect(safeRedirectPath(form.get("returnTo"), "/"));
  });

  app.post("/matches/delete", async (c) => {
    const form = await c.req.raw.formData();
    const ids = form.getAll("matchId").map(String);
    if (ids.length > 0) {
      await context.storage.deleteMatches(ids);
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

function withPollResetFlag(path: string, startWidth: FormDataEntryValue | null): string {
  const url = new URL(path, "http://local");
  url.searchParams.set(pollResetParam, "1");
  const normalizedStartWidth = normalizePollResetStart(startWidth);
  if (normalizedStartWidth) {
    url.searchParams.set(pollResetStartParam, normalizedStartWidth);
  }
  return `${url.pathname}${url.search}`;
}

function withoutPollResetFlag(path: string): string {
  const url = new URL(path, "http://local");
  url.searchParams.delete(pollResetParam);
  url.searchParams.delete(pollResetStartParam);
  return `${url.pathname}${url.search}`;
}

function initialNextPollProgress(params: URLSearchParams): string | undefined {
  if (params.get(pollResetParam) !== "1") {
    return undefined;
  }
  return normalizePollResetStart(params.get(pollResetStartParam)) ?? "0";
}

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

async function formDataOrEmpty(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    return new FormData();
  }
}

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

function isMatchLocation(value: unknown): value is MatchLocation {
  return value === "title" || value === "body" || value === "comments" || value === "replies";
}

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

function normalizeNotificationProvider(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
): AppSettings["notificationProvider"] {
  return value === "disabled" || value === "email" || value === "webhook" ? value : "webhook";
}

function normalizePositiveInteger(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  fallback: number,
): number {
  const numericValue = Number(typeof value === "string" ? value : undefined);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : fallback;
}

function normalizePollSort(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  fallback: PollSort,
): PollSort {
  return value === "publishTime" || value === "smart" || value === "replyTime" ? value : fallback;
}

function normalizePollIntervalUnit(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  fallback: PollIntervalUnit,
): PollIntervalUnit {
  return value === "second" || value === "minute" || value === "hour" || value === "day" ||
      value === "week" || value === "month"
    ? value
    : fallback;
}

function normalizePollIntervalValue(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  unit: PollIntervalUnit,
  fallback: number,
): number {
  const intervalValue = normalizePositiveInteger(value, fallback);
  return unit === "second" ? Math.max(3, intervalValue) : intervalValue;
}

function normalizeThemeColor(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  fallback: string,
): string {
  const color = typeof value === "string" ? value.trim() : "";
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : fallback;
}
