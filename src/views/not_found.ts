/**
 * @file 本文件负责渲染 404 页面。
 */
import { getMessages } from "../locales/index.ts";
import type { AppSettings, UserAccount } from "../models.ts";
import { escapeHtml, renderLayout } from "./html.ts";

/**
 * 渲染 404 页面。
 *
 * 页面沿用普通页面的外壳与样式，只把内容换成一个居中的状态说明与返回入口。
 *
 * @param options 404 页面渲染选项。
 * @return 完整 404 页面 HTML。
 */
export function renderNotFound(options: {
  account?: Pick<UserAccount, "displayName" | "id" | "username">;
  csrfToken: string;
  settings: AppSettings;
}): string {
  const messages = getMessages(options.settings.locale);

  const body = `
    <section class="not-found">
      <p class="not-found-code">404</p>
      <h1>${escapeHtml(messages.notFoundTitle)}</h1>
      <p class="not-found-description">${
    escapeHtml(messages.notFoundDescription)
  }</p>
      <form method="get" action="/">
        <button type="submit">${escapeHtml(messages.notFoundAction)}</button>
      </form>
    </section>
  `;

  return renderLayout({
    account: options.account,
    body,
    csrfToken: options.csrfToken,
    darkMode: options.settings.darkMode,
    locale: options.settings.locale,
    themeColor: options.settings.themeColor,
    title: `${messages.notFoundTitle} · ${messages.appName}`,
  });
}
