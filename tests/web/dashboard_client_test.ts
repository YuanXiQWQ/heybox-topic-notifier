/**
 * @file 本文件执行仪表盘生成的客户端脚本，验证增量刷新及查询切换时的响应隔离。
 */
import { runInNewContext } from "node:vm";
import { assertEquals } from "@std/assert";
import { defaultAppSettingsFromEnv } from "../../src/services/default_settings.ts";
import { renderDashboard } from "../../src/views/dashboard.ts";
import {
  applyMatchTableQuery,
  parseMatchTableQuery,
} from "../../src/views/match_table.ts";

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

/**
 * 执行仪表盘脚本，模拟表格操作替换节点以及状态请求与用户操作交错。
 *
 * @return {object} 当前可见表格、请求及响应控制器。
 */
function pendingRefreshHarness() {
  const html = renderDashboard({
    csrfToken: "test",
    returnTo: "/",
    settings: defaultAppSettingsFromEnv(),
    state: { totalMatches: 0 },
    pendingTable: applyMatchTableQuery(
      [],
      parseMatchTableQuery(new URLSearchParams()),
    ),
  });
  const script = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g))
    .find((match) => match[1].includes("isDashboardStateRefreshInFlight"))?.[1];
  if (!script) throw new Error("Dashboard script missing");
  const intervals = new Map<number, () => void>();
  const requests: Array<Record<string, string>> = [];
  const responses: Array<(state: Record<string, unknown>) => void> = [];
  const totalMatches = { textContent: "0" };
  let rendered = 0;

  /** 表格节点替身遵循 DOM 规则：替换脱离文档的节点不影响可见页面。 */
  class Section {
    dataset: { matchTableSignature: string };
    busy = false;
    inputs: Array<{ value: string; checked: boolean }>;

    /**
     * 构造指定内容的表格。
     * @param {string} signature 表格签名。
     * @param {string[]} ids 记录标识。
     */
    constructor(signature: string, ids: string[] = []) {
      this.dataset = { matchTableSignature: signature };
      this.inputs = ids.map((value) => ({ value, checked: false }));
    }

    /** @return {boolean} 节点是否仍在可见文档中。 */
    get isConnected(): boolean {
      return current === this;
    }

    /** @return {boolean} 是否存在提交中的表格。 */
    querySelector(): boolean {
      return this.busy;
    }

    /**
     * 查询当前记录或已选记录。
     * @param {string} selector 输入框选择器。
     * @return {Array<{value: string, checked: boolean}>} 匹配的输入框。
     */
    querySelectorAll(selector: string) {
      return selector.includes(":checked")
        ? this.inputs.filter((input) => input.checked)
        : this.inputs;
    }

    /**
     * 替换文档内的当前节点。
     * @param {Section} next 新节点。
     */
    replaceWith(next: Section): void {
      if (this.isConnected) current = next;
    }
  }

  let current = new Section("initial", ["old"]);
  runInNewContext(script, {
    performance,
    URL,
    URLSearchParams,
    CustomEvent,
    HTMLInputElement: InputMock,
    location: new URL("https://example.com/"),
    document: {
      visibilityState: "visible",
      addEventListener() {},
      dispatchEvent() {
        rendered++;
      },
      querySelector(selector: string) {
        if (selector === "[data-last-poll-at]") {
          return { dataset: {}, textContent: "" };
        }
        if (selector === "[data-total-matches]") return totalMatches;
        if (
          selector === ".table-section" ||
          selector === '[data-match-table-section="pending-posts-heading"]'
        ) return current;
        return null;
      },
    },
    window: {
      addEventListener() {},
      setInterval: (callback: () => void, ms: number) =>
        intervals.set(ms, callback),
    },
    DOMParser: class {
      /**
       * 将测试响应映射为待插入的表格节点。
       * @param {string} value 序列化的表格内容。
       * @return {object} 解析后的文档。
       */
      parseFromString(value: string) {
        const { signature, ids } = JSON.parse(value);
        const next = new Section(signature, ids);
        return { querySelector: () => next };
      }
    },
    fetch: (_url: string, options: { headers: Record<string, string> }) => {
      requests.push(options.headers);
      return new Promise((resolve) =>
        responses.push((state) =>
          resolve({ ok: true, json: () => Promise.resolve(state) })
        )
      );
    },
  });
  return {
    requests,
    totalMatches,
    /** @return {Section} 当前可见表格。 */
    get current() {
      return current;
    },
    /** @return {number} 成功渲染事件数量。 */
    get rendered() {
      return rendered;
    },
    /** 触发定时状态刷新。 */
    refresh(): void {
      intervals.get(5_000)!();
    },
    /** 模拟勾选处理最后一条帖子后的局部表格替换。 */
    completeAll(): void {
      current.replaceWith(new Section("empty"));
    },
    /**
     * 完成最早的状态请求。
     * @param {string} version 响应版本。
     * @param {string[]} ids 待处理记录。
     * @return {Promise<void>} 页面更新完成。
     */
    async respond(version: string, ids: string[]): Promise<void> {
      responses.shift()!({
        version,
        totalMatches: 862,
        pendingSignature: version,
        pendingHtml: JSON.stringify({ signature: version, ids }),
      });
      await settleRefresh();
    },
  };
}

Deno.test("dashboard refreshes visible pending posts after completing the previous table", async () => {
  const page = pendingRefreshHarness();
  await page.respond("v1", ["old"]);
  page.completeAll();
  page.refresh();
  await page.respond("v2", ["new"]);
  assertEquals(page.totalMatches.textContent, "862");
  assertEquals(page.current.inputs.map((input) => input.value), ["new"]);
  page.current.inputs[0].checked = true;
  page.refresh();
  await page.respond("v3", ["new", "newer"]);
  assertEquals(page.current.inputs, [{ value: "new", checked: true }, {
    value: "newer",
    checked: false,
  }]);
  assertEquals(page.rendered, 3);
});

Deno.test("dashboard discards a response when a table action has replaced its target", async () => {
  const page = pendingRefreshHarness();
  await page.respond("v1", ["old"]);
  page.refresh();
  page.completeAll();
  await page.respond("stale", ["old"]);
  assertEquals(page.current.inputs, []);
  assertEquals(page.rendered, 1);
  page.refresh();
  assertEquals(page.requests[2]["x-dashboard-version"], "v1");
  await page.respond("v2", ["new"]);
  assertEquals(page.current.inputs.map((input) => input.value), ["new"]);
});

Deno.test("dashboard checks submission state on the current table before and after fetch", async () => {
  const page = pendingRefreshHarness();
  await page.respond("v1", ["old"]);
  page.completeAll();
  page.current.busy = true;
  page.refresh();
  assertEquals(page.requests.length, 1);
  page.current.busy = false;
  page.refresh();
  page.current.busy = true;
  await page.respond("stale", ["old"]);
  assertEquals(page.current.inputs, []);
  page.current.busy = false;
  page.refresh();
  assertEquals(page.requests[2]["x-dashboard-version"], "v1");
  await page.respond("v2", ["new"]);
  assertEquals(page.current.inputs.map((input) => input.value), ["new"]);
});

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
      addEventListener() {},
      visibilityState: "visible",
      querySelector: (selector: string) => {
        if (selector === "[data-last-poll-at]") return lastPoll;
        if (selector === "[data-total-matches]") return totalMatches;
        if (selector === 'input[name="csrfToken"]') return new InputMock();
        return null;
      },
    },
    window: {
      addEventListener() {},
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
  intervals.get(5_000)!();
  await settleRefresh();
  assertEquals(requests[1].headers["x-dashboard-version"], "v1");
  assertEquals(totalMatches.textContent, "15");

  let release!: () => void;
  waitForResponse = new Promise<void>((resolve) => {
    release = resolve;
  });
  response = { totalMatches: 20, version: "v2" };
  intervals.get(5_000)!();
  location.search = "?page=2";
  release();
  await settleRefresh();
  assertEquals(totalMatches.textContent, "15");
  waitForResponse = undefined;
  response = { totalMatches: 30, version: "v3" };
  intervals.get(5_000)!();
  await settleRefresh();
  assertEquals(requests[3].url, "/dashboard-state?page=2");
  assertEquals(requests[3].headers["x-dashboard-version"], "v1");
  assertEquals(requests[3].headers["x-csrf-token"], "csrf-test-token");
  assertEquals(totalMatches.textContent, "30");
  intervals.get(5_000)!();
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
      addEventListener() {},
      visibilityState: "visible",
      querySelector: (selector: string) => elements[selector] ?? null,
      querySelectorAll: () => [],
    },
    window: {
      addEventListener() {},
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
      intervals.get(5_000)!();
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
