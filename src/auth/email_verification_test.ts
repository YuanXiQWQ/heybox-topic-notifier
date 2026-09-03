/**
 * @file 本文件验证邮箱验证码生成、哈希和邮件渲染能力。
 */
import { assertEquals } from "../test_helpers.ts";
import { getMessages } from "../locales/index.ts";
import {
  createEmailVerificationChallenge,
  emailVerificationConfigFromEnv,
  type EmailVerificationEmailMessage,
  emailVerificationEmailMessage,
  generateEmailVerificationCode,
  sendEmailVerificationCode,
  verifyEmailVerificationCode,
} from "./email_verification.ts";

Deno.test("emailVerificationConfigFromEnv reads defaults and overrides", () => {
  const emptyConfig = emailVerificationConfigFromEnv(() => undefined);
  const configured = emailVerificationConfigFromEnv((name) =>
    new Map([
      ["AUTH_EMAIL_CODE_SECRET", "secret"],
      ["AUTH_EMAIL_CODE_TTL_SECONDS", "300"],
      ["AUTH_EMAIL_CODE_MAX_ATTEMPTS", "3"],
    ]).get(name)
  );

  assertEquals(emptyConfig, {
    codeSecret: "",
    codeTtlSeconds: 600,
    maxAttempts: 5,
  });
  assertEquals(configured, {
    codeSecret: "secret",
    codeTtlSeconds: 300,
    maxAttempts: 3,
  });
});

Deno.test("generateEmailVerificationCode returns six digits", () => {
  const code = generateEmailVerificationCode();

  assertEquals(/^[0-9]{6}$/.test(code), true);
});

Deno.test("createEmailVerificationChallenge stores only a hash", async () => {
  const challenge = await createEmailVerificationChallenge({
    code: "123456",
    config: {
      codeSecret: "secret",
      codeTtlSeconds: 600,
      maxAttempts: 5,
    },
    email: "Alice@Example.COM",
    id: "challenge-id",
    now: new Date("2026-08-01T00:00:00.000Z"),
    purpose: "email_binding",
    userId: "alice-id",
  });

  assertEquals(challenge.code, "123456");
  assertEquals(challenge.verification.email, "alice@example.com");
  assertEquals(challenge.verification.codeHash === "123456", false);
  assertEquals(challenge.verification.expiresAt, "2026-08-01T00:10:00.000Z");
  assertEquals(
    await verifyEmailVerificationCode("123456", challenge.verification, {
      codeSecret: "secret",
      codeTtlSeconds: 600,
      maxAttempts: 5,
    }),
    true,
  );
  assertEquals(
    await verifyEmailVerificationCode("654321", challenge.verification, {
      codeSecret: "secret",
      codeTtlSeconds: 600,
      maxAttempts: 5,
    }),
    false,
  );
});

Deno.test("sendEmailVerificationCode renders localized message", async () => {
  const sentMessages: EmailVerificationEmailMessage[] = [];

  await sendEmailVerificationCode((message) => {
    sentMessages.push(message);
    return Promise.resolve();
  }, {
    code: "123456",
    email: "alice@example.com",
    expiresAt: "2099-08-01T00:10:00.000Z",
    locale: "en-US",
    purpose: "primary_login",
  });

  assertEquals(sentMessages.length, 1);
  assertEquals(sentMessages[0].to, "alice@example.com");
  const messages = getMessages("en-US");
  assertEquals(
    sentMessages[0].subject,
    `${messages.appName} · ${messages.authEmailCode}`,
  );
  assertEquals(sentMessages[0].text.includes("123456"), true);
});

Deno.test("emailVerificationEmailMessage renders Chinese by default", () => {
  const message = emailVerificationEmailMessage({
    code: "123456",
    email: "alice@example.com",
    expiresAt: "2099-08-01T00:10:00.000Z",
    locale: "zh-CN",
    purpose: "email_binding",
  });

  const messages = getMessages("zh-CN");
  assertEquals(
    message.subject,
    `${messages.appName} · ${messages.authEmailCode}`,
  );
  assertEquals(message.text.includes("123456"), true);
});

Deno.test("emailVerificationEmailMessage formats expiry with the requested locale", () => {
  const message = emailVerificationEmailMessage({
    code: "123456",
    email: "alice@example.com",
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    locale: "ja-JP",
    purpose: "primary_login",
  });

  assertEquals(message.text.includes("10 分後"), true);
  assertEquals(message.text.includes("分钟内有效"), false);
});
