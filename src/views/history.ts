import { getMessages } from "../locales/index.ts";
import type { AppSettings, MatchLocation } from "../models.ts";
import { escapeHtml, renderLayout } from "./html.ts";
import type { MatchTableResult } from "./match_table.ts";
import { buildMatchTableUrl, compactPages, pageSizeValues } from "./match_table.ts";
import { formatHeyboxRelativeTime } from "./time.ts";

export function renderHistory(options: {
  historyTable: MatchTableResult;
  settings: AppSettings;
}): string {
  const messages = getMessages(options.settings.locale);

  const body = `
    <section class="page-heading">
      <div>
        <h1>${escapeHtml(messages.historyTitle)}</h1>
        <p>${escapeHtml(messages.sourceMock)}</p>
      </div>
    </section>
    ${renderHistoryTable(options.historyTable, messages)}
  `;

  return renderLayout({
    body,
    darkMode: options.settings.darkMode,
    locale: options.settings.locale,
    themeColor: options.settings.themeColor,
    title: messages.historyTitle,
  });
}

function renderHistoryTable(
  table: MatchTableResult,
  messages: ReturnType<typeof getMessages>,
): string {
  const records = table.records;
  const rows = records.map((record) => `
    <tr>
      <td>
        <label class="checkbox-cell">
          <input
            type="checkbox"
            name="matchId"
            value="${escapeHtml(record.id)}"
            data-history-match-checkbox
          >
        </label>
      </td>
      <td><a href="${escapeHtml(record.post.url)}">${escapeHtml(record.post.title)}</a></td>
      <td class="table-clip">${
    escapeHtml(truncateText(record.post.excerpt || record.post.body))
  }</td>
      <td>${escapeHtml(formatHeyboxRelativeTime(record.post.publishedAt))}</td>
      <td>${escapeHtml(formatHeyboxRelativeTime(record.matchedAt))}</td>
      <td>${escapeHtml(record.keyword)}</td>
      <td>${escapeHtml(locationLabel(record.location, messages))}</td>
      <td>
        <button
          type="submit"
          class="icon-button"
          name="matchId"
          value="${escapeHtml(record.id)}"
          title="${escapeHtml(messages.deleteMatch)}"
          aria-label="${escapeHtml(messages.deleteMatch)}"
        >${trashIcon()}</button>
      </td>
    </tr>
  `).join("");

  return `
    <section class="table-section" aria-labelledby="history-table-heading">
      <div class="section-title-row">
        <h2 id="history-table-heading">${escapeHtml(messages.historyTitle)}</h2>
        ${renderTableFilters("/history", table, messages)}
      </div>
      ${
    table.totalRecords === 0 ? `<p>${escapeHtml(messages.emptyHistory)}</p>` : `
        <form method="post" action="/matches/delete">
          <table>
            <thead>
              <tr>
                <th>
                  <label class="checkbox-cell bulk-action-cell">
                    <span>${escapeHtml(messages.batchOperation)}</span>
                    <input type="checkbox" data-history-select-all>
                  </label>
                </th>
                <th>${escapeHtml(messages.postTitle)}</th>
                <th>${escapeHtml(messages.postContent)}</th>
                <th>${escapeHtml(messages.publishedAt)}</th>
                <th>${escapeHtml(messages.matchedAt)}</th>
                <th>${escapeHtml(messages.matchedKeyword)}</th>
                <th>${escapeHtml(messages.matchLocationHeader)}</th>
                <th>
                  <button
                    type="submit"
                    class="icon-button"
                    title="${escapeHtml(messages.deleteMatch)}"
                    aria-label="${escapeHtml(messages.deleteMatch)}"
                  >${trashIcon()}</button>
                </th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          ${renderPagination("/history", table, messages)}
        </form>
      `
  }
    </section>
    ${records.length === 0 ? "" : renderHistoryScript()}
  `;
}

function renderTableFilters(
  path: string,
  table: MatchTableResult,
  messages: ReturnType<typeof getMessages>,
): string {
  return `
    <form class="table-filter-form" method="get" action="${path}">
      <span class="filter-icon" aria-hidden="true">${filterIcon()}</span>
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
  `;
}

function renderPagination(
  path: string,
  table: MatchTableResult,
  messages: ReturnType<typeof getMessages>,
): string {
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

function locationLabel(
  location: MatchLocation | undefined,
  messages: ReturnType<typeof getMessages>,
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

function truncateText(value: string, maxLength = 80): string {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function option(value: string, current: string, label: string): string {
  return `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${
    escapeHtml(label)
  }</option>`;
}

function trashIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z"></path>
    <path d="M6 9h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z"></path>
  </svg>`;
}

function filterIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z"></path>
  </svg>`;
}

function renderHistoryScript(): string {
  return `<script>
    (() => {
      const selectAll = document.querySelector("[data-history-select-all]");
      if (!selectAll) return;
      const checkboxes = Array.from(document.querySelectorAll("[data-history-match-checkbox]"));
      selectAll.addEventListener("change", () => {
        for (const checkbox of checkboxes) checkbox.checked = selectAll.checked;
      });
      for (const checkbox of checkboxes) {
        checkbox.addEventListener("change", () => {
          selectAll.checked = checkboxes.length > 0 && checkboxes.every((item) => item.checked);
        });
      }
    })();
  </script>`;
}
