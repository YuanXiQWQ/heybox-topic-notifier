import { shouldPoll } from "./crons.ts";

Deno.test("shouldPoll runs when no previous poll exists", () => {
  assertEquals(shouldPoll(undefined, 5, new Date("2026-06-30T12:00:00.000Z")), true);
});

Deno.test("shouldPoll waits until the configured interval elapses", () => {
  const now = new Date("2026-06-30T12:05:00.000Z");

  assertEquals(shouldPoll("2026-06-30T12:01:00.000Z", 5, now), false);
  assertEquals(shouldPoll("2026-06-30T12:00:00.000Z", 5, now), true);
});

Deno.test("shouldPoll runs when previous poll time is invalid", () => {
  assertEquals(shouldPoll("not-a-date", 5, new Date("2026-06-30T12:00:00.000Z")), true);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}
