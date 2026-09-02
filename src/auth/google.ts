/**
 * @file 本文件提供 Google ID token 配置读取和服务端验签能力。
 */

/**
 * Google OpenID Connect JWKS 默认地址。
 */
const defaultGoogleJwksUrl = "https://www.googleapis.com/oauth2/v3/certs";

/**
 * Google 允许的 ID token issuer。
 */
const googleIssuers = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);

/**
 * Google 身份验证配置。
 */
export type GoogleAuthConfig = {
  clientId: string;
  jwksUrl: string;
};

/**
 * Google JWKS 拉取函数。
 */
export type GoogleJwksFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Google ID token 验证选项。
 */
export type GoogleIdTokenVerifyOptions = {
  fetcher?: GoogleJwksFetch;
  now?: Date;
};

/**
 * Google ID token 头部。
 */
type GoogleJwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

/**
 * Google ID token payload。
 */
type GoogleJwtPayload = {
  aud?: string | string[];
  email?: string;
  email_verified?: boolean | string;
  exp?: number;
  iat?: number;
  iss?: string;
  name?: string;
  picture?: string;
  sub?: string;
};

/**
 * 验证后的 Google 身份声明。
 */
export type GoogleIdentityClaims = {
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
  sub: string;
};

/**
 * Google JWKS 响应。
 */
type GoogleJwks = {
  keys?: GoogleJwk[];
};

/**
 * Google JWKS 中带 kid 的 RSA 公钥。
 */
type GoogleJwk = JsonWebKey & {
  kid?: string;
};

/**
 * Google 认证配置错误。
 */
export class GoogleAuthConfigError extends Error {
}

/**
 * Google ID token 验证错误。
 */
export class GoogleIdTokenVerificationError extends Error {
}

/**
 * 从环境变量读取 Google 认证配置。
 *
 * @param readEnv 环境变量读取函数。
 * @return Google 认证配置。
 */
export function googleAuthConfigFromEnv(
  readEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): GoogleAuthConfig {
  return {
    clientId: readEnv("GOOGLE_CLIENT_ID") ?? "",
    jwksUrl: readEnv("GOOGLE_JWKS_URL") ?? defaultGoogleJwksUrl,
  };
}

/**
 * 验证 Google ID token 并返回身份声明。
 *
 * @param token Google ID token。
 * @param config Google 认证配置。
 * @param options 验证选项。
 * @return 验证后的 Google 身份声明。
 */
export async function verifyGoogleIdToken(
  token: string,
  config: GoogleAuthConfig,
  options: GoogleIdTokenVerifyOptions = {},
): Promise<GoogleIdentityClaims> {
  const clientId = config.clientId.trim();
  if (!clientId) {
    throw new GoogleAuthConfigError("Google client ID is required.");
  }

  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new GoogleIdTokenVerificationError("Invalid Google ID token.");
  }

  const header = decodeJwtJson<GoogleJwtHeader>(parts[0]);
  if (header.alg !== "RS256" || !header.kid) {
    throw new GoogleIdTokenVerificationError("Unsupported Google ID token.");
  }

  const jwk = await googleJwkForKeyId(
    header.kid,
    config,
    options.fetcher ?? fetch,
  );
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    arrayBufferFromBytes(base64UrlDecodeToBytes(parts[2])),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!verified) {
    throw new GoogleIdTokenVerificationError(
      "Invalid Google ID token signature.",
    );
  }

  const payload = decodeJwtJson<GoogleJwtPayload>(parts[1]);
  validateGooglePayload(payload, clientId, options.now ?? new Date());

  return {
    email: payload.email,
    emailVerified: normalizeGoogleEmailVerified(payload.email_verified),
    name: payload.name,
    picture: payload.picture,
    sub: payload.sub as string,
  };
}

/**
 * 按 kid 查找 Google 公钥。
 *
 * @param kid JWT header 中的 key ID。
 * @param config Google 认证配置。
 * @param fetcher JWKS 拉取函数。
 * @return 匹配的 JWK。
 */
async function googleJwkForKeyId(
  kid: string,
  config: GoogleAuthConfig,
  fetcher: GoogleJwksFetch,
): Promise<JsonWebKey> {
  const response = await fetcher(config.jwksUrl);
  if (!response.ok) {
    throw new GoogleIdTokenVerificationError("Could not fetch Google keys.");
  }

  const jwks = await response.json() as GoogleJwks;
  const jwk = jwks.keys?.find((key) =>
    key.kid === kid && key.kty === "RSA" &&
    (!key.alg || key.alg === "RS256")
  );
  if (!jwk) {
    throw new GoogleIdTokenVerificationError(
      "Google signing key was not found.",
    );
  }

  return { ...jwk, alg: "RS256", ext: true };
}

/**
 * 校验 Google ID token payload。
 *
 * @param payload JWT payload。
 * @param clientId Google OAuth client ID。
 * @param now 当前时间。
 */
function validateGooglePayload(
  payload: GoogleJwtPayload,
  clientId: string,
  now: Date,
): void {
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new GoogleIdTokenVerificationError("Google subject is missing.");
  }

  if (!payload.iss || !googleIssuers.has(payload.iss)) {
    throw new GoogleIdTokenVerificationError("Invalid Google issuer.");
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(clientId)) {
    throw new GoogleIdTokenVerificationError("Invalid Google audience.");
  }

  if (!payload.exp || payload.exp * 1000 <= now.getTime()) {
    throw new GoogleIdTokenVerificationError("Google ID token has expired.");
  }
}

/**
 * 规范化 Google email_verified 声明。
 *
 * @param value 原始 email_verified 声明。
 * @return 规范化后的布尔值。
 */
function normalizeGoogleEmailVerified(
  value: boolean | string | undefined,
): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value === "true";
  }
  return undefined;
}

/**
 * 解码 JWT JSON 片段。
 *
 * @param segment Base64URL 编码的 JWT 片段。
 * @return 解码后的 JSON 对象。
 */
function decodeJwtJson<T>(segment: string): T {
  try {
    return JSON.parse(
      new TextDecoder().decode(base64UrlDecodeToBytes(segment)),
    ) as T;
  } catch {
    throw new GoogleIdTokenVerificationError("Invalid Google ID token JSON.");
  }
}

/**
 * 将 Base64URL 字符串解码为字节数组。
 *
 * @param value Base64URL 字符串。
 * @return 解码后的字节数组。
 */
function base64UrlDecodeToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * 将字节数组复制为 ArrayBuffer。
 *
 * @param value 字节数组。
 * @return 独立 ArrayBuffer。
 */
function arrayBufferFromBytes(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}
