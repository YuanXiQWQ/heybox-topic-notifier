/** @file 设置页面、全局偏好、轮询和通知配置表单。 */
import { renderPollingSchedule } from "./polling_schedule.ts";
import { getMessages } from "../locales/index.ts";
import { normalizeMatchingSettings } from "../services/matching_settings.ts";
import type { MatchingRuntime } from "../storage/matching_types.ts";
import {
  renderMatchingAdvanced,
  renderMatchingSection,
} from "./matching_settings.ts";
import { languageOptions } from "../locales/languages.ts";
import { isRtlLocale } from "../locales/types.ts";
import type { AppSettings } from "../models.ts";
import {
  notificationEmailServices,
  notificationWebhookServices,
} from "../notification_services.ts";
import { csrfHiddenInput } from "../security/csrf.ts";
import {
  escapeHtml,
  formControlAttribute,
  renderAceAttorneyEasterEggData,
  renderLayout,
  renderSelectOption,
} from "./html.ts";
import { materialSymbolIcon, type MaterialSymbolName } from "./icons.ts";
import {
  type AccountSettingsViewOptions,
  renderAccountSection,
  renderAccountSecuritySettings,
} from "./settings_account.ts";
import {
  renderKeywordSection,
  renderTopicSection,
} from "./settings_topic_rules.ts";

/**
 * 已配置敏感项首次渲染时展示的固定遮罩长度。
 */
const configuredSecretMaskLength = 8;

/**
 * 自动保存设置表单 ID，用于外联全局设置控件。
 */
const settingsAutosaveFormId = "settings-autosave-form";

/**
 * 《逆转裁判》入口与事件脚本的联合版本。
 *
 * 两份脚本共享同一套初始化约定，版本号同时标识它们，避免浏览器混用旧事件脚本与新入口。
 */
const aceAttorneyEasterEggScriptVersion = "20260907-inline-data-v2";

/**
 * 渲染账户、轮询、匹配和通知设置，并以遮罩展示已保存的敏感配置。
 *
 * @param {object} options 设置页渲染选项。
 * @return {string} 完整设置页面 HTML。
 */
export function renderSettings(
  options: AccountSettingsViewOptions & {
    /** 当前登录会话标识；彩蛋据此判断是否重新登录。 */
    loginSession?: string;
    matchingRuntime?: MatchingRuntime;
  },
): string {
  const messages = getMessages(options.settings.locale);
  const body = `
    <section class="page-heading">
      <div>
        <h1>${escapeHtml(messages.settingsTitle)}</h1>
      </div>
    </section>
    ${renderAccountSection(options)}
    <form
      id="${settingsAutosaveFormId}"
      method="post"
      action="/settings"
      data-autosave-form
      data-autosave-saving="${escapeHtml(messages.autoSaveSaving)}"
      data-autosave-saved="${escapeHtml(messages.autoSaveSaved)}"
      data-autosave-pending="${escapeHtml(messages.autoSavePending)}"
      data-autosave-error="${escapeHtml(messages.autoSaveError)}"
    >
      ${csrfHiddenInput(options.csrfToken)}
      <section class="settings-group" aria-labelledby="post-settings-heading">
        <h2 id="post-settings-heading">${escapeHtml(messages.postSettings)}</h2>
        <dl class="settings-list" data-settings-list>
          ${renderTopicSection(options.settings)}
          ${
    renderMatchingSection(
      options.settings,
      secretInputEditor(
        "matchingApiKey",
        normalizeMatchingSettings(options.settings.matching).apiKey,
        messages,
      ),
    )
  }
          ${renderKeywordSection(options.settings)}
          ${renderMatchingAdvanced(options.settings, options.matchingRuntime)}
        </dl>
      </section>
      ${renderPollingSection(options.settings)}
      ${renderPollingSchedule(options.settings)}
      ${renderNotificationSection(options.settings)}
    </form>
    ${renderAccountSecuritySettings(options)}
    ${renderGlobalSettingsSection(options.settings, settingsAutosaveFormId)}
    <div class="form-actions">
      <span class="autosave-status" data-autosave-status role="status"></span>
    </div>
    ${turnstileScriptHtml(options.turnstileSiteKey)}
    ${googleScriptHtml(options.googleClientId)}
    ${renderAceAttorneyEasterEggData(options.settings.locale)}
    <script src="/static/fun/ace-attorney/Events/CourtroomNameChange.js?v=${aceAttorneyEasterEggScriptVersion}" defer></script>
    <script src="/static/fun/ace-attorney/ace-attorney.js?v=${aceAttorneyEasterEggScriptVersion}" defer></script>
    ${
    [
      "polling-schedule-core.js",
      "polling-calendar.js",
      "polling-calendar-picker.js",
      "polling-calendar-profiles.js",
      "vendor/lunar/lunar.js",
    ].map((file) => `<link rel="modulepreload" href="/static/${file}">`).join(
      "",
    )
  }
    <script type="module" src="/static/polling-schedule.js"></script>
    <script src="/static/settings.js?v=20261026-settings-header-key" defer></script>
  `;

  return renderLayout({
    account: options.account,
    body,
    csrfToken: options.csrfToken,
    darkMode: options.settings.darkMode,
    loginSession: options.loginSession,
    locale: options.settings.locale,
    stylesheets: [
      "/static/fun/ace-attorney/ace-attorney.css?v=20260905-investigations-corners",
    ],
    themeColor: options.settings.themeColor,
    title: messages.appName,
  });
}

/**
 * 渲染带图标的设置项标签。
 *
 * @param icon Material Symbols 图标名称。
 * @param label 设置项标签文本。
 * @param blackForestSlot 可选的彩蛋图标槽位标识。
 * @return dt 标签 HTML。
 */
function settingLabel(
  icon: MaterialSymbolName,
  label: string,
  blackForestSlot?: string,
): string {
  return `<dt class="settings-label-with-icon">${
    materialSymbolIcon(icon, "settings-label-icon", blackForestSlot)
  }<span>${escapeHtml(label)}</span></dt>`;
}

/**
 * 渲染全局设置区域及整行可访问的关于项目入口。
 *
 * @param {AppSettings} settings 应用设置。
 * @param {string} formId 自动保存表单 ID。
 * @return {string} 全局设置区域 HTML。
 */
function renderGlobalSettingsSection(
  settings: AppSettings,
  formId: string,
): string {
  const messages = getMessages(settings.locale);
  const formAttribute = formControlAttribute(formId);

  return `
      <section class="settings-group" aria-labelledby="global-settings-heading">
        <h2 id="global-settings-heading">${
    escapeHtml(messages.globalSettings)
  }</h2>
        <dl class="settings-list">
          <div class="settings-compact-row">
            ${
    settingLabel(
      "palette",
      messages.theme,
      "settings.global.theme",
    )
  }
            <dd>
              <input
                class="theme-color-input"
                type="color"
                name="themeColor"
                value="${escapeHtml(settings.themeColor)}"
                data-theme-color-input
                aria-label="${escapeHtml(messages.theme)}"
                ${formAttribute}
              >
            </dd>
          </div>
          <div class="settings-compact-row">
            ${
    settingLabel(
      "dark_mode",
      messages.darkMode,
      "settings.global.darkMode",
    )
  }
            <dd>
              <label class="switch-control">
                <input
                  type="checkbox"
                  name="darkMode"
                  data-dark-mode-input
                  ${settings.darkMode ? "checked" : ""}
                  ${formAttribute}
                >
              </label>
            </dd>
          </div>
          <div>
            ${
    settingLabel(
      "translate",
      messages.locale,
      "settings.global.locale",
    )
  }
            <dd>
              <select name="locale" ${formAttribute}>
                ${
    languageOptions.map((language) =>
      renderSelectOption(language.code, settings.locale, language.label)
    ).join("")
  }
              </select>
            </dd>
          </div>
          <div data-app-device-platform="windows" hidden>
            ${settingLabel("toggle_on", messages.desktopCloseWindow)}
            <dd class="desktop-close-options">
              <label><input type="radio" name="desktopCloseAction" value="minimize" form="application-device-form" data-app-preference="closeAction">${
    escapeHtml(messages.desktopCloseMinimize)
  }</label>
              <label><input type="radio" name="desktopCloseAction" value="quit" form="application-device-form" data-app-preference="closeAction">${
    escapeHtml(messages.desktopCloseQuit)
  }</label>
              <span class="inline-action-status" data-app-preference-status role="status" hidden></span>
            </dd>
          </div>
          <div class="settings-compact-row" data-app-device-platform="windows" hidden>
            ${settingLabel("timer", messages.desktopLaunchAtLogin)}
            <dd><label class="switch-control"><input type="checkbox" form="application-device-form" data-app-preference="launchAtLogin" aria-label="${
    escapeHtml(messages.desktopLaunchAtLogin)
  }"></label><span class="inline-action-status" data-app-preference-status role="status" hidden></span></dd>
          </div>
          <div class="settings-compact-row" data-app-device-platform="windows" hidden>
            ${settingLabel("download", messages.desktopAutoUpdate)}
            <dd><label class="switch-control"><input type="checkbox" form="application-device-form" data-app-preference="autoUpdate" aria-label="${
    escapeHtml(messages.desktopAutoUpdate)
  }"></label><span class="inline-action-status" data-app-preference-status role="status" hidden></span></dd>
          </div>
          <div data-app-device-platform="windows" hidden>
            ${settingLabel("app_window", messages.desktopResetWindow)}
            <dd><button type="button" class="text-action-button" data-app-reset-window>${
    escapeHtml(messages.desktopResetWindowAction)
  }</button><span class="inline-action-status" data-app-preference-status role="status" hidden></span></dd>
          </div>
          <div class="settings-compact-row" data-app-device-platform="android" hidden>
            ${settingLabel("notifications", messages.applicationBadge)}
            <dd><label class="switch-control"><input type="checkbox" form="application-device-form" data-app-preference="badgeEnabled" aria-label="${
    escapeHtml(messages.applicationBadge)
  }"></label><span class="inline-action-status" data-app-preference-status role="status" hidden></span></dd>
          </div>
          <div class="settings-navigation-row">
            <dt class="settings-navigation-label"><a class="settings-navigation-link" href="/about" data-settings-subpage data-app-about-link>
              <span class="settings-label-with-icon">${
    materialSymbolIcon("info", "settings-label-icon")
  }<span>${escapeHtml(messages.aboutProject)}</span></span>
              <span class="settings-navigation-chevron" aria-hidden="true"></span>
            </a></dt>
            <dd hidden></dd>
          </div>
        </dl>
      </section>
  `;
}

/**
 * 渲染带配置外链的敏感设置标签。
 *
 * @param icon Material Symbols 图标名称。
 * @param label 设置项标签文本。
 * @param href 配置外链地址。
 * @param blackForestSlot 可选的彩蛋图标槽位标识。
 * @param messages 当前语言文案。
 * @return dt 标签 HTML。
 */
function secretSettingLabel(
  icon: MaterialSymbolName,
  label: string,
  href: string,
  blackForestSlot: string | undefined,
  messages: ReturnType<typeof getMessages>,
): string {
  const escapedLabel = escapeHtml(label);
  const escapedTooltip = escapeHtml(secretConfigLinkText(messages, label));

  return `<dt class="settings-label-with-icon">${
    materialSymbolIcon(icon, "settings-label-icon", blackForestSlot)
  }<span>${escapedLabel}</span><a
    class="settings-label-external-link"
    href="${escapeHtml(href)}"
    target="_blank"
    rel="noreferrer"
    data-tooltip="${escapedTooltip}"
    aria-label="${escapedTooltip}"
  >${externalLinkIcon()}</a></dt>`;
}

/**
 * 生成敏感设置配置外链文案。
 *
 * @param messages 当前语言文案。
 * @param label 设置项标签文本。
 * @return 外链提示文案。
 */
function secretConfigLinkText(
  messages: ReturnType<typeof getMessages>,
  label: string,
): string {
  return messages.configureSecretLink.replace("{label}", label);
}

/**
 * 渲染不会暴露已保存值的敏感配置输入行。
 *
 * @param name 提交字段名称。
 * @param value 当前已保存值。
 * @param messages 当前语言文案。
 * @param emptyPlaceholder 未配置时使用的占位提示。
 * @return 敏感配置输入行 HTML。
 */
function secretInputEditor(
  name: string,
  value: string,
  messages: ReturnType<typeof getMessages>,
  emptyPlaceholder = "",
): string {
  const maskLength = value.trim() ? configuredSecretMaskLength : 0;

  const escapedLabel = escapeHtml(messages.editSecret);
  return `<div class="input-action-row secret-input-row" data-secret-editor>
    <input type="hidden" name="${
    escapeHtml(name)
  }" value="" data-secret-hidden-input>
    <input
      class="secret-display-input"
      type="text"
      dir="ltr"
      value="${secretMaskValue(maskLength)}"
      placeholder="${escapeHtml(value.trim() ? "" : emptyPlaceholder)}"
      autocomplete="off"
      readonly
      data-secret-display-input
      data-secret-configured="${value.trim() ? "true" : "false"}"
      data-secret-mask-length="${maskLength}"
    >
    <button
      type="button"
      class="settings-row-action-button settings-icon-action-button"
      data-secret-edit-button
      aria-label="${escapedLabel}"
      data-tooltip="${escapedLabel}"
    >${materialSymbolIcon("edit", "settings-row-action-icon")}</button>
  </div>`;
}

/**
 * 生成指定长度的遮罩点。
 *
 * @param length 遮罩长度。
 * @return 遮罩点字符串。
 */
function secretMaskValue(length: number): string {
  return escapeHtml("•".repeat(Math.max(0, length)));
}

/**
 * 渲染独立的本设备应用通知开关和账号的其它通知方式。
 * @param {AppSettings} settings 通知配置。
 * @return {string} 通知设置 HTML。
 */
function renderNotificationSection(settings: AppSettings): string {
  const messages = getMessages(settings.locale);

  return `
      <section class="settings-group" aria-labelledby="notification-settings-heading">
        <h2 id="notification-settings-heading">${
    escapeHtml(messages.notificationSettings)
  }</h2>
        <script src="/static/app-notifications.js" defer></script>
        <dl class="settings-list">
          <div class="settings-compact-row">
            ${settingLabel("notifications", messages.applicationNotifications)}
            <dd class="settings-row-switch-cell application-notifications-cell">
              <label class="switch-control">
                <input type="checkbox" form="application-notifications-form" data-app-notifications disabled
                  aria-label="${escapeHtml(messages.applicationNotifications)}"
                  data-unsupported="${
    escapeHtml(messages.applicationNotificationsUnsupported)
  }"
                  data-unavailable="${
    escapeHtml(messages.applicationNotificationsUnavailable)
  }"
                  data-unconfigured="${
    escapeHtml(messages.applicationNotificationsUnconfigured)
  }"
                  data-loading="${
    escapeHtml(messages.applicationNotificationsLoading)
  }"
                  data-background-unavailable="${
    escapeHtml(messages.applicationNotificationsBackgroundUnavailable)
  }"
                  data-denied="${
    escapeHtml(messages.applicationNotificationsDenied)
  }"
                  data-failed="${escapeHtml(messages.autoSaveError)}">
              </label>
              <span class="inline-action-status" data-app-notifications-status role="status" hidden></span>
              <button type="button" class="settings-row-action-button" data-app-notifications-retry hidden>${
    escapeHtml(messages.applicationNotificationsRetry)
  }</button>
            </dd>
          </div>
          <div>
            ${
    settingLabel(
      "notifications",
      messages.notificationProvider,
      "settings.notification.provider",
    )
  }
            <dd>
              <div class="notification-provider-row">
                <select name="notificationProvider" data-notification-provider-select>
                  ${
    renderSelectOption(
      "webhook",
      settings.notificationProvider,
      messages.notificationWebhook,
    )
  }
                  ${
    renderSelectOption(
      "email",
      settings.notificationProvider,
      messages.notificationEmail,
    )
  }
                  ${
    renderSelectOption(
      "disabled",
      settings.notificationProvider,
      messages.notificationDisabled,
    )
  }
                </select>
              </div>
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="webhook-service"
            data-notification-provider-field="webhook"
          >
            ${
    settingLabel(
      "webhook",
      messages.notificationWebhookService,
    )
  }
            <dd>
              <select name="notificationWebhookService" data-notification-webhook-service-select>
                ${
    notificationWebhookServices.map((service) =>
      renderSelectOption(
        service.id,
        settings.notificationWebhookService,
        messages[service.labelKey],
      )
    ).join("")
  }
              </select>
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="serverChan"
            data-notification-provider-field="webhook"
            data-notification-webhook-service-field="serverChan"
          >
            ${
    secretSettingLabel(
      "key",
      messages.notificationServerChanSendKey,
      "https://sct.ftqq.com/sendkey",
      undefined,
      messages,
    )
  }
            <dd>
              ${
    secretInputEditor(
      "notificationServerChanSendKey",
      settings.notificationServerChanSendKey,
      messages,
    )
  }
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="pushPlus"
            data-notification-provider-field="webhook"
            data-notification-webhook-service-field="pushPlus"
          >
            ${
    secretSettingLabel(
      "key",
      messages.notificationPushPlusToken,
      "https://www.pushplus.plus/uc-dev.html",
      undefined,
      messages,
    )
  }
            <dd>
              ${
    secretInputEditor(
      "notificationPushPlusSecret",
      settings.notificationPushPlusToken,
      messages,
    )
  }
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="wxPusher"
            data-notification-provider-field="webhook"
            data-notification-webhook-service-field="wxPusher"
          >
            ${
    secretSettingLabel(
      "key",
      messages.notificationWxPusherSpt,
      "https://wxpusher.zjiecode.com/docs/spt.html",
      undefined,
      messages,
    )
  }
            <dd>
              ${
    secretInputEditor(
      "notificationWxPusherSpt",
      settings.notificationWxPusherSpt,
      messages,
      "SPT_xxx",
    )
  }
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="custom"
            data-notification-provider-field="webhook"
            data-notification-webhook-service-field="custom"
          >
            ${
    settingLabel(
      "link",
      messages.notificationWebhookUrl,
    )
  }
            <dd>
              <input
                type="password"
                name="notificationWebhookUrl"
                dir="ltr"
                value=""
                placeholder="${
    secretInputPlaceholder(settings.notificationWebhookUrl, "https://")
  }"
                autocomplete="off"
              >
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="email-service"
            data-notification-provider-field="email"
          >
            ${
    settingLabel(
      "mail",
      messages.notificationEmailService,
    )
  }
            <dd>
              <select name="notificationEmailService" data-notification-email-service-select>
                ${
    notificationEmailServices.map((service) =>
      renderSelectOption(
        service.id,
        settings.notificationEmailService,
        messages[service.labelKey],
      )
    ).join("")
  }
              </select>
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="email-address"
            data-notification-provider-field="email"
          >
            ${
    settingLabel(
      "alternate_email",
      messages.notificationEmailAddress,
    )
  }
            <dd>
              <input
                type="email"
                name="notificationEmailAddress"
                dir="ltr"
                value="${escapeHtml(settings.notificationEmailAddress)}"
                placeholder="name@example.com"
              >
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="email-from"
            data-notification-provider-field="email"
          >
            ${
    settingLabel(
      "mail",
      messages.notificationEmailFrom,
    )
  }
            <dd>
              <input
                type="email"
                name="notificationEmailFrom"
                dir="ltr"
                value="${escapeHtml(settings.notificationEmailFrom)}"
                placeholder="name@example.com"
                autocomplete="off"
              >
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="email-api-url"
            data-notification-provider-field="email"
            data-notification-email-service-field="api"
          >
            ${
    settingLabel(
      "api",
      messages.notificationEmailApiUrl,
    )
  }
            <dd>
              <input
                type="url"
                name="notificationEmailApiUrl"
                dir="ltr"
                value="${escapeHtml(settings.notificationEmailApiUrl)}"
                placeholder="https://"
                autocomplete="off"
              >
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="email-api-token"
            data-notification-provider-field="email"
            data-notification-email-service-field="api"
          >
            ${
    settingLabel(
      "key",
      messages.notificationEmailApiToken,
    )
  }
            <dd>
              <input
                type="password"
                name="notificationEmailApiToken"
                dir="ltr"
                value=""
                placeholder="${
    secretInputPlaceholder(settings.notificationEmailApiToken)
  }"
                autocomplete="off"
              >
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="smtp-host"
            data-notification-provider-field="email"
          >
            ${
    settingLabel(
      "dns",
      messages.notificationSmtpHost,
    )
  }
            <dd>
              <input
                name="notificationSmtpHost"
                dir="ltr"
                value="${escapeHtml(settings.notificationSmtpHost)}"
                placeholder="smtp.example.com"
                autocomplete="off"
              >
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="smtp-port"
            data-notification-provider-field="email"
          >
            ${
    settingLabel(
      "numbers",
      messages.notificationSmtpPort,
    )
  }
            <dd>
              <input
                type="number"
                name="notificationSmtpPort"
                min="1"
                step="1"
                value="${settings.notificationSmtpPort}"
                autocomplete="off"
              >
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="smtp-secure"
            data-notification-provider-field="email"
          >
            ${
    settingLabel(
      "lock",
      messages.notificationSmtpSecure,
    )
  }
            <dd>
              <label class="switch-control">
                <input
                  type="checkbox"
                  name="notificationSmtpSecure"
                  ${settings.notificationSmtpSecure ? "checked" : ""}
                >
              </label>
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="smtp-username"
            data-notification-provider-field="email"
          >
            ${
    settingLabel(
      "badge",
      messages.notificationSmtpUsername,
    )
  }
            <dd>
              <input
                name="notificationSmtpUsername"
                dir="ltr"
                value="${escapeHtml(settings.notificationSmtpUsername)}"
                autocomplete="off"
              >
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="smtp-password"
            data-notification-provider-field="email"
          >
            ${
    settingLabel(
      "password",
      messages.notificationSmtpPassword,
    )
  }
            <dd>
              <input
                type="password"
                name="notificationSmtpPassword"
                dir="ltr"
                value=""
                placeholder="${
    secretInputPlaceholder(settings.notificationSmtpPassword)
  }"
                autocomplete="off"
              >
            </dd>
          </div>
          <div class="notification-test-drawer"><dt hidden></dt><dd>
                <button
                  type="button"
                  class="text-action-button notification-test-button"
                  aria-label="${escapeHtml(messages.testNotify)}"
                  data-test-notify-button
                  data-test-notify-sending="${
    escapeHtml(messages.testNotifySending)
  }"
                  data-test-notify-failed="${
    escapeHtml(messages.testNotifyFailed)
  }"
                >${escapeHtml(messages.testNotify)}</button>
                <span
                  class="inline-action-status"
                  data-test-notify-status
                  role="status"
                  hidden
                >
                  <span data-test-notify-status-text></span>
                  <a
                    class="inline-action-link"
                    data-test-notify-error-link
                    data-error-app-name="${escapeHtml(messages.appName)}"
                    data-error-dark-mode="${
    settings.darkMode ? "true" : "false"
  }"
                    data-error-direction="${
    isRtlLocale(settings.locale) ? "rtl" : "ltr"
  }"
                    data-error-locale="${escapeHtml(settings.locale)}"
                    data-error-nav-dashboard="${
    escapeHtml(messages.navDashboard)
  }"
                    data-error-nav-history="${escapeHtml(messages.navHistory)}"
                    data-error-nav-settings="${
    escapeHtml(messages.navSettings)
  }"
                    data-error-return-label="${
    escapeHtml(messages.testNotifyBackToSettings)
  }"
                    data-error-summary="${
    escapeHtml(messages.testNotifyFailed)
  }"
                    data-error-theme-color="${escapeHtml(settings.themeColor)}"
                    data-error-title="${
    escapeHtml(messages.testNotifyErrorTitle)
  }"
                    hidden
                  >${externalLinkIcon()}${
    escapeHtml(messages.testNotifyViewError)
  }</a>
                </span>
          </dd></div>
        </dl>
      </section>
  `;
}

/**
 * 渲染轮询设置区域。
 *
 * @param {AppSettings} settings 应用设置。
 * @return {string} 轮询设置区域 HTML。
 */
function renderPollingSection(settings: AppSettings): string {
  const messages = getMessages(settings.locale);

  return `
      <section
        class="settings-group"
        aria-labelledby="polling-settings-heading"
        data-polling-section
        data-polling-interval-too-short="${
    escapeHtml(messages.pollIntervalTooShort)
  }"
      >
        <h2 id="polling-settings-heading">${
    escapeHtml(messages.pollingSettings)
  }</h2>
        <dl class="settings-list">
          <div class="settings-compact-row">
            ${
    settingLabel(
      "toggle_on",
      messages.pollEnabled,
      "settings.poll.enabled",
    )
  }
            <dd class="settings-row-switch-cell">
              <label class="switch-control">
                <input
                  type="checkbox"
                  name="pollEnabled"
                  data-polling-enabled-toggle
                  ${settings.polling.enabled ? "checked" : ""}
                >
              </label>
            </dd>
          </div>
          <div class="settings-navigation-row schedule-navigation-row" data-polling-field="schedule">
            <dt class="settings-navigation-label"><a class="settings-navigation-link" href="/settings?panel=polling" data-settings-subpage><span class="settings-label-with-icon">${
    materialSymbolIcon("timer", "settings-label-icon")
  }<span>${escapeHtml(messages.scheduleEnabled)}</span></span></a></dt>
            <dd><label class="switch-control"><input type="checkbox" disabled data-schedule-toggle aria-label="${
    escapeHtml(messages.scheduleEnabled)
  }"></label></dd>
          </div>
          <div class="polling-option-row" data-polling-field="interval">
            ${
    settingLabel(
      "timer",
      messages.pollInterval,
    )
  }
            <dd>
              <div class="poll-interval-row">
                <div class="poll-interval-control">
                  <input
                    type="number"
                    name="pollIntervalValue"
                    min="1"
                    step="1"
                    value="${settings.polling.intervalValue}"
                    data-polling-interval-value
                  >
                  <select name="pollIntervalUnit" data-polling-interval-unit>
                    ${
    renderSelectOption(
      "second",
      settings.polling.intervalUnit,
      messages.pollIntervalSecond,
    )
  }
                    ${
    renderSelectOption(
      "minute",
      settings.polling.intervalUnit,
      messages.pollIntervalMinute,
    )
  }
                    ${
    renderSelectOption(
      "hour",
      settings.polling.intervalUnit,
      messages.pollIntervalHour,
    )
  }
                    ${
    renderSelectOption(
      "day",
      settings.polling.intervalUnit,
      messages.pollIntervalDay,
    )
  }
                    ${
    renderSelectOption(
      "week",
      settings.polling.intervalUnit,
      messages.pollIntervalWeek,
    )
  }
                    ${
    renderSelectOption(
      "month",
      settings.polling.intervalUnit,
      messages.pollIntervalMonth,
    )
  }
                  </select>
                </div>
                <p
                  class="field-hint"
                  data-polling-sub-minute-hint
                  ${isSubMinutePolling(settings) ? "" : "hidden"}
                >${escapeHtml(messages.pollIntervalSubMinuteHint)}</p>
              </div>
            </dd>
          </div>
          <div class="polling-option-row" data-polling-field="post-limit">
            ${
    settingLabel(
      "format_list_numbered",
      messages.pollPostLimit,
    )
  }
            <dd>
              <select name="pollPostLimit">
                ${
    [10, 20, 50, 100, 200, 500].map((limit) =>
      renderSelectOption(
        String(limit),
        String(settings.polling.postLimit),
        String(limit),
      )
    ).join("")
  }
              </select>
            </dd>
          </div>
          <div class="polling-option-row" data-polling-field="sort">
            ${
    settingLabel(
      "sort",
      messages.pollSort,
    )
  }
            <dd>
              <select name="pollSort">
                ${
    renderSelectOption(
      "publishTime",
      settings.polling.sort,
      messages.pollSortPublishTime,
    )
  }
                ${
    renderSelectOption("smart", settings.polling.sort, messages.pollSortSmart)
  }
                ${
    renderSelectOption(
      "replyTime",
      settings.polling.sort,
      messages.pollSortReplyTime,
    )
  }
              </select>
            </dd>
          </div>
        </dl>
      </section>
  `;
}

/**
 * 判断是否配置了低于一分钟的轮询间隔。
 *
 * @param settings 应用设置。
 * @return 低于一分钟时返回 true。
 */
function isSubMinutePolling(settings: AppSettings): boolean {
  return settings.polling.intervalUnit === "second" &&
    settings.polling.intervalValue < 60;
}

/**
 * 生成敏感配置输入框的占位提示。
 *
 * @param value 当前已保存的敏感配置。
 * @param emptyPlaceholder 未配置时使用的占位提示。
 * @return 已转义的占位提示。
 */
function secretInputPlaceholder(
  value: string,
  emptyPlaceholder = "",
): string {
  return escapeHtml(value.trim() ? "" : emptyPlaceholder);
}

/**
 * 渲染外链图标。
 *
 * @return 外链图标 SVG。
 */
function externalLinkIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14V4Z"></path>
    <path d="M5 5h6v2H7v10h10v-4h2v6H5V5Z"></path>
  </svg>`;
}

/**
 * 渲染 Turnstile 官方脚本。
 *
 * @param siteKey Turnstile site key。
 * @return 启用 Turnstile 时返回脚本 HTML。
 */
function turnstileScriptHtml(siteKey: string | undefined): string {
  return siteKey
    ? `<script src="/static/turnstile.js?v=20260914-lazy-load" defer></script>`
    : "";
}

/**
 * 渲染 Google Identity Services 官方脚本。
 *
 * @param clientId Google OAuth client ID。
 * @return 启用 Google 绑定时返回脚本 HTML。
 */
function googleScriptHtml(clientId: string | undefined): string {
  return clientId
    ? `<script src="https://accounts.google.com/gsi/client" async defer></script>`
    : "";
}
