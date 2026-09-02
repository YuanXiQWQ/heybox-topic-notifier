/**
 * @file 本文件提供多因素认证状态机和挑战规整能力。
 */
import type {
  EmailCredential,
  PasskeyCredential,
  PendingMfaChallenge,
  PrimaryAuthMethod,
  SecondFactorMethod,
  TotpCredential,
  UserSecuritySettings,
} from "../models.ts";

/**
 * MFA challenge 默认有效期秒数。
 */
export const defaultMfaChallengeTtlSeconds = 10 * 60;
/**
 * MFA challenge 默认最大失败次数。
 */
export const defaultMfaMaxAttempts = 5;

/**
 * MFA challenge 配置。
 */
export type MfaChallengeConfig = {
  challengeTtlSeconds: number;
  maxAttempts: number;
};

/**
 * 可用二次验证凭证集合。
 */
export type SecondFactorAvailability = {
  emailCredentials?: readonly EmailCredential[];
  passkeyCredentials?: readonly PasskeyCredential[];
  totpCredential?: TotpCredential;
  totpCredentials?: readonly TotpCredential[];
};

/**
 * 主认证完成后的结果。
 */
export type PrimaryAuthenticationCompletion =
  | { status: "authenticated" }
  | { challenge: PendingMfaChallenge; status: "mfa_required" };

/**
 * 主认证完成逻辑的输入选项。
 */
export type CompletePrimaryAuthenticationOptions = {
  availableMethods: readonly SecondFactorMethod[];
  challengeId?: string;
  config?: Partial<MfaChallengeConfig>;
  now?: Date;
  primaryMethod: PrimaryAuthMethod;
  securitySettings: UserSecuritySettings;
  userId: string;
};

/**
 * MFA challenge 校验错误码。
 */
export type MfaChallengeVerificationError =
  | "attempts"
  | "expired"
  | "method";

/**
 * MFA 配置错误。
 */
export class MfaConfigurationError extends Error {
}

/**
 * 支持的二次验证方法顺序。
 */
const secondFactorMethodOrder: readonly SecondFactorMethod[] = [
  "email",
  "totp",
  "passkey",
  "recoveryCode",
];

/**
 * 支持的主认证方法集合。
 */
const primaryAuthMethods: ReadonlySet<string> = new Set([
  "email",
  "google",
  "passkey",
  "password",
]);

/**
 * 支持的二次验证方法集合。
 */
const secondFactorMethods: ReadonlySet<string> = new Set(
  secondFactorMethodOrder,
);

/**
 * 二次验证默认配置。
 */
const defaultMfaChallengeConfig: MfaChallengeConfig = {
  challengeTtlSeconds: defaultMfaChallengeTtlSeconds,
  maxAttempts: defaultMfaMaxAttempts,
};

/**
 * 从当前凭证状态计算可用二次验证方法。
 *
 * @param {SecondFactorAvailability} availability 当前用户已绑定凭证集合。
 * @return {SecondFactorMethod[]} 可用二次验证方法。
 */
export function availableSecondFactorMethods(
  availability: SecondFactorAvailability,
): SecondFactorMethod[] {
  const totpCredentials = availability.totpCredentials ??
    (availability.totpCredential ? [availability.totpCredential] : []);
  return normalizeSecondFactorMethods([
    ...(hasVerifiedEmailCredential(availability.emailCredentials)
      ? ["email" as const]
      : []),
    ...(totpCredentials.some((credential) => credential.secretEncrypted)
      ? ["totp" as const]
      : []),
    ...((availability.passkeyCredentials?.length ?? 0) > 0
      ? ["passkey" as const]
      : []),
    ...(totpCredentials.some((credential) =>
        credential.recoveryCodeHashes.length > 0
      )
      ? ["recoveryCode" as const]
      : []),
  ]);
}

/**
 * 根据主认证方式排除同一凭证类型，得到本次允许的二次验证方式。
 *
 * @param {readonly SecondFactorMethod[]} methods 可用二次验证方式。
 * @param {PrimaryAuthMethod} primaryMethod 本次主认证方式。
 * @return {SecondFactorMethod[]} 本次允许的二次验证方式。
 */
export function allowedSecondFactorMethods(
  methods: readonly SecondFactorMethod[],
  primaryMethod: PrimaryAuthMethod,
): SecondFactorMethod[] {
  const excludedMethod = secondFactorMethodUsedAsPrimary(primaryMethod);
  return normalizeSecondFactorMethods(methods).filter((method) =>
    method !== excludedMethod
  );
}

/**
 * 完成主认证，必要时创建待完成的 MFA challenge。
 *
 * @param {CompletePrimaryAuthenticationOptions} options 主认证完成选项。
 * @return {PrimaryAuthenticationCompletion} 主认证完成结果。
 */
export function completePrimaryAuthentication(
  options: CompletePrimaryAuthenticationOptions,
): PrimaryAuthenticationCompletion {
  if (!options.securitySettings.twoFactorEnabled) {
    return { status: "authenticated" };
  }

  const allowedMethods = orderedSecondFactorMethods(
    allowedSecondFactorMethods(options.availableMethods, options.primaryMethod),
    options.securitySettings.preferredSecondFactor,
  );
  if (allowedMethods.length === 0) {
    throw new MfaConfigurationError(
      "Two-factor authentication requires at least one available method.",
    );
  }

  const config = normalizedMfaConfig(options.config);
  const now = options.now ?? new Date();
  const createdAtMs = now.getTime();
  return {
    challenge: {
      allowedMethods,
      attempts: 0,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        createdAtMs + config.challengeTtlSeconds * 1000,
      ).toISOString(),
      id: options.challengeId ?? crypto.randomUUID(),
      primaryMethod: options.primaryMethod,
      userId: options.userId,
    },
    status: "mfa_required",
  };
}

/**
 * 校验用户安全设置是否可启用。
 *
 * @param {UserSecuritySettings} settings 用户安全设置。
 * @param {readonly SecondFactorMethod[]} availableMethods 当前可用二次验证方法。
 * @return {void} 设置可用时无返回值。
 */
export function assertValidUserSecuritySettings(
  settings: UserSecuritySettings,
  availableMethods: readonly SecondFactorMethod[],
): void {
  const normalizedMethods = normalizeSecondFactorMethods(availableMethods);
  if (settings.twoFactorEnabled && normalizedMethods.length === 0) {
    throw new MfaConfigurationError(
      "Two-factor authentication cannot be enabled without an available method.",
    );
  }

  if (
    settings.preferredSecondFactor &&
    !normalizedMethods.includes(settings.preferredSecondFactor)
  ) {
    throw new MfaConfigurationError(
      "Preferred two-factor method is not available.",
    );
  }
}

/**
 * 检查 MFA challenge 是否可继续使用。
 *
 * @param {PendingMfaChallenge} challenge 待完成 MFA challenge。
 * @param {SecondFactorMethod} method 准备使用的二次验证方法。
 * @param {Partial<MfaChallengeConfig>} config MFA challenge 配置。
 * @param {Date} now 当前时间。
 * @return {MfaChallengeVerificationError | undefined} 不可用时返回错误码。
 */
export function mfaChallengeVerificationError(
  challenge: PendingMfaChallenge,
  method: SecondFactorMethod,
  config: Partial<MfaChallengeConfig> = {},
  now = new Date(),
): MfaChallengeVerificationError | undefined {
  const normalizedConfig = normalizedMfaConfig(config);
  if (Date.parse(challenge.expiresAt) <= now.getTime()) {
    return "expired";
  }

  if (challenge.attempts >= normalizedConfig.maxAttempts) {
    return "attempts";
  }

  return normalizeSecondFactorMethods(challenge.allowedMethods).includes(method)
    ? undefined
    : "method";
}

/**
 * 记录一次 MFA challenge 失败尝试。
 *
 * @param {PendingMfaChallenge} challenge 待完成 MFA challenge。
 * @return {PendingMfaChallenge} 失败次数增加后的 challenge。
 */
export function nextMfaChallengeAttempt(
  challenge: PendingMfaChallenge,
): PendingMfaChallenge {
  return { ...challenge, attempts: Math.max(0, challenge.attempts) + 1 };
}

/**
 * 规范化用户安全设置。
 *
 * @param {Partial<UserSecuritySettings> | null | undefined} value 待规范化设置。
 * @param {string} userId 用户 ID。
 * @return {UserSecuritySettings} 规范化后的用户安全设置。
 */
export function normalizeUserSecuritySettings(
  value: Partial<UserSecuritySettings> | null | undefined,
  userId: string,
): UserSecuritySettings {
  return {
    preferredSecondFactor: normalizePreferredSecondFactor(
      value?.preferredSecondFactor,
    ),
    twoFactorEnabled: value?.twoFactorEnabled === true,
    userId,
  };
}

/**
 * 规范化待完成 MFA challenge。
 *
 * @param {PendingMfaChallenge} challenge 待完成 MFA challenge。
 * @return {PendingMfaChallenge} 规范化后的 MFA challenge。
 */
export function normalizePendingMfaChallenge(
  challenge: PendingMfaChallenge,
): PendingMfaChallenge {
  return {
    ...challenge,
    allowedMethods: normalizeSecondFactorMethods(challenge.allowedMethods),
    attempts: Math.max(0, Math.floor(Number(challenge.attempts) || 0)),
    primaryMethod: isPrimaryAuthMethod(challenge.primaryMethod)
      ? challenge.primaryMethod
      : "password",
  };
}

/**
 * 判断值是否为支持的二次验证方法。
 *
 * @param {unknown} value 待判断值。
 * @return {boolean} 值是二次验证方法时返回 true。
 */
export function isSecondFactorMethod(
  value: unknown,
): value is SecondFactorMethod {
  return typeof value === "string" && secondFactorMethods.has(value);
}

/**
 * 判断值是否为支持的主认证方法。
 *
 * @param {unknown} value 待判断值。
 * @return {boolean} 值是主认证方法时返回 true。
 */
export function isPrimaryAuthMethod(
  value: unknown,
): value is PrimaryAuthMethod {
  return typeof value === "string" && primaryAuthMethods.has(value);
}

/**
 * 规范化二次验证方法列表。
 *
 * @param {readonly unknown[]} methods 待规范化方法列表。
 * @return {SecondFactorMethod[]} 去重且排序稳定的方法列表。
 */
function normalizeSecondFactorMethods(
  methods: readonly unknown[],
): SecondFactorMethod[] {
  const methodSet = new Set(methods.filter(isSecondFactorMethod));
  return secondFactorMethodOrder.filter((method) => methodSet.has(method));
}

/**
 * 按用户偏好调整二次验证方法顺序。
 *
 * @param {readonly SecondFactorMethod[]} methods 可用方法列表。
 * @param {Exclude<SecondFactorMethod, "recoveryCode"> | undefined} preferredMethod 用户偏好方法。
 * @return {SecondFactorMethod[]} 排序后的方法列表。
 */
function orderedSecondFactorMethods(
  methods: readonly SecondFactorMethod[],
  preferredMethod: Exclude<SecondFactorMethod, "recoveryCode"> | undefined,
): SecondFactorMethod[] {
  const normalizedMethods = normalizeSecondFactorMethods(methods);
  if (!preferredMethod || !normalizedMethods.includes(preferredMethod)) {
    return normalizedMethods;
  }

  return [
    preferredMethod,
    ...normalizedMethods.filter((method) => method !== preferredMethod),
  ];
}

/**
 * 判断主认证方式是否已经使用某个二次验证凭证类型。
 *
 * @param {PrimaryAuthMethod} primaryMethod 主认证方式。
 * @return {SecondFactorMethod | undefined} 需要排除的二次验证方法。
 */
function secondFactorMethodUsedAsPrimary(
  primaryMethod: PrimaryAuthMethod,
): SecondFactorMethod | undefined {
  if (primaryMethod === "email") {
    return "email";
  }

  if (primaryMethod === "passkey") {
    return "passkey";
  }

  return undefined;
}

/**
 * 判断邮箱凭证列表是否包含已验证邮箱。
 *
 * @param {readonly EmailCredential[] | undefined} credentials 邮箱凭证列表。
 * @return {boolean} 存在已验证邮箱时返回 true。
 */
function hasVerifiedEmailCredential(
  credentials: readonly EmailCredential[] | undefined,
): boolean {
  return credentials?.some((credential) => credential.verified) ?? false;
}

/**
 * 规范化用户偏好的二次验证方法。
 *
 * @param {unknown} value 待规范化值。
 * @return {Exclude<SecondFactorMethod, "recoveryCode"> | undefined} 可用偏好方法。
 */
function normalizePreferredSecondFactor(
  value: unknown,
): Exclude<SecondFactorMethod, "recoveryCode"> | undefined {
  return value === "email" || value === "passkey" || value === "totp"
    ? value
    : undefined;
}

/**
 * 规范化 MFA challenge 配置。
 *
 * @param {Partial<MfaChallengeConfig> | undefined} config 待规范化配置。
 * @return {MfaChallengeConfig} 规范化后的配置。
 */
function normalizedMfaConfig(
  config: Partial<MfaChallengeConfig> | undefined,
): MfaChallengeConfig {
  return {
    challengeTtlSeconds: positiveInteger(
      config?.challengeTtlSeconds,
      defaultMfaChallengeConfig.challengeTtlSeconds,
    ),
    maxAttempts: positiveInteger(
      config?.maxAttempts,
      defaultMfaChallengeConfig.maxAttempts,
    ),
  };
}

/**
 * 规范化正整数。
 *
 * @param {unknown} value 待规范化值。
 * @param {number} fallback 兜底值。
 * @return {number} 规范化后的正整数。
 */
function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}
