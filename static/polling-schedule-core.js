/** @file 前后端共用的时段校验、循环覆盖和有效轮询配置计算。 */
/** @typedef {{id:string,start:string,end:string,intervalValue:string,intervalUnit:string,postLimit:string,sort:string}} ScheduleRow */
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
 * 解析可省略年份或整个日期的选择器值；无年份以闰年校验月日。
 * @param {string} value 本地年月日时分。
 * @return {Array<number|null>|null} 年月日时分，未选择的日期部分为 null。
 */
export function dateParts(value) {
  const match = /^(?:(?:(\d{4})-)?(\d{2})-(\d{2})T)?(\d{2}):(\d{2})$/.exec(
    value,
  );
  if (!match) return null;
  const p = [
    match[1] ? Number(match[1]) : null,
    match[2] ? Number(match[2]) : null,
    match[3] ? Number(match[3]) : null,
    Number(match[4]),
    Number(match[5]),
  ];
  if (p[3] > 23 || p[4] > 59 || (p[0] !== null && p[0] < 100)) return null;
  if (p[1] !== null) {
    const date = new Date(Date.UTC(p[0] ?? 2000, p[1] - 1, p[2]));
    if (date.getUTCMonth() + 1 !== p[1] || date.getUTCDate() !== p[2]) {
      return null;
    }
  }
  return p;
}

/**
 * 根据实际填写的日期精度确定每日、年度或指定年份区间。
 * @param {ScheduleRow} row 时段行。
 * @return {"daily"|"annual"|"once"|null} 有效行的时间语义。
 */
export function rowKind(row) {
  if (
    !row || !validInterval(row.intervalValue, row.intervalUnit) ||
    !postLimits.includes(Number(row.postLimit)) || !pollSorts.includes(row.sort)
  ) return null;
  const a = dateParts(row.start), b = dateParts(row.end);
  if (!a || !b) return null;
  if (
    (a[0] === null) !== (b[0] === null) || (a[1] === null) !== (b[1] === null)
  ) return null;
  if (a[0] !== null) return row.end >= row.start ? "once" : null;
  return a[1] === null ? "daily" : "annual";
}

/**
 * 规范化持久草稿，保留不完整行供编辑和单行错误反馈。
 * @param {unknown} input 外部输入。
 * @return {PollingSchedule} 有界的时段配置。
 */
export function normalizeSchedule(input) {
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
      const row = {};
      for (
        const field of [
          "id",
          "start",
          "end",
          "intervalValue",
          "intervalUnit",
          "postLimit",
          "sort",
        ]
      ) row[field] = String(item?.[field] ?? "").slice(0, 80);
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

/**
 * 同时检查平年与闰年的完整并集，指定年份的有限区间不参与闭环。
 * @param {PollingSchedule} schedule 时段配置。
 * @return {boolean} 每日及年度区间是否完整覆盖。
 */
export function fullyCovered(schedule) {
  const recurring = schedule.rows.filter((row) =>
    ["daily", "annual"].includes(rowKind(row))
  );
  return [2000, 2001].every((year) => coveredYear(recurring, year));
}

/**
 * 将实际存在的日期映射为连续分钟并求并集，不构造平年的二月二十九日。
 * @param {ScheduleRow[]} rows 循环时段。
 * @param {number} year 需要检查的平年或闰年。
 * @return {boolean} 该年的每一分钟是否均被覆盖。
 */
function coveredYear(rows, year) {
  const length = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  const ranges = [];
  for (const row of rows) {
    const kind = rowKind(row), a = dateParts(row.start), b = dateParts(row.end);
    const start = kind === "daily"
      ? a[3] * 60 + a[4]
      : ((a[1] - 1) * 31 + a[2] - 1) * 1440 + a[3] * 60 + a[4];
    const end = kind === "daily"
      ? b[3] * 60 + b[4]
      : ((b[1] - 1) * 31 + b[2] - 1) * 1440 + b[3] * 60 + b[4];
    const pieces = segments(
      start,
      end,
      kind === "daily" ? 1440 : 12 * 31 * 1440,
    );
    for (let day = 0; day < length; day++) {
      const date = new Date(Date.UTC(year, 0, day + 1));
      const offset = kind === "daily"
        ? 0
        : (date.getUTCMonth() * 31 + date.getUTCDate() - 1) * 1440;
      for (const [left, right] of pieces) {
        const low = Math.max(offset, left),
          high = Math.min(offset + 1440, right);
        if (low < high) {
          ranges.push([day * 1440 + low - offset, day * 1440 + high - offset]);
        }
      }
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let covered = 0;
  for (const [start, end] of ranges) {
    if (start > covered) return false;
    covered = Math.max(covered, end);
  }
  return covered === length * 1440;
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
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * 依行优先级选择有效时段，未命中时使用默认参数；键区分每次周期进入。
 * @param {object} polling 账号轮询设置。
 * @param {Date} now 本次调度时间。
 * @return {{polling:object,key:string}} 生效参数及区间标识。
 */
export function resolvePolling(polling, now = new Date()) {
  if (!polling.schedule?.enabled) return { polling, key: "default" };
  const schedule = normalizeSchedule(polling.schedule);
  if (!schedule.enabled) return { polling, key: "default" };
  const current = localTime(now, schedule.timeZone);
  for (const row of schedule.rows) {
    const kind = rowKind(row);
    if (!kind) continue;
    const offset = kind === "daily" ? 11 : kind === "annual" ? 5 : 0;
    const a = row.start, b = row.end, t = current.slice(offset);
    const match = a <= b ? t >= a && t <= b : t >= a || t <= b;
    if (!match) continue;
    let occurrence = kind === "once"
      ? row.start
      : kind === "annual"
      ? current.slice(0, 4)
      : current.slice(0, 10);
    if (a > b && t <= b) {
      if (kind === "annual") occurrence = String(Number(occurrence) - 1);
      else {occurrence = new Date(
          Date.parse(current.slice(0, 10) + "T12:00:00Z") - 86400000,
        ).toISOString().slice(0, 10);}
    }
    return {
      polling: {
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
