/**
 * @file 本文件验证 Passkey / WebAuthn 基础封装能力。
 */
import {
  createPasskeyAuthenticationOptions,
  createPasskeyRegistrationOptions,
  normalizePasskeyTransports,
  type PasskeyConfig,
  passkeyConfigFromEnv,
  passkeyCredentialAfterAuthentication,
  passkeyCredentialForVerification,
  passkeyCredentialFromRegistration,
} from "./passkey.ts";
import type { PasskeyCredential } from "../models.ts";
import { base64UrlEncode } from "../security/crypto_utils.ts";
import { assertEquals } from "../test_helpers.ts";

const testPasskeyConfig: PasskeyConfig = {
  challengeTtlSeconds: 300,
  expectedOrigin: "http://localhost:8000",
  rpId: "localhost",
  rpName: "WarmNest",
  timeoutMs: 45_000,
  userVerification: "required",
};

Deno.test("passkeyConfigFromEnv reads defaults and overrides", () => {
  const config = passkeyConfigFromEnv((name) =>
    new Map([
      ["AUTH_PASSKEY_CHALLENGE_TTL_SECONDS", "600"],
      [
        "AUTH_PASSKEY_EXPECTED_ORIGIN",
        "https://app.example.com, https://admin.example.com",
      ],
      ["AUTH_PASSKEY_RP_ID", "example.com"],
      ["AUTH_PASSKEY_RP_NAME", "WarmNest Auth"],
      ["AUTH_PASSKEY_TIMEOUT_MS", "90000"],
      ["AUTH_PASSKEY_USER_VERIFICATION", "preferred"],
    ]).get(name)
  );

  assertEquals(config, {
    challengeTtlSeconds: 600,
    expectedOrigin: ["https://app.example.com", "https://admin.example.com"],
    rpId: "example.com",
    rpName: "WarmNest Auth",
    timeoutMs: 90_000,
    userVerification: "preferred",
  });
});

Deno.test("createPasskeyRegistrationOptions returns browser options and challenge", async () => {
  const now = new Date("2026-08-01T00:00:00.000Z");
  const existingCredential = credential("existing-credential");

  const result = await createPasskeyRegistrationOptions({
    account: {
      displayName: "Alice",
      id: "alice-id",
      primaryEmail: "alice@example.com",
      username: "alice",
    },
    challengeId: "registration-challenge-id",
    config: testPasskeyConfig,
    existingCredentials: [existingCredential],
    now,
  });

  assertEquals(result.optionsJSON.rp.id, "localhost");
  assertEquals(result.optionsJSON.rp.name, "WarmNest");
  assertEquals(result.optionsJSON.user.name, "alice@example.com");
  assertEquals(result.optionsJSON.timeout, 45_000);
  assertEquals(
    result.optionsJSON.authenticatorSelection?.residentKey,
    "required",
  );
  assertEquals(result.optionsJSON.excludeCredentials?.map((item) => item.id), [
    "existing-credential",
  ]);
  assertEquals(result.challenge, {
    allowedCredentialIds: ["existing-credential"],
    attempts: 0,
    challenge: result.optionsJSON.challenge,
    createdAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-08-01T00:05:00.000Z",
    id: "registration-challenge-id",
    purpose: "passkey_registration",
    userId: "alice-id",
  });
});

Deno.test("createPasskeyAuthenticationOptions returns scoped challenge", async () => {
  const now = new Date("2026-08-01T00:00:00.000Z");

  const result = await createPasskeyAuthenticationOptions({
    challengeId: "authentication-challenge-id",
    config: testPasskeyConfig,
    credentials: [credential("credential-a"), credential("credential-b")],
    now,
    purpose: "primary_login",
    userId: "alice-id",
  });

  assertEquals(result.optionsJSON.rpId, "localhost");
  assertEquals(result.optionsJSON.timeout, 45_000);
  assertEquals(result.optionsJSON.allowCredentials?.map((item) => item.id), [
    "credential-a",
    "credential-b",
  ]);
  assertEquals(result.challenge, {
    allowedCredentialIds: ["credential-a", "credential-b"],
    attempts: 0,
    challenge: result.optionsJSON.challenge,
    createdAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-08-01T00:05:00.000Z",
    id: "authentication-challenge-id",
    purpose: "primary_login",
    userId: "alice-id",
  });
});

Deno.test("passkey credential helpers convert stored public keys", () => {
  const stored = credential("credential-id", {
    counter: 7,
    publicKey: base64UrlEncode(new Uint8Array([1, 2, 3, 4])),
    transports: ["usb", "unsupported", "usb"],
  });

  const webauthnCredential = passkeyCredentialForVerification(stored);
  const updated = passkeyCredentialAfterAuthentication(
    stored,
    9,
    new Date("2026-08-01T00:10:00.000Z"),
  );

  assertEquals(webauthnCredential.id, "credential-id");
  assertEquals(Array.from(webauthnCredential.publicKey), [1, 2, 3, 4]);
  assertEquals(webauthnCredential.counter, 7);
  assertEquals(webauthnCredential.transports, ["usb"]);
  assertEquals(updated.counter, 9);
  assertEquals(updated.lastUsedAt, "2026-08-01T00:10:00.000Z");
});

Deno.test("passkeyCredentialFromRegistration stores minimal credential fields", () => {
  const registrationInfo = {
    credential: {
      counter: 3,
      id: "created-credential",
      publicKey: new Uint8Array([4, 5, 6]),
      transports: ["internal"],
    },
    credentialBackedUp: true,
  } as Parameters<typeof passkeyCredentialFromRegistration>[0][
    "registrationInfo"
  ];

  assertEquals(
    passkeyCredentialFromRegistration({
      label: "My laptop",
      now: new Date("2026-08-01T00:00:00.000Z"),
      registrationInfo,
      userId: "alice-id",
    }),
    {
      backedUp: true,
      counter: 3,
      createdAt: "2026-08-01T00:00:00.000Z",
      credentialId: "created-credential",
      label: "My laptop",
      publicKey: base64UrlEncode(new Uint8Array([4, 5, 6])),
      transports: ["internal"],
      userId: "alice-id",
    },
  );
});

Deno.test("normalizePasskeyTransports removes unsupported values and duplicates", () => {
  assertEquals(
    normalizePasskeyTransports(["usb", "unsupported", "usb", "internal"]),
    ["usb", "internal"],
  );
  assertEquals(normalizePasskeyTransports(undefined), undefined);
});

/**
 * 创建测试 Passkey 凭证。
 *
 * @param credentialId Passkey 凭证 ID。
 * @param overrides 覆盖字段。
 * @return 测试 Passkey 凭证。
 */
function credential(
  credentialId: string,
  overrides: Partial<PasskeyCredential> = {},
): PasskeyCredential {
  return {
    backedUp: false,
    counter: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    credentialId,
    publicKey: base64UrlEncode(new Uint8Array([9, 8, 7, 6])),
    transports: ["internal"],
    userId: "alice-id",
    ...overrides,
  };
}
