import { pollingIntervalMs, shouldPoll } from "./crons.ts";

const fiveMinutes = { intervalUnit: "minute" as const, intervalValue: 5 };
const threeSeconds = { intervalUnit: "second" as const, intervalValue: 3 };

Deno.test("shouldPoll runs when no previous poll exists", () => {
  assertEquals(shouldPoll(undefined, fiveMinutes, new Date("2026-06-30T12:00:00.000Z")), true);
});

Deno.test("shouldPoll waits until the configured interval elapses", () => {
  const now = new Date("2026-06-30T12:05:00.000Z");

  assertEquals(shouldPoll("2026-06-30T12:01:00.000Z", fiveMinutes, now), false);
  assertEquals(shouldPoll("2026-06-30T12:00:00.000Z", fiveMinutes, now), true);
});

Deno.test("shouldPoll supports second intervals", () => {
  const now = new Date("2026-06-30T12:00:03.000Z");

  assertEquals(shouldPoll("2026-06-30T12:00:01.000Z", threeSeconds, now), false);
  assertEquals(shouldPoll("2026-06-30T12:00:00.000Z", threeSeconds, now), true);
});

Deno.test("pollingIntervalMs clamps second intervals to at least three seconds", () => {
  assertEquals(pollingIntervalMs({ intervalUnit: "second", intervalValue: 1 }), 3000);
});

Deno.test("shouldPoll runs when previous poll time is invalid", () => {
  assertEquals(shouldPoll("not-a-date", fiveMinutes, new Date("2026-06-30T12:00:00.000Z")), true);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}
