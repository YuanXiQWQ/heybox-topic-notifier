import { getMessages } from "../locales/index.ts";
import type { AppSettings, AppState, MatchLocation, MatchRecord } from "../models.ts";
import { escapeHtml, renderLayout } from "./html.ts";
import { formatHeyboxRelativeTime } from "./time.ts";

export function renderDashboard(options: {
  pendingMatches: MatchRecord[];
  settings: AppSettings;
  state: AppState;
}): string {
  const messages = getMessages(options.settings.locale);
  const latest = options.state.latestMatch;

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
        <form method="post" action="/test-notify">
          <button type="submit" class="secondary">${escapeHtml(messages.testNotify)}</button>
        </form>
      </div>
    </section>
    <section class="metrics">
      <article>
        <span>${escapeHtml(messages.lastPoll)}</span>
        <strong>${escapeHtml(options.state.lastPollAt ?? "-")}</strong>
      </article>
      <article>
        <span>${escapeHtml(messages.latestMatch)}</span>
        <strong>${escapeHtml(latest?.post.title ?? "-")}</strong>
      </article>
      <article>
        <span>${escapeHtml(messages.totalMatches)}</span>
        <strong>${options.state.totalMatches}</strong>
      </article>
    </section>
    ${renderPendingMatches(options.pendingMatches, messages)}
  `;

  return renderLayout({
    body,
    darkMode: options.settings.darkMode,
    locale: options.settings.locale,
    themeColor: options.settings.themeColor,
    title: messages.appName,
  });
}

function renderPendingMatches(
  records: MatchRecord[],
  messages: ReturnType<typeof getMessages>,
): string {
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
        <button
          type="button"
          class="icon-button"
          title="${escapeHtml(messages.filter)}"
          aria-label="${escapeHtml(messages.filter)}"
        >${filterIcon()}</button>
      </div>
      ${
    records.length === 0 ? `<p>${escapeHtml(messages.emptyPendingPosts)}</p>` : `
        <form method="post" action="/matches/complete">
          <table>
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
                <th>
                  <button
                    type="submit"
                    class="icon-button"
                    title="${escapeHtml(messages.completeMatch)}"
                    aria-label="${escapeHtml(messages.completeMatch)}"
                  >${checkIcon()}</button>
                </th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </form>
      `
  }
    </section>
    ${records.length === 0 ? "" : renderPendingScript()}
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

function renderPendingScript(): string {
  return `<script>
    (() => {
      const selectAll = document.querySelector("[data-pending-select-all]");
      if (!selectAll) return;
      const checkboxes = Array.from(document.querySelectorAll("[data-pending-match-checkbox]"));
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
