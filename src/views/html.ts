/**
 * @file 本文件提供基础 HTML 转义和页面布局渲染工具。
 */
import { getMessages } from "../locales/index.ts";
import { isRtlLocale, type Locale } from "../locales/types.ts";
import { csrfHiddenInput } from "../security/csrf.ts";
import {
  authIcon,
  dashboardIcon,
  historyIcon,
  logoutIcon,
  settingsIcon,
} from "./icons.ts";
import {
  renderMatchTableRowLinkScript,
  renderMatchTableRowLinkStyle,
} from "./match_table_row_link.ts";
import type { UserAccount } from "../models.ts";

/**
 * 转义 HTML 文本。
 *
 * @param value 原始文本。
 * @return 转义后的 HTML 文本。
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 渲染应用基础页面布局。
 *
 * @param options 页面布局选项。
 * @return 完整 HTML 页面。
 */
export function renderLayout(options: {
  account?: Pick<UserAccount, "displayName" | "username"> & { id?: string };
  body: string;
  csrfToken: string;
  darkMode: boolean;
  locale: Locale;
  stylesheets?: string[];
  themeColor: string;
  title: string;
}): string {
  const messages = getMessages(options.locale);
  const direction = isRtlLocale(options.locale) ? "rtl" : "ltr";
  const stylesheetHtml = (options.stylesheets ?? []).map((href) =>
    `<link rel="stylesheet" href="${escapeHtml(href)}">`
  ).join("\n    ");

  return `<!doctype html>
<html
  lang="${options.locale}"
  dir="${direction}"
  data-color-mode="${options.darkMode ? "dark" : "light"}"
  data-lobotomy-corp-restart-day="${
    escapeHtml(messages.lobotomyCorpRestartDay)
  }"
  data-lobotomy-corp-fired-manager="${
    escapeHtml(messages.lobotomyCorpFiredManager)
  }"
  style="--theme-color: ${escapeHtml(options.themeColor)}"
>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(options.title)}</title>
    <link rel="icon" href="/favicon.ico" type="image/png">
    <link rel="stylesheet" href="/static/app.css?v=20260906-account-menu">
    <link rel="stylesheet" href="/static/fun/lobotomy-corp/lobotomy-corp.css?v=20260906-fourth-risk-custom-layout">
    ${stylesheetHtml}
    <script src="/static/tooltip.js" defer></script>
    <script src="/static/fun/coordinator.js?v=20260905-cross-game-interruption" defer></script>
    <script src="/static/fun/lobotomy-corp/lobotomy-corp.js?v=20260906-fourth-risk-custom-layout" defer></script>
    ${renderMatchTableRowLinkStyle()}
  </head>
  <body>
    <header class="topbar">
      <a class="brand" href="/">${escapeHtml(messages.appName)}</a>
      <nav class="primary-nav" aria-label="Primary">
        <form class="nav-item" method="get" action="/">
          <button class="nav-link-button" type="submit">${
    renderNavItem(dashboardIcon("nav-icon"), messages.navDashboard)
  }</button>
        </form>
        <form class="nav-item" method="get" action="/settings">
          <button class="nav-link-button" type="submit">${
    renderNavItem(settingsIcon("nav-icon"), messages.navSettings)
  }</button>
        </form>
        <form class="nav-item" method="get" action="/history">
          <button class="nav-link-button" type="submit">${
    renderNavItem(historyIcon("nav-icon"), messages.navHistory)
  }</button>
        </form>
        ${
    options.account
      ? renderAccountMenu(
        options.account,
        options.csrfToken,
        options.locale,
        messages,
      )
      : `<form class="nav-item" method="post" action="/logout?locale=${
        encodeURIComponent(options.locale)
      }">
          ${csrfHiddenInput(options.csrfToken)}
          <button class="nav-link-button" type="submit">${
        renderNavItem(logoutIcon("nav-icon"), messages.navLogout)
      }</button>
        </form>`
  }
      </nav>
    </header>
    <main class="shell">${options.body}</main>
    ${renderMatchTableRowLinkScript()}
  </body>
</html>`;
}

/**
 * 渲染导航项的图标和文本。
 *
 * @param icon 图标 SVG。
 * @param label 导航项文本。
 * @return 导航项内容 HTML。
 */
function renderNavItem(icon: string, label: string): string {
  return `${icon}<span class="nav-label">${escapeHtml(label)}</span>`;
}

/**
 * 渲染导航栏中的账户下拉菜单。
 *
 * @param {Pick<UserAccount, "displayName" | "username"> & { id?: string }} account 当前账户。
 * @param {string} csrfToken 当前页面的 CSRF 令牌。
 * @param {Locale} locale 当前界面语言。
 * @param {ReturnType<typeof getMessages>} messages 当前语言文案。
 * @return {string} 账户菜单 HTML。
 */
function renderAccountMenu(
  account: Pick<UserAccount, "displayName" | "username"> & { id?: string },
  csrfToken: string,
  locale: Locale,
  messages: ReturnType<typeof getMessages>,
): string {
  return `<details class="nav-account-menu"><summary class="nav-avatar-button" aria-label="${
    escapeHtml(messages.navAccountMenu)
  }">${
    renderAvatar(account, messages)
  }</summary><div class="nav-account-dropdown"><a class="nav-account-menu-action" href="/settings">${
    authIcon("username", "nav-account-menu-icon")
  }<span>${
    escapeHtml(messages.accountSettings)
  }</span></a><form method="post" action="/logout?locale=${
    encodeURIComponent(locale)
  }">${
    csrfHiddenInput(csrfToken)
  }<button class="nav-account-menu-action nav-account-logout" type="submit">${
    logoutIcon("nav-account-menu-icon")
  }<span>${
    escapeHtml(messages.navLogout)
  }</span></button></form></div></details>`;
}

/**
 * 为用户稳定地分配一张默认头像。
 *
 * @param {string | undefined} userId 用户 ID。
 * @return {string} 默认头像资源路径。
 */
export function defaultAvatarUrl(userId: string | undefined): string {
  const value = userId ?? "default";
  const hash = Array.from(value).reduce(
    (total, character) => (total * 31 + character.codePointAt(0)!) >>> 0,
    0,
  );
  return `/static/fun/default-avatar/avatar${hash % 5 + 1}.png`;
}

/**
 * 渲染上传头像和默认头像的叠层。
 *
 * @param {Pick<UserAccount, "displayName" | "username"> & { id?: string }} account 当前账户。
 * @param {ReturnType<typeof getMessages>} messages 当前语言文案。
 * @return {string} 头像 HTML。
 */
export function renderAvatar(
  account: Pick<UserAccount, "displayName" | "username"> & { id?: string },
  messages: ReturnType<typeof getMessages>,
): string {
  const name = account.displayName ?? account.username;
  const alt = messages.accountAvatarAlt.replace("{name}", name);
  return `<span class="account-avatar"><img class="account-avatar-default" src="${
    defaultAvatarUrl(account.id)
  }" alt="${
    escapeHtml(alt)
  }"><img class="account-avatar-uploaded" src="/account/avatar" alt="" hidden onload="this.hidden=false"></span>`;
}
