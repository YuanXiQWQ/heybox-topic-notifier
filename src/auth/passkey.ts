/**
 * @file 本文件提供 Passkey / WebAuthn 配置、挑战生成和响应校验能力。
 */
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import type {
  PasskeyChallengePurpose,
  PasskeyCredential,
  PendingPasskeyChallenge,
  UserAccount,
} from "../models.ts";
import { base64UrlDecode, base64UrlEncode } from "../security/crypto_utils.ts";

/**
 * Passkey 用户验证偏好。
 */
export type PasskeyUserVerification =
  | "discouraged"
  | "preferred"
  | "required";

/**
 * Passkey 运行配置。
 */
export type PasskeyConfig = {
  challengeTtlSeconds: number;
  expectedOrigin: string | string[];
  rpId: string;
  rpName: string;
  timeoutMs: number;
  userVerification: PasskeyUserVerification;
};

/**
 * Passkey 注册选项结果。
 */
export type PasskeyRegistrationOptionsResult = {
  challenge: PendingPasskeyChallenge;
  optionsJSON: PublicKeyCredentialCreationOptionsJSON;
};

/**
 * Passkey 登录选项结果。
 */
export type PasskeyAuthenticationOptionsResult = {
  challenge: PendingPasskeyChallenge;
  optionsJSON: PublicKeyCredentialRequestOptionsJSON;
};

/**
 * 默认 Passkey RP 名称。
 */
export const defaultPasskeyRpName = "蔚蓝社区提醒";
/**
 * 默认 Passkey RP ID。
 */
export const defaultPasskeyRpId = "localhost";
/**
 * 默认 Passkey 期望来源。
 */
export const defaultPasskeyExpectedOrigin = "http://localhost:8000";
/**
 * 默认 Passkey challenge 有效期秒数。
 */
export const defaultPasskeyChallengeTtlSeconds = 5 * 60;
/**
 * 默认 Passkey 浏览器操作超时毫秒数。
 */
export const defaultPasskeyTimeoutMs = 60_000;
/**
 * 默认 Passkey 用户验证策略。
 */
export const defaultPasskeyUserVerification: PasskeyUserVerification =
  "required";

/**
 * 支持的 WebAuthn 传输方式。
 */
const supportedTransports = new Set([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
]);

/**
 * 从环境变量读取 Passkey 配置。
 *
 * @param readEnv 环境变量读取函数。
 * @return Passkey 配置。
 */
export function passkeyConfigFromEnv(
  readEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): PasskeyConfig {
  return {
    challengeTtlSeconds: positiveIntegerFromEnv(
      readEnv,
      "AUTH_PASSKEY_CHALLENGE_TTL_SECONDS",
      defaultPasskeyChallengeTtlSeconds,
    ),
    expectedOrigin: originsFromEnv(readEnv),
    rpId: readEnv("AUTH_PASSKEY_RP_ID")?.trim() || defaultPasskeyRpId,
    rpName: readEnv("AUTH_PASSKEY_RP_NAME")?.trim() || defaultPasskeyRpName,
    timeoutMs: positiveIntegerFromEnv(
      readEnv,
      "AUTH_PASSKEY_TIMEOUT_MS",
      defaultPasskeyTimeoutMs,
    ),
    userVerification: userVerificationFromEnv(readEnv),
  };
}

/**
 * 创建 Passkey 注册选项并返回需要持久化的 challenge。
 *
 * @param input 注册选项输入。
 * @return 浏览器注册参数和待校验 challenge。
 */
export async function createPasskeyRegistrationOptions(input: {
  account: Pick<
    UserAccount,
    "displayName" | "id" | "primaryEmail" | "username"
  >;
  challengeId?: string;
  config: PasskeyConfig;
  existingCredentials?: readonly PasskeyCredential[];
  now?: Date;
}): Promise<PasskeyRegistrationOptionsResult> {
  const optionsJSON = await generateRegistrationOptions({
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: input.config.userVerification,
    },
    excludeCredentials:
      input.existingCredentials?.map(passkeyDescriptorForOptions) ?? [],
    rpID: input.config.rpId,
    rpName: input.config.rpName,
    timeout: input.config.timeoutMs,
    userDisplayName: input.account.displayName ?? input.account.username,
    userID: new TextEncoder().encode(input.account.id),
    userName: input.account.primaryEmail ?? input.account.username,
  });

  return {
    challenge: createPendingPasskeyChallenge({
      allowedCredentialIds: input.existingCredentials?.map((credential) =>
        credential.credentialId
      ) ??
        [],
      challenge: optionsJSON.challenge,
      challengeId: input.challengeId,
      config: input.config,
      now: input.now,
      purpose: "passkey_registration",
      userId: input.account.id,
    }),
    optionsJSON,
  };
}

/**
 * 创建 Passkey 认证选项并返回需要持久化的 challenge。
 *
 * @param input 认证选项输入。
 * @return 浏览器认证参数和待校验 challenge。
 */
export async function createPasskeyAuthenticationOptions(input: {
  challengeId?: string;
  config: PasskeyConfig;
  credentials?: readonly PasskeyCredential[];
  now?: Date;
  purpose: Exclude<PasskeyChallengePurpose, "passkey_registration">;
  userId?: string;
  userVerification?: PasskeyUserVerification;
}): Promise<PasskeyAuthenticationOptionsResult> {
  const credentials = input.credentials ?? [];
  const optionsJSON = await generateAuthenticationOptions({
    allowCredentials: credentials.length > 0
      ? credentials.map(passkeyDescriptorForOptions)
      : undefined,
    rpID: input.config.rpId,
    timeout: input.config.timeoutMs,
    userVerification: input.userVerification ?? input.config.userVerification,
  });

  return {
    challenge: createPendingPasskeyChallenge({
      allowedCredentialIds: credentials.map((credential) =>
        credential.credentialId
      ),
      challenge: optionsJSON.challenge,
      challengeId: input.challengeId,
      config: input.config,
      now: input.now,
      purpose: input.purpose,
      userId: input.userId,
    }),
    optionsJSON,
  };
}

/**
 * 校验 Passkey 注册响应。
 *
 * @param input 注册响应校验输入。
 * @return SimpleWebAuthn 注册校验结果。
 */
export async function verifyPasskeyRegistrationResponse(input: {
  challenge: PendingPasskeyChallenge;
  config: PasskeyConfig;
  response: RegistrationResponseJSON;
}): Promise<VerifiedRegistrationResponse> {
  return await verifyRegistrationResponse({
    expectedChallenge: input.challenge.challenge,
    expectedOrigin: input.config.expectedOrigin,
    expectedRPID: input.config.rpId,
    response: input.response,
  });
}

/**
 * 校验 Passkey 认证响应。
 *
 * @param input 认证响应校验输入。
 * @return SimpleWebAuthn 认证校验结果。
 */
export async function verifyPasskeyAuthenticationResponse(input: {
  challenge: PendingPasskeyChallenge;
  config: PasskeyConfig;
  credential: PasskeyCredential;
  requireUserVerification?: boolean;
  response: AuthenticationResponseJSON;
}): Promise<VerifiedAuthenticationResponse> {
  return await verifyAuthenticationResponse({
    credential: passkeyCredentialForVerification(input.credential),
    expectedChallenge: input.challenge.challenge,
    expectedOrigin: input.config.expectedOrigin,
    expectedRPID: input.config.rpId,
    requireUserVerification: input.requireUserVerification,
    response: input.response,
  });
}

/**
 * 将 SimpleWebAuthn 注册结果转换为可存储的 Passkey 凭证。
 *
 * @param input 凭证转换输入。
 * @return 可写入存储的 Passkey 凭证。
 */
export function passkeyCredentialFromRegistration(input: {
  label?: string;
  now?: Date;
  registrationInfo: NonNullable<
    Extract<VerifiedRegistrationResponse, { verified: true }>[
      "registrationInfo"
    ]
  >;
  userId: string;
}): PasskeyCredential {
  const now = input.now ?? new Date();
  const credential = input.registrationInfo.credential;
  return {
    backedUp: input.registrationInfo.credentialBackedUp,
    counter: Math.max(0, Math.floor(credential.counter)),
    createdAt: now.toISOString(),
    credentialId: credential.id,
    label: input.label,
    publicKey: base64UrlEncode(credential.publicKey),
    transports: normalizePasskeyTransports(credential.transports),
    userId: input.userId,
  };
}

/**
 * 将存储的 Passkey 凭证转换为 SimpleWebAuthn 校验格式。
 *
 * @param credential 存储中的 Passkey 凭证。
 * @return SimpleWebAuthn 校验凭证。
 */
export function passkeyCredentialForVerification(
  credential: PasskeyCredential,
): WebAuthnCredential {
  return {
    counter: Math.max(0, Math.floor(credential.counter)),
    id: credential.credentialId,
    publicKey: base64UrlDecode(credential.publicKey),
    transports: normalizePasskeyTransports(credential.transports),
  };
}

/**
 * 更新 Passkey 凭证使用状态。
 *
 * @param credential 原 Passkey 凭证。
 * @param newCounter WebAuthn 返回的新计数器。
 * @param now 当前时间。
 * @return 更新后的 Passkey 凭证。
 */
export function passkeyCredentialAfterAuthentication(
  credential: PasskeyCredential,
  newCounter: number,
  now = new Date(),
): PasskeyCredential {
  return {
    ...credential,
    counter: Math.max(0, Math.floor(newCounter)),
    lastUsedAt: now.toISOString(),
  };
}

/**
 * 规范化 Passkey 传输方式。
 *
 * @param transports 待规范化的传输方式。
 * @return 去重后的传输方式。
 */
export function normalizePasskeyTransports(
  transports: readonly string[] | undefined,
): AuthenticatorTransportFuture[] | undefined {
  const normalized = Array.from(
    new Set(
      (transports ?? []).filter((transport) =>
        supportedTransports.has(transport)
      ),
    ),
  ) as AuthenticatorTransportFuture[];
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * 生成待持久化的 Passkey challenge。
 *
 * @param input challenge 输入。
 * @return 待完成的 Passkey challenge。
 */
function createPendingPasskeyChallenge(input: {
  allowedCredentialIds: readonly string[];
  challenge: string;
  challengeId?: string;
  config: PasskeyConfig;
  now?: Date;
  purpose: PasskeyChallengePurpose;
  userId?: string;
}): PendingPasskeyChallenge {
  const now = input.now ?? new Date();
  return {
    allowedCredentialIds: Array.from(new Set(input.allowedCredentialIds)),
    attempts: 0,
    challenge: input.challenge,
    createdAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + input.config.challengeTtlSeconds * 1000,
    ).toISOString(),
    id: input.challengeId ?? crypto.randomUUID(),
    purpose: input.purpose,
    userId: input.userId,
  };
}

/**
 * 将已存储凭证转换为浏览器选项描述符。
 *
 * @param credential 已存储 Passkey 凭证。
 * @return 浏览器可用凭证描述符。
 */
function passkeyDescriptorForOptions(credential: PasskeyCredential): {
  id: string;
  transports?: AuthenticatorTransportFuture[];
} {
  return {
    id: credential.credentialId,
    transports: normalizePasskeyTransports(credential.transports),
  };
}

/**
 * 从环境变量读取 Passkey 期望来源。
 *
 * @param readEnv 环境变量读取函数。
 * @return 期望来源。
 */
function originsFromEnv(
  readEnv: (name: string) => string | undefined,
): string | string[] {
  const configured = readEnv("AUTH_PASSKEY_EXPECTED_ORIGIN") ??
    readEnv("AUTH_PASSKEY_ORIGIN") ??
    readEnv("PUBLIC_ORIGIN") ??
    defaultPasskeyExpectedOrigin;
  const origins = configured.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return origins.length > 1
    ? origins
    : origins[0] ?? defaultPasskeyExpectedOrigin;
}

/**
 * 从环境变量读取用户验证偏好。
 *
 * @param readEnv 环境变量读取函数。
 * @return 用户验证偏好。
 */
function userVerificationFromEnv(
  readEnv: (name: string) => string | undefined,
): PasskeyUserVerification {
  const value = readEnv("AUTH_PASSKEY_USER_VERIFICATION")?.trim();
  return value === "discouraged" || value === "preferred" ||
      value === "required"
    ? value
    : defaultPasskeyUserVerification;
}

/**
 * 从环境变量读取正整数。
 *
 * @param readEnv 环境变量读取函数。
 * @param name 环境变量名称。
 * @param fallback 兜底值。
 * @return 正整数。
 */
function positiveIntegerFromEnv(
  readEnv: (name: string) => string | undefined,
  name: string,
  fallback: number,
): number {
  const value = Number(readEnv(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
