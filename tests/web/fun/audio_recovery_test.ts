/** @file 验证警报音频被浏览器策略拦截后的交互恢复与会话清理。 */
import { assert, assertEquals } from "@std/assert";
import { flushMicrotasks } from "./event_test_helpers.ts";
import { installLobotomyCorpAlertHarness } from "./test_harness.ts";

Deno.test("警报播放被拦截后可用点击或键盘恢复，成功后撤销重试", async () => {
  for (const gesture of ["click", "keydown"]) {
    const harness = installLobotomyCorpAlertHarness();
    try {
      let blocked = true;
      harness.AudioMock.playHook = () =>
        blocked
          ? Promise.reject(
            new DOMException("User gesture required", "NotAllowedError"),
          )
          : Promise.resolve();
      await harness.reload();
      void harness.api().setDangerScore(20);
      await flushMicrotasks();
      const audio = harness.lastTrumpet();
      assert(audio);
      const firstAttempts = audio.playCount;
      harness.dispatchDocument(gesture);
      await flushMicrotasks();
      assertEquals(audio.playCount, firstAttempts + 1);
      blocked = false;
      harness.dispatchDocument(gesture);
      await flushMicrotasks();
      assertEquals(audio.playCount, firstAttempts + 2);
      harness.dispatchDocument("click");
      harness.dispatchDocument("keydown");
      await flushMicrotasks();
      assertEquals(audio.playCount, firstAttempts + 2);
    } finally {
      harness.restore();
    }
  }
});

Deno.test("换曲和结束后不会被旧音频的延迟拒绝重新挂上恢复监听", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    let rejectOld: (error: Error) => void = () => {};
    harness.AudioMock.playHook = (audio) =>
      audio.src.includes("emergency01")
        ? new Promise((_resolve, reject) => {
          rejectOld = reject;
        })
        : Promise.resolve();
    await harness.reload();
    void harness.api().setDangerScore(20);
    await flushMicrotasks();
    const previous = harness.lastTrumpet();
    assert(previous);
    void harness.api().setDangerScore(80);
    await flushMicrotasks();
    const current = harness.lastTrumpet();
    assert(current && current !== previous);
    rejectOld(new DOMException("Old audio blocked", "NotAllowedError"));
    await flushMicrotasks();
    const attempts = current.playCount;
    harness.dispatchDocument("click");
    await flushMicrotasks();
    assertEquals(current.playCount, attempts);
    assertEquals(previous.playCount, 1);
  } finally {
    harness.restore();
  }
});

Deno.test("警报结束或进入重播间隔后，交互不会重启被拦截的曲目", async () => {
  for (const finish of [false, true]) {
    const harness = installLobotomyCorpAlertHarness();
    try {
      harness.AudioMock.playHook = () =>
        Promise.reject(
          new DOMException("User gesture required", "NotAllowedError"),
        );
      await harness.reload();
      void harness.api().setDangerScore(20);
      await flushMicrotasks();
      const audio = harness.lastTrumpet();
      assert(audio);
      if (finish) void harness.api().restartDay();
      else audio.dispatch("ended");
      await flushMicrotasks();
      const attempts = audio.playCount;
      harness.dispatchDocument("click");
      harness.dispatchDocument("keydown");
      await flushMicrotasks();
      assertEquals(audio.playCount, attempts);
    } finally {
      harness.restore();
    }
  }
});

Deno.test("媒体格式错误不会注册用户交互重试", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.AudioMock.playHook = () =>
      Promise.reject(
        new DOMException("Unsupported media", "NotSupportedError"),
      );
    await harness.reload();
    void harness.api().setDangerScore(20);
    await flushMicrotasks();
    const audio = harness.lastTrumpet();
    assert(audio);
    const attempts = audio.playCount;
    harness.dispatchDocument("click");
    harness.dispatchDocument("keydown");
    await flushMicrotasks();
    assertEquals(audio.playCount, attempts);
  } finally {
    harness.restore();
  }
});

Deno.test("切页后被拦截的警报在点击恢复时保留原播放进度", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.AudioMock.nextDuration = 200;
    harness.AudioMock.nextReadyState = 1;
    await harness.reload();
    void harness.api().setDangerScore(20);
    await flushMicrotasks();
    const previous = harness.lastTrumpet();
    assert(previous);
    previous.currentTime = 37;
    previous.dispatch("timeupdate");
    let blocked = true;
    harness.AudioMock.playHook = (audio) => {
      audio.currentTime = 0;
      return blocked
        ? Promise.reject(
          new DOMException("User gesture required", "NotAllowedError"),
        )
        : Promise.resolve();
    };
    await harness.reload();
    await flushMicrotasks();
    const current = harness.lastTrumpet();
    assert(current && current !== previous);
    assertEquals(current.currentTime, 0);
    blocked = false;
    harness.dispatchDocument("click");
    await flushMicrotasks();
    assertEquals(current.currentTime, 37);
  } finally {
    harness.restore();
  }
});
