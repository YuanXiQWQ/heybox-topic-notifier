import { Hono } from "@hono/hono";
import { normalizeLocale } from "./locales/index.ts";
import type { AppSettings, KeywordRule, MatchLocation, PollSort, TopicRule } from "./models.ts";
import type { AppContext } from "./services/app_context.ts";
import { renderDashboard } from "./views/dashboard.ts";
import { renderHistory } from "./views/history.ts";
import { renderSettings } from "./views/settings.ts";

const matchLocations: MatchLocation[] = ["title", "body", "comments", "replies"];

export function createRoutes(context: AppContext): Hono {
  const app = new Hono();

  app.get("/healthz", (c) =>
    c.json({
      deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID") ?? "local",
      service: "heybox-topic-notifier",
      status: "ok",
    }));

  app.get("/", async (c) => {
    const settings = await context.storage.getSettings();
    const state = await context.storage.getAppState();
    return c.html(renderDashboard({ settings, state }));
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
    return c.html(renderHistory({ history, settings }));
  });

  app.post("/run-now", async (c) => {
    await context.poller.runOnce();
    return c.redirect("/");
  });

  app.post("/test-notify", async (c) => {
    await context.notifier.sendTest();
    return c.redirect("/");
  });

  app.get("/static/app.css", async () => {
    const css = await Deno.readTextFile(new URL("../static/app.css", import.meta.url));
    return new Response(css, {
      headers: {
        "content-type": "text/css; charset=utf-8",
      },
    });
  });

  app.get("/static/settings.js", async () => {
    const script = await Deno.readTextFile(new URL("../static/settings.js", import.meta.url));
    return new Response(script, {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
      },
    });
  });

  return app;
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
    notificationProvider: normalizeNotificationProvider(form.notificationProvider),
    polling: {
      intervalMinutes: normalizePositiveInteger(
        form.pollIntervalMinutes,
        currentSettings.polling.intervalMinutes,
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

    return { keyword, locations };
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

      return { keyword, locations };
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

function normalizeThemeColor(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  fallback: string,
): string {
  const color = typeof value === "string" ? value.trim() : "";
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : fallback;
}
