/**
 * @file 本文件提供登录、注册、会话读取和认证中间件。
 */
import { Hono } from "@hono/hono";
import type { Context, MiddlewareHandler } from "@hono/hono";
import { getMessages } from "./locales/index.ts";
import { languageOptions, languageSwitcherLabel } from "./locales/languages.ts";
import { isRtlLocale, type Locale, type Messages } from "./locales/types.ts";
import type {
  AuthIdentity,
  EmailCredential,
  EmailVerificationPurpose,
  PasskeyChallengePurpose,
  PasskeyCredential,
  PasswordCredential,
  PendingEmailVerification,
  PendingMfaChallenge,
  PendingPasskeyChallenge,
  PrimaryAuthMethod,
  SecondFactorMethod,
  UserAccount,
} from "./models.ts";
import {
  csrfFieldName,
  csrfForbiddenResponse,
  csrfHeaderName,
  csrfHiddenInput,
  csrfTokenForRequest,
  submittedCsrfToken,
  verifyCsrfToken,
  withCsrfCookie,
} from "./security/csrf.ts";
import { auditText, logSecurityAuditEvent } from "./security/audit_log.ts";
import {
  base64UrlEncode,
  constantTimeEquals,
} from "./security/crypto_utils.ts";
import {
  clientRateLimitIdentifier,
  publicRateLimitPolicies,
  rateLimitExceededResponseFor,
} from "./security/rate_limit.ts";
import type { createKvStorage } from "./storage/kv.ts";
import { languageTextIcon } from "./views/icons.ts";
import {
  clearSessionCookie,
  defaultSessionCookieName,
  deleteSessionForCookie,
  readAuthSession,
  redirectWithSession,
} from "./auth/session.ts";
import {
  type TurnstileConfig,
  type TurnstileFetch,
  turnstileResponseFieldName,
  verifyTurnstileToken,
} from "./auth/turnstile.ts";
import { normalizeEmailAddress } from "./auth/email.ts";
import {
  createEmailVerificationChallenge,
  type EmailVerificationConfig,
  EmailVerificationConfigError,
  type EmailVerificationEmailSender,
  EmailVerificationValidationError,
  isEmailVerificationPurpose,
  sendEmailVerificationCode,
  verifyEmailVerificationCode,
} from "./auth/email_verification.ts";
import {
  type GoogleAuthConfig,
  GoogleAuthConfigError,
  googleAuthConfigFromEnv,
  type GoogleIdentityClaims,
  GoogleIdTokenVerificationError,
  type GoogleJwksFetch,
  verifyGoogleIdToken,
} from "./auth/google.ts";
import {
  type TotpConfig,
  TotpConfigError,
  verifyEncryptedTotpCode,
} from "./auth/totp.ts";
import {
  createPasskeyAuthenticationOptions,
  type PasskeyAuthenticationOptionsResult,
  type PasskeyConfig,
  passkeyConfigFromEnv,
  passkeyCredentialAfterAuthentication,
  verifyPasskeyAuthenticationResponse,
} from "./auth/passkey.ts";
import {
  availableSecondFactorMethods,
  completePrimaryAuthentication,
  isSecondFactorMethod,
  type MfaChallengeConfig,
  mfaChallengeVerificationError,
  MfaConfigurationError,
  nextMfaChallengeAttempt,
} from "./auth/mfa.ts";

export { readAuthSession } from "./auth/session.ts";
export type { AuthSession } from "./auth/session.ts";

/**
 * 认证模块使用的存储类型。
 */
type Storage = ReturnType<typeof createKvStorage>;

/**
 * Passkey 认证响应校验函数。
 */
type PasskeyAuthenticationVerifier = typeof verifyPasskeyAuthenticationResponse;

/**
 * 认证模块配置选项。
 */
export type AuthOptions = {
  cookieName?: string;
  exemptPaths?: string[];
  loginLockoutSeconds?: number;
  maxLoginFailures?: number;
  defaultLocale?: Locale;
  google?: GoogleAuthConfig;
  googleJwksFetch?: GoogleJwksFetch;
  loginPath?: string;
  mfa?: Partial<MfaChallengeConfig>;
  passkey?: PasskeyConfig;
  passkeyAuthenticationVerifier?: PasskeyAuthenticationVerifier;
  registerPath?: string;
  emailVerification?: EmailVerificationConfig;
  sendEmailVerificationEmail?: EmailVerificationEmailSender;
  sessionMaxAgeSeconds?: number;
  totp?: TotpConfig;
  turnstile?: TurnstileConfig;
  turnstileFetch?: TurnstileFetch;
};

/**
 * 规范化后的认证配置。
 */
type AuthConfig = {
  cookieName: string;
  exemptPaths: Set<string>;
  loginLockoutSeconds: number;
  maxLoginFailures: number;
  defaultLocale: Locale;
  emailVerification: EmailVerificationConfig;
  google: GoogleAuthConfig;
  googleJwksFetch?: GoogleJwksFetch;
  loginPath: string;
  mfa?: Partial<MfaChallengeConfig>;
  passkey: PasskeyConfig;
  passkeyAuthenticationVerifier: PasskeyAuthenticationVerifier;
  registerPath: string;
  sendEmailVerificationEmail?: EmailVerificationEmailSender;
  sessionMaxAgeSeconds: number;
  totp: TotpConfig;
  turnstile: TurnstileConfig;
  turnstileFetch?: TurnstileFetch;
};

/**
 * 默认登录 Cookie 名称。
 */
const defaultCookieName = defaultSessionCookieName;
/**
 * 默认关闭的人机验证配置。
 */
const defaultTurnstileConfig: TurnstileConfig = {
  enabled: false,
  secretKey: "",
  siteKey: "",
};
/**
 * 默认邮箱验证码配置。
 */
const defaultEmailVerificationConfig: EmailVerificationConfig = {
  codeSecret: "",
  codeTtlSeconds: 10 * 60,
  maxAttempts: 5,
};
/**
 * 默认验证器动态码配置。
 */
const defaultTotpConfig: TotpConfig = {
  digits: 6,
  issuer: "",
  periodSeconds: 30,
  secretBytes: 20,
  secretEncryptionKey: "",
  verificationWindow: 1,
};
/**
 * 默认 Google 认证配置。
 */
const defaultGoogleAuthConfig: GoogleAuthConfig = googleAuthConfigFromEnv(
  () => undefined,
);
/**
 * 默认 Passkey 配置。
 */
const defaultPasskeyConfig: PasskeyConfig = passkeyConfigFromEnv(
  () => undefined,
);
/**
 * 默认登录路径。
 */
const defaultLoginPath = "/login";
/**
 * 默认注册路径。
 */
const defaultRegisterPath = "/register";
/**
 * 默认会话有效期秒数。
 */
const defaultSessionMaxAgeSeconds = 60 * 60 * 24 * 30;
/**
 * 默认登录失败锁定时长（秒）。
 */
const defaultLoginLockoutSeconds = 60 * 15;
/**
 * 默认允许的连续登录失败次数。
 */
const defaultMaxLoginFailures = 5;
/**
 * 密码 PBKDF2 迭代次数。
 */
const passwordIterations = 210_000;
/**
 * 标记认证页语言已被用户显式切换的查询参数。
 */
const authLocaleChangedParam = "localeChanged";
/**
 * 显式语言切换查询参数使用的固定值。
 */
const authLocaleChangedValue = "1";
/**
 * 登录页提示需要进行人机验证的查询参数名。
 */
const authTurnstileRequiredParam = "turnstile";
/**
 * 登录页提示需要进行人机验证的查询参数值。
 */
const authTurnstileRequiredValue = "1";
/**
 * 登录失败多少次后要求人机验证。
 */
const turnstileLoginFailureThreshold = 2;
/**
 * 邮箱验证码发送接口路径。
 */
const emailVerificationPath = "/auth/email-verifications";
/**
 * Google credential 登录接口路径。
 */
const googleCredentialPath = "/auth/google";
/**
 * Passkey 登录 options 接口路径。
 */
const passkeyLoginOptionsPath = "/auth/passkeys/login-options";
/**
 * Passkey 登录校验接口路径。
 */
const passkeyLoginPath = "/auth/passkeys/login";
/**
 * Passkey 二次验证 options 接口路径。
 */
const passkeyMfaOptionsPath = "/auth/passkeys/mfa-options";
/**
 * Passkey 二次验证校验接口路径。
 */
const passkeyMfaPath = "/auth/passkeys/mfa";
/**
 * MFA 挑战页面路径。
 */
const mfaPath = "/mfa";
/**
 * Passkey challenge 最大校验失败次数。
 */
const passkeyChallengeMaxAttempts = 5;

/**
 * 创建认证中间件。
 *
 * @param storage 应用存储。
 * @param options 认证配置选项。
 * @return Hono 中间件。
 */
export function createAuthMiddleware(
  storage: Storage,
  options: AuthOptions = {},
): MiddlewareHandler {
  const config = authConfig(options);

  return async (c, next) => {
    const url = new URL(c.req.url);
    if (config.exemptPaths.has(url.pathname)) {
      await next();
      return;
    }

    const session = await readAuthSession(
      c.req.header("cookie"),
      storage,
      options,
    );
    if (session) {
      await next();
      return;
    }

    const loginUrl = new URL(config.loginPath, url);
    const locale = authPageLocale(url, c.req.header("accept-language"), config);
    loginUrl.searchParams.set("locale", locale);
    if (c.req.method === "GET") {
      loginUrl.searchParams.set("returnTo", pathWithSearch(url));
    }
    return c.redirect(pathWithSearch(loginUrl), 303);
  };
}

/**
 * 创建登录、注册和退出路由。
 *
 * @param storage 应用存储。
 * @param options 认证配置选项。
 * @return 认证路由应用。
 */
export function createAuthRoutes(
  storage: Storage,
  options: AuthOptions = {},
): Hono {
  const config = authConfig(options);
  const app = new Hono();

  app.get(config.loginPath, (c) => {
    const url = new URL(c.req.url);
    const locale = authPageLocale(url, c.req.header("accept-language"), config);
    const syncLocale = shouldSyncAuthLocale(url);
    const messages = getMessages(locale);
    const csrf = csrfTokenForRequest(c.req.header("cookie"), c.req.url);
    return withCsrfCookie(
      c.html(renderAuthPage({
        action: authPagePath(config.loginPath, locale, {
          [authLocaleChangedParam]: syncLocale
            ? authLocaleChangedValue
            : undefined,
        }),
        csrfToken: csrf.token,
        emailTurnstileSiteKey: turnstileSiteKey(config),
        error: loginErrorMessage(url.searchParams.get("error"), messages),
        googleClientId: googleClientId(config),
        heading: messages.authLogin,
        locale,
        messages,
        mode: "login",
        returnTo: safeReturnTo(url.searchParams.get("returnTo")),
        submitLabel: messages.authLogin,
        syncLocale,
        turnstileSiteKey: loginTurnstileSiteKey(url, config),
      })),
      csrf,
    );
  });

  app.post(config.loginPath, async (c) => {
    const url = new URL(c.req.url);
    const form = await c.req.parseBody();
    if (
      !verifyCsrfToken(
        c.req.header("cookie"),
        submittedCsrfToken(form, c.req.header(csrfHeaderName)),
      )
    ) {
      return csrfForbiddenResponse(c.req.raw);
    }
    const returnTo = safeReturnTo(String(form.returnTo ?? "/"));
    const locale = authPageLocale(url, c.req.header("accept-language"), config);
    const syncLocale = shouldSyncAuthLocale(url);
    if (String(form.authMethod ?? "password") === "email") {
      return await handleEmailLogin(c, storage, config, form, {
        locale,
        returnTo,
        syncLocale,
      });
    }

    const username = normalizeUsername(String(form.username ?? ""));
    const password = String(form.password ?? "");
    const canRateLimit = validUsername(username);
    const loginFailure = canRateLimit
      ? await storage.getLoginFailure(username)
      : undefined;

    if (isLoginLocked(loginFailure)) {
      logSecurityAuditEvent({
        code: "login_locked",
        details: { username: auditText(username) },
        level: "warn",
        message: "登录已处于临时锁定状态，已拒绝本次尝试。",
        request: c.req.raw,
      });

      return loginRateLimitedRedirect(
        config.loginPath,
        returnTo,
        locale,
        syncLocale,
      );
    }

    if (loginRequiresTurnstile(loginFailure, config)) {
      const humanVerificationErrors = await humanVerificationErrorCodes(
        c.req.raw,
        form,
        config,
      );
      if (humanVerificationErrors) {
        return c.redirect(
          authPagePath(config.loginPath, locale, {
            error: "humanVerification",
            returnTo,
            [authLocaleChangedParam]: syncLocale
              ? authLocaleChangedValue
              : undefined,
            [authTurnstileRequiredParam]: authTurnstileRequiredValue,
          }),
          303,
        );
      }
    }

    const account = await storage.getAccountByUsername(username);

    if (
      !account || !(await verifyAccountPassword(password, account, storage))
    ) {
      const failure = canRateLimit
        ? await storage.recordLoginFailure(
          username,
          config.maxLoginFailures,
          config.loginLockoutSeconds * 1000,
        )
        : undefined;
      if (isLoginLocked(failure)) {
        logSecurityAuditEvent({
          code: "login_lockout_triggered",
          details: {
            failures: failure?.failures ?? "",
            username: auditText(username),
          },
          level: "warn",
          message: "登录失败次数过多，已触发临时锁定。",
          request: c.req.raw,
        });

        return loginRateLimitedRedirect(
          config.loginPath,
          returnTo,
          locale,
          syncLocale,
        );
      }

      logSecurityAuditEvent({
        code: "login_failed",
        details: {
          failures: failure?.failures ?? "",
          username: auditText(username),
        },
        level: "warn",
        message: "登录失败：用户名或密码不正确。",
        request: c.req.raw,
      });

      return c.redirect(
        authPagePath(config.loginPath, locale, {
          error: "invalid",
          returnTo,
          [authLocaleChangedParam]: syncLocale
            ? authLocaleChangedValue
            : undefined,
          [authTurnstileRequiredParam]: loginRequiresTurnstile(failure, config)
            ? authTurnstileRequiredValue
            : undefined,
        }),
        303,
      );
    }

    if (canRateLimit) {
      await storage.clearLoginFailures(username);
    }

    if (syncLocale) {
      await saveAuthLocale(account.id, locale, storage);
    }
    return await completePrimaryLogin(c, storage, config, account, {
      locale,
      primaryMethod: "password",
      returnTo,
      syncLocale,
    });
  });

  app.get(config.registerPath, (c) => {
    const url = new URL(c.req.url);
    const locale = authPageLocale(url, c.req.header("accept-language"), config);
    const syncLocale = shouldSyncAuthLocale(url);
    const messages = getMessages(locale);
    const csrf = csrfTokenForRequest(c.req.header("cookie"), c.req.url);
    return withCsrfCookie(
      c.html(renderAuthPage({
        action: authPagePath(config.registerPath, locale, {
          [authLocaleChangedParam]: syncLocale
            ? authLocaleChangedValue
            : undefined,
        }),
        csrfToken: csrf.token,
        error: registerErrorMessage(url.searchParams.get("error"), messages),
        heading: messages.authRegister,
        locale,
        messages,
        mode: "register",
        returnTo: safeReturnTo(url.searchParams.get("returnTo")),
        submitLabel: messages.authCreateAccount,
        syncLocale,
        turnstileSiteKey: turnstileSiteKey(config),
      })),
      csrf,
    );
  });

  app.post(config.registerPath, async (c) => {
    const url = new URL(c.req.url);
    const form = await c.req.parseBody();
    if (
      !verifyCsrfToken(
        c.req.header("cookie"),
        submittedCsrfToken(form, c.req.header(csrfHeaderName)),
      )
    ) {
      return csrfForbiddenResponse(c.req.raw);
    }
    const locale = authPageLocale(url, c.req.header("accept-language"), config);
    const syncLocale = shouldSyncAuthLocale(url);
    const rateLimitResponse = await rateLimitExceededResponseFor(
      storage,
      publicRateLimitPolicies.registration,
      clientRateLimitIdentifier((name) => c.req.header(name)),
      { request: c.req.raw },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const humanVerificationErrors = await humanVerificationErrorCodes(
      c.req.raw,
      form,
      config,
    );
    if (humanVerificationErrors) {
      return c.redirect(
        authPagePath(config.registerPath, locale, {
          error: "humanVerification",
          [authLocaleChangedParam]: syncLocale
            ? authLocaleChangedValue
            : undefined,
        }),
        303,
      );
    }

    const username = normalizeUsername(String(form.username ?? ""));
    const password = String(form.password ?? "");
    const confirmPassword = String(form.confirmPassword ?? "");
    const returnTo = safeReturnTo(String(form.returnTo ?? "/"));
    const validationError = validateRegistration(
      username,
      password,
      confirmPassword,
    );

    if (validationError) {
      return c.redirect(
        authPagePath(config.registerPath, locale, {
          error: validationError,
          [authLocaleChangedParam]: syncLocale
            ? authLocaleChangedValue
            : undefined,
        }),
        303,
      );
    }

    const account: UserAccount = {
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      username,
      ...(await hashPassword(password)),
    };

    if (!(await storage.createAccount(account))) {
      return c.redirect(
        authPagePath(config.registerPath, locale, {
          error: "exists",
          [authLocaleChangedParam]: syncLocale
            ? authLocaleChangedValue
            : undefined,
        }),
        303,
      );
    }

    await saveAccountPasswordCredential(account, storage);

    if (syncLocale) {
      await saveAuthLocale(account.id, locale, storage);
    }
    return await redirectWithSession(
      c.req.url,
      returnTo,
      account,
      storage,
      config,
    );
  });

  app.post(emailVerificationPath, async (c) => {
    const url = new URL(c.req.url);
    const form = await c.req.parseBody();
    if (
      !verifyCsrfToken(
        c.req.header("cookie"),
        submittedCsrfToken(form, c.req.header(csrfHeaderName)),
      )
    ) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const locale = authPageLocale(url, c.req.header("accept-language"), config);
    const email = normalizeEmailAddress(String(form.email ?? ""));
    const purpose = emailVerificationPurposeFromForm(form);
    if (!email || !purpose) {
      return c.json({ error: "invalidEmailVerificationRequest" }, 400);
    }

    if (!supportedEmailVerificationPurpose(purpose)) {
      return c.json({ error: "unsupportedEmailVerificationPurpose" }, 400);
    }

    const session = await readAuthSession(
      c.req.header("cookie"),
      storage,
      config,
    );
    let verificationUserId = session?.userId;
    let skipHumanVerification = false;
    if (purpose === "email_binding" && !session) {
      return c.json({ error: "authenticationRequired" }, 401);
    }

    if (purpose === "second_factor") {
      const challengeId = String(form.challengeId ?? "").trim();
      const challenge = await storage.getPendingMfaChallenge(challengeId);
      if (!challenge) {
        return c.json({ error: "mfaChallengeInvalid" }, 400);
      }

      const challengeError = mfaChallengeVerificationError(
        challenge,
        "email",
        config.mfa,
      );
      if (challengeError) {
        if (challengeError === "attempts" || challengeError === "expired") {
          await storage.deletePendingMfaChallenge(challenge.id);
        }
        return c.json({ error: "mfaChallengeInvalid" }, 400);
      }

      const credential = await storage.getEmailCredential(
        challenge.userId,
        email,
      );
      if (!credential?.verified) {
        return c.json({ error: "invalidEmailVerificationRequest" }, 400);
      }

      verificationUserId = challenge.userId;
      skipHumanVerification = true;
    }

    const clientLimitResponse = await rateLimitExceededResponseFor(
      storage,
      publicRateLimitPolicies.emailVerificationClient,
      `${clientRateLimitIdentifier((name) => c.req.header(name))}:${purpose}`,
      { request: c.req.raw, userId: verificationUserId },
    );
    if (clientLimitResponse) {
      return clientLimitResponse;
    }

    if (!skipHumanVerification) {
      const humanVerificationErrors = await humanVerificationErrorCodes(
        c.req.raw,
        form,
        config,
      );
      if (humanVerificationErrors) {
        return c.json({ error: "humanVerification" }, 403);
      }
    }

    const targetLimitResponse = await rateLimitExceededResponseFor(
      storage,
      publicRateLimitPolicies.emailVerificationTarget,
      `email:${email}:purpose:${purpose}`,
      { request: c.req.raw, userId: verificationUserId },
    );
    if (targetLimitResponse) {
      return targetLimitResponse;
    }

    if (!config.sendEmailVerificationEmail) {
      logSecurityAuditEvent({
        code: "email_verification_unavailable",
        level: "warn",
        message: "邮箱验证码发送能力未配置。",
        request: c.req.raw,
        userId: verificationUserId,
      });
      return c.json({ error: "emailVerificationUnavailable" }, 503);
    }

    let challenge: Awaited<ReturnType<typeof createEmailVerificationChallenge>>;
    try {
      challenge = await createEmailVerificationChallenge({
        config: config.emailVerification,
        email,
        purpose,
        userId: verificationUserId,
      });
    } catch (error) {
      if (error instanceof EmailVerificationValidationError) {
        return c.json({ error: "invalidEmailVerificationRequest" }, 400);
      }

      if (error instanceof EmailVerificationConfigError) {
        logSecurityAuditEvent({
          code: "email_verification_unavailable",
          level: "warn",
          message: "邮箱验证码密钥未配置。",
          request: c.req.raw,
          userId: verificationUserId,
        });
        return c.json({ error: "emailVerificationUnavailable" }, 503);
      }

      throw error;
    }

    await storage.savePendingEmailVerification(challenge.verification);
    try {
      await sendEmailVerificationCode(config.sendEmailVerificationEmail, {
        code: challenge.code,
        email: challenge.verification.email,
        expiresAt: challenge.verification.expiresAt,
        locale,
        purpose,
      });
    } catch (error) {
      await storage.deletePendingEmailVerification(challenge.verification.id);
      logSecurityAuditEvent({
        code: "email_verification_delivery_failed",
        details: { errorName: error instanceof Error ? error.name : "" },
        level: "warn",
        message: "邮箱验证码发送失败。",
        request: c.req.raw,
        userId: verificationUserId,
      });
      return c.json({ error: "emailVerificationDeliveryFailed" }, 502);
    }

    logSecurityAuditEvent({
      code: "email_verification_sent",
      details: {
        email: maskedEmailAddress(challenge.verification.email),
        purpose,
      },
      level: "info",
      message: "邮箱验证码已发送。",
      request: c.req.raw,
      userId: verificationUserId,
    });

    return c.json({
      expiresAt: challenge.verification.expiresAt,
      id: challenge.verification.id,
      ok: true,
    });
  });

  app.post(passkeyLoginOptionsPath, async (c) => {
    const payload = await passkeyJsonPayload(c);
    if (
      !verifyCsrfToken(
        c.req.header("cookie"),
        submittedJsonCsrfToken(payload, c.req.header(csrfHeaderName)),
      )
    ) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      storage,
      publicRateLimitPolicies.emailLogin,
      `${
        clientRateLimitIdentifier((name) => c.req.header(name))
      }:passkey-login-options`,
      { request: c.req.raw },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const authentication = await createPasskeyAuthenticationOptions({
      config: config.passkey,
      purpose: "primary_login",
    });
    await storage.savePendingPasskeyChallenge(authentication.challenge);

    return c.json(passkeyAuthenticationOptionsResponse(authentication));
  });

  app.post(passkeyLoginPath, async (c) => {
    const url = new URL(c.req.url);
    const payload = await passkeyJsonPayload(c);
    if (
      !verifyCsrfToken(
        c.req.header("cookie"),
        submittedJsonCsrfToken(payload, c.req.header(csrfHeaderName)),
      )
    ) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      storage,
      publicRateLimitPolicies.emailLogin,
      `${
        clientRateLimitIdentifier((name) => c.req.header(name))
      }:passkey-login`,
      { request: c.req.raw },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const locale = authPageLocale(url, c.req.header("accept-language"), config);
    const syncLocale = shouldSyncAuthLocale(url) ||
      String(payload[authLocaleChangedParam] ?? "") === authLocaleChangedValue;
    return await handlePasskeyLogin(c, storage, config, payload, {
      locale,
      returnTo: safeReturnTo(String(payload.returnTo ?? "/")),
      syncLocale,
    });
  });

  app.post(passkeyMfaOptionsPath, async (c) => {
    const payload = await passkeyJsonPayload(c);
    if (
      !verifyCsrfToken(
        c.req.header("cookie"),
        submittedJsonCsrfToken(payload, c.req.header(csrfHeaderName)),
      )
    ) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const challengeId = passkeyMfaChallengeId(payload);
    const challenge = challengeId
      ? await storage.getPendingMfaChallenge(challengeId)
      : undefined;
    const challengeError = challenge
      ? mfaChallengeVerificationError(challenge, "passkey", config.mfa)
      : "expired";
    if (!challenge || challengeError) {
      if (
        challenge &&
        (challengeError === "attempts" || challengeError === "expired")
      ) {
        await storage.deletePendingMfaChallenge(challenge.id);
      }
      return c.json({ error: "mfaChallengeInvalid" }, 400);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      storage,
      publicRateLimitPolicies.emailLogin,
      `${
        clientRateLimitIdentifier((name) => c.req.header(name))
      }:passkey-mfa-options`,
      { request: c.req.raw, userId: challenge.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const credentials = await storage.listPasskeyCredentials(challenge.userId);
    if (credentials.length === 0) {
      return c.json({ error: "unavailable" }, 400);
    }

    const authentication = await createPasskeyAuthenticationOptions({
      config: config.passkey,
      credentials,
      purpose: "second_factor",
      userId: challenge.userId,
    });
    await storage.savePendingPasskeyChallenge(authentication.challenge);

    return c.json(passkeyAuthenticationOptionsResponse(authentication));
  });

  app.post(passkeyMfaPath, async (c) => {
    const url = new URL(c.req.url);
    const payload = await passkeyJsonPayload(c);
    if (
      !verifyCsrfToken(
        c.req.header("cookie"),
        submittedJsonCsrfToken(payload, c.req.header(csrfHeaderName)),
      )
    ) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      storage,
      publicRateLimitPolicies.emailLogin,
      `${clientRateLimitIdentifier((name) => c.req.header(name))}:passkey-mfa`,
      { request: c.req.raw },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const locale = authPageLocale(url, c.req.header("accept-language"), config);
    return await handlePasskeySecondFactor(
      c,
      storage,
      config,
      payload,
      locale,
      safeReturnTo(String(payload.returnTo ?? "/")),
    );
  });

  app.post(googleCredentialPath, async (c) => {
    const url = new URL(c.req.url);
    const form = await c.req.parseBody();
    if (
      !verifyCsrfToken(
        c.req.header("cookie"),
        submittedCsrfToken(form, c.req.header(csrfHeaderName)),
      )
    ) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const locale = authPageLocale(url, c.req.header("accept-language"), config);
    const syncLocale = shouldSyncAuthLocale(url) ||
      String(form[authLocaleChangedParam] ?? "") === authLocaleChangedValue;
    const returnTo = safeReturnTo(String(form.returnTo ?? "/"));
    const clientLimitResponse = await rateLimitExceededResponseFor(
      storage,
      publicRateLimitPolicies.emailLogin,
      `${clientRateLimitIdentifier((name) => c.req.header(name))}:google-login`,
      { request: c.req.raw },
    );
    if (clientLimitResponse) {
      return clientLimitResponse;
    }

    return await handleGoogleCredentialLogin(c, storage, config, form, {
      locale,
      returnTo,
      syncLocale,
    });
  });

  app.get(mfaPath, async (c) => {
    const url = new URL(c.req.url);
    const locale = authPageLocale(url, c.req.header("accept-language"), config);
    const messages = getMessages(locale);
    const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
    const challenge = await getRenderableMfaChallenge(
      storage,
      config,
      url.searchParams.get("challenge"),
    );
    if (!challenge) {
      return c.redirect(
        authPagePath(config.loginPath, locale, {
          error: "mfaExpired",
          returnTo,
        }),
        303,
      );
    }

    const emailCredentials = await storage.listEmailCredentials(
      challenge.userId,
    );
    const passkeyCredentials = await storage.listPasskeyCredentials(
      challenge.userId,
    );
    const csrf = csrfTokenForRequest(c.req.header("cookie"), c.req.url);
    return withCsrfCookie(
      c.html(renderMfaPage({
        action: mfaPagePath(locale, challenge.id, returnTo),
        challenge,
        csrfToken: csrf.token,
        emailCredentials,
        error: mfaErrorMessage(url.searchParams.get("error"), messages),
        locale,
        messages,
        passkeyCredentials,
        returnTo,
      })),
      csrf,
    );
  });

  app.post(mfaPath, async (c) => {
    const url = new URL(c.req.url);
    const form = await c.req.parseBody();
    if (
      !verifyCsrfToken(
        c.req.header("cookie"),
        submittedCsrfToken(form, c.req.header(csrfHeaderName)),
      )
    ) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const locale = authPageLocale(url, c.req.header("accept-language"), config);
    const returnTo = safeReturnTo(String(form.returnTo ?? "/"));
    const challengeId = String(form.challengeId ?? "").trim();
    const method = secondFactorMethodFromForm(form.method);
    const challenge = challengeId
      ? await storage.getPendingMfaChallenge(challengeId)
      : undefined;
    if (!challenge || !method) {
      return c.redirect(
        authPagePath(config.loginPath, locale, {
          error: "mfaExpired",
          returnTo,
        }),
        303,
      );
    }

    const challengeError = mfaChallengeVerificationError(
      challenge,
      method,
      config.mfa,
    );
    if (challengeError) {
      if (challengeError === "attempts" || challengeError === "expired") {
        await storage.deletePendingMfaChallenge(challenge.id);
        return c.redirect(
          mfaExpiredLoginRedirect(config, locale, returnTo),
          303,
        );
      }
      return c.redirect(
        mfaErrorRedirect(
          locale,
          challenge.id,
          returnTo,
          challengeError,
        ),
        303,
      );
    }

    if (method === "email") {
      return await handleEmailSecondFactor(
        c,
        storage,
        config,
        form,
        challenge,
        locale,
        returnTo,
      );
    }

    if (method === "totp") {
      return await handleTotpSecondFactor(
        c,
        storage,
        config,
        form,
        challenge,
        locale,
        returnTo,
      );
    }

    return c.redirect(
      mfaErrorRedirect(locale, challenge.id, returnTo, "unavailable"),
      303,
    );
  });

  app.post("/logout", async (c) => {
    const form = await c.req.parseBody().catch(() => ({}));
    if (
      !verifyCsrfToken(
        c.req.header("cookie"),
        submittedCsrfToken(form, c.req.header(csrfHeaderName)),
      )
    ) {
      return csrfForbiddenResponse(c.req.raw);
    }

    await deleteSessionForCookie(c.req.header("cookie"), storage, config);

    return new Response(null, {
      headers: {
        location: authPagePath(config.loginPath, config.defaultLocale),
        "set-cookie": clearSessionCookie(c.req.url, config),
      },
      status: 303,
    });
  });

  return app;
}

type EmailLoginOptions = {
  locale: Locale;
  returnTo: string;
  syncLocale: boolean;
};

type GoogleCredentialLoginOptions = {
  locale: Locale;
  returnTo: string;
  syncLocale: boolean;
};

type PasskeyLoginOptions = {
  locale: Locale;
  returnTo: string;
  syncLocale: boolean;
};

type PrimaryLoginCompletionOptions = {
  locale: Locale;
  primaryMethod: PrimaryAuthMethod;
  returnTo: string;
  syncLocale: boolean;
};

type GoogleAccountResult = {
  account: UserAccount;
  created: boolean;
};

/**
 * 完成主认证，必要时进入 MFA challenge。
 *
 * @param {Context} c Hono 请求上下文。
 * @param {Storage} storage 应用存储。
 * @param {AuthConfig} config 认证配置。
 * @param {UserAccount} account 已完成主认证的账户。
 * @param {PrimaryLoginCompletionOptions} options 主认证完成选项。
 * @return {Promise<Response>} 登录流程响应。
 */
async function completePrimaryLogin(
  c: Context,
  storage: Storage,
  config: AuthConfig,
  account: UserAccount,
  options: PrimaryLoginCompletionOptions,
): Promise<Response> {
  const securitySettings = await storage.getUserSecuritySettings(account.id);
  const emailCredentials = await storage.listEmailCredentials(account.id);
  const passkeyCredentials = await storage.listPasskeyCredentials(account.id);
  const totpCredential = await storage.getTotpCredential(account.id);
  const availableMethods = availableSecondFactorMethods({
    emailCredentials,
    passkeyCredentials,
    totpCredential,
  });

  try {
    const completion = completePrimaryAuthentication({
      availableMethods,
      config: config.mfa,
      primaryMethod: options.primaryMethod,
      securitySettings,
      userId: account.id,
    });

    if (completion.status === "authenticated") {
      return await redirectWithSession(
        c.req.url,
        options.returnTo,
        account,
        storage,
        config,
      );
    }

    await storage.savePendingMfaChallenge(completion.challenge);
    logSecurityAuditEvent({
      code: "mfa_required",
      details: {
        allowedMethods: completion.challenge.allowedMethods.join(","),
        primaryMethod: options.primaryMethod,
      },
      level: "info",
      message: "登录需要完成双重验证。",
      request: c.req.raw,
      userId: account.id,
    });

    return c.redirect(
      mfaPagePath(
        options.locale,
        completion.challenge.id,
        options.returnTo,
      ),
      303,
    );
  } catch (error) {
    if (!(error instanceof MfaConfigurationError)) {
      throw error;
    }

    logSecurityAuditEvent({
      code: "mfa_configuration_invalid",
      details: {
        availableMethods: availableMethods.join(","),
        primaryMethod: options.primaryMethod,
      },
      level: "warn",
      message: "双重验证配置不可用，已拒绝登录。",
      request: c.req.raw,
      userId: account.id,
    });

    return c.redirect(
      primaryLoginErrorRedirect(config, options, "mfaUnavailable"),
      303,
    );
  }
}

/**
 * 处理 Passkey 主登录。
 *
 * @param c Hono 请求上下文。
 * @param storage 应用存储。
 * @param config 认证配置。
 * @param payload JSON 请求体。
 * @param options Passkey 登录选项。
 * @return 登录响应。
 */
async function handlePasskeyLogin(
  c: Context,
  storage: Storage,
  config: AuthConfig,
  payload: Record<string, unknown>,
  options: PasskeyLoginOptions,
): Promise<Response> {
  const challengeId = String(payload.challengeId ?? "").trim();
  const credentialResponse = payload.credential;
  const credentialId = passkeyCredentialId(credentialResponse);
  if (!challengeId || !isRecord(credentialResponse) || !credentialId) {
    logSecurityAuditEvent({
      code: "passkey_login_failed",
      details: { reason: "invalid_request" },
      level: "warn",
      message: "Passkey 登录失败：请求无效。",
      request: c.req.raw,
    });
    return c.json({ error: "invalid" }, 400);
  }

  const challenge = await storage.getPendingPasskeyChallenge(challengeId);
  const challengeError = passkeyAuthenticationChallengeError(
    challenge,
    "primary_login",
    credentialId,
  );
  if (challengeError) {
    if (challenge) {
      await storage.deletePendingPasskeyChallenge(challenge.id);
    }
    logSecurityAuditEvent({
      code: "passkey_login_failed",
      details: { credentialId, reason: "challenge" },
      level: "warn",
      message: "Passkey 登录失败：challenge 不可用。",
      request: c.req.raw,
      userId: challenge?.userId,
    });
    return c.json({ error: "challenge" }, 400);
  }

  const activeChallenge = challenge as PendingPasskeyChallenge;
  const credential = await storage.getPasskeyCredentialByCredentialId(
    credentialId,
  );
  if (
    !credential ||
    (activeChallenge.userId && activeChallenge.userId !== credential.userId)
  ) {
    await recordPasskeyChallengeFailure(storage, activeChallenge);
    logSecurityAuditEvent({
      code: "passkey_login_failed",
      details: { credentialId, reason: "credential" },
      level: "warn",
      message: "Passkey 登录失败：凭证不存在或不属于当前 challenge。",
      request: c.req.raw,
      userId: activeChallenge.userId,
    });
    return c.json({ error: "failed" }, 400);
  }

  const verification = await verifyPasskeyAssertionResponse(
    config,
    activeChallenge,
    credential,
    credentialResponse,
  );
  if (!verification?.verified) {
    await recordPasskeyChallengeFailure(storage, activeChallenge);
    logSecurityAuditEvent({
      code: "passkey_login_failed",
      details: { credentialId, reason: "assertion" },
      level: "warn",
      message: "Passkey 登录失败：assertion 校验未通过。",
      request: c.req.raw,
      userId: credential.userId,
    });
    return c.json({ error: "failed" }, 400);
  }

  const account = await storage.getAccountById(credential.userId);
  if (!account) {
    await storage.deletePendingPasskeyChallenge(activeChallenge.id);
    logSecurityAuditEvent({
      code: "passkey_login_failed",
      details: { credentialId, reason: "account" },
      level: "warn",
      message: "Passkey 登录失败：账号不存在。",
      request: c.req.raw,
      userId: credential.userId,
    });
    return c.json({ error: "failed" }, 400);
  }

  await storage.savePasskeyCredential(passkeyCredentialAfterAuthentication(
    credential,
    verification.authenticationInfo.newCounter,
  ));
  await storage.deletePendingPasskeyChallenge(activeChallenge.id);
  if (options.syncLocale) {
    await saveAuthLocale(account.id, options.locale, storage);
  }

  logSecurityAuditEvent({
    code: "passkey_login_succeeded",
    details: {
      credentialId,
      primaryMethod: "passkey",
      secondFactorExcluded: "passkey",
    },
    level: "info",
    message: "Passkey 登录成功。",
    request: c.req.raw,
    userId: account.id,
  });

  return await completePrimaryLogin(c, storage, config, account, {
    locale: options.locale,
    primaryMethod: "passkey",
    returnTo: options.returnTo,
    syncLocale: options.syncLocale,
  });
}

/**
 * 处理 Google credential 主登录。
 *
 * @param c Hono 请求上下文。
 * @param storage 应用存储。
 * @param config 认证配置。
 * @param form 已解析表单。
 * @param options Google 登录选项。
 * @return 登录响应。
 */
async function handleGoogleCredentialLogin(
  c: Context,
  storage: Storage,
  config: AuthConfig,
  form: Record<string, unknown>,
  options: GoogleCredentialLoginOptions,
): Promise<Response> {
  const credential = String(form.credential ?? "").trim();
  if (!credential) {
    logSecurityAuditEvent({
      code: "google_login_failed",
      details: { reason: "missing_credential" },
      level: "warn",
      message: "Google 登录失败：缺少 credential。",
      request: c.req.raw,
    });
    return c.redirect(googleLoginErrorRedirect(config, options, "google"), 303);
  }

  let claims: GoogleIdentityClaims;
  try {
    claims = await verifyGoogleIdToken(credential, config.google, {
      fetcher: config.googleJwksFetch,
    });
  } catch (error) {
    if (error instanceof GoogleAuthConfigError) {
      logSecurityAuditEvent({
        code: "google_login_unavailable",
        details: { reason: "config" },
        level: "warn",
        message: "Google 登录不可用：OAuth client ID 未配置。",
        request: c.req.raw,
      });
      return c.redirect(
        googleLoginErrorRedirect(config, options, "googleUnavailable"),
        303,
      );
    }

    if (error instanceof GoogleIdTokenVerificationError) {
      logSecurityAuditEvent({
        code: "google_login_failed",
        details: { reason: auditText(error.message) },
        level: "warn",
        message: "Google 登录失败：ID token 校验未通过。",
        request: c.req.raw,
      });
      return c.redirect(
        googleLoginErrorRedirect(config, options, "google"),
        303,
      );
    }

    throw error;
  }

  const result = await findOrCreateGoogleAccount(storage, claims);
  if (options.syncLocale) {
    await saveAuthLocale(result.account.id, options.locale, storage);
  }

  if (result.created) {
    logSecurityAuditEvent({
      code: "google_login_account_created",
      details: googleAuditDetails(claims),
      level: "info",
      message: "Google 登录已创建本地账号。",
      request: c.req.raw,
      userId: result.account.id,
    });
  }

  logSecurityAuditEvent({
    code: "google_login_succeeded",
    details: {
      ...googleAuditDetails(claims),
      primaryMethod: "google",
    },
    level: "info",
    message: "Google 登录成功。",
    request: c.req.raw,
    userId: result.account.id,
  });

  return await completePrimaryLogin(c, storage, config, result.account, {
    locale: options.locale,
    primaryMethod: "google",
    returnTo: options.returnTo,
    syncLocale: options.syncLocale,
  });
}

/**
 * 按 Google subject 查找或创建本地账号。
 *
 * @param storage 应用存储。
 * @param claims Google 身份声明。
 * @return Google 登录对应的本地账号结果。
 */
async function findOrCreateGoogleAccount(
  storage: Storage,
  claims: GoogleIdentityClaims,
): Promise<GoogleAccountResult> {
  const identity = await storage.getAuthIdentity("google", claims.sub);
  if (identity) {
    const account = await storage.getAccountById(identity.userId);
    if (account) {
      return {
        account: await updateGoogleAccountFromClaims(
          storage,
          account,
          claims,
          identity,
        ),
        created: false,
      };
    }
  }

  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const account = googleAccountFromClaims(claims, now, attempt);
    if (await storage.createAccount(account)) {
      await saveGoogleAuthIdentity(storage, account.id, claims, now);
      await saveVerifiedGoogleEmailCredential(storage, account, claims, now);
      return { account, created: true };
    }
  }

  throw new Error("Could not create a unique Google login account.");
}

/**
 * 用最新 Google 声明刷新已绑定本地账号的资料。
 *
 * @param storage 应用存储。
 * @param account 本地账号。
 * @param claims Google 身份声明。
 * @param identity 既有 Google 身份绑定。
 * @return 刷新后的本地账号。
 */
async function updateGoogleAccountFromClaims(
  storage: Storage,
  account: UserAccount,
  claims: GoogleIdentityClaims,
  identity: AuthIdentity,
): Promise<UserAccount> {
  const now = new Date().toISOString();
  const nextAccount = googleAccountProfileFromClaims(account, claims);
  const changed = account.authVersion !== nextAccount.authVersion ||
    account.displayName !== nextAccount.displayName ||
    account.emailVerified !== nextAccount.emailVerified ||
    account.primaryEmail !== nextAccount.primaryEmail;

  if (changed && !(await storage.updateAccount(nextAccount))) {
    throw new Error("Could not update the Google login account.");
  }

  await saveGoogleAuthIdentity(storage, account.id, claims, identity.createdAt);
  await saveVerifiedGoogleEmailCredential(storage, nextAccount, claims, now);
  return nextAccount;
}

/**
 * 根据 Google 声明创建本地账号对象。
 *
 * @param claims Google 身份声明。
 * @param createdAt 创建时间。
 * @param attempt 用户名重试次数。
 * @return 本地账号对象。
 */
function googleAccountFromClaims(
  claims: GoogleIdentityClaims,
  createdAt: string,
  attempt: number,
): UserAccount {
  return googleAccountProfileFromClaims({
    authVersion: 2,
    createdAt,
    id: crypto.randomUUID(),
    username: googleUsernameCandidate(claims, attempt),
  }, claims);
}

/**
 * 将 Google 声明中的可用资料写入本地账号对象。
 *
 * @param account 本地账号。
 * @param claims Google 身份声明。
 * @return 合并 Google 资料后的本地账号对象。
 */
function googleAccountProfileFromClaims(
  account: UserAccount,
  claims: GoogleIdentityClaims,
): UserAccount {
  const email = verifiedGoogleEmail(claims);
  const displayName = googleDisplayName(claims);
  return {
    ...account,
    authVersion: 2,
    ...(displayName ? { displayName } : {}),
    ...(email ? { emailVerified: true, primaryEmail: email } : {}),
  };
}

/**
 * 保存 Google 外部身份绑定。
 *
 * @param storage 应用存储。
 * @param userId 本地用户 ID。
 * @param claims Google 身份声明。
 * @param createdAt 绑定创建时间。
 * @return 保存完成后的 Promise。
 */
async function saveGoogleAuthIdentity(
  storage: Storage,
  userId: string,
  claims: GoogleIdentityClaims,
  createdAt: string,
): Promise<void> {
  await storage.saveAuthIdentity({
    createdAt,
    email: verifiedGoogleEmail(claims),
    emailVerified: verifiedGoogleEmail(claims) ? true : claims.emailVerified,
    provider: "google",
    providerUserId: claims.sub,
    userId,
  });
}

/**
 * 将 Google 已验证邮箱保存为当前 Google 账号自己的邮箱凭证。
 *
 * @param storage 应用存储。
 * @param account 本地账号。
 * @param claims Google 身份声明。
 * @param verifiedAt 本次验证时间。
 * @return 保存完成后的 Promise。
 */
async function saveVerifiedGoogleEmailCredential(
  storage: Storage,
  account: UserAccount,
  claims: GoogleIdentityClaims,
  verifiedAt: string,
): Promise<void> {
  const email = verifiedGoogleEmail(claims);
  if (!email) {
    return;
  }

  const existingCredential = await storage.getEmailCredential(
    account.id,
    email,
  );
  await storage.saveEmailCredential({
    createdAt: existingCredential?.createdAt ?? verifiedAt,
    email,
    lastVerifiedAt: verifiedAt,
    userId: account.id,
    verified: true,
  });
}

/**
 * 读取 Google 声明中可信的已验证邮箱。
 *
 * @param claims Google 身份声明。
 * @return 规范化后的已验证邮箱。
 */
function verifiedGoogleEmail(
  claims: GoogleIdentityClaims,
): string | undefined {
  return claims.emailVerified
    ? normalizeEmailAddress(claims.email ?? "")
    : undefined;
}

/**
 * 读取 Google 声明中适合显示的名称。
 *
 * @param claims Google 身份声明。
 * @return 清理后的显示名称。
 */
function googleDisplayName(
  claims: GoogleIdentityClaims,
): string | undefined {
  const name = claims.name?.replaceAll(/[\r\n\t]+/g, " ").trim();
  return name ? name.slice(0, 120) : undefined;
}

/**
 * 生成 Google 登录新账号的候选用户名。
 *
 * @param claims Google 身份声明。
 * @param attempt 当前尝试次数。
 * @return 候选用户名。
 */
function googleUsernameCandidate(
  claims: GoogleIdentityClaims,
  attempt: number,
): string {
  const email = verifiedGoogleEmail(claims);
  if (email) {
    return emailLoginUsernameCandidate(email, attempt);
  }

  const base = googleUsernameBase(claims);
  if (attempt === 0 && validUsername(base)) {
    return base;
  }

  const suffix = base64UrlEncode(crypto.getRandomValues(new Uint8Array(4)))
    .toLowerCase()
    .slice(0, 6);
  const prefix = base.slice(0, Math.max(3, 39 - suffix.length));
  return `${prefix}-${suffix}`;
}

/**
 * 从 Google 名称或 subject 派生用户名基础值。
 *
 * @param claims Google 身份声明。
 * @return 用户名基础值。
 */
function googleUsernameBase(claims: GoogleIdentityClaims): string {
  const source = claims.name || claims.sub;
  const normalized = source
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 32);
  return validUsername(normalized) ? normalized : "google-user";
}

/**
 * 构造 Google 登录审计详情。
 *
 * @param claims Google 身份声明。
 * @return 可写入审计日志的详情。
 */
function googleAuditDetails(
  claims: GoogleIdentityClaims,
): Record<string, string> {
  return {
    ...(verifiedGoogleEmail(claims)
      ? { email: maskedEmailAddress(verifiedGoogleEmail(claims) ?? "") }
      : {}),
    providerUserId: auditText(claims.sub),
  };
}

/**
 * 构造 Google 登录错误跳转地址。
 *
 * @param config 认证配置。
 * @param options Google 登录选项。
 * @param error 登录错误码。
 * @return 登录页地址。
 */
function googleLoginErrorRedirect(
  config: AuthConfig,
  options: GoogleCredentialLoginOptions,
  error: "google" | "googleUnavailable",
): string {
  return authPagePath(config.loginPath, options.locale, {
    error,
    returnTo: options.returnTo,
    [authLocaleChangedParam]: options.syncLocale
      ? authLocaleChangedValue
      : undefined,
  });
}

/**
 * 处理邮箱验证码主登录。
 *
 * @param c Hono 请求上下文。
 * @param storage 应用存储。
 * @param config 认证配置。
 * @param form 已解析表单。
 * @param options 邮箱登录选项。
 * @return 登录响应。
 */
async function handleEmailLogin(
  c: Context,
  storage: Storage,
  config: AuthConfig,
  form: Record<string, unknown>,
  options: EmailLoginOptions,
): Promise<Response> {
  const email = normalizeEmailAddress(String(form.email ?? ""));
  const verificationId = String(form.verificationId ?? "").trim();
  const code = String(form.code ?? "");
  if (!email || !verificationId || !code.trim()) {
    return c.redirect(
      emailLoginErrorRedirect(config, options, "emailInvalid"),
      303,
    );
  }

  const clientLimitResponse = await rateLimitExceededResponseFor(
    storage,
    publicRateLimitPolicies.emailLogin,
    `${clientRateLimitIdentifier((name) => c.req.header(name))}:email-login`,
    { request: c.req.raw },
  );
  if (clientLimitResponse) {
    return clientLimitResponse;
  }

  const targetLimitResponse = await rateLimitExceededResponseFor(
    storage,
    publicRateLimitPolicies.emailLogin,
    `email:${email}:primary-login`,
    { request: c.req.raw },
  );
  if (targetLimitResponse) {
    return targetLimitResponse;
  }

  const verification = await storage.getPendingEmailVerification(
    verificationId,
  );
  const verificationError = primaryEmailLoginVerificationError(
    verification,
    email,
    config.emailVerification.maxAttempts,
  );
  if (verificationError) {
    if (
      verification &&
      (verificationError === "expired" || verificationError === "attempts")
    ) {
      await storage.deletePendingEmailVerification(verification.id);
    }
    logSecurityAuditEvent({
      code: "email_login_failed",
      details: { email: maskedEmailAddress(email), reason: verificationError },
      level: "warn",
      message: "邮箱验证码登录失败。",
      request: c.req.raw,
    });
    return c.redirect(
      emailLoginErrorRedirect(config, options, "emailCode"),
      303,
    );
  }

  const activeVerification = verification as NonNullable<typeof verification>;
  const validCode = await verifyEmailVerificationCode(
    code,
    activeVerification,
    config.emailVerification,
  );
  if (!validCode) {
    await recordPrimaryEmailLoginFailure(storage, config, activeVerification);
    logSecurityAuditEvent({
      code: "email_login_failed",
      details: { email: maskedEmailAddress(email), reason: "code" },
      level: "warn",
      message: "邮箱验证码登录失败。",
      request: c.req.raw,
    });
    return c.redirect(
      emailLoginErrorRedirect(config, options, "emailCode"),
      303,
    );
  }

  const account = await findOrCreateEmailLoginAccount(storage, email);
  const verifiedAccount = await ensureEmailLoginCredential(
    storage,
    account,
    email,
  );
  await storage.deletePendingEmailVerification(activeVerification.id);

  if (options.syncLocale) {
    await saveAuthLocale(verifiedAccount.id, options.locale, storage);
  }

  logSecurityAuditEvent({
    code: "email_login_succeeded",
    details: {
      email: maskedEmailAddress(email),
      primaryMethod: "email_otp",
      secondFactorExcluded: "email",
    },
    level: "info",
    message: "邮箱验证码登录成功。",
    request: c.req.raw,
    userId: verifiedAccount.id,
  });

  return await completePrimaryLogin(c, storage, config, verifiedAccount, {
    locale: options.locale,
    primaryMethod: "email",
    returnTo: options.returnTo,
    syncLocale: options.syncLocale,
  });
}

type MfaErrorCode =
  | "attempts"
  | "code"
  | "expired"
  | "method"
  | "unavailable";

/**
 * 处理邮箱验证码二次验证。
 *
 * @param {Context} c Hono 请求上下文。
 * @param {Storage} storage 应用存储。
 * @param {AuthConfig} config 认证配置。
 * @param {Record<string, FormDataEntryValue | FormDataEntryValue[]>} form 表单数据。
 * @param {PendingMfaChallenge} challenge MFA challenge。
 * @param {Locale} locale 当前页面语言。
 * @param {string} returnTo 登录完成后返回路径。
 * @return {Promise<Response>} MFA 处理响应。
 */
async function handleEmailSecondFactor(
  c: Context,
  storage: Storage,
  config: AuthConfig,
  form: Record<string, FormDataEntryValue | FormDataEntryValue[]>,
  challenge: PendingMfaChallenge,
  locale: Locale,
  returnTo: string,
): Promise<Response> {
  const email = normalizeEmailAddress(String(form.email ?? ""));
  const verificationId = String(form.verificationId ?? "").trim();
  const code = String(form.code ?? "");
  if (!email || !verificationId || !code.trim()) {
    const mfaFailure = await recordMfaChallengeFailure(
      storage,
      config,
      challenge,
    );
    logMfaFailure(c.req.raw, challenge, "code");
    return mfaFailure === "attempts"
      ? c.redirect(mfaExpiredLoginRedirect(config, locale, returnTo), 303)
      : c.redirect(
        mfaErrorRedirect(locale, challenge.id, returnTo, "code"),
        303,
      );
  }

  const verification = await storage.getPendingEmailVerification(
    verificationId,
  );
  const verificationError = secondFactorEmailVerificationError(
    verification,
    challenge,
    email,
    config.emailVerification.maxAttempts,
  );

  if (verificationError) {
    if (
      verification &&
      (verificationError === "attempts" || verificationError === "expired")
    ) {
      await storage.deletePendingEmailVerification(verification.id);
    }
    const mfaFailure = await recordMfaChallengeFailure(
      storage,
      config,
      challenge,
    );
    logMfaFailure(c.req.raw, challenge, verificationError);
    return mfaFailure === "attempts"
      ? c.redirect(mfaExpiredLoginRedirect(config, locale, returnTo), 303)
      : c.redirect(
        mfaErrorRedirect(
          locale,
          challenge.id,
          returnTo,
          verificationError,
        ),
        303,
      );
  }

  const activeVerification = verification as PendingEmailVerification;
  const validCode = await verifyEmailVerificationCode(
    code,
    activeVerification,
    config.emailVerification,
  );
  if (!validCode) {
    const emailFailure = await recordEmailVerificationFailure(
      storage,
      config,
      activeVerification,
    );
    const mfaFailure = await recordMfaChallengeFailure(
      storage,
      config,
      challenge,
    );
    logMfaFailure(c.req.raw, challenge, "code");
    const error = mfaFailure ?? emailFailure ?? "code";
    return error === "attempts"
      ? c.redirect(mfaExpiredLoginRedirect(config, locale, returnTo), 303)
      : c.redirect(
        mfaErrorRedirect(locale, challenge.id, returnTo, error),
        303,
      );
  }

  const account = await storage.getAccountById(challenge.userId);
  if (!account) {
    await storage.deletePendingMfaChallenge(challenge.id);
    await storage.deletePendingEmailVerification(activeVerification.id);
    return c.redirect(mfaExpiredLoginRedirect(config, locale, returnTo), 303);
  }

  await storage.deletePendingMfaChallenge(challenge.id);
  await storage.deletePendingEmailVerification(activeVerification.id);
  logSecurityAuditEvent({
    code: "mfa_succeeded",
    details: { method: "email" },
    level: "info",
    message: "双重验证已完成。",
    request: c.req.raw,
    userId: challenge.userId,
  });

  return await redirectWithSession(
    c.req.url,
    returnTo,
    account,
    storage,
    config,
  );
}

/**
 * 处理验证器动态码二次验证。
 *
 * @param {Context} c Hono 请求上下文。
 * @param {Storage} storage 应用存储。
 * @param {AuthConfig} config 认证配置。
 * @param {Record<string, FormDataEntryValue | FormDataEntryValue[]>} form 表单数据。
 * @param {PendingMfaChallenge} challenge MFA challenge。
 * @param {Locale} locale 当前页面语言。
 * @param {string} returnTo 登录完成后返回路径。
 * @return {Promise<Response>} MFA 处理响应。
 */
async function handleTotpSecondFactor(
  c: Context,
  storage: Storage,
  config: AuthConfig,
  form: Record<string, FormDataEntryValue | FormDataEntryValue[]>,
  challenge: PendingMfaChallenge,
  locale: Locale,
  returnTo: string,
): Promise<Response> {
  const code = String(form.code ?? "");
  if (!code.trim()) {
    const mfaFailure = await recordMfaChallengeFailure(
      storage,
      config,
      challenge,
    );
    logMfaFailure(c.req.raw, challenge, "code");
    return mfaFailure === "attempts"
      ? c.redirect(mfaExpiredLoginRedirect(config, locale, returnTo), 303)
      : c.redirect(
        mfaErrorRedirect(locale, challenge.id, returnTo, "code"),
        303,
      );
  }

  const credential = await storage.getTotpCredential(challenge.userId);
  if (!credential?.secretEncrypted) {
    logMfaFailure(c.req.raw, challenge, "unavailable");
    return c.redirect(
      mfaErrorRedirect(locale, challenge.id, returnTo, "unavailable"),
      303,
    );
  }

  let validCode = false;
  try {
    validCode = await verifyEncryptedTotpCode(
      code,
      credential.secretEncrypted,
      config.totp,
    );
  } catch (error) {
    if (!(error instanceof TotpConfigError)) {
      throw error;
    }

    logSecurityAuditEvent({
      code: "mfa_totp_configuration_invalid",
      level: "warn",
      message: "验证器动态码配置不可用，已拒绝 MFA 校验。",
      request: c.req.raw,
      userId: challenge.userId,
    });
    return c.redirect(
      mfaErrorRedirect(locale, challenge.id, returnTo, "unavailable"),
      303,
    );
  }

  if (!validCode) {
    const mfaFailure = await recordMfaChallengeFailure(
      storage,
      config,
      challenge,
    );
    logMfaFailure(c.req.raw, challenge, "code");
    return mfaFailure === "attempts"
      ? c.redirect(mfaExpiredLoginRedirect(config, locale, returnTo), 303)
      : c.redirect(
        mfaErrorRedirect(locale, challenge.id, returnTo, "code"),
        303,
      );
  }

  const account = await storage.getAccountById(challenge.userId);
  if (!account) {
    await storage.deletePendingMfaChallenge(challenge.id);
    return c.redirect(mfaExpiredLoginRedirect(config, locale, returnTo), 303);
  }

  await storage.deletePendingMfaChallenge(challenge.id);
  logSecurityAuditEvent({
    code: "mfa_succeeded",
    details: { method: "totp" },
    level: "info",
    message: "双重验证已完成。",
    request: c.req.raw,
    userId: challenge.userId,
  });

  return await redirectWithSession(
    c.req.url,
    returnTo,
    account,
    storage,
    config,
  );
}

/**
 * 处理 Passkey 二次验证。
 *
 * @param {Context} c Hono 请求上下文。
 * @param {Storage} storage 应用存储。
 * @param {AuthConfig} config 认证配置。
 * @param {Record<string, unknown>} payload JSON 请求体。
 * @param {Locale} locale 当前页面语言。
 * @param {string} returnTo 登录完成后返回路径。
 * @return {Promise<Response>} MFA 处理响应。
 */
async function handlePasskeySecondFactor(
  c: Context,
  storage: Storage,
  config: AuthConfig,
  payload: Record<string, unknown>,
  locale: Locale,
  returnTo: string,
): Promise<Response> {
  const mfaChallengeId = passkeyMfaChallengeId(payload);
  const passkeyChallengeId = String(payload.challengeId ?? "").trim();
  const credentialResponse = payload.credential;
  const credentialId = passkeyCredentialId(credentialResponse);
  if (
    !mfaChallengeId ||
    !passkeyChallengeId ||
    !isRecord(credentialResponse) ||
    !credentialId
  ) {
    return c.json({ error: "invalid" }, 400);
  }

  const mfaChallenge = await storage.getPendingMfaChallenge(mfaChallengeId);
  if (!mfaChallenge) {
    return c.redirect(mfaExpiredLoginRedirect(config, locale, returnTo), 303);
  }

  const mfaChallengeError = mfaChallengeVerificationError(
    mfaChallenge,
    "passkey",
    config.mfa,
  );
  if (mfaChallengeError) {
    if (
      mfaChallengeError === "attempts" ||
      mfaChallengeError === "expired"
    ) {
      await storage.deletePendingMfaChallenge(mfaChallenge.id);
      return c.redirect(mfaExpiredLoginRedirect(config, locale, returnTo), 303);
    }
    logMfaFailure(c.req.raw, mfaChallenge, mfaChallengeError);
    return c.json({ error: mfaChallengeError }, 400);
  }

  const passkeyChallenge = await storage.getPendingPasskeyChallenge(
    passkeyChallengeId,
  );
  const passkeyChallengeError = passkeyAuthenticationChallengeError(
    passkeyChallenge,
    "second_factor",
    credentialId,
  );
  if (
    passkeyChallengeError ||
    !passkeyChallenge ||
    passkeyChallenge.userId !== mfaChallenge.userId
  ) {
    if (passkeyChallenge) {
      await storage.deletePendingPasskeyChallenge(passkeyChallenge.id);
    }
    return await passkeySecondFactorFailureResponse(
      c,
      storage,
      config,
      mfaChallenge,
      locale,
      returnTo,
      "challenge",
    );
  }

  const credential = await storage.getPasskeyCredential(
    mfaChallenge.userId,
    credentialId,
  );
  if (!credential) {
    await recordPasskeyChallengeFailure(storage, passkeyChallenge);
    return await passkeySecondFactorFailureResponse(
      c,
      storage,
      config,
      mfaChallenge,
      locale,
      returnTo,
      "credential",
    );
  }

  const verification = await verifyPasskeyAssertionResponse(
    config,
    passkeyChallenge,
    credential,
    credentialResponse,
  );
  if (!verification?.verified) {
    await recordPasskeyChallengeFailure(storage, passkeyChallenge);
    return await passkeySecondFactorFailureResponse(
      c,
      storage,
      config,
      mfaChallenge,
      locale,
      returnTo,
      "code",
    );
  }

  const account = await storage.getAccountById(mfaChallenge.userId);
  if (!account) {
    await storage.deletePendingMfaChallenge(mfaChallenge.id);
    await storage.deletePendingPasskeyChallenge(passkeyChallenge.id);
    return c.redirect(mfaExpiredLoginRedirect(config, locale, returnTo), 303);
  }

  await storage.savePasskeyCredential(passkeyCredentialAfterAuthentication(
    credential,
    verification.authenticationInfo.newCounter,
  ));
  await storage.deletePendingMfaChallenge(mfaChallenge.id);
  await storage.deletePendingPasskeyChallenge(passkeyChallenge.id);
  logSecurityAuditEvent({
    code: "mfa_succeeded",
    details: { method: "passkey" },
    level: "info",
    message: "双重验证已完成。",
    request: c.req.raw,
    userId: mfaChallenge.userId,
  });

  return await redirectWithSession(
    c.req.url,
    returnTo,
    account,
    storage,
    config,
  );
}

/**
 * 校验邮箱二次验证 challenge 是否可用。
 *
 * @param {PendingEmailVerification | undefined} verification 邮箱验证码 challenge。
 * @param {PendingMfaChallenge} challenge MFA challenge。
 * @param {string} email 规范化邮箱。
 * @param {number} maxAttempts 最大尝试次数。
 * @return {"attempts" | "code" | "expired" | undefined} 不可用时返回错误码。
 */
function secondFactorEmailVerificationError(
  verification: PendingEmailVerification | undefined,
  challenge: PendingMfaChallenge,
  email: string,
  maxAttempts: number,
): "attempts" | "code" | "expired" | undefined {
  if (
    !verification ||
    verification.purpose !== "second_factor" ||
    verification.userId !== challenge.userId ||
    verification.email !== email
  ) {
    return "code";
  }

  if (Date.parse(verification.expiresAt) <= Date.now()) {
    return "expired";
  }

  return verification.attempts >= maxAttempts ? "attempts" : undefined;
}

/**
 * 记录 MFA challenge 失败尝试。
 *
 * @param {Storage} storage 应用存储。
 * @param {AuthConfig} config 认证配置。
 * @param {PendingMfaChallenge} challenge MFA challenge。
 * @return {Promise<"attempts" | undefined>} 达到最大尝试次数时返回 attempts。
 */
async function recordMfaChallengeFailure(
  storage: Storage,
  config: AuthConfig,
  challenge: PendingMfaChallenge,
): Promise<"attempts" | undefined> {
  const nextChallenge = nextMfaChallengeAttempt(challenge);
  const firstMethod = nextChallenge.allowedMethods[0] ?? "email";
  const error = mfaChallengeVerificationError(
    nextChallenge,
    firstMethod,
    config.mfa,
  );
  if (error === "attempts") {
    await storage.deletePendingMfaChallenge(challenge.id);
    return "attempts";
  }

  await storage.savePendingMfaChallenge(nextChallenge);
  return undefined;
}

/**
 * 记录邮箱验证码失败尝试。
 *
 * @param {Storage} storage 应用存储。
 * @param {AuthConfig} config 认证配置。
 * @param {PendingEmailVerification} verification 邮箱验证码 challenge。
 * @return {Promise<"attempts" | undefined>} 达到最大尝试次数时返回 attempts。
 */
async function recordEmailVerificationFailure(
  storage: Storage,
  config: AuthConfig,
  verification: PendingEmailVerification,
): Promise<"attempts" | undefined> {
  const attempts = verification.attempts + 1;
  if (attempts >= config.emailVerification.maxAttempts) {
    await storage.deletePendingEmailVerification(verification.id);
    return "attempts";
  }

  await storage.savePendingEmailVerification({ ...verification, attempts });
  return undefined;
}

/**
 * 记录 MFA 失败审计日志。
 *
 * @param {Request} request 原始请求。
 * @param {PendingMfaChallenge} challenge MFA challenge。
 * @param {string} reason 失败原因。
 */
function logMfaFailure(
  request: Request,
  challenge: PendingMfaChallenge,
  reason: string,
): void {
  logSecurityAuditEvent({
    code: "mfa_failed",
    details: { reason },
    level: "warn",
    message: "双重验证失败。",
    request,
    userId: challenge.userId,
  });
}

/**
 * 读取可渲染的 MFA challenge。
 *
 * @param {Storage} storage 应用存储。
 * @param {AuthConfig} config 认证配置。
 * @param {string | null} challengeId MFA challenge ID。
 * @return {Promise<PendingMfaChallenge | undefined>} 可渲染 challenge。
 */
async function getRenderableMfaChallenge(
  storage: Storage,
  config: AuthConfig,
  challengeId: string | null,
): Promise<PendingMfaChallenge | undefined> {
  const id = challengeId?.trim();
  if (!id) {
    return undefined;
  }

  const challenge = await storage.getPendingMfaChallenge(id);
  const firstMethod = challenge?.allowedMethods[0];
  if (!challenge || !firstMethod) {
    return undefined;
  }

  const error = mfaChallengeVerificationError(
    challenge,
    firstMethod,
    config.mfa,
  );
  if (error === "attempts" || error === "expired") {
    await storage.deletePendingMfaChallenge(challenge.id);
    return undefined;
  }

  return error ? undefined : challenge;
}

/**
 * 从表单读取二次验证方式。
 *
 * @param {FormDataEntryValue | FormDataEntryValue[] | undefined} value 表单字段值。
 * @return {SecondFactorMethod | undefined} 二次验证方式。
 */
function secondFactorMethodFromForm(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
): SecondFactorMethod | undefined {
  const method = Array.isArray(value) ? value[0] : value;
  return isSecondFactorMethod(method) ? method : undefined;
}

type PrimaryEmailLoginVerificationError = "attempts" | "code" | "expired";

/**
 * 校验邮箱登录验证码挑战是否可用。
 *
 * @param verification 待验证挑战。
 * @param email 规范化后的邮箱地址。
 * @param maxAttempts 最大尝试次数。
 * @return 不可继续时返回错误码。
 */
function primaryEmailLoginVerificationError(
  verification: Awaited<ReturnType<Storage["getPendingEmailVerification"]>>,
  email: string,
  maxAttempts: number,
): PrimaryEmailLoginVerificationError | undefined {
  if (
    !verification ||
    verification.purpose !== "primary_login" ||
    verification.email !== email
  ) {
    return "code";
  }

  if (Date.parse(verification.expiresAt) <= Date.now()) {
    return "expired";
  }

  return verification.attempts >= maxAttempts ? "attempts" : undefined;
}

/**
 * 记录邮箱主登录验证码失败次数。
 *
 * @param storage 应用存储。
 * @param config 认证配置。
 * @param verification 待验证挑战。
 * @return 记录完成后的 Promise。
 */
async function recordPrimaryEmailLoginFailure(
  storage: Storage,
  config: AuthConfig,
  verification: NonNullable<
    Awaited<ReturnType<Storage["getPendingEmailVerification"]>>
  >,
): Promise<void> {
  const attempts = verification.attempts + 1;
  if (attempts >= config.emailVerification.maxAttempts) {
    await storage.deletePendingEmailVerification(verification.id);
    return;
  }

  await storage.savePendingEmailVerification({ ...verification, attempts });
}

/**
 * 查找或创建邮箱登录对应的本地账号。
 *
 * @param storage 应用存储。
 * @param email 规范化后的邮箱地址。
 * @return 本地账号。
 */
async function findOrCreateEmailLoginAccount(
  storage: Storage,
  email: string,
): Promise<UserAccount> {
  const existingAccount = await findAccountByVerifiedEmail(storage, email);
  if (existingAccount) {
    return existingAccount;
  }

  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const account: UserAccount = {
      authVersion: 2,
      createdAt: now,
      emailVerified: true,
      id: crypto.randomUUID(),
      primaryEmail: email,
      username: emailLoginUsernameCandidate(email, attempt),
    };
    if (await storage.createAccount(account)) {
      await storage.saveEmailCredential({
        createdAt: now,
        email,
        lastVerifiedAt: now,
        userId: account.id,
        verified: true,
      });
      logSecurityAuditEvent({
        code: "email_login_account_created",
        details: { email: maskedEmailAddress(email) },
        level: "info",
        message: "邮箱验证码登录已创建本地账号。",
        userId: account.id,
      });
      return account;
    }
  }

  throw new Error("Could not create a unique email login account.");
}

/**
 * 按已验证邮箱查找本地账号。
 *
 * @param storage 应用存储。
 * @param email 规范化后的邮箱地址。
 * @return 匹配账号。
 */
async function findAccountByVerifiedEmail(
  storage: Storage,
  email: string,
): Promise<UserAccount | undefined> {
  for (const account of await storage.listAccounts()) {
    if (
      account.emailVerified &&
      normalizeEmailAddress(account.primaryEmail ?? "") === email
    ) {
      return account;
    }

    const credential = await storage.getEmailCredential(account.id, email);
    if (credential?.verified) {
      return account;
    }
  }

  return undefined;
}

/**
 * 确保邮箱登录账号记录了已验证邮箱凭证。
 *
 * @param storage 应用存储。
 * @param account 本地账号。
 * @param email 规范化后的邮箱地址。
 * @return 更新后的账号。
 */
async function ensureEmailLoginCredential(
  storage: Storage,
  account: UserAccount,
  email: string,
): Promise<UserAccount> {
  const now = new Date().toISOString();
  const existingCredential = await storage.getEmailCredential(
    account.id,
    email,
  );
  const credential: EmailCredential = {
    createdAt: existingCredential?.createdAt ?? now,
    email,
    lastVerifiedAt: now,
    userId: account.id,
    verified: true,
  };
  const nextAccount: UserAccount = {
    ...account,
    emailVerified: true,
    primaryEmail: email,
  };

  if (
    normalizeEmailAddress(account.primaryEmail ?? "") !== email ||
    !account.emailVerified
  ) {
    await storage.updateAccount(nextAccount);
  }
  await storage.saveEmailCredential(credential);
  return nextAccount;
}

/**
 * 生成邮箱登录新账号的候选用户名。
 *
 * @param email 规范化后的邮箱地址。
 * @param attempt 当前尝试次数。
 * @return 候选用户名。
 */
function emailLoginUsernameCandidate(email: string, attempt: number): string {
  const base = emailUsernameBase(email);
  if (attempt === 0 && validUsername(base)) {
    return base;
  }

  const suffix = base64UrlEncode(crypto.getRandomValues(new Uint8Array(4)))
    .toLowerCase()
    .slice(0, 6);
  const prefix = base.slice(0, Math.max(3, 39 - suffix.length));
  return `${prefix}-${suffix}`;
}

/**
 * 从邮箱 local-part 派生用户名基础值。
 *
 * @param email 规范化后的邮箱地址。
 * @return 用户名基础值。
 */
function emailUsernameBase(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const normalized = localPart
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 32);
  return validUsername(normalized) ? normalized : "email-user";
}

/**
 * 构造邮箱登录错误跳转地址。
 *
 * @param config 认证配置。
 * @param options 邮箱登录选项。
 * @param error 登录错误码。
 * @return 登录页地址。
 */
function emailLoginErrorRedirect(
  config: AuthConfig,
  options: EmailLoginOptions,
  error: "emailCode" | "emailInvalid",
): string {
  return authPagePath(config.loginPath, options.locale, {
    error,
    returnTo: options.returnTo,
    [authLocaleChangedParam]: options.syncLocale
      ? authLocaleChangedValue
      : undefined,
  });
}

/**
 * 生成 Passkey 登录 options 接口响应。
 *
 * @param authentication Passkey 认证 options 结果。
 * @return 可序列化响应体。
 */
function passkeyAuthenticationOptionsResponse(
  authentication: PasskeyAuthenticationOptionsResult,
) {
  return {
    challengeId: authentication.challenge.id,
    optionsJSON: authentication.optionsJSON,
  };
}

/**
 * 读取 JSON 请求体。
 *
 * @param c Hono 请求上下文。
 * @return JSON 对象，请求体无效时返回空对象。
 */
async function passkeyJsonPayload(
  c: Context,
): Promise<Record<string, unknown>> {
  try {
    const payload = await c.req.json();
    return isRecord(payload) ? payload : {};
  } catch {
    return {};
  }
}

/**
 * 从 JSON 请求体或请求头中读取 CSRF 令牌。
 *
 * @param payload JSON 请求体。
 * @param headerToken 请求头令牌。
 * @return 提交的 CSRF 令牌。
 */
function submittedJsonCsrfToken(
  payload: Record<string, unknown>,
  headerToken: string | undefined,
): string | undefined {
  return submittedCsrfToken(
    payload as Record<string, FormDataEntryValue | FormDataEntryValue[]>,
    headerToken,
  );
}

/**
 * 判断值是否为普通对象。
 *
 * @param value 待判断值。
 * @return 值为普通对象时返回 true。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 读取 Passkey assertion 中的凭证 ID。
 *
 * @param value Passkey assertion JSON。
 * @return 凭证 ID，缺失时返回空字符串。
 */
function passkeyCredentialId(value: unknown): string {
  return isRecord(value) && typeof value.id === "string" ? value.id.trim() : "";
}

/**
 * 检查 Passkey 认证 challenge 是否仍可使用。
 *
 * @param challenge 待检查 challenge。
 * @param purpose 期望用途。
 * @param credentialId 当前 assertion 使用的凭证 ID。
 * @return 不可用时返回错误码。
 */
function passkeyAuthenticationChallengeError(
  challenge: PendingPasskeyChallenge | undefined,
  purpose: Exclude<PasskeyChallengePurpose, "passkey_registration">,
  credentialId: string,
): "challenge" | undefined {
  if (!challenge || challenge.purpose !== purpose) {
    return "challenge";
  }

  if (Date.parse(challenge.expiresAt) <= Date.now()) {
    return "challenge";
  }

  if (challenge.attempts >= passkeyChallengeMaxAttempts) {
    return "challenge";
  }

  return challenge.allowedCredentialIds.length > 0 &&
      !challenge.allowedCredentialIds.includes(credentialId)
    ? "challenge"
    : undefined;
}

/**
 * 记录一次 Passkey challenge 失败尝试。
 *
 * @param storage 应用存储。
 * @param challenge 待更新 challenge。
 * @return 更新完成后的 Promise。
 */
async function recordPasskeyChallengeFailure(
  storage: Storage,
  challenge: PendingPasskeyChallenge,
): Promise<"attempts" | undefined> {
  const attempts = Math.max(0, challenge.attempts) + 1;
  if (attempts >= passkeyChallengeMaxAttempts) {
    await storage.deletePendingPasskeyChallenge(challenge.id);
    return "attempts";
  }

  await storage.savePendingPasskeyChallenge({ ...challenge, attempts });
  return undefined;
}

/**
 * 创建 Passkey MFA 失败响应。
 *
 * @param c Hono 请求上下文。
 * @param storage 应用存储。
 * @param config 认证配置。
 * @param challenge MFA challenge。
 * @param locale 当前页面语言。
 * @param returnTo 登录完成后返回路径。
 * @param reason 失败原因。
 * @return 失败响应。
 */
async function passkeySecondFactorFailureResponse(
  c: Context,
  storage: Storage,
  config: AuthConfig,
  challenge: PendingMfaChallenge,
  locale: Locale,
  returnTo: string,
  reason: string,
): Promise<Response> {
  const mfaFailure = await recordMfaChallengeFailure(
    storage,
    config,
    challenge,
  );
  logMfaFailure(c.req.raw, challenge, reason);
  return mfaFailure === "attempts"
    ? c.redirect(mfaExpiredLoginRedirect(config, locale, returnTo), 303)
    : c.json({ error: "failed" }, 400);
}

/**
 * 从 Passkey MFA JSON 中读取外层 MFA challenge ID。
 *
 * @param payload JSON 请求体。
 * @return MFA challenge ID。
 */
function passkeyMfaChallengeId(payload: Record<string, unknown>): string {
  return String(payload.mfaChallengeId ?? "").trim();
}

/**
 * 校验 Passkey 登录 assertion。
 *
 * @param config 认证配置。
 * @param challenge 待完成 Passkey challenge。
 * @param credential 已绑定 Passkey 凭证。
 * @param response 浏览器返回的 assertion。
 * @return 校验结果，校验过程失败时返回 undefined。
 */
async function verifyPasskeyAssertionResponse(
  config: AuthConfig,
  challenge: PendingPasskeyChallenge,
  credential: PasskeyCredential,
  response: Record<string, unknown>,
): Promise<Awaited<ReturnType<PasskeyAuthenticationVerifier>> | undefined> {
  try {
    return await config.passkeyAuthenticationVerifier({
      challenge,
      config: config.passkey,
      credential,
      requireUserVerification: config.passkey.userVerification === "required",
      response: response as never,
    });
  } catch {
    return undefined;
  }
}

/**
 * 合并认证选项和默认值。
 *
 * @param options 认证配置选项。
 * @return 规范化后的认证配置。
 */
function authConfig(options: AuthOptions): AuthConfig {
  const loginPath = options.loginPath ?? defaultLoginPath;
  const registerPath = options.registerPath ?? defaultRegisterPath;

  return {
    cookieName: options.cookieName ?? defaultCookieName,
    defaultLocale: options.defaultLocale ?? "zh-CN",
    emailVerification: options.emailVerification ??
      defaultEmailVerificationConfig,
    exemptPaths: new Set(
      options.exemptPaths ??
        [
          "/healthz",
          loginPath,
          registerPath,
          emailVerificationPath,
          googleCredentialPath,
          passkeyLoginOptionsPath,
          passkeyLoginPath,
          passkeyMfaOptionsPath,
          passkeyMfaPath,
          mfaPath,
          "/static/app.css",
        ],
    ),
    google: options.google ?? defaultGoogleAuthConfig,
    googleJwksFetch: options.googleJwksFetch,
    loginLockoutSeconds: options.loginLockoutSeconds ??
      defaultLoginLockoutSeconds,
    maxLoginFailures: options.maxLoginFailures ?? defaultMaxLoginFailures,
    loginPath,
    mfa: options.mfa,
    passkey: options.passkey ?? defaultPasskeyConfig,
    passkeyAuthenticationVerifier: options.passkeyAuthenticationVerifier ??
      verifyPasskeyAuthenticationResponse,
    registerPath,
    sendEmailVerificationEmail: options.sendEmailVerificationEmail,
    sessionMaxAgeSeconds: options.sessionMaxAgeSeconds ??
      defaultSessionMaxAgeSeconds,
    totp: options.totp ?? defaultTotpConfig,
    turnstile: options.turnstile ?? defaultTurnstileConfig,
    turnstileFetch: options.turnstileFetch,
  };
}

/**
 * 判断登录是否已经进入人机验证阶段。
 *
 * @param failure 登录失败记录。
 * @param config 认证配置。
 * @return 需要人机验证时返回 true。
 */
function loginRequiresTurnstile(
  failure: { failures: number; lockedUntil?: string } | undefined,
  config: AuthConfig,
): boolean {
  return config.turnstile.enabled &&
    (failure?.failures ?? 0) >= turnstileLoginFailureThreshold;
}

/**
 * 获取注册或验证状态下应渲染的 Turnstile site key。
 *
 * @param config 认证配置。
 * @return 需要渲染 Turnstile 时返回 site key。
 */
function turnstileSiteKey(config: AuthConfig): string | undefined {
  return config.turnstile.enabled && config.turnstile.siteKey
    ? config.turnstile.siteKey
    : undefined;
}

/**
 * 读取可用于前端 Google Identity Services 的 client ID。
 *
 * @param config 认证配置。
 * @return 已配置时返回 Google OAuth client ID。
 */
function googleClientId(config: AuthConfig): string | undefined {
  const clientId = config.google.clientId.trim();
  return clientId ? clientId : undefined;
}

/**
 * 获取登录页应渲染的 Turnstile site key。
 *
 * @param url 当前登录页 URL。
 * @param config 认证配置。
 * @return 登录页需要渲染 Turnstile 时返回 site key。
 */
function loginTurnstileSiteKey(
  url: URL,
  config: AuthConfig,
): string | undefined {
  return url.searchParams.get(authTurnstileRequiredParam) ===
      authTurnstileRequiredValue
    ? turnstileSiteKey(config)
    : undefined;
}

/**
 * 校验认证表单携带的人机验证结果。
 *
 * @param request 原始请求。
 * @param form 表单数据。
 * @param config 认证配置。
 * @return 校验失败时返回错误码列表，成功时返回 undefined。
 */
async function humanVerificationErrorCodes(
  request: Request,
  form:
    | Record<string, FormDataEntryValue | FormDataEntryValue[] | undefined>
    | FormData,
  config: AuthConfig,
): Promise<string[] | undefined> {
  const result = await verifyTurnstileToken(
    turnstileTokenFromForm(form),
    config.turnstile,
    {
      fetcher: config.turnstileFetch,
      remoteIp: remoteIpFromRequest(request),
    },
  );
  if (result.success) {
    return undefined;
  }

  logSecurityAuditEvent({
    code: "human_verification_failed",
    details: { errors: result.errorCodes.join(",") },
    level: "warn",
    message: "人机验证失败，已拒绝认证请求。",
    request,
  });

  return result.errorCodes;
}

/**
 * 从认证表单中读取 Turnstile 响应 token。
 *
 * @param form 表单数据。
 * @return Turnstile 响应 token。
 */
function turnstileTokenFromForm(
  form:
    | Record<string, FormDataEntryValue | FormDataEntryValue[] | undefined>
    | FormData,
): string | undefined {
  const value = form instanceof FormData
    ? form.get(turnstileResponseFieldName)
    : form[turnstileResponseFieldName];
  const firstValue = Array.isArray(value) ? value[0] : value;
  return typeof firstValue === "string" ? firstValue : undefined;
}

/**
 * 从请求头中读取可用于 Turnstile 校验的客户端地址。
 *
 * @param request 原始请求。
 * @return 客户端地址，不存在时返回 undefined。
 */
function remoteIpFromRequest(request: Request): string | undefined {
  return request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    undefined;
}

/**
 * 从表单中读取邮箱验证码用途。
 *
 * @param form 表单数据。
 * @return 合法用途，不合法时返回 undefined。
 */
function emailVerificationPurposeFromForm(
  form: Record<string, FormDataEntryValue | FormDataEntryValue[] | undefined>,
): EmailVerificationPurpose | undefined {
  const purpose = String(form.purpose ?? "");
  return isEmailVerificationPurpose(purpose) ? purpose : undefined;
}

/**
 * 判断当前阶段是否支持指定邮箱验证码用途。
 *
 * @param purpose 邮箱验证码用途。
 * @return 当前阶段支持时返回 true。
 */
function supportedEmailVerificationPurpose(
  purpose: EmailVerificationPurpose,
): boolean {
  return purpose === "email_binding" ||
    purpose === "primary_login" ||
    purpose === "second_factor";
}

/**
 * 遮罩邮箱地址用于审计日志。
 *
 * @param email 规范化后的邮箱地址。
 * @return 遮罩后的邮箱地址。
 */
function maskedEmailAddress(email: string): string {
  const [localPart, domain] = email.split("@");
  const visible = localPart.length <= 2
    ? localPart.slice(0, 1)
    : localPart.slice(0, 2);
  return `${visible}***@${domain ?? ""}`;
}

/**
 * 将用户显式选择的认证页语言同步到用户设置。
 *
 * @param userId 用户 ID。
 * @param locale 认证页当前语言。
 * @param storage 应用存储。
 * @return 同步完成后的 Promise。
 */
async function saveAuthLocale(
  userId: string,
  locale: Locale,
  storage: Storage,
): Promise<void> {
  const userStorage = storage.forUser(userId);
  const settings = await userStorage.getSettings();
  if (settings.locale === locale) {
    return;
  }

  await userStorage.saveSettings({ ...settings, locale });
}

/**
 * 对密码进行加盐哈希。
 *
 * @param password 原始密码。
 * @return 密码哈希、盐和迭代次数。
 */
export async function hashPassword(
  password: string,
): Promise<
  Pick<
    PasswordCredential,
    "passwordHash" | "passwordIterations" | "passwordSalt"
  >
> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt, passwordIterations);

  return {
    passwordHash: base64UrlEncode(hash),
    passwordIterations,
    passwordSalt: base64UrlEncode(salt),
  };
}

/**
 * 校验账号密码，必要时将旧账号密码字段迁移到独立凭证。
 *
 * @param password 原始密码。
 * @param account 用户账号。
 * @param storage 应用存储。
 * @return 密码匹配时返回 true。
 */
export async function verifyAccountPassword(
  password: string,
  account: UserAccount,
  storage: Storage,
): Promise<boolean> {
  if (await verifyPassword(password, account)) {
    await ensureAccountPasswordCredential(account, storage);
    return true;
  }

  if (hasLegacyPasswordFields(account)) {
    return false;
  }

  const credential = await storage.getPasswordCredential(account.id);
  return credential ? await verifyPassword(password, credential) : false;
}

/**
 * 将账号上的密码字段保存为独立密码凭证。
 *
 * @param account 用户账号。
 * @param storage 应用存储。
 * @return 保存完成后的 Promise。
 */
export async function saveAccountPasswordCredential(
  account: UserAccount,
  storage: Storage,
): Promise<void> {
  const credential = passwordCredentialFromAccount(account);
  if (!credential) {
    return;
  }

  await storage.savePasswordCredential(credential);
}

/**
 * 校验密码是否匹配账号密码哈希。
 *
 * @param password 原始密码。
 * @param credential 密码哈希字段。
 * @return 密码字段存在且匹配时返回 true。
 */
export async function verifyPassword(
  password: string,
  credential: Partial<
    Pick<
      PasswordCredential,
      "passwordHash" | "passwordIterations" | "passwordSalt"
    >
  >,
): Promise<boolean> {
  if (
    !credential.passwordHash ||
    !credential.passwordSalt ||
    !credential.passwordIterations
  ) {
    return false;
  }

  const hash = await derivePasswordHash(
    password,
    base64UrlDecode(credential.passwordSalt),
    credential.passwordIterations,
  );
  return constantTimeEquals(base64UrlEncode(hash), credential.passwordHash);
}

/**
 * 判断账号是否仍携带旧版密码字段。
 *
 * @param account 用户账号。
 * @return 旧版密码字段完整时返回 true。
 */
function hasLegacyPasswordFields(
  account: UserAccount,
): account is
  & UserAccount
  & Pick<
    PasswordCredential,
    "passwordHash" | "passwordIterations" | "passwordSalt"
  > {
  return Boolean(
    account.passwordHash && account.passwordSalt && account.passwordIterations,
  );
}

/**
 * 从账号旧版密码字段创建独立密码凭证。
 *
 * @param account 用户账号。
 * @return 密码字段完整时返回独立密码凭证。
 */
function passwordCredentialFromAccount(
  account: UserAccount,
): PasswordCredential | undefined {
  if (!hasLegacyPasswordFields(account)) {
    return undefined;
  }

  return {
    passwordHash: account.passwordHash,
    passwordIterations: account.passwordIterations,
    passwordSalt: account.passwordSalt,
    updatedAt: new Date().toISOString(),
    userId: account.id,
  };
}

/**
 * 确保旧账号密码字段已经迁移为独立密码凭证。
 *
 * @param account 用户账号。
 * @param storage 应用存储。
 * @return 保存完成后的 Promise。
 */
async function ensureAccountPasswordCredential(
  account: UserAccount,
  storage: Storage,
): Promise<void> {
  const credential = passwordCredentialFromAccount(account);
  if (!credential) {
    return;
  }

  const existing = await storage.getPasswordCredential(account.id);
  if (samePasswordCredential(existing, credential)) {
    return;
  }

  await storage.savePasswordCredential(credential);
}

/**
 * 判断两个密码凭证的哈希字段是否一致。
 *
 * @param left 已保存的密码凭证。
 * @param right 待保存的密码凭证。
 * @return 哈希字段一致时返回 true。
 */
function samePasswordCredential(
  left: PasswordCredential | undefined,
  right: PasswordCredential,
): boolean {
  return left?.passwordHash === right.passwordHash &&
    left.passwordIterations === right.passwordIterations &&
    left.passwordSalt === right.passwordSalt;
}

/**
 * 使用 PBKDF2 派生密码哈希。
 *
 * @param password 原始密码。
 * @param salt 密码盐。
 * @param iterations 迭代次数。
 * @return 派生出的密码哈希字节。
 */
async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      hash: "SHA-256",
      iterations,
      name: "PBKDF2",
      salt: arrayBufferFromBytes(salt),
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

/**
 * 将字节数组复制为 ArrayBuffer。
 *
 * @param value 原始字节数组。
 * @return 复制后的 ArrayBuffer。
 */
function arrayBufferFromBytes(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}

/**
 * 渲染登录或注册页面。
 *
 * @param options 认证页面渲染选项。
 * @return 完整认证页面 HTML。
 */
function renderAuthPage(options: {
  action: string;
  csrfToken: string;
  emailTurnstileSiteKey?: string;
  error?: string;
  googleClientId?: string;
  heading: string;
  locale: Locale;
  messages: Messages;
  mode: "login" | "register";
  returnTo: string;
  submitLabel: string;
  syncLocale: boolean;
  turnstileSiteKey?: string;
}): string {
  const switchPath = options.mode === "login" ? "/register" : "/login";
  const switchHref = authPagePath(switchPath, options.locale, {
    returnTo: options.returnTo,
    [authLocaleChangedParam]: options.syncLocale
      ? authLocaleChangedValue
      : undefined,
  });
  const switchLabel = options.mode === "login"
    ? options.messages.authCreateAccount
    : options.messages.authExistingAccountLogin;
  const languageOptionsHtml = renderLanguageOptions(
    options.action,
    options.locale,
    options.returnTo,
  );
  const direction = isRtlLocale(options.locale) ? "rtl" : "ltr";

  return `<!doctype html>
<html lang="${options.locale}" dir="${direction}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(options.heading)} - ${
    escapeHtml(options.messages.appName)
  }</title>
    <link rel="stylesheet" href="/static/app.css">
    ${
    turnstileScriptHtml(
      options.turnstileSiteKey ?? options.emailTurnstileSiteKey,
    )
  }
    ${googleScriptHtml(options.googleClientId)}
    <style>
      body {
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto 1fr;
      }

      .auth-shell {
        display: grid;
        place-items: center;
        padding: 24px;
      }

      .auth-panel {
        width: min(100%, 360px);
        display: grid;
        gap: 16px;
      }

      .auth-panel form,
      .auth-fields {
        display: grid;
        gap: 12px;
      }

      .auth-method-title {
        font-size: 0.95rem;
        font-weight: 700;
        margin: 4px 0 0;
      }

      .auth-google-method {
        display: grid;
        gap: 10px;
        min-height: 40px;
      }

      .auth-google-button {
        min-height: 40px;
        width: 100%;
      }

      .auth-google-button > div {
        margin-inline: auto;
      }

      .auth-passkey-method {
        display: grid;
        gap: 8px;
      }

      .auth-passkey-button {
        width: 100%;
      }

      .auth-passkey-status {
        color: var(--muted);
        font-size: 0.9rem;
        min-height: 18px;
      }

      .auth-passkey-status[data-state="error"] {
        color: #b42318;
      }

      .auth-email-code-row {
        align-items: center;
        display: grid;
        gap: 8px;
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .auth-email-status {
        color: var(--muted);
        font-size: 0.9rem;
        min-height: 18px;
      }

      .auth-email-status[data-state="error"] {
        color: #b42318;
      }

      .auth-panel h1 {
        margin: 0;
        font-size: 1.45rem;
      }

      .auth-error {
        color: #b42318;
        font-size: 0.92rem;
      }

      .auth-turnstile {
        min-height: 65px;
      }

      .auth-language-icon {
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
      }

      .auth-language-menu {
        align-self: stretch;
        position: relative;
      }

      .auth-language-button {
        align-items: center;
        color: var(--theme-link);
        cursor: pointer;
        display: inline-flex;
        font-weight: 700;
        gap: 8px;
        height: 100%;
        justify-content: center;
        list-style: none;
        min-width: 0;
        padding: 0 16px;
        user-select: none;
        white-space: nowrap;
      }

      .auth-language-button:focus {
        outline: none;
      }

      .auth-language-button::-webkit-details-marker {
        display: none;
      }

      .auth-language-button:hover,
      .auth-language-button:focus-visible {
        background: var(--theme-soft);
        text-decoration: none;
      }

      .auth-language-button:focus-visible {
        box-shadow: inset 0 -2px 0 var(--theme-link);
      }

      .auth-language-options {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 6px;
        box-shadow: 0 10px 20px var(--shadow-strong);
        display: grid;
        gap: 2px;
        min-width: 132px;
        overflow: hidden;
        padding: 4px;
        position: absolute;
        inset-inline-end: 0;
        top: calc(100% + 6px);
        z-index: 1;
      }

      .auth-language-options a {
        border-radius: 4px;
        color: var(--ink);
        display: block;
        font-size: 0.95rem;
        font-weight: 600;
        line-height: 1.25;
        min-height: 0;
        padding: 8px 12px;
        text-align: center;
        text-decoration: none;
      }

      .auth-language-options a:hover,
      .auth-language-options a:focus-visible,
      .auth-language-options a[aria-current="true"] {
        background: var(--theme-soft);
      }
    </style>
  </head>
  <body>
    <header class="topbar">
      <span class="brand">${escapeHtml(options.messages.appName)}</span>
      <nav class="primary-nav" aria-label="${
    escapeHtml(options.messages.authNavigation)
  }">
        <details class="auth-language-menu">
          <summary class="auth-language-button" title="${
    escapeHtml(options.messages.authLanguage)
  }">
            ${languageTextIcon("auth-language-icon")}
            <span>${escapeHtml(languageSwitcherLabel)}</span>
          </summary>
          <div class="auth-language-options" role="menu">
            ${languageOptionsHtml}
          </div>
        </details>
      </nav>
    </header>
    <main class="auth-shell">
      <section class="auth-panel">
        <h1>${escapeHtml(options.heading)}</h1>
        ${options.mode === "login" ? renderGoogleLoginForm(options) : ""}
        ${options.mode === "login" ? renderPasskeyLoginForm(options) : ""}
        <form method="post" action="${escapeHtml(options.action)}">
          ${csrfHiddenInput(options.csrfToken)}
          <input type="hidden" name="returnTo" value="${
    escapeHtml(options.returnTo)
  }">
          <div class="auth-fields">
            <label>
              ${escapeHtml(options.messages.authUsername)}
              <input name="username" dir="ltr" autocomplete="${
    options.mode === "login" ? "username webauthn" : "username"
  }" required autofocus>
            </label>
            <label>
              ${escapeHtml(options.messages.authPassword)}
              <input name="password" type="password" dir="ltr" autocomplete="${
    options.mode === "login" ? "current-password" : "new-password"
  }" required>
            </label>
            ${
    options.mode === "register"
      ? `<label>
              ${escapeHtml(options.messages.authConfirmPassword)}
              <input name="confirmPassword" type="password" dir="ltr" autocomplete="new-password" required>
            </label>`
      : ""
  }
          </div>
          ${turnstileWidgetHtml(options.turnstileSiteKey)}
          ${
    options.error
      ? `<div class="auth-error">${escapeHtml(options.error)}</div>`
      : ""
  }
          <button type="submit">${escapeHtml(options.submitLabel)}</button>
        </form>
        ${options.mode === "login" ? renderEmailLoginForm(options) : ""}
        <a href="${escapeHtml(switchHref)}">${escapeHtml(switchLabel)}</a>
      </section>
    </main>
    ${authEmailLoginScript(options.mode === "login")}
    ${authPasskeyLoginScript(options.mode === "login")}
    ${
    authGoogleLoginScript(
      options.mode === "login" && Boolean(options.googleClientId),
    )
  }
  </body>
</html>`;
}

/**
 * 渲染 Google 官方登录按钮容器和 credential 提交表单。
 *
 * @param options 认证页面渲染选项。
 * @return Google 登录 HTML。
 */
function renderGoogleLoginForm(options: {
  csrfToken: string;
  googleClientId?: string;
  locale: Locale;
  returnTo: string;
  syncLocale: boolean;
}): string {
  if (!options.googleClientId) {
    return "";
  }

  const action = authPagePath(googleCredentialPath, options.locale, {
    [authLocaleChangedParam]: options.syncLocale
      ? authLocaleChangedValue
      : undefined,
  });

  return `<div
          class="auth-google-method"
          data-google-login
          data-google-client-id="${escapeHtml(options.googleClientId)}"
        >
          <div class="auth-google-button" data-google-button></div>
          <form
            method="post"
            action="${escapeHtml(action)}"
            data-google-login-form
            hidden
          >
            ${csrfHiddenInput(options.csrfToken)}
            <input type="hidden" name="returnTo" value="${
    escapeHtml(options.returnTo)
  }">
            <input type="hidden" name="credential" data-google-credential>
            ${
    options.syncLocale
      ? `<input type="hidden" name="${authLocaleChangedParam}" value="${authLocaleChangedValue}">`
      : ""
  }
          </form>
        </div>`;
}

/**
 * 渲染 Passkey 登录按钮。
 *
 * @param options 认证页渲染选项。
 * @return Passkey 登录 HTML。
 */
function renderPasskeyLoginForm(options: {
  csrfToken: string;
  locale: Locale;
  messages: Messages;
  returnTo: string;
  syncLocale: boolean;
}): string {
  const action = authPagePath(passkeyLoginPath, options.locale, {
    [authLocaleChangedParam]: options.syncLocale
      ? authLocaleChangedValue
      : undefined,
  });

  return `<div
          class="auth-passkey-method"
          data-passkey-login
          data-passkey-conditional="1"
          data-passkey-options-url="${passkeyLoginOptionsPath}"
          data-passkey-login-url="${escapeHtml(action)}"
          data-passkey-failed="${
    escapeHtml(options.messages.authPasskeyFailed)
  }"
          data-passkey-signing-in="${
    escapeHtml(options.messages.authPasskeySigningIn)
  }"
          data-passkey-unsupported="${
    escapeHtml(options.messages.authPasskeyUnsupported)
  }"
        >
          <input type="hidden" data-passkey-csrf value="${
    escapeHtml(options.csrfToken)
  }">
          <input type="hidden" data-passkey-return-to value="${
    escapeHtml(options.returnTo)
  }">
          ${
    options.syncLocale
      ? `<input type="hidden" data-passkey-locale-changed value="${authLocaleChangedValue}">`
      : ""
  }
          <button type="button" class="secondary auth-passkey-button" data-passkey-login-button>
            ${escapeHtml(options.messages.authPasskeyLogin)}
          </button>
          <div
            class="auth-passkey-status"
            data-passkey-login-status
            role="status"
            hidden
          ></div>
        </div>`;
}

/**
 * 渲染邮箱验证码登录表单。
 *
 * @param options 认证页渲染选项。
 * @return 邮箱验证码登录表单 HTML。
 */
function renderEmailLoginForm(options: {
  action: string;
  csrfToken: string;
  emailTurnstileSiteKey?: string;
  messages: Messages;
  returnTo: string;
}): string {
  return `<div class="auth-method-title">${
    escapeHtml(options.messages.authEmailLogin)
  }</div>
        <form
          method="post"
          action="${escapeHtml(options.action)}"
          data-auth-email-login-form
          data-email-code-required="${
    escapeHtml(options.messages.authEmailCodeRequired)
  }"
          data-email-invalid="${escapeHtml(options.messages.authEmailInvalid)}"
          data-email-send-failed="${
    escapeHtml(options.messages.authEmailCodeFailed)
  }"
          data-email-sending="${
    escapeHtml(options.messages.authEmailSendingCode)
  }"
          data-email-sent="${escapeHtml(options.messages.authEmailCodeSent)}"
        >
          ${csrfHiddenInput(options.csrfToken)}
          <input type="hidden" name="authMethod" value="email">
          <input type="hidden" name="returnTo" value="${
    escapeHtml(options.returnTo)
  }">
          <input type="hidden" name="verificationId" data-auth-email-verification-id>
          <label>
            ${escapeHtml(options.messages.authEmail)}
            <input
              name="email"
              type="email"
              dir="ltr"
              autocomplete="email"
              data-auth-email-input
              required
            >
          </label>
          <label>
            ${escapeHtml(options.messages.authEmailCode)}
            <span class="auth-email-code-row">
              <input
                name="code"
                type="text"
                dir="ltr"
                inputmode="numeric"
                pattern="[0-9]{6}"
                autocomplete="one-time-code"
                data-auth-email-code-input
                required
              >
              <button type="button" class="secondary" data-auth-email-send-code-button>
                ${escapeHtml(options.messages.authEmailSendCode)}
              </button>
            </span>
          </label>
          ${turnstileWidgetHtml(options.emailTurnstileSiteKey)}
          <div
            class="auth-email-status"
            data-auth-email-status
            role="status"
            hidden
          ></div>
          <button type="submit">${
    escapeHtml(options.messages.authEmailLogin)
  }</button>
        </form>`;
}

/**
 * 渲染邮箱验证码登录的前端交互脚本。
 *
 * @param enabled 是否需要渲染脚本。
 * @return 交互脚本 HTML。
 */
/**
 * 渲染 MFA challenge 页面。
 *
 * @param options MFA 页面渲染选项。
 * @return 完整 MFA 页面 HTML。
 */
/**
 * 获取 MFA 错误提示。
 *
 * @param {string | null} value 错误码。
 * @param {Messages} messages 当前语言文案。
 * @return {string | undefined} 错误提示。
 */
function mfaErrorMessage(
  value: string | null,
  messages: Messages,
): string | undefined {
  switch (value) {
    case "attempts":
    case "expired":
      return messages.authMfaExpired;
    case "code":
    case "method":
      return messages.authMfaInvalid;
    case "unavailable":
      return messages.authMfaMethodUnavailable;
    default:
      return undefined;
  }
}

/**
 * 生成 MFA 错误跳转地址。
 *
 * @param {AuthConfig} config 认证配置。
 * @param {Locale} locale 当前语言。
 * @param {string} challengeId MFA challenge ID。
 * @param {string} returnTo 登录完成后返回路径。
 * @param {MfaErrorCode} error 错误码。
 * @return {string} MFA 错误跳转地址。
 */
function mfaErrorRedirect(
  locale: Locale,
  challengeId: string,
  returnTo: string,
  error: MfaErrorCode,
): string {
  return mfaPagePath(locale, challengeId, returnTo, { error });
}

/**
 * 生成 MFA 过期后的登录页跳转地址。
 *
 * @param {AuthConfig} config 认证配置。
 * @param {Locale} locale 当前语言。
 * @param {string} returnTo 登录完成后返回路径。
 * @return {string} 登录页跳转地址。
 */
function mfaExpiredLoginRedirect(
  config: AuthConfig,
  locale: Locale,
  returnTo: string,
): string {
  return authPagePath(config.loginPath, locale, {
    error: "mfaExpired",
    returnTo,
  });
}

function renderMfaPage(options: {
  action: string;
  challenge: PendingMfaChallenge;
  csrfToken: string;
  emailCredentials: EmailCredential[];
  error?: string;
  locale: Locale;
  messages: Messages;
  passkeyCredentials: PasskeyCredential[];
  returnTo: string;
}): string {
  const direction = isRtlLocale(options.locale) ? "rtl" : "ltr";
  const languageOptionsHtml = renderMfaLanguageOptions(
    options.challenge.id,
    options.locale,
    options.returnTo,
  );
  const emailForm = options.challenge.allowedMethods.includes("email")
    ? renderMfaEmailForm(options)
    : "";
  const totpForm = options.challenge.allowedMethods.includes("totp")
    ? renderMfaTotpForm(options)
    : "";
  const passkeyForm = options.challenge.allowedMethods.includes("passkey")
    ? renderMfaPasskeyForm(options)
    : "";
  const methodForms = `${emailForm}${totpForm}${passkeyForm}`;

  return `<!doctype html>
<html lang="${options.locale}" dir="${direction}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(options.messages.authMfaTitle)}</title>
    <style>
      body {
        background: #F6F2FB;
        color: #21182C;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
      }

      .topbar {
        align-items: center;
        display: flex;
        justify-content: space-between;
        padding: 20px clamp(20px, 4vw, 48px);
      }

      .brand {
        font-weight: 800;
      }

      .auth-language-button {
        align-items: center;
        background: #FFFFFF;
        border: 1px solid #E3D7F2;
        border-radius: 6px;
        cursor: pointer;
        display: inline-flex;
        gap: 6px;
        padding: 8px 12px;
      }

      .auth-language-icon {
        height: 18px;
        width: 18px;
      }

      .auth-language-options {
        background: #FFFFFF;
        border: 1px solid #E3D7F2;
        border-radius: 6px;
        display: grid;
        gap: 2px;
        margin-top: 6px;
        padding: 4px;
        position: absolute;
        z-index: 1;
      }

      .auth-language-options a {
        color: #21182C;
        font-weight: 600;
        padding: 8px 12px;
        text-decoration: none;
      }

      .auth-shell {
        display: grid;
        min-height: calc(100vh - 80px);
        place-items: center;
        padding: 24px;
      }

      .auth-panel {
        background: #FFFFFF;
        border: 1px solid #E3D7F2;
        border-radius: 8px;
        box-shadow: 0 20px 50px rgba(58, 35, 82, 0.12);
        display: grid;
        gap: 18px;
        max-width: 420px;
        padding: 28px;
        width: min(100%, 420px);
      }

      .auth-panel h1 {
        font-size: 1.6rem;
        margin: 0;
      }

      .auth-method-title,
      .mfa-method-list {
        color: #5F526D;
        font-size: 0.95rem;
        margin: 0;
      }

      .mfa-method-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        list-style: none;
        padding: 0;
      }

      .mfa-method-list li {
        background: #F6F2FB;
        border: 1px solid #E3D7F2;
        border-radius: 6px;
        padding: 6px 10px;
      }

      .auth-panel form {
        display: grid;
        gap: 14px;
      }

      label {
        display: grid;
        gap: 6px;
        font-weight: 700;
      }

      input,
      select {
        border: 1px solid #D8CCE8;
        border-radius: 6px;
        font: inherit;
        padding: 10px 12px;
      }

      button {
        background: #7C3AED;
        border: 0;
        border-radius: 6px;
        color: #FFFFFF;
        cursor: pointer;
        font: inherit;
        font-weight: 800;
        padding: 11px 14px;
      }

      button.secondary {
        background: #EFE7FA;
        color: #4B276F;
      }

      .auth-email-code-row {
        display: flex;
        gap: 8px;
      }

      .auth-email-code-row input {
        flex: 1;
        min-width: 0;
      }

      .auth-passkey-method {
        display: grid;
        gap: 8px;
      }

      .auth-passkey-button {
        width: 100%;
      }

      .auth-passkey-status {
        color: #5F526D;
        font-size: 0.92rem;
      }

      .auth-passkey-status[data-state="error"] {
        color: #B42318;
      }

      .auth-email-status,
      .auth-error {
        color: #5F526D;
        font-size: 0.92rem;
      }

      .auth-email-status[data-state="error"],
      .auth-error {
        color: #B42318;
      }
    </style>
  </head>
  <body>
    <header class="topbar">
      <span class="brand">${escapeHtml(options.messages.appName)}</span>
      <nav class="primary-nav" aria-label="${
    escapeHtml(options.messages.authNavigation)
  }">
        <details class="auth-language-menu">
          <summary class="auth-language-button" title="${
    escapeHtml(options.messages.authLanguage)
  }">
            ${languageTextIcon("auth-language-icon")}
            <span>${escapeHtml(languageSwitcherLabel)}</span>
          </summary>
          <div class="auth-language-options" role="menu">
            ${languageOptionsHtml}
          </div>
        </details>
      </nav>
    </header>
    <main class="auth-shell">
      <section class="auth-panel">
        <h1>${escapeHtml(options.messages.authMfaTitle)}</h1>
        <p class="auth-method-title">${
    escapeHtml(options.messages.authMfaRequired)
  }</p>
        ${
    renderMfaMethodList(options.challenge.allowedMethods, options.messages)
  }
        ${
    options.error
      ? `<div class="auth-error">${escapeHtml(options.error)}</div>`
      : ""
  }
        ${
    methodForms ||
    `<div class="auth-error">${
      escapeHtml(options.messages.authMfaMethodUnavailable)
    }</div>`
  }
      </section>
    </main>
    ${mfaEmailScript(Boolean(emailForm))}
    ${authPasskeyLoginScript(Boolean(passkeyForm))}
  </body>
</html>`;
}

/**
 * 渲染 MFA 邮箱验证码表单。
 *
 * @param options MFA 页面渲染选项。
 * @return 邮箱验证码表单 HTML。
 */
function renderMfaEmailForm(options: {
  action: string;
  challenge: PendingMfaChallenge;
  csrfToken: string;
  emailCredentials: EmailCredential[];
  messages: Messages;
  returnTo: string;
}): string {
  const credentials = verifiedEmailCredentials(options.emailCredentials);
  if (credentials.length === 0) {
    return "";
  }

  return `<form
          method="post"
          action="${escapeHtml(options.action)}"
          data-mfa-email-form
          data-email-code-required="${
    escapeHtml(options.messages.authEmailCodeRequired)
  }"
          data-email-send-failed="${
    escapeHtml(options.messages.authEmailCodeFailed)
  }"
          data-email-sending="${
    escapeHtml(options.messages.authEmailSendingCode)
  }"
          data-email-sent="${escapeHtml(options.messages.authEmailCodeSent)}"
        >
          ${csrfHiddenInput(options.csrfToken)}
          <input type="hidden" name="challengeId" value="${
    escapeHtml(options.challenge.id)
  }">
          <input type="hidden" name="method" value="email">
          <input type="hidden" name="returnTo" value="${
    escapeHtml(options.returnTo)
  }">
          <input type="hidden" name="verificationId" data-mfa-email-verification-id>
          <label>
            ${escapeHtml(options.messages.accountSecondFactorEmail)}
            <select name="email" data-mfa-email-input>
              ${
    credentials.map((credential) =>
      `<option value="${escapeHtml(credential.email)}">${
        escapeHtml(maskedEmailAddress(credential.email))
      }</option>`
    ).join("")
  }
            </select>
          </label>
          <label>
            ${escapeHtml(options.messages.authEmailCode)}
            <span class="auth-email-code-row">
              <input
                name="code"
                type="text"
                dir="ltr"
                inputmode="numeric"
                pattern="[0-9]{6}"
                autocomplete="one-time-code"
                data-mfa-email-code-input
                required
              >
              <button type="button" class="secondary" data-mfa-email-send-code-button>
                ${escapeHtml(options.messages.authEmailSendCode)}
              </button>
            </span>
          </label>
          <div
            class="auth-email-status"
            data-mfa-email-status
            role="status"
            hidden
          ></div>
          <button type="submit">${
    escapeHtml(options.messages.authMfaVerify)
  }</button>
        </form>`;
}

/**
 * 渲染 MFA Passkey 验证按钮。
 *
 * @param options MFA 页面渲染选项。
 * @return Passkey 验证按钮 HTML。
 */
function renderMfaPasskeyForm(options: {
  challenge: PendingMfaChallenge;
  csrfToken: string;
  messages: Messages;
  passkeyCredentials: PasskeyCredential[];
  returnTo: string;
}): string {
  if (options.passkeyCredentials.length === 0) {
    return "";
  }

  return `<div
          class="auth-passkey-method"
          data-passkey-login
          data-passkey-options-url="${passkeyMfaOptionsPath}"
          data-passkey-login-url="${passkeyMfaPath}"
          data-passkey-failed="${
    escapeHtml(options.messages.authPasskeyFailed)
  }"
          data-passkey-signing-in="${
    escapeHtml(options.messages.authPasskeySigningIn)
  }"
          data-passkey-unsupported="${
    escapeHtml(options.messages.authPasskeyUnsupported)
  }"
        >
          <input type="hidden" data-passkey-csrf value="${
    escapeHtml(options.csrfToken)
  }">
          <input type="hidden" data-passkey-return-to value="${
    escapeHtml(options.returnTo)
  }">
          <input type="hidden" data-passkey-mfa-challenge value="${
    escapeHtml(options.challenge.id)
  }">
          <button type="button" class="secondary auth-passkey-button" data-passkey-login-button>
            ${escapeHtml(options.messages.authPasskeyVerify)}
          </button>
          <div
            class="auth-passkey-status"
            data-passkey-login-status
            role="status"
            hidden
          ></div>
        </div>`;
}

/**
 * 渲染 MFA 验证器动态码表单。
 *
 * @param options MFA 页面渲染选项。
 * @return 验证器动态码表单 HTML。
 */
function renderMfaTotpForm(options: {
  action: string;
  challenge: PendingMfaChallenge;
  csrfToken: string;
  messages: Messages;
  returnTo: string;
}): string {
  return `<form
          method="post"
          action="${escapeHtml(options.action)}"
          data-mfa-totp-form
        >
          ${csrfHiddenInput(options.csrfToken)}
          <input type="hidden" name="challengeId" value="${
    escapeHtml(options.challenge.id)
  }">
          <input type="hidden" name="method" value="totp">
          <input type="hidden" name="returnTo" value="${
    escapeHtml(options.returnTo)
  }">
          <label>
            ${escapeHtml(options.messages.accountSecondFactorTotp)}
            <input
              name="code"
              type="text"
              dir="ltr"
              inputmode="numeric"
              pattern="[0-9]{6}"
              autocomplete="one-time-code"
              data-mfa-totp-code-input
              required
            >
          </label>
          <button type="submit">${
    escapeHtml(options.messages.authMfaVerify)
  }</button>
        </form>`;
}

/**
 * 渲染 MFA 允许的验证方式列表。
 *
 * @param {SecondFactorMethod[]} methods 允许的二次验证方式。
 * @param {Messages} messages 当前语言文案。
 * @return {string} 验证方式列表 HTML。
 */
function renderMfaMethodList(
  methods: SecondFactorMethod[],
  messages: Messages,
): string {
  return `<ul class="mfa-method-list" aria-label="${
    escapeHtml(messages.authMfaChooseMethod)
  }">
    ${
    methods.map((method) =>
      `<li data-mfa-method="${escapeHtml(method)}">${
        escapeHtml(secondFactorMethodLabel(method, messages))
      }</li>`
    ).join("")
  }
  </ul>`;
}

/**
 * 渲染 MFA 页面语言选项。
 *
 * @param {string} challengeId MFA challenge ID。
 * @param {Locale} currentLocale 当前语言。
 * @param {string} returnTo 登录完成后返回路径。
 * @return {string} 语言选项 HTML。
 */
function renderMfaLanguageOptions(
  challengeId: string,
  currentLocale: Locale,
  returnTo: string,
): string {
  return languageOptions.map((option) => {
    const currentAttribute = option.code === currentLocale
      ? ' aria-current="true"'
      : "";
    return `<a href="${
      escapeHtml(mfaPagePath(
        option.code,
        challengeId,
        returnTo,
        { [authLocaleChangedParam]: authLocaleChangedValue },
      ))
    }" role="menuitem"${currentAttribute}>${escapeHtml(option.label)}</a>`;
  }).join("");
}

/**
 * 筛选已验证邮箱凭证。
 *
 * @param {EmailCredential[]} credentials 邮箱凭证列表。
 * @return {EmailCredential[]} 已验证邮箱凭证。
 */
function verifiedEmailCredentials(
  credentials: EmailCredential[],
): EmailCredential[] {
  return credentials.filter((credential) => credential.verified)
    .toSorted((left, right) => left.email.localeCompare(right.email));
}

/**
 * 获取二次验证方式文案。
 *
 * @param {SecondFactorMethod} method 二次验证方式。
 * @param {Messages} messages 当前语言文案。
 * @return {string} 二次验证方式文案。
 */
function secondFactorMethodLabel(
  method: SecondFactorMethod,
  messages: Messages,
): string {
  switch (method) {
    case "email":
      return messages.accountSecondFactorEmail;
    case "passkey":
      return messages.accountSecondFactorPasskey;
    case "recoveryCode":
      return messages.accountSecondFactorRecoveryCode;
    case "totp":
      return messages.accountSecondFactorTotp;
  }
}

/**
 * 渲染 MFA 邮箱验证码发送脚本。
 *
 * @param {boolean} enabled 是否启用脚本。
 * @return {string} 脚本 HTML。
 */
function mfaEmailScript(enabled: boolean): string {
  return enabled
    ? `<script>
(() => {
  const form = document.querySelector("[data-mfa-email-form]");
  if (!(form instanceof HTMLFormElement)) return;
  const emailInput = form.querySelector("[data-mfa-email-input]");
  const codeInput = form.querySelector("[data-mfa-email-code-input]");
  const verificationIdInput = form.querySelector("[data-mfa-email-verification-id]");
  const sendButton = form.querySelector("[data-mfa-email-send-code-button]");
  const status = form.querySelector("[data-mfa-email-status]");
  if (!(emailInput instanceof HTMLSelectElement) || !(codeInput instanceof HTMLInputElement) || !(verificationIdInput instanceof HTMLInputElement) || !(sendButton instanceof HTMLButtonElement)) return;
  const csrfInput = form.querySelector("input[name='${csrfFieldName}']");
  const challengeInput = form.querySelector("input[name='challengeId']");
  const csrfToken = () => csrfInput instanceof HTMLInputElement ? csrfInput.value : "";
  const challengeId = () => challengeInput instanceof HTMLInputElement ? challengeInput.value : "";
  const setStatus = (message, state = "") => {
    if (!(status instanceof HTMLElement)) return;
    status.textContent = message;
    status.hidden = message.length === 0;
    if (state === "error") status.dataset.state = "error";
    else delete status.dataset.state;
  };
  const bodyFromForm = () => {
    const body = new URLSearchParams();
    body.set("${csrfFieldName}", csrfToken());
    body.set("challengeId", challengeId());
    body.set("email", emailInput.value);
    body.set("purpose", "second_factor");
    return body;
  };
  emailInput.addEventListener("change", () => {
    verificationIdInput.value = "";
    codeInput.value = "";
    setStatus("");
  });
  codeInput.addEventListener("input", () => setStatus(""));
  sendButton.addEventListener("click", async (event) => {
    event.preventDefault();
    sendButton.disabled = true;
    setStatus(form.dataset.emailSending || "");
    try {
      const response = await fetch("${emailVerificationPath}", {
        body: bodyFromForm(),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "${csrfHeaderName}": csrfToken(),
        },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.id !== "string") {
        verificationIdInput.value = "";
        setStatus(form.dataset.emailSendFailed || "", "error");
        return;
      }
      verificationIdInput.value = payload.id;
      codeInput.value = "";
      setStatus(form.dataset.emailSent || "");
      codeInput.focus();
    } catch {
      verificationIdInput.value = "";
      setStatus(form.dataset.emailSendFailed || "", "error");
    } finally {
      sendButton.disabled = false;
    }
  });
  form.addEventListener("submit", (event) => {
    if (verificationIdInput.value.trim()) return;
    event.preventDefault();
    setStatus(form.dataset.emailCodeRequired || "", "error");
    sendButton.focus();
  });
})();
</script>`
    : "";
}

function authEmailLoginScript(enabled: boolean): string {
  return enabled
    ? `<script>
(() => {
  const form = document.querySelector("[data-auth-email-login-form]");
  if (!(form instanceof HTMLFormElement)) return;
  const emailInput = form.querySelector("[data-auth-email-input]");
  const codeInput = form.querySelector("[data-auth-email-code-input]");
  const verificationIdInput = form.querySelector("[data-auth-email-verification-id]");
  const sendButton = form.querySelector("[data-auth-email-send-code-button]");
  const status = form.querySelector("[data-auth-email-status]");
  if (!(emailInput instanceof HTMLInputElement) || !(codeInput instanceof HTMLInputElement) || !(verificationIdInput instanceof HTMLInputElement) || !(sendButton instanceof HTMLButtonElement)) return;
  const csrfInput = form.querySelector("input[name='${csrfFieldName}']");
  const csrfToken = () => csrfInput instanceof HTMLInputElement ? csrfInput.value : "";
  const setStatus = (message, state = "") => {
    if (!(status instanceof HTMLElement)) return;
    status.textContent = message;
    status.hidden = message.length === 0;
    if (state === "error") status.dataset.state = "error";
    else delete status.dataset.state;
  };
  const bodyFromForm = () => {
    const body = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === "string") body.set(key, value);
    }
    body.set("${csrfFieldName}", csrfToken());
    body.set("purpose", "primary_login");
    return body;
  };
  const resetTurnstile = () => {
    if (globalThis.turnstile && typeof globalThis.turnstile.reset === "function") {
      globalThis.turnstile.reset();
    }
  };
  emailInput.addEventListener("input", () => {
    verificationIdInput.value = "";
    setStatus("");
  });
  codeInput.addEventListener("input", () => setStatus(""));
  sendButton.addEventListener("click", async (event) => {
    event.preventDefault();
    if (!emailInput.checkValidity()) {
      setStatus(form.dataset.emailInvalid || "", "error");
      emailInput.reportValidity();
      return;
    }
    sendButton.disabled = true;
    setStatus(form.dataset.emailSending || "");
    try {
      const response = await fetch("${emailVerificationPath}", {
        body: bodyFromForm(),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "${csrfHeaderName}": csrfToken(),
        },
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.id !== "string") {
        verificationIdInput.value = "";
        setStatus(form.dataset.emailSendFailed || "", "error");
        return;
      }
      verificationIdInput.value = payload.id;
      codeInput.value = "";
      setStatus(form.dataset.emailSent || "");
      codeInput.focus();
    } catch {
      verificationIdInput.value = "";
      setStatus(form.dataset.emailSendFailed || "", "error");
    } finally {
      sendButton.disabled = false;
      resetTurnstile();
    }
  });
  form.addEventListener("submit", (event) => {
    if (verificationIdInput.value.trim()) return;
    event.preventDefault();
    setStatus(form.dataset.emailCodeRequired || "", "error");
    emailInput.focus();
  });
})();
</script>`
    : "";
}

/**
 * 渲染 Passkey 登录的前端交互脚本。
 *
 * @param enabled 是否需要渲染脚本。
 * @return 交互脚本 HTML。
 */
function authPasskeyLoginScript(enabled: boolean): string {
  return enabled
    ? `<script>
(() => {
  const root = document.querySelector("[data-passkey-login]");
  if (!(root instanceof HTMLElement)) return;
  const button = root.querySelector("[data-passkey-login-button]");
  const csrfInput = root.querySelector("[data-passkey-csrf]");
  const returnToInput = root.querySelector("[data-passkey-return-to]");
  const mfaChallengeInput = root.querySelector("[data-passkey-mfa-challenge]");
  const localeChangedInput = root.querySelector("[data-passkey-locale-changed]");
  const status = root.querySelector("[data-passkey-login-status]");
  if (!(button instanceof HTMLButtonElement) || !(csrfInput instanceof HTMLInputElement) || !(returnToInput instanceof HTMLInputElement)) return;

  const optionsUrl = root.dataset.passkeyOptionsUrl || "";
  const loginUrl = root.dataset.passkeyLoginUrl || "";
  let conditionalAbortController;
  const csrfToken = () => csrfInput.value;
  const setStatus = (message, state = "") => {
    if (!(status instanceof HTMLElement)) return;
    status.textContent = message;
    status.hidden = message.length === 0;
    if (state === "error") status.dataset.state = "error";
    else delete status.dataset.state;
  };
  const supportsPasskey = () =>
    Boolean(globalThis.PublicKeyCredential && navigator.credentials?.get);
  const csrfHeaders = () => ({
    "content-type": "application/json",
    "${csrfHeaderName}": csrfToken(),
  });
  const basePayload = () => {
    const body = { "${csrfFieldName}": csrfToken() };
    if (mfaChallengeInput instanceof HTMLInputElement) {
      body.mfaChallengeId = mfaChallengeInput.value;
    }
    return body;
  };
  const fetchOptions = async () => {
    const response = await fetch(optionsUrl, {
      body: JSON.stringify(basePayload()),
      headers: csrfHeaders(),
      method: "POST",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.challengeId !== "string" || !payload.optionsJSON) {
      throw new Error("Passkey options unavailable.");
    }
    return payload;
  };
  const submitCredential = async (challengeId, credential) => {
    const body = {
      ...basePayload(),
      challengeId,
      credential: assertionCredentialToJson(credential),
      returnTo: returnToInput.value,
    };
    if (localeChangedInput instanceof HTMLInputElement) {
      body["${authLocaleChangedParam}"] = localeChangedInput.value;
    }
    const response = await fetch(loginUrl, {
      body: JSON.stringify(body),
      headers: csrfHeaders(),
      method: "POST",
    });
    if (response.redirected) {
      const url = new URL(response.url);
      globalThis.location.assign(url.pathname + url.search + url.hash);
      return;
    }
    const payload = await response.json().catch(() => ({}));
    if (response.ok && typeof payload.redirectTo === "string") {
      globalThis.location.assign(payload.redirectTo);
      return;
    }
    throw new Error("Passkey login failed.");
  };
  const beginPasskeyLogin = async ({ conditional = false } = {}) => {
    if (!supportsPasskey()) {
      if (!conditional) {
        button.disabled = true;
        setStatus(root.dataset.passkeyUnsupported || "", "error");
      }
      return;
    }
    if (!conditional) {
      conditionalAbortController?.abort();
      button.disabled = true;
      setStatus(root.dataset.passkeySigningIn || "");
    }
    try {
      const payload = await fetchOptions();
      const controller = conditional ? new AbortController() : undefined;
      if (conditional) conditionalAbortController = controller;
      const credential = await navigator.credentials.get({
        publicKey: requestOptionsFromJson(payload.optionsJSON),
        ...(conditional ? { mediation: "conditional", signal: controller?.signal } : {}),
      });
      if (!credential) return;
      setStatus(root.dataset.passkeySigningIn || "");
      await submitCredential(payload.challengeId, credential);
    } catch (error) {
      if (conditional && error?.name === "AbortError") return;
      if (!conditional) setStatus(root.dataset.passkeyFailed || "", "error");
    } finally {
      if (!conditional) button.disabled = false;
    }
  };
  button.addEventListener("click", () => {
    void beginPasskeyLogin();
  });
  document.addEventListener("submit", () => {
    conditionalAbortController?.abort();
  }, { capture: true });
  const startConditionalLogin = async () => {
    if (root.dataset.passkeyConditional !== "1") return;
    if (!supportsPasskey() || typeof PublicKeyCredential.isConditionalMediationAvailable !== "function") {
      return;
    }
    const available = await PublicKeyCredential.isConditionalMediationAvailable()
      .catch(() => false);
    if (available) {
      void beginPasskeyLogin({ conditional: true });
    }
  };
  void startConditionalLogin();
})();

function requestOptionsFromJson(options) {
  return {
    ...options,
    allowCredentials: Array.isArray(options.allowCredentials)
      ? options.allowCredentials.map(credentialDescriptorFromJson)
      : undefined,
    challenge: base64UrlToArrayBuffer(options.challenge),
  };
}

function credentialDescriptorFromJson(descriptor) {
  return {
    ...descriptor,
    id: base64UrlToArrayBuffer(descriptor.id),
  };
}

function assertionCredentialToJson(credential) {
  const response = credential.response || {};
  return {
    authenticatorAttachment: typeof credential.authenticatorAttachment === "string"
      ? credential.authenticatorAttachment
      : undefined,
    clientExtensionResults: typeof credential.getClientExtensionResults === "function"
      ? credential.getClientExtensionResults()
      : {},
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    response: {
      authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      signature: arrayBufferToBase64Url(response.signature),
      userHandle: optionalArrayBufferToBase64Url(response.userHandle),
    },
    type: credential.type,
  };
}

function base64UrlToArrayBuffer(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function optionalArrayBufferToBase64Url(value) {
  return value instanceof ArrayBuffer ? arrayBufferToBase64Url(value) : undefined;
}

function arrayBufferToBase64Url(value) {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
</script>`
    : "";
}

/**
 * 渲染 Google Identity Services 登录交互脚本。
 *
 * @param enabled 是否需要渲染脚本。
 * @return 交互脚本 HTML。
 */
function authGoogleLoginScript(enabled: boolean): string {
  return enabled
    ? `<script>
(() => {
  const root = document.querySelector("[data-google-login]");
  if (!(root instanceof HTMLElement)) return;
  const form = root.querySelector("[data-google-login-form]");
  const credentialInput = root.querySelector("[data-google-credential]");
  const button = root.querySelector("[data-google-button]");
  const clientId = root.dataset.googleClientId || "";
  if (!clientId || !(form instanceof HTMLFormElement) || !(credentialInput instanceof HTMLInputElement) || !(button instanceof HTMLElement)) return;
  const submitCredential = (response) => {
    const credential = typeof response?.credential === "string" ? response.credential.trim() : "";
    if (!credential) return;
    credentialInput.value = credential;
    form.submit();
  };
  const initialize = () => {
    const googleIdentity = globalThis.google?.accounts?.id;
    if (!googleIdentity) return;
    googleIdentity.initialize({
      client_id: clientId,
      callback: submitCredential,
      use_fedcm_for_prompt: true,
    });
    googleIdentity.renderButton(button, {
      logo_alignment: "left",
      shape: "rectangular",
      size: "large",
      text: "continue_with",
      theme: "outline",
      type: "standard",
      width: Math.min(320, Math.max(240, Math.floor(button.getBoundingClientRect().width || 320))),
    });
    googleIdentity.prompt();
  };
  if (globalThis.google?.accounts?.id) initialize();
  else globalThis.addEventListener("load", initialize, { once: true });
})();
</script>`
    : "";
}

/**
 * 渲染 Google Identity Services 官方脚本。
 *
 * @param clientId Google OAuth client ID。
 * @return 启用 Google 登录时返回脚本 HTML。
 */
function googleScriptHtml(clientId: string | undefined): string {
  return clientId
    ? `<script src="https://accounts.google.com/gsi/client" async defer></script>`
    : "";
}

/**
 * 渲染 Turnstile 官方脚本。
 *
 * @param siteKey Turnstile site key。
 * @return 启用 Turnstile 时返回脚本 HTML。
 */
function turnstileScriptHtml(siteKey: string | undefined): string {
  return siteKey
    ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
    : "";
}

/**
 * 渲染 Turnstile 表单组件。
 *
 * @param siteKey Turnstile site key。
 * @return 启用 Turnstile 时返回组件 HTML。
 */
function turnstileWidgetHtml(siteKey: string | undefined): string {
  return siteKey
    ? `<div class="auth-turnstile cf-turnstile" data-sitekey="${
      escapeHtml(siteKey)
    }"></div>`
    : "";
}

/**
 * 获取认证页应该使用的语言。
 *
 * @param url 当前请求 URL。
 * @param acceptLanguage 浏览器语言请求头。
 * @param config 认证配置。
 * @return 认证页语言。
 */
function authPageLocale(
  url: URL,
  acceptLanguage: string | undefined,
  config: AuthConfig,
): Locale {
  const queryLocale = localeFromLanguageTag(url.searchParams.get("locale"));
  if (queryLocale) {
    return queryLocale;
  }

  for (const part of acceptLanguage?.split(",") ?? []) {
    const locale = localeFromLanguageTag(part.split(";")[0]?.trim());
    if (locale) {
      return locale;
    }
  }

  return config.defaultLocale;
}

/**
 * 判断认证页语言是否来自用户显式切换。
 *
 * @param url 当前请求 URL。
 * @return 需要在认证成功后同步语言时返回 true。
 */
function shouldSyncAuthLocale(url: URL): boolean {
  return url.searchParams.get(authLocaleChangedParam) ===
    authLocaleChangedValue;
}

/**
 * 将语言标签匹配到应用支持的语言。
 *
 * @param value 原始语言标签。
 * @return 支持的语言标识，无法匹配时返回 undefined。
 */
function localeFromLanguageTag(
  value: string | null | undefined,
): Locale | undefined {
  const normalized = value?.toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const exactOption = languageOptions.find((option) =>
    option.code.toLowerCase() === normalized
  );
  if (exactOption) {
    return exactOption.code;
  }

  const languageCode = normalized.split("-")[0];
  return languageOptions.find((option) =>
    option.code.toLowerCase().split("-")[0] === languageCode
  )
    ?.code;
}

/**
 * 创建携带认证页语言的路径。
 *
 * @param path 基础路径。
 * @param locale 语言标识。
 * @param params 额外查询参数。
 * @return 携带查询参数的认证页路径。
 */
function authPagePath(
  path: string,
  locale: Locale,
  params: Record<string, string | undefined> = {},
): string {
  const searchParams = new URLSearchParams({ locale });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      searchParams.set(key, value);
    }
  }
  return `${path}?${searchParams.toString()}`;
}

/**
 * 生成 MFA 页面路径。
 *
 * @param {Locale} locale 当前页面语言。
 * @param {string} challengeId MFA challenge ID。
 * @param {string} returnTo 登录完成后返回路径。
 * @param {Record<string, string | undefined>} params 额外查询参数。
 * @return {string} MFA 页面路径。
 */
function mfaPagePath(
  locale: Locale,
  challengeId: string,
  returnTo: string,
  params: Record<string, string | undefined> = {},
): string {
  return authPagePath(mfaPath, locale, {
    challenge: challengeId,
    returnTo,
    ...params,
  });
}

/**
 * 渲染认证页可用语言选项，并标记用户显式切换。
 *
 * @param action 当前认证页路径。
 * @param currentLocale 当前语言。
 * @param returnTo 登录后返回路径。
 * @return 语言选项 HTML。
 */
function renderLanguageOptions(
  action: string,
  currentLocale: Locale,
  returnTo: string,
): string {
  const actionPath = action.split("?")[0] ?? action;
  return languageOptions.map((option) => {
    const currentAttribute = option.code === currentLocale
      ? ' aria-current="true"'
      : "";
    return `<a href="${
      escapeHtml(authPagePath(actionPath, option.code, {
        returnTo,
        [authLocaleChangedParam]: authLocaleChangedValue,
      }))
    }" role="menuitem"${currentAttribute}>${escapeHtml(option.label)}</a>`;
  }).join("");
}

/**
 * 获取登录错误提示。
 *
 * @param value 错误代码。
 * @param messages 当前语言文案。
 * @return 登录错误提示，不需要展示时返回 undefined。
 */
function loginErrorMessage(
  value: string | null,
  messages: Messages,
): string | undefined {
  switch (value) {
    case "emailCode":
      return messages.authEmailCodeInvalid;
    case "emailInvalid":
      return messages.authEmailInvalid;
    case "google":
      return messages.authGoogleInvalid;
    case "googleUnavailable":
      return messages.authGoogleUnavailable;
    case "invalid":
      return messages.authInvalidCredentials;
    case "mfaUnavailable":
      return messages.authMfaUnavailable;
    case "mfaExpired":
      return messages.authMfaExpired;
    case "rateLimited":
      return messages.authLoginRateLimited;
    case "humanVerification":
      return messages.authHumanVerificationRequired;
    default:
      return undefined;
  }
}

/**
 * 生成主登录失败后的登录页重定向地址。
 *
 * @param {AuthConfig} config 认证配置。
 * @param {PrimaryLoginCompletionOptions} options 主认证完成选项。
 * @param {string} error 错误码。
 * @return {string} 登录页重定向地址。
 */
function primaryLoginErrorRedirect(
  config: AuthConfig,
  options: PrimaryLoginCompletionOptions,
  error: string,
): string {
  return authPagePath(config.loginPath, options.locale, {
    error,
    returnTo: options.returnTo,
    [authLocaleChangedParam]: options.syncLocale
      ? authLocaleChangedValue
      : undefined,
  });
}

/**
 * 判断登录失败记录是否仍在锁定期内。
 *
 * @param failure 登录失败记录。
 * @return 当前仍被锁定时返回 true。
 */
function isLoginLocked(failure: { lockedUntil?: string } | undefined): boolean {
  return failure?.lockedUntil !== undefined &&
    Date.parse(failure.lockedUntil) > Date.now();
}

/**
 * 创建登录频率受限时的重定向响应。
 *
 * @param loginPath 登录路径。
 * @param returnTo 登录成功后的返回路径。
 * @param locale 当前页面语言。
 * @param syncLocale 是否需要在认证成功后同步语言设置。
 * @return 重定向响应。
 */
function loginRateLimitedRedirect(
  loginPath: string,
  returnTo: string,
  locale: Locale,
  syncLocale: boolean,
): Response {
  return new Response(null, {
    headers: {
      location: authPagePath(loginPath, locale, {
        error: "rateLimited",
        returnTo,
        [authLocaleChangedParam]: syncLocale
          ? authLocaleChangedValue
          : undefined,
      }),
    },
    status: 303,
  });
}

/**
 * 获取注册错误提示。
 *
 * @param value 错误代码。
 * @param messages 当前语言文案。
 * @return 注册错误提示，不需要展示时返回 undefined。
 */
function registerErrorMessage(
  value: string | null,
  messages: Messages,
): string | undefined {
  switch (value) {
    case "exists":
      return messages.authUsernameExists;
    case "password":
      return messages.authPasswordMinLength;
    case "confirmPassword":
      return messages.authPasswordConfirmationMismatch;
    case "username":
      return messages.authUsernameInvalid;
    case "humanVerification":
      return messages.authHumanVerificationRequired;
    default:
      return undefined;
  }
}

/**
 * 校验注册输入。
 *
 * @param username 用户名。
 * @param password 密码。
 * @param confirmPassword 确认密码。
 * @return 错误代码，校验通过时返回 undefined。
 */
function validateRegistration(
  username: string,
  password: string,
  confirmPassword: string,
): string | undefined {
  if (!validUsername(username)) {
    return "username";
  }

  if (password.length < 8) {
    return "password";
  }

  if (password !== confirmPassword) {
    return "confirmPassword";
  }

  return undefined;
}

/**
 * 判断用户名是否符合账号规则。
 *
 * @param username 用户名。
 * @return 用户名有效时返回 true。
 */
export function validUsername(username: string): boolean {
  return /^[a-z0-9_-]{3,40}$/.test(username);
}

/**
 * 规范化认证完成后的返回路径。
 *
 * @param value 原始返回路径。
 * @return 安全的站内返回路径。
 */
function safeReturnTo(value: string | null): string {
  if (!value) {
    return "/";
  }

  try {
    const url = new URL(value, "http://local");
    if (
      url.origin !== "http://local" ||
      url.pathname === "/login" ||
      url.pathname === "/register" ||
      url.pathname === mfaPath
    ) {
      return "/";
    }
    return pathWithSearch(url);
  } catch {
    return "/";
  }
}

/**
 * 拼接 URL 的路径和查询参数。
 *
 * @param url URL 对象。
 * @return 路径和查询参数。
 */
function pathWithSearch(url: URL): string {
  return `${url.pathname}${url.search}`;
}

/**
 * 规范化用户名。
 *
 * @param value 原始用户名。
 * @return 小写并去除首尾空白后的用户名。
 */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 将 Base64URL 字符串解码为字节数组。
 *
 * @param value Base64URL 字符串。
 * @return 解码后的字节数组。
 */
function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
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
