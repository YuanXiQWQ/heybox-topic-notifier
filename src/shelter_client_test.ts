/**
 * @file 本文件验证“3月27日的避难所”与现有异想体提交、特殊事件及生命周期联动。
 */
import {
  assert,
  assertEquals,
  assertStrictEquals,
  findByClass,
} from "./test_helpers.ts";
import { installLobotomyCorpAlertHarness } from "./test_harness.ts";
import {
  escapableAbnormalityIds,
  shelterInitialReleaseDelayMs,
  shelterReleaseIntervalMs,
  shelterStorageKey,
} from "../static/fun/lobotomy-corp/Events/Shelter.js";

/**
 * 等待当前排队的微任务完成。
 *
 * @return {Promise<void>} 微任务清空后完成。
 */
async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

/**
 * 读取当前注入的全部异想体资料。
 *
 * @return {Record<string, {canBreach?: boolean}>} 异想体资料。
 */
function readAbnormalities(): Record<string, {canBreach?: boolean}> {
  return JSON.parse(Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/Data/Abnormalities.json",
      import.meta.url,
    ),
  ));
}

/**
 * 按给定顺序让 `Math.random()` 选中指定异想体。
 *
 * @param {readonly string[]} candidates 候选编号。
 * @param {readonly string[]} sequence 要依次选中的编号。
 * @return {() => void} 恢复原随机函数的回调。
 */
function selectShelterSequence(
  candidates: readonly string[],
  sequence: readonly string[],
): () => void {
  const originalRandom = Math.random;
  let index = 0;
  Math.random = () => {
    const selected = sequence[Math.min(index, sequence.length - 1)];
    index += 1;
    const candidateIndex = candidates.indexOf(selected);
    assert(candidateIndex >= 0, `缺少随机候选：${selected}`);
    return (candidateIndex + 0.25) / candidates.length;
  };
  return () => {
    Math.random = originalRandom;
  };
}

/**
 * 点击顶部“重新开始这一天”并等待面板动画收尾。
 *
 * @param harness 彩蛋测试环境。
 * @return {Promise<boolean>} Restart Day 完成时返回 true。
 */
async function restartLobotomyCorpDay(
  harness: ReturnType<typeof installLobotomyCorpAlertHarness>,
): Promise<boolean> {
  const completion = harness.api().restartDay();
  const overlay = harness.overlay();
  if (overlay) {
    findByClass(
      overlay,
      "lobotomy-corp-top-panel-active-controller",
    )?.dispatch("animationend");
  }
  return await completion;
}

Deno.test("避难所：输入 T-09-82 后延迟释放普通异想体，Restart Day 终止调度", async () => {
  const harness = installLobotomyCorpAlertHarness();
  const candidates = escapableAbnormalityIds(readAbnormalities());
  const restoreRandom = selectShelterSequence(candidates, ["T-01-54"]);
  try {
    await harness.reload();
    const api = harness.api();
    await api.commitDisplayName("T-09-82");

    assertStrictEquals(api.shelterActive(), true);
    assertEquals(api.getDangerScore(), 0);
    assert(harness.pendingTimer(shelterInitialReleaseDelayMs));
    assert(harness.storage.getItem(shelterStorageKey));

    harness.pendingTimer(shelterInitialReleaseDelayMs)!.callback();
    await flushMicrotasks();

    assert(Math.abs(api.getDangerScore() - 20 / 11) < 1e-10);
    assert(harness.pendingTimer(shelterReleaseIntervalMs));
    assertStrictEquals(api.shelterActive(), true);

    assertStrictEquals(await restartLobotomyCorpDay(harness), true);
    assertEquals(api.getDangerScore(), 0);
    assertStrictEquals(api.shelterActive(), false);
    assertEquals(harness.storage.getItem(shelterStorageKey), null);
    assertEquals(harness.pendingTimer(shelterReleaseIntervalMs), undefined);
  } finally {
    restoreRandom();
    harness.restore();
  }
});

Deno.test("避难所：连续释放两只鸟会按既有流程启动终末鸟", async () => {
  const harness = installLobotomyCorpAlertHarness();
  const candidates = escapableAbnormalityIds(readAbnormalities());
  const restoreRandom = selectShelterSequence(
    candidates,
    ["O-02-40", "O-02-62"],
  );
  try {
    await harness.reload();
    const api = harness.api();
    await api.handleAbnormalitySubmitted("T-09-82");

    harness.pendingTimer(shelterInitialReleaseDelayMs)!.callback();
    await flushMicrotasks();
    assertStrictEquals(api.blackForestPhase(), "recording");

    harness.pendingTimer(shelterReleaseIntervalMs)!.callback();
    await flushMicrotasks();
    assertStrictEquals(api.blackForestPhase(), "cg");
    assertStrictEquals(api.blackForestActive(), true);
    assertStrictEquals(api.shelterActive(), true);

    await restartLobotomyCorpDay(harness);
    assertStrictEquals(api.blackForestActive(), false);
    assertStrictEquals(api.shelterActive(), false);
    assertEquals(harness.storage.getItem(shelterStorageKey), null);
  } finally {
    restoreRandom();
    harness.restore();
  }
});

Deno.test("避难所：随机释放白夜会启动既有的白夜事件", async () => {
  const harness = installLobotomyCorpAlertHarness();
  const candidates = escapableAbnormalityIds(readAbnormalities());
  const restoreRandom = selectShelterSequence(candidates, ["T-03-46"]);
  try {
    await harness.reload();
    const api = harness.api();
    await api.handleAbnormalitySubmitted("T-09-82");

    harness.pendingTimer(shelterInitialReleaseDelayMs)!.callback();
    await flushMicrotasks();

    assertStrictEquals(api.getSpecialEvent(), "white-night");
    assertEquals(api.getDangerScore(), 44);
    assertStrictEquals(api.getSpecialEventPhase(), "prelude");
    assertStrictEquals(api.shelterActive(), true);

    await restartLobotomyCorpDay(harness);
    assertStrictEquals(api.getSpecialEvent(), undefined);
    assertStrictEquals(api.shelterActive(), false);
  } finally {
    restoreRandom();
    harness.restore();
  }
});

Deno.test("避难所：内部导航保留调度，刷新页面终止事件", async () => {
  const harness = installLobotomyCorpAlertHarness();
  const candidates = escapableAbnormalityIds(readAbnormalities());
  const restoreRandom = selectShelterSequence(candidates, ["T-01-54"]);
  try {
    await harness.reload();
    await harness.api().handleAbnormalitySubmitted("T-09-82");
    assertStrictEquals(harness.api().shelterActive(), true);

    harness.setNavigationType("navigate");
    await harness.reload();
    assertStrictEquals(harness.api().shelterActive(), true);
    assert(harness.storage.getItem(shelterStorageKey));

    harness.setNavigationType("reload");
    await harness.reload();
    assertStrictEquals(harness.api().shelterActive(), false);
    assertEquals(harness.storage.getItem(shelterStorageKey), null);
  } finally {
    restoreRandom();
    harness.restore();
  }
});

Deno.test("避难所：切换到其它游戏彩蛋时终止调度", async () => {
  const harness = installLobotomyCorpAlertHarness();
  const browser = globalThis as typeof globalThis & {
    easterEggCoordinator?: {
      finish?: (gameId: string, stop: () => void) => void;
      start: (gameId: string, stop: () => void) => void;
    };
  };
  const originalCoordinator = browser.easterEggCoordinator;
  let coordinatorStop: (() => void) | undefined;
  try {
    browser.easterEggCoordinator = {
      start: (_gameId, stop) => coordinatorStop = stop,
    };
    await harness.reload();
    await harness.api().handleAbnormalitySubmitted("T-09-82");

    assert(coordinatorStop);
    assertStrictEquals(harness.api().shelterActive(), true);
    coordinatorStop();

    assertStrictEquals(harness.api().shelterActive(), false);
    assertEquals(harness.storage.getItem(shelterStorageKey), null);
  } finally {
    if (originalCoordinator) {
      browser.easterEggCoordinator = originalCoordinator;
    } else {
      delete browser.easterEggCoordinator;
    }
    harness.restore();
  }
});
