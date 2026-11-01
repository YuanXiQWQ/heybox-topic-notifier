/** @file 分时段轮询的即时编辑、行优先级、日期选择和默认设置遮罩。 */
import {
  canEnableSchedule,
  dateParts,
  fullyCovered,
  normalizeSchedule,
  rowKind,
} from "./polling-schedule-core.js";

/**
 * 按区间两端的日期差异显示日期，避免重复展示相同年月日。
 * @param {object} row 时段草稿。
 * @param {string} locale 页面语言。
 * @return {string} 本地化范围摘要。
 */
export function formatRange(row, locale) {
  const a = dateParts(row.start), b = dateParts(row.end);
  if (!a || !b) return "";
  const options = {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  };
  if (a[0] !== b[0]) options.year = "numeric";
  if (a[1] !== b[1] || a[2] !== b[2]) {
    options.month = "2-digit";
    options.day = "2-digit";
  }
  const formatter = new Intl.DateTimeFormat(locale, options);
  return [a, b].map((p) =>
    formatter.format(
      new Date(Date.UTC(p[0] ?? 2000, (p[1] ?? 1) - 1, p[2] ?? 1, p[3], p[4])),
    )
  ).join(" – ");
}

/** 初始化独立视图，但复用同一设置表单及其本地队列和保存反馈。 */
function initialize() {
  const root = document.querySelector("[data-schedule-page]");
  if (!root) return;
  const input = root.querySelector('[name="pollSchedule"]');
  const list = root.querySelector("[data-schedule-list]");
  const template = root.querySelector("template");
  const toggle = document.querySelector("[data-schedule-toggle]");
  const labels = JSON.parse(root.dataset.labels);
  const dates = root.querySelector("[data-schedule-dates]");
  const confirmation = root.querySelector("[data-schedule-confirm]");
  const section = document.querySelector("[data-polling-section]");
  const defaultRows = [...section.querySelectorAll("[data-polling-field]")]
    .filter((row) => row.dataset.pollingField !== "schedule");
  const state = normalizeSchedule(JSON.parse(input.value));
  let dateRow;
  let activeDrag;
  const advanced =
    new URL(location.href).searchParams.get("panel") === "polling";
  document.body.dataset.settingsPanel = advanced ? "polling" : "main";
  root.hidden = !advanced;
  if (advanced) document.title = labels.scheduleTitle + " · " + document.title;
  const overlay = section.querySelector(".polling-coverage-overlay") ||
    document.createElement("div");
  overlay.className = "polling-coverage-overlay";
  overlay.textContent = labels.scheduleCovered;
  overlay.setAttribute("role", "status");
  section.querySelector(".settings-list").append(overlay);

  /**
   * 构造所有字段为空的新草稿，唯一标识随排序保持稳定。
   * @return {object} 空白时段。
   */
  function emptyRow() {
    return {
      id: crypto.randomUUID(),
      start: "",
      end: "",
      intervalValue: "",
      intervalUnit: "",
      postLimit: "",
      sort: "",
    };
  }

  /**
   * 保存隐藏字段并交给既有防抖保存，不丢弃无效行。
   * @param {boolean} changed 是否需要调度保存。
   */
  function update(changed = true) {
    input.value = JSON.stringify(state);
    toggle.disabled = false;
    toggle.checked = state.enabled;
    toggle.setAttribute(
      "aria-disabled",
      String(!state.enabled && !canEnableSchedule(state)),
    );
    for (const row of list.children) {
      const value = state.rows.find((item) => item.id === row.dataset.id);
      const invalid = !rowKind(value);
      row.classList.toggle("is-invalid", invalid);
      row.setAttribute("aria-invalid", String(invalid));
      row.querySelector("[data-schedule-range]").textContent =
        formatRange(value, document.documentElement.lang) ||
        labels.scheduleRange;
      row.querySelector("[data-schedule-remove]").hidden =
        state.rows.length === 1;
      row.querySelector("[data-schedule-add]").disabled =
        state.rows.length >= 200;
      row.querySelector('[data-field="intervalValue"]').min =
        value.intervalUnit === "second" ? "3" : "1";
    }
    const covered = state.enabled && fullyCovered(state);
    for (const row of defaultRows) {
      for (const control of row.querySelectorAll("input,select")) {
        control.disabled = covered;
        control.toggleAttribute("data-schedule-locked", covered);
      }
    }
    overlay.hidden = !covered ||
      !document.querySelector("[data-polling-enabled-toggle]").checked;
    positionOverlay();
    if (changed) globalThis.scheduleAutoSave();
  }

  /** 将遮罩定位在三个默认轮询字段上，保留其它开关可操作。 */
  function positionOverlay() {
    if (!overlay.hidden) overlay.style.top = defaultRows[0].offsetTop + "px";
  }

  /** 根据已保存草稿重建各行，控件继续使用设置页的统一样式。 */
  function render() {
    list.textContent = "";
    for (const value of state.rows) {
      const row = template.content.firstElementChild.cloneNode(true);
      row.dataset.id = value.id;
      for (const control of row.querySelectorAll("[data-field]")) {
        control.value = value[control.dataset.field];
      }
      list.append(row);
    }
    update(false);
  }

  /**
   * 将一行移动到指定位置并保持键盘焦点。
   * @param {HTMLElement} row 当前行。
   * @param {number} destination 新的索引。
   */
  function move(row, destination) {
    const index = state.rows.findIndex((item) => item.id === row.dataset.id);
    if (
      destination < 0 || destination >= state.rows.length ||
      index === destination
    ) return;
    const [item] = state.rows.splice(index, 1);
    state.rows.splice(destination, 0, item);
    const before = list.children[destination];
    list.insertBefore(row, index < destination ? before.nextSibling : before);
    update();
  }

  list.addEventListener("input", (event) => {
    const field = event.target.dataset.field;
    if (!field) return;
    const row = state.rows.find((item) =>
      item.id === event.target.closest(".schedule-row").dataset.id
    );
    row[field] = event.target.value;
    update();
  });
  list.addEventListener("change", (event) => {
    if (!event.target.dataset.field) return;
    const row = state.rows.find((item) =>
      item.id === event.target.closest(".schedule-row").dataset.id
    );
    row[event.target.dataset.field] = event.target.value;
    if (
      row.intervalUnit === "second" && row.intervalValue !== "" &&
      Number(row.intervalValue) < 3
    ) {
      row.intervalValue = "3";
      event.target.closest(".schedule-row").querySelector(
        '[data-field="intervalValue"]',
      ).value = "3";
      globalThis.showToast(section, section.dataset.pollingIntervalTooShort);
    }
    update();
  });
  list.addEventListener("click", (event) => {
    const element = event.target.closest(".schedule-row");
    if (!element) return;
    const index = state.rows.findIndex((row) => row.id === element.dataset.id);
    if (
      event.target.closest("[data-schedule-add]") && state.rows.length < 200
    ) {
      state.rows.splice(index + 1, 0, emptyRow());
      render();
      update();
      list.children[index + 1].querySelector("[data-schedule-range]").focus();
    } else if (
      event.target.closest("[data-schedule-remove]") && state.rows.length > 1
    ) {
      state.rows.splice(index, 1);
      render();
      update();
      list.children[Math.min(index, state.rows.length - 1)].querySelector(
        "[data-schedule-range]",
      ).focus();
    } else if (event.target.closest("[data-schedule-range]")) {
      dateRow = state.rows[index];
      for (const group of dates.querySelectorAll("[data-schedule-date]")) {
        const value = dateRow[group.dataset.scheduleDate];
        const [date, time] = value.includes("T")
          ? value.split("T")
          : ["", value];
        const parts = date ? date.split("-") : [];
        group.querySelector('[data-date-part="year"]').value =
          parts.length === 3 ? parts[0] : "";
        group.querySelector('[data-date-part="month"]').value =
          parts.length >= 2 ? parts[parts.length - 2] : "";
        updateDays(group, parts.length >= 2 ? parts[parts.length - 1] : "");
        group.querySelector('[data-date-part="time"]').value = time || "";
      }
      dates.showModal();
    }
  });
  /**
   * 为实际年份或未指定年份填充日期上限，月份改变时清除不存在的日期。
   * @param {HTMLElement} group 一个端点的日期字段。
   * @param {string} selected 当前选择的日。
   */
  function updateDays(
    group,
    selected = group.querySelector('[data-date-part="day"]').value,
  ) {
    const year = Number(group.querySelector('[data-date-part="year"]').value) ||
      2000;
    const month = Number(group.querySelector('[data-date-part="month"]').value);
    const count = month
      ? new Date(Date.UTC(year >= 100 ? year : 2000, month, 0)).getUTCDate()
      : 31;
    const day = group.querySelector('[data-date-part="day"]');
    day.textContent = "";
    day.add(new Option(labels.scheduleDay, ""));
    for (let value = 1; value <= count; value++) {
      day.add(new Option(String(value), String(value).padStart(2, "0")));
    }
    day.value = Number(selected) <= count ? selected : "";
  }
  /**
   * 将可留空的日期部分组合为草稿，不把无年份的月日绑定到当前年份。
   * @param {Event} event 日期字段编辑事件。
   */
  function editDate(event) {
    const group = event.target.closest("[data-schedule-date]");
    if (!group || !dateRow) return;
    if (["year", "month"].includes(event.target.dataset.datePart)) {
      updateDays(group);
    }
    const year = group.querySelector('[data-date-part="year"]').value;
    const month = group.querySelector('[data-date-part="month"]').value;
    const day = group.querySelector('[data-date-part="day"]').value;
    const time = group.querySelector('[data-date-part="time"]').value;
    const date = year
      ? year.padStart(4, "0") + "-" + month + "-" + day
      : month || day
      ? month + "-" + day
      : "";
    dateRow[group.dataset.scheduleDate] = date ? date + "T" + time : time;
    update();
  }
  dates.addEventListener("input", editDate);
  dates.addEventListener("change", editDate);
  root.querySelector("[data-schedule-close]").addEventListener(
    "click",
    () => dates.close(),
  );
  root.querySelector("[data-schedule-clear]").addEventListener(
    "click",
    () => confirmation.showModal(),
  );
  root.querySelector("[data-schedule-cancel]").addEventListener(
    "click",
    () => confirmation.close(),
  );
  root.querySelector("[data-schedule-confirm-clear]").addEventListener(
    "click",
    () => {
      state.rows = [{ ...emptyRow(), id: state.rows[0].id }];
      confirmation.close();
      render();
      update();
    },
  );
  toggle.addEventListener("change", () => {
    if (toggle.checked && !canEnableSchedule(state)) {
      toggle.checked = false;
      globalThis.showToast(section, labels.scheduleIncomplete);
      return;
    }
    state.enabled = toggle.checked;
    update();
  });
  list.addEventListener("keydown", (event) => {
    if (
      !event.target.matches("[data-schedule-drag]") ||
      !["ArrowUp", "ArrowDown"].includes(event.key)
    ) return;
    event.preventDefault();
    const row = event.target.closest(".schedule-row");
    move(
      row,
      [...list.children].indexOf(row) + (event.key === "ArrowUp" ? -1 : 1),
    );
  });
  list.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-schedule-drag]");
    if (!handle || event.button !== 0) return;
    activeDrag = {
      handle,
      row: handle.closest(".schedule-row"),
      pointerId: event.pointerId,
    };
    handle.setPointerCapture(event.pointerId);
    activeDrag.row.classList.add("is-dragging");
    event.preventDefault();
  });
  list.addEventListener("pointermove", (event) => {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest(".schedule-row");
    if (target && target !== activeDrag.row && list.contains(target)) {
      move(activeDrag.row, [...list.children].indexOf(target));
    }
    if (event.clientY < 70) scrollBy(0, -18);
    else if (event.clientY > innerHeight - 70) scrollBy(0, 18);
  });
  /** 完成或取消拖动时解除视觉标记，已经移动的顺序仍即时保存。 */
  function finishDrag() {
    if (!activeDrag) return;
    activeDrag.row.classList.remove("is-dragging");
    activeDrag = undefined;
  }
  list.addEventListener("pointerup", finishDrag);
  list.addEventListener("pointercancel", finishDrag);
  document.querySelector("[data-polling-enabled-toggle]").addEventListener(
    "change",
    () => {
      update(false);
      setTimeout(positionOverlay, 210);
    },
  );
  addEventListener("resize", positionOverlay);
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(positionOverlay).observe(section);
  }
  if (!state.rows.length) state.rows = [emptyRow()];
  render();
  // 当前设备时区随正常设置编辑提交，不把首次打开空编辑器当成业务变更。
  const previousZone = state.timeZone;
  state.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  input.value = JSON.stringify(state);
  if (state.enabled && previousZone !== state.timeZone) {
    setTimeout(() => update(), 0);
  }
}

document.addEventListener("DOMContentLoaded", initialize);
