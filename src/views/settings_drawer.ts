/** @file 渲染设置抽屉共用的整行标题按钮。 */
import { escapeHtml } from "./html.ts";
import { materialSymbolIcon, type MaterialSymbolName } from "./icons.ts";

/**
 * 将标签、摘要和箭头放入同一按钮，使点击、悬浮和键盘焦点覆盖完整标题行。
 * @param {string} name 抽屉操作名称。
 * @param {string} panelId 受控面板标识。
 * @param {string} label 标题。
 * @param {MaterialSymbolName} icon 标签图标。
 * @param {string} summaryHtml 已转义的摘要 HTML。
 * @param {string} blackForestSlot 可选的彩蛋图标槽位。
 * @return {string} 抽屉标题 HTML。
 */
export function renderDrawerHeading(
  name: string,
  panelId: string,
  label: string,
  icon: MaterialSymbolName,
  summaryHtml: string,
  blackForestSlot?: string,
): string {
  return `<dt class="dropdown-heading"><button type="button" class="dropdown-toggle" data-action="toggle-${name}" aria-expanded="false" aria-controls="${panelId}" aria-label="${escapeHtml(label)}">
    <span class="settings-label-with-icon">${materialSymbolIcon(icon, "settings-label-icon", blackForestSlot)}<span>${escapeHtml(label)}</span></span>
    <span class="dropdown-summary-cell">${summaryHtml}<span class="dropdown-indicator" aria-hidden="true"><span class="dropdown-chevron"></span></span></span>
  </button></dt>`;
}
