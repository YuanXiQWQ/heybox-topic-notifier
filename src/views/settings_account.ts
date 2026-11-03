/** @file 设置页的个人资料、登录方式与两步验证。 */
import { getMessages } from "../locales/index.ts";
import type { Locale } from "../locales/types.ts";
import type {
  AppSettings,
  AuthIdentity,
  EmailCredential,
  PasskeyCredential,
  SecondFactorMethod,
  TotpCredential,
  UserAccount,
  UserSecuritySettings,
} from "../models.ts";
import { turnstileResponseFieldName } from "../auth/turnstile.ts";
import { csrfHiddenInput } from "../security/csrf.ts";
import {
  defaultAvatarUrl,
  escapeHtml,
  formControlAttribute,
  renderSelectOption,
} from "./html.ts";
import {
  authIcon,
  type AuthIconName,
  copyIcon,
  materialSymbolIcon,
} from "./icons.ts";
import {
  localizedAccountPath,
  renderInlineReauthPanel,
  renderSensitiveReauthPanel,
} from "./settings_reauth.ts";

/**
 * 两步验证设置表单 ID，用于避免与验证器绑定表单嵌套。
 */
const securitySettingsFormId = "security-settings-form";

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

/** 渲染账号资料、安全设置与凭据管理所需的当前账号快照。 */
export type AccountSettingsViewOptions = {
  account?:
    & Pick<
      UserAccount,
      "displayName" | "emailVerified" | "primaryEmail" | "username"
    >
    & { id?: string };
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
};

type AccountStatus = {
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

type EmailBindingStatus = {
  code:
    | "attempts"
    | "code"
    | "expired"
    | "invalid"
    | "notFound"
    | "updated";
  type: "error" | "success";
};

type SecuritySettingsStatus = {
  code: "preferred" | "reauth" | "unavailable" | "updated";
  type: "error" | "success";
};

type TotpBindingStatus = {
  code: "code" | "config" | "deleted" | "notFound" | "reauth" | "updated";
  type: "error" | "success";
};

type PasskeyBindingStatus = {
  code: "deleted" | "failed" | "notFound" | "reauth" | "updated";
  type: "error" | "success";
};

type GoogleBindingStatus = {
  code:
    | "alreadyBound"
    | "conflict"
    | "deleted"
    | "failed"
    | "reauth"
    | "updated";
  type: "error" | "success";
};

type TotpSetupView = {
  qrCodeDataUrl: string;
  secretBase32: string;
  secretEncrypted: string;
};

/**
 * 渲染认证设置的图标标签。
 *
 * @param icon 认证设置图标名称。
 * @param label 设置项标签。
 * @param blackForestSlot 可选的彩蛋图标槽位标识。
 * @param dataAttribute 可选的标签数据属性。
 * @return dt 标签 HTML。
 */
function authSettingLabel(
  icon: AuthIconName,
  label: string,
  blackForestSlot?: string,
  dataAttribute?: string,
): string {
  return `<dt class="settings-label-with-icon">${
    authIcon(
      icon,
      "settings-label-icon auth-settings-icon",
      blackForestSlot,
    )
  }<span ${dataAttribute ?? ""}>${escapeHtml(label)}</span></dt>`;
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
 * 渲染已登录账号的登录方式与两步验证设置。
 *
 * @param {AccountSettingsViewOptions} options 当前账号、凭据和验证状态。
 * @return {string} 两组设置面板的 HTML。
 */
export function renderAccountSecuritySettings(
  options: AccountSettingsViewOptions,
): string {
  return `${
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
  }`;
}

/**
 * 渲染账户设置区域。
 *
 * @param {AccountSettingsViewOptions} options 当前账号、凭据和验证状态。
 * @return {string} 账户设置区域 HTML。
 */
export function renderAccountSection(
  options: AccountSettingsViewOptions,
): string {
  const {
    settings,
    account,
    accountStatus: status,
    csrfToken,
    reauthPasswordAvailable: passwordAvailable = false,
    reauthRecentlyVerified: recentlyVerified = false,
  } = options;
  const passkeyAvailable = (options.passkeyCredentials?.length ?? 0) > 0;
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
    <form class="account-avatar-upload-form" method="post" action="${
    localizedAccountPath("/account/avatar", settings.locale)
  }" enctype="multipart/form-data" data-avatar-upload-form data-avatar-upload-error="${
    escapeHtml(messages.accountAvatarUploadFailed)
  }">
      ${csrfHiddenInput(csrfToken)}
      <section class="settings-group account-settings-group" aria-labelledby="account-settings-heading">
        <h2 id="account-settings-heading">${
    escapeHtml(messages.accountSettings)
  }</h2>
        <dl class="settings-list"><div>
          ${
    authSettingLabel(
      "avatar",
      messages.accountAvatar,
      "settings.account.avatar",
    )
  }
          <dd><div class="account-avatar-setting">
            <button class="account-avatar-preview-button" type="button" data-avatar-preview aria-label="${
    escapeHtml(messages.accountAvatar)
  }">
              <span class="account-avatar-risk-wrapper" data-lobotomy-corp-risk-host="settings"><span class="account-avatar account-avatar-preview"><img class="account-avatar-default" src="${
    defaultAvatarUrl(account?.id)
  }" alt="${
    escapeHtml(messages.accountAvatar)
  }"><img class="account-avatar-uploaded" src="/account/avatar" alt="" hidden data-reveal-on-load></span></span>
            </button>
            <label class="account-avatar-picker" data-avatar-dropzone tabindex="0" role="button">
              <input class="account-avatar-file-input" type="file" name="avatar" accept="image/png,image/jpeg,image/gif,image/webp" data-avatar-file-input tabindex="-1">
              <span class="account-avatar-picker-text">${
    escapeHtml(messages.accountAvatarChoose)
  }</span>
              <span class="account-avatar-picker-touch">${
    escapeHtml(messages.accountAvatarSelect)
  }</span>
            </label>
            <span class="inline-action-status" data-avatar-upload-status hidden role="status"></span>
          </div></dd>
        </div></dl>
      </section>
      <dialog class="avatar-crop-dialog" data-avatar-crop-dialog data-avatar-uploading="${
    escapeHtml(messages.accountAvatarUploading)
  }">
        <div class="avatar-crop-header"><h2>${
    escapeHtml(messages.accountAvatarCrop)
  }</h2><button type="button" class="icon-button" data-avatar-crop-cancel aria-label="${
    escapeHtml(messages.accountCancel)
  }">×</button></div>
        <div class="avatar-crop-stage" data-avatar-crop-stage><canvas data-avatar-crop-canvas></canvas><span class="avatar-crop-mask" aria-hidden="true"></span></div>
        <label class="avatar-crop-zoom"><span>${
    escapeHtml(messages.accountAvatarZoom)
  }</span><output data-avatar-crop-zoom-value>100%</output><input type="range" min="1" max="3" value="1" step="0.01" data-avatar-crop-zoom></label>
        <div class="avatar-crop-actions"><button type="button" class="settings-row-action-button settings-icon-action-button" data-avatar-crop-confirm aria-label="${
    escapeHtml(messages.accountAvatarConfirm)
  }" data-tooltip="${escapeHtml(messages.accountAvatarConfirm)}">${
    materialSymbolIcon("check", "settings-row-action-icon")
  }</button></div>
      </dialog>
      <dialog class="avatar-preview-dialog" data-avatar-preview-dialog>
        <button type="button" class="icon-button avatar-preview-close" data-avatar-preview-close aria-label="${
    escapeHtml(messages.accountCancel)
  }">×</button>
        <img data-avatar-preview-image alt="${
    escapeHtml(messages.accountAvatar)
  }">
        <button
          type="button"
          class="avatar-preview-clear-decorations"
          data-avatar-clear-decorations
        >${escapeHtml(messages.accountAvatarClearDecorations)}</button>
      </dialog>
    </form>
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
      data-account-updated="${escapeHtml(messages.accountUpdated)}"
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
      <section class="settings-group account-settings-continuation" aria-label="${
    escapeHtml(messages.accountSettings)
  }">
        <dl class="settings-list">
          <div>
            ${
    authSettingLabel(
      "username",
      messages.accountUsername,
      "settings.account.username",
    )
  }
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
            ${
    authSettingLabel(
      "username",
      messages.accountDisplayName,
      "settings.account.displayName",
      "data-account-display-name-label",
    )
  }
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
      blackForestSlot: "settings.auth.password",
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
      blackForestSlot: "settings.auth.passkey",
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
          ${
    authSettingLabel(
      "email",
      messages.accountEmail,
      "settings.auth.email",
    )
  }
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
              data-human-verification="${
    escapeHtml(messages.authHumanVerificationRequired)
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
  blackForestSlot?: string;
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
          ${
    authSettingLabel(
      options.icon,
      options.label,
      options.blackForestSlot,
    )
  }
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
    blackForestSlot: "settings.auth.google",
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
    data-google-unbind-form
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
 * @param locale 当前页面语言。
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
 * 渲染两步验证设置区域。
 *
 * @param {object} options 两步验证渲染选项。
 * @return {string} 两步验证设置区域 HTML。
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
        <div class="auth-method-row settings-compact-row ${
    securityReauthOpen ? "is-open" : ""
  }">
          ${
    authSettingLabel(
      "two-factor",
      messages.accountTwoFactorToggle,
      "settings.auth.twoFactor",
    )
  }
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
    authSettingLabel(
      "preferred-method",
      messages.accountTwoFactorPreferred,
      "settings.auth.preferredMethod",
    )
  }
          <dd>
            <select
              name="preferredSecondFactor"
              ${preferredDisabled}
              ${formAttribute}
            >
                ${
    preferredMethods.map((method) =>
      renderSelectOption(
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
      blackForestSlot: "settings.auth.authenticator",
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
    blackForestSlot: "settings.auth.recoveryCode",
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
 * 渲染设置页邮箱验证使用的 Turnstile 组件。
 *
 * @param siteKey Turnstile site key。
 * @return 启用 Turnstile 时返回组件 HTML。
 */
function turnstileWidgetHtml(siteKey: string | undefined): string {
  return siteKey
    ? `<div
      class="settings-turnstile cf-turnstile"
      data-turnstile-mode="interaction"
      data-turnstile-widget
      data-sitekey="${escapeHtml(siteKey)}" data-response-field-name="${
      escapeHtml(turnstileResponseFieldName)
    }" data-expired-callback="revealTurnstileWidgets" data-error-callback="revealTurnstileWidgets"></div>`
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
