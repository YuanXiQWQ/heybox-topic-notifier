import { getMessages } from "../locales/index.ts";
import type { Locale } from "../locales/types.ts";

const chinaTimeZone = "Asia/Shanghai";

export function formatHeyboxRelativeTime(
  value: string,
  now: Date = new Date(),
  locale: Locale = "zh-CN",
): string {
  const date = new Date(value);
  const timestamp = date.getTime();

  if (!Number.isFinite(timestamp)) {
    return value || "-";
  }

  const messages = getMessages(locale);
  const diffSeconds = Math.max(0, Math.floor((now.getTime() - timestamp) / 1000));

  if (diffSeconds === 0) {
    return messages.relativeJustNow;
  }

  if (diffSeconds < 60) {
    return formatTemplate(messages.relativeSecondsAgo, { count: diffSeconds });
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return formatTemplate(messages.relativeMinutesAgo, { count: diffMinutes });
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return formatTemplate(messages.relativeHoursAgo, { count: diffHours });
  }

  if (diffHours < 48) {
    return formatTemplate(messages.relativeYesterdayAt, {
      time: formatInChina(date, {
        hour: "2-digit",
        minute: "2-digit",
      }, locale),
    });
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return formatTemplate(messages.relativeDaysAgo, { count: diffDays });
  }

  return formatInChina(
    date,
    sameChinaYear(date, now)
      ? { day: "2-digit", month: "2-digit" }
      : { day: "2-digit", month: "2-digit", year: "numeric" },
    locale,
  );
}

function formatTemplate(template: string, values: Record<string, string | number>): string {
  return template.replaceAll(
    /\{(\w+)\}/g,
    (placeholder, key) => values[key] === undefined ? placeholder : String(values[key]),
  );
}

function sameChinaYear(left: Date, right: Date): boolean {
  return formatInChina(left, { year: "numeric" }) === formatInChina(right, { year: "numeric" });
}

function formatInChina(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  locale: Locale = "zh-CN",
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: chinaTimeZone,
    ...options,
  }).format(date).replaceAll("/", "-");
}
