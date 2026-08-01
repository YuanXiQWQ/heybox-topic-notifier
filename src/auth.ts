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
  PasswordCredential,
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

export { readAuthSession } from "./auth/session.ts";
export type { AuthSession } from "./auth/session.ts";

/**
 * 认证模块使用的存储类型。
 */
type Storage = ReturnType<typeof createKvStorage>;

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
  registerPath?: string;
  emailVerification?: EmailVerificationConfig;
  sendEmailVerificationEmail?: EmailVerificationEmailSender;
  sessionMaxAgeSeconds?: number;
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
  registerPath: string;
  sendEmailVerificationEmail?: EmailVerificationEmailSender;
  sessionMaxAgeSeconds: number;
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
 * 默认 Google 认证配置。
 */
const defaultGoogleAuthConfig: GoogleAuthConfig = googleAuthConfigFromEnv(
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
    return await redirectWithSession(
      c.req.url,
      returnTo,
      account,
      storage,
      config,
    );
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
    if (purpose === "email_binding" && !session) {
      return c.json({ error: "authenticationRequired" }, 401);
    }

    const clientLimitResponse = await rateLimitExceededResponseFor(
      storage,
      publicRateLimitPolicies.emailVerificationClient,
      `${clientRateLimitIdentifier((name) => c.req.header(name))}:${purpose}`,
      { request: c.req.raw, userId: session?.userId },
    );
    if (clientLimitResponse) {
      return clientLimitResponse;
    }

    const humanVerificationErrors = await humanVerificationErrorCodes(
      c.req.raw,
      form,
      config,
    );
    if (humanVerificationErrors) {
      return c.json({ error: "humanVerification" }, 403);
    }

    const targetLimitResponse = await rateLimitExceededResponseFor(
      storage,
      publicRateLimitPolicies.emailVerificationTarget,
      `email:${email}:purpose:${purpose}`,
      { request: c.req.raw, userId: session?.userId },
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
        userId: session?.userId,
      });
      return c.json({ error: "emailVerificationUnavailable" }, 503);
    }

    let challenge: Awaited<ReturnType<typeof createEmailVerificationChallenge>>;
    try {
      challenge = await createEmailVerificationChallenge({
        config: config.emailVerification,
        email,
        purpose,
        userId: session?.userId,
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
          userId: session?.userId,
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
        userId: session?.userId,
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
      userId: session?.userId,
    });

    return c.json({
      expiresAt: challenge.verification.expiresAt,
      id: challenge.verification.id,
      ok: true,
    });
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

type GoogleAccountResult = {
  account: UserAccount;
  created: boolean;
};

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

  return await redirectWithSession(
    c.req.url,
    options.returnTo,
    result.account,
    storage,
    config,
  );
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

  return await redirectWithSession(
    c.req.url,
    options.returnTo,
    verifiedAccount,
    storage,
    config,
  );
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
          "/static/app.css",
        ],
    ),
    google: options.google ?? defaultGoogleAuthConfig,
    googleJwksFetch: options.googleJwksFetch,
    loginLockoutSeconds: options.loginLockoutSeconds ??
      defaultLoginLockoutSeconds,
    maxLoginFailures: options.maxLoginFailures ?? defaultMaxLoginFailures,
    loginPath,
    registerPath,
    sendEmailVerificationEmail: options.sendEmailVerificationEmail,
    sessionMaxAgeSeconds: options.sessionMaxAgeSeconds ??
      defaultSessionMaxAgeSeconds,
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
  return purpose === "email_binding" || purpose === "primary_login";
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
        <form method="post" action="${escapeHtml(options.action)}">
          ${csrfHiddenInput(options.csrfToken)}
          <input type="hidden" name="returnTo" value="${
    escapeHtml(options.returnTo)
  }">
          <div class="auth-fields">
            <label>
              ${escapeHtml(options.messages.authUsername)}
              <input name="username" dir="ltr" autocomplete="username" required autofocus>
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
    case "rateLimited":
      return messages.authLoginRateLimited;
    case "humanVerification":
      return messages.authHumanVerificationRequired;
    default:
      return undefined;
  }
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
      url.pathname === "/register"
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
