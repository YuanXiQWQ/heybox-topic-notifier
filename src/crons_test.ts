/**
 * @file 本文件验证轮询调度器和 Deno Deploy Cron timeline 判断逻辑。
 */
import {
  createPollScheduler,
  pollingIntervalMs,
  registerCrons,
  shouldPoll,
  shouldPollFromLastStart,
  shouldRunDeployCron,
} from "./crons.ts";
import { assertEquals, assertStrictEquals } from "./test_helpers.ts";

/**
 * 五分钟轮询测试配置。
 */
const fiveMinutes = { intervalUnit: "minute" as const, intervalValue: 5 };
/**
 * 三秒轮询测试配置。
 */
const threeSeconds = { intervalUnit: "second" as const, intervalValue: 3 };

Deno.test("shouldPoll runs when no previous poll exists", () => {
  assertEquals(
    shouldPoll(undefined, fiveMinutes, new Date("2026-06-30T12:00:00.000Z")),
    true,
  );
});

Deno.test("shouldPoll waits until the configured interval elapses", () => {
  const now = new Date("2026-06-30T12:05:00.000Z");

  assertStrictEquals(
    shouldPoll("2026-06-30T12:01:00.000Z", fiveMinutes, now),
    false,
  );
  assertStrictEquals(
    shouldPoll("2026-06-30T12:00:00.000Z", fiveMinutes, now),
    true,
  );
});

Deno.test("shouldPoll starts a fresh interval after polling settings change", () => {
  const polling = {
    ...fiveMinutes,
    intervalStartedAt: "2026-06-30T12:04:00.000Z",
  };

  assertEquals(
    shouldPoll(
      "2026-06-30T11:00:00.000Z",
      polling,
      new Date("2026-06-30T12:08:59.999Z"),
    ),
    false,
  );
  assertEquals(
    shouldPoll(
      "2026-06-30T11:00:00.000Z",
      polling,
      new Date("2026-06-30T12:09:00.000Z"),
    ),
    true,
  );
});

Deno.test("shouldPoll waits from a new interval even without a previous poll", () => {
  const polling = {
    ...fiveMinutes,
    intervalStartedAt: "2026-06-30T12:04:00.000Z",
  };

  assertEquals(
    shouldPoll(
      undefined,
      polling,
      new Date("2026-06-30T12:08:00.000Z"),
    ),
    false,
  );
});

Deno.test("shouldPoll supports second intervals", () => {
  const now = new Date("2026-06-30T12:00:03.000Z");

  assertEquals(
    shouldPoll("2026-06-30T12:00:01.000Z", threeSeconds, now),
    false,
  );
  assertStrictEquals(
    shouldPoll("2026-06-30T12:00:00.000Z", threeSeconds, now),
    true,
  );
});

Deno.test("pollingIntervalMs clamps second intervals to at least three seconds", () => {
  assertEquals(
    pollingIntervalMs({ intervalUnit: "second", intervalValue: 1 }),
    3000,
  );
});

Deno.test("shouldPoll runs when previous poll time is invalid", () => {
  assertEquals(
    shouldPoll("not-a-date", fiveMinutes, new Date("2026-06-30T12:00:00.000Z")),
    true,
  );
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
        getAppState: () => {
          throw new Error("getAppState should not be called");
        },
        getLastPollAt: () => Promise.resolve(lastPollAt),
        getSettings: () =>
          Promise.resolve({
            polling: {
              enabled: true,
              intervalUnit: "minute",
              intervalValue: 5,
            },
          }),
      },
    } as unknown as Parameters<typeof createPollScheduler>[0],
  );

  assertStrictEquals(await scheduler.tick(), true);
  assertStrictEquals(await scheduler.tick(), false);
  assertEquals(runs, 1);
});

Deno.test("poll scheduler swallows scheduled poll failures", async () => {
  const scheduler = createPollScheduler(
    {
      poller: {
        runOnce: () => Promise.reject(new Error("network failed")),
      },
      storage: {
        getAppState: () => {
          throw new Error("getAppState should not be called");
        },
        getLastPollAt: () => Promise.resolve(undefined),
        getSettings: () =>
          Promise.resolve({
            polling: {
              enabled: true,
              intervalUnit: "minute",
              intervalValue: 5,
            },
          }),
      },
    } as unknown as Parameters<typeof createPollScheduler>[0],
  );

  assertStrictEquals(await scheduler.tick(), false);
});

Deno.test("deploy cron runs on production and dev timelines", () => {
  assertStrictEquals(shouldRunDeployCron("production"), true);
  assertStrictEquals(shouldRunDeployCron("git-branch/dev"), true);
  assertStrictEquals(shouldRunDeployCron("preview"), false);
  assertStrictEquals(shouldRunDeployCron("preview/abc123"), false);
  assertStrictEquals(shouldRunDeployCron("git-branch/main"), false);
  assertStrictEquals(shouldRunDeployCron(undefined), false);
});

Deno.test("local cron registration starts when default polling is disabled", () => {
  let intervals = 0;

  registerCrons(
    {
      config: {
        defaultSettings: {
          polling: { enabled: false },
        },
      },
      scheduler: {
        tick: () => Promise.resolve(true),
      },
    } as Parameters<typeof registerCrons>[0],
    {
      isDenoDeploy: () => false,
      setInterval: (() => {
        intervals += 1;
        return undefined as unknown as ReturnType<typeof setInterval>;
      }) as unknown as typeof setInterval,
    },
  );

  assertEquals(intervals, 1);
});

Deno.test("local cron registration starts when polling is enabled", () => {
  let intervals = 0;

  registerCrons(
    {
      config: {
        defaultSettings: {
          polling: { enabled: true },
        },
      },
      scheduler: {
        tick: () => Promise.resolve(true),
      },
    } as Parameters<typeof registerCrons>[0],
    {
      isDenoDeploy: () => false,
      setInterval: (() => {
        intervals += 1;
        return undefined as unknown as ReturnType<typeof setInterval>;
      }) as unknown as typeof setInterval,
    },
  );

  assertEquals(intervals, 1);
});
