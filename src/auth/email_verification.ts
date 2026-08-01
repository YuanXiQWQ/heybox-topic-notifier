/**
 * @file 本文件提供邮箱验证码生成、哈希校验和邮件内容渲染能力。
 */
import type {
  EmailVerificationPurpose,
  PendingEmailVerification,
} from "../models.ts";
import type { Locale } from "../locales/types.ts";
import { getMessages } from "../locales/index.ts";
import {
  base64UrlEncode,
  constantTimeEquals,
} from "../security/crypto_utils.ts";
import { normalizeEmailAddress } from "./email.ts";

/**
 * 默认邮箱验证码有效期秒数。
 */
const defaultEmailVerificationTtlSeconds = 10 * 60;

/**
 * 默认邮箱验证码最多尝试次数。
 */
const defaultEmailVerificationMaxAttempts = 5;

/**
 * 邮箱验证码位数。
 */
const emailVerificationCodeLength = 6;

/**
 * 六位数字验证码空间大小。
 */
const emailVerificationCodeSpace = 10 ** emailVerificationCodeLength;

/**
 * Uint32 取样空间大小。
 */
const uint32SampleSpace = 2 ** 32;

/**
 * 为避免取模偏差而使用的最大可接受随机数。
 */
const maxUnbiasedEmailCodeRandomValue = Math.floor(
  uint32SampleSpace / emailVerificationCodeSpace,
) * emailVerificationCodeSpace;

/**
 * 邮箱验证码配置。
 */
export type EmailVerificationConfig = {
  codeSecret: string;
  codeTtlSeconds: number;
  maxAttempts: number;
};

/**
 * 邮箱验证码邮件消息。
 */
export type EmailVerificationEmailMessage = {
  html: string;
  subject: string;
  text: string;
  to: string;
};

/**
 * 邮箱验证码邮件发送函数。
 */
export type EmailVerificationEmailSender = (
  message: EmailVerificationEmailMessage,
) => Promise<void>;

/**
 * 邮箱验证码发送请求。
 */
export type EmailVerificationDelivery = {
  code: string;
  email: string;
  expiresAt: string;
  locale: Locale;
  purpose: EmailVerificationPurpose;
};

/**
 * 邮箱验证码挑战创建选项。
 */
export type EmailVerificationChallengeOptions = {
  code?: string;
  config: EmailVerificationConfig;
  email: string;
  id?: string;
  now?: Date;
  purpose: EmailVerificationPurpose;
  userId?: string;
};

/**
 * 邮箱验证码挑战创建结果。
 */
export type EmailVerificationChallenge = {
  code: string;
  verification: PendingEmailVerification;
};

/**
 * 邮箱验证码配置错误。
 */
export class EmailVerificationConfigError extends Error {
}

/**
 * 邮箱验证码输入错误。
 */
export class EmailVerificationValidationError extends Error {
}

/**
 * 从环境变量读取邮箱验证码配置。
 *
 * @param readEnv 环境变量读取函数。
 * @return 邮箱验证码配置。
 */
export function emailVerificationConfigFromEnv(
  readEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): EmailVerificationConfig {
  return {
    codeSecret: readEnv("AUTH_EMAIL_CODE_SECRET") ?? "",
    codeTtlSeconds: positiveIntegerFromEnv(
      readEnv,
      "AUTH_EMAIL_CODE_TTL_SECONDS",
      defaultEmailVerificationTtlSeconds,
    ),
    maxAttempts: positiveIntegerFromEnv(
      readEnv,
      "AUTH_EMAIL_CODE_MAX_ATTEMPTS",
      defaultEmailVerificationMaxAttempts,
    ),
  };
}

/**
 * 创建邮箱验证码挑战。
 *
 * @param options 邮箱验证码挑战创建选项。
 * @return 验证码明文和待保存的验证码挑战。
 */
export async function createEmailVerificationChallenge(
  options: EmailVerificationChallengeOptions,
): Promise<EmailVerificationChallenge> {
  const codeSecret = options.config.codeSecret.trim();
  if (!codeSecret) {
    throw new EmailVerificationConfigError(
      "Email verification code secret is required.",
    );
  }

  const email = normalizeEmailAddress(options.email);
  if (!email) {
    throw new EmailVerificationValidationError("Invalid email address.");
  }

  const code = options.code ?? generateEmailVerificationCode();
  const normalizedCode = normalizeEmailVerificationCode(code);
  if (!normalizedCode) {
    throw new EmailVerificationValidationError(
      "Invalid email verification code.",
    );
  }

  const now = options.now ?? new Date();
  const id = options.id ?? crypto.randomUUID();
  const expiresAt = new Date(
    now.getTime() + options.config.codeTtlSeconds * 1000,
  ).toISOString();

  return {
    code: normalizedCode,
    verification: {
      attempts: 0,
      codeHash: await hashEmailVerificationCode(id, normalizedCode, codeSecret),
      createdAt: now.toISOString(),
      email,
      expiresAt,
      id,
      purpose: options.purpose,
      userId: options.userId,
    },
  };
}

/**
 * 生成六位数字邮箱验证码。
 *
 * @return 六位数字验证码。
 */
export function generateEmailVerificationCode(): string {
  const sample = new Uint32Array(1);

  while (true) {
    crypto.getRandomValues(sample);
    if (sample[0] < maxUnbiasedEmailCodeRandomValue) {
      return String(sample[0] % emailVerificationCodeSpace).padStart(
        emailVerificationCodeLength,
        "0",
      );
    }
  }
}

/**
 * 校验邮箱验证码是否匹配待验证挑战。
 *
 * @param code 用户提交的验证码。
 * @param verification 待验证挑战。
 * @param config 邮箱验证码配置。
 * @return 验证码匹配时返回 true。
 */
export async function verifyEmailVerificationCode(
  code: string,
  verification: PendingEmailVerification,
  config: EmailVerificationConfig,
): Promise<boolean> {
  const normalizedCode = normalizeEmailVerificationCode(code);
  if (!normalizedCode || !config.codeSecret.trim()) {
    return false;
  }

  return constantTimeEquals(
    verification.codeHash,
    await hashEmailVerificationCode(
      verification.id,
      normalizedCode,
      config.codeSecret.trim(),
    ),
  );
}

/**
 * 发送邮箱验证码邮件。
 *
 * @param sender 邮件发送函数。
 * @param delivery 邮箱验证码发送请求。
 * @return 发送完成后的 Promise。
 */
export async function sendEmailVerificationCode(
  sender: EmailVerificationEmailSender,
  delivery: EmailVerificationDelivery,
): Promise<void> {
  await sender(emailVerificationEmailMessage(delivery));
}

/**
 * 渲染邮箱验证码邮件。
 *
 * @param delivery 邮箱验证码发送请求。
 * @return 邮箱验证码邮件消息。
 */
export function emailVerificationEmailMessage(
  delivery: EmailVerificationDelivery,
): EmailVerificationEmailMessage {
  const messages = getMessages(delivery.locale);
  const minutes = Math.max(
    1,
    Math.ceil((Date.parse(delivery.expiresAt) - Date.now()) / 60_000),
  );
  const expiresIn = new Intl.RelativeTimeFormat(delivery.locale, {
    numeric: "always",
    style: "long",
  }).format(minutes, "minute");
  const subject = `${messages.appName} · ${messages.authEmailCode}`;
  const text = `${messages.authEmailCode}: ${delivery.code}\n${expiresIn}`;

  return {
    html: text.split("\n").map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
    subject,
    text,
    to: delivery.email,
  };
}

/**
 * 判断值是否为合法邮箱验证码用途。
 *
 * @param value 待判断值。
 * @return 合法时返回 true。
 */
export function isEmailVerificationPurpose(
  value: string,
): value is EmailVerificationPurpose {
  return value === "email_binding" ||
    value === "primary_login" ||
    value === "reauth" ||
    value === "second_factor";
}

/**
 * 规范化邮箱验证码。
 *
 * @param value 原始验证码。
 * @return 合法时返回六位数字验证码，不合法时返回 undefined。
 */
function normalizeEmailVerificationCode(value: string): string | undefined {
  const code = value.trim();
  return /^[0-9]{6}$/.test(code) ? code : undefined;
}

/**
 * 哈希邮箱验证码。
 *
 * @param id 验证码挑战 ID。
 * @param code 六位数字验证码。
 * @param secret 服务端验证码密钥。
 * @return Base64URL 编码的验证码 HMAC。
 */
async function hashEmailVerificationCode(
  id: string,
  code: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${id}:${code}`),
  );

  return base64UrlEncode(new Uint8Array(signature));
}

/**
 * 从环境变量读取正整数配置。
 *
 * @param readEnv 环境变量读取函数。
 * @param name 环境变量名称。
 * @param fallback 兜底值。
 * @return 正整数配置。
 */
function positiveIntegerFromEnv(
  readEnv: (name: string) => string | undefined,
  name: string,
  fallback: number,
): number {
  const value = Number(readEnv(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * 转义 HTML 文本。
 *
 * @param value 原始文本。
 * @return 转义后的 HTML 文本。
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
