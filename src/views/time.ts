/**
 * @file 本文件提供小黑盒帖子时间的相对时间格式化能力。
 */
import { getMessages } from "../locales/index.ts";
import type { Locale } from "../locales/types.ts";

/**
 * 小黑盒帖子时间展示使用的中国时区。
 */
const chinaTimeZone = "Asia/Shanghai";

/**
 * 将时间格式化为小黑盒风格的相对时间。
 *
 * @param value 原始时间字符串。
 * @param now 当前时间。
 * @param locale 文案语言。
 * @return 格式化后的相对时间文本。
 */
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
    sameChinaYear(date, now, locale)
      ? { day: "2-digit", month: "2-digit" }
      : { day: "2-digit", month: "2-digit", year: "numeric" },
    locale,
  );
}

/**
 * 使用键值替换相对时间文案模板。
 *
 * @param template 文案模板。
 * @param values 替换变量映射。
 * @return 替换后的文案。
 */
function formatTemplate(template: string, values: Record<string, string | number>): string {
  return template.replaceAll(
    /\{(\w+)}/g,
    (placeholder, key) => values[key] === undefined ? placeholder : String(values[key]),
  );
}

/**
 * 判断两个时间在中国时区下是否属于同一年。
 *
 * @param left 左侧时间。
 * @param right 右侧时间。
 * @param locale 文案语言。
 * @return 同一年时返回 true。
 */
function sameChinaYear(left: Date, right: Date, locale: Locale): boolean {
  return formatInChina(left, { year: "numeric" }, locale) ===
    formatInChina(right, { year: "numeric" }, locale);
}

/**
 * 按中国时区格式化日期。
 *
 * @param date 待格式化日期。
 * @param options 日期格式化选项。
 * @param locale 文案语言。
 * @return 格式化后的日期字符串。
 */
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
