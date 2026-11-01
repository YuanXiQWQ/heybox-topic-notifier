/** @file 验证循环区间并集、行优先级、失效隔离、时区与调度边界。 */
import { assertEquals, assertNotEquals } from "@std/assert";
import {
  canEnableSchedule,
  fullyCovered,
  normalizeSchedule,
  resolvePolling,
  rowKind,
} from "../../static/polling-schedule-core.js";
import { defaultAppSettingsFromEnv } from "./default_settings.ts";
import { createPollScheduler } from "../crons.ts";
import { createRoutes, settingsFromForm } from "../routes.ts";
import type { AppSettings } from "../models.ts";
import type { Storage } from "../storage/types.ts";
import { normalizeSettings } from "../storage/kv.ts";
import {
  initialSettingsSnapshot,
  mergeSettings,
  settingsEdits,
} from "../sync/settings.ts";

/**
 * 创建可复用的完整时段。
 * @param {string} start 起点。
 * @param {string} end 终点。
 * @return {object} 完整草稿。
 */
function row(start = "00:00", end = "23:59") {
  return {
    id: "a",
    start,
    end,
    intervalValue: "10",
    intervalUnit: "minute",
    postLimit: "50",
    sort: "replyTime",
  };
}

/**
 * 把草稿加入已开启的时段配置。
 * @param {ReturnType<typeof row>[]} rows 有序时段。
 * @return {ReturnType<typeof normalizeSchedule>} 标准化配置。
 */
function schedule(...rows: ReturnType<typeof row>[]) {
  return normalizeSchedule({ enabled: true, timeZone: "UTC", rows });
}

Deno.test("schedule coverage includes the entire final minute and excludes finite years", () => {
  assertEquals(fullyCovered(schedule(row())), true);
  assertEquals(fullyCovered(schedule(row("01-01T00:00", "12-31T23:59"))), true);
  assertEquals(
    fullyCovered(schedule(row("01-01T00:00", "12-30T23:59"))),
    false,
  );
  assertEquals(
    fullyCovered(schedule(row("2026-01-01T00:00", "2027-12-31T23:59"))),
    false,
  );
  assertEquals(fullyCovered(schedule(row("00:00", "23:58"))), false);
});

Deno.test("schedule coverage merges overlapping daily and annual ranges including leap day", () => {
  assertEquals(
    fullyCovered(
      schedule(row("22:00", "09:59"), { ...row("10:00", "21:59"), id: "b" }),
    ),
    true,
  );
  assertEquals(
    fullyCovered(
      schedule(row("01-01T00:00", "02-28T23:59"), {
        ...row("03-01T00:00", "12-31T23:59"),
        id: "b",
      }),
    ),
    false,
  );
  assertEquals(
    fullyCovered(
      schedule(row("12-20T00:00", "01-10T23:59"), {
        ...row("01-11T00:00", "12-19T23:59"),
        id: "b",
      }),
    ),
    true,
  );
});

Deno.test("incomplete rows block enabling but are skipped without disabling valid rows", () => {
  const invalid = { ...row(), intervalValue: "" };
  const value = schedule(invalid, { ...row(), id: "b" });
  assertEquals(canEnableSchedule(value), false);
  assertEquals(canEnableSchedule(schedule()), false);
  assertEquals(rowKind({ ...row(), start: "2026-02-30T00:00" }), null);
  assertEquals(
    rowKind({ ...row(), intervalUnit: "second", intervalValue: "2" }),
    null,
  );
  const polling = { ...defaultAppSettingsFromEnv().polling, schedule: value };
  assertEquals(
    (resolvePolling(polling, new Date("2026-11-01T12:00Z"))
      .polling as typeof polling).postLimit,
    50,
  );
  assertEquals(fullyCovered(value), true);
});

Deno.test("priority order, midnight and annual wrap preserve defaults and occurrence identity", () => {
  const base = defaultAppSettingsFromEnv().polling;
  const night = row("22:00", "02:00");
  const polling = {
    ...base,
    schedule: schedule(night, { ...row(), id: "b", postLimit: "100" }),
  };
  assertEquals(
    (resolvePolling(polling, new Date("2026-11-01T23:00Z"))
      .polling as typeof polling).postLimit,
    50,
  );
  assertEquals(
    (resolvePolling(polling, new Date("2026-11-01T12:00Z"))
      .polling as typeof polling).postLimit,
    100,
  );
  assertEquals(
    resolvePolling(polling, new Date("2026-11-01T23:00Z")).key,
    resolvePolling(polling, new Date("2026-11-02T02:00:59Z")).key,
  );
  assertNotEquals(
    resolvePolling(polling, new Date("2026-11-01T23:00Z")).key,
    resolvePolling(polling, new Date("2026-11-02T23:00Z")).key,
  );
  polling.schedule = schedule(night);
  assertEquals(
    resolvePolling(polling, new Date("2026-11-01T12:00Z")).key,
    "default",
  );
  assertEquals(
    (resolvePolling(polling, new Date("2026-11-01T12:00Z"))
      .polling as typeof polling).postLimit,
    base.postLimit,
  );
  polling.schedule = schedule(row("12-20T00:00", "01-10T23:59"));
  assertEquals(
    resolvePolling(polling, new Date("2026-12-31T23:59Z")).key,
    resolvePolling(polling, new Date("2027-01-01T00:00Z")).key,
  );
});

Deno.test("timezone follows local civil hours through daylight-saving changes", () => {
  const polling = {
    ...defaultAppSettingsFromEnv().polling,
    schedule: schedule(row("01:00", "01:59")),
  };
  polling.schedule.timeZone = "America/Vancouver";
  assertNotEquals(
    resolvePolling(polling, new Date("2026-11-01T08:30Z")).key,
    "default",
  );
  assertEquals(
    resolvePolling(polling, new Date("2026-11-01T08:30Z")).key,
    resolvePolling(polling, new Date("2026-11-01T09:30Z")).key,
  );
  assertEquals(
    resolvePolling(polling, new Date("2026-11-01T10:00Z")).key,
    "default",
  );
});

Deno.test("storage, form validation and independent sync preserve enabled drafts", () => {
  const base = defaultAppSettingsFromEnv();
  const invalid = schedule({ ...row(), sort: "" });
  assertEquals(
    settingsFromForm({ pollSchedule: JSON.stringify(invalid) }, base).polling
      .schedule?.enabled,
    false,
  );
  base.polling.schedule = schedule(row());
  const edited = settingsFromForm(
    { pollSchedule: JSON.stringify(invalid) },
    base,
  );
  assertEquals(edited.polling.schedule?.enabled, true);
  assertEquals(normalizeSettings(edited, base).polling.schedule, invalid);
  const edits = settingsEdits(base, edited, {
    editedAt: 100,
    deviceId: "one",
    counter: 1,
    operationId: "operation",
  });
  assertEquals(edits.filter((e) => e.region === "polling/schedule").length, 1);
  assertEquals(
    mergeSettings(initialSettingsSnapshot(base), edits).snapshot.settings
      .polling.schedule,
    invalid,
  );
});

Deno.test("scheduler enters a new time range without waiting for the previous interval", async () => {
  const settings = defaultAppSettingsFromEnv();
  const now = new Date();
  const start = now.toISOString().slice(0, 16);
  settings.polling = {
    ...settings.polling,
    enabled: true,
    intervalUnit: "day",
    intervalValue: 30,
    schedule: schedule(row(start, start)),
  };
  let runs = 0;
  const storage = {
    getSettings: () => Promise.resolve(settings),
    getLastPollAt: () =>
      Promise.resolve(new Date(now.getTime() - 60000).toISOString()),
  } as unknown as Storage;
  const scheduler = createPollScheduler({
    storage,
    poller: {
      runOnce: (_storage, options?: AppSettings) => {
        runs++;
        assertEquals(options?.polling.postLimit, 50);
        return Promise.resolve();
      },
    },
  });
  assertEquals(await scheduler.tickUser("user"), true);
  assertEquals(await scheduler.tickUser("user"), false);
  assertEquals(runs, 1);
});

Deno.test("yearless February 29 is valid and absent days never match in common years", () => {
  const leapOnly = row("02-29T00:00", "02-29T23:59");
  assertEquals(rowKind(leapOnly), "annual");
  for (const year of [1900, 2026, 2100]) {
    assertEquals(
      rowKind(row(year + "-02-29T00:00", year + "-02-29T23:59")),
      null,
    );
  }
  for (const year of [2000, 2024, 2400]) {
    assertEquals(
      rowKind(row(year + "-02-29T00:00", year + "-02-29T23:59")),
      "once",
    );
  }
  const polling = {
    ...defaultAppSettingsFromEnv().polling,
    schedule: schedule(leapOnly),
  };
  for (
    const time of [
      "2026-02-28T12:00Z",
      "2026-03-01T00:00Z",
      "2100-03-01T00:00Z",
    ]
  ) assertEquals(resolvePolling(polling, new Date(time)).key, "default");
  assertNotEquals(
    resolvePolling(polling, new Date("2028-02-29T12:00Z")).key,
    "default",
  );
  assertEquals(
    fullyCovered(
      schedule(row("01-01T00:00", "02-29T23:59"), {
        ...row("03-01T00:00", "12-31T23:59"),
        id: "b",
      }),
    ),
    true,
  );
  assertEquals(
    fullyCovered(schedule(row("2024-01-01T00:00", "2024-12-31T23:59"))),
    false,
  );
});

Deno.test("scheduled polling modules are served by the application routes", async () => {
  const app = createRoutes(
    { storage: {} } as Parameters<typeof createRoutes>[0],
  );
  for (
    const file of [
      "polling-schedule.js",
      "polling-schedule-core.js",
      "settings-navigation.js",
    ]
  ) {
    const response = await app.request("http://localhost/static/" + file);
    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    await response.text();
  }
});
