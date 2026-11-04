/** @file 设置页中敏感账号操作使用的再认证面板和认证链接。 */
import { getMessages } from "../locales/index.ts";
import type { Locale } from "../locales/types.ts";
import type {
  AppSettings,
  EmailCredential,
  PasskeyCredential,
} from "../models.ts";
import { escapeHtml } from "./html.ts";

/**
 * 为账户认证接口追加当前页面语言。
 *
 * @param {string} path 认证接口路径。
 * @param {Locale} locale 当前页面语言。
 * @return {string} 携带语言查询参数的接口路径。
 */
export function localizedAccountPath(path: string, locale: Locale): string {
  const url = new URL(path, "http://settings.local");
  url.searchParams.set("locale", locale);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

/**
 * 渲染内联敏感操作再认证面板。
 *
 * @param {object} options 再认证面板渲染选项。
 * @return {string} 再认证面板 HTML。
 */
export function renderInlineReauthPanel(options: {
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
 * @param {string} panel 再认证面板 HTML。
 * @param {boolean} open 是否立即显示再认证面板。
 * @return {string} 当前面板与后续原地确认使用的模板 HTML。
 */
export function renderSensitiveReauthPanel(
  panel: string,
  open: boolean,
): string {
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
