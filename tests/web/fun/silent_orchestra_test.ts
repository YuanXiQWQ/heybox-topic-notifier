/** @file 沉默乐团出逃入口、动画事件、自然谢幕及重启打断测试。 */
import { assert, assertEquals } from "@std/assert";
import {
  findAllByClass,
  findByClass,
  flushMicrotasks,
  requireByClass,
} from "./event_test_helpers.ts";
import { installLobotomyCorpAlertHarness } from "./test_harness.ts";
import { escapableAbnormalityIds } from "../../../static/fun/lobotomy-corp/Events/Shelter.js";
import { createSilentOrchestraEvent } from "../../../static/fun/lobotomy-corp/Events/SilentOrchestra.js";
import { lobotomyCorpAssetResponse } from "../../../src/easter_egg_assets.ts";

for (
  const [fps, fixedPhase, native] of [
    [30, 0.006666671, [90, 452, 1139, 1630, 2023, 2803, 2909, 3000]],
    [60, 0.01333334, [180, 902, 2276, 3258, 4043, 5602, 5812, 5993]],
    [120, 0.01666667, [361, 1802, 4549, 6511, 8081, 11199, 11620, 11982]],
  ] as const
) {
  const interrupt = fps !== 60;
  Deno.test(`沉默乐团：原版 ${fps} 帧演出，${interrupt ? "按钮打断余音" : "余音自然结束"}`, async () => {
    const departments = interrupt ? 5 : 11;
    const h = installLobotomyCorpAlertHarness({
      pollingIntervalValue: String(departments),
    });
    try {
      h.setNow(fixedPhase * 1000);
      await h.reload();
      const api = h.api();
      void api.prepareDisplayName("T-01-31").commit();
      await flushMicrotasks();
      const root = requireByClass(h.documentElement, "lobotomy-orchestra");
      const restart = requireByClass(
        h.body,
        "lobotomy-corp-top-panel-action-button",
      );
      const frame = requireByClass(
        h.body,
        "lobotomy-corp-top-panel-frame-outter",
      );
      assertEquals(restart.parentElement, frame);
      await api.commitDisplayName("T-01-31");
      assertEquals(
        h.createdElements().filter((e) => e.className === root.className)
          .length,
        1,
      );
      assertEquals(root.dataset.curtain, "appear");
      const tracks = h.AudioMock.items.filter((a) =>
        a.src.includes("Sym_movment_")
      );
      assertEquals(tracks.length, 6);
      const score = api.getDangerScore();
      assertEquals(score, 75 / departments);

      // 固定更新从实测的 Time.time - Time.fixedTime 相位开始。
      const observed: number[] = [];
      const sideFrames: number[] = [];
      let previousScale = "1";
      const headings = root.children.filter((n) =>
        n.className === "lobotomy-orchestra-title"
      );
      const finale = tracks[5];
      const pauses = finale.pauseCount;
      let heldAlpha = 0;
      for (let frame = 1; !root.removed && frame <= 102 * fps; frame++) {
        h.setNow(fixedPhase * 1000 + frame * 1000 / fps);
        const tick = h.pendingTimer(1000 / 60);
        assert(tick, `第 ${frame} 帧缺少更新`);
        tick.callback();
        const scale = root.styleProperties.get("--orchestra-side-scale") ?? "1";
        if (scale !== previousScale) {
          sideFrames.push(frame);
          previousScale = scale;
        }
        for (const [id, timer] of h.timers) {
          if (timer.fired) h.timers.delete(id);
        }
        const next = observed.length;
        if (next < tracks.length && tracks[next].playCount === 2) {
          observed.push(frame);
          assertEquals(tracks[next].currentTime, 0);
          if (next > 0) {
            assertEquals(root.dataset.curtain, "open");
            assertEquals(Number(headings[next - 1].style.opacity ?? 0), 0);
            tracks[next - 1].dispatch("ended");
          }
        } else if (next === 6 && root.dataset.curtain === "close") {
          observed.push(frame);
        } else if (root.removed) {
          observed.push(frame);
        }
        if (frame === 4.5 * fps) {
          assertEquals(
            root.styleProperties.get("--orchestra-side-scale"),
            "0.66",
          );
        }
        if (frame === 10 * fps) {
          assertEquals(root.styleProperties.get("--orchestra-side-scale"), "0");
        }
        if (frame === 16.5 * fps) {
          heldAlpha = Number(headings[0].style.opacity);
          assert(heldAlpha > 0.95 && heldAlpha < 1);
        }
        if (frame === 17.5 * fps) {
          assertEquals(Number(headings[0].style.opacity), heldAlpha);
        }
      }
      assertEquals(observed.length, native.length);
      assertEquals(observed, [...native]);
      assertEquals(
        sideFrames,
        {
          30: [90, 120, 150, 211, 241, 271, 2911, 2940, 2970],
          60: [180, 240, 300, 421, 481, 541, 5814, 5873, 5933],
          120: [361, 481, 601, 842, 963, 1083, 11622, 11741, 11862],
        }[fps],
      );
      assert(root.removed);
      assertEquals(finale.pauseCount, pauses);
      assert(findByClass(h.body, restart.className));
      if (interrupt) {
        // 危急值归零时警报撤下；余音接替的面板须保持按钮父级与 CanvasScaler。
        await api.setDangerScore(0);
        const buttons = findAllByClass(h.body, restart.className);
        assertEquals(buttons.length, 1);
        assertEquals(buttons[0].parentElement?.className, frame.className);
        const panel = requireByClass(h.body, "lobotomy-corp-top-panel");
        assertEquals(panel.dataset.lobotomyCorpTopPanelReused, "true");
        assert(panel.styleProperties.has("--lobotomy-corp-unity-canvas-scale"));
        buttons[0].dispatch("click");
        assert(finale.pauseCount > pauses);
        assertEquals(api.getDangerScore(), 0);
      } else {
        finale.dispatch("ended");
        assertEquals(api.getDangerScore(), score);
      }
      assertEquals(findByClass(h.body, restart.className), undefined);
    } finally {
      h.restore();
    }
  });
}

Deno.test("沉默乐团：开场保留背景音乐，第一乐章淡出，镇压回收到期才淡入", () => {
  const h = installLobotomyCorpAlertHarness();
  const event = createSilentOrchestraEvent({
    assetRoot: "/assets",
    mountRestartButton() {},
    finishRestartButton() {},
    ensureCoordinator() {},
    refreshAlertVolume() {},
  });
  try {
    const phase = 0.01333334 * 1000;
    h.setNow(phase);
    event.start();
    for (let frame = 1; frame <= 6712; frame++) {
      h.setNow(phase + frame * 1000 / 60);
      h.pendingTimer(1000 / 60)!.callback();
      for (const [id, timer] of h.timers) {
        if (timer.fired) h.timers.delete(id);
      }
      if (frame <= 902) assertEquals(event.bgmGain(), 1);
      if (frame === 903) {
        assert(Math.abs(event.bgmGain() - (1 - 1 / 120)) < 0.00001);
      }
      if (frame === 962) assert(Math.abs(event.bgmGain() - 0.5) < 0.00001);
      if (frame >= 1023 && frame < 6592) assertEquals(event.bgmGain(), 0);
      if (frame === 6592) assert(Math.abs(event.bgmGain() - 1 / 120) < 0.00001);
      if (frame === 6712) assertEquals(event.bgmGain(), 1);
    }
    event.finish();
    assertEquals(event.bgmGain(), 1);
  } finally {
    event.finish();
    h.restore();
  }
});

Deno.test("沉默乐团：避难所和普通提交共用事件，合幕前中断取消全部待播乐段", async () => {
  const h = installLobotomyCorpAlertHarness({ pollingIntervalValue: "11" });
  const random = Math.random;
  try {
    const data = JSON.parse(Deno.readTextFileSync(
      new URL(
        "../../../static/fun/lobotomy-corp/Data/Abnormalities.json",
        import.meta.url,
      ),
    ));
    const ids = escapableAbnormalityIds(data);
    Math.random = () => (ids.indexOf("T-01-31") + 0.5) / ids.length;
    await h.reload();
    await h.api().commitDisplayName("T-09-82");
    h.pendingTimer(30000)!.callback();
    requireByClass(h.documentElement, "lobotomy-orchestra");
    const opening = h.pendingTimer(1000 / 60)!;
    await h.api().commitDisplayName("T-01-31");
    assertEquals(h.api().getDangerScore(), 75 / 11);
    requireByClass(h.body, "lobotomy-corp-top-panel-action-button").dispatch(
      "click",
    );
    assert(opening.cleared);
    opening.callback();
    assert(
      h.AudioMock.items.filter((a) => a.src.includes("Sym_movment_")).every((
        a,
      ) => !a.playCount),
    );
  } finally {
    Math.random = random;
    h.restore();
  }
});

Deno.test("沉默乐团：网页入口可读取演出模块、全部 UI 贴图及独立原声", async () => {
  const paths = [
    "Events/SilentOrchestra.js",
    ...[
      "Curtain",
      "CurtainUpperLeft",
      "CurtainUpperRight",
      "Movement1",
      "Movement2",
      "Movement3",
      "Movement4",
      "Finale",
    ]
      .flatMap((name) =>
        ["", "rgb/"].map((plane) =>
          `Assets/Resources/sprites/creaturesprite/silentorchestra/${plane}${name}.png`
        )
      ),
    ...["0_clap", "1_mov1", "2_mov2", "3_mov3", "4_mov4", "5_finale"]
      .map((name) =>
        `Assets/Resources/sounds/creature/silentorchestra/Sym_movment_${name}.ogg`
      ),
  ];
  for (const path of paths) {
    const res = await lobotomyCorpAssetResponse(path);
    assertEquals(res.status, 200, path);
    assert((await res.arrayBuffer()).byteLength > 0, path);
  }
});
