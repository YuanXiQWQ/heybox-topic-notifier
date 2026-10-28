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
    performance,
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

/**
 * 执行带倒计时元素的页面脚本，独立控制客户端墙钟、单调时钟和服务器响应。
 *
 * @param {number} clockSkew 浏览器相对服务器的毫秒偏差。
 * @return {object} 页面元素、请求记录与时钟控制器。
 */
function progressHarness(clockSkew: number) {
  const epoch = Date.now();
  let elapsed = 0;
  let wallClockJump = 0;
  const settings = defaultAppSettingsFromEnv();
  settings.polling = {
    ...settings.polling,
    enabled: true,
    intervalUnit: "second",
    intervalValue: 3,
  };
  const lastPoll = {
    dataset: { lastPollAt: new Date(epoch).toISOString() },
    textContent: "",
  };
  const panel = {
    dataset: {
      pollEnabled: "true",
      pollIntervalUnit: "second",
      pollIntervalValue: "3",
    },
  };
  const classes = new Set<string>();
  const fill = {
    style: { width: "100%", transition: "", transform: "" },
    classList: {
      add: (...names: string[]) => names.forEach((name) => classes.add(name)),
      remove: (...names: string[]) =>
        names.forEach((name) => classes.delete(name)),
    },
    getBoundingClientRect: () => ({}),
  };
  const remaining = { textContent: "" };
  const elements: Record<string, unknown> = {
    "[data-last-poll-at]": lastPoll,
    "[data-next-poll-panel]": panel,
    "[data-next-poll-fill]": fill,
    "[data-next-poll-remaining]": remaining,
  };
  const intervals = new Map<number, () => void>();
  const timers = new Map<number, { at: number; callback: () => void }>();
  const frames: Array<() => void> = [];
  const requests: string[] = [];
  let timerId = 0;
  let response: Record<string, unknown> = {
    version: "v1",
    serverTime: epoch,
    lastPollAt: lastPoll.dataset.lastPollAt,
    polling: settings.polling,
  };
  /** 使用偏移墙钟模拟浏览器系统时间。 */
  class BrowserDate extends Date {
    /** @return {number} 浏览器当前墙钟时间。 */
    static override now(): number {
      return epoch + elapsed + clockSkew + wallClockJump;
    }
  }
  // 服务端渲染与浏览器模拟共享固定时刻，页面生成耗时不推进测试时钟。
  const systemNow = Date.now;
  let html: string;
  try {
    Date.now = () => epoch;
    html = renderDashboard({
      csrfToken: "test",
      returnTo: "/",
      settings,
      state: { totalMatches: 0, lastPollAt: lastPoll.dataset.lastPollAt },
      pendingTable: applyMatchTableQuery(
        [],
        parseMatchTableQuery(new URLSearchParams()),
      ),
    });
  } finally {
    Date.now = systemNow;
  }
  const script = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g))
    .find((match) => match[1].includes("isDashboardStateRefreshInFlight"))?.[1];
  if (!script) throw new Error("Dashboard script missing");
  runInNewContext(script, {
    Date: BrowserDate,
    URL,
    URLSearchParams,
    HTMLInputElement: InputMock,
    performance: { now: () => elapsed },
    location: new URL("https://example.com/"),
    document: {
      visibilityState: "visible",
      querySelector: (selector: string) => elements[selector] ?? null,
      querySelectorAll: () => [],
    },
    window: {
      setInterval: (callback: () => void, ms: number) =>
        intervals.set(ms, callback),
    },
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    setTimeout: (callback: () => void, ms: number) => {
      timers.set(++timerId, { at: elapsed + ms, callback });
      return timerId;
    },
    clearTimeout: (id: number) => timers.delete(id),
    fetch: (url: string) => {
      requests.push(url);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(response),
      });
    },
  });
  return {
    fill,
    remaining,
    lastPoll,
    requests,
    epoch,
    /**
     * 设置下一次响应并模拟一次页面状态刷新。
     * @param {Record<string, unknown>} value 服务端响应。
     * @return {Promise<void>} 响应处理完成后的 Promise。
     */
    async respond(value: Record<string, unknown>): Promise<void> {
      response = value;
      intervals.get(30_000)!();
      await settleRefresh();
    },
    /**
     * 推进单调时间和页面定时器，可同时模拟系统时钟跳变。
     * @param {number} ms 经过的毫秒数。
     * @param {number} jump 本机墙钟跳变毫秒数。
     */
    advance(ms: number, jump = 0): void {
      elapsed += ms;
      wallClockJump += jump;
      for (const [id, timer] of timers) {
        if (timer.at <= elapsed) {
          timers.delete(id);
          timer.callback();
        }
      }
      frames.splice(0).forEach((callback) => callback());
      intervals.get(1000)!();
      intervals.get(250)!();
    },
  };
}

Deno.test("progress counts down with browser clocks eight seconds behind or ahead", async () => {
  for (const skew of [-8000, 8000]) {
    const page = progressHarness(skew);
    assertEquals(page.remaining.textContent, "3 秒");
    assertEquals(parseFloat(page.fill.style.width) > 99, true);
    await settleRefresh();
    page.advance(1000);
    assertEquals(page.remaining.textContent, "2 秒");
    assertEquals(
      Math.abs(parseFloat(page.fill.style.width) - 66.67) < 0.1,
      true,
    );
    assertEquals(page.lastPoll.textContent, "1 秒前");
    assertEquals(page.requests.length, 1);
    page.advance(1000, -60_000);
    assertEquals(page.remaining.textContent, "1 秒");
    assertEquals(page.lastPoll.textContent, "2 秒前");
    assertEquals(page.requests.length, 1);
  }
});

Deno.test("progress resynchronizes unchanged responses and counts down after a poll reset", async () => {
  const page = progressHarness(-8000);
  await settleRefresh();
  await page.respond({
    unchanged: true,
    version: "v1",
    serverTime: page.epoch + 1000,
  });
  page.advance(500);
  assertEquals(Math.abs(parseFloat(page.fill.style.width) - 50) < 0.1, true);
  await page.respond({
    version: "v2",
    serverTime: page.epoch + 10_000,
    lastPollAt: new Date(page.epoch + 10_000).toISOString(),
    polling: { enabled: true, intervalUnit: "second", intervalValue: 5 },
  });
  page.advance(0);
  assertEquals(Math.abs(parseFloat(page.fill.style.width) - 91.2) < 0.1, true);
  page.advance(1000);
  assertEquals(page.remaining.textContent, "4 秒");
  assertEquals(Math.abs(parseFloat(page.fill.style.width) - 80) < 0.1, true);
  assertEquals(page.lastPoll.textContent, "1 秒前");
});
