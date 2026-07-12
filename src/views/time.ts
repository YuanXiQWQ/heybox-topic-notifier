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

  const diffSeconds = Math.max(0, Math.floor((now.getTime() - timestamp) / 1000));

  if (diffSeconds < 60) {
    if (locale === "en") {
      return `${Math.max(1, diffSeconds)} seconds ago`;
    }
    return `${Math.max(1, diffSeconds)} 秒前`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    if (locale === "en") {
      return `${diffMinutes} minutes ago`;
    }
    return `${diffMinutes} 分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    if (locale === "en") {
      return `${diffHours} hours ago`;
    }
    return `${diffHours} 小时前`;
  }

  if (diffHours < 48) {
    if (locale === "en") {
      return `yesterday ${
        formatInChina(date, {
          hour: "2-digit",
          minute: "2-digit",
        }, locale)
      }`;
    }
    return `昨天 ${
      formatInChina(date, {
        hour: "2-digit",
        minute: "2-digit",
      }, locale)
    }`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    if (locale === "en") {
      return `${diffDays} days ago`;
    }
    return `${diffDays} 天前`;
  }

  return formatInChina(
    date,
    sameChinaYear(date, now)
      ? { day: "2-digit", month: "2-digit" }
      : { day: "2-digit", month: "2-digit", year: "numeric" },
    locale,
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
