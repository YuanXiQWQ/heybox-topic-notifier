/** @file 管理员面板：邀请码管理及经过再认证的超级管理员用户操作。 */
import { bodyLimit } from "@hono/hono/body-limit";
import { Hono } from "@hono/hono";
import {
  hashPassword,
  readAuthSession,
  validDisplayName,
  validUsername,
  verifyAccountPassword,
} from "./auth.ts";
import {
  accountRole,
  isAdministrator,
  newInvitationCode,
  normalizeInvitation,
  secretDigest,
} from "./auth/roles.ts";
import { getMessages, localeFromRequest } from "./locales/index.ts";
import type { UserAccount } from "./models.ts";
import { parseCookies } from "./security/cookies.ts";
import {
  csrfTokenForRequest,
  verifyCsrfToken,
  withCsrfCookie,
} from "./security/csrf.ts";
import { logSecurityAuditEvent } from "./security/audit_log.ts";
import type { Storage } from "./storage/types.ts";
import { type AdminUser, renderAdmin } from "./views/admin.ts";

/** @param {Storage} storage 权威存储。 @return {Hono} 管理路由，所有写操作再次在存储事务中校验身份。 */
export function createAdminRoutes(storage: Storage) {
  const app = new Hono<{ Variables: { account: UserAccount } }>();
  /** @param {import("@hono/hono").Context} c 当前请求。 @return {Promise<string>} 绑定当前登录令牌的授权索引。 */
  async function grantId(c: import("@hono/hono").Context): Promise<string> {
    return await secretDigest(
      "admin:" +
        (parseCookies(c.req.header("cookie")).get("heybox_session") ?? ""),
    );
  }
  /** @param {import("@hono/hono").Context} c 当前请求。 @param {UserAccount} account 数据库账号。 @return {Promise<boolean>} 当前会话是否完成短期再认证。 */
  async function unlocked(
    c: import("@hono/hono").Context,
    account: UserAccount,
  ): Promise<boolean> {
    const id = await grantId(c),
      grant = await storage.administration?.getTemporary(id);
    return accountRole(account) === "superadmin" && grant?.binding === id &&
      grant.userId === account.id &&
      grant.roleVersion === (account.roleVersion ?? 0);
  }
  /** @param {import("@hono/hono").Context} c 当前请求。 @param {string[]} codes 刚生成的邀请码。 @param {string} error 操作错误。 @return {Promise<Response>} 管理页面。 */
  async function page(
    c: import("@hono/hono").Context,
    codes: string[] = [],
    error = "",
  ): Promise<Response> {
    const account = c.get("account") as UserAccount,
      settings = await storage.forUser(account.id).getSettings();
    const csrf = csrfTokenForRequest(c.req.header("cookie"), c.req.url);
    const canManageUsers = await unlocked(c, account);
    let users: AdminUser[] | undefined;
    if (canManageUsers) {
      users = await Promise.all(
        (await storage.listAccounts()).map(async (user) => ({
          id: user.id,
          username: user.username,
          displayName: user.displayName ?? "",
          role: accountRole(user),
          roleVersion: user.roleVersion ?? 0,
          createdAt: user.createdAt,
          primaryEmail: user.primaryEmail ?? "",
          emailVerified: user.emailVerified === true,
          hasPassword: Boolean(
            user.passwordHash || await storage.getPasswordCredential(user.id),
          ),
        })),
      );
    }
    const invitations = (await storage.administration!.listInvitations())
      .filter((item) =>
        accountRole(account) === "superadmin" || item.createdBy === account.id
      );
    return withCsrfCookie(
      c.html(
        renderAdmin({
          account,
          ownerHasPassword: Boolean(
            account.passwordHash ||
              await storage.getPasswordCredential(account.id),
          ),
          settings,
          csrfToken: csrf.token,
          invitations,
          users,
          codes,
          error,
          saved: new URL(c.req.url).searchParams.get("saved") === "1",
        }),
      ),
      csrf,
    );
  }
  /** @param {Error} error 内部失败。 @param {import("@hono/hono").Context} c 请求。 @return {Response} 不泄露数据库参数的错误反馈。 */
  app.onError((_error, c) => {
    logSecurityAuditEvent({
      code: "admin_operation_failed",
      level: "warn",
      message: "管理操作未完成。",
      request: c.req.raw,
    });
    return c.text(getMessages(localeFromRequest(c.req.raw)).autoSaveError, 500);
  });
  app.use(
    "*",
    bodyLimit({
      maxSize: 16_384,
      onError: (c) =>
        c.text(
          getMessages(localeFromRequest(c.req.raw)).adminInputInvalid,
          413,
        ),
    }),
  );
  app.use("*", async (c, next) => {
    c.header("cache-control", "no-store, private");
    c.header("referrer-policy", "no-referrer");
    const session = await readAuthSession(c.req.header("cookie"), storage);
    const account = session
      ? await storage.getAccountById(session.userId)
      : undefined;
    if (!account || !isAdministrator(account) || !storage.administration) {
      logSecurityAuditEvent({
        code: "admin_access_denied",
        level: "warn",
        message: "管理权限校验未通过。",
        request: c.req.raw,
        userId: session?.userId,
      });
      return c.text(
        getMessages(localeFromRequest(c.req.raw)).adminAccessDenied,
        403,
      );
    }
    c.set("account", account);
    if (c.req.method !== "GET") {
      const origin = c.req.header("origin"),
        fetchSite = c.req.header("sec-fetch-site");
      if (
        (origin && origin !== new URL(c.req.url).origin) ||
        fetchSite === "cross-site"
      ) {
        return c.text(
          getMessages(localeFromRequest(c.req.raw)).adminAccessDenied,
          403,
        );
      }
      if (Number(c.req.header("content-length") ?? 0) > 16_384) {
        return c.text(
          getMessages(localeFromRequest(c.req.raw)).adminInputInvalid,
          413,
        );
      }
      const form = await c.req.parseBody();
      if (!verifyCsrfToken(c.req.header("cookie"), form.csrfToken)) {
        return c.text(
          getMessages(localeFromRequest(c.req.raw)).adminAccessDenied,
          403,
        );
      }
      if (
        !(await storage.recordRateLimitHit(
          ["admin-write", account.id],
          30,
          60_000,
        )).allowed
      ) {
        return c.text(
          getMessages(localeFromRequest(c.req.raw)).adminRateLimited,
          429,
        );
      }
    }
    await next();
    if (c.res.status === 403) {
      logSecurityAuditEvent({
        code: "admin_write_denied",
        level: "warn",
        message: "管理操作权限校验未通过。",
        userId: account.id,
        request: c.req.raw,
      });
    }
  });
  /** @param {import("@hono/hono").Context} c 当前请求。 @return {Promise<Response>} 按身份和再验证状态展示面板。 */
  app.get("/", (c) => page(c));
  /** @param {import("@hono/hono").Context} c 当前请求。 @return {Promise<Response>} 当前会话的短期管理授权。 */
  app.post("/unlock", async (c) => {
    const account = c.get("account"), form = await c.req.parseBody();
    if (accountRole(account) !== "superadmin") {
      return c.text(
        getMessages(localeFromRequest(c.req.raw)).adminAccessDenied,
        403,
      );
    }
    if (
      !(await storage.recordRateLimitHit(
        ["admin-unlock", account.id],
        5,
        600_000,
      )).allowed
    ) {
      return c.text(
        getMessages(localeFromRequest(c.req.raw)).adminRateLimited,
        429,
      );
    }
    const password = String(form.currentPassword ?? "");
    if (
      password.length > 1024 ||
      !(await verifyAccountPassword(password, account, storage))
    ) {
      logSecurityAuditEvent({
        code: "admin_reauth_failed",
        level: "warn",
        message: "管理员再认证失败。",
        userId: account.id,
        request: c.req.raw,
      });
      return page(c, [], "password");
    }
    const id = await grantId(c);
    await storage.administration!.putTemporary({
      id,
      binding: id,
      userId: account.id,
      roleVersion: account.roleVersion ?? 0,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
    logSecurityAuditEvent({
      code: "admin_reauth_succeeded",
      message: "管理员当前会话已通过再认证。",
      userId: account.id,
    });
    return c.redirect("/admin", 303);
  });
  /** @param {import("@hono/hono").Context} c 当前请求。 @return {Promise<Response>} 仅展示一次的邀请码原文。 */
  app.post("/invitations", async (c) => {
    const form = await c.req.parseBody(),
      account = c.get("account"),
      count = Number(form.count),
      note = String(form.note ?? "").trim(),
      expires = String(form.expiresAt ?? "");
    if (
      !Number.isInteger(count) || count < 1 || count > 20 ||
      note.length > 120 ||
      (expires &&
        (!Number.isFinite(Date.parse(expires)) ||
          Date.parse(expires) <= Date.now()))
    ) return page(c, [], "invalid");
    const codes = Array.from({ length: count }, newInvitationCode);
    const invitations = await Promise.all(codes.map(async (code) => ({
      id: await secretDigest(normalizeInvitation(code)),
      createdAt: new Date().toISOString(),
      createdBy: account.id,
      note,
      ...(expires ? { expiresAt: new Date(expires).toISOString() } : {}),
    })));
    const result = await storage.administration!.issue(account.id, invitations);
    logSecurityAuditEvent({
      code: "admin_invitation_issue",
      message: "管理员生成邀请码。",
      userId: account.id,
      details: { count, result },
    });
    return result === "ok" ? page(c, codes) : page(c, [], result);
  });
  /** @param {import("@hono/hono").Context} c 当前请求。 @return {Promise<Response>} 权限校验后的撤销结果。 */
  app.post("/invitations/:id/revoke", async (c) => {
    const account = c.get("account"), id = c.req.param("id");
    const value = (await storage.administration!.listInvitations()).find(
      (item) => item.id === id,
    );
    if (
      !value ||
      (value.createdBy !== account.id && accountRole(account) !== "superadmin")
    ) {
      return c.text(
        getMessages(localeFromRequest(c.req.raw)).adminAccessDenied,
        403,
      );
    }
    const result = await storage.administration!.revoke(account.id, id);
    logSecurityAuditEvent({
      code: "admin_invitation_revoke",
      message: "管理员撤销邀请码。",
      userId: account.id,
      details: { result },
    });
    return result === "ok"
      ? c.redirect("/admin?saved=1", 303)
      : page(c, [], result);
  });
  /** @param {import("@hono/hono").Context} c 当前请求。 @return {Promise<Response>} 超级管理员的字段白名单操作结果。 */
  app.post("/users/:action", async (c) => {
    const actor = c.get("account");
    if (!(await unlocked(c, actor))) {
      return c.text(
        getMessages(localeFromRequest(c.req.raw)).adminAccessDenied,
        403,
      );
    }
    const form = await c.req.parseBody(), action = c.req.param("action");
    let id = String(form.id ?? ""), assignedRole: string | undefined;
    const version = Number(form.roleVersion);
    if (
      (action === "edit" || action === "delete") &&
      (!Number.isSafeInteger(version) || version < 0)
    ) return page(c, [], "invalid");
    let result: string;
    if (action === "delete") {
      const target = await storage.getAccountById(id);
      if (!target || String(form.confirmUsername ?? "") !== target.username) {
        return page(c, [], "invalid");
      }
      result = await storage.administration!.deleteUser(
        actor.id,
        id,
        version,
      );
    } else if (action === "create" || action === "edit") {
      const username = String(form.username ?? "").trim().toLowerCase(),
        displayName = String(form.displayName ?? "").trim(),
        role = String(form.role ?? "user");
      if (
        !validUsername(username) ||
        (displayName && !validDisplayName(displayName)) ||
        !["user", "admin", "superadmin"].includes(role)
      ) return page(c, [], "invalid");
      const typedRole = role as NonNullable<UserAccount["role"]>;
      assignedRole = role;
      if (action === "edit") {
        result = await storage.administration!.editUser(actor.id, {
          id,
          username,
          displayName,
          role: typedRole,
          roleVersion: version,
        });
      } else {
        const password = String(form.password ?? "");
        if (
          password.length < 12 || password.length > 1024 ||
          password !== form.confirmPassword
        ) return page(c, [], "invalid");
        const now = new Date().toISOString(), userId = crypto.randomUUID();
        id = userId;
        result = await storage.administration!.createUser(actor.id, {
          account: {
            id: userId,
            username,
            displayName,
            role: typedRole,
            createdAt: now,
            authVersion: 2,
          },
          password: { ...await hashPassword(password), userId, updatedAt: now },
        });
      }
    } else return c.notFound();
    logSecurityAuditEvent({
      code: "admin_user_" + action,
      message: "超级管理员执行账号管理操作。",
      userId: actor.id,
      details: { targetId: id, role: assignedRole, result },
    });
    return result === "ok"
      ? c.redirect("/admin?saved=1", 303)
      : page(c, [], result);
  });
  return app;
}
