import { Hono } from "@hono/hono";
import type { MiddlewareHandler } from "@hono/hono";
import type { UserAccount } from "./models.ts";
import type { createKvStorage } from "./storage/kv.ts";

type Storage = ReturnType<typeof createKvStorage>;

export type AuthSession = {
  userId: string;
  username: string;
};

export type AuthOptions = {
  cookieName?: string;
  exemptPaths?: string[];
  loginPath?: string;
  registerPath?: string;
  sessionMaxAgeSeconds?: number;
};

type AuthConfig = {
  cookieName: string;
  exemptPaths: Set<string>;
  loginPath: string;
  registerPath: string;
  sessionMaxAgeSeconds: number;
};

const defaultCookieName = "heybox_session";
const defaultLoginPath = "/login";
const defaultRegisterPath = "/register";
const defaultSessionMaxAgeSeconds = 60 * 60 * 24 * 30;
const passwordIterations = 210_000;

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
    if (c.req.method === "GET") {
      loginUrl.searchParams.set("returnTo", pathWithSearch(url));
    }
    return c.redirect(pathWithSearch(loginUrl), 303);
  };
}

export function createAuthRoutes(storage: Storage, options: AuthOptions = {}): Hono {
  const config = authConfig(options);
  const app = new Hono();

  app.get(config.loginPath, (c) => {
    const url = new URL(c.req.url);
    return c.html(renderAuthPage({
      action: config.loginPath,
      error: loginErrorMessage(url.searchParams.get("error")),
      heading: "登录",
      mode: "login",
      returnTo: safeReturnTo(url.searchParams.get("returnTo")),
      submitLabel: "登录",
    }));
  });

  app.post(config.loginPath, async (c) => {
    const form = await c.req.parseBody();
    const username = normalizeUsername(String(form.username ?? ""));
    const password = String(form.password ?? "");
    const returnTo = safeReturnTo(String(form.returnTo ?? "/"));
    const account = await storage.getAccountByUsername(username);

    if (!account || !(await verifyPassword(password, account))) {
      return c.redirect(
        `${config.loginPath}?error=invalid&returnTo=${encodeURIComponent(returnTo)}`,
        303,
      );
    }

    return await redirectWithSession(c.req.url, returnTo, account, storage, config);
  });

  app.get(config.registerPath, (c) => {
    const url = new URL(c.req.url);
    return c.html(renderAuthPage({
      action: config.registerPath,
      error: registerErrorMessage(url.searchParams.get("error")),
      heading: "注册",
      mode: "register",
      returnTo: safeReturnTo(url.searchParams.get("returnTo")),
      submitLabel: "创建账号",
    }));
  });

  app.post(config.registerPath, async (c) => {
    const form = await c.req.parseBody();
    const username = normalizeUsername(String(form.username ?? ""));
    const password = String(form.password ?? "");
    const returnTo = safeReturnTo(String(form.returnTo ?? "/"));
    const validationError = validateRegistration(username, password);

    if (validationError) {
      return c.redirect(`${config.registerPath}?error=${validationError}`, 303);
    }

    if (await storage.getAccountByUsername(username)) {
      return c.redirect(`${config.registerPath}?error=exists`, 303);
    }

    const account: UserAccount = {
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      passwordIterations,
      username,
      ...(await hashPassword(password)),
    };

    await storage.saveAccount(account);
    return await redirectWithSession(c.req.url, returnTo, account, storage, config);
  });

  app.post("/logout", async (c) => {
    const token = parseCookies(c.req.header("cookie")).get(config.cookieName);
    if (token) {
      await storage.deleteSession(await sessionTokenHash(token));
    }

    return new Response(null, {
      headers: {
        location: config.loginPath,
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

function authConfig(options: AuthOptions): AuthConfig {
  const loginPath = options.loginPath ?? defaultLoginPath;
  const registerPath = options.registerPath ?? defaultRegisterPath;

  return {
    cookieName: options.cookieName ?? defaultCookieName,
    exemptPaths: new Set(
      options.exemptPaths ?? ["/healthz", loginPath, registerPath, "/static/app.css"],
    ),
    loginPath,
    registerPath,
    sessionMaxAgeSeconds: options.sessionMaxAgeSeconds ?? defaultSessionMaxAgeSeconds,
  };
}

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

function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(bytes);
}

async function sessionTokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return base64UrlEncode(new Uint8Array(digest));
}

async function hashPassword(
  password: string,
): Promise<Pick<UserAccount, "passwordHash" | "passwordSalt">> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt, passwordIterations);

  return {
    passwordHash: base64UrlEncode(hash),
    passwordSalt: base64UrlEncode(salt),
  };
}

async function verifyPassword(password: string, account: UserAccount): Promise<boolean> {
  const hash = await derivePasswordHash(
    password,
    base64UrlDecode(account.passwordSalt),
    account.passwordIterations,
  );
  return constantTimeEquals(base64UrlEncode(hash), account.passwordHash);
}

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

function arrayBufferFromBytes(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}

function renderAuthPage(options: {
  action: string;
  error?: string;
  heading: string;
  mode: "login" | "register";
  returnTo: string;
  submitLabel: string;
}): string {
  const switchHref = options.mode === "login" ? "/register" : "/login";
  const switchLabel = options.mode === "login" ? "创建账号" : "已有账号，去登录";

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(options.heading)} - 小黑盒话题提醒</title>
    <link rel="stylesheet" href="/static/app.css">
    <style>
      body {
        min-height: 100vh;
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
    </style>
  </head>
  <body>
    <main class="auth-panel">
      <h1>${escapeHtml(options.heading)}</h1>
      <form method="post" action="${escapeHtml(options.action)}">
        <input type="hidden" name="returnTo" value="${escapeHtml(options.returnTo)}">
        <div class="auth-fields">
          <label>
            用户名
            <input name="username" autocomplete="username" required autofocus>
          </label>
          <label>
            密码
            <input name="password" type="password" autocomplete="${
    options.mode === "login" ? "current-password" : "new-password"
  }" required>
          </label>
        </div>
        ${options.error ? `<div class="auth-error">${escapeHtml(options.error)}</div>` : ""}
        <button type="submit">${escapeHtml(options.submitLabel)}</button>
      </form>
      <a href="${switchHref}?returnTo=${encodeURIComponent(options.returnTo)}">${switchLabel}</a>
    </main>
  </body>
</html>`;
}

function loginErrorMessage(value: string | null): string | undefined {
  return value === "invalid" ? "用户名或密码不正确。" : undefined;
}

function registerErrorMessage(value: string | null): string | undefined {
  switch (value) {
    case "exists":
      return "这个用户名已经被注册。";
    case "password":
      return "密码至少需要 8 个字符。";
    case "username":
      return "用户名只能包含 3-40 个字母、数字、下划线或短横线。";
    default:
      return undefined;
  }
}

function validateRegistration(username: string, password: string): string | undefined {
  if (!/^[a-z0-9_-]{3,40}$/.test(username)) {
    return "username";
  }

  if (password.length < 8) {
    return "password";
  }

  return undefined;
}

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

function pathWithSearch(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

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

function base64UrlEncode(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
