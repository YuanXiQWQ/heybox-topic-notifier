/**
 * @file 本文件验证 Authenticator / TOTP 基础能力。
 */
import {
  base32Decode,
  base32Encode,
  createTotpSecretMaterial,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpCode,
  totpConfigFromEnv,
  totpOtpAuthUri,
  verifyEncryptedTotpCode,
  verifyTotpCode,
} from "./totp.ts";
import { assertEquals, assertRejects } from "../test_helpers.ts";

Deno.test("base32 helpers encode and decode RFC 4648 vectors without padding", () => {
  const vectors = [
    ["", ""],
    ["f", "MY"],
    ["fo", "MZXQ"],
    ["foo", "MZXW6"],
    ["foob", "MZXW6YQ"],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI"],
  ] as const;

  for (const [plain, encoded] of vectors) {
    const bytes = new TextEncoder().encode(plain);
    assertEquals(base32Encode(bytes), encoded);
    assertEquals(new TextDecoder().decode(base32Decode(encoded)), plain);
  }
});

Deno.test("generateTotpCode matches RFC 6238 SHA1 vectors", async () => {
  const secret = new TextEncoder().encode("12345678901234567890");
  const vectors = [
    [59, "94287082"],
    [1_111_111_109, "07081804"],
    [1_111_111_111, "14050471"],
    [1_234_567_890, "89005924"],
    [2_000_000_000, "69279037"],
    [20_000_000_000, "65353130"],
  ] as const;

  for (const [seconds, code] of vectors) {
    assertEquals(
      await generateTotpCode(
        secret,
        { digits: 8, periodSeconds: 30 },
        new Date(seconds * 1000),
      ),
      code,
    );
  }
});

Deno.test("verifyTotpCode accepts current and adjacent configured windows", async () => {
  const secret = new TextEncoder().encode("12345678901234567890");
  const current = new Date(59_000);
  const previousCode = await generateTotpCode(
    secret,
    { digits: 8 },
    new Date(29_000),
  );
  const currentCode = await generateTotpCode(
    secret,
    { digits: 8 },
    current,
  );

  assertEquals(
    await verifyTotpCode(
      currentCode,
      secret,
      { digits: 8, verificationWindow: 0 },
      current,
    ),
    true,
  );
  assertEquals(
    await verifyTotpCode(
      previousCode,
      secret,
      { digits: 8, verificationWindow: 1 },
      current,
    ),
    true,
  );
  assertEquals(
    await verifyTotpCode(
      previousCode,
      secret,
      { digits: 8, verificationWindow: 0 },
      current,
    ),
    false,
  );
});

Deno.test("TOTP secret encryption round-trips and supports encrypted verification", async () => {
  const secret = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const key = "test-totp-encryption-key";
  const encrypted = await encryptTotpSecret(secret, key);
  const decrypted = await decryptTotpSecret(encrypted, key);
  const code = await generateTotpCode(
    secret,
    { verificationWindow: 0 },
    new Date("2026-08-01T00:00:00.000Z"),
  );

  assertEquals(encrypted.startsWith("v1."), true);
  assertEquals(decrypted, secret);
  assertEquals(
    await verifyEncryptedTotpCode(
      code,
      encrypted,
      {
        digits: 6,
        issuer: "Test",
        periodSeconds: 30,
        secretBytes: 20,
        secretEncryptionKey: key,
        verificationWindow: 0,
      },
      new Date("2026-08-01T00:00:00.000Z"),
    ),
    true,
  );
});

Deno.test("createTotpSecretMaterial returns Base32 and encrypted secret", async () => {
  const material = await createTotpSecretMaterial({
    secretBytes: 10,
    secretEncryptionKey: "test-totp-encryption-key",
  });
  const decrypted = await decryptTotpSecret(
    material.secretEncrypted,
    "test-totp-encryption-key",
  );

  assertEquals(base32Decode(material.secretBase32), decrypted);
  assertEquals(decrypted.length, 10);
});

Deno.test("totpOtpAuthUri creates authenticator-compatible URI", () => {
  const uri = totpOtpAuthUri({
    accountName: "alice@example.com",
    digits: 6,
    issuer: "蔚蓝社区提醒",
    periodSeconds: 30,
    secretBase32: "JBSWY3DPEHPK3PXP",
  });

  assertEquals(
    uri,
    "otpauth://totp/%E8%94%9A%E8%93%9D%E7%A4%BE%E5%8C%BA%E6%8F%90%E9%86%92:alice%40example.com?algorithm=SHA1&digits=6&issuer=%E8%94%9A%E8%93%9D%E7%A4%BE%E5%8C%BA%E6%8F%90%E9%86%92&period=30&secret=JBSWY3DPEHPK3PXP",
  );
});

Deno.test("totpConfigFromEnv reads defaults and overrides", () => {
  const config = totpConfigFromEnv((name) =>
    new Map([
      ["AUTH_TOTP_DIGITS", "8"],
      ["AUTH_TOTP_ISSUER", "WarmNest"],
      ["AUTH_TOTP_PERIOD_SECONDS", "45"],
      ["AUTH_TOTP_SECRET_BYTES", "32"],
      ["AUTH_TOTP_SECRET_ENCRYPTION_KEY", "secret-key"],
      ["AUTH_TOTP_VERIFICATION_WINDOW", "2"],
    ]).get(name)
  );

  assertEquals(config, {
    digits: 8,
    issuer: "WarmNest",
    periodSeconds: 45,
    secretBytes: 32,
    secretEncryptionKey: "secret-key",
    verificationWindow: 2,
  });
});

Deno.test("TOTP helpers reject invalid secret inputs", async () => {
  await assertRejects(
    () =>
      Promise.resolve(
        totpOtpAuthUri({
          accountName: "alice@example.com",
          issuer: "Test",
          secretBase32: "not-valid!",
        }),
      ),
    "Invalid Base32 secret.",
  );
  await assertRejects(
    () => encryptTotpSecret(new Uint8Array([1]), ""),
    "TOTP secret encryption key is required.",
  );
});
