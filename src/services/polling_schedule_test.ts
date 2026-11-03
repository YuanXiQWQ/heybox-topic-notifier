/** @file 验证循环区间并集、行优先级、失效隔离、时区与调度边界。 */
import { assertEquals, assertNotEquals } from "@std/assert";
import {
  canEnableSchedule,
  fullyCovered,
  normalizeSchedule,
  pollingWindowMs,
  resolvePolling,
  rowErrors,
  rowInactive,
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
  base.locale = "zh-TW";
  base.polling.schedule = normalizeSchedule({
    enabled: true,
    rows: [{ ...row("1951-01-01T00:00", "1951-01-02T23:59"), era: "roc" }],
  });
  const translated = settingsFromForm({ locale: "zh-CN" }, base);
  assertEquals(translated.polling.schedule?.rows[0].era, "roc");
  assertEquals(translated.polling.schedule?.rows[0].start, "1951-01-01T00:00");
  assertEquals(translated.polling.schedule?.enabled, true);
  assertEquals(
    normalizeSettings({ ...base, locale: "zh-CN" }, base).polling.schedule
      ?.rows[0].era,
    "ce",
  );
  assertEquals(
    mergeSettings(initialSettingsSnapshot(base), [{
      region: "setting/locale",
      value: "zh-CN",
      stamp: {
        editedAt: 200,
        deviceId: "two",
        counter: 1,
        operationId: "locale",
      },
    }]).snapshot.settings.polling.schedule?.rows[0].era,
    "roc",
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
    schedule: schedule({
      ...row(start, start),
      intervalValue: "3",
      intervalUnit: "second",
    }),
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
      "polling-calendar.js",
      "polling-calendar-picker.js",
      "polling-calendar-profiles.js",
      "vendor/lunar/lunar.js",
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

Deno.test("range-only and overlong intervals pause without discarding settings", async () => {
  const pause = {
    ...row(),
    intervalValue: "",
    intervalUnit: "",
    postLimit: "",
    sort: "",
  };
  assertEquals(rowKind(pause), "daily");
  assertEquals(rowErrors(pause), []);
  assertEquals(canEnableSchedule(schedule(pause)), true);
  assertEquals(fullyCovered(schedule(pause)), true);
  assertEquals(
    (resolvePolling({
      enabled: true,
      schedule: schedule(pause, { ...row(), id: "next" }),
    }).polling as { enabled: boolean }).enabled,
    false,
  );
  const long = {
    ...row("00:00", "22:59"),
    intervalValue: "1",
    intervalUnit: "day",
  };
  assertEquals(rowInactive(long), true);
  assertEquals(rowErrors(long), []);
  assertEquals(
    rowInactive({ ...long, intervalValue: "23", intervalUnit: "hour" }),
    false,
  );
  const settings = defaultAppSettingsFromEnv();
  settings.polling.enabled = true;
  settings.polling.schedule = schedule(pause);
  let runs = 0;
  const scheduler = createPollScheduler({
    storage: {
      getSettings: () => Promise.resolve(settings),
      getLastPollAt: () => Promise.resolve(new Date().toISOString()),
    } as unknown as Storage,
    poller: {
      runOnce: () => {
        runs++;
        return Promise.resolve();
      },
    },
  });
  assertEquals(await scheduler.tickUser("user"), false);
  assertEquals(runs, 0);
  settings.polling.schedule = schedule(row());
  assertEquals(await scheduler.tickUser("user"), true);
  assertEquals(runs, 1);
  assertEquals(
    normalizeSchedule({ rows: [{ ...pause, start: "", end: "" }] }).rows[0]
      .edited,
    false,
  );
  assertEquals(
    normalizeSchedule({
      rows: [{ ...pause, start: "", end: "", edited: true }],
    }).rows[0].edited,
    true,
  );
});

Deno.test("window length follows real dates, leap days, short lunar months and daylight changes", () => {
  const utc = new Date("2026-06-01T12:00Z");
  assertEquals(pollingWindowMs(row("22:00", "01:59"), utc), 4 * 3600000);
  assertEquals(
    pollingWindowMs(row("2026-01-01T00:00", "2026-01-01T22:59"), utc),
    23 * 3600000,
  );
  const feb = row("02-01T00:00", "02-29T23:59");
  assertEquals(
    pollingWindowMs(feb, new Date("2026-02-10T12:00Z")),
    28 * 86400000,
  );
  assertEquals(
    pollingWindowMs(feb, new Date("2028-02-10T12:00Z")),
    29 * 86400000,
  );
  const threshold = { ...feb, intervalValue: "29", intervalUnit: "day" };
  assertEquals(rowInactive(threshold, new Date("2026-02-10T12:00Z")), true);
  assertEquals(rowInactive(threshold, new Date("2028-02-10T12:00Z")), false);
  for (
    const [time, enabled] of [
      ["2026-02-10T12:00Z", false],
      ["2028-02-10T12:00Z", true],
      ["2029-02-10T12:00Z", false],
    ] as const
  ) {
    const settings = { enabled: true, schedule: schedule(threshold) };
    assertEquals(
      (resolvePolling(settings, new Date(time)).polling as { enabled: boolean })
        .enabled,
      enabled,
    );
    assertEquals(settings.schedule.rows[0].intervalValue, "29");
  }
  const cyclic = {
    ...threshold,
    start: "C36-02-01T00:00",
    end: "C36-02-29T23:59",
    era: "ganzhi",
  };
  assertEquals(rowInactive(cyclic, new Date("1900-02-10T12:00Z")), true);
  assertEquals(rowInactive(cyclic, new Date("1960-02-10T12:00Z")), false);
  const lunar = { ...row("02L-01T00:00", "02L-30T23:59"), calendar: "chinese" };
  assertEquals(
    pollingWindowMs(lunar, new Date("2023-03-25T00:00Z")),
    29 * 86400000,
  );
  assertEquals(pollingWindowMs(lunar, new Date("2024-03-25T00:00Z")), 0);
  const lunarMonth = {
    ...row("01-01T00:00", "01-30T23:59"),
    calendar: "chinese",
    intervalValue: "30",
    intervalUnit: "day",
  };
  assertEquals(rowInactive(lunarMonth, new Date("2023-02-01T12:00Z")), true);
  assertEquals(rowInactive(lunarMonth, new Date("2025-02-15T12:00Z")), false);
  assertEquals(
    pollingWindowMs(row(), new Date("2026-03-08T12:00Z"), "America/Vancouver"),
    23 * 3600000,
  );
  assertEquals(
    pollingWindowMs(row(), new Date("2026-11-01T12:00Z"), "America/Vancouver"),
    25 * 3600000,
  );
  assertEquals(
    pollingWindowMs(
      row("01:00", "01:59"),
      new Date("2026-11-01T09:30Z"),
      "America/Vancouver",
    ),
    2 * 3600000,
  );
  assertEquals(
    pollingWindowMs(
      row("02:00", "03:00"),
      new Date("2026-03-08T10:00Z"),
      "America/Vancouver",
    ),
    60000,
  );
});
