/**
 * @file 本文件负责渲染命中记录表格及其筛选、分页、选择交互脚本。
 */
import { getMessages } from "../locales/index.ts";
import type { Locale, Messages } from "../locales/types.ts";
import type { MatchLocation } from "../models.ts";
import { csrfHiddenInput } from "../security/csrf.ts";
import { escapeHtml } from "./html.ts";
import type { MatchTableResult } from "./match_table.ts";
import {
  buildMatchTableUrl,
  compactPages,
  matchTableSignature,
  pageSizeValues,
} from "./match_table.ts";
import { truncateText } from "./text.ts";
import { formatHeyboxRelativeTime } from "./time.ts";

/**
 * 命中记录表格批量操作配置。
 */
export type MatchTableAction = {
  bulkButtonAttribute: string;
  emptySelectionMessage: string;
  icon: string;
  label: string;
  rowCheckboxAttribute: string;
  selectAllAttribute: string;
};

/**
 * 命中记录表格区块渲染选项。
 */
export type MatchRecordsSectionOptions = {
  action: MatchTableAction;
  csrfToken: string;
  emptyMessage: string;
  filterToggleId: string;
  formAction: string;
  heading: string;
  headingId: string;
  locale: Locale;
  messages: Messages;
  path: string;
  table: MatchTableResult;
  titleLinkClass?: string;
};

/**
 * 渲染命中记录表格区块。
 *
 * @param options 表格区块渲染选项。
 * @return 命中记录表格区块 HTML。
 */
export function renderMatchRecordsSection(options: MatchRecordsSectionOptions): string {
  return `
    <section
      class="table-section"
      aria-labelledby="${escapeHtml(options.headingId)}"
      data-match-table-signature="${escapeHtml(matchTableSignature(options.table))}"
    >
      <div class="section-title-row">
        <h2 id="${escapeHtml(options.headingId)}">${escapeHtml(options.heading)}</h2>
        ${renderTableFilters(options)}
      </div>
      ${
    options.table.totalRecords === 0 ? `<p>${escapeHtml(options.emptyMessage)}</p>` : `
        <form method="post" action="${escapeHtml(options.formAction)}">
          ${csrfHiddenInput(options.csrfToken)}
          <input type="hidden" name="returnTo" value="${
      escapeHtml(buildMatchTableUrl(options.path, options.table, {}))
    }">
          <table class="match-table">
            ${renderMatchTableColumns()}
            <thead>
              <tr>
                <th>
                  <label class="checkbox-cell bulk-action-cell">
                    <span>${escapeHtml(options.messages.batchOperation)}</span>
                    <input type="checkbox" ${options.action.selectAllAttribute}>
                  </label>
                </th>
                <th>${escapeHtml(options.messages.postTitle)}</th>
                <th>${escapeHtml(options.messages.postContent)}</th>
                <th>${escapeHtml(options.messages.publishedAt)}</th>
                <th>${escapeHtml(options.messages.matchedAt)}</th>
                <th>${escapeHtml(options.messages.matchedKeyword)}</th>
                <th>${escapeHtml(options.messages.matchLocationHeader)}</th>
                <th class="table-action-cell">
                  <button
                    type="submit"
                    class="icon-button"
                    ${options.action.bulkButtonAttribute}
                    title="${escapeHtml(options.action.label)}"
                    aria-label="${escapeHtml(options.action.label)}"
                  >${options.action.icon}</button>
                </th>
              </tr>
            </thead>
            <tbody>${renderRows(options)}</tbody>
          </table>
          ${renderPagination(options.path, options.table, options.messages)}
        </form>
      `
  }
    </section>
    ${renderFilterScript()}
    ${renderRelativeTimeScript()}
    ${renderOverflowScript()}
    ${renderSelectionScript(options.action)}
  `;
}

/**
 * 渲染命中记录表格行。
 *
 * @param options 表格区块渲染选项。
 * @return 表格行 HTML。
 */
function renderRows(options: MatchRecordsSectionOptions): string {
  const now = new Date();

  return options.table.records.map((record) => {
    const titleClasses = ["match-table-title-link", options.titleLinkClass]
      .filter((className): className is string => Boolean(className))
      .join(" ");

    return `
    <tr>
      <td>
        <label class="checkbox-cell">
          <input
            type="checkbox"
            name="matchId"
            value="${escapeHtml(record.id)}"
            ${options.action.rowCheckboxAttribute}
          >
        </label>
      </td>
      <td><a class="${escapeHtml(titleClasses)}" href="${
      escapeHtml(record.post.url)
    }" target="_blank" rel="noopener noreferrer">${escapeHtml(record.post.title)}</a></td>
      <td><span class="table-clip">${
      escapeHtml(truncateText(record.post.excerpt || record.post.body))
    }</span></td>
      <td>${renderRelativeTimeCell(record.post.publishedAt, now, options.locale)}</td>
      <td>${renderRelativeTimeCell(record.matchedAt, now, options.locale)}</td>
      <td><span class="table-cell-clip">${escapeHtml(record.keyword)}</span></td>
      <td><span class="table-cell-clip">${
      escapeHtml(locationLabel(record.location, options.messages))
    }</span></td>
      <td class="table-action-cell">
        <button
          type="submit"
          class="icon-button"
          name="matchId"
          value="${escapeHtml(record.id)}"
          title="${escapeHtml(options.action.label)}"
          aria-label="${escapeHtml(options.action.label)}"
        >${options.action.icon}</button>
      </td>
    </tr>
  `;
  }).join("");
}

/**
 * 渲染带前端相对时间刷新标记的时间单元格。
 *
 * @param value 时间字符串。
 * @param now 当前时间。
 * @param locale 当前语言标识。
 * @return 时间单元格 HTML。
 */
function renderRelativeTimeCell(value: string, now: Date, locale: Locale): string {
  return `<span class="table-cell-clip" data-relative-time="${
    escapeHtml(value)
  }" data-relative-time-locale="${escapeHtml(locale)}">${
    escapeHtml(formatHeyboxRelativeTime(value, now, locale))
  }</span>`;
}

/**
 * 渲染命中记录表格列宽定义。
 *
 * @return 表格列定义 HTML。
 */
function renderMatchTableColumns(): string {
  return `
            <colgroup>
              <col class="match-table-col-2">
              <col class="match-table-col-4">
              <col class="match-table-col-10">
              <col class="match-table-col-2">
              <col class="match-table-col-2">
              <col class="match-table-col-2">
              <col class="match-table-col-2">
              <col class="match-table-col-1">
            </colgroup>`;
}

/**
 * 渲染表格筛选控件。
 *
 * @param options 表格区块渲染选项。
 * @return 表格筛选控件 HTML。
 */
function renderTableFilters(options: MatchRecordsSectionOptions): string {
  const table = options.table;
  const messages = options.messages;
  const isActive = table.range !== "all" || table.from !== "" || table.to !== "";
  const isCustom = table.range === "custom";

  return `
    <div class="table-filter-shell">
      <input
        class="filter-toggle-input"
        type="checkbox"
        id="${escapeHtml(options.filterToggleId)}"
        ${isActive || table.filterOpen ? "checked" : ""}
      >
      <form class="table-filter-form ${
    isCustom ? "is-custom" : "is-custom-collapsed"
  }" method="get" action="${escapeHtml(options.path)}" data-match-filter-form>
        <label class="table-filter-field">
          <span>${escapeHtml(messages.filterRange)}</span>
          <select name="range" data-match-filter-control>
            ${option("all", table.range, messages.filterAll)}
            ${option("hour", table.range, messages.filterHour)}
            ${option("day", table.range, messages.filterDay)}
            ${option("week", table.range, messages.filterWeek)}
            ${option("custom", table.range, messages.filterCustom)}
          </select>
        </label>
        <label class="table-filter-field table-filter-date-field">
          <span>${escapeHtml(messages.filterFrom)}</span>
          <input
            type="datetime-local"
            name="from"
            value="${escapeHtml(table.from)}"
            aria-label="${escapeHtml(messages.filterFrom)}"
            data-match-filter-control
            ${isCustom ? "" : "disabled"}
          >
        </label>
        <label class="table-filter-field table-filter-date-field">
          <span>${escapeHtml(messages.filterTo)}</span>
          <input
            type="datetime-local"
            name="to"
            value="${escapeHtml(table.to)}"
            aria-label="${escapeHtml(messages.filterTo)}"
            data-match-filter-control
            ${isCustom ? "" : "disabled"}
          >
        </label>
        <input type="hidden" name="pageSize" value="${table.pageSize}">
        <input type="hidden" name="filterOpen" value="1">
      </form>
      <label
        class="filter-toggle"
        for="${escapeHtml(options.filterToggleId)}"
        title="${escapeHtml(messages.filter)}"
        aria-label="${escapeHtml(messages.filter)}"
      >
        ${filterIcon()}
      </label>
    </div>
  `;
}

/**
 * 渲染表格分页控件。
 *
 * @param path 页面路径。
 * @param table 表格计算结果。
 * @param messages 当前语言文案。
 * @return 分页控件 HTML。
 */
function renderPagination(path: string, table: MatchTableResult, messages: Messages): string {
  const pageLinks = compactPages(table.page, table.totalPages).map((page) => {
    if (page === "...") {
      return `<span class="pagination-ellipsis">...</span>`;
    }

    const href = buildMatchTableUrl(path, table, { page });
    const isCurrent = page === table.page;
    return `<a class="${isCurrent ? "is-current" : ""}" href="${escapeHtml(href)}">${page}</a>`;
  }).join("");
  const pageSizeLinks = pageSizeValues().map((pageSize) => {
    const href = buildMatchTableUrl(path, table, { page: 1, pageSize });
    const label = pageSize === "all" ? messages.allRows : String(pageSize);
    return `<a class="${pageSize === table.pageSize ? "is-current" : ""}" href="${
      escapeHtml(href)
    }">${escapeHtml(label)}</a>`;
  }).join("");

  return `
    <div class="pagination-row">
      <nav class="pagination" aria-label="pagination">${pageLinks}</nav>
      <div class="page-size-links">
        <span>${escapeHtml(messages.pageSize)}</span>
        ${pageSizeLinks}
      </div>
    </div>
  `;
}

/**
 * 获取命中位置展示文案。
 *
 * @param location 命中位置。
 * @param messages 当前语言文案。
 * @return 命中位置展示文案。
 */
function locationLabel(location: MatchLocation | undefined, messages: Messages): string {
  switch (location) {
    case "title":
      return messages.matchTitle;
    case "body":
      return messages.matchBody;
    case "comments":
      return messages.matchComments;
    case "replies":
      return messages.matchReplies;
    default:
      return "-";
  }
}

/**
 * 渲染 select 选项。
 *
 * @param value 选项值。
 * @param current 当前选中值。
 * @param label 选项文案。
 * @return option HTML。
 */
function option(value: string, current: string, label: string): string {
  return `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${
    escapeHtml(label)
  }</option>`;
}

/**
 * 渲染表格筛选前端脚本。
 *
 * @return 筛选交互脚本 HTML。
 */
function renderFilterScript(): string {
  return `<script>
    (() => {
      const initializeMatchFilters = () => {
        const forms = document.querySelectorAll("[data-match-filter-form]");
        for (const form of forms) {
          if (form.dataset.matchFilterInitialized === "true") continue;
          form.dataset.matchFilterInitialized = "true";

          const range = form.querySelector("select[name='range']");
          const dateInputs = Array.from(
            form.querySelectorAll(".table-filter-date-field input"),
          );
          const transitionMs = 180;
          let customTransitionToken = 0;
          const setCustomState = (options = {}) => {
            const token = ++customTransitionToken;
            const isCustom = range?.value === "custom";
            if (isCustom) {
              form.classList.remove("is-custom-collapsed");
              for (const input of dateInputs) input.disabled = false;
              requestAnimationFrame(() => {
                if (token === customTransitionToken) form.classList.add("is-custom");
              });
              return;
            }

            form.classList.remove("is-custom");
            for (const input of dateInputs) input.disabled = true;
            const collapse = () => {
              if (token !== customTransitionToken) return;
              form.classList.add("is-custom-collapsed");
              if (options.submitAfterCollapse) form.requestSubmit();
            };
            if (options.instant) {
              collapse();
              return;
            }
            setTimeout(collapse, transitionMs);
          };
          const controls = form.querySelectorAll("[data-match-filter-control]");
          for (const control of controls) {
            control.addEventListener("change", () => {
              if (control === range) {
                setCustomState({ submitAfterCollapse: range.value !== "custom" });
                if (range.value === "custom") return;
                return;
              }
              form.requestSubmit();
            });
          }
          setCustomState({ instant: true });
        }
      };

      window["__matchTableFilterInit"] = initializeMatchFilters;
      initializeMatchFilters();
    })();
  </script>`;
}

/**
 * 前端相对时间文案模板。
 */
type RelativeTimeTemplates = {
  daysAgo: string;
  hoursAgo: string;
  justNow: string;
  minutesAgo: string;
  secondsAgo: string;
  yesterdayAt: string;
};

/**
 * 渲染相对时间自动刷新脚本。
 *
 * @return 相对时间脚本 HTML。
 */
function renderRelativeTimeScript(): string {
  return `<script>
    (() => {
      const installedKey = '__matchTableRelativeTimeScriptInstalled';
      const updateKey = '__matchTableRelativeTimeUpdate';
      const overflowUpdateKey = '__matchTableOverflowUpdate';

      if (window[installedKey]) {
        window[updateKey]?.();
        return;
      }

      window[installedKey] = true;
      const relativeTemplates = ${JSON.stringify(relativeTimeTemplatesByLocale())};
      const updateRelativeTimes = () => {
        const nowMs = Date.now();
        const now = new Date(nowMs);
        for (const element of document.querySelectorAll('[data-relative-time]')) {
          const rawValue = element.getAttribute('data-relative-time') || '';
          const timestamp = Date.parse(rawValue);
          if (!Number.isFinite(timestamp)) {
            element.textContent = rawValue || '-';
            continue;
          }
          const locale = element.getAttribute('data-relative-time-locale') === 'en'
            ? 'en'
            : 'zh-CN';
          element.textContent = formatRelativeTime(timestamp, nowMs, now, locale);
        }
        window[overflowUpdateKey]?.();
      };

      window[updateKey] = updateRelativeTimes;
      updateRelativeTimes();
      window.setInterval(updateRelativeTimes, 1000);

      function formatRelativeTime(value, nowMs, now, locale) {
        const date = new Date(value);
        const templates = relativeTemplates[locale] || relativeTemplates['zh-CN'];
        const diffSeconds = Math.max(0, Math.floor((nowMs - value) / 1000));

        if (diffSeconds === 0) {
          return templates.justNow;
        }

        if (diffSeconds < 60) {
          return formatTemplate(templates.secondsAgo, { count: diffSeconds });
        }

        const diffMinutes = Math.floor(diffSeconds / 60);
        if (diffMinutes < 60) {
          return formatTemplate(templates.minutesAgo, { count: diffMinutes });
        }

        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) {
          return formatTemplate(templates.hoursAgo, { count: diffHours });
        }

        if (diffHours < 48) {
          const time = formatInChina(date, { hour: '2-digit', minute: '2-digit' }, locale);
          return formatTemplate(templates.yesterdayAt, { time });
        }

        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) {
          return formatTemplate(templates.daysAgo, { count: diffDays });
        }

        return formatInChina(
          date,
          sameChinaYear(date, now, locale)
            ? { day: '2-digit', month: '2-digit' }
            : { day: '2-digit', month: '2-digit', year: 'numeric' },
          locale,
        );
      }

      function formatTemplate(template, values) {
        return template.replaceAll(/\\{(\\w+)\\}/g, (placeholder, key) =>
          values[key] === undefined ? placeholder : String(values[key])
        );
      }

      function sameChinaYear(left, right, locale) {
        return formatInChina(left, { year: 'numeric' }, locale) ===
          formatInChina(right, { year: 'numeric' }, locale);
      }

      function formatInChina(date, options, locale) {
        return new Intl.DateTimeFormat(locale, {
          timeZone: 'Asia/Shanghai',
          ...options,
        }).format(date).replaceAll('/', '-');
      }
    })();
  </script>`;
}

/**
 * 获取各语言的前端相对时间模板。
 *
 * @return 按语言分组的相对时间模板。
 */
function relativeTimeTemplatesByLocale(): Record<Locale, RelativeTimeTemplates> {
  return {
    "zh-CN": relativeTimeTemplates(getMessages("zh-CN")),
    en: relativeTimeTemplates(getMessages("en")),
  };
}

/**
 * 从完整文案中提取相对时间模板。
 *
 * @param messages 当前语言文案。
 * @return 相对时间模板。
 */
function relativeTimeTemplates(messages: Messages): RelativeTimeTemplates {
  return {
    daysAgo: messages.relativeDaysAgo,
    hoursAgo: messages.relativeHoursAgo,
    justNow: messages.relativeJustNow,
    minutesAgo: messages.relativeMinutesAgo,
    secondsAgo: messages.relativeSecondsAgo,
    yesterdayAt: messages.relativeYesterdayAt,
  };
}

/**
 * 渲染表格溢出检测脚本。
 *
 * @return 溢出检测脚本 HTML。
 */
function renderOverflowScript(): string {
  return `<script>
    (() => {
      const clippedSelector = ".match-table-title-link, .table-cell-clip, .table-clip";
      const updateOverflowState = () => {
        for (const element of document.querySelectorAll(clippedSelector)) {
          if (!(element instanceof HTMLElement)) continue;
          const wasOverflowing = element.classList.contains("is-overflowing");
          element.classList.remove("is-overflowing");
          const isOverflowing = element.scrollHeight > element.clientHeight + 1 ||
            element.scrollWidth > element.clientWidth + 1;
          element.classList.toggle("is-overflowing", isOverflowing);
          if (isOverflowing && !wasOverflowing) {
            element.setAttribute("tabindex", "0");
          } else if (!isOverflowing) {
            element.removeAttribute("tabindex");
          }
        }
      };
      const scheduleUpdate = () => requestAnimationFrame(updateOverflowState);
      window["__matchTableOverflowUpdate"] = scheduleUpdate;
      scheduleUpdate();
      if (window["__matchTableOverflowScriptInstalled"]) return;
      window["__matchTableOverflowScriptInstalled"] = true;
      window.addEventListener("load", scheduleUpdate);
      window.addEventListener("resize", scheduleUpdate);
      if (window.ResizeObserver) {
        const observer = new ResizeObserver(scheduleUpdate);
        for (const table of document.querySelectorAll(".match-table")) observer.observe(table);
      }
    })();
  </script>`;
}

/**
 * 渲染筛选图标。
 *
 * @return 筛选图标 SVG。
 */
function filterIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z"></path>
  </svg>`;
}

/**
 * 渲染表格行选择和批量操作脚本。
 *
 * @param action 表格批量操作配置。
 * @return 选择交互脚本 HTML。
 */
function renderSelectionScript(action: MatchTableAction): string {
  const selectAllSelector = `[${action.selectAllAttribute}]`;
  const rowCheckboxSelector = `[${action.rowCheckboxAttribute}]`;
  const bulkButtonSelector = `[${action.bulkButtonAttribute}]`;

  return `<script>
    (() => {
      const selectAllSelector = ${JSON.stringify(selectAllSelector)};
      const rowCheckboxSelector = ${JSON.stringify(rowCheckboxSelector)};
      const bulkButtonSelector = ${JSON.stringify(bulkButtonSelector)};
      const scriptKey = \`selection:\${selectAllSelector}:\${rowCheckboxSelector}:\${bulkButtonSelector}\`;
      const scriptsKey = "__matchTableSelectionScripts";
      const installedScripts = window[scriptsKey] ?? new Set();
      window[scriptsKey] = installedScripts;
      if (installedScripts.has(scriptKey)) return;
      installedScripts.add(scriptKey);

      document.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.matches(selectAllSelector)) {
          const section = target.closest(".table-section");
          const checkboxes = section ? Array.from(section.querySelectorAll(rowCheckboxSelector)) : [];
          for (const checkbox of checkboxes) checkbox.checked = target.checked;
          return;
        }
        if (!target.matches(rowCheckboxSelector)) return;
        const section = target.closest(".table-section");
        const selectAll = section?.querySelector(selectAllSelector);
        const checkboxes = section ? Array.from(section.querySelectorAll(rowCheckboxSelector)) : [];
        if (selectAll instanceof HTMLInputElement) {
          selectAll.checked = checkboxes.length > 0 && checkboxes.every((item) => item.checked);
        }
      });

      document.addEventListener("click", (event) => {
        const button = event.target instanceof Element
          ? event.target.closest(bulkButtonSelector)
          : null;
        if (!button) return;
        const section = button.closest(".table-section");
        const checkboxes = section ? Array.from(section.querySelectorAll(rowCheckboxSelector)) : [];
        if (checkboxes.some((item) => item.checked)) return;
        event.preventDefault();
        showTableToast(section, ${JSON.stringify(action.emptySelectionMessage)});
      });

      function showTableToast(container, message) {
        if (!container) return;
        container.querySelector("[data-table-toast]")?.remove();
        const toast = document.createElement("div");
        toast.className = "keyword-toast";
        toast.dataset.tableToast = "true";
        toast.setAttribute("role", "status");
        toast.textContent = message;
        container.append(toast);
        window.setTimeout(() => {
          toast.classList.add("is-hiding");
          window.setTimeout(() => toast.remove(), 180);
        }, 1800);
      }
    })();
  </script>`;
}
