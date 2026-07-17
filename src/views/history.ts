/**
 * @file 本文件负责渲染命中历史页面。
 */
import { getMessages } from "../locales/index.ts";
import type { AppSettings } from "../models.ts";
import { escapeHtml, renderLayout } from "./html.ts";
import type { MatchTableResult } from "./match_table.ts";
import { renderMatchRecordsSection } from "./match_table_view.ts";

/**
 * 渲染历史页面。
 *
 * @param options 历史页面渲染选项。
 * @return 完整历史页面 HTML。
 */
export function renderHistory(options: {
  historyTable: MatchTableResult;
  settings: AppSettings;
}): string {
  const messages = getMessages(options.settings.locale);

  const body = `
    <section class="page-heading">
      <div>
        <h1>${escapeHtml(messages.historyTitle)}</h1>
        <p>${escapeHtml(messages.appDescription)}</p>
      </div>
    </section>
    ${renderHistoryTable(options.historyTable, messages, options.settings.locale)}
  `;

  return renderLayout({
    body,
    darkMode: options.settings.darkMode,
    locale: options.settings.locale,
    themeColor: options.settings.themeColor,
    title: messages.appName,
  });
}

/**
 * 渲染历史命中表格。
 *
 * @param table 历史表格数据。
 * @param messages 当前语言文案。
 * @param locale 当前语言标识。
 * @return 历史表格 HTML。
 */
function renderHistoryTable(
  table: MatchTableResult,
  messages: ReturnType<typeof getMessages>,
  locale: AppSettings["locale"],
): string {
  return renderMatchRecordsSection({
    action: {
      bulkButtonAttribute: "data-history-bulk-delete",
      emptySelectionMessage: messages.selectMatchToDelete,
      icon: trashIcon(),
      label: messages.deleteMatch,
      rowCheckboxAttribute: "data-history-match-checkbox",
      selectAllAttribute: "data-history-select-all",
    },
    emptyMessage: messages.emptyHistory,
    filterToggleId: "history-table-filter-toggle",
    formAction: "/matches/delete",
    heading: messages.historyTitle,
    headingId: "history-table-heading",
    locale,
    messages,
    path: "/history",
    table,
    titleLinkClass: "pending-title-link",
  });
}

/**
 * 渲染删除图标。
 *
 * @return 删除图标 SVG。
 */
function trashIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z"></path>
    <path d="M6 9h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z"></path>
  </svg>`;
}
