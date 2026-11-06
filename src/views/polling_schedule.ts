/** @file 复用设置控件、行操作图标与弹窗渲染高级轮询编辑页。 */
import { getMessages } from "../locales/index.ts";
import type { AppSettings } from "../models.ts";
import {
  normalizeSchedule,
  postLimits,
} from "../../static/polling-schedule-core.js";
import { escapeHtml as e } from "./html.ts";
import { materialSymbolIcon } from "./icons.ts";
import { renderSettingsBack } from "./settings_back.ts";

/**
 * 渲染与主设置共用自动保存表单的独立高级间隔视图。
 * @param {AppSettings} settings 账号设置。
 * @return {string} 编辑器、行模板和日期选择弹窗。
 */
export function renderPollingSchedule(settings: AppSettings): string {
  const m = getMessages(settings.locale);
  const labels = Object.fromEntries(
    Object.entries(m).filter(([key]) => key.startsWith("schedule")),
  );
  return `<section data-schedule-page hidden data-chinese="${
    settings.locale.startsWith("zh-")
  }" data-roc="${["zh-CN", "zh-TW"].includes(settings.locale)}" data-labels="${
    e(JSON.stringify(labels))
  }">
    <div class="page-heading"><h1>${
    e(m.scheduleTitle)
  }</h1><button type="button" class="text-action-button" data-schedule-clear>${
    e(m.scheduleClear)
  }</button></div>
    <input type="hidden" name="pollSchedule" value="${
    e(JSON.stringify(
      normalizeSchedule(settings.polling.schedule, settings.locale),
    ))
  }">
    <p class="schedule-drag-instruction" id="schedule-drag-instruction">${
    materialSymbolIcon("drag_indicator", "rule-drag-icon")
  }<span>${e(m.dragRow)}</span></p>
    <div class="schedule-list" data-schedule-list></div>
    ${renderSettingsBack(m.navSettings)}
    <template data-schedule-template><div class="schedule-row">
      <button type="button" class="icon-button rule-drag-handle" data-schedule-drag aria-label="${
    e(m.dragRow)
  }" aria-describedby="schedule-drag-instruction">${
    materialSymbolIcon("drag_indicator", "rule-drag-icon")
  }</button>
      <label class="schedule-field schedule-range"><span>${
    e(m.scheduleRange)
  }</span><button type="button" data-schedule-range></button></label>
      <label class="schedule-field"><span>${
    e(m.pollInterval)
  }</span><span class="poll-interval-control"><input type="number" min="1" step="1" data-field="intervalValue" aria-label="${
    e(m.pollInterval)
  }"><select data-field="intervalUnit" aria-label="${
    e(m.pollInterval)
  }"><option value=""></option>${
    (["second", "minute", "hour", "day", "week", "month"] as const).map((
      unit,
    ) =>
      `<option value="${unit}">${
        e(
          m[
            ({
              second: "pollIntervalSecond",
              minute: "pollIntervalMinute",
              hour: "pollIntervalHour",
              day: "pollIntervalDay",
              week: "pollIntervalWeek",
              month: "pollIntervalMonth",
            } as const)[unit]
          ],
        )
      }</option>`
    ).join("")
  }</select></span></label>
      <label class="schedule-field"><span>${
    e(m.pollPostLimit)
  }</span><select data-field="postLimit"><option value=""></option>${
    postLimits.map((n) => `<option value="${n}">${n}</option>`).join("")
  }</select></label>
      <label class="schedule-field"><span>${
    e(m.pollSort)
  }</span><select data-field="sort"><option value=""></option><option value="publishTime">${
    e(m.pollSortPublishTime)
  }</option><option value="smart">${
    e(m.pollSortSmart)
  }</option><option value="replyTime">${
    e(m.pollSortReplyTime)
  }</option></select></label>
      <button type="button" class="text-action-button schedule-paused-summary" data-schedule-paused hidden>${
    e(m.schedulePaused)
  }</button>
      <div class="schedule-actions"><button type="button" class="icon-button" data-schedule-add aria-label="${
    e(m.scheduleAdd)
  }" data-tooltip="${e(m.scheduleAdd)}">${
    materialSymbolIcon("add", "settings-row-action-icon")
  }</button><button type="button" class="icon-button" data-schedule-remove aria-label="${
    e(m.scheduleRemove)
  }" data-tooltip="${
    e(m.scheduleRemove)
  }"><svg class="settings-row-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14"/></svg></button></div>
      <p class="schedule-interval-reason" data-schedule-interval-reason role="status" hidden>${
    e(m.scheduleIntervalOutsideRange)
  }</p>
    </div></template>
    <dialog class="avatar-crop-dialog schedule-date-dialog" data-schedule-dates>
      <header class="avatar-crop-header"><h2>${
    e(m.scheduleRange)
  }</h2><button type="button" class="settings-row-action-button settings-icon-action-button" data-schedule-close aria-label="${
    e(m.accountCancel)
  }"><svg viewBox="0 0 24 24" class="settings-row-action-icon" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
      <div class="schedule-date-fields"><div class="schedule-calendar-options"><label data-calendar-label><span>${
    e(m.scheduleCalendar)
  }</span><select data-schedule-calendar><option value="gregory">${
    e(m.scheduleGregorian)
  }</option><option value="chinese">${
    e(m.scheduleLunar)
  }</option></select></label><label data-era-label><span>${
    e(m.scheduleEra)
  }</span><select data-schedule-era><option value="ce">${
    e(m.scheduleCE)
  }</option><option value="roc">${
    e(m.scheduleROC)
  }</option><option value="ganzhi">${
    e(m.scheduleGanzhi)
  }</option></select></label></div>${
    (["start", "end"] as const).map((side) =>
      `<fieldset data-schedule-date="${side}"><legend>${
        e(side === "start" ? m.scheduleStart : m.scheduleEnd)
      }</legend><div class="schedule-calendar-fields"><input type="number" min="100" max="9999" step="1" data-date-part="year" placeholder="${
        e(m.scheduleYear)
      }" aria-label="${
        e(m.scheduleYear)
      }"><select data-date-part="cycle" aria-label="${
        e(m.scheduleYear)
      }" hidden></select><select data-date-part="month" aria-label="${
        e(m.scheduleMonth)
      }"><option value="">${e(m.scheduleMonth)}</option>${
        Array.from({ length: 12 }, (_, i) =>
          `<option value="${String(i + 1).padStart(2, "0")}">${i + 1}</option>`)
          .join("")
      }</select><select data-date-part="day" aria-label="${
        e(m.scheduleDay)
      }"><option value="">${
        e(m.scheduleDay)
      }</option></select></div><input type="time" data-date-part="time" step="60" aria-label="${
        e(side === "start" ? m.scheduleStart : m.scheduleEnd)
      }"></fieldset>`
    ).join("")
  }</div>
    </dialog>
    <dialog class="avatar-crop-dialog app-update-dialog" data-schedule-confirm>
      <header class="avatar-crop-header"><h2>${
    e(m.scheduleClear)
  }</h2></header><p>${e(m.scheduleClearConfirm)}</p>
      <div class="app-update-actions"><button type="button" class="text-action-button" data-schedule-cancel>${
    e(m.accountCancel)
  }</button><button type="button" data-schedule-confirm-clear>${
    e(m.scheduleClear)
  }</button></div>
    </dialog>
  </section>`;
}
