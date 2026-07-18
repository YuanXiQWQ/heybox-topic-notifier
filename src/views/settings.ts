/**
 * @file 本文件负责渲染设置页面及其通知、轮询、话题和关键词配置区域。
 */
import { getMessages } from "../locales/index.ts";
import { languageOptions } from "../locales/languages.ts";
import type { AppSettings, KeywordRule, MatchLocation, TopicRule, UserAccount } from "../models.ts";
import {
  notificationEmailServices,
  notificationWebhookServices,
} from "../notification_services.ts";
import { csrfHiddenInput } from "../security/csrf.ts";
import { escapeHtml, renderLayout } from "./html.ts";

/**
 * 设置页可配置的关键词匹配位置列表。
 */
const matchLocations: MatchLocation[] = ["title", "body", "comments", "replies"];

export type AccountStatus = {
  code:
    | "notFound"
    | "password"
    | "samePassword"
    | "confirmPassword"
    | "currentPassword"
    | "updated"
    | "username"
    | "exists";
  mode?: "password" | "username";
  type: "error" | "success";
};

/**
 * 渲染设置页面。
 *
 * @param options 设置页渲染选项。
 * @return 完整设置页面 HTML。
 */
export function renderSettings(options: {
  account?: Pick<UserAccount, "username">;
  accountStatus?: AccountStatus;
  csrfToken: string;
  settings: AppSettings;
}): string {
  const messages = getMessages(options.settings.locale);
  const body = `
    <section class="page-heading">
      <div>
        <h1>${escapeHtml(messages.settingsTitle)}</h1>
        <p>${escapeHtml(messages.appDescription)}</p>
      </div>
    </section>
    ${
    renderAccountSection(
      options.settings,
      options.account,
      options.accountStatus,
      options.csrfToken,
    )
  }
    <form
      method="post"
      action="/settings"
      data-autosave-form
      data-autosave-saving="${escapeHtml(messages.autoSaveSaving)}"
      data-autosave-saved="${escapeHtml(messages.autoSaveSaved)}"
      data-autosave-error="${escapeHtml(messages.autoSaveError)}"
    >
      ${csrfHiddenInput(options.csrfToken)}
      <section class="settings-group" aria-labelledby="post-settings-heading">
        <h2 id="post-settings-heading">${escapeHtml(messages.postSettings)}</h2>
        <dl class="settings-list" data-settings-list>
          ${renderTopicSection(options.settings)}
          ${renderKeywordSection(options.settings)}
        </dl>
      </section>
      ${renderPollingSection(options.settings)}
      ${renderNotificationSection(options.settings)}
      <section class="settings-group" aria-labelledby="global-settings-heading">
        <h2 id="global-settings-heading">${escapeHtml(messages.globalSettings)}</h2>
        <dl class="settings-list">
          <div>
            <dt>${escapeHtml(messages.theme)}</dt>
            <dd>
              <input
                class="theme-color-input"
                type="color"
                name="themeColor"
                value="${escapeHtml(options.settings.themeColor)}"
                data-theme-color-input
                aria-label="${escapeHtml(messages.theme)}"
              >
            </dd>
          </div>
          <div>
            <dt>${escapeHtml(messages.darkMode)}</dt>
            <dd>
              <label class="switch-control">
                <input
                  type="checkbox"
                  name="darkMode"
                  data-dark-mode-input
                  ${options.settings.darkMode ? "checked" : ""}
                >
              </label>
            </dd>
          </div>
          <div>
            <dt>${escapeHtml(messages.locale)}</dt>
            <dd>
              <select name="locale">
                ${
    languageOptions.map((language) =>
      option(language.code, options.settings.locale, language.label)
    ).join("")
  }
              </select>
            </dd>
          </div>
        </dl>
      </section>
      <div class="form-actions">
        <span class="autosave-status" data-autosave-status role="status"></span>
      </div>
    </form>
    <script src="/static/settings.js?v=20260718-account-settings" defer></script>
  `;

  return renderLayout({
    body,
    csrfToken: options.csrfToken,
    darkMode: options.settings.darkMode,
    locale: options.settings.locale,
    themeColor: options.settings.themeColor,
    title: messages.appName,
  });
}

/**
 * 渲染通知设置区域。
 *
 * @param settings 应用设置。
 * @param account 当前登录账户，未登录时为 undefined。
 * @param status 账户操作后的状态信息，未发生操作时为 undefined。
 * @return 通知设置区域 HTML。
 */
function renderAccountSection(
  settings: AppSettings,
  account: Pick<UserAccount, "username"> | undefined,
  status: AccountStatus | undefined,
  csrfToken: string,
): string {
  const messages = getMessages(settings.locale);
  const actionStatusMessage = status && accountStatusField(status) === "action"
    ? accountStatusMessage(status, messages)
    : undefined;
  const statusState = status?.type === "error" && accountStatusField(status) === "action"
    ? 'data-state="error"'
    : "";
  const escapedUsername = escapeHtml(account?.username ?? "");
  const initialMode = accountInitialMode(status);
  const accountActionsHidden = initialMode ? "" : "hidden";
  const currentPasswordHidden = initialMode ? "" : "hidden";
  const currentPasswordCollapsed = initialMode ? "" : "is-collapsed";
  const passwordFieldsHidden = initialMode === "password" ? "" : "hidden";
  const passwordFieldsCollapsed = initialMode === "password" ? "" : "is-collapsed";

  return `
    <form
      method="post"
      action="/account"
      data-account-form
      data-account-initial-mode="${initialMode ?? ""}"
      data-account-password-invalid="${escapeHtml(messages.accountPasswordCurrentInvalid)}"
      data-account-password-required="${escapeHtml(messages.accountPasswordVerificationRequired)}"
      data-account-password-verified="${escapeHtml(messages.accountPasswordVerified)}"
    >
      ${csrfHiddenInput(csrfToken)}
      <section class="settings-group" aria-labelledby="account-settings-heading">
        <h2 id="account-settings-heading">${escapeHtml(messages.accountSettings)}</h2>
        <dl class="settings-list">
          <div>
            <dt>${escapeHtml(messages.accountUsername)}</dt>
            <dd>
              <input type="hidden" name="accountAction" value="" data-account-action-input>
              <div class="account-username-row">
                <input
                  name="username"
                  value="${escapedUsername}"
                  autocomplete="username"
                  data-account-username-input
                  data-account-username-original="${escapedUsername}"
                  readonly
                  required
                >
                <div class="account-mode-buttons" data-account-mode-buttons>
                  <button type="button" class="secondary" data-account-mode="username">
                    ${escapeHtml(messages.accountEditUsername)}
                  </button>
                  <button type="button" class="secondary" data-account-mode="password">
                    ${escapeHtml(messages.accountEditPassword)}
                  </button>
                </div>
                ${accountFieldStatusHtml("username", status, messages)}
              </div>
            </dd>
          </div>
          <div
            class="account-option-row ${currentPasswordCollapsed}"
            data-account-current-password-row
            ${currentPasswordHidden}
          >
            <dt>${escapeHtml(messages.accountCurrentPassword)}</dt>
            <dd>
              <div class="input-action-row account-password-check-row">
                <input
                  type="password"
                  name="currentPassword"
                  autocomplete="current-password"
                  data-account-current-password-input
                >
                <button type="button" data-account-verify-button>
                  ${escapeHtml(messages.accountVerifyPassword)}
                </button>
                ${accountFieldStatusHtml("currentPassword", status, messages)}
              </div>
            </dd>
          </div>
          <div
            class="account-option-row ${passwordFieldsCollapsed}"
            data-account-new-password-row
            ${passwordFieldsHidden}
          >
            <dt>${escapeHtml(messages.accountNewPassword)}</dt>
            <dd>
              <div class="account-single-input-row">
                <input
                  type="password"
                  name="newPassword"
                  autocomplete="new-password"
                  data-account-unlocked-field
                  disabled
                >
                ${accountFieldStatusHtml("newPassword", status, messages)}
              </div>
            </dd>
          </div>
          <div
            class="account-option-row ${passwordFieldsCollapsed}"
            data-account-new-password-row
            ${passwordFieldsHidden}
          >
            <dt>${escapeHtml(messages.accountConfirmPassword)}</dt>
            <dd>
              <div class="account-single-input-row">
                <input
                  type="password"
                  name="confirmPassword"
                  autocomplete="new-password"
                  data-account-unlocked-field
                  disabled
                >
                ${accountFieldStatusHtml("confirmPassword", status, messages)}
              </div>
            </dd>
          </div>
        </dl>
        <div class="form-actions account-form-actions">
          <div class="account-edit-actions" data-account-actions ${accountActionsHidden}>
            <button type="submit" data-account-save-button disabled>
              ${escapeHtml(messages.accountSave)}
            </button>
            <button type="button" class="secondary" data-account-cancel-button>
              ${escapeHtml(messages.accountCancel)}
            </button>
          </div>
          <span
            class="inline-action-status"
            data-account-status
            ${statusState}
            ${actionStatusMessage ? "" : "hidden"}
            role="status"
          >${escapeHtml(actionStatusMessage ?? "")}</span>
        </div>
      </section>
    </form>
  `;
}

type AccountStatusField =
  | "action"
  | "confirmPassword"
  | "currentPassword"
  | "newPassword"
  | "username";

function accountFieldStatusHtml(
  field: AccountStatusField,
  status: AccountStatus | undefined,
  messages: ReturnType<typeof getMessages>,
): string {
  const statusField = status ? accountStatusField(status) : undefined;
  const statusMessage = status && statusField === field
    ? accountStatusMessage(status, messages)
    : undefined;
  const fieldAttribute = field === "currentPassword"
    ? "data-account-current-password-status"
    : field === "newPassword"
    ? "data-account-new-password-status"
    : field === "confirmPassword"
    ? "data-account-confirm-password-status"
    : field === "username"
    ? "data-account-username-status"
    : "";

  return `<span
    class="inline-action-status account-field-status"
    ${fieldAttribute}
    ${status?.type === "error" && statusField === field ? 'data-state="error"' : ""}
    ${statusMessage ? "" : "hidden"}
    role="status"
  >${escapeHtml(statusMessage ?? "")}</span>`;
}

function accountStatusField(status: AccountStatus): AccountStatusField {
  switch (status.code) {
    case "confirmPassword":
      return "confirmPassword";
    case "currentPassword":
      return "currentPassword";
    case "exists":
    case "username":
      return "username";
    case "password":
    case "samePassword":
      return "newPassword";
    case "notFound":
    case "updated":
      return "action";
  }
}

function accountInitialMode(
  status: AccountStatus | undefined,
): "password" | "username" | undefined {
  if (!status || status.type !== "error") {
    return undefined;
  }

  if (status.mode) {
    return status.mode;
  }

  const field = accountStatusField(status);
  if (field === "username") {
    return "username";
  }
  if (field === "confirmPassword" || field === "newPassword") {
    return "password";
  }
  return undefined;
}

function accountStatusMessage(status: AccountStatus, messages: ReturnType<typeof getMessages>) {
  switch (status.code) {
    case "currentPassword":
      return messages.accountPasswordCurrentInvalid;
    case "exists":
      return messages.accountUsernameExists;
    case "confirmPassword":
      return messages.accountPasswordConfirmationMismatch;
    case "notFound":
      return messages.accountNotFound;
    case "password":
      return messages.accountPasswordMinLength;
    case "samePassword":
      return messages.accountPasswordUnchanged;
    case "updated":
      return messages.accountUpdated;
    case "username":
      return messages.accountUsernameInvalid;
  }
}

function renderNotificationSection(settings: AppSettings): string {
  const messages = getMessages(settings.locale);

  return `
      <section class="settings-group" aria-labelledby="notification-settings-heading">
        <h2 id="notification-settings-heading">${escapeHtml(messages.notificationSettings)}</h2>
        <dl class="settings-list">
          <div>
            <dt>${escapeHtml(messages.notificationProvider)}</dt>
            <dd>
              <div class="notification-provider-row">
                <select name="notificationProvider" data-notification-provider-select>
                  ${option("webhook", settings.notificationProvider, messages.notificationWebhook)}
                  ${option("email", settings.notificationProvider, messages.notificationEmail)}
                  ${
    option("disabled", settings.notificationProvider, messages.notificationDisabled)
  }
                </select>
                <button
                  type="button"
                  data-test-notify-button
                  data-test-notify-sending="${escapeHtml(messages.testNotifySending)}"
                  data-test-notify-failed="${escapeHtml(messages.testNotifyFailed)}"
                  ${settings.notificationProvider === "disabled" ? "hidden" : ""}
                >${escapeHtml(messages.testNotify)}</button>
                <span class="inline-action-status" data-test-notify-status role="status">
                  <span data-test-notify-status-text></span>
                  <a
                    class="inline-action-link"
                    data-test-notify-error-link
                    data-error-app-name="${escapeHtml(messages.appName)}"
                    data-error-dark-mode="${settings.darkMode ? "true" : "false"}"
                    data-error-locale="${escapeHtml(settings.locale)}"
                    data-error-nav-dashboard="${escapeHtml(messages.navDashboard)}"
                    data-error-nav-history="${escapeHtml(messages.navHistory)}"
                    data-error-nav-settings="${escapeHtml(messages.navSettings)}"
                    data-error-return-label="${escapeHtml(messages.testNotifyBackToSettings)}"
                    data-error-summary="${escapeHtml(messages.testNotifyFailed)}"
                    data-error-theme-color="${escapeHtml(settings.themeColor)}"
                    data-error-title="${escapeHtml(messages.testNotifyErrorTitle)}"
                    hidden
                  >${externalLinkIcon()}${escapeHtml(messages.testNotifyViewError)}</a>
                </span>
              </div>
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="webhook-service"
            data-notification-provider-field="webhook"
          >
            <dt>${escapeHtml(messages.notificationWebhookService)}</dt>
            <dd>
              <select name="notificationWebhookService" data-notification-webhook-service-select>
                ${
    notificationWebhookServices.map((service) =>
      option(service.id, settings.notificationWebhookService, messages[service.labelKey])
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
            <dt>${escapeHtml(messages.notificationServerChanSendKey)}</dt>
            <dd>
              <div class="input-action-row">
                <input
                  type="password"
                  name="notificationServerChanSendKey"
                  value=""
                  placeholder="${
    secretInputPlaceholder(settings.notificationServerChanSendKey, messages)
  }"
                  autocomplete="off"
                >
                <a
                  class="button-link external-settings-link"
                  href="https://sct.ftqq.com/sendkey"
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>${escapeHtml(messages.configure)}</span>
                  ${externalLinkIcon()}
                </a>
              </div>
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="pushPlus"
            data-notification-provider-field="webhook"
            data-notification-webhook-service-field="pushPlus"
          >
            <dt>${escapeHtml(messages.notificationPushPlusToken)}</dt>
            <dd>
              <div class="input-action-row">
                <input
                  type="password"
                  name="notificationPushPlusSecret"
                  value=""
                  placeholder="${
    secretInputPlaceholder(settings.notificationPushPlusToken, messages)
  }"
                  autocomplete="off"
                >
                <a
                  class="button-link external-settings-link"
                  href="https://www.pushplus.plus/uc-dev.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>${escapeHtml(messages.configure)}</span>
                  ${externalLinkIcon()}
                </a>
              </div>
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="wxPusher"
            data-notification-provider-field="webhook"
            data-notification-webhook-service-field="wxPusher"
          >
            <dt>${escapeHtml(messages.notificationWxPusherSpt)}</dt>
            <dd>
              <div class="input-action-row">
                <input
                  type="password"
                  name="notificationWxPusherSpt"
                  value=""
                  placeholder="${
    secretInputPlaceholder(
      settings.notificationWxPusherSpt,
      messages,
      "SPT_xxx",
    )
  }"
                  autocomplete="off"
                >
                <a
                  class="button-link external-settings-link"
                  href="https://wxpusher.zjiecode.com/docs/spt.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>${escapeHtml(messages.configure)}</span>
                  ${externalLinkIcon()}
                </a>
              </div>
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="custom"
            data-notification-provider-field="webhook"
            data-notification-webhook-service-field="custom"
          >
            <dt>${escapeHtml(messages.notificationWebhookUrl)}</dt>
            <dd>
              <input
                type="password"
                name="notificationWebhookUrl"
                value=""
                placeholder="${
    secretInputPlaceholder(settings.notificationWebhookUrl, messages, "https://")
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
            <dt>${escapeHtml(messages.notificationEmailService)}</dt>
            <dd>
              <select name="notificationEmailService" data-notification-email-service-select>
                ${
    notificationEmailServices.map((service) =>
      option(service.id, settings.notificationEmailService, messages[service.labelKey])
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
            <dt>${escapeHtml(messages.notificationEmailAddress)}</dt>
            <dd>
              <input
                type="email"
                name="notificationEmailAddress"
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
            <dt>${escapeHtml(messages.notificationEmailFrom)}</dt>
            <dd>
              <input
                type="email"
                name="notificationEmailFrom"
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
            <dt>${escapeHtml(messages.notificationEmailApiUrl)}</dt>
            <dd>
              <input
                type="url"
                name="notificationEmailApiUrl"
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
            <dt>${escapeHtml(messages.notificationEmailApiToken)}</dt>
            <dd>
              <input
                type="password"
                name="notificationEmailApiToken"
                value=""
                placeholder="${
    secretInputPlaceholder(settings.notificationEmailApiToken, messages)
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
            <dt>${escapeHtml(messages.notificationSmtpHost)}</dt>
            <dd>
              <input
                name="notificationSmtpHost"
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
            <dt>${escapeHtml(messages.notificationSmtpPort)}</dt>
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
            <dt>${escapeHtml(messages.notificationSmtpSecure)}</dt>
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
            <dt>${escapeHtml(messages.notificationSmtpUsername)}</dt>
            <dd>
              <input
                name="notificationSmtpUsername"
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
            <dt>${escapeHtml(messages.notificationSmtpPassword)}</dt>
            <dd>
              <input
                type="password"
                name="notificationSmtpPassword"
                value=""
                placeholder="${secretInputPlaceholder(settings.notificationSmtpPassword, messages)}"
                autocomplete="off"
              >
            </dd>
          </div>
        </dl>
      </section>
  `;
}

/**
 * 渲染轮询设置区域。
 *
 * @param settings 应用设置。
 * @return 轮询设置区域 HTML。
 */
function renderPollingSection(settings: AppSettings): string {
  const messages = getMessages(settings.locale);

  return `
      <section
        class="settings-group"
        aria-labelledby="polling-settings-heading"
        data-polling-section
        data-polling-interval-too-short="${escapeHtml(messages.pollIntervalTooShort)}"
      >
        <h2 id="polling-settings-heading">${escapeHtml(messages.pollingSettings)}</h2>
        <dl class="settings-list">
          <div>
            <dt>${escapeHtml(messages.pollEnabled)}</dt>
            <dd>
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
          <div class="polling-option-row" data-polling-field="interval">
            <dt>${escapeHtml(messages.pollInterval)}</dt>
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
                    ${option("second", settings.polling.intervalUnit, messages.pollIntervalSecond)}
                    ${option("minute", settings.polling.intervalUnit, messages.pollIntervalMinute)}
                    ${option("hour", settings.polling.intervalUnit, messages.pollIntervalHour)}
                    ${option("day", settings.polling.intervalUnit, messages.pollIntervalDay)}
                    ${option("week", settings.polling.intervalUnit, messages.pollIntervalWeek)}
                    ${option("month", settings.polling.intervalUnit, messages.pollIntervalMonth)}
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
            <dt>${escapeHtml(messages.pollPostLimit)}</dt>
            <dd>
              <select name="pollPostLimit">
                ${
    [10, 20, 50, 100, 200, 500].map((limit) =>
      option(String(limit), String(settings.polling.postLimit), String(limit))
    ).join("")
  }
              </select>
            </dd>
          </div>
          <div class="polling-option-row" data-polling-field="sort">
            <dt>${escapeHtml(messages.pollSort)}</dt>
            <dd>
              <select name="pollSort">
                ${option("publishTime", settings.polling.sort, messages.pollSortPublishTime)}
                ${option("smart", settings.polling.sort, messages.pollSortSmart)}
                ${option("replyTime", settings.polling.sort, messages.pollSortReplyTime)}
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
  return settings.polling.intervalUnit === "second" && settings.polling.intervalValue < 60;
}

/**
 * 渲染话题设置区域。
 *
 * @param settings 应用设置。
 * @return 话题设置区域 HTML。
 */
function renderTopicSection(settings: AppSettings): string {
  const messages = getMessages(settings.locale);
  const activeTopic = findActiveTopic(settings);
  const summary = topicSummary(settings, activeTopic);
  const topics = settings.topics.length > 0
    ? settings.topics
    : [{ enabled: true, id: "", keywordRules: [], note: "" }];

  return `
    <div
      class="dropdown-settings-row topic-settings-row"
      data-topic-editor
      data-delete-message="${escapeHtml(messages.selectTopicToDelete)}"
    >
      <dt>${escapeHtml(messages.topic)}</dt>
      <dd class="dropdown-summary-cell">
        <input type="hidden" name="activeKeywordTarget" value="${
    escapeHtml(settings.activeKeywordTarget)
  }" data-active-keyword-target>
        <input
          type="hidden"
          name="commonKeywordRulesJson"
          value="${escapeHtml(JSON.stringify(settings.commonKeywordRules))}"
          data-common-keyword-rules
        >
        <span data-topic-summary data-common-label="${escapeHtml(messages.commonTopic)}">${
    escapeHtml(summary)
  }</span>
        <button
          type="button"
          class="dropdown-toggle"
          data-action="toggle-topics"
          aria-expanded="false"
          aria-controls="topic-rules-panel"
          aria-label="${escapeHtml(messages.topic)}"
        >
          <span class="dropdown-chevron" aria-hidden="true"></span>
        </button>
      </dd>
      <dd class="dropdown-panel topic-rules-panel" id="topic-rules-panel" data-topic-panel hidden>
        <div class="dropdown-panel-inner">
          <div class="topic-rule-grid" role="table">
            ${renderTopicRuleHeader(messages)}
            ${topics.map((topic, index) => renderTopicRuleRow(topic, index, messages)).join("")}
          </div>
        </div>
      </dd>
      <template data-topic-row-template>
        ${
    renderTopicRuleRow({ enabled: true, id: "", keywordRules: [], note: "" }, "__index__", messages)
  }
      </template>
    </div>
  `;
}

/**
 * 渲染关键词设置区域。
 *
 * @param settings 应用设置。
 * @return 关键词设置区域 HTML。
 */
function renderKeywordSection(settings: AppSettings): string {
  const messages = getMessages(settings.locale);
  const rows = activeKeywordRules(settings);
  const summaryKeywords = rows.map((rule) => rule.keyword).filter(Boolean);

  return `
    <div
      class="dropdown-settings-row keyword-settings-row"
      data-keyword-editor
      data-delete-message="${escapeHtml(messages.selectKeywordToDelete)}"
    >
      <dt>${escapeHtml(messages.keywords)}</dt>
      <dd class="dropdown-summary-cell">
        <span class="keyword-summary" data-keyword-summary>
          ${renderKeywordSummary(summaryKeywords)}
        </span>
        <button
          type="button"
          class="dropdown-toggle keyword-toggle"
          data-action="toggle-keywords"
          aria-expanded="false"
          aria-controls="keyword-rules-panel"
          aria-label="${escapeHtml(messages.keywords)}"
        >
          <span class="dropdown-chevron" aria-hidden="true"></span>
        </button>
      </dd>
      <dd class="dropdown-panel keyword-rules-panel" id="keyword-rules-panel" data-keyword-panel hidden>
        <div class="dropdown-panel-inner">
          <div class="keyword-rule-grid" role="table">
            ${renderKeywordRuleHeader(messages)}
            ${
    (rows.length > 0 ? rows : [{ keyword: "", locations: [] as MatchLocation[] }])
      .map((rule, index) => renderKeywordRuleRow(rule, index, messages)).join("")
  }
          </div>
        </div>
      </dd>
      <template data-keyword-row-template>
        ${renderKeywordRuleRow({ keyword: "", locations: [] }, "__index__", messages)}
      </template>
    </div>
  `;
}

/**
 * 渲染话题规则表头。
 *
 * @param messages 当前语言文案。
 * @return 话题规则表头 HTML。
 */
function renderTopicRuleHeader(messages: ReturnType<typeof getMessages>): string {
  return `
    <div class="topic-rule-row topic-rule-head" role="row">
      <label class="checkbox-cell bulk-action-cell" role="columnheader">
        <span>${escapeHtml(messages.batchOperation)}</span>
        <input type="checkbox" data-role="select-all-topics">
      </label>
      <div role="columnheader">${escapeHtml(messages.topicId)}</div>
      <div role="columnheader">${escapeHtml(messages.topicNote)}</div>
      <label class="checkbox-cell" role="columnheader">
        <span>${escapeHtml(messages.topicEnabled)}</span>
        <input type="checkbox" data-role="enable-all-topics">
      </label>
      <div role="columnheader">
        <button
          type="button"
          class="text-action-button"
          data-action="edit-topic-keywords"
          data-keyword-target="common"
        >${escapeHtml(messages.topicKeywords)}</button>
      </div>
      <div role="columnheader">
        <button
          type="button"
          class="icon-button"
          data-action="delete-topics"
          title="${escapeHtml(messages.selectTopicToDelete)}"
          aria-label="${escapeHtml(messages.selectTopicToDelete)}"
        >${trashIcon()}</button>
      </div>
      <div role="columnheader">
        <button
          type="button"
          class="icon-button text-icon-button"
          data-action="insert-topic"
          aria-label="+"
        >+</button>
      </div>
    </div>
  `;
}

/**
 * 渲染单条话题规则行。
 *
 * @param topic 话题规则。
 * @param index 话题行索引。
 * @param messages 当前语言文案。
 * @return 话题规则行 HTML。
 */
function renderTopicRuleRow(
  topic: TopicRule,
  index: number | "__index__",
  messages: ReturnType<typeof getMessages>,
): string {
  const keywordRulesJson = escapeHtml(JSON.stringify(topic.keywordRules));

  return `
    <div class="topic-rule-row topic-rule-item" role="row" data-topic-row>
      <input
        type="hidden"
        name="topic_${index}_keywordRulesJson"
        value="${keywordRulesJson}"
        data-topic-keyword-rules
      >
      <label class="checkbox-cell" role="cell">
        <input type="checkbox" data-role="select-topic-row">
      </label>
      <div role="cell">
        <input name="topic_${index}_id" value="${escapeHtml(topic.id)}" data-topic-id-input>
      </div>
      <div role="cell">
        <input name="topic_${index}_note" value="${escapeHtml(topic.note)}" data-topic-note-input>
      </div>
      <label class="checkbox-cell" role="cell">
        <input
          type="checkbox"
          name="topic_${index}_enabled"
          data-role="topic-enabled"
          ${topic.enabled ? "checked" : ""}
        >
      </label>
      <div role="cell">
        <button
          type="button"
          class="text-action-button"
          data-action="edit-topic-keywords"
          data-topic-keywords="${keywordRulesJson}"
          data-keyword-target="${escapeHtml(topic.id)}"
        >${escapeHtml(messages.topicKeywords)}</button>
      </div>
      <div role="cell">
        <button
          type="button"
          class="icon-button"
          data-action="delete-topics"
          aria-label="delete"
        >${trashIcon()}</button>
      </div>
      <div role="cell">
        <button
          type="button"
          class="icon-button text-icon-button"
          data-action="insert-topic"
          aria-label="+"
        >+</button>
      </div>
    </div>
  `;
}

/**
 * 渲染关键词规则表头。
 *
 * @param messages 当前语言文案。
 * @return 关键词规则表头 HTML。
 */
function renderKeywordRuleHeader(messages: ReturnType<typeof getMessages>): string {
  return `
    <div class="keyword-rule-row keyword-rule-head" role="row">
      <label class="checkbox-cell bulk-action-cell" role="columnheader">
        <span>${escapeHtml(messages.batchOperation)}</span>
        <input type="checkbox" data-role="select-all-keywords">
      </label>
      <div role="columnheader">${escapeHtml(messages.keywords)}</div>
      ${renderKeywordLocationHeader(messages.matchTitle, "title")}
      ${renderKeywordLocationHeader(messages.matchBody, "body")}
      ${renderKeywordLocationHeader(messages.matchComments, "comments")}
      ${renderKeywordLocationHeader(messages.matchReplies, "replies")}
      <div role="columnheader">
        <button
          type="button"
          class="icon-button"
          data-action="delete-keywords"
          title="${escapeHtml(messages.selectKeywordToDelete)}"
          aria-label="${escapeHtml(messages.selectKeywordToDelete)}"
        >${trashIcon()}</button>
      </div>
      <div role="columnheader">
        <button
          type="button"
          class="icon-button text-icon-button"
          data-action="insert-keyword"
          aria-label="+"
        >+</button>
      </div>
    </div>
  `;
}

/**
 * 渲染关键词匹配位置表头。
 *
 * @param label 位置展示文案。
 * @param location 匹配位置。
 * @return 匹配位置表头 HTML。
 */
function renderKeywordLocationHeader(label: string, location: MatchLocation): string {
  return `
      <label class="checkbox-cell location-bulk-cell" role="columnheader">
        <span>${escapeHtml(label)}</span>
        <input type="checkbox" data-role="select-keyword-location" data-location="${location}">
      </label>
  `;
}

/**
 * 渲染单条关键词规则行。
 *
 * @param rule 关键词规则。
 * @param index 关键词行索引。
 * @param messages 当前语言文案。
 * @return 关键词规则行 HTML。
 */
function renderKeywordRuleRow(
  rule: {
    caseSensitive?: boolean;
    keyword: string;
    locations: MatchLocation[];
    useRegex?: boolean;
  },
  index: number | "__index__",
  messages: ReturnType<typeof getMessages>,
): string {
  const caseSensitiveLabel = escapeHtml(messages.keywordCaseSensitive);
  const regexLabel = escapeHtml(messages.keywordRegex);

  return `
    <div class="keyword-rule-row keyword-rule-item" role="row" data-keyword-row>
      <label class="checkbox-cell" role="cell">
        <input type="checkbox" data-role="select-keyword-row">
      </label>
      <div role="cell">
        <div class="keyword-input-shell">
          <input name="keyword_${index}" value="${escapeHtml(rule.keyword)}">
          <input
            type="hidden"
            name="keyword_${index}_caseSensitive"
            value="${rule.caseSensitive ? "on" : ""}"
            data-keyword-option="caseSensitive"
          >
          <input
            type="hidden"
            name="keyword_${index}_useRegex"
            value="${rule.useRegex ? "on" : ""}"
            data-keyword-option="useRegex"
          >
          <button
            type="button"
            class="keyword-option-button"
            data-action="toggle-keyword-option"
            data-option="caseSensitive"
            aria-label="${caseSensitiveLabel}"
            aria-pressed="${rule.caseSensitive ? "true" : "false"}"
            data-tooltip="${caseSensitiveLabel}"
          >Cc</button>
          <button
            type="button"
            class="keyword-option-button"
            data-action="toggle-keyword-option"
            data-option="useRegex"
            aria-label="${regexLabel}"
            aria-pressed="${rule.useRegex ? "true" : "false"}"
            data-tooltip="${regexLabel}"
          >.*</button>
        </div>
      </div>
      ${
    matchLocations.map((location) => `
        <label class="checkbox-cell" role="cell">
          <input
            type="checkbox"
            name="keyword_${index}_location_${location}"
            ${rule.locations.includes(location) ? "checked" : ""}
          >
        </label>
      `).join("")
  }
      <div role="cell">
        <button
          type="button"
          class="icon-button"
          data-action="delete-keywords"
          aria-label="delete"
        >${trashIcon()}</button>
      </div>
      <div role="cell">
        <button
          type="button"
          class="icon-button text-icon-button"
          data-action="insert-keyword"
          aria-label="+"
        >+</button>
      </div>
    </div>
  `;
}

/**
 * 查找当前正在编辑关键词的话题。
 *
 * @param settings 应用设置。
 * @return 活动话题，不存在时返回 undefined。
 */
function findActiveTopic(settings: AppSettings): TopicRule | undefined {
  return settings.topics.find((topic) => topic.id === settings.activeKeywordTarget);
}

/**
 * 获取当前活动目标的关键词规则。
 *
 * @param settings 应用设置。
 * @return 当前活动关键词规则列表。
 */
function activeKeywordRules(settings: AppSettings): KeywordRule[] {
  const activeTopic = findActiveTopic(settings);
  return activeTopic?.keywordRules ?? settings.commonKeywordRules;
}

/**
 * 生成话题设置摘要。
 *
 * @param settings 应用设置。
 * @param activeTopic 当前活动话题。
 * @return 话题摘要文本。
 */
function topicSummary(settings: AppSettings, activeTopic: TopicRule | undefined): string {
  const messages = getMessages(settings.locale);

  if (!activeTopic) {
    return messages.commonTopic;
  }

  if (activeTopic.note && activeTopic.id) {
    return `${activeTopic.note}（${activeTopic.id}）`;
  }

  return activeTopic.note || activeTopic.id || messages.commonTopic;
}

/**
 * 渲染关键词摘要。
 *
 * @param keywords 关键词列表。
 * @return 关键词摘要 HTML。
 */
function renderKeywordSummary(keywords: string[]): string {
  const visibleKeywords = keywords.slice(0, 5);
  const suffix = keywords.length > visibleKeywords.length ? "..." : "";

  if (visibleKeywords.length === 0) {
    return "";
  }

  return `${
    visibleKeywords.map((keyword) =>
      `<span data-keyword-summary-item>${escapeHtml(keyword)}</span>`
    ).join('<span class="summary-separator">|</span>')
  }${suffix}`;
}

/**
 * 生成敏感配置输入框的占位提示。
 *
 * @param value 当前已保存的敏感配置。
 * @param messages 当前语言文案。
 * @param emptyPlaceholder 未配置时使用的占位提示。
 * @return 已转义的占位提示。
 */
function secretInputPlaceholder(
  value: string,
  messages: ReturnType<typeof getMessages>,
  emptyPlaceholder = "",
): string {
  return escapeHtml(value.trim() ? messages.configuredSecretPlaceholder : emptyPlaceholder);
}

/**
 * 渲染 select 选项。
 *
 * @param value 选项值。
 * @param current 当前选中值。
 * @param label 选项文案。
 * @return option HTML。
 */
function option(value: string, current: string, label: string): string {
  return `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${
    escapeHtml(label)
  }</option>`;
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
