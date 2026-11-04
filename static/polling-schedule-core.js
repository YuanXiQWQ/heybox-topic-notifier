/** @file 前后端共用的时段校验、循环覆盖和有效轮询配置计算。 */
import {
  cycleMonthDays,
  cycleYear,
  dateMinute,
  dateParts,
  dateValue,
  daySlot,
  fromGregorian,
  lunarYear,
  monthDays,
  toGregorian,
} from "./polling-calendar.js";
import { calendarProfiles } from "./polling-calendar-profiles.js";
export { dateParts } from "./polling-calendar.js";
/** @typedef {{id:string,start:string,end:string,edited?:boolean,calendar?:string,era?:string,referenceStart?:string,referenceEnd?:string,intervalValue:string,intervalUnit:string,postLimit:string,sort:string}} ScheduleRow */
/** @typedef {{enabled:boolean,timeZone:string,rows:ScheduleRow[]}} PollingSchedule */
/** 允许的轮询单位及固定时长，月沿用默认轮询的三十天语义。 */
export const intervalUnits = {
  second: 1000,
  minute: 60000,
  hour: 3600000,
  day: 86400000,
  week: 604800000,
  month: 2592000000,
};
/** 与默认轮询一致的可选条数。 */
export const postLimits = [10, 20, 50, 100, 200, 500];
/** 与默认轮询一致的排序值。 */
export const pollSorts = ["publishTime", "smart", "replyTime"];
/** 最近出现的时段长度，避免每次调度重复换算时区边界。 */
const windowCache = new Map();

/**
 * 检查是否只设置了区间，没有填写任何轮询参数。
 * @param {ScheduleRow} row 时段草稿。
 * @return {boolean} 是否选择暂停轮询。
 */
export function rowPaused(row) {
  return !!row &&
    [row.intervalValue, row.intervalUnit, row.postLimit, row.sort].every((
      value,
    ) => String(value ?? "").trim() === "");
}

/**
 * 将民用时间边界换算为真实时刻，重复分钟覆盖两次，空缺分钟收敛到跳变边界。
 * @param {number} wall 民用日期按 UTC 编码的毫秒。
 * @param {string} timeZone 设备时区。
 * @param {boolean} end 是否为区间终点。
 * @return {number} UTC 毫秒。
 */
function civilInstant(wall, timeZone, end) {
  const target = new Date(wall).toISOString().slice(0, 16);
  /** @type {number[]} */
  const candidates = [-129600000, 0, 129600000].map((offset) => {
    const probe = wall + offset;
    return wall -
      (Date.parse(localTime(new Date(probe), timeZone) + ":00Z") - probe);
  });
  const exact = candidates.filter((value) =>
    localTime(new Date(value), timeZone) === target
  );
  if (exact.length) return end ? Math.max(...exact) : Math.min(...exact);
  let low = Math.min(...candidates), high = Math.max(...candidates);
  while (high - low > 60000) {
    const middle = Math.floor((low + high) / 120000) * 60000;
    if (localTime(new Date(middle), timeZone) < target) low = middle;
    else high = middle;
  }
  return high;
}

/**
 * 取得某年中实际存在的起止边界，不存在的闰日或闰月按匹配规则裁去。
 * @param {number[]} parts 年月日时分。
 * @param {string} calendar 历法。
 * @param {boolean} end 是否包含最后一分钟。
 * @return {number} 民用边界的 UTC 编码毫秒。
 */
function calendarBoundary(parts, calendar, end) {
  const year = parts[0], target = daySlot(parts, calendar);
  const months = calendar === "chinese"
    ? lunarYear(year).getMonths().filter((m) => m.getYear() === year).map((m) =>
      m.getMonth()
    )
    : Array.from({ length: 12 }, (_, i) => i + 1);
  let previous;
  for (const month of months) {
    const count = monthDays(calendar, year, month);
    for (let day = 1; day <= count; day++) {
      const p = [year, month, day, 0, 0], slot = daySlot(p, calendar);
      if (slot >= target) {
        if (slot === target) {
          const solar = toGregorian(p, calendar);
          return Date.UTC(
            solar[0],
            solar[1] - 1,
            solar[2],
            parts[3],
            parts[4] + Number(end),
          );
        }
        const solar = toGregorian(p, calendar);
        return Date.UTC(solar[0], solar[1] - 1, solar[2]);
      }
      previous = p;
    }
  }
  const solar = toGregorian(previous, calendar);
  return Date.UTC(solar[0], solar[1] - 1, solar[2] + 1);
}

/**
 * 按当前轮次计算有效时段长度，月长、闰日与时区跳变均使用实际日期。
 * @param {ScheduleRow} row 完整区间。
 * @param {Date} now 当前时间。
 * @param {string} timeZone 设备时区。
 * @return {number} 有效毫秒数。
 */
export function pollingWindowMs(row, now = new Date(), timeZone = "UTC") {
  const a = dateParts(row.start, row.calendar, row.era),
    b = dateParts(row.end, row.calendar, row.era);
  if (
    !a || !b || (a[0] === null) !== (b[0] === null) ||
    (a[1] === null) !== (b[1] === null)
  ) return 0;
  const solar = dateParts(localTime(now, timeZone));
  const current = fromGregorian(solar, row.calendar), daily = a[1] === null;
  const at = [...current];
  if (daily) at[0] = at[1] = at[2] = null;
  else if (a[0] === null) at[0] = null;
  else if (row.era === "ganzhi") at[0] = cycleYear(at[0]);
  const phase = dateMinute(a, row.calendar) > dateMinute(b, row.calendar) &&
    dateMinute(at, row.calendar) <= dateMinute(b, row.calendar);
  const key = JSON.stringify([
    row.start,
    row.end,
    row.calendar,
    row.era,
    timeZone,
    daily ? solar.slice(0, 3) : current[0],
    phase,
  ]);
  if (windowCache.has(key)) return windowCache.get(key);
  let start, end;
  if (daily) {
    const first = a[3] * 60 + a[4],
      last = b[3] * 60 + b[4],
      at = solar[3] * 60 + solar[4];
    const day = solar[2] - (first > last && at <= last ? 1 : 0);
    start = Date.UTC(solar[0], solar[1] - 1, day, 0, first);
    end = Date.UTC(
      solar[0],
      solar[1] - 1,
      day + Number(first > last),
      0,
      last + 1,
    );
  } else {
    const wrap = dateMinute(a, row.calendar) > dateMinute(b, row.calendar);
    if (a[0] === null) {
      const at = [...current];
      at[0] = null;
      a[0] = current[0] -
        (wrap && dateMinute(at, row.calendar) <= dateMinute(b, row.calendar)
          ? 1
          : 0);
      b[0] = a[0] + Number(wrap);
    } else if (row.era === "ganzhi") {
      const at = [...current];
      at[0] = cycleYear(current[0]);
      const cycle = Math.floor((current[0] - 4) / 60) -
        (wrap && dateMinute(at, row.calendar) <= dateMinute(b, row.calendar)
          ? 1
          : 0);
      a[0] = 4 + 60 * cycle + a[0];
      b[0] = 4 + 60 * (cycle + Number(wrap)) + b[0];
    }
    start = calendarBoundary(a, row.calendar, false);
    end = calendarBoundary(b, row.calendar, true);
  }
  const length = Math.max(
    0,
    civilInstant(end, timeZone, true) - civilInstant(start, timeZone, false),
  );
  if (windowCache.size >= 512) {
    windowCache.delete(windowCache.keys().next().value);
  }
  windowCache.set(key, length);
  return length;
}

/**
 * 判断当前轮次是否暂停，包括没有参数和间隔容不下一次轮询两种情况。
 * @param {ScheduleRow} row 时段。
 * @param {Date} now 当前时间。
 * @param {string} timeZone 设备时区。
 * @return {boolean} 是否不进行自动轮询。
 */
export function rowInactive(row, now = new Date(), timeZone = "UTC") {
  return !!rowKind(row) &&
    (rowPaused(row) ||
      Number(row.intervalValue) * intervalUnits[row.intervalUnit] >
        pollingWindowMs(row, now, timeZone));
}

/**
 * 检查间隔是否为合法正整数，并应用秒级下限。
 * @param {unknown} value 间隔值。
 * @param {string} unit 单位。
 * @return {boolean} 是否有效。
 */
export function validInterval(value, unit) {
  return Object.prototype.hasOwnProperty.call(intervalUnits, unit) &&
    String(value).trim() !== "" && Number.isSafeInteger(Number(value)) &&
    Number(value) >= (unit === "second" ? 3 : 1) &&
    Number(value) * intervalUnits[unit] <= Number.MAX_SAFE_INTEGER;
}

/**
 * 根据实际填写的日期精度确定每日、年度或指定年份区间。
 * @param {ScheduleRow} row 时段行。
 * @return {"daily"|"annual"|"cycle"|"once"|null} 有效行的时间语义。
 */
export function rowKind(row) {
  if (
    !row ||
    (!rowPaused(row) && (!validInterval(row.intervalValue, row.intervalUnit) ||
      !postLimits.includes(Number(row.postLimit)) ||
      !pollSorts.includes(row.sort)))
  ) return null;
  if (row.calendar && !["gregory", "chinese"].includes(row.calendar)) {
    return null;
  }
  if (row.era && !["ce", "roc", "ganzhi"].includes(row.era)) return null;
  const a = dateParts(row.start, row.calendar, row.era),
    b = dateParts(row.end, row.calendar, row.era);
  if (!a || !b) return null;
  if (
    (a[0] === null) !== (b[0] === null) || (a[1] === null) !== (b[1] === null)
  ) return null;
  if (a[0] !== null) {
    return row.era === "ganzhi"
      ? "cycle"
      : dateMinute(b, row.calendar) >= dateMinute(a, row.calendar)
      ? "once"
      : null;
  }
  return a[1] === null ? "daily" : "annual";
}

/**
 * 分别检查各个可编辑字段，日期范围共用调度器的精度和先后顺序校验。
 * @param {ScheduleRow} row 时段草稿。
 * @return {string[]} 无效控件的字段名。
 */
export function rowErrors(row) {
  const errors = [];
  if (rowPaused(row)) return rowKind(row) ? [] : ["range"];
  const unit = Object.prototype.hasOwnProperty.call(
    intervalUnits,
    row.intervalUnit,
  );
  if (!unit) errors.push("intervalUnit");
  if (!validInterval(row.intervalValue, unit ? row.intervalUnit : "minute")) {
    errors.push("intervalValue");
  }
  if (!postLimits.includes(Number(row.postLimit))) errors.push("postLimit");
  if (!pollSorts.includes(row.sort)) errors.push("sort");
  if (
    !rowKind({
      ...row,
      intervalValue: "3",
      intervalUnit: "second",
      postLimit: "20",
      sort: "publishTime",
    })
  ) errors.push("range");
  return errors;
}

/**
 * 规范化持久草稿，保留不完整行供编辑和单行错误反馈。
 * @param {unknown} input 外部输入。
 * @param {string} locale 界面语言。
 * @return {PollingSchedule} 有界的时段配置。
 */
export function normalizeSchedule(input, locale = "") {
  const value = input && typeof input === "object" ? input : {};
  let timeZone = typeof value.timeZone === "string" ? value.timeZone : "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    timeZone = "UTC";
  }
  const ids = new Set();
  const rows = (Array.isArray(value.rows) ? value.rows : []).slice(0, 200).map(
    (item, index) => {
      const row = {
        id: String(item?.id ?? "").slice(0, 80),
        start: String(item?.start ?? "").slice(0, 80),
        end: String(item?.end ?? "").slice(0, 80),
        intervalValue: String(item?.intervalValue ?? "").slice(0, 80),
        intervalUnit: String(item?.intervalUnit ?? "").slice(0, 80),
        postLimit: String(item?.postLimit ?? "").slice(0, 80),
        sort: String(item?.sort ?? "").slice(0, 80),
        referenceStart: String(item?.referenceStart ?? "").slice(0, 80),
        referenceEnd: String(item?.referenceEnd ?? "").slice(0, 80),
      };
      row.calendar = ["gregory", "chinese"].includes(item?.calendar)
        ? item.calendar
        : "gregory";
      row.era = ["ce", "roc", "ganzhi"].includes(item?.era) ? item.era : "ce";
      row.edited = item?.edited === true ||
        [
          row.start,
          row.end,
          row.intervalValue,
          row.intervalUnit,
          row.postLimit,
          row.sort,
        ].some((value) => value !== "");
      if (locale === "zh-CN" && row.era === "roc") {
        const parts = [row.start, row.end].map((date) =>
          dateParts(date, row.calendar, row.era)
        );
        const dates = parts.map((part) =>
          part && part[0] !== null ? toGregorian(part, row.calendar) : null
        );
        if (
          dates.some((date) =>
            date &&
            dateMinute(date, "gregory") >
              dateMinute([1949, 9, 30, 23, 59], "gregory")
          ) || [row.start, row.end].some((date) =>
            /^\d{4}-/.test(date) && Number(date.slice(0, 4)) > 1949
          )
        ) {
          row.era = "ce";
          if (
            parts.every((part, i) =>
              dates[i] || part?.[1] === null || ![row.start, row.end][i]
            )
          ) {
            if (dates[0]) row.start = dateValue(dates[0]);
            if (dates[1]) row.end = dateValue(dates[1]);
            row.calendar = "gregory";
          }
        }
      }
      if (!row.id || ids.has(row.id)) row.id = `row-${index}`;
      ids.add(row.id);
      return row;
    },
  );
  return { enabled: value.enabled === true, timeZone, rows };
}

/**
 * 只有至少一行且所有行完整时，才允许由关闭切换为开启。
 * @param {PollingSchedule} schedule 时段配置。
 * @return {boolean} 能否开启。
 */
export function canEnableSchedule(schedule) {
  return schedule.rows.length > 0 && schedule.rows.every((row) => rowKind(row));
}

/**
 * 将跨周期区间拆成可合并的半开分钟区间，结束分钟完整包含。
 * @param {number} start 开始分钟。
 * @param {number} end 结束分钟。
 * @param {number} length 周期总分钟。
 * @return {number[][]} 一段或两段区间。
 */
function segments(start, end, length) {
  return start <= end ? [[start, end + 1]] : [[0, end + 1], [start, length]];
}

/** 最近一次覆盖结果只缓存日期与有效性，普通数值编辑不重复扫描历法。 */
let coverageCache = { key: "", value: false };

/**
 * 将循环区间投影到各自历法的六十年坐标，并检查所有实际历法结构的逐日并集。
 * @param {PollingSchedule} schedule 时段配置。
 * @return {boolean} 是否没有任何可能落回默认设置的分钟。
 */
export function fullyCovered(schedule) {
  const rows = schedule.rows.filter((row) =>
    ["daily", "annual", "cycle"].includes(rowKind(row))
  );
  const key = JSON.stringify(
    rows.map((row) => [row.start, row.end, row.calendar, row.era]),
  );
  if (key === coverageCache.key) return coverageCache.value;
  const value = checkCoverage(rows);
  coverageCache = { key, value };
  return value;
}

/**
 * 合并当天已覆盖的半开分钟区间。
 * @param {number[][]} ranges 各时段的分钟交集。
 * @return {number[][]} 按开始时间排序、互不重叠的并集。
 */
function mergeRanges(ranges) {
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/**
 * 把循环规则拆成其实际周期内的区间，绝对年份不会被误当成循环。
 * @param {ScheduleRow} row 有效循环行。
 * @return {{pieces:number[][],length:number,calendar:string}} 周期及区间。
 */
function recurringRange(row) {
  const kind = rowKind(row), calendar = row.calendar || "gregory";
  const length = kind === "daily"
    ? 1440
    : (calendar === "chinese" ? 720 : 372) * 1440 * (kind === "cycle" ? 60 : 1);
  return {
    calendar,
    length,
    pieces: segments(
      dateMinute(dateParts(row.start, calendar, row.era), calendar),
      dateMinute(dateParts(row.end, calendar, row.era), calendar),
      length,
    ),
  };
}

/**
 * 使用真实年结构检查公历、农历和干支循环的联合覆盖；不存在的日期没有对应槽位。
 * @param {ScheduleRow[]} rows 完整循环行。
 * @return {boolean} 全部可出现日期是否覆盖整天。
 */
function checkCoverage(rows) {
  if (!rows.length) return false;
  const rules = rows.map(recurringRange);
  const daily = rules.filter((r) => r.length === 1440).flatMap((r) => r.pieces);
  const baseline = mergeRanges(daily);
  if (
    baseline.length === 1 && baseline[0][0] === 0 && baseline[0][1] === 1440
  ) return true;
  const solarRules = rules.filter((r) =>
    r.length !== 1440 && r.calendar !== "chinese"
  );
  const lunarRules = rules.filter((r) =>
    r.length !== 1440 && r.calendar === "chinese"
  );
  const solarDays = new Map(), lunarDays = new Map();
  const patterns = [], patternIds = new Map();
  const pairs = new Map();
  /**
   * 缓存某一天的分钟覆盖模式，相同模式共享序号。
   * @param {number} slot 六十年内的日期槽位。
   * @param {object[]} selected 同历法规则。
   * @param {Map<number,number>} cache 已计算的日期。
   * @return {number} 分钟覆盖模式序号。
   */
  function pattern(slot, selected, cache) {
    if (cache.has(slot)) return cache.get(slot);
    const ranges = baseline.map((r) => [...r]);
    for (const rule of selected) {
      const offset = (slot * 1440) % rule.length;
      for (const [start, end] of rule.pieces) {
        const a = Math.max(offset, start), b = Math.min(offset + 1440, end);
        if (a < b) ranges.push([a - offset, b - offset]);
      }
    }
    const merged = mergeRanges(ranges), signature = JSON.stringify(merged);
    if (!patternIds.has(signature)) {
      patternIds.set(signature, patterns.length);
      patterns.push(merged);
    }
    const id = patternIds.get(signature);
    cache.set(slot, id);
    return id;
  }
  /**
   * 合并同一天的两种历法覆盖，并缓存模式组合。
   * @param {number} solar 公历槽位。
   * @param {number} lunar 农历槽位。
   * @return {boolean} 当天是否完整。
   */
  function completeDay(solar, lunar) {
    const a = pattern(solarRules.length ? solar : 0, solarRules, solarDays);
    const b = pattern(lunarRules.length ? lunar : 0, lunarRules, lunarDays);
    const key = a + ":" + b;
    if (!pairs.has(key)) {
      const merged = mergeRanges([...patterns[a], ...patterns[b]]);
      pairs.set(
        key,
        merged.length === 1 && merged[0][0] === 0 && merged[0][1] === 1440,
      );
    }
    return pairs.get(key);
  }
  /**
   * 对单一历法只检查实际可能的日期槽位，年度与干支规则共用周期算法。
   * @param {string} calendar 历法。
   * @param {object[]} selected 同历法规则。
   * @param {Map<number,number>} cache 日期模式缓存。
   * @return {boolean} 单独采用该历法能否覆盖全部时间。
   */
  function completeCalendar(calendar, selected, cache) {
    if (!selected.length) return false;
    for (let cycle = 0; cycle < 60; cycle++) {
      for (let month = 1; month <= 12; month++) {
        for (let leap = 0; leap <= Number(calendar === "chinese"); leap++) {
          const count = cycleMonthDays(calendar, cycle, leap ? -month : month);
          for (let day = 0; day < count; day++) {
            const slot = calendar === "chinese"
              ? cycle * 720 + ((month - 1) * 2 + leap) * 30 + day
              : cycle * 372 + (month - 1) * 31 + day;
            const ranges = patterns[pattern(slot, selected, cache)];
            if (
              ranges.length !== 1 || ranges[0][0] !== 0 || ranges[0][1] !== 1440
            ) return false;
          }
        }
      }
    }
    return true;
  }
  if (
    completeCalendar("gregory", solarRules, solarDays) ||
    completeCalendar("chinese", lunarRules, lunarDays)
  ) return true;
  if (!solarRules.length || !lunarRules.length) return false;
  for (
    const [lunarCycle, solarCycle, start, leapBits, leapMonth, lengths]
      of calendarProfiles
  ) {
    let solarYear = solarCycle,
      solarMonth = Math.floor(start / 31),
      solarDay = start % 31,
      yearOffset = 0,
      index = 0;
    for (let month = 1; month <= 12; month++) {
      for (let leap = 0; leap <= Number(month === leapMonth); leap++) {
        const count = 29 + ((lengths >> index++) & 1);
        for (let day = 0; day < count; day++) {
          if (
            !completeDay(
              solarYear * 372 + solarMonth * 31 + solarDay,
              lunarCycle * 720 + ((month - 1) * 2 + leap) * 30 + day,
            )
          ) return false;
          const max = solarMonth === 1
            ? 28 + ((leapBits >> yearOffset) & 1)
            : [3, 5, 8, 10].includes(solarMonth)
            ? 30
            : 31;
          if (++solarDay === max) {
            solarDay = 0;
            if (++solarMonth === 12) {
              solarMonth = 0;
              solarYear = (solarYear + 1) % 60;
              yearOffset++;
            }
          }
        }
      }
    }
  }
  return true;
}

/**
 * 按所选时区取得当前民用时间，夏令时由时区数据库处理。
 * @param {Date} now 当前时间。
 * @param {string} timeZone 当前设备提交的 IANA 时区。
 * @return {string} 可按字典序比较的年月日时分。
 */
function localTime(now, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year.padStart(4, "0")}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * 依优先级选择时段及当期暂停状态，未命中时使用默认参数；键区分每次周期进入。
 * @param {object} polling 账号轮询设置。
 * @param {Date} now 本次调度时间。
 * @return {{polling:object,key:string}} 生效参数及区间标识。
 */
export function resolvePolling(polling, now = new Date()) {
  if (!polling.schedule?.enabled) return { polling, key: "default" };
  const schedule = normalizeSchedule(polling.schedule);
  if (!schedule.enabled) return { polling, key: "default" };
  const current = localTime(now, schedule.timeZone);
  const solar = dateParts(current);
  let lunar;
  for (const row of schedule.rows) {
    const kind = rowKind(row);
    if (!kind) continue;
    if (row.calendar === "chinese" && !lunar) {
      lunar = fromGregorian(solar, "chinese");
    }
    const p = [...(row.calendar === "chinese" ? lunar : solar)];
    const actualYear = p[0];
    if (kind === "daily") p[0] = p[1] = p[2] = null;
    else if (kind === "annual") p[0] = null;
    else if (kind === "cycle") p[0] = cycleYear(p[0]);
    const a = dateMinute(
      dateParts(row.start, row.calendar, row.era),
      row.calendar,
    );
    const b = dateMinute(
      dateParts(row.end, row.calendar, row.era),
      row.calendar,
    );
    const t = dateMinute(p, row.calendar);
    const match = a <= b ? t >= a && t <= b : t >= a || t <= b;
    if (!match) continue;
    let occurrence = kind === "once"
      ? row.start
      : kind === "cycle"
      ? String(Math.floor((actualYear - 4) / 60))
      : kind === "annual"
      ? String(actualYear)
      : current.slice(0, 10);
    if (a > b && t <= b) {
      if (kind === "annual" || kind === "cycle") {
        occurrence = String(Number(occurrence) - 1);
      } else {occurrence = new Date(
          Date.parse(current.slice(0, 10) + "T12:00:00Z") - 86400000,
        ).toISOString().slice(0, 10);}
    }
    return {
      polling: rowInactive(row, now, schedule.timeZone)
        ? { ...polling, enabled: false }
        : {
          ...polling,
          intervalValue: Number(row.intervalValue),
          intervalUnit: row.intervalUnit,
          postLimit: Number(row.postLimit),
          sort: row.sort,
        },
      key: JSON.stringify([row, occurrence, schedule.timeZone]),
    };
  }
  return { polling, key: "default" };
}
