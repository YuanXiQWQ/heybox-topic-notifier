import { getMessages } from "../locales/index.ts";
import type { AppSettings, AppState } from "../models.ts";
import { escapeHtml, renderLayout } from "./html.ts";
import type { MatchTableResult } from "./match_table.ts";
import { renderMatchRecordsSection } from "./match_table_view.ts";
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
        <form method="post" action="/simulate-match">
          <button type="submit" class="secondary">${escapeHtml(messages.simulateMatch)}</button>
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
        <strong data-latest-match>${
    latest
      ? `<a class="metric-link" href="${escapeHtml(latest.post.url)}">${
        escapeHtml(latest.post.title)
      }</a>`
      : "-"
  }</strong>
      </article>
      <article>
        <span>${escapeHtml(messages.totalMatches)}</span>
        <strong data-total-matches>${options.state.totalMatches}</strong>
      </article>
    </section>
    ${renderPendingMatches(options.pendingTable, messages, options.settings.locale)}
    ${renderLastPollScript(messages)}
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
    return `<strong data-last-poll-at="" data-last-poll-locale="${escapeHtml(locale)}">-</strong>`;
  }

  return `<strong data-last-poll-at="${escapeHtml(lastPollAt)}" data-last-poll-locale="${
    escapeHtml(locale)
  }">${escapeHtml(formatHeyboxRelativeTime(lastPollAt, new Date(), locale))}</strong>`;
}

export function renderPendingMatches(
  table: MatchTableResult,
  messages: ReturnType<typeof getMessages>,
  locale: AppSettings["locale"],
): string {
  return renderMatchRecordsSection({
    action: {
      bulkButtonAttribute: "data-pending-bulk-complete",
      emptySelectionMessage: messages.selectMatchToComplete,
      icon: checkIcon(),
      label: messages.completeMatch,
      rowCheckboxAttribute: "data-pending-match-checkbox",
      selectAllAttribute: "data-pending-select-all",
    },
    emptyMessage: messages.emptyPendingPosts,
    filterToggleId: "pending-table-filter-toggle",
    formAction: "/matches/complete",
    heading: messages.pendingPosts,
    headingId: "pending-posts-heading",
    locale,
    messages,
    path: "/",
    table,
    titleLinkClass: "pending-title-link",
  });
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

      const latestMatch = document.querySelector("[data-latest-match]");
      let pendingSection = document.querySelector(".table-section");
      const totalMatches = document.querySelector("[data-total-matches]");
      let timestamp = parseTimestamp(lastPoll.dataset.lastPollAt);

      const locale = lastPoll.dataset.lastPollLocale === "en" ? "en" : "zh-CN";
      const relativeTemplates = ${JSON.stringify(relativeTemplates)};
      void refreshDashboardState();
      updateLastPoll();
      window.setInterval(updateLastPoll, 1000);
      window.setInterval(() => {
        void refreshDashboardState();
      }, 1000);

      function updateLastPoll() {
        if (!Number.isFinite(timestamp)) {
          lastPoll.textContent = "-";
          return;
        }
        lastPoll.textContent = formatRelativeTime(timestamp, locale);
      }

      async function refreshDashboardState() {
        try {
          const response = await fetch(\`/dashboard-state\${location.search}\`, { cache: "no-store" });
          if (!response.ok) return;
          const state = await response.json();
          const nextTimestamp = parseTimestamp(state.lastPollAt);
          if (Number.isFinite(nextTimestamp) && nextTimestamp !== timestamp) {
            timestamp = nextTimestamp;
            lastPoll.dataset.lastPollAt = state.lastPollAt;
            updateLastPoll();
          }
          updateLatestMatch(state.latestMatch);
          if (totalMatches && Number.isInteger(state.totalMatches)) {
            totalMatches.textContent = String(state.totalMatches);
          }
          updatePendingSection(state.pendingHtml, state.pendingSignature);
        } catch {
          // Keep the last rendered state when the status request is transiently unavailable.
        }
      }

      function updatePendingSection(html, signature) {
        if (!pendingSection || typeof html !== "string" || typeof signature !== "string") return;
        if (pendingSection.dataset.matchTableSignature === signature) return;
        const parsed = new DOMParser().parseFromString(html, "text/html");
        const nextSection = parsed.querySelector(".table-section");
        if (!nextSection) return;
        pendingSection.replaceWith(nextSection);
        pendingSection = nextSection;
      }

      function updateLatestMatch(match) {
        if (!latestMatch) return;
        latestMatch.textContent = "";
        if (!match) {
          latestMatch.textContent = "-";
          return;
        }
        const link = document.createElement("a");
        link.className = "metric-link";
        link.href = match.url;
        link.textContent = match.title;
        latestMatch.append(link);
      }

      function parseTimestamp(value) {
        const parsed = Date.parse(value || "");
        return Number.isFinite(parsed) ? parsed : NaN;
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

function checkIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L21 7.6 19.6 6.2 9.2 16.6Z"></path>
  </svg>`;
}
