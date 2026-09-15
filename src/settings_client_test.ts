/**
 * @file 本文件验证设置页客户端脚本的独立初始化入口。
 */
import { assertEquals } from "./test_helpers.ts";

/**
 * 设置页脚本测试使用的最小 HTML 元素替身。
 */
class ElementMock {
  /** 元素上注册的事件监听器。 */
  listeners = new Map<string, Array<(event: Event) => void>>();

  /**
   * 注册事件监听器。
   *
   * @param type 事件类型。
   * @param listener 事件监听器。
   */
  addEventListener(type: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  /**
   * 查询子元素。
   *
   * @param _selector CSS 选择器。
   * @return 默认没有匹配的子元素。
   */
  querySelector(_selector: string): unknown {
    return null;
  }
}

/**
 * 设置页脚本测试使用的最小表单元素替身。
 */
class FormElementMock extends ElementMock {
  /** 表单数据属性。 */
  dataset: Record<string, string> = {};
}

Deno.test(
  "settings client initializes TOTP binding without account editor state",
  () => {
    const browser = globalThis as typeof globalThis & {
      HTMLElement?: unknown;
      HTMLFormElement?: unknown;
      document?: unknown;
    };
    const original = Object.fromEntries(
      ["HTMLElement", "HTMLFormElement", "document"].map((
        name,
      ) => [name, Object.getOwnPropertyDescriptor(browser, name)]),
    );
    const form = new FormElementMock();
    const section = new ElementMock();
    const scope = {
      querySelector: (selector: string) =>
        selector === "[data-totp-binding-section]" ? section : null,
    };
    section.querySelector = (selector: string) =>
      selector === "[data-totp-binding-form]" ? form : null;
    const settingsClient = Deno.readTextFileSync(
      new URL("../static/settings.js", import.meta.url),
    );

    Object.defineProperties(browser, {
      HTMLElement: { configurable: true, value: ElementMock },
      HTMLFormElement: { configurable: true, value: FormElementMock },
      document: {
        configurable: true,
        value: { addEventListener: () => {} },
      },
    });

    try {
      const initTotpBinding = new Function(
        `${settingsClient}\nreturn initTotpBinding;`,
      )() as (scope: { querySelector(selector: string): unknown }) => void;

      initTotpBinding(scope);

      assertEquals(form.listeners.get("submit")?.length, 1);
    } finally {
      for (const [name, descriptor] of Object.entries(original)) {
        if (descriptor) Object.defineProperty(browser, name, descriptor);
        else delete (browser as Record<string, unknown>)[name];
      }
    }
  },
);
