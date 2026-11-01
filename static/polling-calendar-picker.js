/** @file 日期弹窗的历法、纪年与年份选择，所有有效及不完整编辑均交给原表单即时保存。 */
import {
  branches,
  convertDateDraft,
  cycleMonthDays,
  dateMinute,
  dateParts,
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
  const editors = new Map();
  let row;

  /**
   * 将原有选项作为可输入建议列表，保留选项的内部值及即时编辑事件。
   * @param {HTMLSelectElement} select 原选框。
   */
  function makeEditable(select) {
    const wrapper = document.createElement("span");
    wrapper.className = "schedule-editable-select";
    const input = document.createElement("input"),
      options = document.createElement("datalist");
    options.id = "schedule-choices-" + crypto.randomUUID();
    input.setAttribute("list", options.id);
    input.setAttribute("autocomplete", "off");
    input.setAttribute(
      "aria-label",
      select.getAttribute("aria-label") ||
        select.closest("label")?.querySelector("span")?.textContent || "",
    );
    input.dataset.scheduleInput = select.dataset.datePart ||
      (select === calendar ? "calendar" : "era");
    if (["month", "day"].includes(select.dataset.datePart)) {
      input.inputMode = select.dataset.datePart === "day" ? "numeric" : "text";
    }
    select.before(wrapper);
    wrapper.append(select, input, options);
    editors.set(select, { input, options, wrapper });
    /**
     * 接纳选项文本或内部值，组合输入结束前不触发日期重算。
     * @param {Event} event 输入或提交事件。
     */
    function accept(event) {
      event.stopPropagation();
      if (event.isComposing) return;
      const text = input.value.trim();
      const match = [...select.options].find((option) =>
        !option.hidden && !option.disabled && !option.dataset.draft &&
        (option.textContent === text || option.value === text)
      );
      if (select === calendar || select === era) {
        input.setAttribute("aria-invalid", String(!match));
        if (match) {
          select.value = match.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          refresh(select, true);
        } else if (event.type === "change") refresh(select, true);
        return;
      }
      setValue(select, match ? match.value : text);
      select.dispatchEvent(
        new Event(event.type === "change" ? "change" : "input", {
          bubbles: true,
        }),
      );
    }
    input.addEventListener("input", accept);
    input.addEventListener("change", accept);
    input.addEventListener("compositionend", accept);
    input.addEventListener("blur", () => refresh(select, true));
  }

  /**
   * 写入当前选框值，未匹配选项的草稿保留给字段校验。
   * @param {HTMLSelectElement} select 选框。
   * @param {string} value 内部值。
   */
  function setValue(select, value) {
    for (const option of [...select.options]) {
      if (option.dataset.draft) option.remove();
    }
    if (![...select.options].some((option) => option.value === value)) {
      const option = new Option(value, value);
      option.dataset.draft = "true";
      select.add(option);
    }
    select.value = value;
  }

  /**
   * 同步建议列表、显示值和校验状态，不打断正在输入的文本。
   * @param {HTMLSelectElement} select 选框。
   * @param {boolean} force 是否立即更新文本。
   */
  function refresh(select, force = false) {
    const editor = editors.get(select);
    if (!editor) return;
    editor.wrapper.hidden = select.hidden;
    editor.input.disabled = select.disabled;
    editor.options.textContent = "";
    for (const option of select.options) {
      if (
        !option.value || option.hidden || option.disabled ||
        option.dataset.draft
      ) continue;
      editor.options.append(new Option(option.textContent, option.textContent));
    }
    editor.input.placeholder = select.options[0]?.value === ""
      ? select.options[0].textContent
      : "";
    if (force || document.activeElement !== editor.input) {
      editor.input.value = select.value
        ? select.selectedOptions[0]?.textContent || select.value
        : "";
    }
    editor.input.setAttribute(
      "aria-invalid",
      select.getAttribute("aria-invalid") || "false",
    );
  }

  for (const select of dialog.querySelectorAll("select")) makeEditable(select);

  /**
   * 获取单个日期端点的控件。
   * @param {HTMLElement} group 端点字段组。
   * @param {string} part 日期部分。
   * @return {HTMLInputElement|HTMLSelectElement} 控件。
   */
  function field(group, part) {
    return group.querySelector(`[data-date-part="${part}"]`);
  }

  /** 校验起止端点的必填部分与日期顺序，将状态标在具体控件上。 */
  function validateDates() {
    const needsYear = groups.some((group) =>
      field(group, row.era === "ganzhi" ? "cycle" : "year").value !== ""
    );
    const needsDate = needsYear ||
      groups.some((group) =>
        field(group, "month").value || field(group, "day").value
      );
    for (const group of groups) {
      const year = field(group, row.era === "ganzhi" ? "cycle" : "year");
      const month = field(group, "month"),
        day = field(group, "day"),
        time = field(group, "time");
      const m = parseInt(month.value) * (month.value.endsWith("L") ? -1 : 1);
      year.setAttribute(
        "aria-invalid",
        String(
          needsYear &&
            (!year.value || !Number.isInteger(yearValue(group)) ||
              (row.era === "ganzhi"
                ? year.selectedOptions[0]?.dataset.draft === "true"
                : !year.validity.valid)),
        ),
      );
      month.setAttribute(
        "aria-invalid",
        String(
          needsDate &&
            (!month.value ||
              month.selectedOptions[0]?.dataset.draft === "true" ||
              !maxDays(group, m)),
        ),
      );
      day.setAttribute(
        "aria-invalid",
        String(
          needsDate &&
            (!day.value || day.selectedOptions[0]?.dataset.draft === "true" ||
              Number(day.value) > maxDays(group, m)),
        ),
      );
      time.setAttribute(
        "aria-invalid",
        String(!/^\d{2}:\d{2}$/.test(time.value)),
      );
    }
    const a = dateParts(row.start, row.calendar, row.era),
      b = dateParts(row.end, row.calendar, row.era);
    if (
      a && b && a[0] !== null && b[0] !== null && row.era !== "ganzhi" &&
      dateMinute(b, row.calendar) < dateMinute(a, row.calendar)
    ) {
      const part = a[0] !== b[0]
        ? "year"
        : a[1] !== b[1]
        ? "month"
        : a[2] !== b[2]
        ? "day"
        : "time";
      field(groups[1], part).setAttribute("aria-invalid", "true");
    }
    for (const select of editors.keys()) refresh(select);
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
    setValue(control, selected);
    refresh(control);
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
    setValue(control, selected);
    updateDays(group);
    refresh(control);
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
    refresh(calendar);
    refresh(era);
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
      setValue(
        cycle,
        year.startsWith("C")
          ? Number.isFinite(Number(year.slice(1)))
            ? String(Number(year.slice(1)))
            : year.slice(1)
          : "",
      );
      refresh(cycle, true);
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
    }
    validateDates();
  }

  /**
   * 取得当前日期的绝对年份表示，循环日期自动就近补足参照。
   * @param {string} side 起止端点。
   * @return {string} 可供纪年选择判断的日期。
   */
  function absoluteValue(side) {
    return convertDateDraft(
      row[side],
      row.calendar,
      row.calendar,
      row.era,
      "ce",
      row[side === "start" ? "referenceStart" : "referenceEnd"],
    ).value;
  }

  /**
   * 换算两端的历法或纪年，空白部分保持空白，循环年份使用就近参照。
   * @param {string} kind calendar 或 era。
   * @param {string} target 目标值。
   * @return {boolean} 是否完成换算。
   */
  function switchTo(kind, target) {
    const next = { ...row };
    const nextEra = kind === "era" ? target : row.era;
    for (const side of ["start", "end"]) {
      const key = side === "start" ? "referenceStart" : "referenceEnd";
      const converted = convertDateDraft(
        row[side],
        row.calendar,
        kind === "calendar" ? target : row.calendar,
        row.era,
        nextEra,
        row[key],
      );
      next[side] = converted.value;
      next[key] = converted.reference;
    }
    if (
      nextEra === "roc" &&
      normalizeSchedule(
          { rows: [{ ...next, [kind]: target }] },
          locale?.value || document.documentElement.lang,
        ).rows[0].era !== "roc"
    ) {
      fill();
      return false;
    }
    Object.assign(row, next, { [kind]: target });
    fill();
    changed();
    return true;
  }

  /**
   * 记录日期草稿，用户修改干支年份后重新采用就近换算参照。
   * @param {Event} event 字段编辑事件。
   */
  function edit(event) {
    const group = event.target.closest("[data-schedule-date]");
    if (!group || !row) return;
    const side = group.dataset.scheduleDate,
      part = event.target.dataset.datePart;
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
      ? "C" + (Number.isFinite(year)
        ? String(year).padStart(2, "0")
        : field(group, "cycle").value)
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
    validateDates();
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
   * 打开时段并恢复草稿与各字段校验状态。
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
    fill();
    dialog.showModal();
  };
}
