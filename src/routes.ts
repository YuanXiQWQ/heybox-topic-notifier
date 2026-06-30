import { Hono } from "@hono/hono";
import { normalizeLocale } from "./locales/index.ts";
import type { AppSettings, MatchLocation } from "./models.ts";
import type { AppContext } from "./services/app_context.ts";
import { renderDashboard } from "./views/dashboard.ts";
import { renderHistory } from "./views/history.ts";
import { renderSettings } from "./views/settings.ts";

const matchLocations: MatchLocation[] = ["title", "body", "comments", "replies"];

export function createRoutes(context: AppContext): Hono {
  const app = new Hono();

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

function settingsFromForm(
  form: Record<string, FormDataEntryValue | FormDataEntryValue[]>,
  currentSettings: AppSettings,
): AppSettings {
  const indexes = Array.from(
    new Set(
      Object.keys(form)
        .map((key) => key.match(/^keyword_(\d+)$/)?.[1])
        .filter((value): value is string => value !== undefined)
        .map(Number),
    ),
  ).toSorted((left, right) => left - right);

  const keywordRules = indexes.map((index) => {
    const keyword = String(form[`keyword_${index}`] ?? "").trim();
    const locations = matchLocations.filter((location) =>
      form[`keyword_${index}_location_${location}`] === "on"
    );

    return { keyword, locations };
  }).filter((rule) => rule.keyword.length > 0 && rule.locations.length > 0);

  return {
    ...currentSettings,
    keywordRules,
    locale: normalizeLocale(String(form.locale ?? currentSettings.locale)),
    notificationProvider: normalizeNotificationProvider(form.notificationProvider),
    topicId: String(form.topicId ?? currentSettings.topicId).trim() || currentSettings.topicId,
  };
}

function normalizeNotificationProvider(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
): AppSettings["notificationProvider"] {
  return value === "disabled" || value === "email" || value === "webhook" ? value : "webhook";
}
