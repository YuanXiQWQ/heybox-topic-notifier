const chinaTimeZone = "Asia/Shanghai";

export function formatHeyboxRelativeTime(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  const timestamp = date.getTime();

  if (!Number.isFinite(timestamp)) {
    return value || "-";
  }

  const diffSeconds = Math.max(0, Math.floor((now.getTime() - timestamp) / 1000));

  if (diffSeconds < 60) {
    return `${Math.max(1, diffSeconds)} 秒前`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }

  if (diffHours < 48) {
    return `昨天 ${
      formatInChina(date, {
        hour: "2-digit",
        minute: "2-digit",
      })
    }`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} 天前`;
  }

  return formatInChina(
    date,
    sameChinaYear(date, now)
      ? { day: "2-digit", month: "2-digit" }
      : { day: "2-digit", month: "2-digit", year: "numeric" },
  );
}

function sameChinaYear(left: Date, right: Date): boolean {
  return formatInChina(left, { year: "numeric" }) === formatInChina(right, { year: "numeric" });
}

function formatInChina(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: chinaTimeZone,
    ...options,
  }).format(date).replaceAll("/", "-");
}
