/**
 * @file 本文件验证邮箱认证辅助能力。
 */
import { assertEquals } from "../test_helpers.ts";
import { normalizeEmailAddress } from "./email.ts";

Deno.test("normalizeEmailAddress trims and lowercases addresses", () => {
  assertEquals(
    normalizeEmailAddress("  Alice.Alerts+App@Example.COM  "),
    "alice.alerts+app@example.com",
  );
});

Deno.test("normalizeEmailAddress rejects malformed addresses", () => {
  assertEquals(normalizeEmailAddress(""), undefined);
  assertEquals(normalizeEmailAddress("alice"), undefined);
  assertEquals(normalizeEmailAddress("alice@@example.com"), undefined);
  assertEquals(normalizeEmailAddress(".alice@example.com"), undefined);
  assertEquals(normalizeEmailAddress("alice..alerts@example.com"), undefined);
  assertEquals(normalizeEmailAddress("alice@example..com"), undefined);
  assertEquals(normalizeEmailAddress("alice@-example.com"), undefined);
});
