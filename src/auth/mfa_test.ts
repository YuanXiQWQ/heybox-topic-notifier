/**
 * @file 本文件验证多因素认证状态机行为。
 */
import {
  allowedSecondFactorMethods,
  assertValidUserSecuritySettings,
  availableSecondFactorMethods,
  completePrimaryAuthentication,
  mfaChallengeVerificationError,
  nextMfaChallengeAttempt,
  normalizePendingMfaChallenge,
  normalizeUserSecuritySettings,
} from "./mfa.ts";
import { assertEquals, assertRejects } from "../test_helpers.ts";
import type {
  EmailCredential,
  PasskeyCredential,
  PendingMfaChallenge,
  TotpCredential,
  UserSecuritySettings,
} from "../models.ts";

Deno.test("availableSecondFactorMethods derives methods from bound credentials", () => {
  const methods = availableSecondFactorMethods({
    emailCredentials: [
      emailCredential("alice@example.com", true),
      emailCredential("unverified@example.com", false),
    ],
    passkeyCredentials: [passkeyCredential()],
    totpCredential: totpCredential(),
  });

  assertEquals(methods, ["email", "totp", "passkey", "recoveryCode"]);
});

Deno.test("allowedSecondFactorMethods excludes the primary credential family", () => {
  const methods = ["email", "passkey", "totp", "recoveryCode"] as const;

  assertEquals(allowedSecondFactorMethods(methods, "email"), [
    "totp",
    "passkey",
    "recoveryCode",
  ]);
  assertEquals(allowedSecondFactorMethods(methods, "passkey"), [
    "email",
    "totp",
    "recoveryCode",
  ]);
  assertEquals(allowedSecondFactorMethods(methods, "password"), [
    "email",
    "totp",
    "passkey",
    "recoveryCode",
  ]);
});

Deno.test("completePrimaryAuthentication returns authenticated when two-factor is off", () => {
  const result = completePrimaryAuthentication({
    availableMethods: ["email"],
    primaryMethod: "password",
    securitySettings: securitySettings(false),
    userId: "alice-id",
  });

  assertEquals(result, { status: "authenticated" });
});

Deno.test("completePrimaryAuthentication creates a pending MFA challenge", () => {
  const result = completePrimaryAuthentication({
    availableMethods: ["email", "totp", "passkey"],
    challengeId: "mfa-challenge-id",
    config: { challengeTtlSeconds: 120 },
    now: new Date("2026-08-01T00:00:00.000Z"),
    primaryMethod: "password",
    securitySettings: securitySettings(true, "totp"),
    userId: "alice-id",
  });

  assertEquals(result.status, "mfa_required");
  if (result.status !== "mfa_required") {
    throw new Error("Expected MFA challenge.");
  }
  assertEquals(result.challenge, {
    allowedMethods: ["totp", "email", "passkey"],
    attempts: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-08-01T00:02:00.000Z",
    id: "mfa-challenge-id",
    primaryMethod: "password",
    userId: "alice-id",
  });
});

Deno.test("completePrimaryAuthentication rejects enabled two-factor without an allowed method", async () => {
  await assertRejects(
    () =>
      Promise.resolve(
        completePrimaryAuthentication({
          availableMethods: ["email"],
          primaryMethod: "email",
          securitySettings: securitySettings(true),
          userId: "alice-id",
        }),
      ),
    "Two-factor authentication requires at least one available method.",
  );
});

Deno.test("assertValidUserSecuritySettings rejects unavailable configurations", async () => {
  await assertRejects(
    () =>
      Promise.resolve(
        assertValidUserSecuritySettings(securitySettings(true), []),
      ),
    "Two-factor authentication cannot be enabled without an available method.",
  );
  await assertRejects(
    () =>
      Promise.resolve(
        assertValidUserSecuritySettings(
          securitySettings(true, "totp"),
          ["email"],
        ),
      ),
    "Preferred two-factor method is not available.",
  );
});

Deno.test("mfaChallengeVerificationError checks expiration attempts and methods", () => {
  const challenge = pendingChallenge({
    attempts: 2,
    allowedMethods: ["email", "totp"],
  });

  assertEquals(
    mfaChallengeVerificationError(
      challenge,
      "email",
      { maxAttempts: 3 },
      new Date("2026-08-01T00:05:00.000Z"),
    ),
    undefined,
  );
  assertEquals(
    mfaChallengeVerificationError(
      challenge,
      "passkey",
      { maxAttempts: 3 },
      new Date("2026-08-01T00:05:00.000Z"),
    ),
    "method",
  );
  assertEquals(
    mfaChallengeVerificationError(
      { ...challenge, attempts: 3 },
      "email",
      { maxAttempts: 3 },
      new Date("2026-08-01T00:05:00.000Z"),
    ),
    "attempts",
  );
  assertEquals(
    mfaChallengeVerificationError(
      challenge,
      "email",
      { maxAttempts: 3 },
      new Date("2026-08-01T00:11:00.000Z"),
    ),
    "expired",
  );
  assertEquals(nextMfaChallengeAttempt(challenge).attempts, 3);
});

Deno.test("MFA normalizers preserve stable defaults", () => {
  assertEquals(
    normalizeUserSecuritySettings(
      {
        preferredSecondFactor:
          "recoveryCode" as unknown as UserSecuritySettings[
            "preferredSecondFactor"
          ],
        twoFactorEnabled: true,
      },
      "alice-id",
    ),
    {
      preferredSecondFactor: undefined,
      twoFactorEnabled: true,
      userId: "alice-id",
    },
  );
  assertEquals(
    normalizePendingMfaChallenge({
      ...pendingChallenge({
        allowedMethods: ["passkey", "email", "email"],
        attempts: -3,
      }),
      primaryMethod: "unknown" as unknown as PendingMfaChallenge[
        "primaryMethod"
      ],
    }),
    {
      ...pendingChallenge({
        allowedMethods: ["email", "passkey"],
        attempts: 0,
      }),
      primaryMethod: "password",
    },
  );
});

/**
 * 创建测试邮箱凭证。
 *
 * @param {string} email 邮箱地址。
 * @param {boolean} verified 是否已验证。
 * @return {EmailCredential} 测试邮箱凭证。
 */
function emailCredential(email: string, verified: boolean): EmailCredential {
  return {
    createdAt: "2026-08-01T00:00:00.000Z",
    email,
    userId: "alice-id",
    verified,
  };
}

/**
 * 创建测试 Passkey 凭证。
 *
 * @return {PasskeyCredential} 测试 Passkey 凭证。
 */
function passkeyCredential(): PasskeyCredential {
  return {
    counter: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    credentialId: "passkey-credential-id",
    publicKey: "public-key",
    userId: "alice-id",
  };
}

/**
 * 创建测试 TOTP 凭证。
 *
 * @return {TotpCredential} 测试 TOTP 凭证。
 */
function totpCredential(): TotpCredential {
  return {
    enabledAt: "2026-08-01T00:00:00.000Z",
    recoveryCodeHashes: ["recovery-code-hash"],
    secretEncrypted: "encrypted-secret",
    userId: "alice-id",
  };
}

/**
 * 创建测试用户安全设置。
 *
 * @param {boolean} enabled 是否启用 2FA。
 * @param {UserSecuritySettings["preferredSecondFactor"]} preferredSecondFactor 偏好的二次验证方式。
 * @return {UserSecuritySettings} 测试用户安全设置。
 */
function securitySettings(
  enabled: boolean,
  preferredSecondFactor?: UserSecuritySettings["preferredSecondFactor"],
): UserSecuritySettings {
  return {
    preferredSecondFactor,
    twoFactorEnabled: enabled,
    userId: "alice-id",
  };
}

/**
 * 创建测试 MFA challenge。
 *
 * @param {Partial<PendingMfaChallenge>} overrides 覆盖字段。
 * @return {PendingMfaChallenge} 测试 MFA challenge。
 */
function pendingChallenge(
  overrides: Partial<PendingMfaChallenge> = {},
): PendingMfaChallenge {
  return {
    allowedMethods: ["email"],
    attempts: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-08-01T00:10:00.000Z",
    id: "mfa-challenge-id",
    primaryMethod: "password",
    userId: "alice-id",
    ...overrides,
  };
}
