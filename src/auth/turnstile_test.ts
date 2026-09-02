/**
 * @file 本文件验证 Cloudflare Turnstile 服务端校验能力。
 */
import { assertEquals } from "../test_helpers.ts";
import { turnstileConfigFromEnv, verifyTurnstileToken } from "./turnstile.ts";

Deno.test("turnstileConfigFromEnv reads disabled configuration by default", () => {
  const config = turnstileConfigFromEnv(() => undefined);

  assertEquals(config, {
    enabled: false,
    secretKey: "",
    siteKey: "",
  });
});

Deno.test("turnstileConfigFromEnv enables only explicit true value", () => {
  const values = new Map([
    ["TURNSTILE_ENABLED", "true"],
    ["TURNSTILE_SECRET_KEY", "secret-key"],
    ["TURNSTILE_SITE_KEY", "site-key"],
  ]);
  const config = turnstileConfigFromEnv((name) => values.get(name));

  assertEquals(config, {
    enabled: true,
    secretKey: "secret-key",
    siteKey: "site-key",
  });
});

Deno.test("verifyTurnstileToken skips verification when disabled", async () => {
  let called = false;

  const result = await verifyTurnstileToken("token", {
    enabled: false,
    secretKey: "",
    siteKey: "",
  }, {
    fetcher: () => {
      called = true;
      return Promise.resolve(new Response("{}"));
    },
  });

  assertEquals(result, { skipped: true, success: true });
  assertEquals(called, false);
});

Deno.test("verifyTurnstileToken rejects missing configuration and token", async () => {
  const missingConfig = await verifyTurnstileToken("token", {
    enabled: true,
    secretKey: "",
    siteKey: "site-key",
  });
  const missingToken = await verifyTurnstileToken("  ", {
    enabled: true,
    secretKey: "secret-key",
    siteKey: "site-key",
  });

  assertEquals(missingConfig, {
    errorCodes: ["missing-config"],
    success: false,
  });
  assertEquals(missingToken, {
    errorCodes: ["missing-input-response"],
    success: false,
  });
});

Deno.test("verifyTurnstileToken posts siteverify payload", async () => {
  let requestUrl = "";
  let requestBody = "";

  const result = await verifyTurnstileToken("response-token", {
    enabled: true,
    secretKey: "secret-key",
    siteKey: "site-key",
    verifyUrl: "https://turnstile.example.test/siteverify",
  }, {
    fetcher: async (input, init) => {
      requestUrl = String(input);
      requestBody = await requestText(init?.body);
      return new Response(JSON.stringify({ success: true }));
    },
    remoteIp: "203.0.113.10",
  });

  assertEquals(result, { success: true });
  assertEquals(requestUrl, "https://turnstile.example.test/siteverify");
  assertEquals(requestBody.includes("secret=secret-key"), true);
  assertEquals(requestBody.includes("response=response-token"), true);
  assertEquals(requestBody.includes("remoteip=203.0.113.10"), true);
});

Deno.test("verifyTurnstileToken returns siteverify failure codes", async () => {
  const result = await verifyTurnstileToken("response-token", {
    enabled: true,
    secretKey: "secret-key",
    siteKey: "site-key",
  }, {
    fetcher: () =>
      Promise.resolve(
        new Response(JSON.stringify({
          "error-codes": ["timeout-or-duplicate"],
          success: false,
        })),
      ),
  });

  assertEquals(result, {
    errorCodes: ["timeout-or-duplicate"],
    success: false,
  });
});

/**
 * 将测试请求 body 转换为字符串。
 *
 * @param body fetch 请求 body。
 * @return 请求 body 字符串。
 */
async function requestText(body: BodyInit | null | undefined): Promise<string> {
  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  return await new Response(body).text();
}
