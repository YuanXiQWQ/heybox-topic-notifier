import { getMessages } from "../locales/index.ts";
import type { AppSettings, MatchLocation, MatchRecord } from "../models.ts";
import { escapeHtml, renderLayout } from "./html.ts";

export function renderHistory(options: {
  history: MatchRecord[];
  settings: AppSettings;
}): string {
  const messages = getMessages(options.settings.locale);
  const rows = options.history.map((record) => `
    <tr>
      <td><a href="${escapeHtml(record.post.url)}">${escapeHtml(record.post.title)}</a></td>
      <td>${escapeHtml(record.keyword)}</td>
      <td>${escapeHtml(locationLabel(record.location, messages))}</td>
      <td>${escapeHtml(record.matchedAt)}</td>
    </tr>
  `).join("");

  const body = `
    <section class="page-heading">
      <div>
        <h1>${escapeHtml(messages.historyTitle)}</h1>
        <p>${escapeHtml(messages.sourceMock)}</p>
      </div>
    </section>
    ${
    options.history.length === 0 ? `<p>${escapeHtml(messages.emptyHistory)}</p>` : `
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(messages.latestMatch)}</th>
            <th>${escapeHtml(messages.matchedKeyword)}</th>
            <th>${escapeHtml(messages.matchLocationHeader)}</th>
            <th>${escapeHtml(messages.lastPoll)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `
  }
  `;

  return renderLayout({
    body,
    locale: options.settings.locale,
    title: messages.historyTitle,
  });
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
