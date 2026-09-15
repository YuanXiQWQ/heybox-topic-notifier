/** @file 脑叶公司多个特殊事件并发、终止与标签页限制回归测试。 */
import {
  assert,
  assertEquals,
  assertStrictEquals,
} from "./test_helpers.ts";
import { installLobotomyCorpAlertHarness } from "./test_harness.ts";
import {
  plagueDoctorAdventSchedule,
  plagueDoctorApostleCount,
  plagueDoctorBindingTimings,
  plagueDoctorStorageKey,
} from "../static/fun/lobotomy-corp/Events/PlagueDoctor.js";

/** 让等待中的微任务全部执行。 */
async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

/**
 * 推进受控时钟并触发当前排队的动画帧。
 *
 * @param harness 彩蛋测试环境。
 * @param clock 当前受控时钟。
 * @param ms 推进的毫秒数。
 * @return {Promise<void>} 演出与微任务处理结束时完成。
 */
async function advance(
  harness: ReturnType<typeof installLobotomyCorpAlertHarness>,
  clock: { value: number },
  ms: number,
): Promise<void> {
  clock.value += ms;
  harness.setNow(clock.value);
  harness.fireFrames();
  await flushMicrotasks();
  harness.fireFrames();
  await flushMicrotasks();
}

Deno.test("特殊事件：白夜进行期间可以启动终末鸟和别碰我", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    const clock = {value: 0};
    assertStrictEquals(
      api.startWhiteNight({source: "direct-submission"}),
      true,
    );
    assertStrictEquals(api.getSpecialEvent(), "white-night");

    await api.handleAbnormalitySubmitted("O-02-63");

    assertStrictEquals(api.blackForestPhase(), "cg");
    assertStrictEquals(api.blackForestActive(), true);
    assertStrictEquals(api.blocksDisplayNameSave("O-05-47"), true);

    await advance(harness, clock, 32000);

    assertStrictEquals(api.blackForestPhase(), "hunt");
    const blackForest = JSON.parse(
      harness.storage.getItem("warmnest.lobotomy-corp-black-forest") ?? "{}",
    );
    assertEquals(Object.keys(blackForest.eggs).length, 3);
    assert(
      Object.keys(blackForest.eggs).every((slot) =>
        slot.startsWith("settings.")
      ),
      "白夜进行期间启动的终末鸟事件只能使用设置页蛋槽",
    );
  } finally {
    harness.restore();
  }
});

Deno.test("特殊事件：终末鸟进行期间可以启动白夜", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    await api.handleAbnormalitySubmitted("O-02-63");
    assertStrictEquals(api.blackForestActive(), true);

    void api.handleAbnormalitySubmitted("T-03-46");
    await flushMicrotasks();

    assertStrictEquals(api.getSpecialEvent(), "white-night");
    assertStrictEquals(api.blackForestActive(), true);
  } finally {
    harness.restore();
  }
});

Deno.test("特殊事件：疫医转变进入白夜时保留终末鸟并迁移未找到的蛋", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: Array.from(
          {length: plagueDoctorApostleCount},
          (_value, index) => `apostle-${index + 1}`,
        ),
        recording: true,
        transformed: false,
      }),
    );
    await harness.reload();
    const api = harness.api();
    const clock = {value: 0};
    await api.handleAbnormalitySubmitted("O-02-63");
    assertStrictEquals(api.blackForestActive(), true);

    await api.commitDisplayName("O-01-45");
    assertStrictEquals(api.getSpecialEvent(), undefined);
    assertStrictEquals(api.blackForestActive(), true);

    await advance(
      harness,
      clock,
      plagueDoctorAdventSchedule(plagueDoctorApostleCount).totalMs,
    );

    assertStrictEquals(api.getSpecialEvent(), "white-night");
    assertStrictEquals(api.blackForestPhase(), "hunt");
    assertStrictEquals(api.blackForestActive(), true);
    const blackForest = JSON.parse(
      harness.storage.getItem("warmnest.lobotomy-corp-black-forest") ?? "{}",
    );
    assertEquals(Object.keys(blackForest.eggs).length, 3);
    assert(
      Object.keys(blackForest.eggs).every((slot) =>
        slot.startsWith("settings.")
      ),
      "白夜进行期间，所有未找到的蛋都应位于设置页",
    );
  } finally {
    harness.restore();
  }
});

Deno.test("特殊事件：白夜已运行时疫医不再并发播放完整降临", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: Array.from(
          {length: plagueDoctorApostleCount},
          (_value, index) => `apostle-${index + 1}`,
        ),
        recording: true,
        transformed: false,
      }),
    );
    await harness.reload();
    const api = harness.api();
    assertStrictEquals(
      api.startWhiteNight({source: "direct-submission"}),
      true,
    );

    await api.commitDisplayName("O-01-45");

    assertStrictEquals(api.getSpecialEvent(), "white-night");
    assertEquals(api.plagueDoctorApostles().length, plagueDoctorApostleCount);
    assertStrictEquals(
      harness.createdElements().some((element) =>
        element.className === "lobotomy-corp-plague-doctor-advent"
      ),
      false,
    );
  } finally {
    harness.restore();
  }
});

Deno.test("特殊事件：白夜中断绑定并保留使徒，结束后需重新提交疫医编号", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    const clock = {value: 0};
    await api.commitDisplayName("O-01-45");
    await api.commitDisplayName("使徒甲");
    assertStrictEquals(
      api.startWhiteNight({source: "direct-submission"}),
      true,
    );
    await advance(harness, clock, 4000);

    assertEquals(api.plagueDoctorApostles(), ["使徒甲"]);
    assertStrictEquals(api.plagueDoctorRecording(), true);
    assertStrictEquals(api.blocksDisplayNameSave("O-01-45"), false);
    await api.commitDisplayName("使徒乙");
    await api.commitDisplayName("O-01-45");
    assertEquals(api.plagueDoctorApostles(), ["使徒甲"]);

    const confession = api.commitDisplayName("O-03-03");
    await flushMicrotasks();
    harness.pendingTimer(5700)?.callback();
    harness.pendingTimer(8830)?.callback();
    await confession;
    assertStrictEquals(api.getSpecialEvent(), undefined);

    await api.commitDisplayName("使徒乙");
    assertEquals(api.plagueDoctorApostles(), ["使徒甲"]);
    await api.commitDisplayName("O-01-45");
    await api.commitDisplayName("使徒乙");
    await advance(harness, clock, plagueDoctorBindingTimings.nameEffectMs);
    assertEquals(api.plagueDoctorApostles(), ["使徒甲", "使徒乙"]);
  } finally {
    harness.restore();
  }
});

Deno.test("特殊事件：疫医完整降临期间保存白夜编号只保存名称", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: Array.from(
          {length: plagueDoctorApostleCount},
          (_value, index) => `apostle-${index + 1}`,
        ),
        recording: true,
        transformed: false,
      }),
    );
    await harness.reload();
    const api = harness.api();
    await api.commitDisplayName("O-01-45");

    assertStrictEquals(api.blocksDisplayNameSave("T-03-46"), false);
    await api.commitDisplayName("T-03-46");
    assertStrictEquals(
      api.getSpecialEvent(),
      undefined,
    );
    assert(
      harness.createdElements().some((element) =>
        element.className === "lobotomy-corp-plague-doctor-advent"
      ),
      "完整降临应继续进行",
    );
  } finally {
    harness.restore();
  }
});

Deno.test("特殊事件：白夜自身结束不会终止并发中的终末鸟", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    const clock = {value: 0};
    assertStrictEquals(
      api.startWhiteNight({source: "direct-submission"}),
      true,
    );
    await advance(harness, clock, 4000);
    await api.handleAbnormalitySubmitted("O-02-63");
    assertStrictEquals(api.blackForestActive(), true);

    const confession = api.commitDisplayName("O-03-03");
    await flushMicrotasks();
    harness.pendingTimer(5700)?.callback();
    harness.pendingTimer(8830)?.callback();
    await confession;

    assertStrictEquals(api.getSpecialEvent(), undefined);
    assertStrictEquals(api.blackForestActive(), true);
  } finally {
    harness.restore();
  }
});

Deno.test("特殊事件：别碰我假关服终止全部事件", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    assertStrictEquals(
      api.startWhiteNight({source: "direct-submission"}),
      true,
    );
    await api.handleAbnormalitySubmitted("O-02-63");
    assertStrictEquals(api.blackForestActive(), true);

    for (let index = 0; index < 5; index++) void api.playDontTouchMe();
    const shutdown = harness.pendingTimer(4000);
    assert(shutdown, "第五次点击应等待假关服前摇");
    shutdown.callback();

    assertStrictEquals(api.getSpecialEvent(), undefined);
    assertStrictEquals(api.blackForestActive(), false);
    assertStrictEquals(harness.assignedLocations().length, 0);
  } finally {
    harness.restore();
  }
});
