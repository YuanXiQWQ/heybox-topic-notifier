/** @file 验证多历法换算、闰月日期、干支年界和跨历法闭环，不把公元年份当作循环。 */
import { assertEquals, assertNotEquals } from "@std/assert";
import {
  convertCalendar,
  cycleMonthDays,
  dateParts,
  fromGregorian,
  monthDays,
  toGregorian,
} from "../../static/polling-calendar.js";
import {
  fullyCovered,
  normalizeSchedule,
  resolvePolling,
  rowKind,
} from "../../static/polling-schedule-core.js";

/**
 * 构造有效时段。
 * @param {string} start 起点。
 * @param {string} end 终点。
 * @param {string} calendar 历法。
 * @param {string} era 纪年。
 * @return {object} 完整时段。
 */
function row(start: string, end: string, calendar = "gregory", era = "ce") {
  return {
    id: "row",
    start,
    end,
    calendar,
    era,
    intervalValue: "3",
    intervalUnit: "second",
    postLimit: "20",
    sort: "publishTime",
  };
}

/**
 * 查询本地日期对应的规则。
 * @param {ReturnType<typeof row>[]} rows 规则。
 * @param {string} time UTC 日期。
 * @return {{polling:{intervalValue:number},key:string}} 匹配结果。
 */
function at(rows: ReturnType<typeof row>[], time: string) {
  return resolvePolling({
    intervalValue: 9,
    schedule: normalizeSchedule({ enabled: true, timeZone: "UTC", rows }),
  }, new Date(time + "Z")) as {
    polling: { intervalValue: number };
    key: string;
  };
}

/**
 * 检查时段并集。
 * @param {ReturnType<typeof row>[]} rows 规则。
 * @return {boolean} 是否形成循环覆盖。
 */
function covered(...rows: ReturnType<typeof row>[]) {
  return fullyCovered(normalizeSchedule({ rows }));
}

Deno.test("calendar conversion preserves civil dates and requires explicit years", () => {
  // 香港天文台 2023 年公历与农历对照：3 月 22 日为闰二月初一。
  assertEquals(
    convertCalendar("2023-03-22T08:09", "gregory", "chinese"),
    "2023-02L-01T08:09",
  );
  assertEquals(
    convertCalendar("2023-02L-01T08:09", "chinese", "gregory"),
    "2023-03-22T08:09",
  );
  assertEquals(convertCalendar("02-29T08:09", "gregory", "chinese"), null);
  assertEquals(
    convertCalendar("C00-01-01T08:09", "chinese", "gregory", "ganzhi"),
    null,
  );
  assertEquals(convertCalendar("08:09", "gregory", "chinese"), "08:09");
  assertEquals(convertCalendar("", "gregory", "chinese"), "");
  for (
    const p of [[100, 1, 1, 0, 0], [1582, 10, 10, 12, 0], [1900, 3, 1, 0, 0], [
      2024,
      2,
      29,
      12,
      59,
    ], [9999, 6, 30, 23, 59]]
  ) assertEquals(toGregorian(fromGregorian(p, "chinese"), "chinese"), p);
  for (const calendar of ["gregory", "chinese"]) {
    for (
      const date of ["1949-09-30T23:59", "1949-10-01T00:00", "1951-01-01T12:00"]
    ) {
      const value = convertCalendar(date, "gregory", calendar)!;
      const original = normalizeSchedule({
        enabled: true,
        timeZone: "UTC",
        rows: [row(value, value, calendar, "roc")],
      });
      const current = normalizeSchedule(original, "zh-CN");
      assertEquals(current.enabled, true);
      assertEquals(
        current.rows[0].era,
        date <= "1949-09-30T23:59" ? "roc" : "ce",
      );
      assertEquals(
        current.rows[0].calendar,
        date <= "1949-09-30T23:59" ? calendar : "gregory",
      );
      assertEquals(
        current.rows[0].start,
        date <= "1949-09-30T23:59" ? value : date,
      );
      assertEquals(
        resolvePolling({ schedule: current }, new Date(date + "Z")).polling,
        {
          ...resolvePolling({ schedule: original }, new Date(date + "Z"))
            .polling,
          schedule: current,
        },
      );
      for (const locale of ["zh-TW", "zh-HK", "zh-MO", "zh-SG", "en-US"]) {
        assertEquals(normalizeSchedule(original, locale), original);
      }
    }
  }
});

Deno.test("lunar date validity distinguishes leap months, short months and yearless drafts", () => {
  assertEquals(monthDays("chinese", null, -2), 30);
  assertEquals(monthDays("chinese", 2023, -2), 29);
  assertEquals(monthDays("chinese", 2024, -2), 0);
  assertNotEquals(dateParts("02L-30T00:00", "chinese"), null);
  assertEquals(dateParts("2023-02L-30T00:00", "chinese"), null);
  assertEquals(dateParts("2024-02L-01T00:00", "chinese"), null);
  const leap = row("02L-01T00:00", "02L-30T23:59", "chinese");
  assertEquals(at([leap], "2023-03-22T12:00").polling.intervalValue, 3);
  assertEquals(at([leap], "2023-02-20T12:00").key, "default");
  assertEquals(at([leap], "2023-04-20T12:00").key, "default");
  assertEquals(at([leap], "2024-03-22T12:00").key, "default");
  const ordinary = row("02-01T00:00", "02-30T23:59", "chinese");
  assertEquals(at([ordinary], "2023-03-22T12:00").key, "default");
});

Deno.test("sexagenary rules repeat and change years at the selected calendar boundary", () => {
  const lunar = row("C40-01-01T00:00", "C40-12-30T23:59", "chinese", "ganzhi");
  assertEquals(rowKind(lunar), "cycle");
  assertEquals(at([lunar], "2024-02-09T12:00").key, "default");
  assertEquals(at([lunar], "2024-02-10T12:00").polling.intervalValue, 3);
  const solar = row("C40-01-01T00:00", "C40-12-31T23:59", "gregory", "ganzhi");
  assertEquals(at([solar], "2024-01-01T00:00").polling.intervalValue, 3);
  assertEquals(at([solar], "2084-01-01T00:00").polling.intervalValue, 3);
  assertNotEquals(
    at([solar], "2024-01-01T00:00").key,
    at([solar], "2084-01-01T00:00").key,
  );
  assertEquals(
    at(
      [row("2024-01-01T00:00", "2024-12-31T23:59", "gregory", "roc")],
      "2084-01-01T00:00",
    ).key,
    "default",
  );
});

Deno.test("coverage merges Gregorian, lunar, daily and sexagenary periods", () => {
  assertEquals(
    covered(row("C00-01-01T00:00", "C59-12-31T23:59", "gregory", "ganzhi")),
    true,
  );
  assertEquals(
    covered(row("C00-01-01T00:00", "C59-12-30T23:59", "gregory", "ganzhi")),
    false,
  );
  assertEquals(covered(row("01-01T00:00", "12L-30T23:59", "chinese")), true);
  assertEquals(covered(row("01-01T00:00", "12-30T23:59", "chinese")), false);
  const last = cycleMonthDays("chinese", 59, -12);
  assertEquals(
    covered(
      row("C00-01-01T00:00", `C59-12L-${last}T23:59`, "chinese", "ganzhi"),
    ),
    true,
  );
  assertEquals(
    covered(row("2024-01-01T00:00", "2024-12-30T23:59", "chinese")),
    false,
  );
  assertEquals(
    covered(
      row("01-01T00:00", "12L-30T11:59", "chinese"),
      row("12:00", "23:59"),
    ),
    true,
  );
  // 农历年尾的缺口横跨公历年末年初，跨历法并集必须考虑同一天的日期对应关系。
  assertEquals(
    covered(
      row("10-01T00:00", "03-31T23:59"),
      row("01-01T00:00", "11-30T23:59", "chinese"),
    ),
    true,
  );
  assertEquals(
    covered(
      row("01-01T00:00", "01-02T23:59"),
      row("01-01T00:00", "11-30T23:59", "chinese"),
    ),
    false,
  );
});
