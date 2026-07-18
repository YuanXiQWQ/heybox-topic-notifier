/**
 * @file 本文件提供登录、注册、会话读取和认证中间件。
 */
import { Hono } from "@hono/hono";
import type { MiddlewareHandler } from "@hono/hono";
import { getMessages } from "./locales/index.ts";
import { languageOptions } from "./locales/languages.ts";
import type { Locale, Messages } from "./locales/types.ts";
import type { UserAccount } from "./models.ts";
import type { createKvStorage } from "./storage/kv.ts";

/**
 * 认证模块使用的存储类型。
 */
type Storage = ReturnType<typeof createKvStorage>;

/**
 * 已认证会话信息。
 */
export type AuthSession = {
  userId: string;
  username: string;
};

/**
 * 认证模块配置选项。
 */
export type AuthOptions = {
  cookieName?: string;
  exemptPaths?: string[];
  loginLockoutSeconds?: number;
  maxLoginFailures?: number;
  defaultLocale?: Locale;
  loginPath?: string;
  registerPath?: string;
  sessionMaxAgeSeconds?: number;
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
  loginPath: string;
  registerPath: string;
  sessionMaxAgeSeconds: number;
};

/**
 * 默认登录 Cookie 名称。
 */
const defaultCookieName = "heybox_session";
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

    const session = await readAuthSession(c.req.header("cookie"), storage, options);
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
export function createAuthRoutes(storage: Storage, options: AuthOptions = {}): Hono {
  const config = authConfig(options);
  const app = new Hono();

  app.get(config.loginPath, (c) => {
    const url = new URL(c.req.url);
    const locale = authPageLocale(url, c.req.header("accept-language"), config);
    const messages = getMessages(locale);
    return c.html(renderAuthPage({
      action: authPagePath(config.loginPath, locale),
      error: loginErrorMessage(url.searchParams.get("error"), messages),
      heading: messages.authLogin,
      locale,
      messages,
      mode: "login",
      returnTo: safeReturnTo(url.searchParams.get("returnTo")),
      submitLabel: messages.authLogin,
    }));
  });

  app.post(config.loginPath, async (c) => {
    const form = await c.req.parseBody();
    const username = normalizeUsername(String(form.username ?? ""));
    const password = String(form.password ?? "");
    const returnTo = safeReturnTo(String(form.returnTo ?? "/"));
    const locale = authPageLocale(new URL(c.req.url), c.req.header("accept-language"), config);
    const canRateLimit = validUsername(username);
    const loginFailure = canRateLimit ? await storage.getLoginFailure(username) : undefined;

    if (isLoginLocked(loginFailure)) {
      return loginRateLimitedRedirect(config.loginPath, returnTo, locale);
    }

    const account = await storage.getAccountByUsername(username);

    if (!account || !(await verifyPassword(password, account))) {
      const failure = canRateLimit
        ? await storage.recordLoginFailure(
          username,
          config.maxLoginFailures,
          config.loginLockoutSeconds * 1000,
        )
        : undefined;
      if (isLoginLocked(failure)) {
        return loginRateLimitedRedirect(config.loginPath, returnTo, locale);
      }

      return c.redirect(
        authPagePath(config.loginPath, locale, { error: "invalid", returnTo }),
        303,
      );
    }

    if (canRateLimit) {
      await storage.clearLoginFailures(username);
    }

    return await redirectWithSession(c.req.url, returnTo, account, storage, config);
  });

  app.get(config.registerPath, (c) => {
    const url = new URL(c.req.url);
    const locale = authPageLocale(url, c.req.header("accept-language"), config);
    const messages = getMessages(locale);
    return c.html(renderAuthPage({
      action: authPagePath(config.registerPath, locale),
      error: registerErrorMessage(url.searchParams.get("error"), messages),
      heading: messages.authRegister,
      locale,
      messages,
      mode: "register",
      returnTo: safeReturnTo(url.searchParams.get("returnTo")),
      submitLabel: messages.authCreateAccount,
    }));
  });

  app.post(config.registerPath, async (c) => {
    const form = await c.req.parseBody();
    const username = normalizeUsername(String(form.username ?? ""));
    const password = String(form.password ?? "");
    const confirmPassword = String(form.confirmPassword ?? "");
    const returnTo = safeReturnTo(String(form.returnTo ?? "/"));
    const locale = authPageLocale(new URL(c.req.url), c.req.header("accept-language"), config);
    const validationError = validateRegistration(username, password, confirmPassword);

    if (validationError) {
      return c.redirect(
        authPagePath(config.registerPath, locale, { error: validationError }),
        303,
      );
    }

    const account: UserAccount = {
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      passwordIterations,
      username,
      ...(await hashPassword(password)),
    };

    if (!(await storage.createAccount(account))) {
      return c.redirect(authPagePath(config.registerPath, locale, { error: "exists" }), 303);
    }

    return await redirectWithSession(c.req.url, returnTo, account, storage, config);
  });

  app.post("/logout", async (c) => {
    const token = parseCookies(c.req.header("cookie")).get(config.cookieName);
    if (token) {
      await storage.deleteSession(await sessionTokenHash(token));
    }

    return new Response(null, {
      headers: {
        location: authPagePath(config.loginPath, config.defaultLocale),
        "set-cookie": serializeCookie(config.cookieName, "", {
          httpOnly: true,
          maxAge: 0,
          path: "/",
          sameSite: "Lax",
          secure: new URL(c.req.url).protocol === "https:",
        }),
      },
      status: 303,
    });
  });

  return app;
}

/**
 * 从 Cookie 中读取已认证会话。
 *
 * @param cookieHeader Cookie 请求头。
 * @param storage 应用存储。
 * @param options 认证配置选项。
 * @return 有效认证会话，不存在或过期时返回 undefined。
 */
export async function readAuthSession(
  cookieHeader: string | undefined,
  storage: Storage,
  options: AuthOptions = {},
): Promise<AuthSession | undefined> {
  const config = authConfig(options);
  const token = parseCookies(cookieHeader).get(config.cookieName);
  if (!token) {
    return undefined;
  }

  const tokenHash = await sessionTokenHash(token);
  const session = await storage.getSession(tokenHash);
  if (!session) {
    return undefined;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await storage.deleteSession(tokenHash);
    return undefined;
  }

  return { userId: session.userId, username: session.username };
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
    exemptPaths: new Set(
      options.exemptPaths ?? ["/healthz", loginPath, registerPath, "/static/app.css"],
    ),
    loginLockoutSeconds: options.loginLockoutSeconds ?? defaultLoginLockoutSeconds,
    maxLoginFailures: options.maxLoginFailures ?? defaultMaxLoginFailures,
    loginPath,
    registerPath,
    sessionMaxAgeSeconds: options.sessionMaxAgeSeconds ?? defaultSessionMaxAgeSeconds,
  };
}

/**
 * 创建会话并返回带会话 Cookie 的重定向响应。
 *
 * @param requestUrl 当前请求 URL。
 * @param location 重定向目标。
 * @param account 用户账号。
 * @param storage 应用存储。
 * @param config 认证配置。
 * @return 重定向响应。
 */
async function redirectWithSession(
  requestUrl: string,
  location: string,
  account: UserAccount,
  storage: Storage,
  config: AuthConfig,
): Promise<Response> {
  const token = createSessionToken();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + config.sessionMaxAgeSeconds * 1000);

  await storage.saveSession({
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    tokenHash: await sessionTokenHash(token),
    userId: account.id,
    username: account.username,
  });

  return new Response(null, {
    headers: {
      location,
      "set-cookie": serializeCookie(config.cookieName, token, {
        httpOnly: true,
        maxAge: config.sessionMaxAgeSeconds,
        path: "/",
        sameSite: "Lax",
        secure: new URL(requestUrl).protocol === "https:",
      }),
    },
    status: 303,
  });
}

/**
 * 创建随机会话令牌。
 *
 * @return Base64URL 编码的会话令牌。
 */
function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(bytes);
}

/**
 * 计算会话令牌哈希。
 *
 * @param token 会话令牌。
 * @return Base64URL 编码的令牌哈希。
 */
async function sessionTokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * 对密码进行加盐哈希。
 *
 * @param password 原始密码。
 * @return 密码哈希和盐。
 */
export async function hashPassword(
  password: string,
): Promise<Pick<UserAccount, "passwordHash" | "passwordSalt">> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt, passwordIterations);

  return {
    passwordHash: base64UrlEncode(hash),
    passwordSalt: base64UrlEncode(salt),
  };
}

/**
 * 校验密码是否匹配账号密码哈希。
 *
 * @param password 原始密码。
 * @param account 用户账号。
 * @return 密码匹配时返回 true。
 */
export async function verifyPassword(password: string, account: UserAccount): Promise<boolean> {
  const hash = await derivePasswordHash(
    password,
    base64UrlDecode(account.passwordSalt),
    account.passwordIterations,
  );
  return constantTimeEquals(base64UrlEncode(hash), account.passwordHash);
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
    { hash: "SHA-256", iterations, name: "PBKDF2", salt: arrayBufferFromBytes(salt) },
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
  error?: string;
  heading: string;
  locale: Locale;
  messages: Messages;
  mode: "login" | "register";
  returnTo: string;
  submitLabel: string;
}): string {
  const switchPath = options.mode === "login" ? "/register" : "/login";
  const switchHref = authPagePath(switchPath, options.locale, { returnTo: options.returnTo });
  const switchLabel = options.mode === "login"
    ? options.messages.authCreateAccount
    : options.messages.authExistingAccountLogin;
  const languageOptionsHtml = renderLanguageOptions(
    options.action,
    options.locale,
    options.returnTo,
  );

  return `<!doctype html>
<html lang="${options.locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(options.heading)} - ${escapeHtml(options.messages.appName)}</title>
    <link rel="stylesheet" href="/static/app.css">
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

      .auth-panel h1 {
        margin: 0;
        font-size: 1.45rem;
      }

      .auth-error {
        color: #b42318;
        font-size: 0.92rem;
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
        right: 0;
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
      <nav class="primary-nav" aria-label="${escapeHtml(options.messages.authNavigation)}">
        <details class="auth-language-menu">
          <summary class="auth-language-button" title="${
    escapeHtml(options.messages.authLanguage)
  }">
            ${renderLanguageIcon()}
            <span>${escapeHtml(options.messages.authLanguageButton)}</span>
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
        <form method="post" action="${escapeHtml(options.action)}">
          <input type="hidden" name="returnTo" value="${escapeHtml(options.returnTo)}">
          <div class="auth-fields">
            <label>
              ${escapeHtml(options.messages.authUsername)}
              <input name="username" autocomplete="username" required autofocus>
            </label>
            <label>
              ${escapeHtml(options.messages.authPassword)}
              <input name="password" type="password" autocomplete="${
    options.mode === "login" ? "current-password" : "new-password"
  }" required>
            </label>
            ${
    options.mode === "register"
      ? `<label>
              ${escapeHtml(options.messages.authConfirmPassword)}
              <input name="confirmPassword" type="password" autocomplete="new-password" required>
            </label>`
      : ""
  }
          </div>
          ${options.error ? `<div class="auth-error">${escapeHtml(options.error)}</div>` : ""}
          <button type="submit">${escapeHtml(options.submitLabel)}</button>
        </form>
        <a href="${escapeHtml(switchHref)}">${escapeHtml(switchLabel)}</a>
      </section>
    </main>
  </body>
</html>`;
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
 * 将语言标签匹配到应用支持的语言。
 *
 * @param value 原始语言标签。
 * @return 支持的语言标识，无法匹配时返回 undefined。
 */
function localeFromLanguageTag(value: string | null | undefined): Locale | undefined {
  const normalized = value?.toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const exactOption = languageOptions.find((option) => option.code.toLowerCase() === normalized);
  if (exactOption) {
    return exactOption.code;
  }

  const languageCode = normalized.split("-")[0];
  return languageOptions.find((option) => option.code.toLowerCase().split("-")[0] === languageCode)
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
 * 渲染语言切换按钮图标。
 *
 * @return 语言图标 SVG。
 */
function renderLanguageIcon(): string {
  return `<svg class="auth-language-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M3 12h18"></path>
            <path d="M12 3a13.5 13.5 0 0 1 0 18"></path>
            <path d="M12 3a13.5 13.5 0 0 0 0 18"></path>
          </svg>`;
}

/**
 * 渲染认证页可用语言选项。
 *
 * @param action 当前认证页路径。
 * @param currentLocale 当前语言。
 * @param returnTo 登录后返回路径。
 * @return 语言选项 HTML。
 */
function renderLanguageOptions(action: string, currentLocale: Locale, returnTo: string): string {
  const actionPath = action.split("?")[0] ?? action;
  return languageOptions.map((option) => {
    const currentAttribute = option.code === currentLocale ? ' aria-current="true"' : "";
    return `<a href="${
      escapeHtml(authPagePath(actionPath, option.code, { returnTo }))
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
function loginErrorMessage(value: string | null, messages: Messages): string | undefined {
  switch (value) {
    case "invalid":
      return messages.authInvalidCredentials;
    case "rateLimited":
      return messages.authLoginRateLimited;
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
  return failure?.lockedUntil !== undefined && Date.parse(failure.lockedUntil) > Date.now();
}

/**
 * 创建登录频率受限时的重定向响应。
 *
 * @param loginPath 登录路径。
 * @param returnTo 登录成功后的返回路径。
 * @param locale 当前页面语言。
 * @return 重定向响应。
 */
function loginRateLimitedRedirect(loginPath: string, returnTo: string, locale: Locale): Response {
  return new Response(null, {
    headers: {
      location: authPagePath(loginPath, locale, { error: "rateLimited", returnTo }),
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
function registerErrorMessage(value: string | null, messages: Messages): string | undefined {
  switch (value) {
    case "exists":
      return messages.authUsernameExists;
    case "password":
      return messages.authPasswordMinLength;
    case "confirmPassword":
      return messages.authPasswordConfirmationMismatch;
    case "username":
      return messages.authUsernameInvalid;
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
 * 解析 Cookie 请求头。
 *
 * @param value Cookie 请求头。
 * @return Cookie 名值映射。
 */
function parseCookies(value: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of value?.split(";") ?? []) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    cookies.set(part.slice(0, separatorIndex).trim(), part.slice(separatorIndex + 1).trim());
  }
  return cookies;
}

/**
 * 序列化 Set-Cookie 响应头值。
 *
 * @param name Cookie 名称。
 * @param value Cookie 值。
 * @param options Cookie 选项。
 * @return Set-Cookie 头值。
 */
function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly: boolean;
    maxAge: number;
    path: string;
    sameSite: "Lax" | "Strict";
    secure: boolean;
  },
): string {
  return [
    `${name}=${value}`,
    `Max-Age=${options.maxAge}`,
    `Path=${options.path}`,
    `SameSite=${options.sameSite}`,
    options.httpOnly ? "HttpOnly" : "",
    options.secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

/**
 * 将字节数组编码为 Base64URL 字符串。
 *
 * @param value 待编码字节。
 * @return Base64URL 字符串。
 */
function base64UrlEncode(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
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
 * 使用常量时间比较两个字符串。
 *
 * @param left 左侧字符串。
 * @param right 右侧字符串。
 * @return 两个字符串相等时返回 true。
 */
function constantTimeEquals(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let diff = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
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
