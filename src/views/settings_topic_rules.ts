/** @file 设置页的话题与关键词规则编辑表单。 */
import { getMessages } from "../locales/index.ts";
import { normalizeMatchingSettings } from "../services/matching_settings.ts";
import { renderDrawerHeading } from "./settings_drawer.ts";
import type {
  AppSettings,
  KeywordRule,
  MatchLocation,
  TopicRule,
} from "../models.ts";
import { escapeHtml } from "./html.ts";
import { materialSymbolIcon, trashIcon } from "./icons.ts";

/**
 * 设置页可配置的关键词匹配位置列表。
 */
const matchLocations: MatchLocation[] = [
  "title",
  "body",
  "comments",
  "replies",
];

/**
 * 渲染带整行标题按钮的话题设置区域。
 *
 * @param {AppSettings} settings 应用设置。
 * @return {string} 话题设置区域 HTML。
 */
export function renderTopicSection(settings: AppSettings): string {
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
      ${
    renderDrawerHeading(
      "topics",
      "topic-rules-panel",
      messages.topic,
      "topic",
      `<span data-topic-summary data-common-label="${
        escapeHtml(messages.commonTopic)
      }">${escapeHtml(summary)}</span>`,
      "settings.post.topic",
    )
  }
      <dd class="dropdown-panel topic-rules-panel" id="topic-rules-panel" data-topic-panel hidden>
        <div class="dropdown-panel-inner">
        <input type="hidden" name="activeKeywordTarget" value="${
    escapeHtml(settings.activeKeywordTarget)
  }" data-active-keyword-target>
        <input
          type="hidden"
          name="commonKeywordRulesJson"
          value="${escapeHtml(JSON.stringify(settings.commonKeywordRules))}"
          data-common-keyword-rules
        >
          <div class="topic-rule-grid" role="table">
            ${renderTopicRuleHeader(messages)}
            ${
    topics.map((topic, index) => renderTopicRuleRow(topic, index, messages))
      .join("")
  }
          </div>
        </div>
      </dd>
      <template data-topic-row-template>
        ${
    renderTopicRuleRow(
      { enabled: true, id: "", keywordRules: [], note: "" },
      "__index__",
      messages,
    )
  }
      </template>
    </div>
  `;
}

/**
 * 渲染带整行标题按钮的关键词设置区域。
 *
 * @param {AppSettings} settings 应用设置。
 * @return {string} 关键词设置区域 HTML，纯 AI 模式初始隐藏。
 */
export function renderKeywordSection(settings: AppSettings): string {
  const messages = getMessages(settings.locale);
  const rows = activeKeywordRules(settings);
  const summaryKeywords = rows.map((rule) => rule.keyword).filter(Boolean);

  return `
    <div
      class="dropdown-settings-row keyword-settings-row matching-conditional-row"
      ${
    normalizeMatchingSettings(settings.matching).mode === "ai" ? "hidden" : ""
  }
      data-keyword-editor
      data-delete-message="${escapeHtml(messages.selectKeywordToDelete)}"
    >
      ${
    renderDrawerHeading(
      "keywords",
      "keyword-rules-panel",
      messages.keywords,
      "sell",
      `<span class="keyword-summary" data-keyword-summary>${
        renderKeywordSummary(summaryKeywords)
      }</span>`,
    )
  }
      <dd class="dropdown-panel keyword-rules-panel" id="keyword-rules-panel" data-keyword-panel hidden>
        <div class="dropdown-panel-inner">
          <div class="keyword-rule-grid" role="table">
            ${renderKeywordRuleHeader(messages)}
            ${
    (rows.length > 0 ? rows : [{ keyword: "", locations: matchLocations }])
      .map((rule, index) => renderKeywordRuleRow(rule, index, messages)).join(
        "",
      )
  }
          </div>
        </div>
      </dd>
      <template data-keyword-row-template>
        ${
    renderKeywordRuleRow(
      { keyword: "", locations: matchLocations },
      "__index__",
      messages,
    )
  }
      </template>
    </div>
  `;
}

/**
 * 渲染话题规则表头。
 *
 * @param messages 当前语言文案。
 * @return 话题规则表头 HTML。
 */
function renderTopicRuleHeader(
  messages: ReturnType<typeof getMessages>,
): string {
  return `
    <div class="topic-rule-row topic-rule-head" role="row">
      <div class="rule-drag-header" role="columnheader" aria-hidden="true"></div>
      <label class="checkbox-cell bulk-action-cell" role="columnheader">
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
          data-tooltip="${escapeHtml(messages.selectTopicToDelete)}"
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

/**
 * 渲染单条话题规则行。
 *
 * @param topic 话题规则。
 * @param index 话题行索引。
 * @param messages 当前语言文案。
 * @return 话题规则行 HTML。
 */
function renderTopicRuleRow(
  topic: TopicRule,
  index: number | "__index__",
  messages: ReturnType<typeof getMessages>,
): string {
  const keywordRulesJson = escapeHtml(JSON.stringify(topic.keywordRules));

  return `
    <div class="topic-rule-row topic-rule-item" role="row" data-topic-row>
      <input
        type="hidden"
        name="topic_${index}_keywordRulesJson"
        value="${keywordRulesJson}"
        data-topic-keyword-rules
      >
      <div class="rule-drag-cell" role="cell">
        ${dragHandleButton(messages.dragRow)}
      </div>
      <label class="checkbox-cell" role="cell">
        <input type="checkbox" data-role="select-topic-row">
      </label>
      <div role="cell">
        <input name="topic_${index}_id" dir="ltr" value="${
    escapeHtml(topic.id)
  }" data-topic-id-input>
      </div>
      <div role="cell">
        <input name="topic_${index}_note" value="${
    escapeHtml(topic.note)
  }" data-topic-note-input>
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

/**
 * 渲染关键词规则表头。
 *
 * @param messages 当前语言文案。
 * @return 关键词规则表头 HTML。
 */
function renderKeywordRuleHeader(
  messages: ReturnType<typeof getMessages>,
): string {
  return `
    <div class="keyword-rule-row keyword-rule-head" role="row">
      <div class="rule-drag-header" role="columnheader" aria-hidden="true"></div>
      <label class="checkbox-cell bulk-action-cell" role="columnheader">
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
          data-tooltip="${escapeHtml(messages.selectKeywordToDelete)}"
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

/**
 * 渲染规则行拖拽手柄按钮。
 *
 * @param label 拖拽按钮的可访问标签。
 * @return 拖拽手柄按钮 HTML。
 */
function dragHandleButton(label: string): string {
  const escapedLabel = escapeHtml(label);

  return `<button
    type="button"
    class="icon-button rule-drag-handle"
    data-rule-drag-handle
    data-tooltip="${escapedLabel}"
    aria-label="${escapedLabel}"
  >${materialSymbolIcon("drag_indicator", "rule-drag-icon")}</button>`;
}

/**
 * 渲染关键词匹配位置表头。
 *
 * @param label 位置展示文案。
 * @param location 匹配位置。
 * @return 匹配位置表头 HTML。
 */
function renderKeywordLocationHeader(
  label: string,
  location: MatchLocation,
): string {
  return `
      <label class="checkbox-cell location-bulk-cell" role="columnheader">
        <span>${escapeHtml(label)}</span>
        <input type="checkbox" data-role="select-keyword-location" data-location="${location}">
      </label>
  `;
}

/**
 * 渲染单条关键词规则行。
 *
 * @param rule 关键词规则。
 * @param index 关键词行索引。
 * @param messages 当前语言文案。
 * @return 关键词规则行 HTML。
 */
function renderKeywordRuleRow(
  rule: {
    caseSensitive?: boolean;
    keyword: string;
    locations: MatchLocation[];
    useRegex?: boolean;
  },
  index: number | "__index__",
  messages: ReturnType<typeof getMessages>,
): string {
  const caseSensitiveLabel = escapeHtml(messages.keywordCaseSensitive);
  const regexLabel = escapeHtml(messages.keywordRegex);

  return `
    <div class="keyword-rule-row keyword-rule-item" role="row" data-keyword-row>
      <div class="rule-drag-cell" role="cell">
        ${dragHandleButton(messages.dragRow)}
      </div>
      <label class="checkbox-cell" role="cell">
        <input type="checkbox" data-role="select-keyword-row">
      </label>
      <div role="cell">
        <div class="keyword-input-shell">
          <input name="keyword_${index}" value="${escapeHtml(rule.keyword)}">
          <input
            type="hidden"
            name="keyword_${index}_caseSensitive"
            value="${rule.caseSensitive ? "on" : ""}"
            data-keyword-option="caseSensitive"
          >
          <input
            type="hidden"
            name="keyword_${index}_useRegex"
            value="${rule.useRegex ? "on" : ""}"
            data-keyword-option="useRegex"
          >
          <button
            type="button"
            class="keyword-option-button"
            data-action="toggle-keyword-option"
            data-option="caseSensitive"
            aria-label="${caseSensitiveLabel}"
            aria-pressed="${rule.caseSensitive ? "true" : "false"}"
            data-tooltip="${caseSensitiveLabel}"
          >Cc</button>
          <button
            type="button"
            class="keyword-option-button"
            data-action="toggle-keyword-option"
            data-option="useRegex"
            aria-label="${regexLabel}"
            aria-pressed="${rule.useRegex ? "true" : "false"}"
            data-tooltip="${regexLabel}"
          >.*</button>
        </div>
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

/**
 * 查找当前正在编辑关键词的话题。
 *
 * @param settings 应用设置。
 * @return 活动话题，不存在时返回 undefined。
 */
function findActiveTopic(settings: AppSettings): TopicRule | undefined {
  return settings.topics.find((topic) =>
    topic.id === settings.activeKeywordTarget
  );
}

/**
 * 获取当前活动目标的关键词规则。
 *
 * @param settings 应用设置。
 * @return 当前活动关键词规则列表。
 */
function activeKeywordRules(settings: AppSettings): KeywordRule[] {
  const activeTopic = findActiveTopic(settings);
  return activeTopic?.keywordRules ?? settings.commonKeywordRules;
}

/**
 * 生成话题设置摘要。
 *
 * @param settings 应用设置。
 * @param activeTopic 当前活动话题。
 * @return 话题摘要文本。
 */
function topicSummary(
  settings: AppSettings,
  activeTopic: TopicRule | undefined,
): string {
  const messages = getMessages(settings.locale);

  if (!activeTopic) {
    return messages.commonTopic;
  }

  if (activeTopic.note && activeTopic.id) {
    return `${activeTopic.note}（${activeTopic.id}）`;
  }

  return activeTopic.note || activeTopic.id || messages.commonTopic;
}

/**
 * 渲染关键词摘要。
 *
 * @param keywords 关键词列表。
 * @return 关键词摘要 HTML。
 */
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
