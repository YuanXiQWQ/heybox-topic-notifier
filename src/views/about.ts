/**
 * @file 沿用设置页布局渲染项目信息和网页应用下载入口。
 */
import { getMessages } from "../locales/index.ts";
import type { AppSettings, UserAccount } from "../models.ts";
import { projectRepositoryUrl } from "../project.ts";
import type { ReleaseCatalog } from "../services/releases.ts";
import { escapeHtml, renderLayout } from "./html.ts";
import { materialSymbolIcon } from "./icons.ts";

/**
 * 渲染项目信息、版本旁的应用更新入口和已发布安装包。
 *
 * @param {object} options 页面设置、账号、发行目录和部署版本。
 * @return {string} 关于项目页面的完整 HTML。
 */
export function renderAbout(options: {
  account?: Pick<UserAccount, "displayName" | "id" | "username">;
  csrfToken: string;
  loginSession?: string;
  settings: AppSettings;
  version: string;
  catalog: ReleaseCatalog;
}): string {
  const messages = getMessages(options.settings.locale);
  const { catalog } = options;
  const downloads = catalog.downloads.map((download) => `
    <a class="about-download" href="${escapeHtml(download.url)}" download="${
    escapeHtml(download.name)
  }">
      ${materialSymbolIcon("download", "settings-label-icon")}
      <span>${escapeHtml(download.platform)}</span>
    </a>`).join("");
  const body = `
    <section class="page-heading"><div><h1>${
    escapeHtml(messages.aboutProject)
  }</h1></div></section>
    <section class="settings-group" aria-labelledby="about-project-heading">
      <h2 id="about-project-heading">${escapeHtml(messages.appName)}</h2>
      <dl class="settings-list">
        <div><dt>${escapeHtml(messages.aboutDescription)}</dt><dd>${
    escapeHtml(messages.aboutSummary)
  }</dd></div>
        <div><dt>${
    escapeHtml(messages.projectVersion)
  }</dt><dd class="about-version"><span data-app-version>${
    escapeHtml(options.version)
  }</span><span class="about-version-updates" data-app-updates hidden>
          <button type="button" class="text-action-button about-update-link" data-app-check-update>${
    escapeHtml(messages.checkUpdate)
  }</button>
          <span class="inline-action-status" data-app-update-status role="status" hidden></span>
        </span></dd></div>
        <div class="settings-compact-row"><dt>${
    escapeHtml(messages.projectRepository)
  }</dt><dd><a href="${projectRepositoryUrl}" target="_blank" rel="noopener noreferrer">GitHub</a></dd></div>
        <div class="settings-compact-row"><dt>${
    escapeHtml(messages.projectLicense)
  }</dt><dd><a href="${projectRepositoryUrl}/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">AGPL-3.0</a></dd></div>
      </dl>
    </section>
    <section class="settings-group" aria-labelledby="about-install-heading" data-app-downloads>
      <h2 id="about-install-heading">${
    escapeHtml(messages.installApplication)
  }</h2>
      <dl class="settings-list">
        <div><dt>${
    escapeHtml(messages.installApplication)
  }</dt><dd class="about-downloads">${
    downloads || escapeHtml(
      catalog.status === "unavailable"
        ? messages.applicationDownloadFailed
        : messages.applicationNotReleased,
    )
  }</dd></div>
      </dl>
    </section>`;
  return renderLayout({
    account: options.account,
    body,
    csrfToken: options.csrfToken,
    darkMode: options.settings.darkMode,
    locale: options.settings.locale,
    loginSession: options.loginSession,
    themeColor: options.settings.themeColor,
    title: `${messages.aboutProject} · ${messages.appName}`,
  });
}
