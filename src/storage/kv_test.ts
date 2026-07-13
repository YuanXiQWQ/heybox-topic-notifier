import type { MatchRecord } from "../models.ts";
import { latestMatchByMatchedTime } from "./kv.ts";

Deno.test("latestMatchByMatchedTime prefers the newest match before post time", () => {
  const olderMatchNewerPost = record("older-match-newer-post", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T12:00:00.000Z",
  });
  const newerMatchOlderPost = record("newer-match-older-post", {
    matchedAt: "2026-07-12T11:00:00.000Z",
    publishedAt: "2026-07-12T09:00:00.000Z",
  });

  assertEquals(
    latestMatchByMatchedTime([olderMatchNewerPost, newerMatchOlderPost])?.id,
    "newer-match-older-post",
  );
});

Deno.test("latestMatchByMatchedTime uses post time within the same match batch", () => {
  const olderPost = record("older-post", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T09:00:00.000Z",
  });
  const newerPost = record("newer-post", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T12:00:00.000Z",
  });

  assertEquals(latestMatchByMatchedTime([olderPost, newerPost])?.id, "newer-post");
});

function record(
  id: string,
  options: { matchedAt: string; publishedAt: string },
): MatchRecord {
  return {
    id,
    keyword: "keyword",
    location: "title",
    matchedAt: options.matchedAt,
    post: {
      body: "",
      commentReplies: [],
      comments: [],
      excerpt: "",
      id,
      publishedAt: options.publishedAt,
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
