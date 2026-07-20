/**
 * @file 本文件验证小黑盒相对时间格式化逻辑。
 */
import { formatHeyboxRelativeTime } from "./time.ts";

/**
 * 相对时间测试使用的固定当前时间。
 */
const now = new Date("2026-06-30T16:00:00.000Z");

Deno.test("formatHeyboxRelativeTime formats recent relative times", () => {
  assertEquals(formatHeyboxRelativeTime("2026-06-30T16:00:00.000Z", now), "刚刚");
  assertEquals(formatHeyboxRelativeTime("2026-06-30T15:59:57.000Z", now), "3 秒前");
  assertEquals(formatHeyboxRelativeTime("2026-06-30T15:57:00.000Z", now), "3 分钟前");
  assertEquals(formatHeyboxRelativeTime("2026-06-30T13:00:00.000Z", now), "3 小时前");
});

Deno.test("formatHeyboxRelativeTime uses localized relative messages", () => {
  assertEquals(formatHeyboxRelativeTime("2026-06-30T16:00:00.000Z", now, "en-US"), "just now");
  assertEquals(formatHeyboxRelativeTime("2026-06-30T15:59:57.000Z", now, "en-US"), "3 seconds ago");
  assertEquals(formatHeyboxRelativeTime("2026-06-30T15:57:00.000Z", now, "en-US"), "3 minutes ago");
  assertEquals(formatHeyboxRelativeTime("2026-06-30T13:00:00.000Z", now, "en-US"), "3 hours ago");
  assertEquals(formatHeyboxRelativeTime("2026-06-27T16:00:00.000Z", now, "en-US"), "3 days ago");
  assertEquals(formatHeyboxRelativeTime("2026-06-30T13:00:00.000Z", now, "de-DE"), "vor 3 Stunden");
});

Deno.test("formatHeyboxRelativeTime formats older China-time dates", () => {
  assertEquals(formatHeyboxRelativeTime("2026-06-29T06:23:00.000Z", now), "昨天 14:23");
  assertEquals(formatHeyboxRelativeTime("2026-06-27T16:00:00.000Z", now), "3 天前");
  assertEquals(formatHeyboxRelativeTime("2026-06-23T16:00:00.000Z", now), "06-24");
  assertEquals(formatHeyboxRelativeTime("2025-01-01T00:00:00.000Z", now), "2025-01-01");
});

/**
 * 断言两个值严格相等。
 *
 * @param actual 实际值。
 * @param expected 期望值。
 * @return 断言通过时无返回值。
 */
function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}
