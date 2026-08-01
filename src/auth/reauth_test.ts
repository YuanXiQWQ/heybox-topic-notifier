/**
 * @file 本文件验证敏感操作再认证辅助逻辑。
 */
import {
  createStrongAuthenticationEvent,
  isRecentStrongAuthenticationEvent,
  reauthConfigFromEnv,
} from "./reauth.ts";
import { assertEquals } from "../test_helpers.ts";

Deno.test("reauthConfigFromEnv reads defaults and overrides", () => {
  assertEquals(reauthConfigFromEnv(() => undefined), {
    maxAgeSeconds: 600,
  });
  assertEquals(
    reauthConfigFromEnv((name) =>
      name === "AUTH_REAUTH_MAX_AGE_SECONDS" ? "120" : undefined
    ),
    { maxAgeSeconds: 120 },
  );
});

Deno.test("createStrongAuthenticationEvent records strong auth metadata", () => {
  assertEquals(
    createStrongAuthenticationEvent({
      method: "passkey",
      now: new Date("2026-08-01T00:00:00.000Z"),
      purpose: "reauth",
      userId: "alice-id",
    }),
    {
      authenticatedAt: "2026-08-01T00:00:00.000Z",
      method: "passkey",
      purpose: "reauth",
      strength: "strong",
      userId: "alice-id",
    },
  );
});

Deno.test("isRecentStrongAuthenticationEvent checks age and strength", () => {
  const event = createStrongAuthenticationEvent({
    method: "password",
    now: new Date("2026-08-01T00:00:00.000Z"),
    purpose: "reauth",
    userId: "alice-id",
  });

  assertEquals(
    isRecentStrongAuthenticationEvent(
      event,
      { maxAgeSeconds: 600 },
      new Date("2026-08-01T00:09:59.000Z"),
    ),
    true,
  );
  assertEquals(
    isRecentStrongAuthenticationEvent(
      event,
      { maxAgeSeconds: 600 },
      new Date("2026-08-01T00:10:01.000Z"),
    ),
    false,
  );
  assertEquals(
    isRecentStrongAuthenticationEvent(
      { ...event, strength: "normal" },
      { maxAgeSeconds: 600 },
      new Date("2026-08-01T00:00:01.000Z"),
    ),
    false,
  );
});
