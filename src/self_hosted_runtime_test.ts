/** @file 验证自托管配置禁止托管 KV 回退，并保持反向代理后的 HTTPS 认证来源。 */
import { assertEquals } from "./test_helpers.ts";
import { csrfTokenForRequest } from "./security/csrf.ts";
import { selfHostedConfig, selfHostedHandler } from "./self_hosted_runtime.ts";

/** 无密钥的有效自托管测试配置。 */
const environment = {
  STORAGE_READ_BACKEND: "turso",
  PUBLIC_ORIGIN: "https://heybox.example.com",
  VM_POLLING_ENABLED: "false",
};

Deno.test("self-hosted deployment identity does not enable managed hosting", () => {
  assertEquals(
    configure({ APP_DEPLOYMENT_ID: "a".repeat(40), APP_VERSION: "3.13.2" }),
    configure(),
  );
  const script = Deno.readTextFileSync(
    new URL("../ops/deploy.sh", import.meta.url),
  );
  assertEquals(script.includes("APP_DEPLOYMENT_ID=%s"), true);
  assertEquals(script.includes("DENO_DEPLOYMENT_ID=%s"), false);
});

Deno.test("self-hosted startup rejects cloud storage, implicit background polling and invalid public origins", () => {
  assertEquals(configure(), {
    origin: "https://heybox.example.com",
    polling: false,
    port: 8000,
  });
  assertEquals(
    configure({
      VM_POLLING_ENABLED: "true",
      PORT: "8001",
      HEYBOX_DEVICE_ID: "test-fixed-device",
    }).polling,
    true,
  );
  for (
    const invalid of [
      { STORAGE_READ_BACKEND: "kv" },
      { STORAGE_DUAL_WRITE: "turso" },
      { STORAGE_SHADOW_READ: "turso" },
      { DENO_KV_SOURCE_URL: "https://secret.example.test" },
      { DENO_KV_ACCESS_TOKEN: "secret-test-value" },
      { DENO_DEPLOYMENT_ID: "deployment" },
      { VM_POLLING_ENABLED: "" },
      { VM_POLLING_ENABLED: "true" },
      { VM_POLLING_ENABLED: "true", HEYBOX_DEVICE_ID: "bad&id" },
      { PORT: "0" },
      { PORT: "NaN" },
      { PUBLIC_ORIGIN: "http://heybox.example.com" },
      { PUBLIC_ORIGIN: "https://132.145.103.53" },
      { PUBLIC_ORIGIN: "https://heybox.example.com/path" },
      { PUBLIC_ORIGIN: "https://heybox.example.com?query=1" },
      { PUBLIC_ORIGIN: "https://user:password@heybox.example.com" },
      { PUBLIC_ORIGIN: "https://app.deno.net" },
    ]
  ) {
    let message = "";
    try {
      configure(invalid);
    } catch (error) {
      message = (error as Error).message;
    }
    assertEquals(message.length > 0, true);
    assertEquals(message.includes("secret-test-value"), false);
    assertEquals(message.includes("user:password"), false);
  }
});

Deno.test("self-hosted proxy preserves POST bodies and HTTPS CSRF origin while ignoring forged forwarding headers", async () => {
  const handler = selfHostedHandler(
    "https://heybox.example.com",
    async (request) => {
      assertEquals(
        request.url,
        "https://heybox.example.com/auth/native/start?test=1",
      );
      assertEquals(request.headers.get("origin"), new URL(request.url).origin);
      assertEquals(await request.text(), "test-body");
      const cookie = csrfTokenForRequest(undefined, request.url).setCookie!;
      assertEquals(cookie.includes("Secure"), true);
      return new Response("ok");
    },
  );
  const response = await handler(
    new Request("http://heybox.example.com/auth/native/start?test=1", {
      method: "POST",
      body: "test-body",
      headers: {
        origin: "https://heybox.example.com",
        "x-forwarded-host": "evil.example.test",
        "x-forwarded-proto": "http",
      },
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(await response.text(), "ok");
});

Deno.test("self-hosted proxy rejects unexpected Host before passing a request to the application", async () => {
  let called = false;
  const handler = selfHostedHandler("https://heybox.example.com", () => {
    called = true;
    return new Response();
  });
  for (
    const url of [
      "http://evil.example.test/auth/login",
      "http://127.0.0.1:8000/auth/login",
      "http://heybox.example.com:8000/auth/login",
    ]
  ) {
    assertEquals((await handler(new Request(url))).status, 421);
  }
  assertEquals(called, false);
});

/**
 * 覆盖指定测试环境项并校验配置。
 * @param {Record<string, string | undefined>} overrides 测试覆盖值。
 * @return {ReturnType<typeof selfHostedConfig>} 启动配置。
 */
function configure(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    ...environment,
    ...overrides,
  };
  return selfHostedConfig({ get: (name) => values[name] });
}
