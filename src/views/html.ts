/**
 * @file 本文件提供基础 HTML 转义和页面布局渲染工具。
 */
import { getMessages } from "../locales/index.ts";
import { isRtlLocale, type Locale } from "../locales/types.ts";
import { csrfHiddenInput } from "../security/csrf.ts";
import { dashboardIcon, historyIcon, logoutIcon, settingsIcon } from "./icons.ts";

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
  body: string;
  csrfToken: string;
  darkMode: boolean;
  locale: Locale;
  themeColor: string;
  title: string;
}): string {
  const messages = getMessages(options.locale);
  const direction = isRtlLocale(options.locale) ? "rtl" : "ltr";

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
    <link rel="icon" href="https://cdn.max-c.com/heybox/logo/app_251.png">
    <link rel="stylesheet" href="/static/app.css">
  </head>
  <body>
    <header class="topbar">
      <a class="brand" href="/">${escapeHtml(messages.appName)}</a>
      <nav class="primary-nav" aria-label="Primary">
        <a href="/">${renderNavItem(dashboardIcon("nav-icon"), messages.navDashboard)}</a>
        <a href="/settings">${renderNavItem(settingsIcon("nav-icon"), messages.navSettings)}</a>
        <a href="/history">${renderNavItem(historyIcon("nav-icon"), messages.navHistory)}</a>
        <form class="nav-logout" method="post" action="/logout">
          ${csrfHiddenInput(options.csrfToken)}
          <button class="nav-link-button" type="submit">${
    renderNavItem(logoutIcon("nav-icon"), messages.navLogout)
  }</button>
        </form>
      </nav>
    </header>
    <main class="shell">${options.body}</main>
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
