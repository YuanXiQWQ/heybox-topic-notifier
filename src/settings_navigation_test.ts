/** @file 验证设置页导航与退出会等待防抖编辑及保存期间产生的新编辑。 */
import { assertEquals } from "@std/assert";

/**
 * 注入延迟保存端口，保留真实导航守卫和稳定快照等待逻辑。
 * @return {object} 设置快照、保存回调与导航记录。
 */
function harness() {
  const saved: (() => void)[] = [];
  const visited: string[] = [];
  const state = { current: "edited", fail: false };
  class Link {
    /** 导航目的地址。 */
    href = "https://example.com/history";
    /** 当前窗口导航。 */
    target = "";
    /** @return {Link} 当前点击链接。 */
    closest() {
      return this;
    }
    /** @return {boolean} 不是下载链接。 */
    hasAttribute() {
      return false;
    }
  }
  const source = Deno.readTextFileSync(
    new URL("../static/settings.js", import.meta.url),
  );
  const api = new Function(
    "document",
    "Element",
    "location",
    "state",
    "pending",
    `${source}
    autoSaveForm = autoSaveTopicEditor = autoSaveKeywordEditor = {};
    lastSavedSignature = 'original';
    settingsSignature = () => state.current;
    saveSettingsNow = () => { const snapshot = state.current; return new Promise(resolve => pending.push(() => { if (!state.fail) lastSavedSignature = snapshot; resolve(!state.fail); })); };
    return {guardSettingsNavigation, flushSettingsEdits};
  `,
  )(
    { addEventListener() {} },
    Link,
    {
      href: "https://example.com/settings",
      origin: "https://example.com",
      pathname: "/settings",
      search: "",
      assign: (url: string) => visited.push(url),
    },
    state,
    saved,
  );
  const event = {
    target: new Link(),
    defaultPrevented: false,
    button: 0,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  return { api, state, saved, visited, event };
}

Deno.test("settings navigation waits for pending edits and newer edits made during persistence", async () => {
  const context = harness();
  const navigation = context.api.guardSettingsNavigation(context.event);
  assertEquals(context.event.defaultPrevented, true);
  assertEquals(context.visited, []);
  context.state.current = "newer-edit";
  context.saved.shift()!();
  await Promise.resolve();
  await Promise.resolve();
  assertEquals(context.visited, []);
  assertEquals(context.saved.length, 1);
  context.saved.shift()!();
  await navigation;
  assertEquals(context.visited, ["https://example.com/history"]);
});

Deno.test("settings navigation stays on the editable page when local persistence fails", async () => {
  const context = harness();
  context.state.fail = true;
  const navigation = context.api.guardSettingsNavigation(context.event);
  context.saved.shift()!();
  await navigation;
  assertEquals(context.visited, []);
});

Deno.test("settings navigation leaves modified clicks and same-page anchors to the browser", async () => {
  const context = harness();
  await context.api.guardSettingsNavigation({
    ...context.event,
    ctrlKey: true,
  });
  context.event.target.href = "https://example.com/settings#notifications";
  await context.api.guardSettingsNavigation(context.event);
  assertEquals(context.saved.length, 0);
  assertEquals(context.event.defaultPrevented, false);
});
