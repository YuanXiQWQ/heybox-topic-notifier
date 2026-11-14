/**
 * @file 本文件负责渲染命中历史页面。
 */
import { trashIcon } from "./icons.ts";
import { getMessages } from "../locales/index.ts";
import type { AppSettings, UserAccount } from "../models.ts";
import { renderLayout } from "./html.ts";
import type { MatchTableResult } from "./match_table.ts";
import { renderMatchRecordsSection } from "./match_table_view.ts";

/**
 * 渲染历史页面。
 *
 * @param {object} options 历史页面渲染选项。
 * @return {string} 完整历史页面 HTML。
 */
export function renderHistory(options: {
  account?: Pick<UserAccount, "displayName" | "id" | "username">;
  csrfToken: string;
  historyTable: MatchTableResult;
  /** 当前登录会话标识；彩蛋据此判断是否重新登录。 */
  loginSession?: string;
  settings: AppSettings;
}): string {
  const messages = getMessages(options.settings.locale);

  const body = `
    ${
    renderHistoryTable(
      options.historyTable,
      messages,
      options.settings.locale,
      options.csrfToken,
    )
  }
  <script src="/static/history-sync.js?v=20261114-responsive-actions" defer></script>
  `;

  return renderLayout({
    account: options.account,
    body,
    csrfToken: options.csrfToken,
    darkMode: options.settings.darkMode,
    loginSession: options.loginSession,
    locale: options.settings.locale,
    themeColor: options.settings.themeColor,
    title: messages.appName,
  });
}

/**
 * 渲染包含页面标题和筛选控件的历史命中表格。
 *
 * @param {MatchTableResult} table 历史表格数据。
 * @param {ReturnType<typeof getMessages>} messages 当前语言文案。
 * @param {AppSettings["locale"]} locale 当前语言标识。
 * @param {string} csrfToken CSRF 令牌。
 * @return {string} 历史表格 HTML。
 */
export function renderHistoryTable(
  table: MatchTableResult,
  messages: ReturnType<typeof getMessages>,
  locale: AppSettings["locale"],
  csrfToken: string,
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
    allowRestore: true,
    heading: messages.historyTitle,
    headingId: "history-table-heading",
    csrfToken,
    locale,
    messages,
    pageHeading: true,
    path: "/history",
    table,
    titleLinkClass: "pending-title-link",
  });
}
