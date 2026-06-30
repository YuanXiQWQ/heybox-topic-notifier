import { Hono } from "@hono/hono";
import type { AppContext } from "./services/app_context.ts";
import { renderDashboard } from "./views/dashboard.ts";
import { renderHistory } from "./views/history.ts";
import { renderSettings } from "./views/settings.ts";

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

  return app;
}
