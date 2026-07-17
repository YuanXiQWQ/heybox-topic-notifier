/**
 * @file 本文件负责解析、应用和生成命中记录表格的筛选分页状态。
 */
import type { MatchRecord } from "../models.ts";

/**
 * 表格时间范围筛选类型。
 */
export type MatchTableRange = "all" | "hour" | "day" | "week" | "custom";
/**
 * 表格分页大小类型。
 */
export type MatchTablePageSize = number | "all";

/**
 * 命中记录表格查询状态。
 */
export type MatchTableQuery = {
  filterOpen?: boolean;
  from: string;
  page: number;
  pageSize: MatchTablePageSize;
  range: MatchTableRange;
  to: string;
};

/**
 * 命中记录表格计算结果。
 */
export type MatchTableResult = MatchTableQuery & {
  records: MatchRecord[];
  totalPages: number;
  totalRecords: number;
};

/**
 * 可选的固定分页大小。
 */
const pageSizeOptions = [10, 20, 50, 100, 200, 500] as const;

/**
 * 从 URL 查询参数解析命中记录表格状态。
 *
 * @param params URL 查询参数。
 * @return 规范化后的表格查询状态。
 */
export function parseMatchTableQuery(params: URLSearchParams): MatchTableQuery {
  const pageSize = parsePageSize(params.get("pageSize"));

  return {
    ...(params.get("filterOpen") === "1" ? { filterOpen: true } : {}),
    from: params.get("from") ?? "",
    page: parsePositiveInteger(params.get("page"), 1),
    pageSize,
    range: parseRange(params.get("range")),
    to: params.get("to") ?? "",
  };
}

/**
 * 对命中记录应用表格筛选和分页。
 *
 * @param records 原始命中记录列表。
 * @param query 表格查询状态。
 * @param now 当前时间。
 * @return 表格计算结果。
 */
export function applyMatchTableQuery(
  records: MatchRecord[],
  query: MatchTableQuery,
  now: Date = new Date(),
): MatchTableResult {
  const filteredRecords = filterByRange(records, query, now);
  const pageSize = query.pageSize;
  const totalPages = pageSize === "all"
    ? 1
    : Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const page = pageSize === "all" ? 1 : Math.min(query.page, totalPages);
  const pageRecords = pageSize === "all"
    ? filteredRecords
    : filteredRecords.slice((page - 1) * pageSize, page * pageSize);

  return {
    ...query,
    page,
    records: pageRecords,
    totalPages,
    totalRecords: filteredRecords.length,
  };
}

/**
 * 生成表格数据签名，用于前端判断是否需要替换表格。
 *
 * @param table 表格计算结果。
 * @return 表格签名。
 */
export function matchTableSignature(table: MatchTableResult): string {
  return [
    table.totalRecords,
    table.page,
    table.pageSize,
    table.records.map((record) => record.id).join("|"),
  ].join(":");
}

/**
 * 构建带表格查询参数的链接。
 *
 * @param path 页面路径。
 * @param query 当前表格查询状态。
 * @param overrides 需要覆盖的查询字段。
 * @return 表格链接。
 */
export function buildMatchTableUrl(
  path: string,
  query: MatchTableQuery,
  overrides: Partial<MatchTableQuery>,
): string {
  const nextQuery = { ...query, ...overrides };
  const params = new URLSearchParams();

  params.set("range", nextQuery.range);
  params.set("page", String(nextQuery.page));
  params.set("pageSize", String(nextQuery.pageSize));
  if (nextQuery.filterOpen) {
    params.set("filterOpen", "1");
  }
  if (nextQuery.from) {
    params.set("from", nextQuery.from);
  }
  if (nextQuery.to) {
    params.set("to", nextQuery.to);
  }

  return `${path}?${params.toString()}`;
}

/**
 * 获取可选分页大小列表。
 *
 * @return 分页大小列表。
 */
export function pageSizeValues(): readonly (number | "all")[] {
  return [...pageSizeOptions, "all"];
}

/**
 * 压缩分页页码列表。
 *
 * @param currentPage 当前页码。
 * @param totalPages 总页数。
 * @return 带省略号的页码列表。
 */
export function compactPages(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([
    1,
    2,
    3,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    totalPages - 1,
    totalPages,
  ]);
  const normalized = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .toSorted((left, right) => left - right);
  const result: (number | "...")[] = [];

  for (const page of normalized) {
    const previous = result.at(-1);
    if (typeof previous === "number" && page - previous > 1) {
      result.push("...");
    }
    result.push(page);
  }

  return result;
}

/**
 * 按查询时间范围筛选命中记录。
 *
 * @param records 命中记录列表。
 * @param query 表格查询状态。
 * @param now 当前时间。
 * @return 筛选后的命中记录列表。
 */
function filterByRange(
  records: MatchRecord[],
  query: MatchTableQuery,
  now: Date,
): MatchRecord[] {
  const bounds = rangeBounds(query, now);
  if (!bounds) {
    return records;
  }

  return records.filter((record) => {
    const matchedAt = new Date(record.matchedAt).getTime();
    if (!Number.isFinite(matchedAt)) {
      return false;
    }

    return matchedAt >= bounds.from.getTime() && matchedAt <= bounds.to.getTime();
  });
}

/**
 * 计算查询时间范围边界。
 *
 * @param query 表格查询状态。
 * @param now 当前时间。
 * @return 时间范围边界，全部范围时返回 undefined。
 */
function rangeBounds(
  query: MatchTableQuery,
  now: Date,
): { from: Date; to: Date } | undefined {
  switch (query.range) {
    case "hour":
      return { from: new Date(now.getTime() - 60 * 60 * 1000), to: now };
    case "day":
      return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now };
    case "week":
      return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now };
    case "custom": {
      const from = parseChinaDateTime(query.from, false);
      const to = parseChinaDateTime(query.to, true);
      return from && to ? { from, to } : undefined;
    }
    case "all":
      return undefined;
  }
}

/**
 * 解析中国时区的日期时间输入。
 *
 * @param value 日期时间输入值。
 * @param endOfMinute 是否补到当前分钟末尾。
 * @return 解析后的日期，无法解析时返回 undefined。
 */
function parseChinaDateTime(value: string, endOfMinute: boolean): Date | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.length === 16 ? `${value}:00` : value;
  const date = new Date(`${normalized}${endOfMinute ? ".999" : ".000"}+08:00`);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

/**
 * 解析表格时间范围。
 *
 * @param value 原始范围参数。
 * @return 合法时间范围。
 */
function parseRange(value: string | null): MatchTableRange {
  return value === "hour" || value === "day" || value === "week" || value === "custom"
    ? value
    : "all";
}

/**
 * 解析表格分页大小。
 *
 * @param value 原始分页大小参数。
 * @return 合法分页大小。
 */
function parsePageSize(value: string | null): MatchTablePageSize {
  if (value === "all") {
    return "all";
  }

  const pageSize = parsePositiveInteger(value, 10);
  return pageSizeOptions.includes(pageSize as typeof pageSizeOptions[number]) ? pageSize : 10;
}

/**
 * 解析正整数参数。
 *
 * @param value 原始参数值。
 * @param fallback 兜底值。
 * @return 合法正整数。
 */
function parsePositiveInteger(value: string | null, fallback: number): number {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : fallback;
}
