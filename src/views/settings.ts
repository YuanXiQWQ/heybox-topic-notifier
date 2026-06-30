import { getMessages } from "../locales/index.ts";
import { languageOptions } from "../locales/languages.ts";
import type { AppSettings, MatchLocation } from "../models.ts";
import { escapeHtml, renderLayout } from "./html.ts";

const matchLocations: MatchLocation[] = ["title", "body", "comments", "replies"];

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
    <form method="post" action="/settings">
      <section class="settings-group" aria-labelledby="post-settings-heading">
        <h2 id="post-settings-heading">${escapeHtml(messages.postSettings)}</h2>
        <dl class="settings-list">
          <div>
            <dt>${escapeHtml(messages.topicId)}</dt>
            <dd>
              <input name="topicId" value="${escapeHtml(options.settings.topicId)}">
            </dd>
          </div>
          ${renderKeywordSection(options.settings)}
        </dl>
      </section>
      <section class="settings-group" aria-labelledby="global-settings-heading">
        <h2 id="global-settings-heading">${escapeHtml(messages.globalSettings)}</h2>
        <dl class="settings-list">
          <div>
            <dt>${escapeHtml(messages.notificationProvider)}</dt>
            <dd>
              <select name="notificationProvider">
                ${
    option("webhook", options.settings.notificationProvider, messages.notificationWebhook)
  }
                ${
    option("email", options.settings.notificationProvider, messages.notificationEmail)
  }
                ${
    option("disabled", options.settings.notificationProvider, messages.notificationDisabled)
  }
              </select>
            </dd>
          </div>
          <div>
            <dt>${escapeHtml(messages.locale)}</dt>
            <dd>
              <select name="locale">
                ${
    languageOptions.map((language) =>
      option(language.code, options.settings.locale, language.label)
    ).join("")
  }
              </select>
            </dd>
          </div>
        </dl>
      </section>
      <div class="form-actions">
        <button type="submit">${escapeHtml(messages.saveSettings)}</button>
      </div>
    </form>
    <script src="/static/settings.js" defer></script>
  `;

  return renderLayout({
    body,
    locale: options.settings.locale,
    title: messages.settingsTitle,
  });
}

function renderKeywordSection(settings: AppSettings): string {
  const messages = getMessages(settings.locale);
  const rows = settings.keywordRules.length > 0
    ? settings.keywordRules
    : [{ keyword: "", locations: [] as MatchLocation[] }];

  return `
    <div
      class="keyword-settings-row"
      data-keyword-editor
      data-delete-message="${escapeHtml(messages.selectKeywordToDelete)}"
    >
      <dt>${escapeHtml(messages.keywords)}</dt>
      <dd class="keyword-toggle-cell">
        <button
          type="button"
          class="keyword-toggle"
          data-action="toggle-keywords"
          aria-expanded="false"
          aria-controls="keyword-rules-panel"
          aria-label="${escapeHtml(messages.keywords)}"
        >
          <span class="dropdown-chevron" aria-hidden="true"></span>
        </button>
      </dd>
      <dd class="keyword-rules-panel" id="keyword-rules-panel" data-keyword-panel hidden>
        <div class="keyword-rules-panel-inner">
          <div class="keyword-rule-grid" role="table">
            ${renderKeywordRuleHeader(messages)}
            ${rows.map((rule, index) => renderKeywordRuleRow(rule, index)).join("")}
          </div>
        </div>
      </dd>
      <template data-keyword-row-template>
        ${renderKeywordRuleRow({ keyword: "", locations: [] }, "__index__")}
      </template>
    </div>
  `;
}

function renderKeywordRuleHeader(messages: ReturnType<typeof getMessages>): string {
  return `
        <div class="keyword-rule-row keyword-rule-head" role="row">
          <label class="checkbox-cell" role="columnheader">
            <input type="checkbox" data-role="select-all-keywords">
          </label>
          <div role="columnheader">${escapeHtml(messages.keywords)}</div>
          <div role="columnheader">${escapeHtml(messages.matchLocationHeader)}：${
    escapeHtml(messages.matchTitle)
  }</div>
          <div role="columnheader">${escapeHtml(messages.matchBody)}</div>
          <div role="columnheader">${escapeHtml(messages.matchComments)}</div>
          <div role="columnheader">${escapeHtml(messages.matchReplies)}</div>
          <div role="columnheader">
            <button
              type="button"
              class="icon-button"
              data-action="delete-keywords"
              title="${escapeHtml(messages.selectKeywordToDelete)}"
              aria-label="${escapeHtml(messages.selectKeywordToDelete)}"
            >${trashIcon()}</button>
          </div>
          <div role="columnheader">
            <button
              type="button"
              class="icon-button text-icon-button"
              data-action="insert-keyword"
              aria-label="+"
            >+</button>
          </div>
        </div>
  `;
}

function renderKeywordRuleRow(
  rule: { keyword: string; locations: MatchLocation[] },
  index: number | "__index__",
): string {
  return `
    <div class="keyword-rule-row keyword-rule-item" role="row" data-keyword-row>
      <label class="checkbox-cell" role="cell">
        <input type="checkbox" data-role="select-keyword-row">
      </label>
      <div role="cell">
        <input name="keyword_${index}" value="${escapeHtml(rule.keyword)}">
      </div>
      ${
    matchLocations.map((location) => `
        <label class="checkbox-cell" role="cell">
          <input
            type="checkbox"
            name="keyword_${index}_location_${location}"
            ${rule.locations.includes(location) ? "checked" : ""}
          >
        </label>
      `).join("")
  }
      <div role="cell">
        <button
          type="button"
          class="icon-button"
          data-action="delete-keywords"
          aria-label="delete"
        >${trashIcon()}</button>
      </div>
      <div role="cell">
        <button
          type="button"
          class="icon-button text-icon-button"
          data-action="insert-keyword"
          aria-label="+"
        >+</button>
      </div>
    </div>
  `;
}

function option(value: string, current: string, label: string): string {
  return `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${
    escapeHtml(label)
  }</option>`;
}

function trashIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z"></path>
    <path d="M6 9h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z"></path>
  </svg>`;
}
