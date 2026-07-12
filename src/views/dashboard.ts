import { getMessages } from "../locales/index.ts";
import type { AppSettings, AppState, MatchLocation } from "../models.ts";
import { escapeHtml, renderLayout } from "./html.ts";
import type { MatchTableResult } from "./match_table.ts";
import { buildMatchTableUrl, compactPages, pageSizeValues } from "./match_table.ts";
import { truncateText } from "./text.ts";
import { formatHeyboxRelativeTime } from "./time.ts";

export function renderDashboard(options: {
  pendingTable: MatchTableResult;
  settings: AppSettings;
  state: AppState;
}): string {
  const messages = getMessages(options.settings.locale);
  const latest = options.state.latestMatch;
  const lastPollAt = options.state.lastPollAt;

  const body = `
    <section class="page-heading">
      <div>
        <h1>${escapeHtml(messages.dashboardTitle)}</h1>
        <p>${escapeHtml(messages.dashboardSubtitle)}</p>
      </div>
      <div class="actions">
        <form method="post" action="/run-now">
          <button type="submit">${escapeHtml(messages.runNow)}</button>
        </form>
      </div>
    </section>
    <section class="metrics">
      <article>
        <span>${escapeHtml(messages.lastPoll)}</span>
        ${renderLastPoll(lastPollAt, options.settings.locale)}
      </article>
      <article>
        <span>${escapeHtml(messages.latestMatch)}</span>
        <strong>${
    latest
      ? `<a class="metric-link" href="${escapeHtml(latest.post.url)}">${
        escapeHtml(latest.post.title)
      }</a>`
      : "-"
  }</strong>
      </article>
      <article>
        <span>${escapeHtml(messages.totalMatches)}</span>
        <strong>${options.state.totalMatches}</strong>
      </article>
    </section>
    ${renderPendingMatches(options.pendingTable, messages, options.settings.locale)}
    ${lastPollAt ? renderLastPollScript(messages) : ""}
  `;

  return renderLayout({
    body,
    darkMode: options.settings.darkMode,
    locale: options.settings.locale,
    themeColor: options.settings.themeColor,
    title: messages.appName,
  });
}

function renderLastPoll(lastPollAt: string | undefined, locale: AppSettings["locale"]): string {
  if (!lastPollAt) {
    return "<strong>-</strong>";
  }

  return `<strong data-last-poll-at="${escapeHtml(lastPollAt)}" data-last-poll-locale="${
    escapeHtml(locale)
  }">${escapeHtml(formatHeyboxRelativeTime(lastPollAt, new Date(), locale))}</strong>`;
}

function renderPendingMatches(
  table: MatchTableResult,
  messages: ReturnType<typeof getMessages>,
  locale: AppSettings["locale"],
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
            data-pending-match-checkbox
          >
        </label>
      </td>
      <td><a class="pending-title-link" href="${escapeHtml(record.post.url)}">${
    escapeHtml(record.post.title)
  }</a></td>
      <td class="table-clip">${
    escapeHtml(truncateText(record.post.excerpt || record.post.body))
  }</td>
      <td>${escapeHtml(formatHeyboxRelativeTime(record.post.publishedAt, new Date(), locale))}</td>
      <td>${escapeHtml(formatHeyboxRelativeTime(record.matchedAt, new Date(), locale))}</td>
      <td>${escapeHtml(record.keyword)}</td>
      <td>${escapeHtml(locationLabel(record.location, messages))}</td>
      <td class="table-action-cell">
        <button
          type="submit"
          class="icon-button"
          name="matchId"
          value="${escapeHtml(record.id)}"
          title="${escapeHtml(messages.completeMatch)}"
          aria-label="${escapeHtml(messages.completeMatch)}"
        >${checkIcon()}</button>
      </td>
    </tr>
  `).join("");

  return `
    <section class="table-section" aria-labelledby="pending-posts-heading">
      <div class="section-title-row">
        <h2 id="pending-posts-heading">${escapeHtml(messages.pendingPosts)}</h2>
        ${renderTableFilters("/", table, messages)}
      </div>
      ${
    table.totalRecords === 0 ? `<p>${escapeHtml(messages.emptyPendingPosts)}</p>` : `
        <form method="post" action="/matches/complete">
          <input type="hidden" name="returnTo" value="${
      escapeHtml(buildMatchTableUrl("/", table, {}))
    }">
          <table class="match-table">
            ${renderMatchTableColumns()}
            <thead>
              <tr>
                <th>
                  <label class="checkbox-cell bulk-action-cell">
                    <span>${escapeHtml(messages.batchOperation)}</span>
                    <input type="checkbox" data-pending-select-all>
                  </label>
                </th>
                <th>${escapeHtml(messages.postTitle)}</th>
                <th>${escapeHtml(messages.postContent)}</th>
                <th>${escapeHtml(messages.publishedAt)}</th>
                <th>${escapeHtml(messages.matchedAt)}</th>
                <th>${escapeHtml(messages.matchedKeyword)}</th>
                <th>${escapeHtml(messages.matchLocationHeader)}</th>
                <th class="table-action-cell">
                  <button
                    type="submit"
                    class="icon-button"
                    data-pending-bulk-complete
                    title="${escapeHtml(messages.completeMatch)}"
                    aria-label="${escapeHtml(messages.completeMatch)}"
                  >${checkIcon()}</button>
                </th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          ${renderPagination("/", table, messages)}
        </form>
      `
  }
    </section>
    ${records.length === 0 ? "" : renderPendingScript(messages)}
  `;
}

function renderLastPollScript(messages: ReturnType<typeof getMessages>): string {
  const relativeTemplates = {
    daysAgo: messages.relativeDaysAgo,
    hoursAgo: messages.relativeHoursAgo,
    justNow: messages.relativeJustNow,
    minutesAgo: messages.relativeMinutesAgo,
    secondsAgo: messages.relativeSecondsAgo,
    yesterdayAt: messages.relativeYesterdayAt,
  };

  return `<script>
    (() => {
      const lastPoll = document.querySelector("[data-last-poll-at]");
      if (!lastPoll) return;

      const timestamp = Date.parse(lastPoll.dataset.lastPollAt || "");
      if (!Number.isFinite(timestamp)) return;

      const locale = lastPoll.dataset.lastPollLocale === "en" ? "en" : "zh-CN";
      const relativeTemplates = ${JSON.stringify(relativeTemplates)};
      updateLastPoll();
      window.setInterval(updateLastPoll, 1000);

      function updateLastPoll() {
        lastPoll.textContent = formatRelativeTime(timestamp, locale);
      }

      function formatRelativeTime(value, locale) {
        const date = new Date(value);
        const diffSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000));

        if (diffSeconds === 0) {
          return relativeTemplates.justNow;
        }

        if (diffSeconds < 60) {
          return formatTemplate(relativeTemplates.secondsAgo, { count: diffSeconds });
        }

        const diffMinutes = Math.floor(diffSeconds / 60);
        if (diffMinutes < 60) {
          return formatTemplate(relativeTemplates.minutesAgo, { count: diffMinutes });
        }

        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) {
          return formatTemplate(relativeTemplates.hoursAgo, { count: diffHours });
        }

        if (diffHours < 48) {
          const time = formatInChina(date, { hour: "2-digit", minute: "2-digit" }, locale);
          return formatTemplate(relativeTemplates.yesterdayAt, { time });
        }

        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) {
          return formatTemplate(relativeTemplates.daysAgo, { count: diffDays });
        }

        return formatInChina(
          date,
          sameChinaYear(date, new Date())
            ? { day: "2-digit", month: "2-digit" }
            : { day: "2-digit", month: "2-digit", year: "numeric" },
          locale,
        );
      }

      function formatTemplate(template, values) {
        return template.replaceAll(/\\{(\\w+)\\}/g, (placeholder, key) =>
          values[key] === undefined ? placeholder : String(values[key])
        );
      }

      function sameChinaYear(left, right) {
        return formatInChina(left, { year: "numeric" }) ===
          formatInChina(right, { year: "numeric" });
      }

      function formatInChina(date, options, locale) {
        return new Intl.DateTimeFormat(locale, {
          timeZone: "Asia/Shanghai",
          ...options,
        }).format(date).replaceAll("/", "-");
      }
    })();
  </script>`;
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

function renderTableFilters(
  path: string,
  table: MatchTableResult,
  messages: ReturnType<typeof getMessages>,
): string {
  const isActive = table.range !== "all" || table.from !== "" || table.to !== "";

  return `
    <div class="table-filter-shell">
      <input
        class="filter-toggle-input"
        type="checkbox"
        id="pending-table-filter-toggle"
        ${isActive ? "checked" : ""}
      >
      <label
        class="filter-toggle"
        for="pending-table-filter-toggle"
        title="${escapeHtml(messages.filter)}"
        aria-label="${escapeHtml(messages.filter)}"
      >
        ${filterIcon()}
      </label>
      <form class="table-filter-form" method="get" action="${path}">
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

function option(value: string, current: string, label: string): string {
  return `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${
    escapeHtml(label)
  }</option>`;
}

function checkIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L21 7.6 19.6 6.2 9.2 16.6Z"></path>
  </svg>`;
}

function filterIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z"></path>
  </svg>`;
}

function renderPendingScript(messages: ReturnType<typeof getMessages>): string {
  return `<script>
    (() => {
      const selectAll = document.querySelector("[data-pending-select-all]");
      if (!selectAll) return;
      const section = selectAll.closest(".table-section");
      const bulkComplete = document.querySelector("[data-pending-bulk-complete]");
      const checkboxes = Array.from(document.querySelectorAll("[data-pending-match-checkbox]"));
      selectAll.addEventListener("change", () => {
        for (const checkbox of checkboxes) checkbox.checked = selectAll.checked;
      });
      for (const checkbox of checkboxes) {
        checkbox.addEventListener("change", () => {
          selectAll.checked = checkboxes.length > 0 && checkboxes.every((item) => item.checked);
        });
      }
      bulkComplete?.addEventListener("click", (event) => {
        if (checkboxes.some((item) => item.checked)) return;
        event.preventDefault();
        showTableToast(section, ${JSON.stringify(messages.selectMatchToComplete)});
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
