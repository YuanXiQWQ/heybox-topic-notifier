/**
 * @file 本文件负责渲染仪表盘页面和轮询进度交互脚本。
 */
import { getMessages } from "../locales/index.ts";
import type { AppSettings, AppState, PollIntervalUnit } from "../models.ts";
import { csrfHiddenInput } from "../security/csrf.ts";
import { escapeHtml, renderLayout } from "./html.ts";
import type { MatchTableResult } from "./match_table.ts";
import { renderMatchRecordsSection } from "./match_table_view.ts";
import { formatHeyboxRelativeTime } from "./time.ts";

/**
 * 渲染仪表盘页面。
 *
 * @param options 仪表盘渲染选项。
 * @return 完整仪表盘页面 HTML。
 */
export function renderDashboard(options: {
  csrfToken: string;
  initialNextPollProgress?: string;
  pendingTable: MatchTableResult;
  returnTo: string;
  settings: AppSettings;
  state: AppState;
}): string {
  const messages = getMessages(options.settings.locale);
  const latest = options.state.latestMatch;
  const lastPollAt = options.state.lastPollAt;
  const nextPollProgress = options.initialNextPollProgress ??
    nextPollProgressPercent(options.settings, lastPollAt);

  const body = `
    <section class="page-heading">
      <div>
        <h1>${escapeHtml(messages.dashboardTitle)}</h1>
      </div>
      <div class="actions">
        <form method="post" action="/run-now">
          ${csrfHiddenInput(options.csrfToken)}
          <input type="hidden" name="returnTo" value="${
    escapeHtml(options.returnTo)
  }">
          <input type="hidden" name="pollResetStart" value="" data-poll-reset-start>
          <button type="submit">${escapeHtml(messages.runNow)}</button>
        </form>
        <form method="post" action="/simulate-match">
          ${csrfHiddenInput(options.csrfToken)}
          <input type="hidden" name="returnTo" value="${
    escapeHtml(options.returnTo)
  }">
          <button type="submit" class="secondary">${
    escapeHtml(messages.simulateMatch)
  }</button>
        </form>
      </div>
    </section>
    <section class="metrics">
      <form class="metric-panel-item" method="post" action="/run-now">
        ${csrfHiddenInput(options.csrfToken)}
        <input type="hidden" name="returnTo" value="${
    escapeHtml(options.returnTo)
  }">
        <input type="hidden" name="pollResetStart" value="" data-poll-reset-start>
        <button class="metric-panel-control" type="submit">
          <span class="metric-label">${escapeHtml(messages.lastPoll)}</span>
          ${renderLastPoll(lastPollAt, options.settings.locale)}
        </button>
      </form>
      <div class="metric-panel-item">
        <a
          class="metric-panel-control${latest ? "" : " is-disabled"}"
          data-latest-match-link
          href="${latest ? escapeHtml(latest.post.url) : ""}"
          target="_blank"
          rel="noopener noreferrer"
          ${latest ? "" : 'aria-disabled="true" tabindex="-1"'}
        >
          <span class="metric-label">${escapeHtml(messages.latestMatch)}</span>
          <strong data-latest-match>${
    latest ? escapeHtml(latest.post.title) : "-"
  }</strong>
        </a>
      </div>
      <div class="metric-panel-item">
        <a class="metric-panel-control" href="/history">
          <span class="metric-label">${escapeHtml(messages.totalMatches)}</span>
          <strong data-total-matches>${options.state.totalMatches}</strong>
        </a>
      </div>
    </section>
    <section
      class="next-poll-panel"
      data-next-poll-panel
      data-poll-enabled="${options.settings.polling.enabled ? "true" : "false"}"
      data-poll-interval-unit="${
    escapeHtml(options.settings.polling.intervalUnit)
  }"
      data-poll-interval-value="${options.settings.polling.intervalValue}"
    >
      <div class="next-poll-meta">
        <h2>${escapeHtml(messages.nextPoll)}</h2>
        <strong data-next-poll-remaining>-</strong>
      </div>
      <div class="next-poll-track" aria-hidden="true">
        <div class="next-poll-fill" data-next-poll-fill style="width: ${nextPollProgress}%"></div>
      </div>
    </section>
    ${
    renderPendingMatches(
      options.pendingTable,
      messages,
      options.settings.locale,
      options.csrfToken,
    )
  }
    ${renderLastPollScript(messages)}
  `;

  return renderLayout({
    body,
    csrfToken: options.csrfToken,
    darkMode: options.settings.darkMode,
    locale: options.settings.locale,
    themeColor: options.settings.themeColor,
    title: messages.appName,
  });
}

/**
 * 渲染最后轮询时间展示。
 *
 * @param lastPollAt 最后轮询时间。
 * @param locale 当前语言标识。
 * @return 最后轮询时间 HTML。
 */
function renderLastPoll(
  lastPollAt: string | undefined,
  locale: AppSettings["locale"],
): string {
  if (!lastPollAt) {
    return `<strong data-last-poll-at="" data-last-poll-locale="${
      escapeHtml(locale)
    }">-</strong>`;
  }

  return `<strong data-last-poll-at="${
    escapeHtml(lastPollAt)
  }" data-last-poll-locale="${escapeHtml(locale)}">${
    escapeHtml(formatHeyboxRelativeTime(lastPollAt, new Date(), locale))
  }</strong>`;
}

/**
 * 渲染待处理命中记录表格。
 *
 * @param table 待处理表格数据。
 * @param messages 当前语言文案。
 * @param locale 当前语言标识。
 * @param csrfToken CSRF 令牌。
 * @return 待处理命中记录表格 HTML。
 */
export function renderPendingMatches(
  table: MatchTableResult,
  messages: ReturnType<typeof getMessages>,
  locale: AppSettings["locale"],
  csrfToken: string,
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
    csrfToken,
    locale,
    messages,
    path: "/",
    table,
    titleLinkClass: "pending-title-link",
  });
}

/**
 * 渲染仪表盘最后轮询时间和下次轮询进度脚本。
 *
 * @param messages 当前语言文案。
 * @return 仪表盘交互脚本 HTML。
 */
function renderLastPollScript(
  messages: ReturnType<typeof getMessages>,
): string {
  const relativeTemplates = {
    daysAgo: messages.relativeDaysAgo,
    hoursAgo: messages.relativeHoursAgo,
    justNow: messages.relativeJustNow,
    minutesAgo: messages.relativeMinutesAgo,
    secondsAgo: messages.relativeSecondsAgo,
    yesterdayAt: messages.relativeYesterdayAt,
  };
  const pollUnitLabels = {
    day: messages.pollIntervalDay,
    hour: messages.pollIntervalHour,
    minute: messages.pollIntervalMinute,
    month: messages.pollIntervalMonth,
    second: messages.pollIntervalSecond,
    week: messages.pollIntervalWeek,
  };
  /**
   * 仪表盘状态后台刷新间隔。
   */
  const dashboardStateRefreshMs = 30_000;

  return `<script>
    (() => {
      const lastPoll = document.querySelector("[data-last-poll-at]");
      if (!lastPoll) return;

      const latestMatch = document.querySelector("[data-latest-match]");
      const latestMatchLink = document.querySelector("[data-latest-match-link]");
      const nextPollPanel = document.querySelector("[data-next-poll-panel]");
      const nextPollFill = document.querySelector("[data-next-poll-fill]");
      const nextPollRemaining = document.querySelector("[data-next-poll-remaining]");
      let pendingSection = document.querySelector(".table-section");
      const totalMatches = document.querySelector("[data-total-matches]");
      let resetAnimationTimers = [];
      let timestamp = parseTimestamp(lastPoll.dataset.lastPollAt);
      let hasSyncedDashboardState = false;
      let isAnimatingNextPollReset = false;
      let isDashboardStateRefreshInFlight = false;
      let lastDueDashboardRefreshAt = 0;
      let lastDueDashboardRefreshBaseline = "";

      const locale = lastPoll.dataset.lastPollLocale || "zh-CN";
      const relativeTemplates = ${JSON.stringify(relativeTemplates)};
      const pollUnitLabels = ${JSON.stringify(pollUnitLabels)};
      const dashboardStateRefreshMs = ${dashboardStateRefreshMs};
      const nextPollResetAnimationMs = 440;
      const pollResetStorageKey = "heybox.nextPollResetWidth";
      const initialPollResetStartWidth = consumeInitialPollResetStartWidth();
      bindRunNowResetCapture();
      void refreshDashboardState();
      updateLastPoll();
      if (initialPollResetStartWidth === null) {
        updateNextPoll({ instant: true });
      } else {
        animateNextPollReset({
          preserveExistingFill: true,
          startWidth: initialPollResetStartWidth,
        });
      }
      window.setInterval(updateLastPoll, 1000);
      window.setInterval(updateNextPoll, 250);
      window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void refreshDashboardState();
      }, dashboardStateRefreshMs);

      function updateLastPoll() {
        if (!Number.isFinite(timestamp)) {
          lastPoll.textContent = "-";
          return;
        }
        lastPoll.textContent = formatRelativeTime(timestamp, locale);
      }

      async function refreshDashboardState(options = {}) {
        if (isDashboardStateRefreshInFlight) return;
        isDashboardStateRefreshInFlight = true;
        try {
          const response = await fetch(
            dashboardStateUrl(options.tick ? "/dashboard-state/tick" : "/dashboard-state"),
            options.tick
              ? { cache: "no-store", headers: csrfRequestHeaders(), method: "POST" }
              : { cache: "no-store" },
          );
          if (!response.ok) return;
          const state = await response.json();
          const nextTimestamp = parseTimestamp(state.lastPollAt);
          if (Number.isFinite(nextTimestamp) && nextTimestamp !== timestamp) {
            timestamp = nextTimestamp;
            lastPoll.dataset.lastPollAt = state.lastPollAt;
            updateLastPoll();
            if (hasSyncedDashboardState) {
              animateNextPollReset({ preserveExistingFill: false });
            } else {
              updateNextPoll({ instant: true });
            }
          }
          updateLatestMatch(state.latestMatch);
          if (totalMatches && Number.isInteger(state.totalMatches)) {
            totalMatches.textContent = String(state.totalMatches);
          }
          updatePollingSettings(state.polling);
          updatePendingSection(state.pendingHtml, state.pendingSignature);
          hasSyncedDashboardState = true;
        } catch {
          // Keep the last rendered state when the status request is transiently unavailable.
        } finally {
          isDashboardStateRefreshInFlight = false;
        }
      }

      function dashboardStateUrl(pathname = "/dashboard-state") {
        const url = new URL(pathname, location.origin);
        const currentParams = new URLSearchParams(location.search);
        for (const [key, value] of currentParams) {
          url.searchParams.append(key, value);
        }
        return url.pathname + url.search;
      }

      /**
       * 构建包含 CSRF 令牌的轮询触发请求头。
       *
       * @return {Record<string, string>} 请求头。
       */
      function csrfRequestHeaders() {
        const token = currentCsrfToken();
        return token ? { "x-csrf-token": token } : {};
      }

      /**
       * 从当前页面隐藏字段读取 CSRF 令牌。
       *
       * @return {string} 当前页面 CSRF 令牌。
       */
      function currentCsrfToken() {
        const input = document.querySelector('input[name="csrfToken"]');
        return input instanceof HTMLInputElement ? input.value : "";
      }

      function updatePendingSection(html, signature) {
        if (!pendingSection || typeof html !== "string" || typeof signature !== "string") return;
        if (pendingSection.dataset.matchTableSignature === signature) return;
        const parsed = new DOMParser().parseFromString(html, "text/html");
        const nextSection = parsed.querySelector(".table-section");
        if (!nextSection) return;
        pendingSection.replaceWith(nextSection);
        pendingSection = nextSection;
        window["__matchTableFilterInit"]?.();
        window["__matchTableRelativeTimeUpdate"]?.();
        window["__matchTableOverflowUpdate"]?.();
      }

      function updatePollingSettings(polling) {
        if (!nextPollPanel || !polling) return;
        nextPollPanel.dataset.pollEnabled = polling.enabled ? "true" : "false";
        nextPollPanel.dataset.pollIntervalUnit = polling.intervalUnit || "";
        nextPollPanel.dataset.pollIntervalValue = String(polling.intervalValue || "");
        updateNextPoll({ instant: !hasSyncedDashboardState && !isAnimatingNextPollReset });
      }

      function updateNextPoll(options = {}) {
        if (!nextPollPanel || !nextPollFill || !nextPollRemaining) return;
        if (options.instant && !isAnimatingNextPollReset) {
          updateNextPollWithoutTransition();
          return;
        }
        const nextState = getNextPollState();
        if (!nextState) return;
        if (!isAnimatingNextPollReset) {
          nextPollFill.style.width = nextState.width;
        }
        nextPollRemaining.textContent = nextState.remaining;
        refreshDashboardWhenPollDue(nextState);
      }

      function getNextPollState(options = {}) {
        if (!nextPollPanel || !nextPollFill || !nextPollRemaining) return null;
        const enabled = nextPollPanel.dataset.pollEnabled === "true";
        const unit = nextPollPanel.dataset.pollIntervalUnit || "minute";
        const value = Number(nextPollPanel.dataset.pollIntervalValue || "0");
        const intervalMs = pollingIntervalMs(unit, value);

        if (!enabled || !Number.isFinite(timestamp) || intervalMs <= 0) {
          return { intervalMs: 0, remaining: "-", remainingMs: Infinity, width: "0%" };
        }

        const elapsedMs = Math.max(0, Date.now() + (options.offsetMs || 0) - timestamp);
        const remainingMs = Math.max(0, intervalMs - elapsedMs);
        const progress = Math.max(0, Math.min(1, remainingMs / intervalMs));
        return {
          intervalMs,
          remaining: formatRemaining(remainingMs),
          remainingMs,
          width: (progress * 100).toFixed(2) + "%",
        };
      }

      function refreshDashboardWhenPollDue(nextState) {
        if (document.visibilityState !== "visible" || nextState.remainingMs > 0) return;
        if (isDashboardStateRefreshInFlight) return;
        const baseline = lastPoll.dataset.lastPollAt || "";
        if (!baseline) return;
        const now = Date.now();
        const retryMs = Math.max(3000, Math.min(nextState.intervalMs, dashboardStateRefreshMs));
        if (
          lastDueDashboardRefreshBaseline === baseline &&
          now - lastDueDashboardRefreshAt < retryMs
        ) {
          return;
        }
        lastDueDashboardRefreshBaseline = baseline;
        lastDueDashboardRefreshAt = now;
        void refreshDashboardState({ tick: true });
      }

      function updateNextPollWithoutTransition() {
        const transition = nextPollFill.style.transition;
        const wasAnimating = isAnimatingNextPollReset;
        nextPollFill.style.transition = "none";
        isAnimatingNextPollReset = false;
        updateNextPoll();
        isAnimatingNextPollReset = wasAnimating;
        nextPollFill.getBoundingClientRect();
        requestAnimationFrame(() => {
          nextPollFill.style.transition = transition;
        });
      }

      function animateNextPollReset(options = {}) {
        if (!nextPollFill || !nextPollRemaining) return;
        for (const timer of resetAnimationTimers) clearTimeout(timer);
        resetAnimationTimers = [];
        const textState = getNextPollState();
        const targetState = getNextPollState({ offsetMs: nextPollResetAnimationMs });
        if (!textState || !targetState) return;
        isAnimatingNextPollReset = true;
        nextPollFill.classList.add("is-resetting", "is-jump");
        if (!options.preserveExistingFill) {
          nextPollFill.classList.add("is-resetting-from-left");
        }
        nextPollFill.style.transform = "";
        if (options.preserveExistingFill) {
          nextPollFill.style.width = normalizePollWidth(options.startWidth) ||
            normalizePollWidth(nextPollFill.style.width) ||
            "0%";
        } else {
          nextPollFill.style.transform = "translateX(0)";
          nextPollFill.style.width = "0%";
        }
        nextPollRemaining.textContent = textState.remaining;
        nextPollFill.getBoundingClientRect();
        nextPollFill.classList.remove("is-jump");
        requestAnimationFrame(() => {
          nextPollFill.style.width = targetState.width;
          if (!options.preserveExistingFill) {
            const targetPercent = pollWidthPercent(targetState.width);
            const targetShift = targetPercent > 0 ? ((100 - targetPercent) / targetPercent) * 100 : 0;
            nextPollFill.style.transform = \`translateX(\${targetShift.toFixed(2)}%)\`;
          }
          const nextTextState = getNextPollState();
          if (nextTextState) {
            nextPollRemaining.textContent = nextTextState.remaining;
          }
        });
        resetAnimationTimers.push(setTimeout(() => {
          const finalState = getNextPollState();
          nextPollFill.classList.add("is-jump");
          isAnimatingNextPollReset = false;
          nextPollFill.style.transform = "";
          if (finalState) {
            nextPollFill.style.width = finalState.width;
            nextPollRemaining.textContent = finalState.remaining;
          }
          nextPollFill.classList.remove("is-resetting");
          nextPollFill.classList.remove("is-resetting-from-left");
          nextPollFill.getBoundingClientRect();
          requestAnimationFrame(() => {
            nextPollFill.classList.remove("is-jump");
            updateNextPoll();
          });
        }, nextPollResetAnimationMs + 40));
      }

      function bindRunNowResetCapture() {
        if (!nextPollFill) return;
        document.querySelectorAll('form[action="/run-now"]').forEach((runNowForm) => {
          const resetStartInput = runNowForm.querySelector("[data-poll-reset-start]");
          runNowForm.addEventListener("submit", () => {
            const width = normalizePollWidth(nextPollFill.style.width) || "0%";
            if (resetStartInput) {
              resetStartInput.value = width.replace("%", "");
            }
            try {
              sessionStorage.setItem(pollResetStorageKey, width);
            } catch {
              // The reset animation can still fall back to an empty bar.
            }
          });
        });
      }

      function consumeInitialPollResetStartWidth() {
        const url = new URL(location.href);
        if (url.searchParams.get("pollReset") !== "1") return null;
        const startWidthFromUrl = normalizePollWidth(url.searchParams.get("pollResetStart") + "%");
        url.searchParams.delete("pollReset");
        url.searchParams.delete("pollResetStart");
        const search = url.searchParams.toString();
        history.replaceState(history.state, "", url.pathname + (search ? "?" + search : "") + url.hash);
        if (startWidthFromUrl) {
          try {
            sessionStorage.removeItem(pollResetStorageKey);
          } catch {
            // Ignore storage cleanup when storage is unavailable.
          }
          return startWidthFromUrl;
        }
        try {
          const startWidth = sessionStorage.getItem(pollResetStorageKey);
          sessionStorage.removeItem(pollResetStorageKey);
          return normalizePollWidth(startWidth) || "0%";
        } catch {
          return "0%";
        }
      }

      function normalizePollWidth(value) {
        const match = String(value || "").trim().match(/^(\\d+(?:\\.\\d+)?)%$/);
        if (!match) return null;
        const width = Math.max(0, Math.min(100, Number(match[1])));
        if (!Number.isFinite(width)) return null;
        return width.toFixed(2) + "%";
      }

      function pollWidthPercent(value) {
        const normalized = normalizePollWidth(value);
        return normalized ? Number(normalized.replace("%", "")) : 0;
      }

      function formatRemaining(remainingMs) {
        const unit = remainingUnit(remainingMs);
        const unitMs = pollingUnitMs(unit);
        const count = Math.max(0, Math.ceil(remainingMs / unitMs));
        const label = pollUnitLabels[unit] || pollUnitLabels.minute;
        return \`\${count} \${label}\`;
      }

      function remainingUnit(remainingMs) {
        if (remainingMs < pollingUnitMs("minute")) return "second";
        if (remainingMs < pollingUnitMs("hour")) return "minute";
        if (remainingMs < pollingUnitMs("day")) return "hour";
        if (remainingMs < pollingUnitMs("week")) return "day";
        if (remainingMs < pollingUnitMs("month")) return "week";
        return "month";
      }

      function pollingIntervalMs(unit, value) {
        const intervalValue = Math.max(1, Number.isFinite(value) ? value : 1);
        if (unit === "second") return Math.max(3, intervalValue) * 1000;
        return intervalValue * pollingUnitMs(unit);
      }

      function pollingUnitMs(unit) {
        switch (unit) {
          case "second":
            return 1000;
          case "hour":
            return 60 * 60 * 1000;
          case "day":
            return 24 * 60 * 60 * 1000;
          case "week":
            return 7 * 24 * 60 * 60 * 1000;
          case "month":
            return 30 * 24 * 60 * 60 * 1000;
          case "minute":
          default:
            return 60 * 1000;
        }
      }

      function updateLatestMatch(match) {
        if (!latestMatch) return;
        latestMatch.textContent = "";
        if (!match) {
          latestMatch.textContent = "-";
          updateLatestMatchLink(null);
          return;
        }
        latestMatch.textContent = match.title;
        updateLatestMatchLink(match.url);
      }

      function updateLatestMatchLink(url) {
        if (!(latestMatchLink instanceof HTMLAnchorElement)) return;
        if (!url) {
          latestMatchLink.classList.add("is-disabled");
          latestMatchLink.href = "";
          latestMatchLink.setAttribute("aria-disabled", "true");
          latestMatchLink.tabIndex = -1;
          return;
        }
        latestMatchLink.classList.remove("is-disabled");
        latestMatchLink.href = url;
        latestMatchLink.removeAttribute("aria-disabled");
        latestMatchLink.removeAttribute("tabindex");
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
          sameChinaYear(date, new Date(), locale)
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

      function sameChinaYear(left, right, locale) {
        return formatInChina(left, { year: "numeric" }, locale) ===
          formatInChina(right, { year: "numeric" }, locale);
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

/**
 * 计算下次轮询进度条初始百分比。
 *
 * @param settings 应用设置。
 * @param lastPollAt 最后轮询时间。
 * @return 进度百分比字符串。
 */
function nextPollProgressPercent(
  settings: AppSettings,
  lastPollAt: string | undefined,
): string {
  const timestamp = Date.parse(lastPollAt ?? "");
  const intervalMs = dashboardPollingIntervalMs(
    settings.polling.intervalUnit,
    settings.polling.intervalValue,
  );

  if (
    !settings.polling.enabled || !Number.isFinite(timestamp) || intervalMs <= 0
  ) {
    return "0";
  }

  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const remainingMs = Math.max(0, intervalMs - elapsedMs);
  const progress = Math.max(0, Math.min(1, remainingMs / intervalMs));
  return (progress * 100).toFixed(2);
}

/**
 * 计算仪表盘轮询间隔毫秒数。
 *
 * @param unit 轮询间隔单位。
 * @param value 轮询间隔数值。
 * @return 轮询间隔毫秒数。
 */
function dashboardPollingIntervalMs(
  unit: PollIntervalUnit,
  value: number,
): number {
  const intervalValue = Math.max(1, Number.isFinite(value) ? value : 1);
  if (unit === "second") {
    return Math.max(3, intervalValue) * 1000;
  }
  return intervalValue * dashboardPollingUnitMs(unit);
}

/**
 * 获取轮询单位对应的毫秒数。
 *
 * @param unit 轮询间隔单位。
 * @return 单位毫秒数。
 */
function dashboardPollingUnitMs(unit: PollIntervalUnit): number {
  switch (unit) {
    case "second":
      return 1000;
    case "hour":
      return 60 * 60 * 1000;
    case "day":
      return 24 * 60 * 60 * 1000;
    case "week":
      return 7 * 24 * 60 * 60 * 1000;
    case "month":
      return 30 * 24 * 60 * 60 * 1000;
    case "minute":
    default:
      return 60 * 1000;
  }
}

/**
 * 渲染完成操作图标。
 *
 * @return 完成图标 SVG。
 */
function checkIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L21 7.6 19.6 6.2 9.2 16.6Z"></path>
  </svg>`;
}
