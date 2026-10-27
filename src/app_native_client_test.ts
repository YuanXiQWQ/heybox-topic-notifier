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
    },
    location: { pathname: "/" },
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
    ) + "\n({native:appNative,ready:applicationNativeReady})",
    context,
  );
  native.onmessage!({
    data: JSON.stringify({ id: requests[0].id, value: state }),
  });
  await api.ready;
  return {
    api: api.native,
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
    /** @param {string} id 请求编号。 */
    respond(id: string) {
      native.onmessage!({ data: JSON.stringify({ id, value: state }) });
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
