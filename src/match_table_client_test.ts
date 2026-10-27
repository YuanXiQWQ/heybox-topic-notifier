/**
 * @file 执行表格时间脚本，验证显示边界、局部失效及大列表空闲刷新开销。
 */
import { runInNewContext } from "node:vm";
import { assertEquals } from "./test_helpers.ts";
import { getMessages } from "./locales/index.ts";
import { type Locale, locales } from "./locales/types.ts";
import { renderMatchRecordsSection } from "./views/match_table_view.ts";
import { formatHeyboxRelativeTime } from "./views/time.ts";

/** 带有文本写入计数的相对时间节点。 */
class TimeElement {
  writes = 0;
  text = "";
  details = {};

  /**
   * 创建时间节点。
   * @param {string} rawValue 时间属性。
   * @param {Locale} locale 显示语言。
   */
  constructor(public rawValue: string, public locale: Locale = "zh-CN") {}

  /** @return {string} 当前显示文本。 */
  get textContent(): string {
    return this.text;
  }

  /** @param {string} value 需要显示的文本。 */
  set textContent(value: string) {
    this.writes++;
    this.text = value;
  }

  /** @param {string} name 属性名。 @return {string} 属性值。 */
  getAttribute(name: string): string {
    return name === "data-relative-time" ? this.rawValue : this.locale;
  }

  /** @return {object} 当前时间所属的详情单元格。 */
  closest(): object {
    return this.details;
  }
}

/**
 * 提取生产页面内的时间脚本。
 * @return {string} 可直接执行的客户端脚本。
 */
function relativeTimeScript(): string {
  const html = renderMatchRecordsSection({
    action: {
      bulkButtonAttribute: "data-test-bulk",
      emptySelectionMessage: "empty",
      icon: "",
      label: "complete",
      rowCheckboxAttribute: "data-test-row",
      selectAllAttribute: "data-test-all",
    },
    csrfToken: "test",
    emptyMessage: "empty",
    filterToggleId: "filter",
    formAction: "/matches/complete",
    heading: "heading",
    headingId: "heading",
    locale: "zh-CN",
    messages: getMessages("zh-CN"),
    path: "/",
    table: {
      from: "",
      to: "",
      range: "all",
      page: 1,
      pageSize: "all",
      records: [],
      totalPages: 1,
      totalRecords: 0,
    },
  });
  const script = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g))
    .find((match) =>
      match[1].includes("__matchTableRelativeTimeScriptInstalled")
    )?.[1];
  if (!script) throw new Error("Relative-time script missing");
  return script;
}

/**
 * 使用可控时钟执行真实脚本并记录格式化器创建、DOM 写入与溢出请求。
 * @param {TimeElement[]} elements 时间节点。
 * @param {number} initialTime 初始时刻。
 * @return {object} 时间推进及可观测状态。
 */
function timeHarness(elements: TimeElement[], initialTime: number) {
  let now = initialTime;
  let formatterCount = 0;
  let tick = () => {};
  const listeners = new Map<string, () => void>();
  const overflowRequests: object[][] = [];
  const document = {
    hidden: false,
    querySelectorAll: () => elements,
    addEventListener: (name: string, listener: () => void) =>
      listeners.set(name, listener),
  };
  /** 固定 Date.now，保留日期格式化所需的 Date 实例行为。 */
  class Clock extends Date {
    /** @return {number} 受控的当前时间戳。 */
    static override now(): number {
      return now;
    }
  }
  /** 记录昂贵格式化器的实例化次数。 */
  class DateTimeFormat extends Intl.DateTimeFormat {
    /**
     * 创建与浏览器相同的日期格式化器。
     * @param {string} locale 语言。
     * @param {Intl.DateTimeFormatOptions} options 格式选项。
     */
    constructor(locale: string, options: Intl.DateTimeFormatOptions) {
      super(locale, options);
      formatterCount++;
    }
  }
  const window = {
    setInterval: (callback: () => void) => {
      tick = callback;
    },
    __matchTableOverflowUpdate: (targets: Iterable<object>) =>
      overflowRequests.push([...targets]),
  };
  runInNewContext(relativeTimeScript(), {
    Date: Clock,
    Intl: { DateTimeFormat },
    document,
    window,
  });
  return {
    document,
    listeners,
    overflowRequests,
    window,
    formatterCount: () => formatterCount,
    advance: (timestamp: number) => {
      now = timestamp;
      tick();
    },
  };
}

Deno.test("table time cache preserves all locales and relative-time boundaries", () => {
  const epoch = Date.parse("2026-10-26T12:00:00Z");
  const offsets = [
    -60,
    0,
    58,
    59,
    60,
    3599,
    3600,
    86399,
    86400,
    172799,
    172800,
    604799,
    604800,
  ];
  const elements = locales.flatMap((locale) =>
    offsets.map((offset) =>
      new TimeElement(new Date(epoch - offset * 1000).toISOString(), locale)
    )
  );
  elements.push(new TimeElement("invalid"), new TimeElement(""));
  const harness = timeHarness(elements, epoch);
  for (const elapsed of [0, 1000, 2000, 60_000, 3600_000, 86400_000, -60_000]) {
    const now = epoch + elapsed;
    harness.advance(now);
    for (const element of elements) {
      assertEquals(
        element.textContent,
        formatHeyboxRelativeTime(
          element.rawValue,
          new Date(now),
          element.locale,
        ),
      );
    }
  }
});

Deno.test("table time cache respects Gregorian and Persian calendar year changes", () => {
  for (
    const boundary of [
      "2026-12-31T16:00:00Z",
      "2026-03-20T16:00:00Z",
      "2026-03-21T16:00:00Z",
    ]
  ) {
    const epoch = Date.parse(boundary);
    const elements = locales.map((locale) =>
      new TimeElement(new Date(epoch - 20 * 86400_000).toISOString(), locale)
    );
    const harness = timeHarness(elements, epoch - 1000);
    harness.advance(epoch);
    for (const element of elements) {
      assertEquals(
        element.textContent,
        formatHeyboxRelativeTime(
          element.rawValue,
          new Date(epoch),
          element.locale,
        ),
      );
    }
  }
});

Deno.test("unchanged large tables perform no DOM writes or overflow scans on timer ticks", () => {
  const epoch = Date.parse("2026-10-26T12:00:00Z");
  const elements = Array.from(
    { length: 1000 },
    () => new TimeElement("2026-10-01T12:00:00Z"),
  );
  const harness = timeHarness(elements, epoch);
  const created = harness.formatterCount();
  harness.overflowRequests.length = 0;
  for (const element of elements) element.writes = 0;
  for (let second = 1; second <= 10; second++) {
    harness.advance(epoch + second * 1000);
  }
  assertEquals(harness.formatterCount(), created);
  assertEquals(elements.reduce((sum, element) => sum + element.writes, 0), 0);
  assertEquals(harness.overflowRequests.length, 0);
});

Deno.test("time updates invalidate only changed details and resume after visibility changes", () => {
  const epoch = Date.parse("2026-10-26T12:00:00Z");
  const recent = new TimeElement(new Date(epoch - 59_000).toISOString());
  const sameRow = new TimeElement(recent.rawValue);
  sameRow.details = recent.details;
  const old = new TimeElement("2026-10-01T12:00:00Z");
  const elements = [recent, sameRow, old];
  const harness = timeHarness(elements, epoch);
  harness.overflowRequests.length = 0;
  harness.advance(epoch + 1000);
  assertEquals(recent.textContent, "1 分钟前");
  assertEquals(harness.overflowRequests[0], [recent.details]);
  harness.document.hidden = true;
  harness.advance(epoch + 61_000);
  assertEquals(recent.textContent, "1 分钟前");
  harness.document.hidden = false;
  harness.listeners.get("visibilitychange")!();
  assertEquals(recent.textContent, "2 分钟前");
  old.rawValue = recent.rawValue;
  old.locale = "en-US";
  harness.advance(epoch + 61_000);
  assertEquals(
    old.textContent,
    formatHeyboxRelativeTime(old.rawValue, new Date(epoch + 61_000), "en-US"),
  );
  const replacement = new TimeElement(recent.rawValue);
  elements.splice(0, elements.length, replacement);
  runInNewContext(relativeTimeScript(), { window: harness.window });
  assertEquals(replacement.textContent, "2 分钟前");
});
