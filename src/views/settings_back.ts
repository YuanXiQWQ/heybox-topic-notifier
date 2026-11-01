/** @file 渲染设置子页共用的淡色图形返回入口。 */
import { escapeHtml } from "./html.ts";

/**
 * 使用内联轮廓箭头返回设置，保留可访问名称而不显示文字。
 * @param {string} label 设置页的本地化名称。
 * @return {string} 返回链接 HTML。
 */
export function renderSettingsBack(label: string): string {
  return `<a class="settings-back" href="/settings" data-settings-back aria-label="${
    escapeHtml(label)
  }" title="${
    escapeHtml(label)
  }"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m7-7-7 7 7 7"/></svg></a>`;
}
