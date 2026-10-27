/**
 * @file 本文件执行仪表盘生成的客户端脚本，验证增量刷新及查询切换时的响应隔离。
 */
import { runInNewContext } from "node:vm";
import { assertEquals } from "./test_helpers.ts";
import { defaultAppSettingsFromEnv } from "./services/default_settings.ts";
import { renderDashboard } from "./views/dashboard.ts";
import {
  applyMatchTableQuery,
  parseMatchTableQuery,
} from "./views/match_table.ts";

/** 测试页面中的 CSRF 隐藏输入框。 */
class InputMock {
  value = "csrf-test-token";
}

/**
 * 等待脚本的 fetch 与 JSON Promise 完成，不启动页面定时器。
 *
 * @return {Promise<void>} 当前异步响应处理完成后的 Promise。
 */
function settleRefresh(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

Deno.test("dashboard client reuses versions and rejects responses for abandoned queries", async () => {
  const html = renderDashboard({
    csrfToken: "csrf-test-token",
    pendingTable: applyMatchTableQuery(
      [],
      parseMatchTableQuery(new URLSearchParams()),
    ),
    returnTo: "/",
    settings: defaultAppSettingsFromEnv(),
    state: { totalMatches: 0 },
  });
  const script = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g))
    .find((match) => match[1].includes("isDashboardStateRefreshInFlight"))?.[1];
  if (!script) throw new Error("Dashboard script missing");
  const intervals = new Map<number, () => void>();
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  const lastPoll = { dataset: {}, textContent: "" };
  const totalMatches = { textContent: "0" };
  const location = new URL("https://example.com/");
  let response: Record<string, unknown> = { totalMatches: 15, version: "v1" };
  let waitForResponse: Promise<void> | undefined;
  runInNewContext(script, {
    URL,
    URLSearchParams,
    HTMLInputElement: InputMock,
    location,
    document: {
      visibilityState: "visible",
      querySelector: (selector: string) => {
        if (selector === "[data-last-poll-at]") return lastPoll;
        if (selector === "[data-total-matches]") return totalMatches;
        if (selector === 'input[name="csrfToken"]') return new InputMock();
        return null;
      },
    },
    window: {
      setInterval: (callback: () => void, ms: number) =>
        intervals.set(ms, callback),
    },
    fetch: async (
      url: string,
      options: { headers: Record<string, string> },
    ) => {
      requests.push({ url, headers: options.headers });
      await waitForResponse;
      return { ok: true, json: () => Promise.resolve(response) };
    },
  });
  await settleRefresh();
  assertEquals(totalMatches.textContent, "15");
  assertEquals(requests[0].headers["x-dashboard-version"], undefined);

  response = { unchanged: true, version: "v1", totalMatches: 999 };
  intervals.get(30_000)!();
  await settleRefresh();
  assertEquals(requests[1].headers["x-dashboard-version"], "v1");
  assertEquals(totalMatches.textContent, "15");

  let release!: () => void;
  waitForResponse = new Promise<void>((resolve) => {
    release = resolve;
  });
  response = { totalMatches: 20, version: "v2" };
  intervals.get(30_000)!();
  location.search = "?page=2";
  release();
  await settleRefresh();
  assertEquals(totalMatches.textContent, "15");
  waitForResponse = undefined;
  response = { totalMatches: 30, version: "v3" };
  intervals.get(30_000)!();
  await settleRefresh();
  assertEquals(requests[3].url, "/dashboard-state?page=2");
  assertEquals(requests[3].headers["x-dashboard-version"], "v1");
  assertEquals(requests[3].headers["x-csrf-token"], "csrf-test-token");
  assertEquals(totalMatches.textContent, "30");
  intervals.get(30_000)!();
  await settleRefresh();
  assertEquals(requests[4].headers["x-dashboard-version"], "v3");
});
