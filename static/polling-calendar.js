/** @file 公历与农历共用的日期校验、换算和纪年周期，不依赖设备的农历数据库。 */
import { LunarYear, Solar } from "./vendor/lunar/lunar.js";
import { calendarProfiles } from "./polling-calendar-profiles.js";

/** 日期选择器支持的绝对年份边界。 */
export const calendarYears = { min: 100, max: 9999 };
/** 干支按甲子起始，每六十年循环。 */
export const stems = "甲乙丙丁戊己庚辛壬癸";
/** 地支与天干分别循环组成干支年份。 */
export const branches = "子丑寅卯辰巳午未申酉戌亥";
/** 缓存近期农历年，避免逐行重复计算天文历法。 */
const lunarYears = new Map();
/** 各干支年中实际可能出现的农历月份及最大天数。 */
const cycleMonths = new Map();
for (const [cycle, , , , leapMonth, lengths] of calendarProfiles) {
  let index = 0;
  for (let month = 1; month <= 12; month++) {
    for (let leap = 0; leap <= Number(month === leapMonth); leap++) {
      const key = cycle + ":" + (leap ? -month : month);
      cycleMonths.set(
        key,
        Math.max(cycleMonths.get(key) || 0, 29 + ((lengths >> index++) & 1)),
      );
    }
  }
}

/**
 * 取得一个干支年在所有实际轮次中可能出现的月长。
 * @param {string} calendar 历法。
 * @param {number} cycle 干支序号。
 * @param {number} month 月份。
 * @return {number} 最大月长，不可能出现的月份为零。
 */
export function cycleMonthDays(calendar, cycle, month) {
  if (calendar === "chinese") return cycleMonths.get(cycle + ":" + month) || 0;
  if (month === 2 && cycle % 4 !== 0) return 28;
  return monthDays(calendar, null, month);
}

/**
 * 取得有界缓存中的农历年。
 * @param {number} year 绝对年份。
 * @return {object} 农历年。
 */
export function lunarYear(year) {
  if (!lunarYears.has(year)) {
    if (lunarYears.size >= 16) {
      lunarYears.delete(lunarYears.keys().next().value);
    }
    lunarYears.set(year, LunarYear.fromYear(year));
  }
  return lunarYears.get(year);
}

/**
 * 返回公历年或农历年的干支序号，以所选历法年初换年。
 * @param {number} year 绝对年份。
 * @return {number} 甲子为零的循环序号。
 */
export function cycleYear(year) {
  return ((year - 4) % 60 + 60) % 60;
}

/**
 * 取得指定月份的实际天数；未选绝对年份时保留可能存在的日期。
 * @param {string} calendar 历法。
 * @param {number|null} year 绝对年份，循环年份传 null。
 * @param {number} month 月份，负数表示闰月。
 * @return {number} 可选天数，不存在的月份为零。
 */
export function monthDays(calendar, year, month) {
  if (!Number.isInteger(month) || !month || Math.abs(month) > 12) return 0;
  if (
    year !== null &&
    (!Number.isInteger(year) || year < calendarYears.min ||
      year > calendarYears.max)
  ) return 0;
  if (calendar === "chinese") {
    return year === null
      ? 30
      : lunarYear(year).getMonth(month)?.getDayCount() || 0;
  }
  if (month < 0) return 0;
  return new Date(Date.UTC(year ?? 2000, month, 0)).getUTCDate();
}

/**
 * 解析日期精度与闰月标志，干支年份使用 C00 至 C59。
 * @param {string} value 日期时间草稿。
 * @param {string} calendar 历法。
 * @param {string} era 纪年。
 * @return {Array<number|null>|null} 年月日时分；闰月为负数。
 */
export function dateParts(value, calendar = "gregory", era = "ce") {
  const match = /^(?:(?:(\d{4}|C\d{2})-)?(\d{2})(L?)-(\d{2})T)?(\d{2}):(\d{2})$/
    .exec(value);
  if (!match) return null;
  const cyclic = match[1]?.startsWith("C");
  const year = match[1] ? Number(cyclic ? match[1].slice(1) : match[1]) : null;
  if (
    year !== null &&
    (cyclic
      ? era !== "ganzhi" || year > 59
      : era === "ganzhi" || year < calendarYears.min ||
        year > calendarYears.max)
  ) return null;
  const month = match[2] ? Number(match[2]) * (match[3] ? -1 : 1) : null;
  const day = match[4] ? Number(match[4]) : null;
  const hour = Number(match[5]), minute = Number(match[6]);
  if (hour > 23 || minute > 59) return null;
  if (
    month !== null &&
    (day < 1 ||
      day >
        (cyclic
          ? cycleMonthDays(calendar, year, month)
          : monthDays(calendar, year, month)))
  ) return null;
  return [year, month, day, hour, minute];
}

/**
 * 将解析后的日期写成可保存的精度一致值。
 * @param {Array<number|null>} p 年月日时分。
 * @param {string} era 纪年。
 * @return {string} 日期时间值。
 */
export function dateValue(p, era = "ce") {
  /** 补齐日期时间分量。 @param {number} n 分量。 @return {string} 两位数字。 */
  const pad = (n) => String(n).padStart(2, "0");
  const time = `${pad(p[3])}:${pad(p[4])}`;
  if (p[1] === null) return time;
  const date = `${pad(Math.abs(p[1]))}${p[1] < 0 ? "L" : ""}-${
    pad(p[2])
  }T${time}`;
  return p[0] === null
    ? date
    : (era === "ganzhi" ? "C" + pad(p[0]) : String(p[0]).padStart(4, "0")) +
      "-" + date;
}

/**
 * 把公历绝对日期换算为指定历法，使用儒略日保持公历格里高利规则一致。
 * @param {number[]} p 公历年月日时分。
 * @param {string} calendar 目标历法。
 * @return {number[]} 换算后的年月日时分。
 */
export function fromGregorian(p, calendar) {
  if (calendar !== "chinese") return [...p];
  const lunar = Solar.fromJulianDay(
    Date.UTC(p[0], p[1] - 1, p[2]) / 86400000 + 2440587.5,
  ).getLunar();
  return [lunar.getYear(), lunar.getMonth(), lunar.getDay(), p[3], p[4]];
}

/**
 * 把农历绝对日期换成公历，不构造不存在的农历日期。
 * @param {number[]} p 农历年月日时分。
 * @param {string} calendar 原历法。
 * @return {number[]|null} 公历年月日时分。
 */
export function toGregorian(p, calendar) {
  if (calendar !== "chinese") return [...p];
  const month = lunarYear(p[0]).getMonth(p[1]);
  if (!month || p[2] < 1 || p[2] > month.getDayCount()) return null;
  const date = new Date(
    (month.getFirstJulianDay() + p[2] - 1 - 2440587.5) * 86400000,
  );
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    p[3],
    p[4],
  ];
}

/**
 * 换算已明确年份的日期，未指定年份或干支周期不能确定唯一实际日期。
 * @param {string} value 日期草稿。
 * @param {string} from 原历法。
 * @param {string} to 目标历法。
 * @param {string} era 纪年。
 * @return {string|null} 换算值；null 表示需要先明确绝对年份及完整日期。
 */
export function convertCalendar(value, from, to, era = "ce") {
  if (!value || from === to) return value;
  const p = dateParts(value, from, era);
  if (!p) return null;
  if (p[1] === null) return value;
  if (p[0] === null || era === "ganzhi") return null;
  const solar = toGregorian(p, from);
  const target = solar && fromGregorian(solar, to);
  if (
    !target || target[0] < calendarYears.min || target[0] > calendarYears.max
  ) return null;
  return dateValue(target, era);
}

/**
 * 将月日投影到包含所有可能日期的有序槽位，闰月紧跟普通月。
 * @param {Array<number|null>} p 日期部分。
 * @param {string} calendar 历法。
 * @return {number} 年内的日期槽位。
 */
export function daySlot(p, calendar) {
  return calendar === "chinese"
    ? ((Math.abs(p[1]) - 1) * 2 + (p[1] < 0 ? 1 : 0)) * 30 + p[2] - 1
    : (p[1] - 1) * 31 + p[2] - 1;
}

/**
 * 将日期投影为分钟坐标，供绝对区间与循环区间统一比较。
 * @param {Array<number|null>} p 日期部分。
 * @param {string} calendar 历法。
 * @return {number} 对应精度的分钟坐标。
 */
export function dateMinute(p, calendar) {
  return ((p[0] ?? 0) * (calendar === "chinese" ? 720 : 372) +
        (p[1] === null ? 0 : daySlot(p, calendar))) * 1440 + p[3] * 60 + p[4];
}
