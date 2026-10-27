/** @file 验证 Android 桥接在长下载、失联及消息发送失败时的 Promise 生命周期。 */
import { runInNewContext } from "node:vm";
import { assertEquals, assertRejects } from "@std/assert";

/**
 * 在受控时钟和最小页面中运行真实桥接脚本，不请求安装或真实下载。
 * @return {Promise<object>} 原生请求、时钟及响应入口。
 */
async function harness() {
  let now = 0, serial = 0, fail = false;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const requests: { id: string; method: string }[] = [];
  const native: {
    postMessage: (message: string) => void;
    onmessage?: (message: { data: string }) => void;
  } = {
    postMessage(message) {
      if (fail) throw new Error("Port closed");
      requests.push(JSON.parse(message));
    },
  };
  const state = {
    platform: "android",
    version: "0.1.0",
    notifications: { enabled: false },
    update: { status: "idle", version: null },
  };
  const context = {
    Error,
    HeyboxNative: native,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      documentElement: { dataset: {} },
      dispatchEvent() {},
      body: { dataset: { appUserId: "alice" } },
    },
    location: {
      pathname: "/",
      href: "https://example.com/settings",
      assign: (_target: string) => {},
    },
    history: { back() {} },
    applicationSync: { prepareForExit: () => Promise.resolve() },
    CustomEvent: class {},
    setTimeout(fn: () => void, delay: number) {
      timers.set(++serial, { at: now + delay, fn });
      return serial;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
  };
  const api = runInNewContext(
    await Deno.readTextFile(
      new URL("../static/app-native.js", import.meta.url),
    ) +
      "\n({native:appNative,ready:applicationNativeReady,navigate:applicationNavigate})",
    context,
  );
  native.onmessage!({
    data: JSON.stringify({ id: requests[0].id, value: state }),
  });
  await api.ready;
  return {
    api: api.native,
    navigate: api.navigate,
    context,
    requests,
    timers,
    failPort() {
      fail = true;
    },
    /** @param {number} milliseconds 前进时长。 */
    advance(milliseconds: number) {
      now += milliseconds;
      for (const [id, timer] of timers) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.fn();
        }
      }
    },
    /** @param {string} status 原生下载状态。 */
    progress(status: string) {
      native.onmessage!({
        data: JSON.stringify({
          type: "state",
          value: { ...state, update: { ...state.update, status } },
        }),
      });
    },
    /** @param {string} id 请求编号。 @param {unknown} value 原生回复。 */
    respond(id: string, value: unknown = state) {
      native.onmessage!({ data: JSON.stringify({ id, value }) });
    },
  };
}

Deno.test("native download progress renews the idle timeout beyond two minutes", async () => {
  const bridge = await harness();
  const pending = bridge.api.downloadUpdate();
  bridge.advance(90000);
  bridge.progress("downloading");
  bridge.advance(90000);
  assertEquals(bridge.timers.size, 1);
  bridge.respond(bridge.requests.at(-1)!.id);
  assertEquals((await pending).platform, "android");
  assertEquals(bridge.timers.size, 0);
});

Deno.test("native Google login button uses the shared Android dispatcher without replacing progress listeners", async () => {
  const bridge = await harness();
  const dispatcher = bridge.context.HeyboxNative.onmessage;
  let click!: () => Promise<void>;
  const button = {
    type: "",
    className: "",
    textContent: "",
    disabled: false,
    addEventListener: (_name: string, callback: () => Promise<void>) => {
      click = callback;
    },
  };
  const root = {
    hidden: true,
    dataset: { googleLabel: "Google", googleFailed: "Failed" },
    append() {},
  };
  const source = await Deno.readTextFile(
    new URL("../static/app-native-auth.js", import.meta.url),
  );
  runInNewContext(source, {
    appNative: bridge.api,
    HeyboxNative: bridge.context.HeyboxNative,
    document: { querySelector: () => root, createElement: () => button },
  });
  const login = click();
  const request = bridge.requests.at(-1)!;
  assertEquals(request.method, "login");
  bridge.respond(request.id, { code: "ABCD1234" });
  await login;
  assertEquals(button.textContent, "Google · ABCD1234");
  assertEquals(bridge.context.HeyboxNative.onmessage, dispatcher);
  const check = bridge.api.checkUpdate();
  bridge.respond(bridge.requests.at(-1)!.id);
  assertEquals((await check).platform, "android");
});

Deno.test("standalone Android login forwards unrelated messages and restores its dispatcher on failure and success", async () => {
  let click!: () => Promise<void>, unrelated = 0, fail = true;
  const timers = new Set<() => void>();
  const button = {
    textContent: "",
    disabled: false,
    addEventListener: (_name: string, callback: () => Promise<void>) => {
      click = callback;
    },
  };
  const receive = (_event: { data: string }) => {
    unrelated++;
  };
  const native = {
    onmessage: receive,
    postMessage(message: string) {
      if (fail) throw new Error("Port closed");
      const request = JSON.parse(message);
      native.onmessage({ data: JSON.stringify({ type: "state" }) });
      native.onmessage({
        data: JSON.stringify({ id: request.id, value: { code: "CODE" } }),
      });
    },
  };
  runInNewContext(
    await Deno.readTextFile(
      new URL("../static/app-native-auth.js", import.meta.url),
    ),
    {
      HeyboxNative: native,
      crypto,
      setTimeout: (fn: () => void) => {
        timers.add(fn);
        return fn;
      },
      clearTimeout: (fn: () => void) => {
        timers.delete(fn);
      },
      document: {
        querySelector: () => ({
          dataset: { googleLabel: "Google", googleFailed: "Failed" },
          append() {},
        }),
        createElement: () => button,
      },
    },
  );
  await click();
  assertEquals(button.textContent, "Failed");
  assertEquals(button.disabled, false);
  assertEquals(native.onmessage, receive);
  assertEquals(timers.size, 0);
  fail = false;
  await click();
  assertEquals(button.textContent, "Google · CODE");
  assertEquals(unrelated, 1);
  assertEquals(native.onmessage, receive);
  assertEquals(timers.size, 0);
});

Deno.test("native back and notification navigation wait for saves, merge repeated taps and retain failed edits", async () => {
  const bridge = await harness();
  const visited: string[] = [];
  bridge.context.history.back = () => {
    visited.push("back");
  };
  bridge.context.location.assign = (path) => {
    visited.push(path);
  };
  let saved!: () => void;
  bridge.context.applicationSync.prepareForExit = () =>
    new Promise<void>((resolve) => {
      saved = resolve;
    });
  const first = bridge.navigate("back");
  const second = bridge.navigate("back");
  assertEquals(visited, []);
  saved();
  await Promise.all([first, second]);
  assertEquals(visited, ["back"]);
  bridge.context.applicationSync.prepareForExit = () =>
    Promise.reject(new Error("Disk full"));
  await assertRejects(
    () => bridge.navigate("/history", "alice"),
    Error,
    "Disk full",
  );
  assertEquals(visited, ["back"]);
  bridge.context.applicationSync.prepareForExit = () => {
    bridge.context.document.body.dataset.appUserId = "bob";
    return Promise.resolve();
  };
  await bridge.navigate("/history", "alice");
  assertEquals(visited, ["back"]);
  await assertRejects(
    () => bridge.navigate("https://evil.example/"),
    Error,
    "Invalid application route",
  );
});

Deno.test("native stalled request times out and late replies do not revive it", async () => {
  const bridge = await harness();
  const pending = bridge.api.downloadUpdate();
  const rejected = assertRejects(() => pending, Error, "timed out");
  bridge.advance(120001);
  await rejected;
  bridge.respond(bridge.requests.at(-1)!.id);
  assertEquals(bridge.timers.size, 0);
});

Deno.test("native failed message send removes its timeout immediately", async () => {
  const bridge = await harness();
  bridge.failPort();
  await assertRejects(() => bridge.api.checkUpdate(), Error, "Port closed");
  assertEquals(bridge.timers.size, 0);
});
