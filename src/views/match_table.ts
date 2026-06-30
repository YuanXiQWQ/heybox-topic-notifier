import type { MatchRecord } from "../models.ts";

export type MatchTableRange = "all" | "hour" | "day" | "week" | "custom";
export type MatchTablePageSize = number | "all";

export type MatchTableQuery = {
  from: string;
  page: number;
  pageSize: MatchTablePageSize;
  range: MatchTableRange;
  to: string;
};

export type MatchTableResult = MatchTableQuery & {
  records: MatchRecord[];
  totalPages: number;
  totalRecords: number;
};

const pageSizeOptions = [10, 20, 50, 100, 200, 500] as const;

export function parseMatchTableQuery(params: URLSearchParams): MatchTableQuery {
  const pageSize = parsePageSize(params.get("pageSize"));

  return {
    from: params.get("from") ?? "",
    page: parsePositiveInteger(params.get("page"), 1),
    pageSize,
    range: parseRange(params.get("range")),
    to: params.get("to") ?? "",
  };
}

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
  if (nextQuery.from) {
    params.set("from", nextQuery.from);
  }
  if (nextQuery.to) {
    params.set("to", nextQuery.to);
  }

  return `${path}?${params.toString()}`;
}

export function pageSizeValues(): readonly (number | "all")[] {
  return [...pageSizeOptions, "all"];
}

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

function parseChinaDateTime(value: string, endOfMinute: boolean): Date | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.length === 16 ? `${value}:00` : value;
  const date = new Date(`${normalized}${endOfMinute ? ".999" : ".000"}+08:00`);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function parseRange(value: string | null): MatchTableRange {
  return value === "hour" || value === "day" || value === "week" || value === "custom"
    ? value
    : "all";
}

function parsePageSize(value: string | null): MatchTablePageSize {
  if (value === "all") {
    return "all";
  }

  const pageSize = parsePositiveInteger(value, 10);
  return pageSizeOptions.includes(pageSize as typeof pageSizeOptions[number]) ? pageSize : 10;
}

function parsePositiveInteger(value: string | null, fallback: number): number {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : fallback;
}
