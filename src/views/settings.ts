import { getMessages } from "../locales/index.ts";
import { languageOptions } from "../locales/languages.ts";
import type { AppSettings, KeywordRule, MatchLocation, TopicRule } from "../models.ts";
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
        <dl class="settings-list" data-settings-list>
          ${renderTopicSection(options.settings)}
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
            <dt>${escapeHtml(messages.theme)}</dt>
            <dd>
              <input
                class="theme-color-input"
                type="color"
                name="themeColor"
                value="${escapeHtml(options.settings.themeColor)}"
                data-theme-color-input
                aria-label="${escapeHtml(messages.theme)}"
              >
            </dd>
          </div>
          <div>
            <dt>${escapeHtml(messages.darkMode)}</dt>
            <dd>
              <label class="switch-control">
                <input
                  type="checkbox"
                  name="darkMode"
                  data-dark-mode-input
                  ${options.settings.darkMode ? "checked" : ""}
                >
              </label>
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
    darkMode: options.settings.darkMode,
    locale: options.settings.locale,
    themeColor: options.settings.themeColor,
    title: messages.settingsTitle,
  });
}

function renderTopicSection(settings: AppSettings): string {
  const messages = getMessages(settings.locale);
  const activeTopic = findActiveTopic(settings);
  const summary = topicSummary(settings, activeTopic);
  const topics = settings.topics.length > 0
    ? settings.topics
    : [{ enabled: true, id: "", keywordRules: [], note: "" }];

  return `
    <div
      class="dropdown-settings-row topic-settings-row"
      data-topic-editor
      data-delete-message="${escapeHtml(messages.selectTopicToDelete)}"
    >
      <dt>${escapeHtml(messages.topic)}</dt>
      <dd class="dropdown-summary-cell">
        <input type="hidden" name="activeKeywordTarget" value="${
    escapeHtml(settings.activeKeywordTarget)
  }" data-active-keyword-target>
        <span data-topic-summary data-common-label="${escapeHtml(messages.commonTopic)}">${
    escapeHtml(summary)
  }</span>
        <button
          type="button"
          class="dropdown-toggle"
          data-action="toggle-topics"
          aria-expanded="false"
          aria-controls="topic-rules-panel"
          aria-label="${escapeHtml(messages.topic)}"
        >
          <span class="dropdown-chevron" aria-hidden="true"></span>
        </button>
      </dd>
      <dd class="dropdown-panel topic-rules-panel" id="topic-rules-panel" data-topic-panel hidden>
        <div class="dropdown-panel-inner">
          <div class="topic-rule-grid" role="table">
            ${renderTopicRuleHeader(messages)}
            ${topics.map((topic, index) => renderTopicRuleRow(topic, index, messages)).join("")}
          </div>
        </div>
      </dd>
      <template data-topic-row-template>
        ${
    renderTopicRuleRow({ enabled: true, id: "", keywordRules: [], note: "" }, "__index__", messages)
  }
      </template>
    </div>
  `;
}

function renderKeywordSection(settings: AppSettings): string {
  const messages = getMessages(settings.locale);
  const rows = activeKeywordRules(settings);
  const summaryKeywords = rows.map((rule) => rule.keyword).filter(Boolean);

  return `
    <div
      class="dropdown-settings-row keyword-settings-row"
      data-keyword-editor
      data-delete-message="${escapeHtml(messages.selectKeywordToDelete)}"
    >
      <dt>${escapeHtml(messages.keywords)}</dt>
      <dd class="dropdown-summary-cell">
        <span class="keyword-summary" data-keyword-summary>
          ${renderKeywordSummary(summaryKeywords)}
        </span>
        <button
          type="button"
          class="dropdown-toggle keyword-toggle"
          data-action="toggle-keywords"
          aria-expanded="false"
          aria-controls="keyword-rules-panel"
          aria-label="${escapeHtml(messages.keywords)}"
        >
          <span class="dropdown-chevron" aria-hidden="true"></span>
        </button>
      </dd>
      <dd class="dropdown-panel keyword-rules-panel" id="keyword-rules-panel" data-keyword-panel hidden>
        <div class="dropdown-panel-inner">
          <div class="keyword-rule-grid" role="table">
            ${renderKeywordRuleHeader(messages)}
            ${
    (rows.length > 0 ? rows : [{ keyword: "", locations: [] as MatchLocation[] }])
      .map((rule, index) => renderKeywordRuleRow(rule, index)).join("")
  }
          </div>
        </div>
      </dd>
      <template data-keyword-row-template>
        ${renderKeywordRuleRow({ keyword: "", locations: [] }, "__index__")}
      </template>
    </div>
  `;
}

function renderTopicRuleHeader(messages: ReturnType<typeof getMessages>): string {
  return `
    <div class="topic-rule-row topic-rule-head" role="row">
      <label class="checkbox-cell bulk-action-cell" role="columnheader">
        <span>${escapeHtml(messages.batchOperation)}</span>
        <input type="checkbox" data-role="select-all-topics">
      </label>
      <div role="columnheader">${escapeHtml(messages.topicId)}</div>
      <div role="columnheader">${escapeHtml(messages.topicNote)}</div>
      <label class="checkbox-cell" role="columnheader">
        <span>${escapeHtml(messages.topicEnabled)}</span>
        <input type="checkbox" data-role="enable-all-topics">
      </label>
      <div role="columnheader">
        <button
          type="button"
          class="text-action-button"
          data-action="edit-topic-keywords"
          data-keyword-target="common"
        >${escapeHtml(messages.topicKeywords)}</button>
      </div>
      <div role="columnheader">
        <button
          type="button"
          class="icon-button"
          data-action="delete-topics"
          title="${escapeHtml(messages.selectTopicToDelete)}"
          aria-label="${escapeHtml(messages.selectTopicToDelete)}"
        >${trashIcon()}</button>
      </div>
      <div role="columnheader">
        <button
          type="button"
          class="icon-button text-icon-button"
          data-action="insert-topic"
          aria-label="+"
        >+</button>
      </div>
    </div>
  `;
}

function renderTopicRuleRow(
  topic: TopicRule,
  index: number | "__index__",
  messages: ReturnType<typeof getMessages>,
): string {
  const keywordRulesJson = escapeHtml(JSON.stringify(topic.keywordRules));

  return `
    <div class="topic-rule-row topic-rule-item" role="row" data-topic-row>
      <label class="checkbox-cell" role="cell">
        <input type="checkbox" data-role="select-topic-row">
      </label>
      <div role="cell">
        <input name="topic_${index}_id" value="${escapeHtml(topic.id)}" data-topic-id-input>
      </div>
      <div role="cell">
        <input name="topic_${index}_note" value="${escapeHtml(topic.note)}" data-topic-note-input>
      </div>
      <label class="checkbox-cell" role="cell">
        <input
          type="checkbox"
          name="topic_${index}_enabled"
          data-role="topic-enabled"
          ${topic.enabled ? "checked" : ""}
        >
      </label>
      <div role="cell">
        <button
          type="button"
          class="text-action-button"
          data-action="edit-topic-keywords"
          data-topic-keywords="${keywordRulesJson}"
          data-keyword-target="${escapeHtml(topic.id)}"
        >${escapeHtml(messages.topicKeywords)}</button>
      </div>
      <div role="cell">
        <button
          type="button"
          class="icon-button"
          data-action="delete-topics"
          aria-label="delete"
        >${trashIcon()}</button>
      </div>
      <div role="cell">
        <button
          type="button"
          class="icon-button text-icon-button"
          data-action="insert-topic"
          aria-label="+"
        >+</button>
      </div>
    </div>
  `;
}

function renderKeywordRuleHeader(messages: ReturnType<typeof getMessages>): string {
  return `
    <div class="keyword-rule-row keyword-rule-head" role="row">
      <label class="checkbox-cell bulk-action-cell" role="columnheader">
        <span>${escapeHtml(messages.batchOperation)}</span>
        <input type="checkbox" data-role="select-all-keywords">
      </label>
      <div role="columnheader">${escapeHtml(messages.keywords)}</div>
      ${renderKeywordLocationHeader(messages.matchTitle, "title")}
      ${renderKeywordLocationHeader(messages.matchBody, "body")}
      ${renderKeywordLocationHeader(messages.matchComments, "comments")}
      ${renderKeywordLocationHeader(messages.matchReplies, "replies")}
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

function renderKeywordLocationHeader(label: string, location: MatchLocation): string {
  return `
      <label class="checkbox-cell location-bulk-cell" role="columnheader">
        <span>${escapeHtml(label)}</span>
        <input type="checkbox" data-role="select-keyword-location" data-location="${location}">
      </label>
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

function findActiveTopic(settings: AppSettings): TopicRule | undefined {
  return settings.topics.find((topic) => topic.id === settings.activeKeywordTarget);
}

function activeKeywordRules(settings: AppSettings): KeywordRule[] {
  const activeTopic = findActiveTopic(settings);
  return activeTopic?.keywordRules ?? settings.commonKeywordRules;
}

function topicSummary(settings: AppSettings, activeTopic: TopicRule | undefined): string {
  const messages = getMessages(settings.locale);

  if (!activeTopic) {
    return messages.commonTopic;
  }

  if (activeTopic.note && activeTopic.id) {
    return `${activeTopic.note}（${activeTopic.id}）`;
  }

  return activeTopic.note || activeTopic.id || messages.commonTopic;
}

function renderKeywordSummary(keywords: string[]): string {
  const visibleKeywords = keywords.slice(0, 5);
  const suffix = keywords.length > visibleKeywords.length ? "..." : "";

  if (visibleKeywords.length === 0) {
    return "";
  }

  return `${
    visibleKeywords.map((keyword) =>
      `<span data-keyword-summary-item>${escapeHtml(keyword)}</span>`
    ).join('<span class="summary-separator">|</span>')
  }${suffix}`;
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
