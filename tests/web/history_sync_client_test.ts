/** @file 验证历史增量刷新保留选择、复用版本并拒绝提交期间的旧响应。 */
import { runInNewContext } from "node:vm";
import { assertEquals } from "@std/assert";

Deno.test("history sync preserves selection and rejects responses during edits", async () => {
  const source = await Deno.readTextFile(
    new URL("../../static/history-sync.js", import.meta.url),
  );
  const location = new URL("https://example.com/history");
  const input = { value: "record", checked: false };
  let busy = false, connected = true, replacements = 0, rendered = 0;
  const current = {
    dataset: { matchTableSignature: "old" },
    get isConnected() {
      return connected;
    },
    querySelector: () => busy,
    querySelectorAll: () => [{ value: "record" }],
    replaceWith: () => {
      replacements++;
    },
  };
  const requests: RequestInit[] = [];
  let interval!: () => void, release!: () => void;
  let wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  let status = 200;
  runInNewContext(source, {
    location,
    AbortSignal,
    CustomEvent,
    setInterval: (callback: () => void) => {
      interval = callback;
    },
    addEventListener() {},
    document: {
      hidden: false,
      querySelector: () => current,
      addEventListener() {},
      dispatchEvent: () => {
        rendered++;
      },
    },
    DOMParser: class {
      /** @return {object} 已解析的表格替身。 */
      parseFromString() {
        return {
          querySelector: () => ({
            dataset: { matchTableSignature: "new" },
            querySelectorAll: () => [input],
          }),
        };
      }
    },
    fetch: async (_path: string, options: RequestInit) => {
      requests.push(options);
      await wait;
      return new Response(status === 304 ? null : "table", {
        status,
        headers: { "x-history-version": "v1" },
      });
    },
  });
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(replacements, 1);
  assertEquals(input.checked, true);
  assertEquals(rendered, 1);
  status = 304;
  interval();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(
    (requests[1].headers as Record<string, string>)["x-history-version"],
    "v1",
  );
  assertEquals(replacements, 1);
  status = 200;
  wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  interval();
  busy = true;
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(replacements, 1);
  busy = false;
  connected = false;
  interval();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(replacements, 1);
});
