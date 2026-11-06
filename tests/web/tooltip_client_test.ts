/** @file 执行全站提示脚本，用受控指针和时钟验证长按、误触拦截、取消与键盘行为。 */
import { runInNewContext } from "node:vm";
import { assertEquals } from "@std/assert";

/** 测试中具有 DOM 树、属性和位置语义的节点。 */
class HintElement {
  parent: HintElement | undefined;
  children: HintElement[] = [];
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  classes = new Set<string>();
  style: Record<string, string> = {};
  textContent = "";
  id = "";
  className = "";
  scrollTop = 0;
  isConnected = true;
  focusVisible = false;
  dir = "";
  shows = 0;
  private concealed = false;
  classList = {
    toggle: (value: string, on: boolean) =>
      on ? this.classes.add(value) : this.classes.delete(value),
  };
  /** @param {string} tag DOM 标签名。 */
  constructor(public tag = "span") {}
  /** @return {boolean} 当前是否隐藏。 */
  get hidden(): boolean {
    return this.concealed;
  }
  /** @param {boolean} value 隐藏状态，记录曾经闪现的提示。 */
  set hidden(value: boolean) {
    if (this.concealed && !value) this.shows++;
    this.concealed = value;
  }
  /** @param {HintElement} child 新子节点。 */
  append(child: HintElement): void {
    child.parent = this;
    this.children.push(child);
  }
  /** @param {string} name 属性名。 @param {string} value 属性值。 */
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  /** @param {string} name 属性名。 @return {string | null} 属性值。 */
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  /** @param {string} name 属性名。 */
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  /** @param {string} name 属性名。 @return {boolean} 属性是否存在。 */
  hasAttribute(name: string): boolean {
    return name === "data-tooltip"
      ? this.dataset.tooltip !== undefined
      : this.attributes.has(name);
  }
  /** @param {string} selector 生产代码的 CSS 选择器。 @return {boolean} 是否匹配。 */
  matches(selector: string): boolean {
    return selector.split(",").some((part) => {
      const s = part.trim();
      if (s === "[data-tooltip]") return this.dataset.tooltip !== undefined;
      if (s === ":focus-visible") return this.focusVisible;
      if (s === ".match-table td") return this.tag === "td";
      if (s.startsWith(".")) {
        return s.slice(1).split(".").every((name) => this.classes.has(name));
      }
      return s === this.tag;
    });
  }
  /** @param {string} selector 选择器。 @return {HintElement | null} 最近匹配节点。 */
  closest(selector: string): HintElement | null {
    return this.matches(selector)
      ? this
      : this.parent?.closest(selector) ?? null;
  }
  /** @param {string} selector 选择器。 @return {HintElement | null} 首个匹配后代。 */
  querySelector(selector: string): HintElement | null {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  /** @param {HintElement} node 待检查节点。 @return {boolean} 是否包含节点。 */
  contains(node: HintElement): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }
  /** @return {object} 固定位置，用于边缘定位。 */
  getBoundingClientRect() {
    return {
      left: 10,
      right: 120,
      top: 20,
      bottom: 50,
      width: 110,
      height: 30,
    };
  }
}

/** 执行生产脚本并模拟 DOM 捕获阶段，不依赖真实等待时间。 @return {object} 手势及观察接口。 */
function fixture() {
  const listeners = new Map<
    string,
    Array<{ fn: (event: Record<string, unknown>) => void; capture: boolean }>
  >();
  const timers = new Map<number, { at: number; fn: () => void }>();
  let now = 0, nextTimer = 0;
  let changed = () => {};
  const body = new HintElement("body"), root = new HintElement("html");
  root.append(body);
  /** @param {string} type 事件类型。 @param {Function} fn 回调。 @param {unknown} options 捕获配置。 */
  const listen = (
    type: string,
    fn: (event: Record<string, unknown>) => void,
    options?: boolean | { capture?: boolean },
  ) => {
    const list = listeners.get(type) ?? [];
    list.push({
      fn,
      capture: options === true ||
        (typeof options === "object" && options.capture === true),
    });
    listeners.set(type, list);
  };
  const document = {
    body,
    documentElement: root,
    hidden: false,
    createElement: (tag: string) => new HintElement(tag),
    querySelectorAll: () => [],
    addEventListener: listen,
  };
  /** 允许测试主动通知节点移除。 */
  class Observer {
    /** @param {() => void} callback DOM 变化回调。 */
    constructor(callback: () => void) {
      changed = callback;
    }
    /** 注册观察目标，测试中无需实现浏览器调度。 */
    observe(): void {}
  }
  runInNewContext(
    Deno.readTextFileSync(new URL("../../static/tooltip.js", import.meta.url)),
    {
      document,
      Element: HintElement,
      HTMLElement: HintElement,
      Node: HintElement,
      HTMLImageElement: class {},
      MutationObserver: Observer,
      innerWidth: 390,
      innerHeight: 844,
      addEventListener: listen,
      setTimeout: (fn: () => void, delay: number) => {
        const id = ++nextTimer;
        timers.set(id, { at: now + delay, fn });
        return id;
      },
      clearTimeout: (id: number) => timers.delete(id),
    },
  );
  const tooltip = body.children[0];
  /** @param {string} label 提示文案。 @return {HintElement} 按钮节点。 */
  const button = (label = "按钮说明") => {
    const node = new HintElement("button");
    node.dataset.tooltip = label;
    body.append(node);
    return node;
  };
  /** @return {HintElement} 被截断的表格正文。 */
  const clipped = () => {
    const td = new HintElement("td"), node = new HintElement();
    body.append(td);
    td.append(node);
    node.classes.add("table-clip");
    node.classes.add("is-overflowing");
    node.textContent = "完整正文";
    return node;
  };
  /** @param {string} type 事件类型。 @param {HintElement} target 事件目标。 @param {object} extra 事件附加字段。 @return {object} 可观察的默认动作状态。 */
  const fire = (
    type: string,
    target: HintElement,
    extra: Record<string, unknown> = {},
  ) => {
    let stopped = false;
    const event = {
      target,
      relatedTarget: null,
      pointerType: "touch",
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 20,
      clientY: 20,
      defaultPrevented: false,
      ...extra,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopImmediatePropagation() {
        stopped = true;
      },
    };
    for (
      const listener of [...(listeners.get(type) ?? [])].sort((a, b) =>
        Number(b.capture) - Number(a.capture)
      )
    ) {
      listener.fn(event);
      if (stopped) break;
    }
    return { ...event, stopped };
  };
  /** @param {number} ms 推进的毫秒数。 */
  const advance = (ms: number) => {
    now += ms;
    for (const [id, timer] of timers) {
      if (timer.at <= now) {
        timers.delete(id);
        timer.fn();
      }
    }
  };
  return {
    tooltip,
    button,
    clipped,
    fire,
    advance,
    root,
    body,
    document,
    changed: () => changed(),
    timers,
  };
}

Deno.test("touch tap never flashes a hint through pointerover or focus and retains its action", () => {
  const f = fixture(), target = f.button();
  target.focusVisible = true;
  f.fire("pointerover", target);
  f.fire("pointerdown", target);
  f.fire("focusin", target);
  f.advance(499);
  f.fire("pointerup", target);
  assertEquals(f.fire("click", target).defaultPrevented, false);
  f.advance(1000);
  assertEquals(f.tooltip.shows, 0);
  assertEquals(f.timers.size, 0);
});

Deno.test("long press keeps full column text visible and consumes only its associated click", () => {
  const f = fixture(), target = f.clipped();
  f.fire("pointerdown", target.parent!);
  f.advance(500);
  f.fire("pointerup", target);
  assertEquals(f.tooltip.hidden, false);
  assertEquals(f.tooltip.textContent, "完整正文");
  assertEquals(f.fire("click", target).stopped, true);
  f.fire("pointerdown", target);
  f.fire("pointerup", target);
  assertEquals(f.fire("click", target).defaultPrevented, false);
  assertEquals(f.tooltip.hidden, true);
});

Deno.test("holding an action button previews its label without submitting", () => {
  const f = fixture(), target = f.button();
  f.fire("pointerdown", target);
  f.advance(500);
  f.fire("pointerup", target);
  assertEquals(f.tooltip.textContent, "按钮说明");
  assertEquals(f.fire("click", target).defaultPrevented, true);
});

Deno.test("drag, scroll, cancellation and multiple fingers cancel pending holds", () => {
  for (
    const cancel of ["pointermove", "scroll", "pointercancel", "multitouch"]
  ) {
    const f = fixture(), target = f.clipped();
    f.fire("pointerdown", target);
    if (cancel === "multitouch") {
      f.fire("pointerdown", target, {
        isPrimary: false,
        pointerId: 2,
      });
    } else f.fire(cancel, target, { clientX: 40 });
    f.advance(600);
    assertEquals(f.tooltip.shows, 0, cancel);
    assertEquals(f.timers.size, 0);
  }
});

Deno.test("internal preview scrolling stays open while page scrolling dismisses", () => {
  const f = fixture(), target = f.clipped();
  f.fire("pointerdown", target);
  f.advance(500);
  f.fire("pointerup", target);
  f.fire("scroll", f.tooltip);
  assertEquals(f.tooltip.hidden, false);
  f.fire("scroll", f.body);
  assertEquals(f.tooltip.hidden, true);
});

Deno.test("mouse hover and keyboard focus remain accessible and restore existing descriptions", () => {
  const f = fixture(), target = f.button();
  target.setAttribute("aria-describedby", "existing");
  f.fire("pointerover", target, { pointerType: "mouse" });
  assertEquals(f.tooltip.hidden, false);
  assertEquals(f.root.hasAttribute("data-hover-input"), true);
  assertEquals(target.getAttribute("aria-describedby"), "existing app-tooltip");
  f.fire("pointerout", target, { pointerType: "mouse" });
  assertEquals(target.getAttribute("aria-describedby"), "existing");
  f.fire("keydown", target, { key: "Tab" });
  target.focusVisible = true;
  f.fire("focusin", target);
  assertEquals(f.tooltip.hidden, false);
  f.fire("keydown", target, { key: "Escape" });
  assertEquals(f.tooltip.hidden, true);
});

Deno.test("touch after mouse disables CSS hover previews and dynamic nodes work without rebinding", () => {
  const f = fixture(), first = f.button();
  f.fire("pointerover", first, { pointerType: "mouse" });
  const fresh = f.clipped();
  f.fire("pointerover", fresh);
  f.fire("pointerdown", fresh);
  assertEquals(f.root.hasAttribute("data-hover-input"), false);
  f.advance(500);
  assertEquals(f.tooltip.textContent, "完整正文");
  fresh.isConnected = false;
  f.changed();
  assertEquals(f.tooltip.hidden, true);
  assertEquals(f.timers.size, 0);
});

Deno.test("touch context menu previews rather than navigating while mouse context menus remain native", () => {
  const f = fixture(), target = f.clipped();
  f.fire("pointerdown", target);
  assertEquals(f.fire("contextmenu", target).defaultPrevented, true);
  assertEquals(f.tooltip.hidden, false);
  f.fire("pointerdown", target, { pointerType: "mouse", button: 2 });
  assertEquals(f.fire("contextmenu", target).defaultPrevented, false);
});

Deno.test("leaving the page clears pending timers and stale previews", () => {
  for (const event of ["blur", "pagehide", "popstate"]) {
    const f = fixture(), target = f.clipped();
    f.fire("pointerdown", target);
    f.fire(event, target);
    f.advance(600);
    assertEquals(f.tooltip.shows, 0);
    assertEquals(f.timers.size, 0);
  }
});

Deno.test("mouse clicking a hovered action preserves its updated feedback", () => {
  const f = fixture(), target = f.button("复制");
  f.fire("pointerover", target, { pointerType: "mouse" });
  f.fire("pointerdown", target, { pointerType: "mouse" });
  assertEquals(f.tooltip.hidden, false);
  target.dataset.tooltip = "已复制";
  f.fire("click", target);
  assertEquals(f.tooltip.textContent, "已复制");
});

Deno.test("a moved touch cannot fall through into a row click", () => {
  const f = fixture(), target = f.clipped();
  f.fire("pointerdown", target);
  f.fire("pointermove", target, { clientY: 32 });
  f.fire("pointerup", target);
  assertEquals(f.fire("click", target).defaultPrevented, true);
  assertEquals(f.tooltip.shows, 0);
  f.fire("pointerdown", target);
  f.fire("pointerup", target);
  assertEquals(f.fire("click", target).defaultPrevented, false);
});
