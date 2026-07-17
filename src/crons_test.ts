/**
 * @file 本文件验证轮询调度器和 Deno Deploy Cron timeline 判断逻辑。
 */
import {
  createPollScheduler,
  pollingIntervalMs,
  shouldPoll,
  shouldPollFromLastStart,
  shouldRunDeployCron,
} from "./crons.ts";

/**
 * 五分钟轮询测试配置。
 */
const fiveMinutes = { intervalUnit: "minute" as const, intervalValue: 5 };
/**
 * 三秒轮询测试配置。
 */
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

Deno.test("shouldPollFromLastStart waits from a newer manual poll completion", () => {
  const schedulerStart = new Date("2026-06-30T12:00:00.000Z").getTime();
  const manualPollCompletedAt = "2026-06-30T12:04:00.000Z";

  assertEquals(
    shouldPollFromLastStart(
      schedulerStart,
      manualPollCompletedAt,
      fiveMinutes,
      new Date("2026-06-30T12:05:00.000Z"),
    ),
    false,
  );
  assertEquals(
    shouldPollFromLastStart(
      schedulerStart,
      manualPollCompletedAt,
      fiveMinutes,
      new Date("2026-06-30T12:09:00.000Z"),
    ),
    true,
  );
});

Deno.test("poll scheduler runs one due poll and updates its in-memory start guard", async () => {
  let runs = 0;
  let lastPollAt: string | undefined;
  const scheduler = createPollScheduler(
    {
      poller: {
        runOnce: () => {
          runs += 1;
          lastPollAt = new Date().toISOString();
          return Promise.resolve();
        },
      },
      storage: {
        getAppState: () => Promise.resolve({ lastPollAt, totalMatches: 0 }),
        getSettings: () =>
          Promise.resolve({
            polling: { enabled: true, intervalUnit: "minute", intervalValue: 5 },
          }),
      },
    } as Parameters<typeof createPollScheduler>[0],
  );

  assertEquals(await scheduler.tick(), true);
  assertEquals(await scheduler.tick(), false);
  assertEquals(runs, 1);
});

Deno.test("poll scheduler swallows scheduled poll failures", async () => {
  const scheduler = createPollScheduler(
    {
      poller: {
        runOnce: () => Promise.reject(new Error("network failed")),
      },
      storage: {
        getAppState: () => Promise.resolve({ totalMatches: 0 }),
        getSettings: () =>
          Promise.resolve({
            polling: { enabled: true, intervalUnit: "minute", intervalValue: 5 },
          }),
      },
    } as Parameters<typeof createPollScheduler>[0],
  );

  assertEquals(await scheduler.tick(), false);
});

Deno.test("deploy cron only runs on production and dev timelines", () => {
  assertEquals(shouldRunDeployCron("production"), true);
  assertEquals(shouldRunDeployCron("git-branch/dev"), true);
  assertEquals(shouldRunDeployCron("git-branch/main"), false);
  assertEquals(shouldRunDeployCron("git-branch/backend/cron-timeline-guard"), false);
  assertEquals(shouldRunDeployCron("preview/abc123"), false);
  assertEquals(shouldRunDeployCron(undefined), false);
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
