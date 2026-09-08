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
 * 读取游戏目录中的单一 JSON 资料来源。
 *
 * @param {string} relativePath 相对于 static/fun 的安全固定路径。
 * @return {unknown} 已解析的 JSON 资料。
 */
function readEasterEggJson(relativePath: string): unknown {
  return JSON.parse(Deno.readTextFileSync(
    new URL(`../../static/fun/${relativePath}`, import.meta.url),
  ));
}

/**
 * 将 JSON 安全地嵌入 application/json 脚本节点，避免数据中的 HTML 结束标签参与解析。
 *
 * @param {string} id 节点标识。
 * @param {unknown} data 要注入的 JSON 数据。
 * @return {string} 安全的内联 JSON 脚本。
 */
function renderEasterEggJsonData(id: string, data: unknown): string {
  const json = JSON.stringify(data)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return `<script type="application/json" id="${id}">${json}</script>`;
}

/**
 * 解析当前网页 locale 对应的《脑叶公司》本地化文件名。
 *
 * @param {Locale} locale 当前网页 locale。
 * @return {string} 已维护的游戏本地化文件名。
 */
function lobotomyCorpLocaleFile(locale: Locale): string {
  const aliases: Record<string, string> = {
    "en-CA": "en-US",
    "en-GB": "en-US",
    "zh-HK": "zh-TW",
    "zh-MO": "zh-TW",
    "zh-SG": "zh-CN",
  };
  return aliases[locale] ?? (
    [
        "en-US",
        "es-ES",
        "ja-JP",
        "ko-KR",
        "ru-RU",
        "vi-VN",
        "zh-CN",
        "zh-TW",
      ].includes(locale)
      ? locale
      : "en-US"
  );
}

/**
 * 渲染当前页面所需的《脑叶公司》本地化资料。
 *
 * @param {Locale} locale 当前网页 locale。
 * @return {string} 内联 JSON 脚本。
 */
function renderLobotomyCorpLocaleData(locale: Locale): string {
  return renderEasterEggJsonData(
    "lobotomy-corp-locale-data",
    readEasterEggJson(
      `lobotomy-corp/Locales/${lobotomyCorpLocaleFile(locale)}.json`,
    ),
  );
}

/**
 * 渲染《脑叶公司》通用异想体资料。
 *
 * @return {string} 内联 JSON 脚本。
 */
function renderLobotomyCorpAbnormalitiesData(): string {
  return renderEasterEggJsonData(
    "lobotomy-corp-abnormalities-data",
    readEasterEggJson("lobotomy-corp/Data/Abnormalities.json"),
  );
}

/**
 * 渲染设置页所需的《逆转裁判》角色资料和当前语言文本。
 *
 * @param {Locale} locale 当前网页 locale。
 * @return {string} 内联 JSON 脚本。
 */
export function renderAceAttorneyEasterEggData(locale: Locale): string {
  const messageFile = locale.startsWith("zh")
    ? "zh-CN"
    : locale.startsWith("ja")
    ? "ja-JP"
    : "en-US";
  return renderEasterEggJsonData("ace-attorney-easter-egg-data", {
    characters: readEasterEggJson("ace-attorney/Data/Characters.json"),
    messages: readEasterEggJson(`ace-attorney/Locales/${messageFile}.json`),
  });
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
  style="--theme-color: ${escapeHtml(options.themeColor)}"
>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(options.title)}</title>
    <link rel="icon" href="/favicon.ico" type="image/png">
    <link rel="stylesheet" href="/static/app.css?v=20260906-account-menu">
    <link rel="stylesheet" href="/static/fun/lobotomy-corp/lobotomy-corp.css?v=20260908-abnormality-day-final">
    ${stylesheetHtml}
    <script src="/static/tooltip.js" defer></script>
    <script src="/static/fun/coordinator.js?v=20260905-cross-game-interruption" defer></script>
    ${renderLobotomyCorpLocaleData(options.locale)}
    ${renderLobotomyCorpAbnormalitiesData()}
    <script src="/static/fun/lobotomy-corp/lobotomy-corp.js?v=20260908-abnormality-day-final" defer></script>
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
  return `<span class="account-avatar-risk-wrapper"><span class="account-avatar"><img class="account-avatar-default" src="${
    defaultAvatarUrl(account.id)
  }" alt="${
    escapeHtml(alt)
  }"><img class="account-avatar-uploaded" src="/account/avatar" alt="" hidden data-reveal-on-load></span></span>`;
}
