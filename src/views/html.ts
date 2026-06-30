import { getMessages } from "../locales/index.ts";
import type { Locale } from "../locales/types.ts";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderLayout(options: {
  body: string;
  locale: Locale;
  title: string;
}): string {
  const messages = getMessages(options.locale);

  return `<!doctype html>
<html lang="${options.locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(options.title)}</title>
    <link rel="stylesheet" href="/static/app.css">
  </head>
  <body>
    <header class="topbar">
      <a class="brand" href="/">${escapeHtml(messages.appName)}</a>
      <nav aria-label="Primary">
        <a href="/">${escapeHtml(messages.navDashboard)}</a>
        <a href="/settings">${escapeHtml(messages.navSettings)}</a>
        <a href="/history">${escapeHtml(messages.navHistory)}</a>
      </nav>
    </header>
    <main class="shell">${options.body}</main>
  </body>
</html>`;
}
