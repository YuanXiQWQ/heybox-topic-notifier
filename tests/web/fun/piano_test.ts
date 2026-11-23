/** @file 月光女神输入轮次、警报跨档、并发和原声资源回归。 */
import { assert, assertEquals } from "@std/assert";
import { installLobotomyCorpAlertHarness } from "./test_harness.ts";
import { flushMicrotasks } from "./event_test_helpers.ts";
import { lobotomyCorpAssetResponse } from "../../../src/easter_egg_assets.ts";
import {
  pianoId,
  pianoSounds,
} from "../../../static/fun/lobotomy-corp/Events/Piano.js";

for (
  const trigger of [
    "工作中输入",
    "曲终后输入",
    "警报从零升档",
    "一级直升三级",
  ] as const
) {
  Deno.test(`月光女神：${trigger}，收琴后可开始下一轮`, async () => {
    const h = installLobotomyCorpAlertHarness({ pollingIntervalValue: "5" });
    try {
      await h.reload();
      const api = h.api();
      const initial = trigger === "一级直升三级" ? 15 : 0;
      if (initial) void api.setDangerScore(initial);
      const cancelled = api.prepareDisplayName(pianoId);
      cancelled.dispose();
      await api.prepareDisplayName(pianoId).commit();
      const work = h.AudioMock.items.findLast((a) =>
        a.src.endsWith(pianoSounds[0])
      )!;
      const escape = h.AudioMock.items.findLast((a) =>
        a.src.endsWith(pianoSounds[1])
      )!;
      Object.defineProperty(work, "paused", { value: false });
      assertEquals(api.getDangerScore(), initial);
      assert(!work.loop && !work.muted);
      const warmCount = escape.playCount;
      const pauses = work.pauseCount;
      await api.setDangerScore(initial + 1);
      assertEquals(escape.playCount, warmCount);
      let beforeBreach = initial + 1;
      if (trigger === "曲终后输入") {
        work.dispatch("ended");
        beforeBreach = 12;
        void api.setDangerScore(beforeBreach);
        assertEquals(escape.playCount, warmCount);
        await api.prepareDisplayName(pianoId).commit();
      } else if (trigger === "工作中输入") {
        void api.prepareDisplayName(pianoId).commit();
      } else {
        beforeBreach = initial ? 80 : 10;
        void api.setDangerScore(beforeBreach);
      }
      await flushMicrotasks();
      const third = h.AudioMock.items.findLast((a) =>
        a.src.endsWith(pianoSounds[1])
      )!;
      assert(third.loop && !third.muted);
      assertEquals(third.currentTime, 0);
      assert(work.pauseCount > pauses);
      assertEquals(api.getDangerScore(), beforeBreach + 12);
      const plays = third.playCount;
      const deadline = h.pendingTimer(95000)!;
      assert(deadline);
      await api.commitDisplayName(pianoId);
      assertEquals(third.playCount, plays);
      assertEquals(h.pendingTimer(95000), deadline);
      h.setNow(95000);
      deadline.callback();
      h.setNow(95750);
      h.pendingTimer(20)!.callback();
      assertEquals(third.volume, 0.5);
      await api.commitDisplayName(pianoId);
      h.setNow(96500);
      h.pendingTimer(20)!.callback();
      await api.prepareDisplayName(pianoId).commit();
      assert(
        h.AudioMock.items.findLast((a) => a.src.endsWith(pianoSounds[0])) !==
          work,
      );
      await api.prepareDisplayName(pianoId).commit();
      assert(h.pendingTimer(95000));
      assertEquals(api.getDangerScore(), beforeBreach + 12);
      const restarted = api.restartDay();
      h.pendingTimer(550)?.callback();
      await restarted;
      assertEquals(h.pendingTimer(95000), undefined);
    } finally {
      h.restore();
    }
  });
}

Deno.test("月光女神：工作曲播完后跨页记住首次输入，全新窗口从首曲开始", async () => {
  for (const alreadyWorked of [true, false]) {
    const h = installLobotomyCorpAlertHarness();
    try {
      await h.reload();
      if (alreadyWorked) {
        await h.api().prepareDisplayName(pianoId).commit();
        h.AudioMock.items.find((a) => a.src.endsWith(pianoSounds[0]))!.dispatch(
          "ended",
        );
        await h.reload();
      }
      void h.api().prepareDisplayName(pianoId).commit();
      assertEquals(Boolean(h.pendingTimer(95000)), alreadyWorked);
    } finally {
      h.restore();
    }
  }
});

Deno.test("月光女神：原作音轨支持完整及分段读取", async () => {
  for (const file of pianoSounds) {
    const path = "Assets/" + file;
    const full = await lobotomyCorpAssetResponse(path);
    assertEquals(full.status, 200);
    const bytes = new Uint8Array(await full.arrayBuffer());
    assertEquals(new TextDecoder().decode(bytes.subarray(0, 4)), "OggS");
    const header = await lobotomyCorpAssetResponse(path, "bytes=0-3");
    assertEquals(header.status, 206);
    assertEquals(await header.text(), "OggS");
  }
});

Deno.test("月光女神：警报降档或仅音乐升级时继续第一乐章", async () => {
  const h = installLobotomyCorpAlertHarness();
  try {
    await h.reload();
    const api = h.api();
    void api.setDangerScore(60);
    await api.prepareDisplayName(pianoId).commit();
    const work = h.AudioMock.items.find((a) => a.src.endsWith(pianoSounds[0]))!;
    Object.defineProperty(work, "paused", { value: false });
    await api.setDangerScore(20);
    void api.activate("third trumpet");
    assertEquals(h.pendingTimer(95000), undefined);
    assertEquals(api.getDangerScore(), 20);
    void api.setDangerScore(51);
    assert(h.pendingTimer(95000));
  } finally {
    h.restore();
  }
});

Deno.test("月光女神：沉默乐团出逃引发升档，两场同时运行并各计一次分", async () => {
  const h = installLobotomyCorpAlertHarness({ pollingIntervalValue: "5" });
  try {
    await h.reload();
    const api = h.api();
    await api.prepareDisplayName(pianoId).commit();
    const first = h.AudioMock.items.find((a) =>
      a.src.endsWith(pianoSounds[0])
    )!;
    Object.defineProperty(first, "paused", { value: false });
    void api.prepareDisplayName("T-01-31").commit();
    await flushMicrotasks();
    assert(
      h.createdElements().some((node) =>
        node.className === "lobotomy-orchestra" && !node.removed
      ),
    );
    assert(h.pendingTimer(95000));
    assertEquals(api.getDangerScore(), (75 + 60) / 5);
    void api.commitDisplayName(pianoId);
    assertEquals(api.getDangerScore(), 27);
  } finally {
    h.restore();
  }
});
