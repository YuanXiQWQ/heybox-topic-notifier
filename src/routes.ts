/**
 * @file 本文件负责创建应用业务路由并解析设置表单。
 */
import { type Context, Hono } from "@hono/hono";
// @ts-types="npm:@types/qrcode@^1.5.5"
import QRCode from "qrcode";
import {
  hashPassword,
  normalizeUsername,
  readAuthSession,
  saveAccountPasswordCredential,
  validUsername,
  verifyAccountPassword,
} from "./auth.ts";
import { normalizeEmailAddress } from "./auth/email.ts";
import { verifyEmailVerificationCode } from "./auth/email_verification.ts";
import {
  assertValidUserSecuritySettings,
  availableSecondFactorMethods,
  MfaConfigurationError,
  normalizeUserSecuritySettings,
} from "./auth/mfa.ts";
import {
  createTotpSecretMaterial,
  defaultTotpIssuer,
  TotpConfigError,
  totpOtpAuthUri,
  verifyEncryptedTotpCode,
} from "./auth/totp.ts";
import {
  createRecoveryCodes,
  hashRecoveryCodes,
  RecoveryCodeConfigError,
  verifyRecoveryCodeHash,
} from "./auth/recovery_codes.ts";
import {
  createPasskeyAuthenticationOptions,
  createPasskeyRegistrationOptions,
  defaultPasskeyRpName,
  type PasskeyAuthenticationOptionsResult,
  passkeyCredentialAfterAuthentication,
  passkeyCredentialFromRegistration,
  type PasskeyRegistrationOptionsResult,
  verifyPasskeyAuthenticationResponse,
  verifyPasskeyRegistrationResponse,
} from "./auth/passkey.ts";
import {
  createStrongAuthenticationEvent,
  isRecentStrongAuthenticationEvent,
} from "./auth/reauth.ts";
import {
  getMessages,
  localeFromRequest,
  normalizeLocale,
} from "./locales/index.ts";
import {
  csrfForbiddenResponse,
  csrfHeaderName,
  csrfTokenForRequest,
  submittedCsrfToken,
  verifyCsrfToken,
  withCsrfCookie,
} from "./security/csrf.ts";
import { auditText, logSecurityAuditEvent } from "./security/audit_log.ts";
import {
  clientRateLimitIdentifier,
  publicRateLimitPolicies,
  rateLimitExceededResponseFor,
  type RateLimitPolicy,
  userRateLimitIdentifier,
} from "./security/rate_limit.ts";
import type {
  AppSettings,
  AuthenticationEventMethod,
  AuthenticationEventPurpose,
  EmailCredential,
  KeywordRule,
  MatchLocation,
  PendingEmailVerification,
  PendingPasskeyChallenge,
  PollIntervalUnit,
  PollSort,
  SecondFactorMethod,
  TopicRule,
  TotpCredential,
  UserSecuritySettings,
} from "./models.ts";
import {
  normalizeNotificationEmailService,
  normalizeNotificationWebhookService,
} from "./notification_services.ts";
import type { AppContext } from "./services/app_context.ts";
import { renderDashboard } from "./views/dashboard.ts";
import { renderPendingMatches } from "./views/dashboard.ts";
import { renderHistory, renderHistoryTable } from "./views/history.ts";
import {
  applyMatchTableQuery,
  matchTableSignature,
  parseMatchTableQuery,
} from "./views/match_table.ts";
import { renderSettings } from "./views/settings.ts";
import {
  createRandomTestMatchRecord,
  NotificationConfigError,
  NotificationDeliveryError,
} from "./services/notifier.ts";

/**
 * 设置表单中支持的关键词匹配位置。
 */
const matchLocations: MatchLocation[] = [
  "title",
  "body",
  "comments",
  "replies",
];
/**
 * 单次请求内的认证会话读取缓存。
 */
const authSessionPromisesByRequest = new WeakMap<
  Request,
  ReturnType<typeof readAuthSession>
>();
/**
 * Passkey challenge 单次最多允许的失败次数。
 */
const passkeyChallengeMaxAttempts = 5;
/**
 * 手动轮询后用于触发前端进度条重置的查询参数名。
 */
const pollResetParam = "pollReset";
/**
 * 手动轮询前进度条起始宽度查询参数名。
 */
const pollResetStartParam = "pollResetStart";
/**
 * 命中记录表局部刷新请求头。
 */
const matchTableRefreshHeader = "x-match-table-refresh";
/**
 * 新生成恢复码允许首次展示的时长（毫秒）。
 */
const recoveryCodeRevealTtlMs = 10 * 60 * 1000;

/**
 * Passkey 路由可注入的测试依赖。
 */
type PasskeyRouteContext = AppContext & {
  passkeyAuthenticationVerifier?: typeof verifyPasskeyAuthenticationResponse;
  passkeyRegistrationVerifier?: typeof verifyPasskeyRegistrationResponse;
};

/**
 * 创建应用业务路由。
 *
 * @param context 应用运行时上下文。
 * @return Hono 路由应用。
 */
export function createRoutes(context: AppContext): Hono {
  const app = new Hono();

  app.get("/healthz", (c) =>
    c.json({
      deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID") ?? "local",
      service: "heybox-topic-notifier",
      status: "ok",
    }));

  app.get("/", async (c) => {
    const url = new URL(c.req.url);
    const storage = await storageForRequest(c, context);
    const { pendingMatches, settings, state } = await storage
      .getDashboardSnapshot();
    const pendingTable = applyMatchTableQuery(
      pendingMatches,
      parseMatchTableQuery(new URL(c.req.url).searchParams),
    );
    const csrf = csrfTokenForRequest(c.req.header("cookie"), c.req.url);
    return withCsrfCookie(
      c.html(renderDashboard({
        csrfToken: csrf.token,
        initialNextPollProgress: initialNextPollProgress(url.searchParams),
        pendingTable,
        returnTo: withoutPollResetFlag(`${url.pathname}${url.search}`),
        settings,
        state,
      })),
      csrf,
    );
  });

  app.get("/dashboard-state", async (c) => {
    const url = new URL(c.req.url);
    url.searchParams.delete("tick");
    const storage = await storageForRequest(c, context);
    return await dashboardStateResponse(c, storage, url.searchParams);
  });

  app.post("/dashboard-state/tick", async (c) => {
    if (!validCsrfForRequest(c, {})) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitResponseForRequest(
      c,
      context,
      publicRateLimitPolicies.manualPoll,
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const session = await authSessionForRequest(c, context);
    if (session) {
      await context.scheduler.tickUser(session.userId);
    } else {
      await context.scheduler.tick();
    }

    const url = new URL(c.req.url);
    const storage = await storageForRequest(c, context);
    return await dashboardStateResponse(c, storage, url.searchParams);
  });

  /**
   * 返回仪表盘状态 JSON。
   *
   * @param {Context} c Hono 请求上下文。
   * @param {Awaited<ReturnType<typeof storageForRequest>>} storage 当前用户作用域存储。
   * @param {URLSearchParams} searchParams 仪表盘表格查询参数。
   * @return {Promise<Response>} 仪表盘状态 JSON 响应。
   */
  async function dashboardStateResponse(
    c: Context,
    storage: Awaited<ReturnType<typeof storageForRequest>>,
    searchParams: URLSearchParams,
  ): Promise<Response> {
    const { pendingMatches, settings, state } = await storage
      .getDashboardSnapshot();
    const pendingTable = applyMatchTableQuery(
      pendingMatches,
      parseMatchTableQuery(searchParams),
    );
    const messages = getMessages(settings.locale);
    const csrf = csrfTokenForRequest(c.req.header("cookie"), c.req.url);

    return withCsrfCookie(
      c.json({
        lastPollAt: state.lastPollAt ?? null,
        latestMatch: state.latestMatch
          ? {
            title: state.latestMatch.post.title,
            url: state.latestMatch.post.url,
          }
          : null,
        pendingHtml: renderPendingMatches(
          pendingTable,
          messages,
          settings.locale,
          csrf.token,
        ),
        pendingSignature: matchTableSignature(pendingTable),
        polling: {
          enabled: settings.polling.enabled,
          intervalUnit: settings.polling.intervalUnit,
          intervalValue: settings.polling.intervalValue,
        },
        totalMatches: state.totalMatches,
      }),
      csrf,
    );
  }

  /**
   * 返回待处理命中表格局部刷新 HTML。
   *
   * @param c Hono 请求上下文。
   * @param storage 当前用户作用域存储。
   * @param returnTo 表格当前路径和查询参数。
   * @return 待处理命中表格 HTML 响应。
   */
  async function pendingMatchesTableResponse(
    c: Context,
    storage: Awaited<ReturnType<typeof storageForRequest>>,
    returnTo: string,
  ): Promise<Response> {
    const url = new URL(returnTo, "http://local");
    const { pendingMatches, settings } = await storage.getDashboardSnapshot();
    const table = applyMatchTableQuery(
      pendingMatches,
      parseMatchTableQuery(url.searchParams),
    );
    const csrf = csrfTokenForRequest(c.req.header("cookie"), c.req.url);
    const messages = getMessages(settings.locale);

    return withCsrfCookie(
      c.html(
        renderPendingMatches(table, messages, settings.locale, csrf.token),
      ),
      csrf,
    );
  }

  /**
   * 返回历史命中表格局部刷新 HTML。
   *
   * @param c Hono 请求上下文。
   * @param storage 当前用户作用域存储。
   * @param returnTo 表格当前路径和查询参数。
   * @return 历史命中表格 HTML 响应。
   */
  async function historyTableResponse(
    c: Context,
    storage: Awaited<ReturnType<typeof storageForRequest>>,
    returnTo: string,
  ): Promise<Response> {
    const url = new URL(returnTo, "http://local");
    const settings = await storage.getSettings();
    const history = await storage.listHistory();
    const table = applyMatchTableQuery(
      history,
      parseMatchTableQuery(url.searchParams),
    );
    const csrf = csrfTokenForRequest(c.req.header("cookie"), c.req.url);
    const messages = getMessages(settings.locale);

    return withCsrfCookie(
      c.html(renderHistoryTable(table, messages, settings.locale, csrf.token)),
      csrf,
    );
  }

  app.get("/settings", async (c) => {
    const url = new URL(c.req.url);
    const storage = await storageForRequest(c, context);
    const session = await authSessionForRequest(c, context);
    const settings = await storage.getSettings();
    const account = session
      ? await context.storage.getAccountById(session.userId)
      : undefined;
    const emailCredentials = session
      ? await context.storage.listEmailCredentials(session.userId)
      : [];
    const totpCredentials = session
      ? await context.storage.listTotpCredentials(session.userId)
      : [];
    const passkeyCredentials = session
      ? await context.storage.listPasskeyCredentials(session.userId)
      : [];
    const googleIdentities = session
      ? await context.storage.listAuthIdentitiesForUser(
        "google",
        session.userId,
      )
      : [];
    const passwordCredential = session
      ? await context.storage.getPasswordCredential(session.userId)
      : undefined;
    const reauthEvent = session
      ? await context.storage.getAuthenticationEvent(session.userId, "reauth")
      : undefined;
    const securitySettings = session
      ? await context.storage.getUserSecuritySettings(session.userId)
      : undefined;
    const recoveryCodeRevealId = url.searchParams.get("recoveryCodes")
      ?.trim();
    let recoveryCodes: string[] | undefined;
    if (session && recoveryCodeRevealId) {
      const reveal = await context.storage.getPendingRecoveryCodeReveal(
        recoveryCodeRevealId,
      );
      if (reveal?.userId === session.userId) {
        await context.storage.deletePendingRecoveryCodeReveal(reveal.id);
        if (Date.parse(reveal.expiresAt) > Date.now()) {
          recoveryCodes = reveal.codes;
        }
      }
    }
    let totpStatus = totpBindingStatusFromSearch(url.searchParams);
    let totpSetup: TotpSetupView | undefined;
    if (session && account && url.searchParams.get("totpSetup") === "1") {
      try {
        const material = await createTotpSecretMaterial(context.config.totp);
        const otpAuthUri = totpOtpAuthUri({
          accountName: account.primaryEmail ?? account.username,
          digits: context.config.totp.digits,
          issuer: context.config.totp.issuer === defaultTotpIssuer
            ? getMessages(settings.locale).appName
            : context.config.totp.issuer,
          periodSeconds: context.config.totp.periodSeconds,
          secretBase32: material.secretBase32,
        });
        totpSetup = {
          qrCodeDataUrl: await QRCode.toDataURL(otpAuthUri, {
            errorCorrectionLevel: "M",
            margin: 2,
            width: 240,
          }),
          secretBase32: material.secretBase32,
          secretEncrypted: material.secretEncrypted,
        };
      } catch (error) {
        if (!(error instanceof TotpConfigError)) {
          throw error;
        }
        totpStatus = { code: "config", type: "error" };
      }
    }
    const csrf = csrfTokenForRequest(c.req.header("cookie"), c.req.url);
    return withCsrfCookie(
      c.html(renderSettings({
        account,
        accountStatus: accountStatusFromSearch(url.searchParams),
        csrfToken: csrf.token,
        emailBindingStatus: emailBindingStatusFromSearch(url.searchParams),
        emailCredentials,
        googleBindingStatus: googleBindingStatusFromSearch(url.searchParams),
        googleClientId: settingsGoogleClientId(context),
        googleIdentity: googleIdentities[0],
        passkeyBindingStatus: passkeyBindingStatusFromSearch(
          url.searchParams,
        ),
        passkeyCredentials,
        reauthPasswordAvailable: Boolean(
          account?.passwordHash || passwordCredential,
        ),
        reauthRecentlyVerified: isRecentStrongAuthenticationEvent(
          reauthEvent,
          context.config.reauth,
        ),
        recoveryCodes,
        secondFactorMethods: availableSecondFactorMethods({
          emailCredentials,
          passkeyCredentials,
          totpCredentials,
        }),
        securitySettings,
        securityStatus: securitySettingsStatusFromSearch(url.searchParams),
        settings,
        totpBindingStatus: totpStatus,
        totpCredentials,
        totpSetup,
        turnstileSiteKey: settingsTurnstileSiteKey(context),
      })),
      csrf,
    );
  });

  app.post("/account", async (c) => {
    const session = await authSessionForRequest(c, context);
    if (!session) {
      return c.redirect(settingsLoginRedirect(c, context), 303);
    }

    const account = await context.storage.getAccountById(session.userId);
    if (!account) {
      return c.redirect(accountSettingsRedirect("notFound"), 303);
    }

    const form = await c.req.parseBody();
    const accountAction = String(form.accountAction ?? "");
    const username = normalizeUsername(String(form.username ?? ""));
    const currentPassword = String(form.currentPassword ?? "");
    const newPassword = String(form.newPassword ?? "");
    const confirmPassword = String(form.confirmPassword ?? "");

    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }
    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (accountAction !== "username" && accountAction !== "password") {
      return c.redirect("/settings", 303);
    }

    const recentlyReauthenticated = await hasRecentStrongReauth(
      context,
      session.userId,
    );
    if (!recentlyReauthenticated) {
      if (
        !(await verifyAccountPassword(
          currentPassword,
          account,
          context.storage,
        ))
      ) {
        return c.redirect(
          accountSettingsRedirect("currentPassword", accountAction),
          303,
        );
      }
      await saveStrongReauthEvent(context, session.userId, "password");
    }

    if (accountAction === "username") {
      if (!validUsername(username)) {
        return c.redirect(accountSettingsRedirect("username", "username"), 303);
      }

      const updated = await context.storage.updateAccount({
        ...account,
        username,
      });
      if (!updated) {
        return c.redirect(accountSettingsRedirect("exists", "username"), 303);
      }

      return c.redirect("/settings?account=updated", 303);
    }

    if (accountAction === "password") {
      if (newPassword.length < 8) {
        return c.redirect(accountSettingsRedirect("password", "password"), 303);
      }

      if (newPassword !== confirmPassword) {
        return c.redirect(
          accountSettingsRedirect("confirmPassword", "password"),
          303,
        );
      }

      if (await verifyAccountPassword(newPassword, account, context.storage)) {
        return c.redirect(
          accountSettingsRedirect("samePassword", "password"),
          303,
        );
      }

      const nextAccount = {
        ...account,
        ...(await hashPassword(newPassword)),
      };
      const updated = await context.storage.updateAccount(nextAccount);
      if (!updated) {
        return c.redirect(accountSettingsRedirect("notFound"), 303);
      }
      await saveAccountPasswordCredential(nextAccount, context.storage);

      logSecurityAuditEvent({
        code: "password_changed",
        level: "warn",
        message: "账号密码已修改。",
        request: c.req.raw,
        userId: session.userId,
      });

      return c.redirect("/settings?account=updated", 303);
    }

    return c.redirect("/settings", 303);
  });

  app.post("/account/verify-password", async (c) => {
    const session = await authSessionForRequest(c, context);
    if (!session) {
      return new Response(null, { status: 401 });
    }

    const account = await context.storage.getAccountById(session.userId);
    if (!account) {
      return new Response(null, { status: 404 });
    }

    const form = await c.req.parseBody();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }
    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const currentPassword = String(form.currentPassword ?? "");
    if (
      await verifyAccountPassword(currentPassword, account, context.storage)
    ) {
      await saveStrongReauthEvent(context, session.userId, "password");
      return new Response(null, { status: 204 });
    }

    return new Response(null, { status: 403 });
  });

  app.post("/account/reauth/password", async (c) => {
    const session = await authSessionForRequest(c, context);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const account = await context.storage.getAccountById(session.userId);
    if (!account) {
      return c.json({ error: "notFound" }, 404);
    }

    const form = await c.req.parseBody();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const currentPassword = String(form.currentPassword ?? "");
    if (
      !await verifyAccountPassword(currentPassword, account, context.storage)
    ) {
      logSecurityAuditEvent({
        code: "reauth_failed",
        details: { method: "password" },
        level: "warn",
        message: "敏感操作再认证失败。",
        request: c.req.raw,
        userId: session.userId,
      });
      return c.json({ error: "failed" }, 403);
    }

    await saveStrongReauthEvent(
      context,
      session.userId,
      "password",
      reauthPurposeFromValue(form.reauthPurpose),
    );
    logSecurityAuditEvent({
      code: "reauth_succeeded",
      details: { method: "password" },
      level: "info",
      message: "敏感操作再认证成功。",
      request: c.req.raw,
      userId: session.userId,
    });

    return c.json({ ok: true });
  });

  app.post("/account/reauth/totp", async (c) => {
    const session = await authSessionForRequest(c, context);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    if (!await context.storage.getAccountById(session.userId)) {
      return c.json({ error: "notFound" }, 404);
    }

    const form = await c.req.parseBody();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const credentials = await context.storage.listTotpCredentials(
      session.userId,
    );
    if (credentials.length === 0) {
      return c.json({ error: "unavailable" }, 400);
    }

    let validCode = false;
    try {
      validCode = await verifyTotpCodeAgainstCredentials(
        String(form.code ?? ""),
        credentials,
        context.config.totp,
      );
    } catch (error) {
      if (!(error instanceof TotpConfigError)) {
        throw error;
      }
      return c.json({ error: "unavailable" }, 503);
    }

    if (!validCode) {
      logSecurityAuditEvent({
        code: "reauth_failed",
        details: { method: "totp" },
        level: "warn",
        message: "敏感操作再认证失败。",
        request: c.req.raw,
        userId: session.userId,
      });
      return c.json({ error: "failed" }, 403);
    }

    await saveStrongReauthEvent(
      context,
      session.userId,
      "totp",
      reauthPurposeFromValue(form.reauthPurpose),
    );
    logSecurityAuditEvent({
      code: "reauth_succeeded",
      details: { method: "totp" },
      level: "info",
      message: "敏感操作再认证成功。",
      request: c.req.raw,
      userId: session.userId,
    });

    return c.json({ ok: true });
  });

  app.post("/account/reauth/recovery-code", async (c) => {
    const session = await authSessionForRequest(c, context);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    if (!await context.storage.getAccountById(session.userId)) {
      return c.json({ error: "notFound" }, 404);
    }

    const form = await c.req.parseBody();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const credentials = await context.storage.listTotpCredentials(
      session.userId,
    );
    if (
      !credentials.some((credential) => credential.recoveryCodeHashes.length)
    ) {
      return c.json({ error: "unavailable" }, 400);
    }

    let updatedCredential: TotpCredential | undefined;
    try {
      updatedCredential = await credentialAfterRecoveryCodeUse(
        credentials,
        String(form.code ?? ""),
        context.config.totp.secretEncryptionKey,
      );
    } catch (error) {
      if (!(error instanceof RecoveryCodeConfigError)) {
        throw error;
      }
      return c.json({ error: "unavailable" }, 503);
    }

    if (!updatedCredential) {
      logSecurityAuditEvent({
        code: "reauth_failed",
        details: { method: "recovery_code" },
        level: "warn",
        message: "敏感操作再认证失败。",
        request: c.req.raw,
        userId: session.userId,
      });
      return c.json({ error: "failed" }, 403);
    }

    await context.storage.saveTotpCredential(updatedCredential);
    await saveStrongReauthEvent(
      context,
      session.userId,
      "recovery_code",
    );
    logSecurityAuditEvent({
      code: "reauth_succeeded",
      details: { method: "recovery_code" },
      level: "info",
      message: "已使用一次性恢复码完成敏感操作确认。",
      request: c.req.raw,
      userId: session.userId,
    });

    return c.json({ ok: true });
  });

  app.post("/account/reauth/email", async (c) => {
    const session = await authSessionForRequest(c, context);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    if (!await context.storage.getAccountById(session.userId)) {
      return c.json({ error: "notFound" }, 404);
    }

    const form = await c.req.parseBody();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const email = normalizeEmailAddress(String(form.email ?? ""));
    const verificationId = String(form.verificationId ?? "").trim();
    const code = String(form.code ?? "");
    if (!email || !verificationId || !code.trim()) {
      return c.json({ error: "invalid" }, 400);
    }

    const credential = await context.storage.getEmailCredential(
      session.userId,
      email,
    );
    if (!credential?.verified) {
      return c.json({ error: "unavailable" }, 400);
    }

    const verification = await context.storage.getPendingEmailVerification(
      verificationId,
    );
    const verificationError = reauthEmailVerificationError(
      verification,
      session.userId,
      email,
      context.config.emailVerification.maxAttempts,
    );
    if (verificationError) {
      if (
        verification &&
        (verificationError === "expired" ||
          verificationError === "attempts")
      ) {
        await context.storage.deletePendingEmailVerification(verification.id);
      }
      return c.json({ error: verificationError }, 400);
    }

    const activeVerification = verification as PendingEmailVerification;
    const validCode = await verifyEmailVerificationCode(
      code,
      activeVerification,
      context.config.emailVerification,
    );
    if (!validCode) {
      await recordEmailBindingVerificationFailure(context, activeVerification);
      logSecurityAuditEvent({
        code: "reauth_failed",
        details: { email: maskedEmailAddress(email), method: "email_otp" },
        level: "warn",
        message: "敏感操作再认证失败。",
        request: c.req.raw,
        userId: session.userId,
      });
      return c.json({ error: "code" }, 403);
    }

    await context.storage.deletePendingEmailVerification(activeVerification.id);
    await saveStrongReauthEvent(
      context,
      session.userId,
      "email_otp",
      reauthPurposeFromValue(form.reauthPurpose),
    );
    logSecurityAuditEvent({
      code: "reauth_succeeded",
      details: { email: maskedEmailAddress(email), method: "email_otp" },
      level: "info",
      message: "敏感操作再认证成功。",
      request: c.req.raw,
      userId: session.userId,
    });

    return c.json({ ok: true });
  });

  app.post("/account/email/verify", async (c) => {
    const jsonVerification = c.req.header("x-email-binding-verify") === "1";
    const session = await authSessionForRequest(c, context);
    if (!session) {
      if (jsonVerification) {
        return c.json({ error: "unauthorized" }, 401);
      }
      return c.redirect(settingsLoginRedirect(c, context), 303);
    }

    const account = await context.storage.getAccountById(session.userId);
    if (!account) {
      if (jsonVerification) {
        return c.json({ error: "notFound" }, 404);
      }
      return c.redirect(accountSettingsRedirect("notFound"), 303);
    }

    const form = await c.req.parseBody();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const email = normalizeEmailAddress(String(form.email ?? ""));
    const verificationId = String(form.verificationId ?? "").trim();
    const code = String(form.code ?? "");
    if (!email || !verificationId || !code.trim()) {
      if (jsonVerification) {
        return c.json({ error: "invalid" }, 400);
      }
      return c.redirect(emailBindingSettingsRedirect("invalid"), 303);
    }

    const verification = await context.storage.getPendingEmailVerification(
      verificationId,
    );
    const verificationError = emailBindingVerificationError(
      verification,
      session.userId,
      email,
      context.config.emailVerification.maxAttempts,
    );
    if (verificationError) {
      if (
        verification &&
        (verificationError === "expired" ||
          verificationError === "attempts")
      ) {
        await context.storage.deletePendingEmailVerification(verification.id);
      }
      if (jsonVerification) {
        return c.json({ error: verificationError }, 400);
      }
      return c.redirect(emailBindingSettingsRedirect(verificationError), 303);
    }

    const activeVerification = verification as PendingEmailVerification;
    const validCode = await verifyEmailVerificationCode(
      code,
      activeVerification,
      context.config.emailVerification,
    );
    if (!validCode) {
      await recordEmailBindingVerificationFailure(context, activeVerification);
      logSecurityAuditEvent({
        code: "email_credential_verification_failed",
        details: { email: maskedEmailAddress(email) },
        level: "warn",
        message: "邮箱绑定验证码校验失败。",
        request: c.req.raw,
        userId: session.userId,
      });
      if (jsonVerification) {
        return c.json({ error: "code" }, 403);
      }
      return c.redirect(emailBindingSettingsRedirect("code"), 303);
    }

    const now = new Date().toISOString();
    const existingCredential = await context.storage.getEmailCredential(
      session.userId,
      email,
    );
    const credential: EmailCredential = {
      createdAt: existingCredential?.createdAt ?? now,
      email,
      lastVerifiedAt: now,
      userId: session.userId,
      verified: true,
    };
    const updated = await context.storage.updateAccount({
      ...account,
      emailVerified: true,
      primaryEmail: email,
    });
    if (!updated) {
      if (jsonVerification) {
        return c.json({ error: "notFound" }, 404);
      }
      return c.redirect(accountSettingsRedirect("notFound"), 303);
    }

    await context.storage.saveEmailCredential(credential);
    await context.storage.deletePendingEmailVerification(activeVerification.id);
    logSecurityAuditEvent({
      code: "email_credential_verified",
      details: { email: maskedEmailAddress(email) },
      level: "info",
      message: "邮箱凭证已验证并绑定。",
      request: c.req.raw,
      userId: session.userId,
    });

    if (jsonVerification) {
      return c.json({ ok: true, redirectTo: "/settings?email=updated" });
    }

    return c.redirect("/settings?email=updated", 303);
  });

  app.post("/account/totp/verify", async (c) => {
    const asyncBinding = c.req.header("x-totp-binding") === "1";
    const session = await authSessionForRequest(c, context);
    if (!session) {
      if (asyncBinding) {
        return c.json({ error: "auth" }, 401);
      }
      return c.redirect(settingsLoginRedirect(c, context), 303);
    }

    const account = await context.storage.getAccountById(session.userId);
    if (!account) {
      if (asyncBinding) {
        return c.json({ error: "notFound" }, 404);
      }
      return c.redirect(accountSettingsRedirect("notFound"), 303);
    }

    const form = await c.req.parseBody();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const secretEncrypted = String(form.secretEncrypted ?? "").trim();
    const code = String(form.code ?? "");
    if (!secretEncrypted || !code.trim()) {
      if (asyncBinding) {
        return c.json({ error: "code" }, 400);
      }
      return c.redirect(totpBindingSettingsRedirect("code"), 303);
    }

    let validCode = false;
    try {
      validCode = await verifyEncryptedTotpCode(
        code,
        secretEncrypted,
        context.config.totp,
      );
    } catch (error) {
      if (!(error instanceof TotpConfigError)) {
        throw error;
      }
      if (asyncBinding) {
        return c.json({ error: "config" }, 503);
      }
      return c.redirect(totpBindingSettingsRedirect("config"), 303);
    }

    if (!validCode) {
      logSecurityAuditEvent({
        code: "totp_credential_verification_failed",
        level: "warn",
        message: "验证器动态码绑定校验失败。",
        request: c.req.raw,
        userId: session.userId,
      });
      if (asyncBinding) {
        return c.json({ error: "code" }, 400);
      }
      return c.redirect(totpBindingSettingsRedirect("code"), 303);
    }

    const existingCredentials = await context.storage.listTotpCredentials(
      session.userId,
    );
    const recoveryCodes = existingCredentials.length === 0
      ? createRecoveryCodes()
      : undefined;
    const credential: TotpCredential = {
      credentialId: crypto.randomUUID(),
      enabledAt: new Date().toISOString(),
      label: totpCredentialLabel(form.label),
      recoveryCodeHashes: recoveryCodes
        ? await hashRecoveryCodes(
          recoveryCodes,
          context.config.totp.secretEncryptionKey,
        )
        : [],
      secretEncrypted,
      userId: session.userId,
    };
    let recoveryCodeRevealId: string | undefined;
    if (recoveryCodes) {
      recoveryCodeRevealId = await saveRecoveryCodeReveal(
        context,
        session.userId,
        recoveryCodes,
      );
    }
    await context.storage.saveTotpCredential(credential);
    logSecurityAuditEvent({
      code: "totp_credential_bound",
      level: "info",
      message: "验证器动态码已绑定。",
      request: c.req.raw,
      userId: session.userId,
    });

    const redirect = new URL("/settings", c.req.url);
    redirect.searchParams.set("totp", "updated");
    if (recoveryCodeRevealId) {
      redirect.searchParams.set("recoveryCodes", recoveryCodeRevealId);
    }
    if (asyncBinding) {
      return c.json({
        ok: true,
        redirectTo: `${redirect.pathname}${redirect.search}`,
      });
    }
    return c.redirect(`${redirect.pathname}${redirect.search}`, 303);
  });

  app.post("/account/totp/delete", async (c) => {
    const asyncAction = c.req.header("x-sensitive-action") === "1";
    const session = await authSessionForRequest(c, context);
    if (!session) {
      if (asyncAction) {
        return c.json({ error: "auth" }, 401);
      }
      return c.redirect(settingsLoginRedirect(c, context), 303);
    }

    if (!await context.storage.getAccountById(session.userId)) {
      return c.redirect(accountSettingsRedirect("notFound"), 303);
    }

    const form = await c.req.parseBody();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const credentialId = String(form.credentialId ?? "").trim();
    const credentials = await context.storage.listTotpCredentials(
      session.userId,
    );
    const credential = credentials.find((candidate) =>
      candidate.credentialId === credentialId
    );
    if (!credential) {
      if (asyncAction) {
        return c.json({ error: "notFound" }, 404);
      }
      return c.redirect(totpBindingSettingsRedirect("notFound"), 303);
    }
    if (!await hasRecentStrongReauth(context, session.userId)) {
      if (asyncAction) {
        return c.json({ error: "reauth" }, 409);
      }
      return c.redirect(totpBindingSettingsRedirect("reauth"), 303);
    }

    const replacementCredential = credentials.find((candidate) =>
      candidate.credentialId !== credential.credentialId
    );
    if (
      credential.recoveryCodeHashes.length > 0 && replacementCredential
    ) {
      await context.storage.saveTotpCredential({
        ...replacementCredential,
        recoveryCodeHashes: Array.from(
          new Set([
            ...replacementCredential.recoveryCodeHashes,
            ...credential.recoveryCodeHashes,
          ]),
        ),
      });
    }

    await context.storage.deleteTotpCredential(
      session.userId,
      credential.credentialId,
    );
    await reconcileSecuritySettingsAfterCredentialChange(
      context,
      session.userId,
    );
    logSecurityAuditEvent({
      code: "totp_credential_deleted",
      details: { credentialId: credential.credentialId },
      level: "info",
      message: "验证器动态码凭证已删除。",
      request: c.req.raw,
      userId: session.userId,
    });

    if (asyncAction) {
      return c.json({ ok: true, remainingCount: credentials.length - 1 });
    }
    return c.redirect("/settings?totp=deleted#auth-method-totp", 303);
  });

  app.post("/account/recovery-codes/generate", async (c) => {
    const jsonGeneration = c.req.header("x-recovery-code-generate") === "1";
    const session = await authSessionForRequest(c, context);
    if (!session) {
      if (jsonGeneration) {
        return c.json({ error: "unauthorized" }, 401);
      }
      return c.redirect(settingsLoginRedirect(c, context), 303);
    }
    if (!await context.storage.getAccountById(session.userId)) {
      if (jsonGeneration) {
        return c.json({ error: "notFound" }, 404);
      }
      return c.redirect(accountSettingsRedirect("notFound"), 303);
    }
    const form = await c.req.parseBody();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }
    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    if (
      !await consumeRecentStrongReauth(
        context,
        session.userId,
        "recovery_codes",
      )
    ) {
      if (jsonGeneration) {
        return c.json({ error: "reauth" }, 409);
      }
      return c.redirect("/settings?securityError=reauth", 303);
    }

    const credentials = await context.storage.listTotpCredentials(
      session.userId,
    );
    const credential = credentials[0];
    if (!credential) {
      if (jsonGeneration) {
        return c.json({ error: "notFound" }, 404);
      }
      return c.redirect(totpBindingSettingsRedirect("notFound"), 303);
    }
    const replacingExistingCodes = credentials.some((candidate) =>
      candidate.recoveryCodeHashes.length > 0
    );

    const recoveryCodes = createRecoveryCodes();
    const recoveryCodeHashes = await hashRecoveryCodes(
      recoveryCodes,
      context.config.totp.secretEncryptionKey,
    );
    const revealId = await saveRecoveryCodeReveal(
      context,
      session.userId,
      recoveryCodes,
    );
    for (const candidate of credentials) {
      await context.storage.saveTotpCredential({
        ...candidate,
        recoveryCodeHashes: candidate === credential ? recoveryCodeHashes : [],
      });
    }
    logSecurityAuditEvent({
      code: replacingExistingCodes
        ? "recovery_codes_regenerated"
        : "recovery_codes_generated",
      level: "info",
      message: replacingExistingCodes
        ? "账户恢复码已重新生成，旧恢复码已废除。"
        : "账户恢复码已生成。",
      request: c.req.raw,
      userId: session.userId,
    });
    const redirectTo = `/settings?recoveryCodes=${
      encodeURIComponent(revealId)
    }#recovery-codes-row`;
    if (jsonGeneration) {
      return c.json({ ok: true, redirectTo });
    }
    return c.redirect(redirectTo, 303);
  });

  app.post("/account/passkeys/reauth-options", async (c) => {
    const session = await authSessionForRequest(c, context);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    if (!await context.storage.getAccountById(session.userId)) {
      return c.json({ error: "notFound" }, 404);
    }

    if (!validCsrfForRequest(c, {})) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const credentials = await context.storage.listPasskeyCredentials(
      session.userId,
    );
    if (credentials.length === 0) {
      return c.json({ error: "unavailable" }, 400);
    }

    const authentication = await createPasskeyAuthenticationOptions({
      config: context.config.passkey,
      credentials,
      purpose: "reauth",
      userId: session.userId,
    });
    await context.storage.savePendingPasskeyChallenge(
      authentication.challenge,
    );

    return c.json(passkeyAuthenticationOptionsResponse(authentication));
  });

  app.post("/account/passkeys/reauth", async (c) => {
    const session = await authSessionForRequest(c, context);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    if (!await context.storage.getAccountById(session.userId)) {
      return c.json({ error: "notFound" }, 404);
    }

    const payload = await passkeyJsonPayload(c);
    if (!validCsrfForRequest(c, {})) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const challengeId = String(payload.challengeId ?? "").trim();
    const credentialResponse = payload.credential;
    if (!challengeId || !isRecord(credentialResponse)) {
      return c.json({ error: "invalid" }, 400);
    }

    const credentialId = typeof credentialResponse.id === "string"
      ? credentialResponse.id.trim()
      : "";
    const challenge = await context.storage.getPendingPasskeyChallenge(
      challengeId,
    );
    const challengeError = passkeyReauthChallengeError(
      challenge,
      session.userId,
      credentialId,
    );
    if (challengeError) {
      if (challenge) {
        await context.storage.deletePendingPasskeyChallenge(challenge.id);
      }
      return c.json({ error: challengeError }, 400);
    }

    const activeChallenge = challenge as PendingPasskeyChallenge;
    const credential = await context.storage.getPasskeyCredential(
      session.userId,
      credentialId,
    );
    if (!credential) {
      await recordPasskeyChallengeFailure(context, activeChallenge);
      logSecurityAuditEvent({
        code: "reauth_failed",
        details: { credentialId, method: "passkey", reason: "credential" },
        level: "warn",
        message: "敏感操作再认证失败。",
        request: c.req.raw,
        userId: session.userId,
      });
      return c.json({ error: "failed" }, 400);
    }

    const verifier =
      (context as PasskeyRouteContext).passkeyAuthenticationVerifier ??
        verifyPasskeyAuthenticationResponse;
    const verification = await verifier({
      challenge: activeChallenge,
      config: context.config.passkey,
      credential,
      requireUserVerification: true,
      response: credentialResponse as never,
    });
    if (!verification.verified) {
      await recordPasskeyChallengeFailure(context, activeChallenge);
      logSecurityAuditEvent({
        code: "reauth_failed",
        details: { credentialId, method: "passkey", reason: "assertion" },
        level: "warn",
        message: "敏感操作再认证失败。",
        request: c.req.raw,
        userId: session.userId,
      });
      return c.json({ error: "failed" }, 400);
    }

    await context.storage.savePasskeyCredential(
      passkeyCredentialAfterAuthentication(
        credential,
        verification.authenticationInfo.newCounter,
      ),
    );
    await context.storage.deletePendingPasskeyChallenge(activeChallenge.id);
    await saveStrongReauthEvent(
      context,
      session.userId,
      "passkey",
      reauthPurposeFromValue(payload.reauthPurpose),
    );
    logSecurityAuditEvent({
      code: "reauth_succeeded",
      details: { credentialId, method: "passkey" },
      level: "info",
      message: "敏感操作再认证成功。",
      request: c.req.raw,
      userId: session.userId,
    });

    return c.json({ ok: true });
  });

  app.post("/account/passkeys/register-options", async (c) => {
    const session = await authSessionForRequest(c, context);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const account = await context.storage.getAccountById(session.userId);
    if (!account) {
      return c.json({ error: "notFound" }, 404);
    }

    if (!validCsrfForRequest(c, {})) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const settingsStorage = await storageForRequest(c, context);
    const settings = await settingsStorage.getSettings();
    const credentials = await context.storage.listPasskeyCredentials(
      session.userId,
    );
    const registration = await createPasskeyRegistrationOptions({
      account,
      config: {
        ...context.config.passkey,
        rpName: context.config.passkey.rpName === defaultPasskeyRpName
          ? getMessages(settings.locale).appName
          : context.config.passkey.rpName,
      },
      existingCredentials: credentials,
    });
    await context.storage.savePendingPasskeyChallenge(
      registration.challenge,
    );

    return c.json(passkeyRegistrationOptionsResponse(registration));
  });

  app.post("/account/passkeys/register", async (c) => {
    const session = await authSessionForRequest(c, context);
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const account = await context.storage.getAccountById(session.userId);
    if (!account) {
      return c.json({ error: "notFound" }, 404);
    }

    if (!validCsrfForRequest(c, {})) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const payload = await passkeyJsonPayload(c);
    const challengeId = String(payload.challengeId ?? "").trim();
    const credentialResponse = payload.credential;
    if (!challengeId || !isRecord(credentialResponse)) {
      return c.json({ error: "invalid" }, 400);
    }

    const challenge = await context.storage.getPendingPasskeyChallenge(
      challengeId,
    );
    const challengeError = passkeyRegistrationChallengeError(
      challenge,
      session.userId,
    );
    if (challengeError) {
      if (challenge) {
        await context.storage.deletePendingPasskeyChallenge(challenge.id);
      }
      return c.json({ error: challengeError }, 400);
    }

    const activeChallenge = challenge as PendingPasskeyChallenge;
    const verifier =
      (context as PasskeyRouteContext).passkeyRegistrationVerifier ??
        verifyPasskeyRegistrationResponse;
    const verification = await verifier({
      challenge: activeChallenge,
      config: context.config.passkey,
      response: credentialResponse as never,
    });

    if (!verification.verified) {
      await recordPasskeyChallengeFailure(context, activeChallenge);
      logSecurityAuditEvent({
        code: "passkey_credential_verification_failed",
        level: "warn",
        message: "Passkey 绑定校验失败。",
        request: c.req.raw,
        userId: session.userId,
      });
      return c.json({ error: "failed" }, 400);
    }

    const credential = passkeyCredentialFromRegistration({
      label: passkeyCredentialLabel(payload.label),
      registrationInfo: verification.registrationInfo,
      userId: session.userId,
    });
    const existingCredential = await context.storage.getPasskeyCredential(
      session.userId,
      credential.credentialId,
    );
    const existingGlobalCredential = await context.storage
      .getPasskeyCredentialByCredentialId(credential.credentialId);
    if (existingCredential || existingGlobalCredential) {
      await context.storage.deletePendingPasskeyChallenge(activeChallenge.id);
      return c.json({ error: "alreadyBound" }, 409);
    }

    await context.storage.savePasskeyCredential(credential);
    await context.storage.deletePendingPasskeyChallenge(activeChallenge.id);
    logSecurityAuditEvent({
      code: "passkey_credential_bound",
      details: { credentialId: credential.credentialId },
      level: "info",
      message: "Passkey 已绑定。",
      request: c.req.raw,
      userId: session.userId,
    });

    return c.json({ ok: true, redirectTo: "/settings?passkey=updated" });
  });

  app.post("/account/passkeys/delete", async (c) => {
    const asyncAction = c.req.header("x-sensitive-action") === "1";
    const session = await authSessionForRequest(c, context);
    if (!session) {
      if (asyncAction) {
        return c.json({ error: "auth" }, 401);
      }
      return c.redirect(settingsLoginRedirect(c, context), 303);
    }

    const account = await context.storage.getAccountById(session.userId);
    if (!account) {
      return c.redirect(accountSettingsRedirect("notFound"), 303);
    }

    const form = await c.req.parseBody();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const credentialId = String(form.credentialId ?? "").trim();
    const credential = credentialId
      ? await context.storage.getPasskeyCredential(session.userId, credentialId)
      : undefined;
    if (!credential) {
      if (asyncAction) {
        return c.json({ error: "notFound" }, 404);
      }
      return c.redirect(passkeyBindingSettingsRedirect("notFound"), 303);
    }
    if (!await hasRecentStrongReauth(context, session.userId)) {
      if (asyncAction) {
        return c.json({ error: "reauth" }, 409);
      }
      return c.redirect(passkeyBindingSettingsRedirect("reauth"), 303);
    }

    await context.storage.deletePasskeyCredential(
      session.userId,
      credential.credentialId,
    );
    await reconcileSecuritySettingsAfterCredentialChange(
      context,
      session.userId,
    );
    logSecurityAuditEvent({
      code: "passkey_credential_deleted",
      details: { credentialId: credential.credentialId },
      level: "info",
      message: "Passkey 已删除。",
      request: c.req.raw,
      userId: session.userId,
    });

    if (asyncAction) {
      const remainingCredentials = await context.storage.listPasskeyCredentials(
        session.userId,
      );
      return c.json({ ok: true, remainingCount: remainingCredentials.length });
    }
    return c.redirect(
      "/settings?passkey=deleted#auth-method-passkey",
      303,
    );
  });

  app.post("/account/google/unbind", async (c) => {
    const session = await authSessionForRequest(c, context);
    if (!session) {
      return c.redirect(settingsLoginRedirect(c, context), 303);
    }

    const account = await context.storage.getAccountById(session.userId);
    if (!account) {
      return c.redirect(accountSettingsRedirect("notFound"), 303);
    }

    const form = await c.req.parseBody();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const providerUserId = String(form.providerUserId ?? "").trim();
    const identities = await context.storage.listAuthIdentitiesForUser(
      "google",
      session.userId,
    );
    const identity = identities.find((candidate) =>
      candidate.providerUserId === providerUserId
    );
    if (!identity) {
      return c.redirect(googleBindingSettingsRedirect("failed"), 303);
    }
    if (!await hasRecentStrongReauth(context, session.userId)) {
      return c.redirect(googleBindingSettingsRedirect("reauth"), 303);
    }

    await context.storage.deleteAuthIdentity("google", identity.providerUserId);
    logSecurityAuditEvent({
      code: "google_identity_unbound",
      details: { providerUserId: auditText(identity.providerUserId) },
      level: "warn",
      message: "Google 身份绑定已解除。",
      request: c.req.raw,
      userId: session.userId,
    });

    return c.redirect("/settings?google=deleted", 303);
  });

  app.post("/account/security", async (c) => {
    const isAutosave = c.req.header("x-autosave") === "1";
    const session = await authSessionForRequest(c, context);
    if (!session) {
      if (isAutosave) {
        return c.json({ error: "auth" }, 401);
      }
      return c.redirect(settingsLoginRedirect(c, context), 303);
    }

    const account = await context.storage.getAccountById(session.userId);
    if (!account) {
      if (isAutosave) {
        return c.json({ error: "notFound" }, 404);
      }
      return c.redirect(accountSettingsRedirect("notFound"), 303);
    }

    const form = await c.req.parseBody();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const rateLimitResponse = await rateLimitExceededResponseFor(
      context.storage,
      publicRateLimitPolicies.accountSensitiveOperation,
      userRateLimitIdentifier(session.userId),
      { request: c.req.raw, userId: session.userId },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const emailCredentials = await context.storage.listEmailCredentials(
      session.userId,
    );
    const totpCredentials = await context.storage.listTotpCredentials(
      session.userId,
    );
    const passkeyCredentials = await context.storage.listPasskeyCredentials(
      session.userId,
    );
    const availableMethods = availableSecondFactorMethods({
      emailCredentials,
      passkeyCredentials,
      totpCredentials,
    });
    const currentSecuritySettings = await context.storage
      .getUserSecuritySettings(session.userId);
    const twoFactorEnabled = form.twoFactorEnabled === "on";
    const nextSettings = securitySettingsFromForm(
      form,
      session.userId,
      availableMethods,
    );

    try {
      assertValidUserSecuritySettings(nextSettings, availableMethods);
    } catch (error) {
      if (!(error instanceof MfaConfigurationError)) {
        throw error;
      }

      const errorCode = twoFactorEnabled && availableMethods.length === 0
        ? "unavailable"
        : "preferred";
      if (isAutosave) {
        return c.json({ error: errorCode }, 400);
      }
      return c.redirect(accountSecuritySettingsRedirect(errorCode), 303);
    }

    if (
      requiresReauthForSecuritySettingsChange(
        currentSecuritySettings,
        nextSettings,
      ) && !await hasRecentStrongReauth(context, session.userId)
    ) {
      if (isAutosave) {
        return c.json({ error: "reauth" }, 409);
      }
      return c.redirect(accountSecuritySettingsRedirect("reauth"), 303);
    }

    await context.storage.saveUserSecuritySettings(nextSettings);
    logSecurityAuditEvent({
      code: "two_factor_settings_changed",
      details: {
        availableMethods: availableMethods.join(","),
        preferredSecondFactor: nextSettings.preferredSecondFactor ?? "",
        twoFactorEnabled: nextSettings.twoFactorEnabled,
      },
      level: "info",
      message: "双重验证设置已更新。",
      request: c.req.raw,
      userId: session.userId,
    });

    if (isAutosave) {
      return new Response(null, { status: 204 });
    }
    return c.redirect("/settings?security=updated", 303);
  });

  app.post("/settings", async (c) => {
    const storage = await storageForRequest(c, context);
    const form = await c.req.parseBody();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const currentSettings = await storage.getSettings();
    const nextSettings = settingsFromForm(form, currentSettings);
    await storage.saveSettings(nextSettings);
    const session = await authSessionForRequest(c, context);
    logSecurityAuditEvent({
      code: "settings_changed",
      details: {
        autosave: c.req.header("x-autosave") === "1",
        emailService: nextSettings.notificationEmailService,
        notificationProvider: nextSettings.notificationProvider,
        pollingEnabled: nextSettings.polling.enabled,
        webhookService: nextSettings.notificationWebhookService,
      },
      level: "info",
      message: "应用设置已保存。",
      request: c.req.raw,
      userId: session?.userId,
    });
    if (c.req.header("x-autosave") === "1") {
      return new Response(null, { status: 204 });
    }
    return c.redirect("/settings");
  });

  app.get("/history", async (c) => {
    const storage = await storageForRequest(c, context);
    const settings = await storage.getSettings();
    const history = await storage.listHistory();
    const historyTable = applyMatchTableQuery(
      history,
      parseMatchTableQuery(new URL(c.req.url).searchParams),
    );
    const csrf = csrfTokenForRequest(c.req.header("cookie"), c.req.url);
    return withCsrfCookie(
      c.html(renderHistory({ csrfToken: csrf.token, historyTable, settings })),
      csrf,
    );
  });

  app.post("/run-now", async (c) => {
    const storage = await optionalStorageForRequest(c, context);
    const form = await formDataOrEmpty(c.req.raw);
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }
    const rateLimitResponse = await rateLimitResponseForRequest(
      c,
      context,
      publicRateLimitPolicies.manualPoll,
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    try {
      if (storage) {
        await context.poller.runOnce(storage);
      } else {
        await context.poller.runOnce();
      }
      return c.redirect(
        withPollResetFlag(
          safeRedirectPath(form.get("returnTo"), "/"),
          form.get("pollResetStart"),
        ),
      );
    } catch (error) {
      return notificationErrorResponse(error, c.req.raw);
    }
  });

  app.post("/simulate-match", async (c) => {
    const debugRequest = await debugOperationRequest(c, context);
    if (debugRequest.response) {
      return debugRequest.response;
    }

    const { form, storage } = debugRequest;
    const settings = await storage.getSettings();
    try {
      await context.poller.recordMatches(
        [createRandomTestMatchRecord(settings, 1, "simulation")],
        storage,
        settings,
      );
      return c.redirect(safeRedirectPath(form.get("returnTo"), "/"));
    } catch (error) {
      return notificationErrorResponse(error, c.req.raw);
    }
  });

  app.post("/test-notify", async (c) => {
    const debugRequest = await debugOperationRequest(c, context);
    if (debugRequest.response) {
      return debugRequest.response;
    }

    const { storage } = debugRequest;
    const settings = await storage.getSettings();
    try {
      await context.notifier.sendTest(settings);
      if (c.req.header("x-test-notify") === "1") {
        return c.text(getMessages(settings.locale).testNotifySent);
      }
      return c.redirect("/");
    } catch (error) {
      return notificationErrorResponse(error, c.req.raw);
    }
  });

  app.post("/matches/complete", async (c) => {
    const storage = await storageForRequest(c, context);
    const form = await c.req.raw.formData();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const ids = form.getAll("matchId").map(String);
    if (ids.length > 0) {
      await storage.completeMatches(ids);
    }
    const returnTo = safeRedirectPath(form.get("returnTo"), "/");
    if (isMatchTableRefreshRequest(c)) {
      return await pendingMatchesTableResponse(c, storage, returnTo);
    }
    return c.redirect(returnTo);
  });

  app.post("/matches/delete", async (c) => {
    const storage = await storageForRequest(c, context);
    const form = await c.req.raw.formData();
    if (!validCsrfForRequest(c, form)) {
      return csrfForbiddenResponse(c.req.raw);
    }

    const ids = form.getAll("matchId").map(String);
    if (ids.length > 0) {
      await storage.deleteMatches(ids);
    }
    const returnTo = safeRedirectPath(form.get("returnTo"), "/history");
    if (isMatchTableRefreshRequest(c)) {
      return await historyTableResponse(c, storage, returnTo);
    }
    return c.redirect(returnTo);
  });

  app.get("/static/app.css", async () => {
    const css = await Deno.readTextFile(
      new URL("../static/app.css", import.meta.url),
    );
    return new Response(css, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/css; charset=utf-8",
      },
    });
  });

  app.get("/static/settings.js", async () => {
    const script = await Deno.readTextFile(
      new URL("../static/settings.js", import.meta.url),
    );
    return new Response(script, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/javascript; charset=utf-8",
      },
    });
  });

  app.get("/static/tooltip.js", async () => {
    const script = await Deno.readTextFile(
      new URL("../static/tooltip.js", import.meta.url),
    );
    return new Response(script, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/javascript; charset=utf-8",
      },
    });
  });

  return app;
}

/**
 * 获取当前请求对应的用户存储，缺失存储时抛错。
 *
 * @param c Hono 请求上下文的最小结构。
 * @param context 应用运行时上下文。
 * @return 当前请求用户作用域存储。
 */
async function storageForRequest(
  c: { req: { header(name: string): string | undefined; raw: Request } },
  context: AppContext,
) {
  const storage = await optionalStorageForRequest(c, context);
  if (!storage) {
    throw new Error("Storage is not configured for this route.");
  }
  return storage;
}

/**
 * 获取当前请求对应的用户存储，缺失存储时返回 undefined。
 *
 * @param c Hono 请求上下文的最小结构。
 * @param context 应用运行时上下文。
 * @return 当前请求用户作用域存储。
 */
async function optionalStorageForRequest(
  c: { req: { header(name: string): string | undefined; raw: Request } },
  context: AppContext,
) {
  const storage = (context as { storage?: AppContext["storage"] }).storage;
  if (!storage) {
    return undefined;
  }

  const session = await cachedAuthSessionForRequest(c, storage);
  return "forUser" in storage
    ? storage.forUser(session?.userId ?? "default")
    : storage;
}

/**
 * 读取当前请求对应的认证会话。
 *
 * @param c 请求上下文。
 * @param context 应用上下文。
 * @return 当前登录会话，未登录时返回 undefined。
 */
async function authSessionForRequest(
  c: { req: { header(name: string): string | undefined; raw: Request } },
  context: AppContext,
) {
  const storage = (context as { storage?: AppContext["storage"] }).storage;
  return storage ? await cachedAuthSessionForRequest(c, storage) : undefined;
}

/**
 * 在同一次请求内复用认证会话读取结果。
 *
 * @param {{ req: { header(name: string): string | undefined; raw: Request } }} c Hono 请求上下文的最小结构。
 * @param {AppContext["storage"]} storage 应用存储。
 * @return {ReturnType<typeof readAuthSession>} 当前登录会话，未登录时返回 undefined。
 */
async function cachedAuthSessionForRequest(
  c: { req: { header(name: string): string | undefined; raw: Request } },
  storage: AppContext["storage"],
): ReturnType<typeof readAuthSession> {
  let promise = authSessionPromisesByRequest.get(c.req.raw);
  if (!promise) {
    promise = readAuthSession(c.req.header("cookie"), storage);
    authSessionPromisesByRequest.set(c.req.raw, promise);
  }

  return await promise;
}

/**
 * 校验并消费一枚恢复码，返回需要保存的验证器凭证。
 *
 * @param {readonly TotpCredential[]} credentials 当前账户的验证器凭证。
 * @param {string} code 用户提交的恢复码。
 * @param {string} secretEncryptionKey 恢复码 HMAC 密钥。
 * @return {Promise<TotpCredential | undefined>} 匹配时返回移除已用哈希后的凭证。
 */
async function credentialAfterRecoveryCodeUse(
  credentials: readonly TotpCredential[],
  code: string,
  secretEncryptionKey: string,
): Promise<TotpCredential | undefined> {
  for (const credential of credentials) {
    for (const hash of credential.recoveryCodeHashes) {
      if (await verifyRecoveryCodeHash(code, hash, secretEncryptionKey)) {
        return {
          ...credential,
          recoveryCodeHashes: credential.recoveryCodeHashes.filter(
            (candidate) => candidate !== hash,
          ),
        };
      }
    }
  }

  return undefined;
}

/**
 * 保存敏感操作再认证成功事件。
 *
 * @param context 应用运行时上下文。
 * @param userId 用户 ID。
 * @param method 完成本次再认证的方式。
 * @param purpose 本次认证事件的用途。
 * @return 保存完成后的 Promise。
 */
async function saveStrongReauthEvent(
  context: AppContext,
  userId: string,
  method: AuthenticationEventMethod,
  purpose: AuthenticationEventPurpose = "reauth",
): Promise<void> {
  await context.storage.saveAuthenticationEvent(
    createStrongAuthenticationEvent({
      method,
      purpose,
      userId,
    }),
  );
}

/**
 * 读取前端提交的再认证用途，只允许恢复码操作使用独立用途。
 *
 * @param value 前端提交的用途值。
 * @return 受支持的再认证用途。
 */
function reauthPurposeFromValue(
  value: unknown,
): Extract<AuthenticationEventPurpose, "reauth" | "recovery_codes"> {
  return value === "recovery_codes" ? "recovery_codes" : "reauth";
}

/**
 * 原子消费一次仍在有效期内的强认证事件。
 *
 * @param context 应用运行时上下文。
 * @param userId 用户 ID。
 * @param purpose 认证事件用途。
 * @return 成功消费有效事件时返回 true。
 */
async function consumeRecentStrongReauth(
  context: AppContext,
  userId: string,
  purpose: AuthenticationEventPurpose,
): Promise<boolean> {
  return isRecentStrongAuthenticationEvent(
    await context.storage.consumeAuthenticationEvent(userId, purpose),
    context.config.reauth,
  );
}

/**
 * 判断用户是否已经在有效窗口内完成强再认证。
 *
 * @param context 应用运行时上下文。
 * @param userId 用户 ID。
 * @return 有效窗口内存在强再认证事件时返回 true。
 */
async function hasRecentStrongReauth(
  context: AppContext,
  userId: string,
): Promise<boolean> {
  return isRecentStrongAuthenticationEvent(
    await context.storage.getAuthenticationEvent(userId, "reauth"),
    context.config.reauth,
  );
}

/**
 * 判断安全设置变更是否需要先完成再认证。
 *
 * @param currentSettings 当前安全设置。
 * @param nextSettings 即将保存的安全设置。
 * @return 需要再认证时返回 true。
 */
function requiresReauthForSecuritySettingsChange(
  currentSettings: UserSecuritySettings,
  nextSettings: UserSecuritySettings,
): boolean {
  return currentSettings.twoFactorEnabled && !nextSettings.twoFactorEnabled;
}

type AccountErrorCode =
  | "confirmPassword"
  | "currentPassword"
  | "exists"
  | "notFound"
  | "password"
  | "samePassword"
  | "username";

function accountSettingsRedirect(
  error: AccountErrorCode,
  mode?: "password" | "username",
): string {
  return `/settings?accountError=${error}${mode ? `&accountMode=${mode}` : ""}`;
}

function accountStatusFromSearch(searchParams: URLSearchParams) {
  const error = searchParams.get("accountError");
  if (isAccountErrorCode(error)) {
    const mode = accountModeFromSearch(searchParams.get("accountMode"));
    return { code: error, mode, type: "error" as const };
  }

  return searchParams.get("account") === "updated"
    ? { code: "updated" as const, type: "success" as const }
    : undefined;
}

function accountModeFromSearch(
  value: string | null,
): "password" | "username" | undefined {
  return value === "password" || value === "username" ? value : undefined;
}

function isAccountErrorCode(value: string | null): value is AccountErrorCode {
  return value === "confirmPassword" ||
    value === "currentPassword" ||
    value === "exists" ||
    value === "notFound" ||
    value === "password" ||
    value === "samePassword" ||
    value === "username";
}

type SecuritySettingsErrorCode = "preferred" | "reauth" | "unavailable";

/**
 * 构造账户安全设置错误跳转地址。
 *
 * @param {SecuritySettingsErrorCode} error 安全设置错误码。
 * @return {string} 设置页安全设置错误地址。
 */
function accountSecuritySettingsRedirect(
  error: SecuritySettingsErrorCode,
): string {
  return `/settings?securityError=${error}`;
}

/**
 * 从设置页查询参数恢复账户安全设置状态。
 *
 * @param {URLSearchParams} searchParams 设置页查询参数。
 * @return {{code: SecuritySettingsErrorCode | "updated"; type: "error" | "success"} | undefined} 安全设置状态。
 */
function securitySettingsStatusFromSearch(searchParams: URLSearchParams) {
  const error = searchParams.get("securityError");
  if (isSecuritySettingsErrorCode(error)) {
    return { code: error, type: "error" as const };
  }

  return searchParams.get("security") === "updated"
    ? { code: "updated" as const, type: "success" as const }
    : undefined;
}

/**
 * 判断查询参数是否为账户安全设置错误码。
 *
 * @param {string | null} value 待判断值。
 * @return {boolean} 合法错误码返回 true。
 */
function isSecuritySettingsErrorCode(
  value: string | null,
): value is SecuritySettingsErrorCode {
  return value === "preferred" || value === "reauth" ||
    value === "unavailable";
}

/**
 * 从表单生成用户安全设置。
 *
 * @param {Record<string, FormDataEntryValue | FormDataEntryValue[]>} form 表单数据。
 * @param {string} userId 用户 ID。
 * @param {readonly SecondFactorMethod[]} availableMethods 当前可用二次验证方式。
 * @return {UserSecuritySettings} 用户安全设置。
 */
function securitySettingsFromForm(
  form: Record<string, FormDataEntryValue | FormDataEntryValue[]>,
  userId: string,
  availableMethods: readonly SecondFactorMethod[],
): UserSecuritySettings {
  const preferredSecondFactor = preferredSecondFactorFromForm(
    form.preferredSecondFactor,
  );
  return normalizeUserSecuritySettings({
    preferredSecondFactor: preferredSecondFactor ??
      preferredSecondFactorMethods(availableMethods)[0],
    twoFactorEnabled: form.twoFactorEnabled === "on",
  }, userId);
}

/**
 * 从表单字段读取默认二次验证方式。
 *
 * @param {FormDataEntryValue | FormDataEntryValue[] | undefined} value 表单字段值。
 * @return {Exclude<SecondFactorMethod, "recoveryCode"> | undefined} 默认二次验证方式。
 */
function preferredSecondFactorFromForm(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
): Exclude<SecondFactorMethod, "recoveryCode"> | undefined {
  return isPreferredSecondFactorMethod(value) ? value : undefined;
}

/**
 * 筛选可作为默认项的二次验证方式。
 *
 * @param {readonly SecondFactorMethod[]} methods 当前可用二次验证方式。
 * @return {Exclude<SecondFactorMethod, "recoveryCode">[]} 默认验证方式候选列表。
 */
function preferredSecondFactorMethods(
  methods: readonly SecondFactorMethod[],
): Exclude<SecondFactorMethod, "recoveryCode">[] {
  return methods.filter(isPreferredSecondFactorMethod);
}

/**
 * 判断值是否为可设为默认项的二次验证方式。
 *
 * @param {unknown} value 待判断值。
 * @return {boolean} 可设为默认项时返回 true。
 */
function isPreferredSecondFactorMethod(
  value: unknown,
): value is Exclude<SecondFactorMethod, "recoveryCode"> {
  return value === "email" || value === "passkey" || value === "totp";
}

type TotpSetupView = {
  qrCodeDataUrl: string;
  secretBase32: string;
  secretEncrypted: string;
};

type TotpBindingErrorCode = "code" | "config" | "notFound" | "reauth";

/**
 * 短期保存仅供首次展示的恢复码明文。
 *
 * @param {AppContext} context 应用运行时上下文。
 * @param {string} userId 用户 ID。
 * @param {string[]} recoveryCodes 恢复码明文。
 * @return {Promise<string>} 恢复码展示记录 ID。
 */
async function saveRecoveryCodeReveal(
  context: AppContext,
  userId: string,
  recoveryCodes: string[],
): Promise<string> {
  const id = crypto.randomUUID();
  await context.storage.savePendingRecoveryCodeReveal({
    codes: recoveryCodes,
    expiresAt: new Date(Date.now() + recoveryCodeRevealTtlMs).toISOString(),
    id,
    userId,
  });
  return id;
}

/**
 * 构造验证器绑定错误跳转地址。
 *
 * @param error 验证器绑定错误码。
 * @return 设置页验证器绑定错误地址。
 */
function totpBindingSettingsRedirect(error: TotpBindingErrorCode): string {
  return `/settings?totpError=${error}#auth-method-totp`;
}

/**
 * 从设置页查询参数恢复验证器绑定状态。
 *
 * @param searchParams 设置页查询参数。
 * @return 验证器绑定状态。
 */
function totpBindingStatusFromSearch(searchParams: URLSearchParams) {
  const error = searchParams.get("totpError");
  if (isTotpBindingErrorCode(error)) {
    return { code: error, type: "error" as const };
  }

  const status = searchParams.get("totp");
  if (status === "updated") {
    return { code: "updated" as const, type: "success" as const };
  }
  if (status === "deleted") {
    return { code: "deleted" as const, type: "success" as const };
  }
  return undefined;
}

/**
 * 判断查询参数是否为验证器绑定错误码。
 *
 * @param value 待判断值。
 * @return 合法错误码返回 true。
 */
function isTotpBindingErrorCode(
  value: string | null,
): value is TotpBindingErrorCode {
  return value === "code" || value === "config" || value === "notFound" ||
    value === "reauth";
}

type PasskeyBindingErrorCode = "failed" | "notFound" | "reauth";

/**
 * 构造 Passkey 绑定错误跳转地址。
 *
 * @param error Passkey 绑定错误码。
 * @return 设置页 Passkey 绑定错误地址。
 */
function passkeyBindingSettingsRedirect(
  error: PasskeyBindingErrorCode,
): string {
  return `/settings?passkeyError=${error}#auth-method-passkey`;
}

/**
 * 从设置页查询参数恢复 Passkey 绑定状态。
 *
 * @param searchParams 设置页查询参数。
 * @return Passkey 绑定状态。
 */
function passkeyBindingStatusFromSearch(searchParams: URLSearchParams) {
  const error = searchParams.get("passkeyError");
  if (isPasskeyBindingErrorCode(error)) {
    return { code: error, type: "error" as const };
  }

  const status = searchParams.get("passkey");
  if (status === "updated") {
    return { code: "updated" as const, type: "success" as const };
  }
  if (status === "deleted") {
    return { code: "deleted" as const, type: "success" as const };
  }
  return undefined;
}

/**
 * 判断查询参数是否为 Passkey 绑定错误码。
 *
 * @param value 待判断值。
 * @return 合法错误码返回 true。
 */
function isPasskeyBindingErrorCode(
  value: string | null,
): value is PasskeyBindingErrorCode {
  return value === "failed" || value === "notFound" || value === "reauth";
}

type GoogleBindingErrorCode =
  | "alreadyBound"
  | "conflict"
  | "failed"
  | "reauth";

/**
 * 构造 Google 绑定错误跳转地址。
 *
 * @param error Google 绑定错误码。
 * @return 设置页 Google 绑定错误地址。
 */
function googleBindingSettingsRedirect(error: GoogleBindingErrorCode): string {
  return `/settings?googleError=${error}`;
}

/**
 * 从设置页查询参数恢复 Google 绑定状态。
 *
 * @param searchParams 设置页查询参数。
 * @return Google 绑定状态。
 */
function googleBindingStatusFromSearch(searchParams: URLSearchParams) {
  const error = searchParams.get("googleError");
  if (isGoogleBindingErrorCode(error)) {
    return { code: error, type: "error" as const };
  }

  const status = searchParams.get("google");
  if (status === "updated") {
    return { code: "updated" as const, type: "success" as const };
  }
  if (status === "deleted") {
    return { code: "deleted" as const, type: "success" as const };
  }
  return undefined;
}

/**
 * 判断查询参数是否为 Google 绑定错误码。
 *
 * @param value 待判断值。
 * @return 合法错误码返回 true。
 */
function isGoogleBindingErrorCode(
  value: string | null,
): value is GoogleBindingErrorCode {
  return value === "alreadyBound" || value === "conflict" ||
    value === "failed" || value === "reauth";
}

/**
 * 生成 Passkey 注册 options 接口响应。
 *
 * @param registration Passkey 注册 options 结果。
 * @return 可序列化响应体。
 */
function passkeyRegistrationOptionsResponse(
  registration: PasskeyRegistrationOptionsResult,
) {
  return {
    challengeId: registration.challenge.id,
    optionsJSON: registration.optionsJSON,
  };
}

/**
 * 生成 Passkey 认证 options 接口响应。
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
 * 读取 Passkey JSON 请求体。
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
 * 判断值是否为普通对象。
 *
 * @param value 待判断值。
 * @return 值为普通对象时返回 true。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 检查 Passkey 注册 challenge 是否仍可使用。
 *
 * @param challenge 待检查 challenge。
 * @param userId 当前用户 ID。
 * @return 不可用时返回错误码。
 */
function passkeyRegistrationChallengeError(
  challenge: PendingPasskeyChallenge | undefined,
  userId: string,
): "challenge" | undefined {
  if (!challenge || challenge.userId !== userId) {
    return "challenge";
  }

  if (challenge.purpose !== "passkey_registration") {
    return "challenge";
  }

  if (Date.parse(challenge.expiresAt) <= Date.now()) {
    return "challenge";
  }

  return challenge.attempts >= passkeyChallengeMaxAttempts
    ? "challenge"
    : undefined;
}

/**
 * 检查 Passkey 再认证 challenge 是否可继续使用。
 *
 * @param challenge 待检查 challenge。
 * @param userId 当前用户 ID。
 * @param credentialId 浏览器返回的凭证 ID。
 * @return 不可使用时返回错误码。
 */
function passkeyReauthChallengeError(
  challenge: PendingPasskeyChallenge | undefined,
  userId: string,
  credentialId: string,
): "challenge" | undefined {
  if (!challenge || challenge.userId !== userId) {
    return "challenge";
  }

  if (challenge.purpose !== "reauth") {
    return "challenge";
  }

  if (
    !credentialId || !challenge.allowedCredentialIds.includes(credentialId)
  ) {
    return "challenge";
  }

  if (Date.parse(challenge.expiresAt) <= Date.now()) {
    return "challenge";
  }

  return challenge.attempts >= passkeyChallengeMaxAttempts
    ? "challenge"
    : undefined;
}

/**
 * 记录一次 Passkey challenge 失败尝试。
 *
 * @param context 应用运行时上下文。
 * @param challenge 待更新 challenge。
 * @return 更新完成后的 Promise。
 */
async function recordPasskeyChallengeFailure(
  context: AppContext,
  challenge: PendingPasskeyChallenge,
): Promise<void> {
  const attempts = Math.max(0, challenge.attempts) + 1;
  if (attempts >= passkeyChallengeMaxAttempts) {
    await context.storage.deletePendingPasskeyChallenge(challenge.id);
    return;
  }

  await context.storage.savePendingPasskeyChallenge({ ...challenge, attempts });
}

/**
 * 规范化 Passkey 凭证标签。
 *
 * @param {unknown} value 用户提交的标签。
 * @return {string | undefined} 规范化标签。
 */
function passkeyCredentialLabel(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const label = value.trim().replaceAll(/\s+/g, " ");
  return label ? label.slice(0, 80) : undefined;
}

/**
 * 规范化验证器凭证标签。
 *
 * @param value 用户提交的标签。
 * @return 规范化标签。
 */
function totpCredentialLabel(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const label = value.trim().replaceAll(/\s+/g, " ");
  return label ? label.slice(0, 80) : undefined;
}

/**
 * 使用任一已绑定验证器校验动态码。
 *
 * @param {string} code 用户提交的动态码。
 * @param {readonly TotpCredential[]} credentials 已绑定验证器凭证。
 * @param {Parameters<typeof verifyEncryptedTotpCode>[2]} config 验证器动态码配置。
 * @return {Promise<boolean>} 任一验证器校验成功时返回 true。
 */
async function verifyTotpCodeAgainstCredentials(
  code: string,
  credentials: readonly TotpCredential[],
  config: Parameters<typeof verifyEncryptedTotpCode>[2],
): Promise<boolean> {
  for (const credential of credentials) {
    if (
      credential.secretEncrypted &&
      await verifyEncryptedTotpCode(code, credential.secretEncrypted, config)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 凭证变化后修正二次验证设置，避免 2FA 指向不可用方法。
 *
 * @param context 应用运行时上下文。
 * @param userId 用户 ID。
 * @return 修正完成后的 Promise。
 */
async function reconcileSecuritySettingsAfterCredentialChange(
  context: AppContext,
  userId: string,
): Promise<void> {
  const settings = await context.storage.getUserSecuritySettings(userId);
  if (!settings.twoFactorEnabled) {
    return;
  }

  const emailCredentials = await context.storage.listEmailCredentials(userId);
  const passkeyCredentials = await context.storage.listPasskeyCredentials(
    userId,
  );
  const totpCredentials = await context.storage.listTotpCredentials(userId);
  const availableMethods = availableSecondFactorMethods({
    emailCredentials,
    passkeyCredentials,
    totpCredentials,
  });
  const preferredMethods = preferredSecondFactorMethods(availableMethods);
  const preferredSecondFactor = preferredMethods[0];
  const nextSettings = availableMethods.length === 0
    ? {
      preferredSecondFactor: undefined,
      twoFactorEnabled: false,
      userId,
    }
    : {
      ...settings,
      preferredSecondFactor: settings.preferredSecondFactor &&
          availableMethods.includes(settings.preferredSecondFactor)
        ? settings.preferredSecondFactor
        : preferredSecondFactor,
    };

  if (
    settings.twoFactorEnabled !== nextSettings.twoFactorEnabled ||
    settings.preferredSecondFactor !== nextSettings.preferredSecondFactor
  ) {
    await context.storage.saveUserSecuritySettings(nextSettings);
  }
}

type EmailBindingErrorCode =
  | "attempts"
  | "code"
  | "expired"
  | "invalid"
  | "notFound";

/**
 * 构造邮箱绑定错误跳转地址。
 *
 * @param error 邮箱绑定错误码。
 * @return 设置页邮箱绑定错误地址。
 */
function emailBindingSettingsRedirect(error: EmailBindingErrorCode): string {
  return `/settings?emailError=${error}`;
}

/**
 * 从设置页查询参数恢复邮箱绑定状态。
 *
 * @param searchParams 设置页查询参数。
 * @return 邮箱绑定状态。
 */
function emailBindingStatusFromSearch(searchParams: URLSearchParams) {
  const error = searchParams.get("emailError");
  if (isEmailBindingErrorCode(error)) {
    return { code: error, type: "error" as const };
  }

  return searchParams.get("email") === "updated"
    ? { code: "updated" as const, type: "success" as const }
    : undefined;
}

/**
 * 判断查询参数是否为邮箱绑定错误码。
 *
 * @param value 待判断值。
 * @return 合法错误码返回 true。
 */
function isEmailBindingErrorCode(
  value: string | null,
): value is EmailBindingErrorCode {
  return value === "attempts" ||
    value === "code" ||
    value === "expired" ||
    value === "invalid" ||
    value === "notFound";
}

/**
 * 校验待完成的邮箱绑定挑战是否属于当前用户和邮箱。
 *
 * @param verification 待验证挑战。
 * @param userId 当前用户 ID。
 * @param email 规范化后的邮箱地址。
 * @param maxAttempts 最大尝试次数。
 * @return 不可继续验证时返回错误码。
 */
function emailBindingVerificationError(
  verification: PendingEmailVerification | undefined,
  userId: string,
  email: string,
  maxAttempts: number,
): EmailBindingErrorCode | undefined {
  if (
    !verification ||
    verification.purpose !== "email_binding" ||
    verification.userId !== userId ||
    verification.email !== email
  ) {
    return "notFound";
  }

  if (Date.parse(verification.expiresAt) <= Date.now()) {
    return "expired";
  }

  return verification.attempts >= maxAttempts ? "attempts" : undefined;
}

/**
 * 校验邮箱再认证验证码 challenge 是否可继续使用。
 *
 * @param verification 待验证挑战。
 * @param userId 当前用户 ID。
 * @param email 规范化后的邮箱地址。
 * @param maxAttempts 最大尝试次数。
 * @return 不可继续验证时返回错误码。
 */
function reauthEmailVerificationError(
  verification: PendingEmailVerification | undefined,
  userId: string,
  email: string,
  maxAttempts: number,
): "attempts" | "code" | "expired" | undefined {
  if (
    !verification ||
    verification.purpose !== "reauth" ||
    verification.userId !== userId ||
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
 * 记录邮箱绑定验证码失败次数。
 *
 * @param context 应用运行时上下文。
 * @param verification 待验证挑战。
 * @return 记录完成后的 Promise。
 */
async function recordEmailBindingVerificationFailure(
  context: AppContext,
  verification: PendingEmailVerification,
): Promise<void> {
  const attempts = verification.attempts + 1;
  if (attempts >= context.config.emailVerification.maxAttempts) {
    await context.storage.deletePendingEmailVerification(verification.id);
    return;
  }

  await context.storage.savePendingEmailVerification({
    ...verification,
    attempts,
  });
}

/**
 * 从应用上下文读取设置页需要渲染的 Turnstile site key。
 *
 * @param context 应用运行时上下文。
 * @return 启用 Turnstile 时返回 site key。
 */
function settingsTurnstileSiteKey(context: AppContext): string | undefined {
  const turnstile = context.config?.turnstile;
  return turnstile?.enabled && turnstile.siteKey
    ? turnstile.siteKey
    : undefined;
}

/**
 * 从应用上下文读取设置页可用的 Google OAuth client ID。
 *
 * @param context 应用运行时上下文。
 * @return 已配置时返回 Google OAuth client ID。
 */
function settingsGoogleClientId(context: AppContext): string | undefined {
  const clientId = context.config?.google?.clientId.trim();
  return clientId ? clientId : undefined;
}

/**
 * 生成用于审计日志的邮箱遮罩。
 *
 * @param email 规范化后的邮箱地址。
 * @return 遮罩后的邮箱地址。
 */
function maskedEmailAddress(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "***";
  }

  const visibleLocal = localPart.length <= 2
    ? `${localPart[0] ?? ""}***`
    : `${localPart.slice(0, 2)}***`;
  return `${visibleLocal}@${domain}`;
}

function notificationErrorResponse(
  error: unknown,
  request?: Request,
): Response {
  if (error instanceof NotificationConfigError) {
    logSecurityAuditEvent({
      code: "notification_config_rejected",
      details: { errorName: error.name },
      level: "warn",
      message: `通知配置被拒绝：${auditText(error.message)}`,
      request,
    });

    return new Response(error.message, {
      headers: { "content-type": "text/plain; charset=utf-8" },
      status: 400,
    });
  }

  if (error instanceof NotificationDeliveryError) {
    logSecurityAuditEvent({
      code: "notification_delivery_failed",
      details: {
        errorName: error.name,
        upstreamStatus: error.upstreamStatus ?? "",
      },
      level: "warn",
      message: `通知投递失败：${auditText(error.message)}`,
      request,
    });

    return new Response(error.message, {
      headers: { "content-type": "text/plain; charset=utf-8" },
      status: notificationDeliveryStatus(error),
    });
  }

  throw error;
}

/**
 * 将通知投递错误转换为页面响应状态码。
 *
 * @param error 通知投递错误。
 * @return 页面响应状态码。
 */
function notificationDeliveryStatus(error: NotificationDeliveryError): number {
  return error.upstreamStatus === 429 ? 429 : 502;
}

/**
 * 规范化表单中的返回路径。
 *
 * @param value 原始返回路径。
 * @param fallback 允许的兜底路径。
 * @return 安全的返回路径。
 */
function safeRedirectPath(
  value: FormDataEntryValue | null,
  fallback: "/" | "/history",
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  try {
    const url = new URL(value, "http://local");
    if (url.origin !== "http://local" || url.pathname !== fallback) {
      return fallback;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

/**
 * 判断请求是否要求命中记录表局部刷新。
 *
 * @param c Hono 请求上下文的最小结构。
 * @return 请求要求局部刷新时返回 true。
 */
function isMatchTableRefreshRequest(
  c: { req: { header(name: string): string | undefined } },
) {
  return c.req.header(matchTableRefreshHeader) === "1";
}

/**
 * 给路径追加轮询重置标记。
 *
 * @param path 原始路径。
 * @param startWidth 进度条起始宽度。
 * @return 带轮询重置标记的路径。
 */
function withPollResetFlag(
  path: string,
  startWidth: FormDataEntryValue | null,
): string {
  const url = new URL(path, "http://local");
  url.searchParams.set(pollResetParam, "1");
  const normalizedStartWidth = normalizePollResetStart(startWidth);
  if (normalizedStartWidth) {
    url.searchParams.set(pollResetStartParam, normalizedStartWidth);
  }
  return `${url.pathname}${url.search}`;
}

/**
 * 移除路径中的轮询重置标记。
 *
 * @param path 原始路径。
 * @return 移除轮询重置标记后的路径。
 */
function withoutPollResetFlag(path: string): string {
  const url = new URL(path, "http://local");
  url.searchParams.delete(pollResetParam);
  url.searchParams.delete(pollResetStartParam);
  return `${url.pathname}${url.search}`;
}

/**
 * 从查询参数中读取初始下次轮询进度。
 *
 * @param params URL 查询参数。
 * @return 初始进度百分比，未指定时返回 undefined。
 */
function initialNextPollProgress(params: URLSearchParams): string | undefined {
  if (params.get(pollResetParam) !== "1") {
    return undefined;
  }
  return normalizePollResetStart(params.get(pollResetStartParam)) ?? "0";
}

/**
 * 规范化轮询重置起始宽度。
 *
 * @param value 原始起始宽度。
 * @return 0 到 100 之间的宽度字符串。
 */
function normalizePollResetStart(
  value: FormDataEntryValue | null,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return String(Math.max(0, Math.min(100, parsed)));
}

/**
 * 读取调试类 POST 请求并完成 CSRF 与限流检查。
 *
 * @param c Hono 请求上下文。
 * @param context 应用上下文。
 * @return 调试请求上下文；包含 response 时应直接返回该响应。
 */
async function debugOperationRequest(
  c: Context,
  context: AppContext,
): Promise<{
  form: FormData;
  response?: Response;
  storage: Awaited<ReturnType<typeof storageForRequest>>;
}> {
  const storage = await storageForRequest(c, context);
  const form = await formDataOrEmpty(c.req.raw);
  if (!validCsrfForRequest(c, form)) {
    return { form, response: csrfForbiddenResponse(c.req.raw), storage };
  }

  const response = await rateLimitResponseForRequest(
    c,
    context,
    publicRateLimitPolicies.debugOperation,
  );
  return { form, response, storage };
}

/**
 * 根据当前会话或客户端地址执行频率限制检查。
 *
 * @param c Hono 请求上下文的最小结构。
 * @param context 应用上下文。
 * @param policy 频率限制策略。
 * @return 未触发限制时返回 undefined，否则返回 429 响应。
 */
async function rateLimitResponseForRequest(
  c: { req: { header(name: string): string | undefined; raw: Request } },
  context: AppContext,
  policy: RateLimitPolicy,
): Promise<Response | undefined> {
  const storage = (context as { storage?: AppContext["storage"] }).storage;
  const canReadSession =
    typeof (storage as { getSession?: unknown } | undefined)?.getSession ===
      "function";
  const session = canReadSession && storage
    ? await cachedAuthSessionForRequest(c, storage)
    : undefined;
  const identifier = session
    ? userRateLimitIdentifier(session.userId)
    : clientRateLimitIdentifier((name) => c.req.header(name));
  return await rateLimitExceededResponseFor(storage, policy, identifier, {
    request: c.req.raw,
    userId: session?.userId,
  });
}

/**
 * 生成携带当前请求语言的设置页登录重定向地址。
 *
 * @param c Hono 请求上下文。
 * @param context 应用上下文。
 * @return 登录页重定向地址。
 */
function settingsLoginRedirect(c: Context, context: AppContext): string {
  const locale = localeFromRequest(
    c.req.raw,
    context.config.defaultSettings.locale,
  );
  const searchParams = new URLSearchParams({
    locale,
    returnTo: "/settings",
  });
  return `/login?${searchParams.toString()}`;
}

/**
 * 校验当前请求携带的 CSRF 令牌。
 *
 * @param {{ req: { header(name: string): string | undefined } }} c Hono 请求上下文的最小结构。
 * @param {Record<string, FormDataEntryValue | FormDataEntryValue[]> | FormData} form 表单数据。
 * @return {boolean} CSRF 令牌有效时返回 true。
 */
function validCsrfForRequest(
  c: { req: { header(name: string): string | undefined } },
  form: Record<string, FormDataEntryValue | FormDataEntryValue[]> | FormData,
): boolean {
  return verifyCsrfToken(
    c.req.header("cookie"),
    submittedCsrfToken(form, c.req.header(csrfHeaderName)),
  );
}

/**
 * 读取请求表单，读取失败时返回空表单。
 *
 * @param request 原始请求。
 * @return 表单数据。
 */
async function formDataOrEmpty(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    return new FormData();
  }
}

/**
 * 从表单数据生成应用设置。
 *
 * @param form 表单数据。
 * @param currentSettings 当前应用设置。
 * @return 新的应用设置。
 */
export function settingsFromForm(
  form: Record<string, FormDataEntryValue | FormDataEntryValue[]>,
  currentSettings: AppSettings,
): AppSettings {
  const activeKeywordTarget =
    String(form.activeKeywordTarget ?? "common").trim() || "common";
  const keywordRules = keywordRulesFromForm(form);
  const commonKeywordRules = activeKeywordTarget === "common"
    ? keywordRules
    : keywordRulesFromJson(form.commonKeywordRulesJson) ??
      currentSettings.commonKeywordRules;
  const topics = topicsFromForm(
    form,
    currentSettings,
    activeKeywordTarget,
    keywordRules,
  );

  return {
    ...currentSettings,
    activeKeywordTarget,
    commonKeywordRules,
    darkMode: form.darkMode === "on",
    locale: normalizeLocale(String(form.locale ?? currentSettings.locale)),
    notificationEmailAddress: String(form.notificationEmailAddress ?? "")
      .trim(),
    notificationEmailApiToken: secretValueFromForm(
      form.notificationEmailApiToken,
      currentSettings.notificationEmailApiToken,
    ),
    notificationEmailApiUrl: String(form.notificationEmailApiUrl ?? "").trim(),
    notificationEmailFrom: String(form.notificationEmailFrom ?? "").trim(),
    notificationEmailService: normalizeNotificationEmailService(
      form.notificationEmailService,
    ),
    notificationProvider: normalizeNotificationProvider(
      form.notificationProvider,
    ),
    notificationPushPlusToken: secretValueFromForm(
      form.notificationPushPlusSecret ?? form.notificationPushPlusToken,
      currentSettings.notificationPushPlusToken,
      true,
    ),
    notificationServerChanSendKey: secretValueFromForm(
      form.notificationServerChanSendKey,
      currentSettings.notificationServerChanSendKey,
      true,
    ),
    notificationSmtpHost: String(form.notificationSmtpHost ?? "").trim(),
    notificationSmtpPassword: secretValueFromForm(
      form.notificationSmtpPassword,
      currentSettings.notificationSmtpPassword,
    ),
    notificationSmtpPort: normalizePositiveInteger(
      form.notificationSmtpPort,
      currentSettings.notificationSmtpPort,
    ),
    notificationSmtpSecure: form.notificationSmtpSecure === "on",
    notificationSmtpUsername: String(form.notificationSmtpUsername ?? "")
      .trim(),
    notificationWebhookService: normalizeNotificationWebhookService(
      form.notificationWebhookService,
    ),
    notificationWebhookUrl: secretValueFromForm(
      form.notificationWebhookUrl,
      currentSettings.notificationWebhookUrl,
      true,
    ),
    notificationWxPusherSpt: secretValueFromForm(
      form.notificationWxPusherSpt,
      currentSettings.notificationWxPusherSpt,
      true,
    ),
    polling: {
      enabled: form.pollEnabled === "on",
      intervalUnit: normalizePollIntervalUnit(
        form.pollIntervalUnit,
        currentSettings.polling.intervalUnit,
      ),
      intervalValue: normalizePollIntervalValue(
        form.pollIntervalValue,
        normalizePollIntervalUnit(
          form.pollIntervalUnit,
          currentSettings.polling.intervalUnit,
        ),
        currentSettings.polling.intervalValue,
      ),
      postLimit: normalizePositiveInteger(
        form.pollPostLimit,
        currentSettings.polling.postLimit,
      ),
      sort: normalizePollSort(form.pollSort, currentSettings.polling.sort),
    },
    themeColor: normalizeThemeColor(
      form.themeColor,
      currentSettings.themeColor,
    ),
    topics,
  };
}

/**
 * 从表单读取敏感配置，空提交时保留当前值。
 *
 * @param value 表单提交值。
 * @param currentValue 当前已保存的敏感配置。
 * @param trim 是否在判断前后去除首尾空白。
 * @return 新的敏感配置值。
 */
function secretValueFromForm(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  currentValue: string,
  trim = false,
): string {
  const submitted = String(value ?? "");
  const normalized = trim ? submitted.trim() : submitted;
  return normalized.length > 0 ? normalized : currentValue;
}

/**
 * 从表单字段中解析关键词规则。
 *
 * @param form 表单数据。
 * @return 关键词规则列表。
 */
function keywordRulesFromForm(
  form: Record<string, FormDataEntryValue | FormDataEntryValue[]>,
): KeywordRule[] {
  return formIndexes(form, /^keyword_(\d+)$/).map((index) => {
    const keyword = String(form[`keyword_${index}`] ?? "").trim();
    const locations = matchLocations.filter((location) =>
      form[`keyword_${index}_location_${location}`] === "on"
    );
    const caseSensitive = form[`keyword_${index}_caseSensitive`] === "on";
    const useRegex = form[`keyword_${index}_useRegex`] === "on";

    return { caseSensitive, keyword, locations, useRegex };
  }).filter((rule) => rule.keyword.length > 0 && rule.locations.length > 0);
}

/**
 * 从表单字段中解析话题规则。
 *
 * @param form 表单数据。
 * @param currentSettings 当前应用设置。
 * @param activeKeywordTarget 当前正在编辑关键词的目标。
 * @param activeKeywordRules 当前活动关键词规则。
 * @return 话题规则列表。
 */
function topicsFromForm(
  form: Record<string, FormDataEntryValue | FormDataEntryValue[]>,
  currentSettings: AppSettings,
  activeKeywordTarget: string,
  activeKeywordRules: KeywordRule[],
): TopicRule[] {
  const existingTopics = new Map(
    currentSettings.topics.map((topic) => [topic.id, topic]),
  );

  return formIndexes(form, /^topic_(\d+)_id$/).map((index) => {
    const id = String(form[`topic_${index}_id`] ?? "").trim();
    const existingTopic = existingTopics.get(id);
    const submittedKeywordRules = keywordRulesFromJson(
      form[`topic_${index}_keywordRulesJson`],
    );
    const keywordRules = activeKeywordTarget === id
      ? activeKeywordRules
      : submittedKeywordRules ?? existingTopic?.keywordRules ?? [];

    return {
      enabled: form[`topic_${index}_enabled`] === "on",
      id,
      keywordRules,
      note: String(form[`topic_${index}_note`] ?? "").trim(),
    };
  }).filter((topic) => topic.id.length > 0);
}

/**
 * 从 JSON 字符串中解析关键词规则。
 *
 * @param value 表单中的 JSON 字段值。
 * @return 关键词规则列表，无法解析时返回 undefined。
 */
function keywordRulesFromJson(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
): KeywordRule[] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return undefined;
    }

    return parsed.map((rule) => {
      const keyword = typeof rule?.keyword === "string"
        ? rule.keyword.trim()
        : "";
      const locations = Array.isArray(rule?.locations)
        ? rule.locations.filter(isMatchLocation)
        : [];
      const caseSensitive = rule?.caseSensitive === true;
      const useRegex = rule?.useRegex === true;

      return { caseSensitive, keyword, locations, useRegex };
    }).filter((rule) => rule.keyword.length > 0 && rule.locations.length > 0);
  } catch {
    return undefined;
  }
}

/**
 * 判断值是否为合法匹配位置。
 *
 * @param value 待判断值。
 * @return 是合法匹配位置时返回 true。
 */
function isMatchLocation(value: unknown): value is MatchLocation {
  return value === "title" || value === "body" || value === "comments" ||
    value === "replies";
}

/**
 * 从表单字段名中提取索引列表。
 *
 * @param form 表单数据。
 * @param pattern 字段名匹配正则。
 * @return 按升序排列的索引列表。
 */
function formIndexes(
  form: Record<string, FormDataEntryValue | FormDataEntryValue[]>,
  pattern: RegExp,
): number[] {
  return Array.from(
    new Set(
      Object.keys(form)
        .map((key) => key.match(pattern)?.[1])
        .filter((value): value is string => value !== undefined)
        .map(Number),
    ),
  ).toSorted((left, right) => left - right);
}

/**
 * 规范化通知渠道。
 *
 * @param value 表单字段值。
 * @return 合法通知渠道。
 */
function normalizeNotificationProvider(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
): AppSettings["notificationProvider"] {
  return value === "disabled" || value === "email" || value === "webhook"
    ? value
    : "webhook";
}

/**
 * 规范化正整数表单字段。
 *
 * @param value 表单字段值。
 * @param fallback 兜底值。
 * @return 合法正整数。
 */
function normalizePositiveInteger(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  fallback: number,
): number {
  const numericValue = Number(typeof value === "string" ? value : undefined);
  return Number.isInteger(numericValue) && numericValue > 0
    ? numericValue
    : fallback;
}

/**
 * 规范化轮询排序方式。
 *
 * @param value 表单字段值。
 * @param fallback 兜底排序方式。
 * @return 合法轮询排序方式。
 */
function normalizePollSort(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  fallback: PollSort,
): PollSort {
  return value === "publishTime" || value === "smart" || value === "replyTime"
    ? value
    : fallback;
}

/**
 * 规范化轮询间隔单位。
 *
 * @param value 表单字段值。
 * @param fallback 兜底轮询间隔单位。
 * @return 合法轮询间隔单位。
 */
function normalizePollIntervalUnit(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  fallback: PollIntervalUnit,
): PollIntervalUnit {
  return value === "second" || value === "minute" || value === "hour" ||
      value === "day" ||
      value === "week" || value === "month"
    ? value
    : fallback;
}

/**
 * 规范化轮询间隔数值。
 *
 * @param value 表单字段值。
 * @param unit 轮询间隔单位。
 * @param fallback 兜底间隔数值。
 * @return 合法轮询间隔数值。
 */
function normalizePollIntervalValue(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  unit: PollIntervalUnit,
  fallback: number,
): number {
  const intervalValue = normalizePositiveInteger(value, fallback);
  return unit === "second" ? Math.max(3, intervalValue) : intervalValue;
}

/**
 * 规范化主题颜色。
 *
 * @param value 表单字段值。
 * @param fallback 兜底主题颜色。
 * @return 合法主题颜色。
 */
function normalizeThemeColor(
  value: FormDataEntryValue | FormDataEntryValue[] | undefined,
  fallback: string,
): string {
  const color = typeof value === "string" ? value.trim() : "";
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : fallback;
}
