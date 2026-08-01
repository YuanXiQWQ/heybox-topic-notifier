/**
 * @file 本文件验证 Google ID token 配置读取和服务端验签能力。
 */
import { base64UrlEncode } from "../security/crypto_utils.ts";
import { assertEquals, assertRejects } from "../test_helpers.ts";
import { googleAuthConfigFromEnv, verifyGoogleIdToken } from "./google.ts";

/**
 * Google 验签测试使用的 client ID。
 */
const testGoogleClientId = "test-client-id.apps.googleusercontent.com";

Deno.test("googleAuthConfigFromEnv reads client and JWKS settings", () => {
  const config = googleAuthConfigFromEnv((name) =>
    ({
      GOOGLE_CLIENT_ID: testGoogleClientId,
      GOOGLE_JWKS_URL: "https://keys.example.test/jwks",
    })[name]
  );
  const emptyConfig = googleAuthConfigFromEnv(() => undefined);

  assertEquals(config.clientId, testGoogleClientId);
  assertEquals(config.jwksUrl, "https://keys.example.test/jwks");
  assertEquals(emptyConfig.clientId, "");
  assertEquals(
    emptyConfig.jwksUrl,
    "https://www.googleapis.com/oauth2/v3/certs",
  );
});

Deno.test("verifyGoogleIdToken verifies RS256 tokens and claims", async () => {
  const fixture = await googleTokenFixture();
  let requestedUrl = "";

  const claims = await verifyGoogleIdToken(fixture.token, {
    clientId: testGoogleClientId,
    jwksUrl: "https://keys.example.test/jwks",
  }, {
    fetcher: (input) => {
      requestedUrl = String(input);
      return Promise.resolve(jsonResponse(fixture.jwks));
    },
    now: new Date("2026-08-01T00:00:00.000Z"),
  });

  assertEquals(requestedUrl, "https://keys.example.test/jwks");
  assertEquals(claims, {
    email: "alice@example.com",
    emailVerified: true,
    name: "Alice",
    picture: "https://example.com/avatar.png",
    sub: "google-subject-id",
  });
});

Deno.test("verifyGoogleIdToken rejects tokens for another client", async () => {
  const fixture = await googleTokenFixture({
    aud: "other-client-id.apps.googleusercontent.com",
  });

  await assertRejects(
    () =>
      verifyGoogleIdToken(fixture.token, {
        clientId: testGoogleClientId,
        jwksUrl: "https://keys.example.test/jwks",
      }, {
        fetcher: () => Promise.resolve(jsonResponse(fixture.jwks)),
        now: new Date("2026-08-01T00:00:00.000Z"),
      }),
    "Invalid Google audience.",
  );
});

Deno.test("verifyGoogleIdToken rejects invalid signatures", async () => {
  const fixture = await googleTokenFixture();
  const parts = fixture.token.split(".");
  const tamperedToken = [
    parts[0],
    encodeJwtJson({ ...fixture.payload, sub: "attacker-subject-id" }),
    parts[2],
  ].join(".");

  await assertRejects(
    () =>
      verifyGoogleIdToken(tamperedToken, {
        clientId: testGoogleClientId,
        jwksUrl: "https://keys.example.test/jwks",
      }, {
        fetcher: () => Promise.resolve(jsonResponse(fixture.jwks)),
        now: new Date("2026-08-01T00:00:00.000Z"),
      }),
    "Invalid Google ID token signature.",
  );
});

/**
 * Google token 测试夹具。
 */
type GoogleTokenFixture = {
  jwks: { keys: JsonWebKey[] };
  payload: Record<string, unknown>;
  token: string;
};

/**
 * 创建签名后的 Google ID token 测试夹具。
 *
 * @param payloadOverrides payload 覆盖项。
 * @return Google token 测试夹具。
 */
async function googleTokenFixture(
  payloadOverrides: Record<string, unknown> = {},
): Promise<GoogleTokenFixture> {
  const keyPair = await crypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength: 2048,
      name: "RSASSA-PKCS1-v1_5",
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const jwk = {
    ...publicJwk,
    alg: "RS256",
    kid: "test-key-id",
    use: "sig",
  };
  const header = { alg: "RS256", kid: "test-key-id", typ: "JWT" };
  const payload = {
    aud: testGoogleClientId,
    email: "alice@example.com",
    email_verified: true,
    exp: Math.floor(new Date("2026-08-01T00:10:00.000Z").getTime() / 1000),
    iat: Math.floor(new Date("2026-08-01T00:00:00.000Z").getTime() / 1000),
    iss: "https://accounts.google.com",
    name: "Alice",
    picture: "https://example.com/avatar.png",
    sub: "google-subject-id",
    ...payloadOverrides,
  };
  const signingInput = `${encodeJwtJson(header)}.${encodeJwtJson(payload)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );

  return {
    jwks: { keys: [jwk] },
    payload,
    token: `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`,
  };
}

/**
 * 编码 JWT JSON 片段。
 *
 * @param value 待编码对象。
 * @return Base64URL 编码片段。
 */
function encodeJwtJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

/**
 * 创建 JSON 响应。
 *
 * @param value 响应对象。
 * @return JSON 响应。
 */
function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
