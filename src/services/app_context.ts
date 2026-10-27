/**
 * @file 本文件负责组装应用运行所需的配置、存储、服务和调度器上下文。
 */
import type { AppSettings } from "../models.ts";
import {
  type TurnstileConfig,
  turnstileConfigFromEnv,
} from "../auth/turnstile.ts";
import { type AltchaConfig, altchaConfigFromEnv } from "../auth/altcha.ts";
import {
  type EmailVerificationConfig,
  emailVerificationConfigFromEnv,
} from "../auth/email_verification.ts";
import {
  type GoogleAuthConfig,
  googleAuthConfigFromEnv,
} from "../auth/google.ts";
import { type PasskeyConfig, passkeyConfigFromEnv } from "../auth/passkey.ts";
import { type ReauthConfig, reauthConfigFromEnv } from "../auth/reauth.ts";
import { type TotpConfig, totpConfigFromEnv } from "../auth/totp.ts";
import { createNotifier } from "./notifier.ts";
import {
  createPollingContext,
  type PollingContext,
} from "./polling_context.ts";
export { defaultAppSettingsFromEnv } from "./default_settings.ts";

/**
 * 应用启动配置。
 */
export type AppConfig = {
  defaultSettings: AppSettings;
  emailVerification: EmailVerificationConfig;
  google: GoogleAuthConfig;
  passkey: PasskeyConfig;
  port: number;
  reauth: ReauthConfig;
  totp: TotpConfig;
  altcha: AltchaConfig;
  turnstile: TurnstileConfig;
};

/**
 * 应用运行时上下文类型。
 */
export type AppContext = ReturnType<typeof createAppContext>;

/**
 * 创建应用运行时上下文。
 *
 * @param {PollingContext} pollingContext 供 HTTP 与定时任务共享的轮询上下文。
 * @return {AppContext} 包含配置、存储、匹配器、通知器、数据源、轮询器和调度器的上下文对象。
 */
export function createAppContext(
  pollingContext: PollingContext = createPollingContext(),
) {
  const config: AppConfig = {
    defaultSettings: pollingContext.defaultSettings,
    emailVerification: emailVerificationConfigFromEnv(),
    google: googleAuthConfigFromEnv(),
    passkey: passkeyConfigFromEnv(),
    port: Number(Deno.env.get("PORT") ?? "8000"),
    reauth: reauthConfigFromEnv(),
    totp: totpConfigFromEnv(),
    altcha: altchaConfigFromEnv(),
    turnstile: turnstileConfigFromEnv(),
  };

  return {
    ...pollingContext,
    config,
    notifier: createNotifier(),
  };
}
