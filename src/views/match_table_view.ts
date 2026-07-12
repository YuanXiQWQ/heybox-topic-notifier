import type { Messages } from "../locales/types.ts";
import type { Locale } from "../locales/types.ts";
import type { MatchLocation } from "../models.ts";
import { escapeHtml } from "./html.ts";
import type { MatchTableResult } from "./match_table.ts";
import { buildMatchTableUrl, compactPages, pageSizeValues } from "./match_table.ts";
import { truncateText } from "./text.ts";
import { formatHeyboxRelativeTime } from "./time.ts";

export type MatchTableAction = {
  bulkButtonAttribute: string;
  emptySelectionMessage: string;
  icon: string;
  label: string;
  rowCheckboxAttribute: string;
  selectAllAttribute: string;
};

export type MatchRecordsSectionOptions = {
  action: MatchTableAction;
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

export function renderMatchRecordsSection(options: MatchRecordsSectionOptions): string {
  const records = options.table.records;

  return `
    <section class="table-section" aria-labelledby="${escapeHtml(options.headingId)}">
      <div class="section-title-row">
        <h2 id="${escapeHtml(options.headingId)}">${escapeHtml(options.heading)}</h2>
        ${renderTableFilters(options)}
      </div>
      ${
    options.table.totalRecords === 0 ? `<p>${escapeHtml(options.emptyMessage)}</p>` : `
        <form method="post" action="${escapeHtml(options.formAction)}">
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
    ${records.length === 0 ? "" : renderSelectionScript(options.action)}
  `;
}

function renderRows(options: MatchRecordsSectionOptions): string {
  return options.table.records.map((record) => {
    const titleClass = options.titleLinkClass
      ? ` class="${escapeHtml(options.titleLinkClass)}"`
      : "";

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
      <td><a${titleClass} href="${escapeHtml(record.post.url)}">${
      escapeHtml(record.post.title)
    }</a></td>
      <td class="table-clip">${
      escapeHtml(truncateText(record.post.excerpt || record.post.body))
    }</td>
      <td>${
      escapeHtml(formatHeyboxRelativeTime(record.post.publishedAt, new Date(), options.locale))
    }</td>
      <td>${escapeHtml(formatHeyboxRelativeTime(record.matchedAt, new Date(), options.locale))}</td>
      <td>${escapeHtml(record.keyword)}</td>
      <td>${escapeHtml(locationLabel(record.location, options.messages))}</td>
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

function renderTableFilters(options: MatchRecordsSectionOptions): string {
  const table = options.table;
  const messages = options.messages;
  const isActive = table.range !== "all" || table.from !== "" || table.to !== "";

  return `
    <div class="table-filter-shell">
      <input
        class="filter-toggle-input"
        type="checkbox"
        id="${escapeHtml(options.filterToggleId)}"
        ${isActive ? "checked" : ""}
      >
      <label
        class="filter-toggle"
        for="${escapeHtml(options.filterToggleId)}"
        title="${escapeHtml(messages.filter)}"
        aria-label="${escapeHtml(messages.filter)}"
      >
        ${filterIcon()}
      </label>
      <form class="table-filter-form" method="get" action="${escapeHtml(options.path)}">
        <select name="range">
          ${option("all", table.range, messages.filterAll)}
          ${option("hour", table.range, messages.filterHour)}
          ${option("day", table.range, messages.filterDay)}
          ${option("week", table.range, messages.filterWeek)}
          ${option("custom", table.range, messages.filterCustom)}
        </select>
        <input type="datetime-local" name="from" value="${escapeHtml(table.from)}" aria-label="${
    escapeHtml(messages.filterFrom)
  }">
        <input type="datetime-local" name="to" value="${escapeHtml(table.to)}" aria-label="${
    escapeHtml(messages.filterTo)
  }">
        <input type="hidden" name="pageSize" value="${table.pageSize}">
        <button type="submit" class="secondary">${escapeHtml(messages.filter)}</button>
      </form>
    </div>
  `;
}

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

function option(value: string, current: string, label: string): string {
  return `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${
    escapeHtml(label)
  }</option>`;
}

function filterIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z"></path>
  </svg>`;
}

function renderSelectionScript(action: MatchTableAction): string {
  const selectAllSelector = `[${action.selectAllAttribute}]`;
  const rowCheckboxSelector = `[${action.rowCheckboxAttribute}]`;
  const bulkButtonSelector = `[${action.bulkButtonAttribute}]`;

  return `<script>
    (() => {
      const selectAll = document.querySelector(${JSON.stringify(selectAllSelector)});
      if (!selectAll) return;
      const section = selectAll.closest(".table-section");
      const bulkButton = document.querySelector(${JSON.stringify(bulkButtonSelector)});
      const checkboxes = Array.from(document.querySelectorAll(${
    JSON.stringify(rowCheckboxSelector)
  }));
      selectAll.addEventListener("change", () => {
        for (const checkbox of checkboxes) checkbox.checked = selectAll.checked;
      });
      for (const checkbox of checkboxes) {
        checkbox.addEventListener("change", () => {
          selectAll.checked = checkboxes.length > 0 && checkboxes.every((item) => item.checked);
        });
      }
      bulkButton?.addEventListener("click", (event) => {
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
