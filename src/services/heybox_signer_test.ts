import { buildHkey } from "./heybox_signer.ts";

Deno.test("buildHkey matches captured Heybox topic feed request", () => {
  const hkey = buildHkey(
    "/bbs/app/topic/feeds",
    1782848432,
    "E65BCD34EDC1167882EA3E44BF10F8CE",
  );

  assertEquals(hkey, "T33YT09");
});

Deno.test("buildHkey matches captured Heybox topic menu request", () => {
  const hkey = buildHkey(
    "/bbs/app/topic/menu",
    1782848432,
    "5218527D078077C1357DC50BDC7DD9F3",
  );

  assertEquals(hkey, "SZ3T237");
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}
