/**
 * @file 本文件验证 Turnstile 共用加载器的按需加载行为。
 */
import { assertEquals } from "./test_helpers.ts";

/**
 * Turnstile 客户端测试使用的最小元素替身。
 */
class ElementMock {
  /** 元素数据属性。 */
  dataset: Record<string, string> = {};
  /** 元素是否隐藏。 */
  hidden = false;

  /**
   * 查找最近的带隐藏属性的祖先。
   *
   * @param _selector CSS 选择器。
   * @return 没有隐藏祖先时返回 null。
   */
  closest(_selector: string): ElementMock | null {
    return null;
  }

  /**
   * 查询单个子元素。
   *
   * @param _selector CSS 选择器。
   * @return 没有匹配元素时返回 null。
   */
  querySelector(_selector: string): ElementMock | null {
    return null;
  }
}

/**
 * Turnstile 客户端测试使用的最小脚本元素替身。
 */
class ScriptElementMock extends ElementMock {
  /** 已注册的事件监听器。 */
  listeners = new Map<string, Array<() => void>>();
  /** 脚本标识。 */
  id = "";
  /** 脚本地址。 */
  src = "";
  /** 是否异步加载。 */
  async = false;
  /** 是否延迟执行。 */
  defer = false;

  /**
   * 注册脚本事件监听器。
   *
   * @param type 事件类型。
   * @param listener 事件监听器。
   */
  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
}

Deno.test("Turnstile loader waits for an explicit mount request", async () => {
  const browser = globalThis as typeof globalThis & {
    HTMLElement?: unknown;
    HTMLInputElement?: unknown;
    MutationObserver?: unknown;
    WarmNestTurnstile?: unknown;
    document?: unknown;
    turnstile?: unknown;
  };
  const original = Object.fromEntries(
    [
      "HTMLElement",
      "HTMLInputElement",
      "MutationObserver",
      "WarmNestTurnstile",
      "document",
      "turnstile",
    ].map((name) => [name, Object.getOwnPropertyDescriptor(browser, name)]),
  );
  const widget = new ElementMock();
  widget.dataset = {
    sitekey: "test-site-key",
    turnstileMode: "interaction",
  };
  const scripts: ScriptElementMock[] = [];
  const documentMock = {
    addEventListener: () => {},
    createElement: () => new ScriptElementMock(),
    documentElement: {},
    head: {
      append: (script: ScriptElementMock) => scripts.push(script),
    },
    querySelectorAll: (selector: string) =>
      selector === "[data-turnstile-mode]" ? [widget] : [],
    readyState: "complete",
  };

  Object.defineProperties(browser, {
    HTMLElement: { configurable: true, value: ElementMock },
    HTMLInputElement: {
      configurable: true,
      value: class HTMLInputElementMock extends ElementMock {},
    },
    MutationObserver: {
      configurable: true,
      value: class {
        /** 启动监听。 */ observe(): void {}
      },
    },
    document: { configurable: true, value: documentMock },
    turnstile: { configurable: true, value: undefined },
  });

  try {
    const turnstileClient = Deno.readTextFileSync(
      new URL("../static/turnstile.js", import.meta.url),
    );
    new Function(`${turnstileClient}\n`)();

    assertEquals(scripts.length, 0);

    let renderCount = 0;
    let resetCount = 0;
    const loader = browser.WarmNestTurnstile as {
      mount: (widget: ElementMock) => Promise<boolean>;
      reset: (widget: ElementMock) => void;
    };
    const mounted = loader.mount(widget);

    assertEquals(scripts.length, 1);
    assertEquals(
      scripts[0].src,
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    );

    Object.defineProperty(browser, "turnstile", {
      configurable: true,
      value: {
        render: (_widget: ElementMock, options: {
          callback: (token: string) => void;
        }) => {
          renderCount += 1;
          options.callback("verified-token");
          return "widget-id";
        },
        reset: () => {
          resetCount += 1;
        },
      },
    });
    scripts[0].listeners.get("load")?.forEach((listener) => listener());

    assertEquals(await mounted, true);
    assertEquals(renderCount, 1);
    assertEquals(await loader.mount(widget), true);
    assertEquals(renderCount, 1);

    loader.reset(widget);
    assertEquals(resetCount, 1);
    assertEquals(widget.hidden, false);
  } finally {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
  }
});
