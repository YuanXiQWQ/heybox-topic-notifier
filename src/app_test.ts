/**
 * @file 本文件验证应用装配层的通用中间件行为。
 */
import { createApplication } from "./app.ts";
import { assertEquals } from "./test_helpers.ts";

Deno.test("application adds baseline security headers", async () => {
  const { app } = createApplication();

  const response = await app.request("https://example.com/login");
  const contentSecurityPolicy = response.headers.get("content-security-policy") ?? "";

  assertEquals(response.status, 200);
  assertEquals(contentSecurityPolicy.includes("default-src 'self'"), true);
  assertEquals(contentSecurityPolicy.includes("frame-ancestors 'none'"), true);
  assertEquals(contentSecurityPolicy.includes("object-src 'none'"), true);
  assertEquals(contentSecurityPolicy.includes("script-src 'self' 'unsafe-inline'"), true);
  assertEquals(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assertEquals(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assertEquals(response.headers.get("origin-agent-cluster"), "?1");
  assertEquals(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assertEquals(response.headers.get("x-content-type-options"), "nosniff");
  assertEquals(response.headers.get("x-frame-options"), "DENY");
  assertEquals(
    response.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains",
  );
});

Deno.test("application omits HSTS for non-HTTPS requests", async () => {
  const { app } = createApplication();

  const response = await app.request("/login");

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("strict-transport-security"), null);
  assertEquals(response.headers.get("content-security-policy") !== null, true);
});
