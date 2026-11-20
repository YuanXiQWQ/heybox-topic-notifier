/** @file 渲染匹配配置列表与表单初始值，账号密钥仅以已配置标记下发。 */
import { getMessages } from "../locales/index.ts";
import type { AppSettings } from "../models.ts";
import {
  matchingForProfile,
  matchingProfiles,
} from "../services/matching_profiles.ts";
import { supportsThinkingToggle } from "../services/ai_providers.ts";
import { defaultMatchingSettings } from "../services/matching_settings.ts";
import {
  matchingRuntimeForDay,
  usageForProfile,
} from "../services/matching_engine.ts";
import type { MatchingRuntime } from "../storage/matching_types.ts";
import { escapeHtml as e } from "./html.ts";
import { copyIcon, materialSymbolIcon, trashIcon } from "./icons.ts";

/**
 * 渲染可拖拽配置列表、可复用行模板及当前配置用量。
 * @param {AppSettings} app 当前设置。
 * @param {MatchingRuntime} saved 本日运行快照。
 * @return {string} 列表视图。
 */
export function renderProfileList(
  app: AppSettings,
  saved?: MatchingRuntime,
): string {
  const m = getMessages(app.locale);
  const runtime = matchingRuntimeForDay(saved, Date.now());
  const usage: Record<string, unknown> = {};
  const profiles = matchingProfiles(app).map(({ id, name }) => {
    const { apiKey, ...options } = matchingForProfile(app, id);
    const { calls, inputTokens, outputTokens, unknownUsage } = usageForProfile(
      runtime,
      id,
    );
    usage[id] = { calls, inputTokens, outputTokens, unknownUsage };
    return {
      id,
      name,
      options,
      configured: Boolean(apiKey),
      thinking: supportsThinkingToggle(options.model),
    };
  });
  /**
   * 生成沿用话题表尺寸的图标按钮。
   * @param {string} action 操作名称。
   * @param {string} label 可访问名称。
   * @param {string} icon 图标内容。
   * @return {string} 操作按钮。
   */
  function button(action: string, label: string, icon: string): string {
    const classes = action === "add"
      ? "icon-button text-icon-button"
      : "icon-button";
    return `<button type="button" class="${classes}" data-profile-action="${action}" aria-label="${
      e(label)
    }" data-tooltip="${e(label)}">${icon}</button>`;
  }
  const actions = [
    button("edit", m.accountEdit, materialSymbolIcon("edit")),
    button("copy", m.profileCopy, copyIcon()),
    button("delete", m.accountPasskeyDelete, trashIcon()),
    button("add", m.profileAdd, "+"),
  ];
  return `<div data-profile-list hidden data-default-label="${
    e(m.profileDefault)
  }" data-copy-suffix="${e(m.profileCopySuffix)}" data-new-label="${e(m.profileNew)}" data-topic-label="${
    e(m.profileTopics)
  }" data-apply-label="${e(m.profileApplied)}" data-remove-label="${
    e(m.accountPasskeyDelete)
  }" data-usage="${e(JSON.stringify(usage))}" data-default-options="${
    e(JSON.stringify(defaultMatchingSettings))
  }">
    <input type="hidden" name="matchingProfiles" value="${
    e(JSON.stringify(profiles))
  }">
    <div role="table" data-profile-grid>
      <div class="topic-rule-row profile-head rule-grid-head profile-row" role="row">
        <div role="columnheader">${
    materialSymbolIcon("height", "rule-drag-icon")
  }</div><label class="rule-bulk-toggle" role="columnheader"><input type="checkbox" data-profile-all aria-label="${
    e(m.selectAllRows)
  }"><span>${materialSymbolIcon("done_all", "rule-drag-icon")}</span></label>
        <div role="columnheader">${
    e(m.profileName)
  }</div><div role="columnheader">${e(m.profileTopics)}</div>
        ${actions.map((a) => `<div role="columnheader">${a}</div>`).join("")}
      </div>
    </div>
    <template data-profile-template><div class="topic-rule-row profile-row" role="row" data-profile-row>
      <div class="rule-drag-cell" role="cell"><button type="button" class="icon-button rule-drag-handle" data-rule-drag-handle aria-label="${
    e(m.dragRow)
  }">${materialSymbolIcon("drag_indicator", "rule-drag-icon")}</button></div>
      <label role="cell"><input type="checkbox" data-profile-selected aria-label="${
    e(m.profileName)
  }"></label>
      <div role="cell"><input type="text" maxlength="100" data-profile-name aria-label="${
    e(m.profileName)
  }"></div>
      <div role="cell" class="profile-chips" data-profile-topics></div>
      ${actions.map((a) => `<div role="cell">${a}</div>`).join("")}
    </div></template></div>`;
}
