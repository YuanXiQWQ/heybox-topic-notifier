/** @file 分时段轮询的即时编辑、行优先级、日期选择和默认设置遮罩。 */
import {
  canEnableSchedule,
  dateParts,
  fullyCovered,
  normalizeSchedule,
  rowErrors,
  rowInactive,
  rowPaused,
} from "./polling-schedule-core.js";
import { calendarPicker } from "./polling-calendar-picker.js";
import { branches, stems } from "./polling-calendar.js";

/**
 * 按区间两端的日期差异显示日期，避免重复展示相同年月日。
 * @param {object} row 时段草稿。
 * @param {string} locale 页面语言。
 * @return {string} 本地化范围摘要。
 */
export function formatRange(row, locale) {
  const a = dateParts(row.start, row.calendar, row.era),
    b = dateParts(row.end, row.calendar, row.era);
  if (!a || !b) return "";
  const years = a[0] !== b[0];
  const dates = years || a[1] !== b[1] || a[2] !== b[2];
  const clock = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  });
  return [a, b].map((p) => {
    const time = clock.format(new Date(Date.UTC(2000, 0, 1, p[3], p[4])));
    if (!dates) return time;
    if (row.calendar !== "chinese" && row.era !== "ganzhi") {
      const options = {
        month: "2-digit",
        day: "2-digit",
        timeZone: "UTC",
        ...(years ? { year: "numeric" } : {}),
        ...(row.era === "roc"
          ? { calendar: "roc", era: years ? "short" : undefined }
          : {}),
      };
      return new Intl.DateTimeFormat(locale, options).format(
        new Date(Date.UTC(p[0] ?? 2000, p[1] - 1, p[2])),
      ) + " " + time;
    }
    const year = years
      ? row.era === "ganzhi"
        ? stems[p[0] % 10] + branches[p[0] % 12]
        : row.era === "roc"
        ? "民國" + (p[0] <= 1911 ? "前" + (1912 - p[0]) : p[0] - 1911)
        : p[0]
      : "";
    const leap = p[1] < 0
      ? (locale === "zh-CN" || locale === "zh-SG" ? "闰" : "閏")
      : "";
    return (year ? year + "年" : "") + leap + Math.abs(p[1]) + "月" + p[2] +
      "日 " + time;
  }).join(" – ");
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
  const dates = /** @type {HTMLDialogElement} */ (root.querySelector(
    "[data-schedule-dates]",
  ));
  const confirmation = /** @type {HTMLDialogElement} */ (root.querySelector(
    "[data-schedule-confirm]",
  ));
  const section = document.querySelector("[data-polling-section]");
  // 此处使用标准浏览器 API 或页面声明的宿主接口；IDE 的跨脚本推断不完整。
  // noinspection JSUnresolvedReference
  const defaultRows = [
    .../** @type {NodeListOf<HTMLElement>} */ (section.querySelectorAll(
      "[data-polling-field]",
    )),
  ]
    .filter((row) => row.dataset.pollingField !== "schedule");
  const state = normalizeSchedule(
    JSON.parse(input.value),
    document.querySelector('[name="locale"]')?.value ||
      document.documentElement.lang,
  );
  const openDates = calendarPicker(root, labels, update);
  const expanded = new Set();
  const inactiveIntervals = new Set();
  let dateRowId;
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
      edited: false,
      calendar: "gregory",
      era: "ce",
      start: "",
      end: "",
      intervalValue: "",
      intervalUnit: "",
      postLimit: "",
      sort: "",
    };
  }

  /**
   * 刷新当前轮次的字段状态，编辑时交给既有防抖保存，不丢弃无效行。
   * @param {boolean} changed 是否需要调度保存。
   */
  function update(changed = true) {
    const now = new Date();
    input.value = JSON.stringify(state);
    toggle.disabled = false;
    toggle.checked = state.enabled;
    toggle.setAttribute(
      "aria-disabled",
      String(!state.enabled && !canEnableSchedule(state)),
    );
    for (const row of list.children) {
      const value = state.rows.find((item) => item.id === row.dataset.id);
      const errors = value.edited ? rowErrors(value) : [];
      row.classList.remove("is-invalid");
      row.setAttribute("aria-invalid", String(errors.length > 0));
      for (
        const control of row.querySelectorAll(
          "[data-field],[data-schedule-range]",
        )
      ) {
        control.setAttribute(
          "aria-invalid",
          String(errors.includes(control.dataset.field || "range")),
        );
      }
      row.querySelector("[data-schedule-range]").textContent =
        formatRange(value, document.documentElement.lang) ||
        labels.scheduleRange;
      row.querySelector("[data-schedule-remove]").hidden =
        state.rows.length === 1;
      row.querySelector("[data-schedule-add]").disabled =
        state.rows.length >= 200;
      row.querySelector('[data-field="intervalValue"]').min =
        value.intervalUnit === "second" ? "3" : "1";
      const inactive = rowInactive(value, now, state.timeZone);
      const collapsed = inactive && !expanded.has(value.id);
      for (const field of row.querySelectorAll("[data-field]")) {
        field.closest(".schedule-field").hidden = collapsed;
      }
      const summary = row.querySelector("[data-schedule-paused]");
      summary.hidden = !collapsed;
      const insufficient = inactive && !rowPaused(value);
      const reason = row.querySelector("[data-schedule-interval-reason]");
      reason.id = `schedule-interval-reason-${encodeURIComponent(value.id)}`;
      reason.hidden = !insufficient;
      for (
        const control of [
          summary,
          row.querySelector('[data-field="intervalValue"]'),
        ]
      ) {
        const descriptions = (control.getAttribute("aria-describedby") ?? "")
          .split(/\s+/).filter((id) => id && id !== reason.id);
        if (insufficient) descriptions.push(reason.id);
        if (descriptions.length) {
          control.setAttribute("aria-describedby", descriptions.join(" "));
        } else control.removeAttribute("aria-describedby");
      }
      if (insufficient) {
        if (changed && !inactiveIntervals.has(value.id)) {
          globalThis.showToast(section, labels.scheduleIntervalOutsideRange);
        }
        inactiveIntervals.add(value.id);
      } else inactiveIntervals.delete(value.id);
    }
    const covered = state.enabled && fullyCovered(state);
    for (const row of defaultRows) {
      for (const control of row.querySelectorAll("input,select")) {
        control.disabled = covered;
        control.toggleAttribute("data-schedule-locked", covered);
      }
    }
    overlay.hidden = !covered ||
      !(/** @type {HTMLInputElement} */ (document.querySelector(
        "[data-polling-enabled-toggle]",
      ))).checked;
    positionOverlay();
    if (changed) globalThis.scheduleAutoSave();
  }

  /** 将遮罩定位在三个默认轮询字段上，保留其它开关可操作。 */
  function positionOverlay() {
    if (!overlay.hidden) overlay.style.top = defaultRows[0].offsetTop + "px";
  }

  /** 按当前时间刷新时段摘要，页面恢复可见时同步设备时区。 */
  function refreshTime() {
    if (document.hidden) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const changed = state.timeZone !== zone;
    state.timeZone = zone;
    update(changed && state.enabled);
  }

  /** 根据已保存草稿重建各行，控件继续使用设置页的统一样式。 */
  function render() {
    list.textContent = "";
    for (const value of state.rows) {
      const row = /** @type {HTMLElement} */ (template.content.firstElementChild
        .cloneNode(true));
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
    row.edited = true;
    update();
  });
  list.addEventListener("change", (event) => {
    if (!event.target.dataset.field) return;
    const row = state.rows.find((item) =>
      item.id === event.target.closest(".schedule-row").dataset.id
    );
    row[event.target.dataset.field] = event.target.value;
    row.edited = true;
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
    if (event.target.closest("[data-schedule-paused]")) {
      expanded.add(element.dataset.id);
      update(false);
      element.querySelector('[data-field="intervalValue"]').focus();
    } else if (
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
      dateRowId = element.dataset.id;
      expanded.add(dateRowId);
      openDates(state.rows[index]);
    }
  });
  list.addEventListener("focusin", (event) => {
    const row = event.target.closest(".schedule-row");
    if (row && !event.target.closest("[data-schedule-paused]")) {
      expanded.add(row.dataset.id);
      update(false);
    }
  });
  list.addEventListener("focusout", (event) => {
    const row = event.target.closest(".schedule-row");
    setTimeout(() => {
      if (
        row && !row.contains(document.activeElement) &&
        !(dates.open && dateRowId === row.dataset.id)
      ) {
        expanded.delete(row.dataset.id);
        update(false);
      }
    }, 0);
  });
  document.addEventListener("pointerdown", (event) => {
    if (dates.open) return;
    for (const row of list.children) {
      if (!row.contains(event.target)) expanded.delete(row.dataset.id);
    }
    update(false);
  });
  dates.addEventListener("close", () => {
    setTimeout(() => {
      const row = [...list.children].find((item) =>
        item.dataset.id === dateRowId
      );
      if (row && !row.contains(document.activeElement)) {
        expanded.delete(dateRowId);
      }
      dateRowId = undefined;
      update(false);
    }, 0);
  });
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
  document.querySelector('[name="locale"]')?.addEventListener(
    "change",
    (event) => {
      Object.assign(state, normalizeSchedule(state, event.target.value));
      render();
      update();
    },
  );
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(positionOverlay).observe(section);
  }
  if (!state.rows.length) state.rows = [emptyRow()];
  // 当前设备时区随正常设置编辑提交，不把首次打开空编辑器当成业务变更。
  const previousZone = state.timeZone;
  state.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  render();
  input.value = JSON.stringify(state);
  if (state.enabled && previousZone !== state.timeZone) {
    setTimeout(() => update(), 0);
  }
  setInterval(refreshTime, 60000);
  document.addEventListener("visibilitychange", refreshTime);
  addEventListener("focus", refreshTime);
}

document.addEventListener("DOMContentLoaded", initialize);
