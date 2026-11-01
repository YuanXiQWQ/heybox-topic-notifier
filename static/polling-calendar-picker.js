/** @file 日期弹窗的历法、纪年与年份选择，所有有效及不完整编辑均交给原表单即时保存。 */
import {
  branches,
  convertCalendar,
  cycleMonthDays,
  cycleYear,
  dateMinute,
  dateParts,
  dateValue,
  fromGregorian,
  monthDays,
  stems,
} from "./polling-calendar.js";
import { normalizeSchedule } from "./polling-schedule-core.js";

/**
 * 创建与时段行绑定的日期弹窗控制器。
 * @param {HTMLElement} root 时段编辑器。
 * @param {object} labels 本地化标签。
 * @param {Function} changed 自动保存回调。
 * @return {Function} 打开指定行的弹窗。
 */
export function calendarPicker(root, labels, changed) {
  const dialog = root.querySelector("[data-schedule-dates]");
  const calendar = dialog.querySelector("[data-schedule-calendar]");
  const era = dialog.querySelector("[data-schedule-era]");
  const groups = [...dialog.querySelectorAll("[data-schedule-date]")];
  const locale = document.querySelector('[name="locale"]');
  let row, pending;

  /**
   * 获取单个日期端点的控件。
   * @param {HTMLElement} group 端点字段组。
   * @param {string} part 日期部分。
   * @return {HTMLInputElement|HTMLSelectElement} 控件。
   */
  function field(group, part) {
    return group.querySelector(`[data-date-part="${part}"]`);
  }

  /**
   * 返回控件所代表的绝对年或干支序号，民国前一年使用负一表示。
   * @param {HTMLElement} group 端点字段组。
   * @return {number|null} 年份，空白保持 null。
   */
  function yearValue(group) {
    const value = field(group, row.era === "ganzhi" ? "cycle" : "year").value;
    if (value === "") return null;
    const n = Number(value);
    return row.era === "roc" ? (n === 0 ? NaN : n + (n < 0 ? 1912 : 1911)) : n;
  }

  /**
   * 按所选年份和日期范围返回可选天数，年为空时保留可出现的闰日与闰月。
   * @param {HTMLElement} group 端点字段组。
   * @param {number} month 月份。
   * @return {number} 可选天数。
   */
  function maxDays(group, month) {
    const year = yearValue(group);
    let count = row.era === "ganzhi" && year !== null
      ? cycleMonthDays(row.calendar, year, month)
      : monthDays(
        row.calendar,
        year !== null && (year < 100 || year > 9999 || !Number.isInteger(year))
          ? null
          : year,
        month,
      );
    if (
      (locale?.value || document.documentElement.lang) === "zh-CN" &&
      row.era === "roc" && year !== null
    ) {
      const last = fromGregorian([1949, 9, 30, 0, 0], row.calendar);
      count = Math.max(
        0,
        Math.min(
          count,
          Math.floor(
            (dateMinute(last, row.calendar) -
              dateMinute([year, month, 1, 0, 0], row.calendar)) / 1440,
          ) + 1,
        ),
      );
    }
    return count;
  }

  /**
   * 重建可选日期，非法日期清空并由行校验标红。
   * @param {HTMLElement} group 端点字段组。
   * @param {string} selected 希望保留的日。
   */
  function updateDays(group, selected = field(group, "day").value) {
    const month = field(group, "month").value;
    const number = parseInt(month) * (month.endsWith("L") ? -1 : 1);
    const count = month
      ? maxDays(group, number)
      : row.calendar === "chinese"
      ? 30
      : 31;
    const control = field(group, "day");
    control.textContent = "";
    control.add(new Option(labels.scheduleDay, ""));
    for (let day = 1; day <= count; day++) {
      control.add(new Option(String(day), String(day).padStart(2, "0")));
    }
    control.value = Number(selected) <= count ? selected : "";
  }

  /**
   * 普通月和闰月分开列出，指定绝对年份时只显示当年存在的月份。
   * @param {HTMLElement} group 端点字段组。
   * @param {string} selected 希望保留的月。
   */
  function updateMonths(group, selected = field(group, "month").value) {
    const control = field(group, "month");
    control.textContent = "";
    control.add(new Option(labels.scheduleMonth, ""));
    for (let month = 1; month <= 12; month++) {
      const value = String(month).padStart(2, "0");
      if (maxDays(group, month)) control.add(new Option(String(month), value));
      if (row.calendar === "chinese" && maxDays(group, -month)) {
        control.add(
          new Option(
            labels.scheduleLeapMonth.replace("{month}", String(month)),
            value + "L",
          ),
        );
      }
    }
    control.value = selected;
    updateDays(group);
  }

  /** 根据当前行更新历法与日期控件。 @param {boolean} optionsOnly 是否仅更新选择项。 */
  function fill(optionsOnly = false) {
    calendar.value = row.calendar || "gregory";
    era.value = row.era || "ce";
    calendar.querySelector('[value="chinese"]').hidden =
      root.dataset.chinese !== "true" && row.calendar !== "chinese";
    era.querySelector('[value="roc"]').hidden = root.dataset.roc !== "true" &&
      row.era !== "roc";
    era.querySelector('[value="roc"]').disabled = normalizeSchedule({
      rows: [{
        ...row,
        era: "roc",
        start: absoluteValue("start") ?? row.start,
        end: absoluteValue("end") ?? row.end,
      }],
    }, locale?.value || document.documentElement.lang).rows[0].era !== "roc";
    era.querySelector('[value="ganzhi"]').hidden =
      root.dataset.chinese !== "true" && row.era !== "ganzhi";
    dialog.querySelector("[data-calendar-label]").hidden =
      root.dataset.chinese !== "true" && row.calendar !== "chinese";
    dialog.querySelector("[data-era-label]").hidden =
      root.dataset.chinese !== "true" && !["roc", "ganzhi"].includes(row.era);
    if (optionsOnly) return;
    for (const group of groups) {
      const value = row[group.dataset.scheduleDate];
      const [date, time] = value.includes("T") ? value.split("T") : ["", value];
      const parts = date ? date.split("-") : [];
      const year = parts.length === 3 ? parts[0] : "";
      const cycle = field(group, "cycle"), number = field(group, "year");
      cycle.hidden = row.era !== "ganzhi";
      number.hidden = row.era === "ganzhi";
      cycle.textContent = "";
      cycle.add(new Option(labels.scheduleYear, ""));
      for (let i = 0; i < 60; i++) {
        cycle.add(new Option(stems[i % 10] + branches[i % 12], String(i)));
      }
      cycle.value = year.startsWith("C") ? String(Number(year.slice(1))) : "";
      number.min = row.era === "roc" ? "-1812" : "100";
      number.max = row.era === "roc"
        ? (locale?.value || document.documentElement.lang) === "zh-CN"
          ? "38"
          : "8088"
        : "9999";
      number.value = year && !year.startsWith("C")
        ? String(
          Number(year) -
            (row.era === "roc" ? Number(year) <= 1911 ? 1912 : 1911 : 0),
        )
        : "";
      updateMonths(group, parts.length >= 2 ? parts[parts.length - 2] : "");
      updateDays(group, parts.length >= 2 ? parts[parts.length - 1] : "");
      field(group, "time").value = time || "";
      field(group, "reference").value = row[
        group.dataset.scheduleDate === "start"
          ? "referenceStart"
          : "referenceEnd"
      ] || "";
      group.querySelector("[data-reference-label]").hidden = true;
    }
  }

  /**
   * 把干支年还原为用户明确指定的实际年，不猜测所属轮次。
   * @param {string} side 起止端点。
   * @return {string|null} 含绝对年份的日期，缺少参照时为 null。
   */
  function absoluteValue(side) {
    const value = row[side], p = dateParts(value, row.calendar, row.era);
    if (!value) return value;
    if (!p) return null;
    if (row.era !== "ganzhi" || p[0] === null) return value;
    const reference = Number(
      row[side === "start" ? "referenceStart" : "referenceEnd"],
    );
    if (
      !Number.isInteger(reference) || reference < 100 || reference > 9999 ||
      cycleYear(reference) !== p[0]
    ) return null;
    p[0] = reference;
    const absolute = dateValue(p);
    return dateParts(absolute, row.calendar) ? absolute : null;
  }

  /**
   * 原子换算两端的历法或纪年，任何歧义都先要求明确实际年份。
   * @param {string} kind calendar 或 era。
   * @param {string} target 目标值。
   * @return {boolean} 是否完成换算。
   */
  function switchTo(kind, target) {
    const next = { ...row };
    const nextEra = kind === "era" ? target : row.era;
    for (const side of ["start", "end"]) {
      let value = row[side];
      const sameAbsoluteEra = kind === "era" && row.era !== "ganzhi" &&
        target !== "ganzhi";
      if (!sameAbsoluteEra) {
        value = absoluteValue(side);
        if (value !== null && kind === "calendar") {
          value = convertCalendar(value, row.calendar, target, "ce");
        }
        if (value === null) {
          pending = { kind, target };
          calendar.value = row.calendar;
          era.value = row.era;
          const group = groups.find((g) => g.dataset.scheduleDate === side);
          if (row.era === "ganzhi") {
            group.querySelector("[data-reference-label]").hidden = false;
          }
          field(group, row.era === "ganzhi" ? "reference" : "year").focus();
          globalThis.showToast(root, labels.scheduleChooseYear);
          return false;
        }
        const p = dateParts(value, kind === "calendar" ? target : row.calendar);
        if (nextEra === "ganzhi" && p && p[0] !== null) {
          next[side === "start" ? "referenceStart" : "referenceEnd"] = String(
            p[0],
          );
          p[0] = cycleYear(p[0]);
          value = dateValue(p, "ganzhi");
        }
      }
      next[side] = value;
    }
    if (
      nextEra === "roc" &&
      normalizeSchedule(
          { rows: [{ ...next, [kind]: target }] },
          locale?.value || document.documentElement.lang,
        ).rows[0].era !== "roc"
    ) {
      pending = undefined;
      fill();
      return false;
    }
    Object.assign(row, next, { [kind]: target });
    pending = undefined;
    fill();
    changed();
    return true;
  }

  /**
   * 记录日期草稿，参照年份只用于消歧义，不限制干支规则的循环执行。
   * @param {Event} event 字段编辑事件。
   */
  function edit(event) {
    const group = event.target.closest("[data-schedule-date]");
    if (!group || !row) return;
    const side = group.dataset.scheduleDate,
      part = event.target.dataset.datePart;
    if (part === "reference") {
      row[side === "start" ? "referenceStart" : "referenceEnd"] =
        event.target.value;
      fill(true);
      changed();
      if (pending && event.type === "change") {
        switchTo(pending.kind, pending.target);
      }
      return;
    }
    if (
      part === "year" && row.era === "roc" &&
      (locale?.value || document.documentElement.lang) === "zh-CN" &&
      Number(event.target.value) > 38
    ) event.target.value = "38";
    if (["year", "cycle"].includes(part)) updateMonths(group);
    if (["year", "cycle", "month"].includes(part)) updateDays(group);
    const year = yearValue(group),
      month = field(group, "month").value,
      day = field(group, "day").value,
      time = field(group, "time").value;
    const prefix = year === null
      ? ""
      : row.era === "ganzhi"
      ? "C" + String(year).padStart(2, "0")
      : String(year).padStart(4, "0");
    const date = prefix
      ? prefix + "-" + month + "-" + day
      : month || day
      ? month + "-" + day
      : "";
    row[side] = date ? date + "T" + time : time;
    if (part === "cycle") {
      row[side === "start" ? "referenceStart" : "referenceEnd"] = "";
    }
    fill(true);
    changed();
  }
  dialog.addEventListener("input", edit);
  dialog.addEventListener("change", edit);
  calendar.addEventListener(
    "change",
    () => switchTo("calendar", calendar.value),
  );
  era.addEventListener("change", () => switchTo("era", era.value));
  /**
   * 打开时段并丢弃未完成的换算意图，草稿内容仍然保留。
   * @param {object} value 时段行。
   */
  return function open(value) {
    Object.assign(
      value,
      normalizeSchedule(
        { rows: [value] },
        locale?.value || document.documentElement.lang,
      ).rows[0],
    );
    row = value;
    if (!row.calendar) row.calendar = "gregory";
    if (!row.era) row.era = "ce";
    pending = undefined;
    fill();
    dialog.showModal();
  };
}
