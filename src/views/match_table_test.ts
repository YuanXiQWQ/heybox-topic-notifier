import type { MatchRecord } from "../models.ts";
import { applyMatchTableQuery, compactPages, parseMatchTableQuery } from "./match_table.ts";

Deno.test("parseMatchTableQuery normalizes unsupported values", () => {
  const query = parseMatchTableQuery(new URLSearchParams("range=bad&page=-1&pageSize=777"));

  assertEquals(query, {
    from: "",
    page: 1,
    pageSize: 10,
    range: "all",
    to: "",
  });
});

Deno.test("applyMatchTableQuery filters by recent matched time and paginates", () => {
  const now = new Date("2026-06-30T12:00:00.000Z");
  const result = applyMatchTableQuery([
    record("1", "2026-06-30T11:59:00.000Z"),
    record("2", "2026-06-30T10:00:00.000Z"),
    record("3", "2026-06-30T11:30:00.000Z"),
  ], {
    from: "",
    page: 1,
    pageSize: 1,
    range: "hour",
    to: "",
  }, now);

  assertEquals(result.records.map((item) => item.id), ["1"]);
  assertEquals(result.totalRecords, 2);
  assertEquals(result.totalPages, 2);
});

Deno.test("applyMatchTableQuery supports custom China-time range", () => {
  const result = applyMatchTableQuery([
    record("inside", "2026-06-30T06:30:00.000Z"),
    record("outside", "2026-06-30T08:30:00.000Z"),
  ], {
    from: "2026-06-30T14:00",
    page: 1,
    pageSize: "all",
    range: "custom",
    to: "2026-06-30T15:00",
  });

  assertEquals(result.records.map((item) => item.id), ["inside"]);
});

Deno.test("compactPages keeps edges and current page vicinity", () => {
  assertEquals(compactPages(8, 20), [1, 2, 3, "...", 7, 8, 9, "...", 19, 20]);
});

function record(id: string, matchedAt: string): MatchRecord {
  return {
    id,
    keyword: "求助",
    location: "title",
    matchedAt,
    post: {
      body: "",
      commentReplies: [],
      comments: [],
      excerpt: "",
      id,
      publishedAt: matchedAt,
      title: id,
      url: `https://example.com/${id}`,
    },
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}
