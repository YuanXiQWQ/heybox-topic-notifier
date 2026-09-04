/**
 * @file 本文件负责渲染设置页面及其通知、轮询、话题和关键词配置区域。
 */
import { getMessages } from "../locales/index.ts";
import { languageOptions } from "../locales/languages.ts";
import { isRtlLocale, type Locale } from "../locales/types.ts";
import type {
  AppSettings,
  AuthIdentity,
  EmailCredential,
  KeywordRule,
  MatchLocation,
  PasskeyCredential,
  SecondFactorMethod,
  TopicRule,
  TotpCredential,
  UserAccount,
  UserSecuritySettings,
} from "../models.ts";
import { turnstileResponseFieldName } from "../auth/turnstile.ts";
import {
  notificationEmailServices,
  notificationWebhookServices,
} from "../notification_services.ts";
import { csrfHiddenInput } from "../security/csrf.ts";
import { escapeHtml, renderLayout } from "./html.ts";
import {
  authIcon,
  type AuthIconName,
  copyIcon,
  materialSymbolIcon,
  type MaterialSymbolName,
} from "./icons.ts";

/**
 * 设置页可配置的关键词匹配位置列表。
 */
const matchLocations: MatchLocation[] = [
  "title",
  "body",
  "comments",
  "replies",
];
/**
 * 已配置敏感项首次渲染时展示的固定遮罩长度。
 */
const configuredSecretMaskLength = 8;
/**
 * 自动保存设置表单 ID，用于外联全局设置控件。
 */
const settingsAutosaveFormId = "settings-autosave-form";
/**
 * 两步验证设置表单 ID，用于避免与验证器绑定表单嵌套。
 */
const securitySettingsFormId = "security-settings-form";

/**
 * 为账户认证接口追加当前页面语言。
 *
 * @param path 认证接口路径。
 * @param locale 当前页面语言。
 * @return 携带语言查询参数的接口路径。
 */
function localizedAccountPath(path: string, locale: Locale): string {
  const url = new URL(path, "http://settings.local");
  url.searchParams.set("locale", locale);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

/**
 * 按当前语言格式化认证凭据时间。
 *
 * @param value ISO 时间字符串。
 * @param locale 当前页面语言。
 * @return 本地化日期时间，无法解析时返回原值。
 */
function formatCredentialDate(value: string, locale: Locale): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

export type AccountStatus = {
  code:
    | "notFound"
    | "password"
    | "samePassword"
    | "confirmPassword"
    | "currentPassword"
    | "displayName"
    | "updated"
    | "username"
    | "exists";
  mode?: "displayName" | "password" | "username";
  type: "error" | "success";
};

export type EmailBindingStatus = {
  code:
    | "attempts"
    | "code"
    | "expired"
    | "invalid"
    | "notFound"
    | "updated";
  type: "error" | "success";
};

export type SecuritySettingsStatus = {
  code: "preferred" | "reauth" | "unavailable" | "updated";
  type: "error" | "success";
};

export type TotpBindingStatus = {
  code: "code" | "config" | "deleted" | "notFound" | "reauth" | "updated";
  type: "error" | "success";
};

export type PasskeyBindingStatus = {
  code: "deleted" | "failed" | "notFound" | "reauth" | "updated";
  type: "error" | "success";
};

export type GoogleBindingStatus = {
  code:
    | "alreadyBound"
    | "conflict"
    | "deleted"
    | "failed"
    | "reauth"
    | "updated";
  type: "error" | "success";
};

export type TotpSetupView = {
  qrCodeDataUrl: string;
  secretBase32: string;
  secretEncrypted: string;
};

/**
 * 渲染设置页面。
 *
 * @param options 设置页渲染选项。
 * @return 完整设置页面 HTML。
 */
export function renderSettings(options: {
  account?: Pick<
    UserAccount,
    "displayName" | "emailVerified" | "primaryEmail" | "username"
  >;
  accountStatus?: AccountStatus;
  csrfToken: string;
  emailBindingStatus?: EmailBindingStatus;
  emailCredentials?: EmailCredential[];
  googleBindingStatus?: GoogleBindingStatus;
  googleClientId?: string;
  googleIdentity?: AuthIdentity;
  passkeyBindingStatus?: PasskeyBindingStatus;
  passkeyCredentials?: PasskeyCredential[];
  reauthPasswordAvailable?: boolean;
  reauthRecentlyVerified?: boolean;
  recoveryCodes?: string[];
  secondFactorMethods?: SecondFactorMethod[];
  securitySettings?: UserSecuritySettings;
  securityStatus?: SecuritySettingsStatus;
  settings: AppSettings;
  totpBindingStatus?: TotpBindingStatus;
  totpCredentials?: TotpCredential[];
  totpSetup?: TotpSetupView;
  turnstileSiteKey?: string;
}): string {
  const messages = getMessages(options.settings.locale);
  const body = `
    <section class="page-heading">
      <div>
        <h1>${escapeHtml(messages.settingsTitle)}</h1>
      </div>
    </section>
    ${
    renderAccountSection(
      options.settings,
      options.account,
      options.accountStatus,
      options.csrfToken,
      (options.passkeyCredentials?.length ?? 0) > 0,
      options.reauthPasswordAvailable ?? false,
      options.reauthRecentlyVerified ?? false,
    )
  }
    <form
      id="${settingsAutosaveFormId}"
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
    </form>
    ${
    options.account
      ? renderLoginMethodsSection({
        account: options.account,
        accountStatus: options.accountStatus,
        csrfToken: options.csrfToken,
        emailBindingStatus: options.emailBindingStatus,
        emailCredentials: options.emailCredentials ?? [],
        googleBindingStatus: options.googleBindingStatus,
        googleClientId: options.googleClientId,
        googleIdentity: options.googleIdentity,
        passkeyBindingStatus: options.passkeyBindingStatus,
        passkeyCredentials: options.passkeyCredentials ?? [],
        passwordAvailable: options.reauthPasswordAvailable ?? false,
        recentlyVerified: options.reauthRecentlyVerified ?? false,
        settings: options.settings,
        totpAvailable: (options.totpCredentials?.length ?? 0) > 0,
        turnstileSiteKey: options.turnstileSiteKey,
      })
      : ""
  }
    ${
    options.account && options.securitySettings
      ? renderTwoStepVerificationSection({
        csrfToken: options.csrfToken,
        emailCredentials: options.emailCredentials ?? [],
        passkeyCredentials: options.passkeyCredentials ?? [],
        passwordAvailable: options.reauthPasswordAvailable ?? false,
        recentlyVerified: options.reauthRecentlyVerified ?? false,
        recoveryCodes: options.recoveryCodes,
        secondFactorMethods: options.secondFactorMethods ?? [],
        securitySettings: options.securitySettings,
        securityStatus: options.securityStatus,
        settings: options.settings,
        totpBindingStatus: options.totpBindingStatus,
        totpCredentials: options.totpCredentials ?? [],
        totpSetup: options.totpSetup,
      })
      : ""
  }
    ${renderGlobalSettingsSection(options.settings, settingsAutosaveFormId)}
    <div class="form-actions">
      <span class="autosave-status" data-autosave-status role="status"></span>
    </div>
    ${turnstileScriptHtml(options.turnstileSiteKey)}
    ${googleScriptHtml(options.googleClientId)}
    <script src="/static/easter-egg/ace-attorney/ace-attorney.js?v=20260904-aa456-ui-precise" defer></script>
    <script src="/static/settings.js?v=20260904-display-name" defer></script>
  `;

  return renderLayout({
    body,
    csrfToken: options.csrfToken,
    darkMode: options.settings.darkMode,
    locale: options.settings.locale,
    stylesheets: [
      "/static/easter-egg/ace-attorney/ace-attorney.css?v=20260904-aa456-nameplate-ratio",
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
 * @return dt 标签 HTML。
 */
function settingLabel(icon: MaterialSymbolName, label: string): string {
  return `<dt class="settings-label-with-icon">${
    materialSymbolIcon(icon, "settings-label-icon")
  }<span>${escapeHtml(label)}</span></dt>`;
}

/**
 * 渲染认证设置的图标标签。
 *
 * @param icon 认证设置图标名称。
 * @param label 设置项标签。
 * @return dt 标签 HTML。
 */
function authSettingLabel(icon: AuthIconName, label: string): string {
  return `<dt class="settings-label-with-icon">${
    authIcon(icon, "settings-label-icon auth-settings-icon")
  }<span>${escapeHtml(label)}</span></dt>`;
}

/**
 * 渲染全局设置区域。
 *
 * @param settings 应用设置。
 * @param formId 自动保存表单 ID。
 * @return 全局设置区域 HTML。
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
          <div>
            ${settingLabel("palette", messages.theme)}
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
          <div>
            ${settingLabel("dark_mode", messages.darkMode)}
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
            ${settingLabel("translate", messages.locale)}
            <dd>
              <select name="locale" ${formAttribute}>
                ${
    languageOptions.map((language) =>
      option(language.code, settings.locale, language.label)
    ).join("")
  }
              </select>
            </dd>
          </div>
        </dl>
      </section>
  `;
}

/**
 * 渲染外联表单控件属性。
 *
 * @param formId 表单 ID。
 * @return form 属性 HTML。
 */
function formControlAttribute(formId: string): string {
  return `form="${escapeHtml(formId)}"`;
}

/**
 * 渲染带配置外链的敏感设置标签。
 *
 * @param icon Material Symbols 图标名称。
 * @param label 设置项标签文本。
 * @param href 配置外链地址。
 * @param messages 当前语言文案。
 * @return dt 标签 HTML。
 */
function secretSettingLabel(
  icon: MaterialSymbolName,
  label: string,
  href: string,
  messages: ReturnType<typeof getMessages>,
): string {
  const escapedLabel = escapeHtml(label);
  const escapedTooltip = escapeHtml(secretConfigLinkText(messages, label));

  return `<dt class="settings-label-with-icon">${
    materialSymbolIcon(icon, "settings-label-icon")
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
 * 生成服务端成功状态自动隐藏所需的数据属性。
 *
 * @param {{type: string}|undefined} status 服务端返回的状态。
 * @return {string} 成功状态的数据属性，否则返回空字符串。
 */
function transientSuccessStatusAttribute(
  status: { type: string } | undefined,
): string {
  return status?.type === "success" ? "data-transient-success-status" : "";
}

/**
 * 渲染账户设置区域。
 *
 * @param settings 应用设置。
 * @param account 当前登录账户，未登录时为 undefined。
 * @param status 账户操作后的状态信息，未发生操作时为 undefined。
 * @param csrfToken CSRF 令牌。
 * @param passkeyAvailable 当前账户是否已经绑定 Passkey。
 * @param passwordAvailable 当前账户是否已经配置密码。
 * @param recentlyVerified 当前账户是否已在有效窗口内完成强再认证。
 * @return 账户设置区域 HTML。
 */
function renderAccountSection(
  settings: AppSettings,
  account: Pick<UserAccount, "displayName" | "username"> | undefined,
  status: AccountStatus | undefined,
  csrfToken: string,
  passkeyAvailable: boolean,
  passwordAvailable: boolean,
  recentlyVerified: boolean,
): string {
  const messages = getMessages(settings.locale);
  const actionStatusMessage = status && accountStatusField(status) === "action"
    ? accountStatusMessage(status, messages)
    : undefined;
  const statusState =
    status?.type === "error" && accountStatusField(status) === "action"
      ? 'data-state="error"'
      : "";
  const escapedUsername = escapeHtml(account?.username ?? "");
  const escapedDisplayName = escapeHtml(
    account?.displayName ?? account?.username ?? "",
  );
  const initialMode = accountInitialMode(status);
  const accountActionsHidden = initialMode ? "" : "hidden";
  const currentPasswordVisible = Boolean(initialMode) &&
    initialMode !== "displayName" && !recentlyVerified;
  const currentPasswordHidden = currentPasswordVisible ? "" : "hidden";
  const currentPasswordDisabled = currentPasswordVisible ? "" : "disabled";
  const currentPasswordCollapsed = currentPasswordVisible ? "" : "is-collapsed";
  const passwordFieldsHidden = initialMode === "password" ? "" : "hidden";
  const passwordFieldsCollapsed = initialMode === "password"
    ? ""
    : "is-collapsed";
  const editUsernameLabel = escapeHtml(messages.accountEditUsername);
  const editDisplayNameLabel = escapeHtml(messages.accountEditDisplayName);

  return `
    <form
      method="post"
      action="${localizedAccountPath("/account", settings.locale)}"
      data-account-form
      data-username-easter-egg-settings
      data-account-initial-mode="${initialMode ?? ""}"
      data-account-passkey-available="${passkeyAvailable}"
      data-account-password-available="${passwordAvailable}"
      data-account-recently-verified="${recentlyVerified}"
      data-reauth-passkey-options-url="${
    localizedAccountPath("/account/passkeys/reauth-options", settings.locale)
  }"
      data-reauth-passkey-verify-url="${
    localizedAccountPath("/account/passkeys/reauth", settings.locale)
  }"
      data-account-password-invalid="${
    escapeHtml(messages.accountPasswordCurrentInvalid)
  }"
      data-account-password-required="${
    escapeHtml(messages.accountPasswordVerificationRequired)
  }"
      data-account-password-verified="${
    escapeHtml(messages.accountPasswordVerified)
  }"
      data-account-passkey-failed="${escapeHtml(messages.accountReauthFailed)}"
      data-account-passkey-pending="${
    escapeHtml(messages.accountReauthPasskeyVerifying)
  }"
      data-account-passkey-unsupported="${
    escapeHtml(messages.accountPasskeyUnsupported)
  }"
      data-account-reauth-unavailable="${
    escapeHtml(messages.accountReauthUnavailable)
  }"
      data-account-passkey-verified="${
    escapeHtml(messages.accountReauthVerified)
  }"
    >
      ${csrfHiddenInput(csrfToken)}
      <section class="settings-group" aria-labelledby="account-settings-heading">
        <h2 id="account-settings-heading">${
    escapeHtml(messages.accountSettings)
  }</h2>
        <dl class="settings-list">
          <div>
            ${authSettingLabel("username", messages.accountUsername)}
            <dd>
              <input type="hidden" name="accountAction" value="" data-account-action-input>
              <div class="account-username-row">
                <input
                  name="username"
                  dir="ltr"
                  value="${escapedUsername}"
                  autocomplete="username"
                  data-account-username-input
                  data-account-username-original="${escapedUsername}"
                  readonly
                  required
                >
                ${accountFieldStatusHtml("username", status, messages)}
                <div class="account-mode-buttons" data-account-mode-buttons>
                  <button
                    type="button"
                    class="settings-row-action-button settings-icon-action-button"
                    data-account-mode="username"
                    aria-label="${editUsernameLabel}"
                    data-tooltip="${editUsernameLabel}"
                  >${
    materialSymbolIcon("edit", "settings-row-action-icon")
  }</button>
                </div>
              </div>
            </dd>
          </div>
          <div>
            ${authSettingLabel("username", messages.accountDisplayName)}
            <dd>
              <div class="account-username-row">
                <input
                  name="displayName"
                  value="${escapedDisplayName}"
                  autocomplete="name"
                  data-account-display-name-input
                  data-account-display-name-original="${escapedDisplayName}"
                  readonly
                  required
                >
                ${accountFieldStatusHtml("displayName", status, messages)}
                <div class="account-mode-buttons">
                  <button
                    type="button"
                    class="settings-row-action-button settings-icon-action-button"
                    data-account-mode="displayName"
                    aria-label="${editDisplayNameLabel}"
                    data-tooltip="${editDisplayNameLabel}"
                  >${
    materialSymbolIcon("edit", "settings-row-action-icon")
  }</button>
                </div>
              </div>
            </dd>
          </div>
          <div
            class="account-option-row is-collapsed"
            data-account-passkey-reauth-row
            hidden
          >
            ${authSettingLabel("passkey", messages.accountSecondFactorPasskey)}
            <dd>
              <div class="account-passkey-reauth-row">
                <span
                  class="inline-action-status"
                  data-account-passkey-status
                  role="status"
                  hidden
                ></span>
                <button
                  type="button"
                  class="settings-row-action-button"
                  data-account-passkey-retry-button
                  hidden
                >${escapeHtml(messages.authPasskeyVerify)}</button>
                <button
                  type="button"
                  class="settings-row-action-button"
                  data-account-password-fallback-button
                  hidden
                >${escapeHtml(messages.accountUseCurrentPassword)}</button>
              </div>
            </dd>
          </div>
          <div
            class="account-option-row ${currentPasswordCollapsed}"
            data-account-current-password-row
            ${currentPasswordHidden}
          >
            ${authSettingLabel("password", messages.accountCurrentPassword)}
            <dd>
              <div class="input-action-row account-password-check-row">
                <input
                  type="password"
                  name="currentPassword"
                  dir="ltr"
                  autocomplete="current-password"
                  data-account-current-password-input
                  ${currentPasswordDisabled}
                >
                ${accountFieldStatusHtml("currentPassword", status, messages)}
              </div>
            </dd>
          </div>
          <div
            class="account-option-row ${passwordFieldsCollapsed}"
            data-account-new-password-row
            ${passwordFieldsHidden}
          >
            ${authSettingLabel("password", messages.accountNewPassword)}
            <dd>
              <div class="account-single-input-row">
                <input
                  type="password"
                  name="newPassword"
                  dir="ltr"
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
            ${authSettingLabel("confirmation", messages.accountConfirmPassword)}
            <dd>
              <div class="account-single-input-row">
                <input
                  type="password"
                  name="confirmPassword"
                  dir="ltr"
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
          <span
            class="inline-action-status"
            data-account-status
            ${statusState}
            ${transientSuccessStatusAttribute(status)}
            ${actionStatusMessage ? "" : "hidden"}
            role="status"
          >${escapeHtml(actionStatusMessage ?? "")}</span>
          <div class="account-edit-actions" data-account-actions ${accountActionsHidden}>
            <button type="submit" data-account-save-button disabled>
              ${escapeHtml(messages.accountSave)}
            </button>
            <button type="button" data-account-cancel-button>
              ${escapeHtml(messages.accountCancel)}
            </button>
          </div>
        </div>
      </section>
    </form>
  `;
}

/**
 * 渲染登录方法设置区域。
 *
 * @param options 登录方法渲染选项。
 * @return 登录方法设置区域 HTML。
 */
function renderLoginMethodsSection(options: {
  account: Pick<UserAccount, "emailVerified" | "primaryEmail" | "username">;
  accountStatus?: AccountStatus;
  csrfToken: string;
  emailBindingStatus?: EmailBindingStatus;
  emailCredentials: EmailCredential[];
  googleBindingStatus?: GoogleBindingStatus;
  googleClientId?: string;
  googleIdentity?: AuthIdentity;
  passkeyBindingStatus?: PasskeyBindingStatus;
  passkeyCredentials: PasskeyCredential[];
  passwordAvailable: boolean;
  recentlyVerified: boolean;
  settings: AppSettings;
  totpAvailable: boolean;
  turnstileSiteKey?: string;
}): string {
  const messages = getMessages(options.settings.locale);
  const passkeyOpen = Boolean(options.passkeyBindingStatus);
  const googleOpen = Boolean(options.googleBindingStatus) &&
    !options.googleIdentity;
  const googleReauthOpen = options.googleBindingStatus?.code === "reauth";
  const passkeyReauthPanel = renderInlineReauthPanel({
    emailCredentials: options.emailCredentials,
    passkeyCredentials: options.passkeyCredentials,
    passwordAvailable: options.passwordAvailable,
    recentlyVerified: options.recentlyVerified,
    settings: options.settings,
    statusCode: "reauth",
    totpAvailable: options.totpAvailable,
  });

  return `
    <section class="settings-group" aria-labelledby="login-methods-heading">
      <h2 id="login-methods-heading">${
    escapeHtml(messages.accountLoginMethods)
  }</h2>
      <dl class="settings-list">
        ${
    renderEmailLoginMethodRow({
      account: options.account,
      credentials: options.emailCredentials,
      csrfToken: options.csrfToken,
      settings: options.settings,
      status: options.emailBindingStatus,
      turnstileSiteKey: options.turnstileSiteKey,
    })
  }
        ${
    renderAuthMethodRow({
      action: renderAccountModeTrigger(
        "password",
        messages.accountEditPassword,
      ),
      icon: "password",
      label: messages.authPassword,
      summary: options.passwordAvailable
        ? messages.accountPasswordConfigured
        : messages.accountPasswordNotConfigured,
    })
  }
        ${
    renderAuthMethodRow({
      action: renderAuthPanelToggle(
        "passkey",
        messages.accountPasskeyAdd,
        passkeyOpen,
      ),
      icon: "passkey",
      label: messages.accountPasskeySettings,
      open: passkeyOpen,
      panel: `${
        renderPasskeyBindingSection(
          options.settings,
          options.passkeyCredentials,
          options.passkeyBindingStatus,
          options.csrfToken,
        )
      }${
        renderSensitiveReauthPanel(
          passkeyReauthPanel,
          options.passkeyBindingStatus?.code === "reauth",
        )
      }`,
      panelId: "passkey",
      rowId: "auth-method-passkey",
      summary: passkeyMethodSummary(options.passkeyCredentials, messages),
    })
  }
        ${
    renderGoogleLoginMethodRow({
      csrfToken: options.csrfToken,
      emailCredentials: options.emailCredentials,
      googleClientId: options.googleClientId,
      googleIdentity: options.googleIdentity,
      open: googleOpen,
      passkeyCredentials: options.passkeyCredentials,
      passwordAvailable: options.passwordAvailable,
      recentlyVerified: options.recentlyVerified,
      reauthOpen: googleReauthOpen,
      settings: options.settings,
      status: options.googleBindingStatus,
      totpAvailable: options.totpAvailable,
    })
  }
      </dl>
    </section>
  `;
}

/**
 * 渲染邮箱登录方法设置行。
 *
 * @param options 邮箱登录方法渲染选项。
 * @return 邮箱登录方法设置行 HTML。
 */
function renderEmailLoginMethodRow(options: {
  account: Pick<UserAccount, "emailVerified" | "primaryEmail" | "username">;
  credentials: EmailCredential[];
  csrfToken: string;
  settings: AppSettings;
  status?: EmailBindingStatus;
  turnstileSiteKey?: string;
}): string {
  const messages = getMessages(options.settings.locale);
  const statusMessage = options.status
    ? emailBindingStatusMessage(options.status, messages)
    : "";
  const statusState = options.status?.type === "error"
    ? 'data-state="error"'
    : "";
  const codeOpen = options.status?.type === "error";
  const emailValue = primaryEmailValue(options.account, options.credentials);
  const escapedEmailValue = escapeHtml(emailValue);
  const editLabel = escapeHtml(messages.accountEdit);
  const formId = "email-binding-form";

  return `
        <div class="auth-method-row ${
    codeOpen ? "is-open" : ""
  }" data-email-summary-row>
          ${authSettingLabel("email", messages.accountEmail)}
          <dd>
            <div class="auth-method-summary-row">
              <div class="email-binding-row">
                <input
                  type="email"
                  name="email"
                  dir="ltr"
                  value="${escapedEmailValue}"
                  autocomplete="email"
                  form="${formId}"
                  data-email-binding-input
                  data-email-binding-original="${escapedEmailValue}"
                  readonly
                  required
                >
                <span
                  class="inline-action-status"
                  data-email-send-status
                  ${statusState}
                  ${transientSuccessStatusAttribute(options.status)}
                  ${statusMessage ? "" : "hidden"}
                  role="status"
                >${escapeHtml(statusMessage)}</span>
              </div>
              <div class="auth-method-actions">
                <button
                  type="button"
                  class="auth-method-toggle-button"
                  data-email-binding-edit-button
                  aria-label="${editLabel}"
                  data-tooltip="${editLabel}"
                >${
    materialSymbolIcon("edit", "auth-method-action-icon")
  }</button>
              </div>
            </div>
          </dd>
        </div>
        <div
          class="auth-method-row account-option-row email-binding-code-row ${
    codeOpen ? "" : "is-collapsed"
  }"
          data-email-code-row
          ${codeOpen ? "" : "hidden"}
        >
          ${authSettingLabel("verification-code", messages.accountEmailCode)}
          <dd>
            <form
              id="${formId}"
              class="email-binding-form"
              method="post"
              action="${
    localizedAccountPath("/account/email/verify", options.settings.locale)
  }"
              data-email-binding-form
              data-email-send-url="${
    localizedAccountPath("/auth/email-verifications", options.settings.locale)
  }"
              data-email-code-invalid="${
    escapeHtml(messages.accountEmailCodeInvalid)
  }"
              data-email-code-required="${
    escapeHtml(messages.accountEmailCodeRequired)
  }"
              data-email-invalid="${escapeHtml(messages.accountEmailInvalid)}"
              data-email-send-failed="${
    escapeHtml(messages.accountEmailCodeFailed)
  }"
              data-email-sending="${
    escapeHtml(messages.accountEmailSendingCode)
  }"
              data-email-sent="${escapeHtml(messages.accountEmailCodeSent)}"
              data-email-updated="${escapeHtml(messages.accountEmailUpdated)}"
              data-email-verification-expired="${
    escapeHtml(messages.accountEmailVerificationExpired)
  }"
              data-email-verification-missing="${
    escapeHtml(messages.accountEmailVerificationMissing)
  }"
            >
              ${csrfHiddenInput(options.csrfToken)}
              <div class="email-binding-row">
                <input type="hidden" name="verificationId" data-email-verification-id>
                <input
                  type="text"
                  name="code"
                  dir="ltr"
                  inputmode="numeric"
                  pattern="[0-9]{6}"
                  autocomplete="one-time-code"
                  data-email-code-input
                  required
                >
                <span
                  class="inline-action-status"
                  data-email-verify-status
                  role="status"
                  hidden
                ></span>
                <button
                  type="button"
                  class="settings-row-action-button"
                  data-email-send-code-button
                >
                  ${escapeHtml(messages.accountEmailSendCode)}
                </button>
              </div>
              ${turnstileWidgetHtml(options.turnstileSiteKey)}
            </form>
          </dd>
        </div>
  `;
}

/**
 * 渲染登录方法单行。
 *
 * @param options 登录方法行渲染选项。
 * @return 登录方法行 HTML。
 */
function renderAuthMethodRow(options: {
  action: string;
  icon: AuthIconName;
  label: string;
  open?: boolean;
  panel?: string;
  panelId?: string;
  rowId?: string;
  summary: string;
}): string {
  const hasPanel = options.panel !== undefined && options.panelId !== undefined;
  const open = hasPanel && options.open === true;
  const panel = hasPanel
    ? `
            <div
              class="auth-method-panel ${open ? "" : "is-collapsed"}"
              data-auth-method-panel="${escapeHtml(options.panelId ?? "")}"
              ${open ? "" : "hidden"}
            >
              ${options.panel}
            </div>`
    : "";

  return `
        <div class="auth-method-row ${open ? "is-open" : ""}"${
    options.rowId ? ` id="${escapeHtml(options.rowId)}"` : ""
  }>
          ${authSettingLabel(options.icon, options.label)}
          <dd>
            <div class="auth-method-summary-row">
              <span class="field-hint auth-method-summary">${
    escapeHtml(options.summary)
  }</span>
              <div class="auth-method-actions">${options.action}</div>
            </div>
            ${panel}
          </dd>
        </div>
  `;
}

/**
 * 渲染登录方法面板展开按钮。
 *
 * @param panelId 面板 ID。
 * @param label 按钮文案。
 * @param open 面板是否默认展开。
 * @return 展开按钮 HTML。
 */
function renderAuthPanelToggle(
  panelId: string,
  label: string,
  open: boolean,
): string {
  const escapedLabel = escapeHtml(label);
  return `<button
    type="button"
    class="auth-method-toggle-button"
    data-auth-method-toggle="${escapeHtml(panelId)}"
    aria-expanded="${open ? "true" : "false"}"
    aria-label="${escapedLabel}"
    data-tooltip="${escapedLabel}"
  >${materialSymbolIcon("edit", "auth-method-action-icon")}</button>`;
}

/**
 * 渲染跳转到账户设置编辑模式的登录方法按钮。
 *
 * @param mode 账户设置编辑模式。
 * @param label 按钮文案。
 * @return 账户设置编辑触发按钮 HTML。
 */
function renderAccountModeTrigger(
  mode: "username" | "password",
  label: string,
): string {
  const escapedLabel = escapeHtml(label);
  return `<button
    type="button"
    class="auth-method-toggle-button"
    data-account-mode-trigger="${escapeHtml(mode)}"
    aria-label="${escapedLabel}"
    data-tooltip="${escapedLabel}"
  >${materialSymbolIcon("edit", "auth-method-action-icon")}</button>`;
}

/**
 * 生成 Passkey 登录方法摘要。
 *
 * @param credentials 已绑定 Passkey 凭证。
 * @param messages 当前语言文案。
 * @return Passkey 方法摘要。
 */
function passkeyMethodSummary(
  credentials: PasskeyCredential[],
  messages: ReturnType<typeof getMessages>,
): string {
  return credentials.length > 0
    ? messages.accountPasskeyBoundCount.replace(
      "{count}",
      String(credentials.length),
    )
    : messages.accountPasskeyNoCredentials;
}

/**
 * 渲染 Google 登录方法行。
 *
 * @param options Google 登录方法渲染选项。
 * @return Google 登录方法行 HTML。
 */
function renderGoogleLoginMethodRow(options: {
  csrfToken: string;
  emailCredentials: EmailCredential[];
  googleClientId?: string;
  googleIdentity?: AuthIdentity;
  open: boolean;
  passkeyCredentials: PasskeyCredential[];
  passwordAvailable: boolean;
  recentlyVerified: boolean;
  reauthOpen: boolean;
  settings: AppSettings;
  status?: GoogleBindingStatus;
  totpAvailable: boolean;
}): string {
  const messages = getMessages(options.settings.locale);
  const action = options.googleIdentity
    ? renderGoogleUnbindForm(
      options.googleIdentity,
      options.csrfToken,
      messages,
      options.settings.locale,
    )
    : renderAuthPanelToggle("google", messages.accountGoogleBind, options.open);
  const panel = options.googleIdentity
    ? (options.reauthOpen
      ? renderInlineReauthPanel({
        emailCredentials: options.emailCredentials,
        passkeyCredentials: options.passkeyCredentials,
        passwordAvailable: options.passwordAvailable,
        recentlyVerified: options.recentlyVerified,
        settings: options.settings,
        statusCode: "reauth",
        totpAvailable: options.totpAvailable,
      })
      : options.status?.code === "updated"
      ? undefined
      : renderGoogleStatus(options.status, messages))
    : renderGoogleBindingPanel(
      options.settings,
      options.googleClientId,
      options.status,
      options.csrfToken,
    );

  return renderAuthMethodRow({
    action,
    icon: "google",
    label: messages.accountGoogle,
    open: options.open || options.reauthOpen || (
      Boolean(options.status) && options.status?.code !== "updated"
    ),
    panel,
    panelId: "google",
    summary: options.googleIdentity
      ? googleIdentitySummary(options.googleIdentity, messages)
      : messages.accountGoogleNotBound,
  });
}

/**
 * 生成 Google 身份绑定摘要。
 *
 * @param identity Google 身份绑定。
 * @param messages 当前语言文案。
 * @return Google 绑定摘要。
 */
function googleIdentitySummary(
  identity: AuthIdentity,
  messages: ReturnType<typeof getMessages>,
): string {
  return identity.email
    ? messages.accountGoogleBoundEmail.replace("{email}", identity.email)
    : messages.accountGoogleBound;
}

/**
 * 渲染 Google 解绑表单。
 *
 * @param identity Google 身份绑定。
 * @param csrfToken CSRF 令牌。
 * @param messages 当前语言文案。
 * @param locale 当前页面语言。
 * @return Google 解绑表单 HTML。
 */
function renderGoogleUnbindForm(
  identity: AuthIdentity,
  csrfToken: string,
  messages: ReturnType<typeof getMessages>,
  locale: Locale,
): string {
  const escapedLabel = escapeHtml(messages.accountGoogleUnbind);
  return `<form
    class="auth-method-action-form"
    method="post"
    action="${localizedAccountPath("/account/google/unbind", locale)}"
  >
    ${csrfHiddenInput(csrfToken)}
    <input
      type="hidden"
      name="providerUserId"
      value="${escapeHtml(identity.providerUserId)}"
    >
    <button
      type="submit"
      class="auth-method-toggle-button"
      aria-label="${escapedLabel}"
      data-tooltip="${escapedLabel}"
    >${materialSymbolIcon("edit", "auth-method-action-icon")}</button>
  </form>`;
}

/**
 * 渲染 Google 绑定面板。
 *
 * @param settings 应用设置。
 * @param googleClientId Google OAuth client ID。
 * @param status Google 绑定状态。
 * @param csrfToken CSRF 令牌。
 * @return Google 绑定面板 HTML。
 */
function renderGoogleBindingPanel(
  settings: AppSettings,
  googleClientId: string | undefined,
  status: GoogleBindingStatus | undefined,
  csrfToken: string,
): string {
  const messages = getMessages(settings.locale);
  const statusMessage = googleBindingStatusMessage(status, messages);
  const statusState = status?.type === "error" ? 'data-state="error"' : "";

  if (!googleClientId) {
    return `<span class="field-hint">${
      escapeHtml(messages.accountGoogleUnavailable)
    }</span>`;
  }

  return `
    <div
      class="google-binding"
      data-google-binding
      data-google-client-id="${escapeHtml(googleClientId)}"
      data-google-binding="${escapeHtml(messages.accountGoogleBinding)}"
      data-google-failed="${escapeHtml(messages.accountGoogleBindFailed)}"
    >
      <div class="auth-google-button" data-google-bind-button></div>
      <form method="post" action="${
    localizedAccountPath("/account/google/bind", settings.locale)
  }" data-google-bind-form>
        ${csrfHiddenInput(csrfToken)}
        <input type="hidden" name="credential" data-google-bind-credential>
      </form>
      <span
        class="inline-action-status"
        data-google-binding-status
        ${statusState}
        ${transientSuccessStatusAttribute(status)}
        ${statusMessage ? "" : "hidden"}
        role="status"
      >${escapeHtml(statusMessage)}</span>
    </div>
  `;
}

/**
 * 渲染 Google 状态提示。
 *
 * @param status Google 绑定状态。
 * @param messages 当前语言文案。
 * @return 状态 HTML。
 */
function renderGoogleStatus(
  status: GoogleBindingStatus | undefined,
  messages: ReturnType<typeof getMessages>,
): string {
  if (status?.code === "updated") {
    return "";
  }

  const statusMessage = googleBindingStatusMessage(status, messages);
  const statusState = status?.type === "error" ? 'data-state="error"' : "";
  return `<span
    class="inline-action-status"
    ${statusState}
    ${transientSuccessStatusAttribute(status)}
    ${statusMessage ? "" : "hidden"}
    role="status"
  >${escapeHtml(statusMessage)}</span>`;
}

/**
 * 生成 Google 绑定状态文案。
 *
 * @param status Google 绑定状态。
 * @param messages 当前语言文案。
 * @return 状态文案。
 */
function googleBindingStatusMessage(
  status: GoogleBindingStatus | undefined,
  messages: ReturnType<typeof getMessages>,
): string {
  if (!status) {
    return "";
  }

  switch (status.code) {
    case "alreadyBound":
      return messages.accountGoogleAlreadyBound;
    case "conflict":
      return messages.accountGoogleConflict;
    case "deleted":
      return messages.accountGoogleUnbound;
    case "failed":
      return messages.accountGoogleBindFailed;
    case "reauth":
      return messages.accountReauthRequired;
    case "updated":
      return messages.accountGoogleBound;
  }
}

/**
 * 渲染认证凭证的统一图标操作按钮。
 *
 * @param {{ action: "add" | "delete" | "refresh"; formId?: string; hidden?: boolean; label: string; passkeyBind?: boolean; type: "button" | "submit" }} options 按钮渲染选项。
 * @return {string} 认证凭证操作按钮 HTML。
 */
function renderCredentialActionButton(options: {
  action: "add" | "confirm" | "delete" | "refresh";
  formId?: string;
  hidden?: boolean;
  label: string;
  panelId?: string;
  passkeyBind?: boolean;
  recoveryCodeGenerate?: boolean;
  type: "button" | "submit";
}): string {
  const formAttribute = options.formId
    ? ` form="${escapeHtml(options.formId)}"`
    : "";
  const passkeyBindAttribute = options.passkeyBind
    ? " data-passkey-bind-button"
    : "";
  const panelToggleAttribute = options.panelId
    ? ` data-auth-method-toggle="${
      escapeHtml(options.panelId)
    }" aria-expanded="false"`
    : "";
  const recoveryCodeGenerateAttribute = options.recoveryCodeGenerate
    ? " data-recovery-codes-generate"
    : "";
  const hiddenAttribute = options.hidden ? " hidden" : "";
  const icon = options.action === "confirm" ? "check" : options.action;
  return `<button
    type="${options.type}"
    class="auth-method-toggle-button"${hiddenAttribute}
    data-auth-credential-action="${options.action}"${formAttribute}${passkeyBindAttribute}${panelToggleAttribute}${recoveryCodeGenerateAttribute}
    aria-label="${escapeHtml(options.label)}"
    data-tooltip="${escapeHtml(options.label)}"
  >${materialSymbolIcon(icon, "auth-method-action-icon")}</button>`;
}

/**
 * 渲染验证器动态码绑定区域。
 *
 * @param settings 应用设置。
 * @param credentials 已绑定的验证器凭证。
 * @param setup 待确认的验证器绑定材料。
 * @param status 验证器绑定状态。
 * @param csrfToken CSRF 令牌。
 * @return 验证器绑定区域 HTML。
 */
function renderTotpBindingSection(
  settings: AppSettings,
  credentials: TotpCredential[],
  setup: TotpSetupView | undefined,
  status: TotpBindingStatus | undefined,
  csrfToken: string,
): string {
  const messages = getMessages(settings.locale);
  const statusMessage = status && status.code !== "reauth"
    ? totpBindingStatusMessage(status, messages)
    : "";
  const statusState = status?.type === "error" ? 'data-state="error"' : "";
  const action = setup
    ? localizedAccountPath("/account/totp/verify", settings.locale)
    : "/settings";
  const method = setup ? "post" : "get";
  const hiddenInputs = setup
    ? `${csrfHiddenInput(csrfToken)}
      <input type="hidden" name="secretEncrypted" value="${
      escapeHtml(setup.secretEncrypted)
    }">`
    : `<input type="hidden" name="totpSetup" value="1">`;

  return `
    <div
      class="auth-method-form"
      data-totp-binding-section
      data-credential-count-template="${
    escapeHtml(messages.accountTotpBoundCount)
  }"
      data-credential-empty="${escapeHtml(messages.accountTotpNoCredentials)}"
      data-credential-deleted="${escapeHtml(messages.accountTotpDeleted)}"
      data-totp-code-error="${escapeHtml(messages.accountTotpInvalid)}"
      data-totp-config-error="${escapeHtml(messages.accountTotpConfigMissing)}"
      data-totp-not-found-error="${escapeHtml(messages.accountTotpNotFound)}"
    >
      <form
        id="totp-binding-form"
        method="${method}"
        action="${action}"
        class="auth-method-binding-form"
        data-totp-binding-form
      >
        ${hiddenInputs}
        ${
    setup
      ? `<div class="auth-method-panel-fields">
          ${renderTotpSetupFields(setup, messages)}
        </div>`
      : ""
  }
      </form>
      <div class="auth-method-credential-block">
        <div class="auth-method-credential-heading">
          <span class="auth-method-panel-label">${
    escapeHtml(messages.accountTotpCredentials)
  }</span>
          ${
    renderCredentialActionButton({
      action: setup ? "confirm" : "add",
      formId: "totp-binding-form",
      label: setup ? messages.accountTotpVerify : messages.accountTotpBind,
      type: "submit",
    })
  }
        </div>
        ${
    renderTotpCredentialList(
      credentials,
      messages,
      csrfToken,
      settings.locale,
    )
  }
      </div>
        <span
          class="inline-action-status"
          data-totp-binding-status
          ${statusState}
          ${transientSuccessStatusAttribute(status)}
          ${statusMessage ? "" : "hidden"}
          role="status"
        >${escapeHtml(statusMessage)}</span>
    </div>
  `;
}

/**
 * 渲染待确认的验证器绑定字段。
 *
 * @param setup 待确认的验证器绑定材料。
 * @param messages 当前语言文案。
 * @return 绑定字段 HTML。
 */
function renderTotpSetupFields(
  setup: TotpSetupView,
  messages: ReturnType<typeof getMessages>,
): string {
  return `
          <label>
            <span>${escapeHtml(messages.accountTotpLabel)}</span>
            <input
              type="text"
              name="label"
              maxlength="80"
              autocomplete="off"
              placeholder="${escapeHtml(messages.accountTotpLabelPlaceholder)}"
            >
          </label>
          <div class="totp-setup-qr-row">
            <span class="auth-method-panel-label">${
    escapeHtml(messages.accountTotpQrCode)
  }</span>
            <div class="totp-setup-qr-content">
              <img
                class="totp-setup-qr-code"
                src="${escapeHtml(setup.qrCodeDataUrl)}"
                width="240"
                height="240"
                alt="${escapeHtml(messages.accountTotpQrCode)}"
                data-totp-qr-code
              >
              <p class="field-hint">${
    escapeHtml(messages.accountTotpSetupIntro)
  }</p>
            </div>
          </div>
          <div class="totp-manual-key-row">
            <span class="auth-method-panel-label">${
    escapeHtml(messages.accountTotpManualKey)
  }</span>
            <div class="totp-manual-key-content">
              <code
                class="totp-manual-key-value"
                dir="ltr"
                data-totp-manual-key
              >${escapeHtml(setup.secretBase32)}</code>
              <button
                type="button"
                class="icon-button totp-copy-button"
                data-totp-copy-button
                data-totp-copy-label="${
    escapeHtml(messages.accountTotpCopyKey)
  }"
                data-totp-copy-success="${
    escapeHtml(messages.accountTotpCopySuccess)
  }"
                data-totp-copy-failed="${
    escapeHtml(messages.accountTotpCopyFailed)
  }"
                aria-label="${escapeHtml(messages.accountTotpCopyKey)}"
                data-tooltip="${escapeHtml(messages.accountTotpCopyKey)}"
              >${copyIcon("totp-copy-icon")}</button>
              <span
                class="totp-copy-status"
                data-totp-copy-status
                aria-live="polite"
              ></span>
            </div>
          </div>
          <label>
            <span>${escapeHtml(messages.accountTotpCode)}</span>
              <input
                type="text"
                name="code"
                dir="ltr"
                inputmode="numeric"
                pattern="[0-9]{6}"
                autocomplete="one-time-code"
                data-totp-code-input
                required
              >
          </label>
  `;
}

/**
 * 渲染已绑定验证器凭证列表。
 *
 * @param {TotpCredential[]} credentials 已绑定验证器凭证。
 * @param {ReturnType<typeof getMessages>} messages 当前语言文案。
 * @param {string} csrfToken CSRF 令牌。
 * @param {Locale} locale 当前页面语言。
 * @return {string} 已绑定验证器凭证列表 HTML。
 */
function renderTotpCredentialList(
  credentials: TotpCredential[],
  messages: ReturnType<typeof getMessages>,
  csrfToken: string,
  locale: Locale,
): string {
  if (credentials.length === 0) {
    return `<span class="field-hint">${
      escapeHtml(messages.accountTotpNoCredentials)
    }</span>`;
  }

  return `<ul class="email-credential-list passkey-credential-list">
    ${
    credentials.map((credential, index) =>
      `<li>
        <span>${
        escapeHtml(
          credential.label?.trim() ||
            `${messages.accountTotpSettings} ${index + 1}`,
        )
      }<small>${
        escapeHtml(
          `${messages.accountPasskeyCreatedAt} ${
            formatCredentialDate(credential.enabledAt, locale)
          }`,
        )
      }</small></span>
        <form data-sensitive-action-form method="post" action="${
        localizedAccountPath("/account/totp/delete", locale)
      }">
          ${csrfHiddenInput(csrfToken)}
          <input type="hidden" name="credentialId" value="${
        escapeHtml(credential.credentialId ?? "legacy")
      }">
          ${
        renderCredentialActionButton({
          action: "delete",
          label: messages.accountTotpDelete,
          type: "submit",
        })
      }
        </form>
      </li>`
    ).join("")
  }
  </ul>`;
}

/**
 * 渲染 Passkey 绑定区域。
 *
 * @param settings 应用设置。
 * @param credentials 已绑定 Passkey 凭证。
 * @param status Passkey 绑定状态。
 * @param csrfToken CSRF 令牌。
 * @return Passkey 绑定区域 HTML。
 */
function renderPasskeyBindingSection(
  settings: AppSettings,
  credentials: PasskeyCredential[],
  status: PasskeyBindingStatus | undefined,
  csrfToken: string,
): string {
  const messages = getMessages(settings.locale);
  const statusMessage = status && status.code !== "reauth"
    ? passkeyBindingStatusMessage(status, messages)
    : "";
  const statusState = status?.type === "error" ? 'data-state="error"' : "";
  return `
    <div
      class="auth-method-form"
      data-passkey-binding-section
      data-passkey-options-url="${
    localizedAccountPath(
      "/account/passkeys/register-options",
      settings.locale,
    )
  }"
      data-passkey-register-url="${
    localizedAccountPath("/account/passkeys/register", settings.locale)
  }"
      data-passkey-unsupported="${
    escapeHtml(messages.accountPasskeyUnsupported)
  }"
      data-passkey-binding="${escapeHtml(messages.accountPasskeyBinding)}"
      data-passkey-bound="${escapeHtml(messages.accountPasskeyBound)}"
      data-passkey-failed="${escapeHtml(messages.accountPasskeyBindFailed)}"
      data-credential-count-template="${
    escapeHtml(messages.accountPasskeyBoundCount)
  }"
      data-credential-empty="${
    escapeHtml(messages.accountPasskeyNoCredentials)
  }"
      data-credential-deleted="${escapeHtml(messages.accountPasskeyDeleted)}"
    >
      <div class="auth-method-panel-fields">
        <label>
          <span>${escapeHtml(messages.accountPasskeyLabel)}</span>
            <input
              type="text"
              name="passkeyLabel"
              maxlength="80"
              autocomplete="off"
              placeholder="${
    escapeHtml(messages.accountPasskeyLabelPlaceholder)
  }"
              data-passkey-label-input
            >
        </label>
      </div>
      <div class="auth-method-credential-block">
        <div class="auth-method-credential-heading">
          <span class="auth-method-panel-label">${
    escapeHtml(messages.accountPasskeyCredentials)
  }</span>
          ${
    renderCredentialActionButton({
      action: "add",
      label: messages.accountPasskeyBind,
      passkeyBind: true,
      type: "button",
    })
  }
        </div>
        ${
    renderPasskeyCredentialList(
      credentials,
      messages,
      csrfToken,
      settings.locale,
    )
  }
      </div>
        <span
          class="inline-action-status"
          data-passkey-binding-status
          ${statusState}
          ${transientSuccessStatusAttribute(status)}
          ${statusMessage ? "" : "hidden"}
          role="status"
        >${escapeHtml(statusMessage)}</span>
    </div>
  `;
}

/**
 * 渲染已绑定 Passkey 凭证列表。
 *
 * @param credentials 已绑定 Passkey 凭证。
 * @param messages 当前语言文案。
 * @param csrfToken CSRF 令牌。
 * @param locale 当前页面语言。
 * @return 已绑定 Passkey 凭证列表 HTML。
 */
function renderPasskeyCredentialList(
  credentials: PasskeyCredential[],
  messages: ReturnType<typeof getMessages>,
  csrfToken: string,
  locale: Locale,
): string {
  if (credentials.length === 0) {
    return `<span class="field-hint">${
      escapeHtml(messages.accountPasskeyNoCredentials)
    }</span>`;
  }

  return `<ul class="email-credential-list passkey-credential-list">
    ${
    credentials.map((credential) =>
      `<li>
        <span>
          ${escapeHtml(passkeyCredentialDisplayName(credential, messages))}
          <small>${
        escapeHtml(passkeyCredentialMeta(credential, messages, locale))
      }</small>
        </span>
        <form data-sensitive-action-form method="post" action="${
        localizedAccountPath("/account/passkeys/delete", locale)
      }">
          ${csrfHiddenInput(csrfToken)}
          <input
            type="hidden"
            name="credentialId"
            value="${escapeHtml(credential.credentialId)}"
          >
          ${
        renderCredentialActionButton({
          action: "delete",
          label: messages.accountPasskeyDelete,
          type: "submit",
        })
      }
        </form>
      </li>`
    ).join("")
  }
  </ul>`;
}

/**
 * 生成 Passkey 凭证显示名称。
 *
 * @param credential Passkey 凭证。
 * @param messages 当前语言文案。
 * @param locale 当前页面语言。
 * @return Passkey 凭证显示名称。
 */
function passkeyCredentialDisplayName(
  credential: PasskeyCredential,
  messages: ReturnType<typeof getMessages>,
): string {
  return credential.label?.trim() ||
    `${messages.accountSecondFactorPasskey} ${
      credential.credentialId.slice(0, 8)
    }`;
}

/**
 * 生成 Passkey 凭证元信息。
 *
 * @param credential Passkey 凭证。
 * @param messages 当前语言文案。
 * @return Passkey 凭证元信息。
 */
function passkeyCredentialMeta(
  credential: PasskeyCredential,
  messages: ReturnType<typeof getMessages>,
  locale: Locale,
): string {
  const createdAt = credential.createdAt
    ? formatCredentialDate(credential.createdAt, locale)
    : "";
  const lastUsedAt = credential.lastUsedAt
    ? formatCredentialDate(credential.lastUsedAt, locale)
    : messages.accountPasskeyNeverUsed;
  return `${messages.accountPasskeyCreatedAt}: ${createdAt} · ${messages.accountPasskeyLastUsedAt}: ${lastUsedAt}`;
}

/**
 * 渲染内联敏感操作再认证面板。
 *
 * @param options 再认证面板渲染选项。
 * @return 再认证面板 HTML。
 */
function renderInlineReauthPanel(options: {
  emailCredentials: EmailCredential[];
  passkeyCredentials: PasskeyCredential[];
  passwordAvailable: boolean;
  recentlyVerified: boolean;
  recoveryCodeAvailable?: boolean;
  reauthPurpose?: "reauth" | "recovery_codes";
  settings: AppSettings;
  statusLabel?: string;
  statusCode?: "reauth";
  statusMessage?: string;
  totpAvailable: boolean;
}): string {
  const messages = getMessages(options.settings.locale);
  const verifiedEmails = options.emailCredentials.filter((credential) =>
    credential.verified
  );
  const methodCount = Number(options.passwordAvailable) +
    Number(options.totpAvailable) +
    Number(options.recoveryCodeAvailable) +
    Number(options.passkeyCredentials.length > 0) +
    Number(verifiedEmails.length > 0);
  const statusMessage = options.statusMessage ??
    (options.statusCode === "reauth"
      ? messages.accountReauthRequired
      : methodCount === 0
      ? messages.accountReauthUnavailable
      : options.recentlyVerified
      ? messages.accountReauthReady
      : messages.accountReauthRequired);
  const methodButtons = [
    options.passwordAvailable
      ? renderReauthMethodButton("password", messages.authPassword)
      : "",
    options.totpAvailable
      ? renderReauthMethodButton("totp", messages.accountTotpCode)
      : "",
    options.recoveryCodeAvailable
      ? renderReauthMethodButton(
        "recovery-code",
        messages.accountSecondFactorRecoveryCode,
      )
      : "",
    verifiedEmails.length > 0
      ? renderReauthMethodButton("email", messages.accountEmail)
      : "",
    options.passkeyCredentials.length > 0
      ? renderReauthMethodButton(
        "passkey",
        messages.accountSecondFactorPasskey,
      )
      : "",
  ].join("");

  return `
    <div
      class="inline-reauth-panel"
      data-reauth-section
      data-reauth-purpose="${options.reauthPurpose ?? "reauth"}"
      data-reauth-password-url="${
    localizedAccountPath("/account/reauth/password", options.settings.locale)
  }"
      data-reauth-totp-url="${
    localizedAccountPath("/account/reauth/totp", options.settings.locale)
  }"
      data-reauth-recovery-code-url="${
    localizedAccountPath(
      "/account/reauth/recovery-code",
      options.settings.locale,
    )
  }"
      data-reauth-email-send-url="${
    localizedAccountPath(
      "/auth/email-verifications",
      options.settings.locale,
    )
  }"
      data-reauth-email-verify-url="${
    localizedAccountPath("/account/reauth/email", options.settings.locale)
  }"
      data-reauth-passkey-options-url="${
    localizedAccountPath(
      "/account/passkeys/reauth-options",
      options.settings.locale,
    )
  }"
      data-reauth-passkey-verify-url="${
    localizedAccountPath("/account/passkeys/reauth", options.settings.locale)
  }"
      data-reauth-success="${escapeHtml(messages.accountReauthVerified)}"
      data-reauth-failed="${escapeHtml(messages.accountReauthFailed)}"
      data-reauth-initial-status="${escapeHtml(statusMessage)}"
      data-reauth-passkey-pending="${
    escapeHtml(messages.accountReauthPasskeyVerifying)
  }"
      data-reauth-email-code-required="${
    escapeHtml(messages.accountEmailCodeRequired)
  }"
      data-reauth-email-send-failed="${
    escapeHtml(messages.accountEmailCodeFailed)
  }"
      data-reauth-email-sending="${
    escapeHtml(messages.accountEmailSendingCode)
  }"
    >
      <div class="reauth-status-line">
        <span class="auth-method-panel-label">${
    escapeHtml(options.statusLabel ?? messages.accountReauthStatus)
  }</span>
        <span class="field-hint" data-reauth-status>${
    escapeHtml(statusMessage)
  }</span>
      </div>
      <div class="reauth-method-buttons" data-reauth-method-buttons>
        ${methodButtons}
      </div>
      <div class="reauth-method-details" data-reauth-method-details>
        ${options.passwordAvailable ? renderPasswordReauthMethod(messages) : ""}
        ${options.totpAvailable ? renderTotpReauthMethod(messages) : ""}
        ${
    options.recoveryCodeAvailable
      ? renderRecoveryCodeReauthMethod(messages)
      : ""
  }
        ${renderEmailReauthMethod(verifiedEmails, messages)}
      </div>
      <div class="reauth-cancel-row">
        <button type="button" data-reauth-cancel-button>${
    escapeHtml(messages.accountCancel)
  }</button>
      </div>
    </div>
  `;
}

/**
 * 渲染可按需启用的敏感操作确认区域和惰性模板。
 *
 * @param panel 再认证面板 HTML。
 * @param open 是否立即显示再认证面板。
 * @return 当前面板与后续原地确认使用的模板 HTML。
 */
function renderSensitiveReauthPanel(panel: string, open: boolean): string {
  return `${
    open ? panel : ""
  }<template data-sensitive-reauth-template>${panel}</template>`;
}

/**
 * 渲染一个再认证方式选择按钮。
 *
 * @param method 再认证方式标识。
 * @param label 按钮文案。
 * @return 再认证方式选择按钮 HTML。
 */
function renderReauthMethodButton(
  method: "password" | "totp" | "recovery-code" | "email" | "passkey",
  label: string,
): string {
  return `<button
    type="button"
    class="reauth-method-button"
    data-reauth-method-button="${method}"
    ${method === "passkey" ? "data-reauth-passkey-button" : ""}
    aria-pressed="false"
  >${escapeHtml(label)}</button>`;
}

/**
 * 渲染密码再认证输入区域。
 *
 * @param messages 当前语言文案。
 * @return 密码再认证输入区域 HTML。
 */
function renderPasswordReauthMethod(
  messages: ReturnType<typeof getMessages>,
): string {
  return `
        <div
          class="reauth-method-detail is-collapsed"
          data-reauth-method-panel="password"
          hidden
        >
          <form class="reauth-detail-form" data-reauth-password-form>
            <div class="reauth-input-action-row">
              <input
                type="password"
                name="currentPassword"
                dir="ltr"
                autocomplete="current-password"
                aria-label="${escapeHtml(messages.accountCurrentPassword)}"
                placeholder="${escapeHtml(messages.accountCurrentPassword)}"
                required
              >
              <button type="submit" class="settings-row-action-button">${
    escapeHtml(messages.accountReauthVerify)
  }</button>
            </div>
            <span class="inline-action-status" data-reauth-password-status role="status" hidden></span>
          </form>
        </div>
  `;
}

/**
 * 渲染验证器动态码再认证方式。
 *
 * @param messages 当前语言文案。
 * @return 验证器再认证方式 HTML。
 */
function renderTotpReauthMethod(
  messages: ReturnType<typeof getMessages>,
): string {
  return `
        <div
          class="reauth-method-detail is-collapsed"
          data-reauth-method-panel="totp"
          hidden
        >
          <form class="reauth-detail-form" data-reauth-totp-form>
            <div class="reauth-input-action-row">
              <input
                type="text"
                name="code"
                dir="ltr"
                inputmode="numeric"
                pattern="[0-9]{6}"
                autocomplete="one-time-code"
                aria-label="${escapeHtml(messages.accountTotpCode)}"
                placeholder="${escapeHtml(messages.accountTotpCode)}"
                required
              >
              <button type="submit" class="settings-row-action-button">${
    escapeHtml(messages.accountReauthVerify)
  }</button>
            </div>
            <span class="inline-action-status" data-reauth-totp-status role="status" hidden></span>
          </form>
        </div>
  `;
}

/**
 * 渲染一次性恢复码再认证方式。
 *
 * @param messages 当前语言文案。
 * @return 恢复码再认证方式 HTML。
 */
function renderRecoveryCodeReauthMethod(
  messages: ReturnType<typeof getMessages>,
): string {
  return `
        <div
          class="reauth-method-detail is-collapsed"
          data-reauth-method-panel="recovery-code"
          hidden
        >
          <form class="reauth-detail-form" data-reauth-recovery-code-form>
            <div class="reauth-input-action-row">
              <input
                type="text"
                name="code"
                dir="ltr"
                autocomplete="one-time-code"
                aria-label="${
    escapeHtml(messages.accountSecondFactorRecoveryCode)
  }"
                placeholder="${
    escapeHtml(messages.accountSecondFactorRecoveryCode)
  }"
                required
              >
              <button type="submit" class="settings-row-action-button">${
    escapeHtml(messages.accountReauthVerify)
  }</button>
            </div>
            <span class="inline-action-status" data-reauth-recovery-code-status role="status" hidden></span>
          </form>
        </div>
  `;
}

/**
 * 渲染邮箱验证码再认证方式。
 *
 * @param credentials 已验证邮箱凭证。
 * @param messages 当前语言文案。
 * @return 邮箱再认证方式 HTML。
 */
function renderEmailReauthMethod(
  credentials: EmailCredential[],
  messages: ReturnType<typeof getMessages>,
): string {
  if (credentials.length === 0) {
    return "";
  }

  const selectedEmail = credentials[0]?.email ?? "";
  return `
        <div
          class="reauth-method-detail is-collapsed"
          data-reauth-method-panel="email"
          hidden
        >
          <form class="reauth-detail-form reauth-email-form" data-reauth-email-form>
            <input
              type="hidden"
              name="email"
              value="${escapeHtml(selectedEmail)}"
              data-reauth-email-input
            >
            <input type="hidden" name="verificationId" data-reauth-email-verification-id>
            <div class="reauth-input-action-row">
              <input
                type="text"
                name="code"
                dir="ltr"
                inputmode="numeric"
                pattern="[0-9]{6}"
                autocomplete="one-time-code"
                aria-label="${escapeHtml(messages.accountEmailCode)}"
                placeholder="${escapeHtml(messages.accountEmailCode)}"
                data-reauth-email-code-input
                required
              >
              <button type="submit" class="settings-row-action-button">${
    escapeHtml(messages.accountReauthVerify)
  }</button>
            </div>
            <div class="reauth-email-delivery" data-reauth-email-delivery hidden>
              <span>${escapeHtml(messages.accountReauthEmailCodeSent)}</span>
              <span data-reauth-email-countdown>60</span>
              <button
                type="button"
                class="text-action-button reauth-email-resend-button"
                data-reauth-email-resend-button
                disabled
              >${escapeHtml(messages.accountReauthEmailResend)}</button>
            </div>
            <span class="inline-action-status" data-reauth-email-status role="status" hidden></span>
          </form>
        </div>
  `;
}

/**
 * 渲染两步验证设置区域。
 *
 * @param options 两步验证渲染选项。
 * @return 两步验证设置区域 HTML。
 */
function renderTwoStepVerificationSection(options: {
  csrfToken: string;
  emailCredentials: EmailCredential[];
  passkeyCredentials: PasskeyCredential[];
  passwordAvailable: boolean;
  recentlyVerified: boolean;
  recoveryCodes?: string[];
  secondFactorMethods: SecondFactorMethod[];
  securitySettings: UserSecuritySettings;
  securityStatus?: SecuritySettingsStatus;
  settings: AppSettings;
  totpBindingStatus?: TotpBindingStatus;
  totpCredentials: TotpCredential[];
  totpSetup?: TotpSetupView;
}): string {
  const messages = getMessages(options.settings.locale);
  const preferredMethods = preferredSecondFactorMethods(
    options.secondFactorMethods,
  );
  const selectedPreferred = selectedPreferredSecondFactor(
    options.securitySettings,
    preferredMethods,
  );
  const statusMessage = options.securityStatus &&
      options.securityStatus.code !== "reauth"
    ? securitySettingsStatusMessage(options.securityStatus, messages)
    : "";
  const statusState = options.securityStatus?.type === "error"
    ? 'data-state="error"'
    : "";
  const toggleDisabled = options.secondFactorMethods.length === 0 &&
      !options.securitySettings.twoFactorEnabled
    ? "disabled"
    : "";
  const preferredDisabled = preferredMethods.length === 0 ? "disabled" : "";
  const formAttribute = formControlAttribute(securitySettingsFormId);
  const totpOpen = Boolean(options.totpBindingStatus || options.totpSetup);
  const securityReauthOpen = options.securityStatus?.code === "reauth";
  const totpReauthOpen = options.totpBindingStatus?.code === "reauth";
  const recoveryCodeAvailable = options.totpCredentials.some((credential) =>
    credential.recoveryCodeHashes.length > 0
  );
  const securityReauthPanel = renderInlineReauthPanel({
    emailCredentials: options.emailCredentials,
    passkeyCredentials: options.passkeyCredentials,
    passwordAvailable: options.passwordAvailable,
    recentlyVerified: options.recentlyVerified,
    settings: options.settings,
    statusCode: "reauth",
    totpAvailable: options.totpCredentials.length > 0,
  });
  const totpReauthPanel = renderInlineReauthPanel({
    emailCredentials: options.emailCredentials,
    passkeyCredentials: options.passkeyCredentials,
    passwordAvailable: options.passwordAvailable,
    recentlyVerified: options.recentlyVerified,
    recoveryCodeAvailable,
    settings: options.settings,
    statusCode: "reauth",
    totpAvailable: options.totpCredentials.length > 0,
  });

  return `
    <form
      id="${securitySettingsFormId}"
      method="post"
      action="${
    localizedAccountPath("/account/security", options.settings.locale)
  }"
      data-security-settings-form
      data-security-saving="${escapeHtml(messages.autoSaveSaving)}"
      data-security-saved="${escapeHtml(messages.autoSaveSaved)}"
      data-security-error="${escapeHtml(messages.autoSaveError)}"
      data-security-enabled="${escapeHtml(messages.accountTwoFactorEnabled)}"
      data-security-disabled="${escapeHtml(messages.accountTwoFactorDisabled)}"
      data-security-recently-verified="${options.recentlyVerified}"
      data-security-preferred="${
    escapeHtml(
      messages.accountTwoFactorPreferredUnavailable,
    )
  }"
      data-security-reauth="${escapeHtml(messages.accountReauthRequired)}"
      data-security-unavailable="${
    escapeHtml(
      messages.accountTwoFactorUnavailable,
    )
  }"
    >
      ${csrfHiddenInput(options.csrfToken)}
    </form>
    <section class="settings-group" aria-labelledby="account-two-step-heading">
      <h2 id="account-two-step-heading">${
    escapeHtml(messages.accountTwoStepSettings)
  }</h2>
      <dl class="settings-list">
        <div class="auth-method-row ${securityReauthOpen ? "is-open" : ""}">
          ${authSettingLabel("two-factor", messages.accountTwoFactorToggle)}
          <dd>
            <div class="auth-method-summary-row">
              <span
                class="field-hint auth-method-summary"
                data-security-two-factor-summary
              >${
    escapeHtml(
      options.securitySettings.twoFactorEnabled
        ? messages.accountTwoFactorEnabled
        : messages.accountTwoFactorDisabled,
    )
  }</span>
              <div class="auth-method-actions">
                <label class="switch-control">
                  <input
                    type="checkbox"
                    name="twoFactorEnabled"
                    aria-label="${escapeHtml(messages.accountTwoFactorToggle)}"
                    ${
    options.securitySettings.twoFactorEnabled ? "checked" : ""
  }
                    ${toggleDisabled}
                    ${formAttribute}
                  >
                </label>
              </div>
            </div>
            <div
              class="auth-method-panel ${
    securityReauthOpen ? "" : "is-collapsed"
  }"
              data-auth-method-panel="two-factor"
              data-security-settings-reauth
              ${securityReauthOpen ? "" : "hidden"}
            >
              ${securityReauthOpen ? securityReauthPanel : ""}
              <template data-security-reauth-template>${securityReauthPanel}</template>
            </div>
          </dd>
        </div>
        <div class="auth-method-row">
          ${
    authSettingLabel("preferred-method", messages.accountTwoFactorPreferred)
  }
          <dd>
            <select
              name="preferredSecondFactor"
              ${preferredDisabled}
              ${formAttribute}
            >
                ${
    preferredMethods.map((method) =>
      option(
        method,
        selectedPreferred ?? "",
        secondFactorMethodLabel(method, messages),
      )
    ).join("")
  }
            </select>
          </dd>
        </div>
        ${
    renderAuthMethodRow({
      action: renderAuthPanelToggle("totp", messages.accountEdit, totpOpen),
      icon: "authenticator",
      label: messages.accountTotpSettings,
      open: totpOpen,
      panel: `${
        renderTotpBindingSection(
          options.settings,
          options.totpCredentials,
          options.totpSetup,
          options.totpBindingStatus,
          options.csrfToken,
        )
      }${renderSensitiveReauthPanel(totpReauthPanel, totpReauthOpen)}`,
      panelId: "totp",
      rowId: "auth-method-totp",
      summary: options.totpCredentials.length > 0
        ? messages.accountTotpBoundCount.replace(
          "{count}",
          String(options.totpCredentials.length),
        )
        : messages.accountTotpNoCredentials,
    })
  }
        ${
    renderRecoveryCodesRow({
      credentials: options.totpCredentials,
      emailCredentials: options.emailCredentials,
      messages,
      passkeyCredentials: options.passkeyCredentials,
      passwordAvailable: options.passwordAvailable,
      recoveryCodes: options.recoveryCodes,
      settings: options.settings,
    })
  }
      </dl>
      <div
        class="form-actions account-form-actions security-status-actions"
        data-security-settings-status-row
        data-inline-status-container
        ${statusMessage ? "" : "hidden"}
      >
        <span
          class="inline-action-status"
          data-security-settings-status
          ${statusState}
          ${transientSuccessStatusAttribute(options.securityStatus)}
          ${statusMessage ? "" : "hidden"}
          role="status"
        >${escapeHtml(statusMessage)}</span>
      </div>
    </section>
  `;
}

/**
 * 渲染恢复码设置行。
 *
 * @param options 恢复码设置行渲染选项。
 * @return 恢复码设置行 HTML。
 */
function renderRecoveryCodesRow(options: {
  credentials: TotpCredential[];
  emailCredentials: EmailCredential[];
  messages: ReturnType<typeof getMessages>;
  passkeyCredentials: PasskeyCredential[];
  passwordAvailable: boolean;
  recoveryCodes?: string[];
  settings: AppSettings;
}): string {
  const credentials = options.credentials;
  const messages = options.messages;
  const recoveryCodes = options.recoveryCodes;
  const recoveryCodeCount = credentials.reduce(
    (count, credential) => count + credential.recoveryCodeHashes.length,
    0,
  );
  const hasNewCodes = Boolean(recoveryCodes?.length);
  const canGenerate = recoveryCodeCount === 0 && credentials.length > 0;
  const canRegenerate = recoveryCodeCount > 0;
  const generationMode = canGenerate
    ? "generate" as const
    : canRegenerate
    ? "regenerate" as const
    : undefined;
  return renderAuthMethodRow({
    action: generationMode
      ? renderRecoveryCodeGenerateButton(messages, generationMode, hasNewCodes)
      : "",
    icon: "recovery-codes",
    label: messages.accountRecoveryCodes,
    open: hasNewCodes,
    panel: hasNewCodes
      ? `${renderNewRecoveryCodes(recoveryCodes ?? [], messages)}
        ${renderRecoveryCodeGenerationPanel(options, "regenerate", true)}`
      : generationMode
      ? renderRecoveryCodeGenerationPanel(options, generationMode)
      : undefined,
    panelId: hasNewCodes || generationMode ? "recovery-codes" : undefined,
    rowId: "recovery-codes-row",
    summary: recoveryCodeCount > 0
      ? messages.accountRecoveryCodesCount.replace(
        "{count}",
        String(recoveryCodeCount),
      )
      : messages.accountRecoveryCodesUnavailable,
  });
}

/**
 * 渲染已有验证器账户的恢复码补生成按钮。
 *
 * @param {ReturnType<typeof getMessages>} messages 当前语言文案。
 * @param {"generate" | "regenerate"} mode 恢复码生成模式。
 * @param {boolean} hidden 是否暂时隐藏按钮。
 * @return {string} 恢复码生成按钮 HTML。
 */
function renderRecoveryCodeGenerateButton(
  messages: ReturnType<typeof getMessages>,
  mode: "generate" | "regenerate",
  hidden = false,
): string {
  const regenerate = mode === "regenerate";
  return renderCredentialActionButton({
    action: regenerate ? "refresh" : "add",
    hidden,
    label: regenerate
      ? messages.accountRecoveryCodesRegenerate
      : messages.accountRecoveryCodesGenerate,
    panelId: "recovery-codes",
    recoveryCodeGenerate: true,
    type: "button",
  });
}

/**
 * 渲染恢复码生成前的原地身份确认区域。
 *
 * @param options 恢复码设置行渲染选项。
 * @param {"generate" | "regenerate"} mode 恢复码生成模式。
 * @param initiallyHidden 是否暂时隐藏确认区域。
 * @return 恢复码生成确认区域 HTML。
 */
function renderRecoveryCodeGenerationPanel(
  options: {
    credentials: TotpCredential[];
    emailCredentials: EmailCredential[];
    messages: ReturnType<typeof getMessages>;
    passkeyCredentials: PasskeyCredential[];
    passwordAvailable: boolean;
    settings: AppSettings;
  },
  mode: "generate" | "regenerate",
  initiallyHidden = false,
): string {
  const messages = options.messages;
  const regenerate = mode === "regenerate";
  const actionLabel = regenerate
    ? messages.accountRecoveryCodesRegenerate
    : messages.accountRecoveryCodesGenerate;
  return `<div
    class="recovery-code-generation"
    data-recovery-code-generation
    ${initiallyHidden ? "hidden" : ""}
    data-recovery-generate-url="${
    localizedAccountPath(
      "/account/recovery-codes/generate",
      options.settings.locale,
    )
  }"
    data-recovery-generating="${
    escapeHtml(
      regenerate
        ? messages.accountRecoveryCodesRegenerating
        : messages.accountRecoveryCodesGenerating,
    )
  }"
    data-recovery-generate-failed="${
    escapeHtml(messages.accountRecoveryCodesGenerateFailed)
  }"
  >
    <span class="inline-action-status" data-recovery-generation-status role="status" hidden></span>
    ${
    renderInlineReauthPanel({
      emailCredentials: options.emailCredentials,
      passkeyCredentials: options.passkeyCredentials,
      passwordAvailable: options.passwordAvailable,
      recentlyVerified: false,
      reauthPurpose: "recovery_codes",
      settings: options.settings,
      statusLabel: actionLabel,
      statusMessage: regenerate
        ? messages.accountRecoveryCodesRegenerateIntro
        : messages.accountRecoveryCodesGenerateIntro,
      totpAvailable: options.credentials.length > 0,
    })
  }
  </div>`;
}

/**
 * 渲染首次生成且仅展示一次的恢复码。
 *
 * @param {string[]} recoveryCodes 恢复码明文。
 * @param {ReturnType<typeof getMessages>} messages 当前语言文案。
 * @return {string} 恢复码首次展示区域 HTML。
 */
function renderNewRecoveryCodes(
  recoveryCodes: string[],
  messages: ReturnType<typeof getMessages>,
): string {
  return `<div class="recovery-code-reveal" data-recovery-code-reveal>
    <div class="recovery-code-heading-row">
      <strong>${escapeHtml(messages.accountRecoveryCodesNewIntro)}</strong>
      <button
        type="button"
        class="icon-button recovery-code-download-button"
        data-recovery-codes-download
        data-recovery-download-label="${
    escapeHtml(messages.accountRecoveryCodesDownload)
  }"
        data-recovery-download-failed="${
    escapeHtml(messages.accountRecoveryCodesDownloadFailed)
  }"
        data-recovery-download-app-name="${escapeHtml(messages.appName)}"
        data-recovery-download-file-label="${
    escapeHtml(messages.accountRecoveryCodes)
  }"
        data-recovery-download-hint="${
    escapeHtml(messages.accountRecoveryCodesSaveHint)
  }"
        aria-label="${escapeHtml(messages.accountRecoveryCodesDownload)}"
        data-tooltip="${escapeHtml(messages.accountRecoveryCodesDownload)}"
      >${materialSymbolIcon("download", "recovery-code-download-icon")}</button>
    </div>
    <ul class="recovery-code-list" data-recovery-code-list>
      ${
    recoveryCodes.map((code) => `<li><code>${escapeHtml(code)}</code></li>`)
      .join("")
  }
    </ul>
    <p class="field-hint">${
    escapeHtml(messages.accountRecoveryCodesSaveHint)
  }</p>
    <div class="recovery-code-confirm-row">
      <button type="button" data-recovery-codes-confirm>${
    escapeHtml(messages.accountReauthVerify)
  }</button>
    </div>
    <span class="totp-copy-status" data-recovery-download-status aria-live="polite"></span>
  </div>`;
}

/**
 * 筛选可作为默认项的二次验证方式。
 *
 * @param {SecondFactorMethod[]} methods 当前可用二次验证方式。
 * @return {Exclude<SecondFactorMethod, "recoveryCode">[]} 首选验证方法候选列表。
 */
function preferredSecondFactorMethods(
  methods: SecondFactorMethod[],
): Exclude<SecondFactorMethod, "recoveryCode">[] {
  return methods.filter((
    method,
  ): method is Exclude<SecondFactorMethod, "recoveryCode"> =>
    method !== "recoveryCode"
  );
}

/**
 * 选择默认二次验证方式。
 *
 * @param {UserSecuritySettings} securitySettings 用户安全设置。
 * @param {Exclude<SecondFactorMethod, "recoveryCode">[]} methods 首选验证方法候选列表。
 * @return {Exclude<SecondFactorMethod, "recoveryCode"> | undefined} 当前选中首选方式。
 */
function selectedPreferredSecondFactor(
  securitySettings: UserSecuritySettings,
  methods: Exclude<SecondFactorMethod, "recoveryCode">[],
): Exclude<SecondFactorMethod, "recoveryCode"> | undefined {
  return securitySettings.preferredSecondFactor &&
      methods.includes(securitySettings.preferredSecondFactor)
    ? securitySettings.preferredSecondFactor
    : methods[0];
}

/**
 * 生成二次验证方式展示文案。
 *
 * @param {SecondFactorMethod} method 二次验证方式。
 * @param {ReturnType<typeof getMessages>} messages 当前语言文案。
 * @return {string} 展示文案。
 */
function secondFactorMethodLabel(
  method: SecondFactorMethod,
  messages: ReturnType<typeof getMessages>,
): string {
  switch (method) {
    case "email":
      return messages.accountSecondFactorEmail;
    case "passkey":
      return messages.accountSecondFactorPasskey;
    case "recoveryCode":
      return messages.accountSecondFactorRecoveryCode;
    case "totp":
      return messages.accountSecondFactorTotp;
  }
}

/**
 * 生成安全设置保存状态文案。
 *
 * @param {SecuritySettingsStatus} status 保存状态。
 * @param {ReturnType<typeof getMessages>} messages 当前语言文案。
 * @return {string} 状态文案。
 */
function securitySettingsStatusMessage(
  status: SecuritySettingsStatus,
  messages: ReturnType<typeof getMessages>,
): string {
  switch (status.code) {
    case "preferred":
      return messages.accountTwoFactorPreferredUnavailable;
    case "reauth":
      return messages.accountReauthRequired;
    case "unavailable":
      return messages.accountTwoFactorUnavailable;
    case "updated":
      return messages.accountTwoFactorUpdated;
  }
}

/**
 * 生成验证器绑定状态文案。
 *
 * @param status 绑定状态。
 * @param messages 当前语言文案。
 * @return 状态文案。
 */
function totpBindingStatusMessage(
  status: TotpBindingStatus,
  messages: ReturnType<typeof getMessages>,
): string {
  switch (status.code) {
    case "code":
      return messages.accountTotpInvalid;
    case "config":
      return messages.accountTotpConfigMissing;
    case "deleted":
      return messages.accountTotpDeleted;
    case "notFound":
      return messages.accountTotpNotFound;
    case "reauth":
      return messages.accountReauthRequired;
    case "updated":
      return messages.accountTotpUpdated;
  }
}

/**
 * 生成 Passkey 绑定状态文案。
 *
 * @param status Passkey 绑定状态。
 * @param messages 当前语言文案。
 * @return 状态文案。
 */
function passkeyBindingStatusMessage(
  status: PasskeyBindingStatus,
  messages: ReturnType<typeof getMessages>,
): string {
  switch (status.code) {
    case "deleted":
      return messages.accountPasskeyDeleted;
    case "failed":
      return messages.accountPasskeyBindFailed;
    case "notFound":
      return messages.accountPasskeyNotFound;
    case "reauth":
      return messages.accountReauthRequired;
    case "updated":
      return messages.accountPasskeyBound;
  }
}

/**
 * 选择设置页邮箱输入框初始值。
 *
 * @param account 当前账户。
 * @param credentials 已绑定邮箱凭证。
 * @return 初始邮箱地址。
 */
function primaryEmailValue(
  account:
    | Pick<UserAccount, "emailVerified" | "primaryEmail" | "username">
    | undefined,
  credentials: EmailCredential[],
): string {
  if (account?.primaryEmail && account.emailVerified) {
    return account.primaryEmail;
  }

  return verifiedEmailCredentials(credentials)[0]?.email ?? "";
}

/**
 * 筛选并排序已验证邮箱凭证。
 *
 * @param credentials 邮箱凭证列表。
 * @return 已验证邮箱凭证。
 */
function verifiedEmailCredentials(
  credentials: EmailCredential[],
): EmailCredential[] {
  return credentials
    .filter((credential) => credential.verified)
    .toSorted((left, right) => left.email.localeCompare(right.email));
}

/**
 * 渲染 Turnstile 官方脚本。
 *
 * @param siteKey Turnstile site key。
 * @return 启用 Turnstile 时返回脚本 HTML。
 */
function turnstileScriptHtml(siteKey: string | undefined): string {
  return siteKey
    ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
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

/**
 * 渲染设置页邮箱验证使用的 Turnstile 组件。
 *
 * @param siteKey Turnstile site key。
 * @return 启用 Turnstile 时返回组件 HTML。
 */
function turnstileWidgetHtml(siteKey: string | undefined): string {
  return siteKey
    ? `<div class="settings-turnstile cf-turnstile" data-sitekey="${
      escapeHtml(siteKey)
    }" data-response-field-name="${
      escapeHtml(turnstileResponseFieldName)
    }"></div>`
    : "";
}

/**
 * 生成邮箱绑定状态文案。
 *
 * @param status 邮箱绑定状态。
 * @param messages 当前语言文案。
 * @return 状态文案。
 */
function emailBindingStatusMessage(
  status: EmailBindingStatus,
  messages: ReturnType<typeof getMessages>,
): string {
  switch (status.code) {
    case "attempts":
    case "code":
      return messages.accountEmailCodeInvalid;
    case "expired":
      return messages.accountEmailVerificationExpired;
    case "invalid":
      return messages.accountEmailInvalid;
    case "notFound":
      return messages.accountEmailVerificationMissing;
    case "updated":
      return messages.accountEmailUpdated;
  }
}

type AccountStatusField =
  | "action"
  | "confirmPassword"
  | "currentPassword"
  | "displayName"
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
    : field === "displayName"
    ? "data-account-display-name-status"
    : field === "username"
    ? "data-account-username-status"
    : "";

  return `<span
    class="inline-action-status account-field-status"
    ${fieldAttribute}
    ${
    status?.type === "error" && statusField === field
      ? 'data-state="error"'
      : ""
  }
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
    case "displayName":
      return "displayName";
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
): "displayName" | "password" | "username" | undefined {
  if (!status || status.type !== "error") {
    return undefined;
  }

  if (status.mode) {
    return status.mode;
  }

  const field = accountStatusField(status);
  if (field === "displayName") {
    return "displayName";
  }
  if (field === "username") {
    return "username";
  }
  if (field === "confirmPassword" || field === "newPassword") {
    return "password";
  }
  return undefined;
}

function accountStatusMessage(
  status: AccountStatus,
  messages: ReturnType<typeof getMessages>,
) {
  switch (status.code) {
    case "currentPassword":
      return messages.accountPasswordCurrentInvalid;
    case "displayName":
      return messages.accountDisplayNameInvalid;
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
        <h2 id="notification-settings-heading">${
    escapeHtml(messages.notificationSettings)
  }</h2>
        <dl class="settings-list">
          <div>
            ${settingLabel("notifications", messages.notificationProvider)}
            <dd>
              <div class="notification-provider-row">
                <select name="notificationProvider" data-notification-provider-select>
                  ${
    option(
      "webhook",
      settings.notificationProvider,
      messages.notificationWebhook,
    )
  }
                  ${
    option("email", settings.notificationProvider, messages.notificationEmail)
  }
                  ${
    option(
      "disabled",
      settings.notificationProvider,
      messages.notificationDisabled,
    )
  }
                </select>
                <button
                  type="button"
                  class="settings-row-action-button settings-icon-action-button"
                  aria-label="${escapeHtml(messages.testNotify)}"
                  data-tooltip="${escapeHtml(messages.testNotify)}"
                  data-test-notify-button
                  data-test-notify-sending="${
    escapeHtml(messages.testNotifySending)
  }"
                  data-test-notify-failed="${
    escapeHtml(messages.testNotifyFailed)
  }"
                  ${
    settings.notificationProvider === "disabled" ? "hidden" : ""
  }
                >${
    materialSymbolIcon(
      "notifications",
      "settings-row-action-icon",
    )
  }</button>
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
              </div>
            </dd>
          </div>
          <div
            class="notification-option-row"
            data-notification-field="webhook-service"
            data-notification-provider-field="webhook"
          >
            ${settingLabel("webhook", messages.notificationWebhookService)}
            <dd>
              <select name="notificationWebhookService" data-notification-webhook-service-select>
                ${
    notificationWebhookServices.map((service) =>
      option(
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
            ${settingLabel("link", messages.notificationWebhookUrl)}
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
            ${settingLabel("mail", messages.notificationEmailService)}
            <dd>
              <select name="notificationEmailService" data-notification-email-service-select>
                ${
    notificationEmailServices.map((service) =>
      option(
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
    settingLabel("alternate_email", messages.notificationEmailAddress)
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
            ${settingLabel("mail", messages.notificationEmailFrom)}
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
            ${settingLabel("api", messages.notificationEmailApiUrl)}
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
            ${settingLabel("key", messages.notificationEmailApiToken)}
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
            ${settingLabel("dns", messages.notificationSmtpHost)}
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
            ${settingLabel("numbers", messages.notificationSmtpPort)}
            <dd>
              <input
                type="number"
                name="notificationSmtpPort"
                dir="ltr"
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
            ${settingLabel("lock", messages.notificationSmtpSecure)}
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
            ${settingLabel("badge", messages.notificationSmtpUsername)}
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
            ${settingLabel("password", messages.notificationSmtpPassword)}
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
        data-polling-interval-too-short="${
    escapeHtml(messages.pollIntervalTooShort)
  }"
      >
        <h2 id="polling-settings-heading">${
    escapeHtml(messages.pollingSettings)
  }</h2>
        <dl class="settings-list">
          <div>
            ${settingLabel("toggle_on", messages.pollEnabled)}
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
          <div class="polling-option-row" data-polling-field="interval">
            ${settingLabel("timer", messages.pollInterval)}
            <dd>
              <div class="poll-interval-row">
                <div class="poll-interval-control">
                  <input
                    type="number"
                    name="pollIntervalValue"
                    dir="ltr"
                    min="1"
                    step="1"
                    value="${settings.polling.intervalValue}"
                    data-polling-interval-value
                  >
                  <select name="pollIntervalUnit" data-polling-interval-unit>
                    ${
    option("second", settings.polling.intervalUnit, messages.pollIntervalSecond)
  }
                    ${
    option("minute", settings.polling.intervalUnit, messages.pollIntervalMinute)
  }
                    ${
    option("hour", settings.polling.intervalUnit, messages.pollIntervalHour)
  }
                    ${
    option("day", settings.polling.intervalUnit, messages.pollIntervalDay)
  }
                    ${
    option("week", settings.polling.intervalUnit, messages.pollIntervalWeek)
  }
                    ${
    option("month", settings.polling.intervalUnit, messages.pollIntervalMonth)
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
            ${settingLabel("format_list_numbered", messages.pollPostLimit)}
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
            ${settingLabel("sort", messages.pollSort)}
            <dd>
              <select name="pollSort">
                ${
    option("publishTime", settings.polling.sort, messages.pollSortPublishTime)
  }
                ${
    option("smart", settings.polling.sort, messages.pollSortSmart)
  }
                ${
    option("replyTime", settings.polling.sort, messages.pollSortReplyTime)
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
      ${settingLabel("topic", messages.topic)}
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
        <span data-topic-summary data-common-label="${
    escapeHtml(messages.commonTopic)
  }">${escapeHtml(summary)}</span>
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
            ${
    topics.map((topic, index) => renderTopicRuleRow(topic, index, messages))
      .join("")
  }
          </div>
        </div>
      </dd>
      <template data-topic-row-template>
        ${
    renderTopicRuleRow(
      { enabled: true, id: "", keywordRules: [], note: "" },
      "__index__",
      messages,
    )
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
      ${settingLabel("sell", messages.keywords)}
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
    (rows.length > 0 ? rows : [{ keyword: "", locations: matchLocations }])
      .map((rule, index) => renderKeywordRuleRow(rule, index, messages)).join(
        "",
      )
  }
          </div>
        </div>
      </dd>
      <template data-keyword-row-template>
        ${
    renderKeywordRuleRow(
      { keyword: "", locations: matchLocations },
      "__index__",
      messages,
    )
  }
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
function renderTopicRuleHeader(
  messages: ReturnType<typeof getMessages>,
): string {
  return `
    <div class="topic-rule-row topic-rule-head" role="row">
      <div class="rule-drag-header" role="columnheader" aria-hidden="true"></div>
      <label class="checkbox-cell bulk-action-cell" role="columnheader">
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
          data-tooltip="${escapeHtml(messages.selectTopicToDelete)}"
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
      <div class="rule-drag-cell" role="cell">
        ${dragHandleButton(messages.dragRow)}
      </div>
      <label class="checkbox-cell" role="cell">
        <input type="checkbox" data-role="select-topic-row">
      </label>
      <div role="cell">
        <input name="topic_${index}_id" dir="ltr" value="${
    escapeHtml(topic.id)
  }" data-topic-id-input>
      </div>
      <div role="cell">
        <input name="topic_${index}_note" value="${
    escapeHtml(topic.note)
  }" data-topic-note-input>
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
function renderKeywordRuleHeader(
  messages: ReturnType<typeof getMessages>,
): string {
  return `
    <div class="keyword-rule-row keyword-rule-head" role="row">
      <div class="rule-drag-header" role="columnheader" aria-hidden="true"></div>
      <label class="checkbox-cell bulk-action-cell" role="columnheader">
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
          data-tooltip="${escapeHtml(messages.selectKeywordToDelete)}"
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
 * 渲染规则行拖拽手柄按钮。
 *
 * @param label 拖拽按钮的可访问标签。
 * @return 拖拽手柄按钮 HTML。
 */
function dragHandleButton(label: string): string {
  const escapedLabel = escapeHtml(label);

  return `<button
    type="button"
    class="icon-button rule-drag-handle"
    data-rule-drag-handle
    data-tooltip="${escapedLabel}"
    aria-label="${escapedLabel}"
  >${materialSymbolIcon("drag_indicator", "rule-drag-icon")}</button>`;
}

/**
 * 渲染关键词匹配位置表头。
 *
 * @param label 位置展示文案。
 * @param location 匹配位置。
 * @return 匹配位置表头 HTML。
 */
function renderKeywordLocationHeader(
  label: string,
  location: MatchLocation,
): string {
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
      <div class="rule-drag-cell" role="cell">
        ${dragHandleButton(messages.dragRow)}
      </div>
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
  return settings.topics.find((topic) =>
    topic.id === settings.activeKeywordTarget
  );
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
function topicSummary(
  settings: AppSettings,
  activeTopic: TopicRule | undefined,
): string {
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
 * 渲染 select 选项。
 *
 * @param value 选项值。
 * @param current 当前选中值。
 * @param label 选项文案。
 * @return option HTML。
 */
function option(value: string, current: string, label: string): string {
  return `<option value="${escapeHtml(value)}" ${
    value === current ? "selected" : ""
  }>${escapeHtml(label)}</option>`;
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
