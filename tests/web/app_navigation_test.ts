/** @file 验证应用导航的真实历史状态、保存屏障及认证页原生消息共存。 */
import { runInNewContext } from "node:vm";
import { assertEquals } from "@std/assert";

/**
 * 执行真实导航脚本，隔离浏览器历史、磁盘保存和原生消息。
 * @param {boolean} android 是否使用认证页的 Android 消息端口。
 * @return {Promise<object>} 控件、原生状态、保存队列和导航记录。
 */
async function harness(android = false) {
  const listeners = new Map<string, (event?: unknown) => void>();
  const saves: { resolve: () => void; reject: (error: Error) => void }[] = [];
  const visited: string[] = [];
  const forwarded: string[] = [];
  const requests: { id: string; method: string }[] = [];
  let click!: () => void, receive!: (state: object) => void;
  const back = { disabled: true, addEventListener: (_name: string, handler: () => void) => click = handler };
  const status = { hidden: true, textContent: "", title: "", dataset: { saveError: "保存失败" } };
  const root = { dataset: {} as Record<string, string>, style: { setProperty: (key: string, value: string) => root.dataset[key] = value } };
  const port = {
    onmessage: (event: { data: string }) => forwarded.push(event.data),
    postMessage: (data: string) => requests.push(JSON.parse(data)),
  };
  /** 测试表单保留浏览器二次提交时的事件与提交按钮。 */
  class NavigationForm {
    /** @return {boolean} 表单属于应用导航。 */
    closest() { return true; }
    /** @param {unknown} submitter 用户选择的原始提交按钮。 */
    requestSubmit(submitter: unknown) {
      const event = { target: this, submitter, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      listeners.get("submit")!(event);
      if (!event.defaultPrevented) visited.push(String(submitter));
    }
  }
  const context = {
    Error,
    appNative: android ? undefined : {
      onState: (handler: (state: object) => void) => receive = handler,
      info: () => Promise.resolve({ navigation: { canGoBack: false } }),
    },
    HeyboxNative: android ? port : undefined,
    document: {
      documentElement: root,
      querySelector: (selector: string) => selector === "[data-app-back]" ? back : selector === "[data-app-navigation-status]" ? status : { getBoundingClientRect: () => ({ height: 76 }) },
      addEventListener: (name: string, handler: (event?: unknown) => void) => listeners.set(name, handler),
    },
    addEventListener: (name: string, handler: (event?: unknown) => void) => listeners.set(name, handler),
    history: { length: 8, back: () => visited.push("back") },
    location: { href: "https://example.com/settings" },
    HTMLFormElement: NavigationForm,
    applicationSync: { prepareForExit: () => new Promise<void>((resolve, reject) => saves.push({ resolve, reject })) },
  };
  runInNewContext(await Deno.readTextFile(new URL("../../static/app-navigation.js", import.meta.url)), context);
  await settle();
  return { back, status, root, port, requests, forwarded, saves, visited, click: () => click(), receive: (state: object) => receive(state), listeners, NavigationForm };
}

/** @return {Promise<void>} 跨 VM 的 Promise 与本轮导航回调均已完成。 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

Deno.test("web pages do not alter layout, history or listeners", async () => {
  runInNewContext(await Deno.readTextFile(new URL("../../static/app-navigation.js", import.meta.url)), {
    get document() { throw new Error("Web layout must remain untouched"); },
  });
});

Deno.test("back state follows native position even with forward entries", async () => {
  const app = await harness();
  assertEquals(app.back.disabled, true);
  app.click();
  assertEquals(app.saves.length, 0);
  app.receive({ navigation: { canGoBack: true } });
  assertEquals(app.back.disabled, false);
  app.receive({ navigation: { canGoBack: false } });
  assertEquals(app.back.disabled, true);
});

Deno.test("back waits for persistence, merges clicks and stays put on failure", async () => {
  const app = await harness();
  app.receive({ navigation: { canGoBack: true } });
  app.click(); app.click();
  assertEquals(app.saves.length, 1);
  assertEquals(app.visited, []);
  assertEquals(app.back.disabled, true);
  app.saves.shift()!.reject(new Error("Disk full"));
  await settle();
  assertEquals(app.visited, []);
  assertEquals(app.status.hidden, false);
  assertEquals(app.status.title, "Disk full");
  app.click();
  app.saves.shift()!.resolve();
  await settle();
  assertEquals(app.visited, ["back"]);
});

Deno.test("navigation forms save before submit and retain the latest chosen destination", async () => {
  const app = await harness();
  const first = new app.NavigationForm(), last = new app.NavigationForm();
  first.requestSubmit("history"); last.requestSubmit("workspace");
  assertEquals(app.visited, []);
  app.saves[0].resolve(); app.saves[1].resolve();
  await settle();
  assertEquals(app.visited, ["workspace"]);
});

Deno.test("Android auth navigation preserves login messages and measures the bottom bar", async () => {
  const app = await harness(true);
  assertEquals(app.root.dataset.applicationPlatform, "android");
  assertEquals(app.root.dataset["--app-bottom-nav-height"], "76px");
  app.port.onmessage({ data: JSON.stringify({ id: app.requests[0].id, value: { navigation: { canGoBack: true } } }) });
  assertEquals(app.back.disabled, false);
  assertEquals(app.forwarded, []);
  app.port.onmessage({ data: JSON.stringify({ id: "login", value: { code: "test" } }) });
  assertEquals(app.forwarded.length, 1);
  app.port.onmessage({ data: JSON.stringify({ type: "state", value: { navigation: { canGoBack: false } } }) });
  assertEquals(app.back.disabled, true);
  assertEquals(app.forwarded.length, 2);
});
