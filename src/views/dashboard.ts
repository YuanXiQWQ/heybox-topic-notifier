import { getMessages } from "../locales/index.ts";
import type { AppSettings, AppState } from "../models.ts";
import { escapeHtml, renderLayout } from "./html.ts";

export function renderDashboard(options: {
  settings: AppSettings;
  state: AppState;
}): string {
  const messages = getMessages(options.settings.locale);
  const latest = options.state.latestMatch;

  const body = `
    <section class="page-heading">
      <div>
        <h1>${escapeHtml(messages.dashboardTitle)}</h1>
        <p>${escapeHtml(messages.dashboardSubtitle)}</p>
      </div>
      <div class="actions">
        <form method="post" action="/run-now">
          <button type="submit">${escapeHtml(messages.runNow)}</button>
        </form>
        <form method="post" action="/test-notify">
          <button type="submit" class="secondary">${escapeHtml(messages.testNotify)}</button>
        </form>
      </div>
    </section>
    <section class="metrics">
      <article>
        <span>${escapeHtml(messages.lastPoll)}</span>
        <strong>${escapeHtml(options.state.lastPollAt ?? "-")}</strong>
      </article>
      <article>
        <span>${escapeHtml(messages.latestMatch)}</span>
        <strong>${escapeHtml(latest?.post.title ?? "-")}</strong>
      </article>
      <article>
        <span>${escapeHtml(messages.totalMatches)}</span>
        <strong>${options.state.totalMatches}</strong>
      </article>
    </section>
  `;

  return renderLayout({
    body,
    darkMode: options.settings.darkMode,
    locale: options.settings.locale,
    themeColor: options.settings.themeColor,
    title: messages.appName,
  });
}
