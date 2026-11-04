/** @file 统一认证凭证与挑战的存储规范，保持 KV 与 SQL 读取语义一致。 */
import type {
  AuthenticationEvent,
  AuthenticationEventPurpose,
  PasskeyChallengePurpose,
  PasskeyCredential,
  PendingPasskeyChallenge,
  TotpCredential,
} from "../models.ts";

/**
 * 规范化 TOTP 凭证。
 *
 * @param {TotpCredential} credential TOTP 凭证。
 * @param {string} userId 用户 ID。
 * @return {TotpCredential} 规范化凭证。
 */
export function normalizeTotpCredential(
  credential: TotpCredential,
  userId: string,
): TotpCredential {
  return {
    credentialId: typeof credential.credentialId === "string" &&
        credential.credentialId.trim()
      ? credential.credentialId.trim()
      : "legacy",
    enabledAt: typeof credential.enabledAt === "string"
      ? credential.enabledAt
      : "",
    label: typeof credential.label === "string" && credential.label.trim()
      ? credential.label.trim().slice(0, 80)
      : undefined,
    recoveryCodeHashes: Array.isArray(credential.recoveryCodeHashes)
      ? credential.recoveryCodeHashes.filter((value): value is string =>
        typeof value === "string"
      )
      : [],
    secretEncrypted: typeof credential.secretEncrypted === "string"
      ? credential.secretEncrypted
      : "",
    userId,
  };
}

/**
 * 规范化 Passkey 凭证。
 *
 * @param {PasskeyCredential} credential Passkey 凭证。
 * @param {string} userId 用户 ID。
 * @return {PasskeyCredential} 规范化凭证。
 */
export function normalizePasskeyCredential(
  credential: PasskeyCredential,
  userId: string,
): PasskeyCredential {
  const transports = Array.isArray(credential.transports)
    ? Array.from(
      new Set(
        credential.transports.filter((value): value is string =>
          typeof value === "string" && value.trim().length > 0
        ).map((value) => value.trim()),
      ),
    )
    : undefined;
  return {
    backedUp: credential.backedUp === true,
    counter: Math.max(0, Math.floor(Number(credential.counter) || 0)),
    createdAt: typeof credential.createdAt === "string"
      ? credential.createdAt
      : "",
    credentialId: typeof credential.credentialId === "string"
      ? credential.credentialId
      : "",
    label: typeof credential.label === "string" && credential.label.trim()
      ? credential.label.trim()
      : undefined,
    lastUsedAt: typeof credential.lastUsedAt === "string"
      ? credential.lastUsedAt
      : undefined,
    publicKey: typeof credential.publicKey === "string"
      ? credential.publicKey
      : "",
    transports,
    userId,
  };
}

/**
 * 规范化认证事件。
 *
 * @param {AuthenticationEvent} event 认证事件。
 * @param {string} userId 用户 ID。
 * @param {AuthenticationEventPurpose} purpose 认证用途。
 * @return {AuthenticationEvent} 规范化事件。
 */
export function normalizeAuthenticationEvent(
  event: AuthenticationEvent,
  userId: string,
  purpose: AuthenticationEventPurpose,
): AuthenticationEvent {
  return {
    authenticatedAt: typeof event.authenticatedAt === "string"
      ? event.authenticatedAt
      : new Date(0).toISOString(),
    method: isAuthenticationEventMethod(event.method)
      ? event.method
      : "password",
    purpose: isAuthenticationEventPurpose(event.purpose)
      ? event.purpose
      : purpose,
    strength: event.strength === "strong" ? "strong" : "normal",
    userId,
  };
}

/**
 * 判断值是否为认证事件方式。
 *
 * @param {unknown} value 待判断值。
 * @return {boolean} 判断结果。
 */
function isAuthenticationEventMethod(
  value: unknown,
): value is AuthenticationEvent["method"] {
  return value === "email_otp" || value === "google" ||
    value === "passkey" || value === "password" ||
    value === "recovery_code" || value === "totp";
}

/**
 * 判断值是否为认证事件用途。
 *
 * @param {unknown} value 待判断值。
 * @return {boolean} 判断结果。
 */
function isAuthenticationEventPurpose(
  value: unknown,
): value is AuthenticationEventPurpose {
  return value === "primary_login" || value === "reauth" ||
    value === "recovery_codes" || value === "second_factor";
}

/**
 * 规范化 Passkey challenge。
 *
 * @param {PendingPasskeyChallenge} challenge 待处理 challenge。
 * @return {PendingPasskeyChallenge} 规范化 challenge。
 */
export function normalizePendingPasskeyChallenge(
  challenge: PendingPasskeyChallenge,
): PendingPasskeyChallenge {
  const allowedCredentialIds = Array.isArray(challenge.allowedCredentialIds)
    ? challenge.allowedCredentialIds
    : [];
  return {
    ...challenge,
    allowedCredentialIds: Array.from(
      new Set(
        allowedCredentialIds.filter((value) =>
          typeof value === "string" && value.trim().length > 0
        ).map((value) => value.trim()),
      ),
    ),
    attempts: Math.max(0, Math.floor(Number(challenge.attempts) || 0)),
    purpose: isPasskeyChallengePurpose(challenge.purpose)
      ? challenge.purpose
      : "primary_login",
  };
}

/**
 * 判断值是否为支持的 Passkey challenge 用途。
 *
 * @param {unknown} value 待判断值。
 * @return {boolean} 判断结果。
 */
function isPasskeyChallengePurpose(
  value: unknown,
): value is PasskeyChallengePurpose {
  return value === "passkey_registration" || value === "primary_login" ||
    value === "reauth" || value === "second_factor";
}
