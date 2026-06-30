import { getMessages } from "../locales/index.ts";
import type { AppSettings } from "../models.ts";
import { escapeHtml, renderLayout } from "./html.ts";

export function renderSettings(options: {
  settings: AppSettings;
}): string {
  const messages = getMessages(options.settings.locale);
  const body = `
    <section class="page-heading">
      <div>
        <h1>${escapeHtml(messages.settingsTitle)}</h1>
        <p>${escapeHtml(messages.appDescription)}</p>
      </div>
    </section>
    <dl class="settings-list">
      <div>
        <dt>${escapeHtml(messages.topicId)}</dt>
        <dd>${escapeHtml(options.settings.topicId)}</dd>
      </div>
      <div>
        <dt>${escapeHtml(messages.keywords)}</dt>
        <dd>${escapeHtml(options.settings.keywords.join(", "))}</dd>
      </div>
      <div>
        <dt>${escapeHtml(messages.notificationProvider)}</dt>
        <dd>${escapeHtml(options.settings.notificationProvider)}</dd>
      </div>
      <div>
        <dt>${escapeHtml(messages.locale)}</dt>
        <dd>${escapeHtml(options.settings.locale)}</dd>
      </div>
    </dl>
  `;

  return renderLayout({
    body,
    locale: options.settings.locale,
    title: messages.settingsTitle,
  });
}
