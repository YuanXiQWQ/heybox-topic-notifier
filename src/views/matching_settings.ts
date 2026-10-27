/** @file 在帖子设置内渲染匹配和高级配置抽屉，复用统一表单及密钥控件。 */
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
import { materialSymbolIcon, type MaterialSymbolName } from "./icons.ts";

/**
 * 渲染与话题、关键词一致的可折叠设置项。
 * @param {string} name 抽屉标识。
 * @param {string} label 标题。
 * @param {string} body 设置内容。
 * @param {string} summary 收起时的摘要。
 * @param {string} attributes 条件显示属性。
 * @return {string} 抽屉 HTML。
 */
function drawer(
  name: string,
  label: string,
  body: string,
  summary = "",
  attributes = "",
): string {
  return `<div class="dropdown-settings-row matching-conditional-row" data-${name}-editor ${attributes}>
    <dt class="settings-label-with-icon">${
    materialSymbolIcon("sort", "settings-label-icon")
  }<span>${e(label)}</span></dt>
    <dd class="dropdown-summary-cell"><span data-${name}-summary>${
    e(summary)
  }</span><button type="button" class="dropdown-toggle" data-action="toggle-${name}s" aria-expanded="false" aria-controls="${name}-panel" aria-label="${
    e(label)
  }"><span class="dropdown-chevron" aria-hidden="true"></span></button></dd>
    <dd class="dropdown-panel" id="${name}-panel" data-${name}-panel hidden><div class="dropdown-panel-inner"><dl class="settings-list matching-settings-list">${body}</dl></div></dd>
  </div>`;
}

/**
 * 渲染无附加说明的标准表单行。
 * @param {string} label 标签。
 * @param {string} control 控件。
 * @param {string} attributes 条件属性。
 * @param {MaterialSymbolName} icon 图标。
 * @return {string} 设置行 HTML。
 */
function row(
  label: string,
  control: string,
  attributes = "",
  icon: MaterialSymbolName = "numbers",
): string {
  return `<div class="matching-conditional-row" ${attributes}><dt class="settings-label-with-icon">${
    materialSymbolIcon(icon, "settings-label-icon")
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
 * @return {string} 匹配设置抽屉。
 */
export function renderMatchingSection(
  app: AppSettings,
  secretEditor: string,
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
    body,
    modes[s.mode],
    `data-model-loading="${e(m.matchingLoading)}" data-model-empty="${
      e(m.matchingNoModels)
    }" data-model-error="${e(m.matchingModelsError)}" data-model-credentials="${
      e(m.matchingModelCredentials)
    }" data-model-placeholder="${e(m.matchingModel)}"`,
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
        `<span>${e(m.matchingCalls)}: ${runtime.calls} / ${s.dailyLimit} · ${
          e(m.matchingCost)
        }: ${estimate}</span>`,
        "",
        "token",
      ),
    "",
    s.mode === "rules" ? "hidden" : "",
  );
}
