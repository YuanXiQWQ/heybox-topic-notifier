/**
 * @file 本文件验证自建 ALTCHA 挑战的配置、生成与服务端校验行为。
 */
import { assertEquals } from "../test_helpers.ts";
import {
  altchaConfigFromEnv,
  altchaConfigured,
  createAltchaChallenge,
  verifyAltchaPayload,
} from "./altcha.ts";
import { solveChallenge } from "npm:altcha-lib@^2.4.0";
import { deriveKey as derivePbkdf2Key } from "npm:altcha-lib@^2.4.0/algorithms/pbkdf2";

/**
 * ALTCHA 测试配置。
 */
const testConfig = {
  challengeCost: 100,
  challengeTtlSeconds: 600,
  enabled: true,
  hmacKey: "test-altcha-hmac-key-with-at-least-thirty-two-characters",
};

Deno.test("altchaConfigFromEnv defaults to a disabled configuration", () => {
  const config = altchaConfigFromEnv(() => undefined);

  assertEquals(config.enabled, false);
  assertEquals(config.challengeCost, 1000);
  assertEquals(config.challengeTtlSeconds, 600);
  assertEquals(altchaConfigured(config), false);
});

Deno.test("ALTCHA verifies a signed proof-of-work payload", async () => {
  const challenge = await createAltchaChallenge(testConfig);
  const solution = await solveChallenge({
    challenge,
    deriveKey: derivePbkdf2Key,
  });
  if (!solution) throw new Error("Could not solve ALTCHA test challenge.");

  const result = await verifyAltchaPayload(
    btoa(JSON.stringify({ challenge, solution })),
    testConfig,
  );

  assertEquals(result.success, true);
});

Deno.test("ALTCHA rejects a tampered proof-of-work payload", async () => {
  const challenge = await createAltchaChallenge(testConfig);
  const solution = await solveChallenge({
    challenge,
    deriveKey: derivePbkdf2Key,
  });
  if (!solution) throw new Error("Could not solve ALTCHA test challenge.");
  solution.counter += 1;

  const result = await verifyAltchaPayload(
    btoa(JSON.stringify({ challenge, solution })),
    testConfig,
  );

  assertEquals(result.success, false);
});
