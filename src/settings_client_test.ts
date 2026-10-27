/**
 * @file 验证设置页客户端初始化、密钥编辑和自动保存快照。
 */
import { assertEquals } from "./test_helpers.ts";

/** 密钥编辑测试使用的输入框替身。 */
class SecretInputMock {
  /** 提交字段名称。 */
  name = "matchingApiKey";
  /** 输入值。 */
  value = "";
  /** 是否为只读遮罩。 */
  readOnly = false;
  /** 控件类型。 */
  type = "password";
  /** 遮罩元数据。 */
  dataset: Record<string, string> = {};
  /** 编辑器内的实际提交控件。 */
  hidden: SecretInputMock | null = null;

  /**
   * 提供密钥编辑器的隐藏提交控件。
   * @return {{querySelector: () => SecretInputMock | null}} 编辑器替身。
   */
  closest() {
    return { querySelector: () => this.hidden };
  }
}

Deno.test("secret blur preserves pending keys and never submits the readonly mask", () => {
  const hidden = new SecretInputMock();
  const input = new SecretInputMock();
  input.hidden = hidden;
  const source = Deno.readTextFileSync(new URL("../static/settings.js", import.meta.url));
  const client = new Function("document", "HTMLInputElement", "HTMLButtonElement", `${source}
    return {lockSecretEditorAfterEdit, clearSecretSubmissionValues};
  `)(
    { addEventListener() {}, querySelectorAll: () => [hidden] },
    SecretInputMock,
    ElementMock,
  );
  input.value = "fixture-key";
  client.lockSecretEditorAfterEdit(input);
  assertEquals(hidden.value, "fixture-key");
  assertEquals(input.readOnly, true);
  client.lockSecretEditorAfterEdit(input);
  assertEquals(hidden.value, "fixture-key");
  input.readOnly = false;
  input.value = "";
  client.lockSecretEditorAfterEdit(input);
  assertEquals(hidden.value, "fixture-key");
  const submitted = new FormData();
  submitted.set(hidden.name, "earlier-key");
  client.clearSecretSubmissionValues(submitted);
  assertEquals(hidden.value, "fixture-key");
  submitted.set(hidden.name, "fixture-key");
  client.clearSecretSubmissionValues(submitted);
  assertEquals(hidden.value, "");
});

Deno.test("autosave responses preserve newer model and key edits for the next save", async () => {
  const key = new SecretInputMock();
  const form = { model: "" };
  let complete!: (value: Response) => void;
  let scheduled = 0;
  const source = Deno.readTextFileSync(new URL("../static/settings.js", import.meta.url));
  const client = new Function("document", "HTMLInputElement", "fetch", "form", "key", "schedule", `${source}
    autoSaveForm = autoSaveTopicEditor = autoSaveKeywordEditor = form;
    pruneIncompleteDraftRows = persistCurrentKeywordRows = setAutoSaveStatus = () => {};
    csrfRequestHeaders = () => ({});
    scheduleAutoSave = schedule;
    formDataFromForm = () => {
      const data = new FormData();
      data.set('matchingModel', form.model);
      data.set(key.name, key.value);
      return data;
    };
    return {saveSettingsNow, saved: () => lastSavedSignature};
  `)(
    { addEventListener() {}, querySelectorAll: () => [key] },
    SecretInputMock,
    () => new Promise<Response>((resolve) => { complete = resolve; }),
    form,
    key,
    () => { scheduled++; },
  );
  const first = client.saveSettingsNow();
  key.value = "new-fixture-key";
  form.model = "selected-model";
  complete(new Response("ok"));
  await first;
  assertEquals(key.value, "new-fixture-key");
  assertEquals(scheduled, 1);
  assertEquals(client.saved().includes("selected-model"), false);
  const second = client.saveSettingsNow();
  complete(new Response("ok"));
  await second;
  assertEquals(key.value, "");
  assertEquals(client.saved().includes("selected-model"), true);
});

Deno.test("overlapping offline saves advance the edit baseline in durable order", async () => {
  const key = new SecretInputMock();
  const form = { model: "first" };
  const calls: Array<{ body: FormData; base: string }> = [];
  let complete!: (value: Response) => void;
  const source = Deno.readTextFileSync(new URL("../static/settings.js", import.meta.url));
  const client = new Function("document", "HTMLInputElement", "globalThis", "form", `${source}
    autoSaveForm = autoSaveTopicEditor = autoSaveKeywordEditor = form;
    pruneIncompleteDraftRows = persistCurrentKeywordRows = setAutoSaveStatus = scheduleAutoSave = () => {};
    formDataFromForm = () => { const value = new FormData(); value.set('matchingModel', form.model); return value; };
    return {saveSettingsNow};
  `)(
    { addEventListener() {}, querySelectorAll: () => [key] }, SecretInputMock,
    { applicationSync: { submitSettings: (body: FormData, base: string) => {
      calls.push({ body, base });
      if (calls.length === 1) return new Promise<Response>((resolve) => { complete = resolve; });
      return Promise.resolve(new Response(null, { status: 202, headers: { "x-app-local": "1" } }));
    } } }, form,
  );
  const first = client.saveSettingsNow();
  form.model = "second";
  const second = client.saveSettingsNow();
  assertEquals(calls.length, 1);
  complete(new Response(null, { status: 202, headers: { "x-app-local": "1" } }));
  await Promise.all([first, second]);
  assertEquals(calls.length, 2);
  assertEquals(new URLSearchParams(calls[1].base).get("matchingModel"), "first");
  assertEquals(calls[1].body.get("matchingModel"), "second");
});

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
