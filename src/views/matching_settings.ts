/** @file 在帖子设置内渲染匹配、反例和高级配置抽屉，复用统一表单及密钥控件。 */
import { getMessages } from "../locales/index.ts";
import type { AppSettings } from "../models.ts";
import { normalizeMatchingSettings } from "../services/matching_settings.ts";
import { matchingRuntimeForDay } from "../services/matching_engine.ts";
import type { MatchingRuntime } from "../storage/matching_types.ts";
import {
  aiProviders,
  supportsThinkingToggle,
} from "../services/ai_providers.ts";
import { escapeHtml as e } from "./html.ts";
import { renderProfileList } from "./matching_profiles.ts";
import { renderDrawerHeading } from "./settings_drawer.ts";
import { renderRuleTableHeader } from "./settings_topic_rules.ts";
import { pageSizeValues } from "./match_table.ts";
import {
  renderMatchDetails,
  renderPostCells,
  renderPostHeadings,
  renderRelativeTimeScript,
} from "./match_table_view.ts";
import {
  materialSymbolIcon,
  type MaterialSymbolName,
  trashIcon,
} from "./icons.ts";

/**
 * 渲染与话题、关键词一致的可折叠设置项。
 * @param {string} name 抽屉标识。
 * @param {string} label 标题。
 * @param {string} body 设置内容。
 * @param {string} summary 收起时的摘要。
 * @param {string} attributes 条件显示属性。
 * @param {string | undefined} blackForestSlot 无需修改配置即可访问的彩蛋槽位。
 * @param {string} alternative 配置列表。
 * @param {string} action 标题右侧按钮。
 * @return {string} 抽屉 HTML。
 */
function drawer(
  name: string,
  label: string,
  body: string,
  summary = "",
  attributes = "",
  blackForestSlot?: string,
  alternative = "",
  action = "",
): string {
  return `<div class="dropdown-settings-row matching-conditional-row" data-${name}-editor ${attributes}>
    ${
    renderDrawerHeading(
      `${name}s`,
      `${name}-panel`,
      label,
      "sort",
      action ? "" : `<span data-${name}-summary>${e(summary)}</span>`,
      blackForestSlot,
      action,
    )
  }
    <dd class="dropdown-panel" id="${name}-panel" data-${name}-panel hidden><div class="dropdown-panel-inner"><dl class="settings-list matching-settings-list">${body}</dl>${alternative}</div></dd>
  </div>`;
}

/**
 * 渲染无附加说明的标准表单行。
 * @param {string} label 标签。
 * @param {string} control 控件。
 * @param {string} attributes 条件属性。
 * @param {MaterialSymbolName} icon 图标。
 * @param {string | undefined} blackForestSlot 无需修改配置即可访问的彩蛋槽位。
 * @return {string} 设置行 HTML。
 */
function row(
  label: string,
  control: string,
  attributes = "",
  icon: MaterialSymbolName = "numbers",
  blackForestSlot?: string,
): string {
  return `<div class="matching-conditional-row" ${attributes}><dt class="settings-label-with-icon">${
    materialSymbolIcon(icon, "settings-label-icon", blackForestSlot)
  }<span>${e(label)}</span></dt><dd>${control}</dd></div>`;
}

/**
 * 渲染带搜索入口的分段选择器，提交值独立于搜索词。
 * @param {string} name 表单字段名。
 * @param {string} label 可访问标签。
 * @param {string} value 当前值。
 * @param {string} display 当前显示名称。
 * @param {string} search 搜索占位词。
 * @param {string} choices 初始选项 HTML。
 * @return {string} 选择器 HTML。
 */
function picker(
  name: string,
  label: string,
  value: string,
  display: string,
  search: string,
  choices: string,
): string {
  return `<div class="matching-picker" data-matching-picker="${name}">
    <input type="hidden" name="${name}" value="${e(value)}">
    <button type="button" class="matching-picker-toggle" data-picker-toggle aria-label="${
    e(label)
  }" aria-haspopup="listbox" aria-expanded="false" aria-controls="${name}-options"><span data-picker-label>${
    e(display || label)
  }</span><span class="dropdown-chevron" aria-hidden="true"></span></button>
    <div class="matching-picker-menu" data-picker-menu hidden>
      <input type="search" data-picker-search role="combobox" aria-label="${
    e(search)
  }" placeholder="${
    e(search)
  }" aria-expanded="false" aria-autocomplete="list" aria-controls="${name}-options" autocomplete="off">
      <div class="matching-picker-options" id="${name}-options" role="listbox" aria-label="${
    e(label)
  }">${choices}</div>
    </div>
  </div>`;
}

/**
 * 渲染匹配模式、公司与模型选择，以及 AI 基本配置。
 * @param {AppSettings} app 应用设置。
 * @param {string} secretEditor 不包含明文密钥的编辑器 HTML。
 * @param {MatchingRuntime} saved 各配置用量。
 * @return {string} 匹配设置抽屉。
 */
export function renderMatchingSection(
  app: AppSettings,
  secretEditor: string,
  saved?: MatchingRuntime,
): string {
  const m = getMessages(app.locale);
  const s = normalizeMatchingSettings(app.matching);
  const ai = `data-matching-ai-field ${s.mode === "rules" ? "hidden" : ""}`;
  const modes = {
    rules: m.matchingRules,
    ai: m.matchingAi,
    hybrid: m.matchingHybrid,
  };
  const providers = aiProviders.map((p) =>
    `<button type="button" role="option" data-value="${p.id}" aria-selected="${
      s.provider === p.id
    }">${e(p.name || m.matchingCustom)}</button>`
  ).join("");
  const providerName = aiProviders.find((p) => p.id === s.provider)?.name ||
    m.matchingCustom;
  const model = s.model
    ? `<button type="button" role="option" data-value="${
      e(s.model)
    }" data-thinking="${
      supportsThinkingToggle(s.model)
    }" aria-selected="true">${e(s.model)}</button>`
    : "";
  const body = row(
    m.matchingMode,
    `<div class="notification-provider-row"><select name="matchingMode" data-matching-mode aria-label="${
      e(m.matchingMode)
    }">${
      Object.entries(modes).map(([value, label]) =>
        `<option value="${value}" ${value === s.mode ? "selected" : ""}>${
          e(label)
        }</option>`
      ).join("")
    }</select><span class="matching-test-action matching-conditional-row" data-matching-test-action ${
      s.mode === "rules" ? "hidden" : ""
    }><button type="button" class="settings-row-action-button settings-icon-action-button" data-test-ai-button aria-label="${
      e(m.matchingTestConnection)
    }" data-tooltip="${e(m.matchingTestConnection)}" data-testing="${
      e(m.matchingTesting)
    }" data-connected="${e(m.matchingConnected)}" data-failed="${
      e(m.matchingConnectionFailed)
    }" data-limit="${e(m.matchingConnectionLimit)}" data-busy="${
      e(m.matchingConnectionBusy)
    }">${
      materialSymbolIcon("link", "settings-row-action-icon")
    }</button></span><span class="inline-action-status" data-test-ai-status role="status" hidden></span></div>`,
    "",
    "sort",
    "settings.matching.mode",
  ) +
    row(
      m.matchingModel,
      `<div class="matching-model-control">${
        picker(
          "matchingProvider",
          m.matchingCompany,
          s.provider,
          providerName,
          m.matchingSearchCompany,
          providers,
        )
      }${
        picker(
          "matchingModel",
          m.matchingModel,
          s.model,
          s.model,
          m.matchingSearchModel,
          model,
        )
      }</div><span data-model-status role="status" hidden></span>`,
      ai,
      "api",
    ) +
    row(
      m.matchingApiUrl,
      `<input type="url" name="matchingApiUrl" aria-label="${
        e(m.matchingApiUrl)
      }" dir="ltr" maxlength="2048" value="${
        e(s.apiUrl)
      }" placeholder="https://api.example.com/v1">`,
      `data-matching-url ${
        s.mode === "rules" || s.provider !== "custom" ? "hidden" : ""
      }`,
      "link",
    ) +
    row(m.matchingApiKey, secretEditor, ai, "key") +
    row(
      m.matchingPrompt,
      `<textarea class="matching-prompt" name="matchingPrompt" aria-label="${
        e(m.matchingPrompt)
      }" maxlength="6000" rows="5">${e(s.prompt)}</textarea>`,
      ai,
      "edit",
    ) +
    row(
      m.matchingComments,
      `<label class="switch-control"><input type="checkbox" name="matchingIncludeComments" aria-label="${
        e(m.matchingComments)
      }" ${s.includeComments ? "checked" : ""}></label>`,
      ai,
      "topic",
    ) +
    row(
      m.matchingThinking,
      `<label class="switch-control"><input type="checkbox" name="matchingEnableThinking" aria-label="${
        e(m.matchingThinking)
      }" ${!s.disableThinking ? "checked" : ""}></label>`,
      `data-matching-thinking ${
        s.mode === "rules" || !supportsThinkingToggle(s.model) ? "hidden" : ""
      }`,
      "toggle_on",
    );
  return drawer(
    "matching",
    m.matchingTitle,
    body + renderCounterexamples(app) + renderMatchingAdvanced(app, saved),
    "",
    `data-model-loading="${e(m.matchingLoading)}" data-model-empty="${
      e(m.matchingNoModels)
    }" data-model-error="${e(m.matchingModelsError)}" data-model-credentials="${
      e(m.matchingModelCredentials)
    }" data-model-placeholder="${e(m.matchingModel)}"`,
    "settings.post.matching",
    renderProfileList(app, saved),
    `<button type="button" class="profile-summary text-action-button" data-profile-toggle aria-controls="matching-panel" aria-expanded="false">${
      e(m.profileDefault)
    }</button>`,
  );
}

/**
 * 渲染反例列表、历史选帖表格及提示词预览。
 * @param {AppSettings} app 当前账号设置。
 * @return {string} 当前匹配配置的反例抽屉。
 */
function renderCounterexamples(app: AppSettings): string {
  const m = getMessages(app.locale);
  const settings = normalizeMatchingSettings(app.matching);
  const labels = {
    title: m.matchTitle,
    body: m.matchBody,
    comments: m.matchComments,
    replies: m.matchReplies,
    excerpt: m.matchExcerpt,
    unknown: m.matchUnknown,
    ai: m.matchDetailAi,
    keyword: m.matchDetailKeyword,
    empty: m.emptyHistory,
    error: m.exampleHistoryError,
  };
  const add =
    `<button type="button" class="icon-button text-icon-button" data-example-picker aria-expanded="false" aria-controls="example-history" aria-label="${
      e(m.exampleFromHistory)
    }" data-tooltip="${e(m.exampleFromHistory)}">+</button>`;
  const remove =
    `<button type="button" class="icon-button" data-example-delete aria-label="${
      e(m.accountPasskeyDelete)
    }" data-tooltip="${e(m.accountPasskeyDelete)}">${trashIcon()}</button>`;
  const cells = renderPostCells(undefined, app.locale, m);
  const box =
    `<td><label class="checkbox-cell"><input type="checkbox" data-row-check></label></td>`;
  return drawer(
    "counterexample",
    m.matchingExamples,
    `<div class="example-content" data-example-labels="${
      e(JSON.stringify(labels))
    }">
      <div class="example-table-scroll"><div class="example-table" role="table" aria-label="${e(m.matchingExamples)}">
        ${renderRuleTableHeader(
          "example-rule-row",
          "data-example-select-all",
          m.selectAllRows,
          [m.postTitle, m.postContent, m.matchDetails, m.exampleReason].map((label) =>
            `<div role="columnheader">${e(label)}</div>`
          ).join("") + `<div role="columnheader">${remove}</div><div role="columnheader">${add}</div>`,
        )}
        <div role="rowgroup" data-example-rows></div></div></div>
      <template data-example-row><div class="topic-rule-row example-rule-row" role="row">
        <label role="cell"><input type="checkbox" data-row-check></label>
        <div role="cell"><a data-example-title target="_blank" rel="noopener noreferrer"></a></div>
        <div role="cell" class="example-post-content"><span data-example-body></span><small data-example-unavailable hidden>${e(m.examplePostUnavailable)}</small></div>
        <div role="cell">${renderMatchDetails(undefined, new Date(), app.locale, m)}</div>
        <div role="cell"><textarea class="matching-prompt" rows="2" maxlength="1000" data-example-reason aria-label="${e(m.exampleReason)}"></textarea></div>
        <div role="cell">${remove}</div><div role="cell">${add}</div></div></template>
      <section id="example-history" class="example-history" aria-label="${
      e(m.historyTitle)
    }" hidden>
        <div class="section-title-row"><h3>${
      e(m.historyTitle)
    }</h3><button type="button" data-example-add disabled>${
      e(m.exampleAdd)
    }</button></div>
        <div class="example-filters"><input type="search" data-example-search placeholder="${
      e(m.exampleSearch)
    }" aria-label="${e(m.exampleSearch)}">
          <label><input type="checkbox" data-example-all> ${
      e(m.exampleAllTopics)
    }</label></div>
        <span data-example-status role="status"></span>
        <div class="example-table-scroll"><table class="match-table example-history-table" aria-label="${
      e(m.historyTitle)
    }">
          <colgroup><col class="match-table-col-2"><col class="match-table-col-3"><col class="match-table-col-14"><col class="match-table-col-5"></colgroup>
          <thead><tr><th scope="col"><label class="checkbox-cell bulk-action-cell rule-bulk-toggle"><input type="checkbox" data-history-pick-all aria-label="${e(m.selectAllRows)}"><span>${materialSymbolIcon("done_all", "rule-drag-icon")}</span></label></th>${
      renderPostHeadings(m)
    }</tr></thead>
          <tbody data-example-results></tbody></table></div>
        <div class="pagination-row" data-example-pagination hidden><div class="pagination" data-example-pages></div>
          <label>${e(m.pageSize)} <select data-example-page-size>${
      pageSizeValues().map((n) =>
        `<option value="${n}">${
          n === "all"
            ? e(m.filterAll)
            : new Intl.NumberFormat(app.locale).format(n)
        }</option>`
      ).join("")
    }</select></label></div>
        <template data-history-pick-row><tr>${box}${cells}</tr></template>
      </section>
      <details data-example-preview><summary>${
      e(m.examplePreview)
    }</summary><pre dir="ltr"></pre></details>
      ${renderRelativeTimeScript()}
    </div>`,
    new Intl.NumberFormat(app.locale).format(settings.counterexamples.length),
    settings.mode === "rules" ? "hidden" : "",
  );
}

/**
 * 渲染仅用于 AI 模式的高级限制和价格设置。
 * @param {AppSettings} app 应用设置。
 * @param {MatchingRuntime | undefined} saved 已存的调用统计。
 * @return {string} 高级配置抽屉。
 */
export function renderMatchingAdvanced(
  app: AppSettings,
  saved?: MatchingRuntime,
): string {
  const m = getMessages(app.locale);
  const s = normalizeMatchingSettings(app.matching);
  const runtime = matchingRuntimeForDay(saved, Date.now());
  const estimate =
    s.inputPrice > 0 && s.outputPrice > 0 && runtime.unknownUsage === 0
      ? `¥${
        ((runtime.inputTokens * s.inputPrice +
          runtime.outputTokens * s.outputPrice) / 1000000).toFixed(4)
      }`
      : "—";
  const fields: [string, string, number, number, number, string?][] = [
    ["matchingDailyLimit", m.matchingDailyLimit, s.dailyLimit, 1, 10000],
    ["matchingMaxInputChars", m.matchingInputLimit, s.maxInputChars, 200, 8000],
    [
      "matchingMaxOutputTokens",
      m.matchingOutputLimit,
      s.maxOutputTokens,
      64,
      1024,
    ],
    [
      "matchingCacheMaxEntries",
      m.matchingCacheLimit,
      s.cacheMaxEntries,
      100,
      50000,
    ],
    [
      "matchingInputPrice",
      m.matchingInputPrice,
      s.inputPrice,
      0,
      100000,
      "any",
    ],
    [
      "matchingOutputPrice",
      m.matchingOutputPrice,
      s.outputPrice,
      0,
      100000,
      "any",
    ],
  ];
  return drawer(
    "advanced",
    m.matchingAdvanced,
    fields.map(([name, label, value, min, max, step]) =>
      row(
        label,
        `<input type="number" name="${name}" aria-label="${
          e(label)
        }" min="${min}" max="${max}" step="${step || "1"}" value="${value}">`,
      )
    ).join("") +
      row(
        m.matchingUsage,
        `<span data-profile-usage data-calls="${
          e(m.matchingCalls)
        }" data-cost="${e(m.matchingCost)}">${
          e(m.matchingCalls)
        }: ${runtime.calls} / ${s.dailyLimit} · ${
          e(m.matchingCost)
        }: ${estimate}</span>`,
        "",
        "token",
      ),
    "",
    s.mode === "rules" ? "hidden" : "",
  );
}
