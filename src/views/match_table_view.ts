/**
 * @file 本文件负责渲染命中记录表格及其筛选、分页、选择交互脚本。
 */
import { getMessages } from "../locales/index.ts";
import { type Locale, locales, type Messages } from "../locales/types.ts";
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
export function renderMatchRecordsSection(
  options: MatchRecordsSectionOptions,
): string {
  return `
    <section
      class="table-section"
      aria-labelledby="${escapeHtml(options.headingId)}"
      data-match-table-signature="${
    escapeHtml(matchTableSignature(options.table))
  }"
    >
      <div class="section-title-row">
        <h2 id="${escapeHtml(options.headingId)}">${
    escapeHtml(options.heading)
  }</h2>
        ${renderTableFilters(options)}
      </div>
      ${
    options.table.totalRecords === 0
      ? `<p>${escapeHtml(options.emptyMessage)}</p>`
      : `
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
                    <input type="checkbox" ${options.action.selectAllAttribute}>
                  </label>
                </th>
                <th>${escapeHtml(options.messages.postTitle)}</th>
                <th>${escapeHtml(options.messages.postContent)}</th>
                <th>${escapeHtml(options.messages.matchDetails)}</th>
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
    ${renderPaginationScript()}
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
      <td class="match-title-cell"><a class="${
      escapeHtml(titleClasses)
    }" href="${
      escapeHtml(record.post.url)
    }" target="_blank" rel="noopener noreferrer">${
      escapeHtml(record.post.title)
    }</a></td>
      <td class="match-content-cell">${`<span class="table-clip">${
      escapeHtml(record.post.body || record.post.excerpt)
    }</span>`}</td>
      <td>${
      renderMatchDetails(record, now, options.locale, options.messages)
    }</td>
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
function renderRelativeTimeCell(
  value: string,
  now: Date,
  locale: Locale,
): string {
  return `<span class="match-detail-value" data-relative-time="${
    escapeHtml(value)
  }" data-relative-time-locale="${escapeHtml(locale)}">${
    escapeHtml(formatHeyboxRelativeTime(value, now, locale))
  }</span>`;
}

/**
 * 渲染命中记录详情单元格。
 *
 * @param record 命中记录。
 * @param now 当前时间。
 * @param locale 当前语言标识。
 * @param messages 当前语言文案。
 * @return 命中记录详情单元格 HTML。
 */
function renderMatchDetails(
  record: MatchTableResult["records"][number],
  now: Date,
  locale: Locale,
  messages: Messages,
): string {
  const details = [
    [
      messages.matchDetailPublished,
      renderRelativeTimeCell(record.post.publishedAt, now, locale),
    ],
    [
      messages.matchDetailMatched,
      renderRelativeTimeCell(record.matchedAt, now, locale),
    ],
    [
      messages.matchDetailKeyword,
      `<span class="match-detail-value">${escapeHtml(record.keyword)}</span>`,
    ],
    [
      messages.matchDetailLocation,
      `<span class="match-detail-value">${
        escapeHtml(locationLabel(record.location, messages))
      }</span>`,
    ],
  ];

  return `<dl class="match-detail-list">${
    details.map(([label, value]) =>
      `<div><dt>${escapeHtml(label)}：</dt><dd>${value}</dd></div>`
    ).join("")
  }</dl>`;
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
              <col class="match-table-col-3">
              <col class="match-table-col-14">
              <col class="match-table-col-5">
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
  const isActive = table.range !== "all" || table.from !== "" ||
    table.to !== "";
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
function renderPagination(
  path: string,
  table: MatchTableResult,
  messages: Messages,
): string {
  const pageMarker = 999999999;
  const pageUrlTemplate = buildMatchTableUrl(path, table, { page: pageMarker })
    .replace(`page=${pageMarker}`, "page=__PAGE__");
  const pageLinks = compactPages(table.page, table.totalPages).map((page) => {
    if (page === "...") {
      return `<span class="pagination-ellipsis">...</span>`;
    }

    const href = buildMatchTableUrl(path, table, { page });
    const isCurrent = page === table.page;
    return `<a class="${isCurrent ? "is-current" : ""}" href="${
      escapeHtml(href)
    }">${page}</a>`;
  }).join("");
  const pageSizeLinks = pageSizeValues().map((pageSize) => {
    const href = buildMatchTableUrl(path, table, { page: 1, pageSize });
    const label = pageSize === "all" ? messages.allRows : String(pageSize);
    return `<a class="${
      pageSize === table.pageSize ? "is-current" : ""
    }" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
  }).join("");

  return `
    <div class="pagination-row">
      <nav
        class="pagination"
        aria-label="pagination"
        data-adaptive-pagination
        data-current-page="${table.page}"
        data-total-pages="${table.totalPages}"
        data-page-url-template="${escapeHtml(pageUrlTemplate)}"
      >${pageLinks}</nav>
      <div class="page-size-links">
        <span>${escapeHtml(messages.pageSize)}</span>
        ${pageSizeLinks}
      </div>
    </div>
  `;
}

/**
 * 渲染自适应分页脚本。
 *
 * @return 自适应分页脚本 HTML。
 */
function renderPaginationScript(): string {
  return `<script>
    (() => {
      const scriptKey = "__adaptivePaginationInstalled";
      const pageMarker = "__PAGE__";
      const linkWidth = 36;
      const inputWidth = 54;
      const gap = 6;

      const scheduleRender = () => requestAnimationFrame(renderAll);
      window["__adaptivePaginationUpdate"] = scheduleRender;
      scheduleRender();
      if (window[scriptKey]) return;
      window[scriptKey] = true;
      window.addEventListener("resize", scheduleRender);
      window.addEventListener("load", scheduleRender);
      document.addEventListener("change", handlePageInput);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Enter") handlePageInput(event);
      });

      if (window.ResizeObserver) {
        const observer = new ResizeObserver(scheduleRender);
        for (const row of document.querySelectorAll(".pagination-row")) observer.observe(row);
      }

      /**
       * 重新渲染页面中的所有自适应分页控件。
       */
      function renderAll() {
        for (const nav of document.querySelectorAll("[data-adaptive-pagination]")) {
          if (!(nav instanceof HTMLElement)) continue;
          const currentPage = Number(nav.dataset.currentPage);
          const totalPages = Number(nav.dataset.totalPages);
          const template = nav.dataset.pageUrlTemplate ?? "";
          if (!Number.isInteger(currentPage) || !Number.isInteger(totalPages) || totalPages < 1) continue;
          nav.replaceChildren(...paginationItems(nav, currentPage, totalPages, template));
        }
      }

      /**
       * 根据分页容器宽度生成分页控件元素。
       *
       * @param {HTMLElement} nav 分页导航容器。
       * @param {number} currentPage 当前页码。
       * @param {number} totalPages 总页数。
       * @param {string} template 页码链接模板。
       * @return {Node[]} 分页控件元素列表。
       */
      function paginationItems(nav, currentPage, totalPages, template) {
        const width = nav.parentElement?.clientWidth || nav.clientWidth || 0;
        const fullWidth = totalPages * linkWidth + Math.max(0, totalPages - 1) * gap;
        if (fullWidth <= width) {
          return pages(1, totalPages).map((page) => pageLink(page, currentPage, template));
        }

        const maxControls = Math.max(5, Math.floor((width + gap) / (linkWidth + gap)));
        const inputSlots = Math.ceil((inputWidth + gap) / (linkWidth + gap));
        const availablePageSlots = Math.max(2, maxControls - inputSlots);
        const edgeCount = Math.max(1, Math.floor(availablePageSlots / 4));
        let middleSideCount = Math.max(0, Math.floor((availablePageSlots - edgeCount * 2) / 2));
        let balancedEdgeCount = edgeCount;
        while (
          estimatedCompactWidth(totalPages, currentPage, balancedEdgeCount, middleSideCount) > width &&
          (middleSideCount > 0 || balancedEdgeCount > 1)
        ) {
          if (middleSideCount > 0) {
            middleSideCount -= 1;
          } else {
            balancedEdgeCount -= 1;
          }
        }

        const visiblePages = new Set([
          ...pages(1, Math.min(balancedEdgeCount, totalPages)),
          ...pages(Math.max(1, currentPage - middleSideCount), Math.min(totalPages, currentPage + middleSideCount)),
          ...pages(Math.max(1, totalPages - balancedEdgeCount + 1), totalPages),
        ]);
        visiblePages.delete(currentPage);

        const sortedPages = Array.from(visiblePages).sort((left, right) => left - right);
        const items = [];
        let lastPage = 0;
        let inputInserted = false;

        for (const page of sortedPages) {
          if (!inputInserted && page > currentPage) {
            if (lastPage > 0 && currentPage - lastPage > 1) items.push(ellipsis());
            items.push(pageInput(currentPage, totalPages, template));
            lastPage = currentPage;
            inputInserted = true;
          }
          if (lastPage > 0 && page - lastPage > 1) items.push(ellipsis());
          items.push(pageLink(page, currentPage, template));
          lastPage = page;
        }

        if (!inputInserted) {
          if (lastPage > 0 && currentPage - lastPage > 1) items.push(ellipsis());
          items.push(pageInput(currentPage, totalPages, template));
        }

        return items;
      }

      /**
       * 估算压缩分页控件占用的宽度。
       *
       * @param {number} totalPages 总页数。
       * @param {number} currentPage 当前页码。
       * @param {number} edgeCount 首尾两端展示的页码数量。
       * @param {number} middleSideCount 当前页输入框两侧各展示的页码数量。
       * @return {number} 估算宽度。
       */
      function estimatedCompactWidth(totalPages, currentPage, edgeCount, middleSideCount) {
        const visiblePages = new Set([
          ...pages(1, Math.min(edgeCount, totalPages)),
          ...pages(Math.max(1, currentPage - middleSideCount), Math.min(totalPages, currentPage + middleSideCount)),
          ...pages(Math.max(1, totalPages - edgeCount + 1), totalPages),
        ]);
        visiblePages.delete(currentPage);
        const sortedPages = Array.from(visiblePages).sort((left, right) => left - right);
        let itemCount = 1;
        let lastPage = 0;

        for (const page of sortedPages) {
          if (lastPage > 0 && page - lastPage > 1) itemCount += 1;
          itemCount += 1;
          lastPage = page;
        }

        return (itemCount - 1) * gap + inputWidth + (itemCount - 1) * linkWidth;
      }

      /**
       * 创建分页链接元素。
       *
       * @param {number} page 页码。
       * @param {number} currentPage 当前页码。
       * @param {string} template 页码链接模板。
       * @return {HTMLAnchorElement} 分页链接元素。
       */
      function pageLink(page, currentPage, template) {
        const link = document.createElement("a");
        link.href = pageUrl(template, page);
        link.textContent = String(page);
        link.dataset.page = String(page);
        if (page === currentPage) link.className = "is-current";
        return link;
      }

      /**
       * 创建当前页输入框元素。
       *
       * @param {number} currentPage 当前页码。
       * @param {number} totalPages 总页数。
       * @param {string} template 页码链接模板。
       * @return {HTMLInputElement} 当前页输入框。
       */
      function pageInput(currentPage, totalPages, template) {
        const input = document.createElement("input");
        input.className = "pagination-page-input";
        input.type = "text";
        input.min = "1";
        input.max = String(totalPages);
        input.value = String(currentPage);
        input.inputMode = "numeric";
        input.pattern = "[0-9]*";
        input.dataset.pageUrlTemplate = template;
        return input;
      }

      /**
       * 创建分页省略号元素。
       *
       * @return {HTMLSpanElement} 省略号元素。
       */
      function ellipsis() {
        const item = document.createElement("span");
        item.className = "pagination-ellipsis";
        item.textContent = "...";
        return item;
      }

      /**
       * 生成闭区间页码列表。
       *
       * @param {number} from 起始页码。
       * @param {number} to 结束页码。
       * @return {number[]} 页码列表。
       */
      function pages(from, to) {
        const result = [];
        for (let page = from; page <= to; page += 1) result.push(page);
        return result;
      }

      /**
       * 根据页码和链接模板生成分页 URL。
       *
       * @param {string} template 页码链接模板。
       * @param {number} page 页码。
       * @return {string} 分页 URL。
       */
      function pageUrl(template, page) {
        return template.replace(pageMarker, String(page));
      }

      /**
       * 处理当前页输入框跳转。
       *
       * @param {Event} event 输入框 change 或 keydown 事件。
       */
      function handlePageInput(event) {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || !input.classList.contains("pagination-page-input")) return;
        if (event.type === "keydown" && event.key !== "Enter") return;
        const page = Number.parseInt(input.value, 10);
        if (!Number.isInteger(page)) return;
        const value = Math.min(Number(input.max), Math.max(Number(input.min), page));
        if (!Number.isInteger(value)) return;
        window.location.href = pageUrl(input.dataset.pageUrlTemplate ?? "", value);
      }
    })();
  </script>`;
}

/**
 * 获取命中位置展示文案。
 *
 * @param location 命中位置。
 * @param messages 当前语言文案。
 * @return 命中位置展示文案。
 */
function locationLabel(
  location: MatchLocation | undefined,
  messages: Messages,
): string {
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
  return `<option value="${escapeHtml(value)}" ${
    value === current ? "selected" : ""
  }>${escapeHtml(label)}</option>`;
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
      const relativeTemplates = ${
    JSON.stringify(relativeTimeTemplatesByLocale())
  };
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
          const locale = element.getAttribute('data-relative-time-locale') || 'zh-CN';
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
function relativeTimeTemplatesByLocale(): Record<
  Locale,
  RelativeTimeTemplates
> {
  return Object.fromEntries(
    locales.map((
      locale,
    ) => [locale, relativeTimeTemplates(getMessages(locale))]),
  ) as Record<Locale, RelativeTimeTemplates>;
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
      const clippedSelector = ".match-table-title-link, .table-clip, .match-detail-list";
      const updateOverflowState = () => {
        for (const element of document.querySelectorAll(clippedSelector)) {
          if (!(element instanceof HTMLElement)) continue;
          const wasOverflowing = element.classList.contains("is-overflowing");
          element.classList.remove("is-overflowing");
          const isOverflowing = isElementOverflowing(element);
          element.classList.toggle("is-overflowing", isOverflowing);
          if (isOverflowing && !wasOverflowing) {
            element.setAttribute("tabindex", "0");
          } else if (!isOverflowing) {
            element.removeAttribute("tabindex");
          }
        }
      };

      function isElementOverflowing(element) {
        if (element.classList.contains("match-detail-list")) {
          return Array.from(element.querySelectorAll(".match-detail-value"))
            .some((item) =>
              item instanceof HTMLElement &&
              item.scrollWidth > item.clientWidth + 1
            );
        }

        if (element.scrollWidth > element.clientWidth + 1) return true;
        if (element.scrollHeight > element.clientHeight + 1) return true;

        const clone = element.cloneNode(true);
        if (!(clone instanceof HTMLElement)) return false;
        const rect = element.getBoundingClientRect();
        clone.classList.remove("is-overflowing");
        clone.style.blockSize = "auto";
        clone.style.boxShadow = "none";
        clone.style.display = "block";
        clone.style.inlineSize = rect.width + "px";
        clone.style.left = "-10000px";
        clone.style.lineClamp = "unset";
        clone.style.maxBlockSize = "none";
        clone.style.overflow = "visible";
        clone.style.padding = getComputedStyle(element).padding;
        clone.style.pointerEvents = "none";
        clone.style.position = "absolute";
        clone.style.top = "0";
        clone.style.transform = "none";
        clone.style.visibility = "hidden";
        clone.style.webkitLineClamp = "unset";
        document.body.append(clone);
        const unclampedHeight = clone.scrollHeight;
        clone.remove();
        return unclampedHeight > element.clientHeight + 1;
      }

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
        showTableToast(section, ${
    JSON.stringify(action.emptySelectionMessage)
  });
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
