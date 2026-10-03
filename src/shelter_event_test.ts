/**
 * @file 本文件验证“3月27日的避难所”随机释放调度、恢复与清理规则。
 */
import {
  assertEquals,
  assertStrictEquals,
} from "./test_helpers.ts";
import { StorageMock } from "./test_harness.ts";
import {
  createShelterEvent,
  escapableAbnormalityIds,
  shelterAbnormalityForRandomValue,
  shelterEventId,
  shelterInitialReleaseDelayMs,
  shelterReleaseIntervalMs,
  shelterStorageKey,
} from "../static/fun/lobotomy-corp/Events/Shelter.js";

/** 避难所单测的初始配置。 */
type ShelterTestOptions = {
  abnormalities?: Record<string, {canBreach?: boolean}>;
  now?: number;
  randomValues?: number[];
  reload?: boolean;
};

/** 受控计时器的记录。 */
type ShelterTestTimer = {
  callback: () => void;
  cleared: boolean;
  delay: number;
  fired: boolean;
};

/** 避难所单测环境。 */
type ShelterTestHarness = {
  controller: ReturnType<typeof createShelterEvent>;
  coordinatorStarts: () => number;
  setReload: (value: boolean) => void;
  setNow: (value: number) => void;
  releases: string[];
  storage: StorageMock;
  timers: Map<number, ShelterTestTimer>;
};

/**
 * 创建使用受控时间与内存存储的避难所调度环境。
 */
function createShelterTestHarness(
  options: ShelterTestOptions = {},
): ShelterTestHarness {
  let now = options.now ?? 0;
  let nextTimerId = 0;
  let reload = options.reload ?? false;
  const storage = new StorageMock();
  const releases: string[] = [];
  const randomValues = [...(options.randomValues ?? [])];
  /** @type {Map<number, ShelterTestTimer>} */
  const timers = new Map();
  let coordinatorStarts = 0;
  const controller = createShelterEvent({
    abnormalities: () =>
      options.abnormalities ?? {
        "O-01-45": {canBreach: false},
        "O-02-40": {canBreach: true},
        "O-02-56": {canBreach: true},
        "O-05-47": {canBreach: false},
        "T-03-46": {canBreach: true},
      },
    clearTimer: (timer) => {
      const pending = timers.get(timer);
      if (pending) pending.cleared = true;
    },
    ensureCoordinator: () => coordinatorStarts++,
    isReload: () => reload,
    now: () => now,
    random: () => randomValues.shift() ?? 0,
    releaseAbnormality: (canonicalId) => releases.push(canonicalId),
    setTimer: (callback, delay) => {
      const id = ++nextTimerId;
      timers.set(id, {callback, cleared: false, delay, fired: false});
      return id;
    },
    storageKey: shelterStorageKey,
    storages: () => [storage],
  });
  return {
    controller,
    coordinatorStarts: () => coordinatorStarts,
    setReload: (value) => reload = value,
    setNow: (value) => now = value,
    releases,
    storage,
    timers,
  };
}

Deno.test("避难所：只有可出逃异想体进入随机候选", () => {
  const ids = escapableAbnormalityIds({
    "O-01-45": {canBreach: false},
    "O-02-40": {canBreach: true},
    "O-02-56": {canBreach: true},
    "O-05-47": {canBreach: false},
    "T-03-46": {canBreach: true},
  });
  assertEquals(ids, ["O-02-40", "O-02-56", "T-03-46"]);
  assertEquals(shelterAbnormalityForRandomValue(ids, 0), "O-02-40");
  assertEquals(shelterAbnormalityForRandomValue(ids, 0.5), "O-02-56");
  assertEquals(
    shelterAbnormalityForRandomValue(ids, Number.POSITIVE_INFINITY),
    "O-02-40",
  );
  assertEquals(shelterAbnormalityForRandomValue([], 0.5), undefined);
});

Deno.test("避难所：首次等待 30 秒，之后每 5 秒释放一个异想体", () => {
  const harness = createShelterTestHarness({
    randomValues: [0, 0.999],
  });
  try {
    assertStrictEquals(harness.controller.start(), true);
    assertStrictEquals(harness.controller.start(), false);
    assertEquals(harness.controller.isActive(), true);
    assertEquals(harness.coordinatorStarts(), 1);
    assertEquals(
      harness.controller.getNextReleaseAt(),
      shelterInitialReleaseDelayMs,
    );
    assertEquals(
      JSON.parse(harness.storage.getItem(shelterStorageKey) ?? "{}"),
      {id: shelterEventId, nextReleaseAt: shelterInitialReleaseDelayMs},
    );

    harness.setNow(shelterInitialReleaseDelayMs);
    [...harness.timers.values()][0].callback();
    assertEquals(harness.releases, ["O-02-40"]);
    assertEquals(harness.controller.getReleaseCount(), 1);
    assertEquals(
      harness.controller.getNextReleaseAt(),
      shelterInitialReleaseDelayMs + shelterReleaseIntervalMs,
    );

    harness.setNow(
      shelterInitialReleaseDelayMs + shelterReleaseIntervalMs,
    );
    [...harness.timers.values()][1].callback();
    assertEquals(harness.releases, ["O-02-40", "T-03-46"]);
    assertEquals(harness.controller.getReleaseCount(), 2);
  } finally {
    harness.controller.finish();
  }
});

Deno.test("避难所：结束会取消计时器并清除持久化状态", () => {
  const harness = createShelterTestHarness();
  try {
    harness.controller.start();
    const timer = [...harness.timers.values()][0];
    assertStrictEquals(harness.controller.finish(), true);
    assertEquals(timer.cleared, true);
    assertEquals(harness.controller.isActive(), false);
    assertEquals(harness.controller.getNextReleaseAt(), undefined);
    assertEquals(harness.storage.getItem(shelterStorageKey), null);

    timer.callback();
    assertEquals(harness.releases, []);
  } finally {
    harness.controller.finish();
  }
});

Deno.test("避难所：内部导航恢复剩余等待，浏览器刷新直接终止", () => {
  const harness = createShelterTestHarness({now: 5000});
  try {
    harness.storage.setItem(
      shelterStorageKey,
      JSON.stringify({id: shelterEventId, nextReleaseAt: 12000}),
    );
    assertStrictEquals(harness.controller.restore(), true);
    assertEquals(harness.controller.getNextReleaseAt(), 12000);
    assertEquals([...harness.timers.values()][0].delay, 7000);
    harness.controller.finish();

    harness.storage.setItem(
      shelterStorageKey,
      JSON.stringify({id: shelterEventId, nextReleaseAt: 12000}),
    );
    harness.setReload(true);
    assertStrictEquals(harness.controller.restore(), false);
    assertEquals(harness.storage.getItem(shelterStorageKey), null);
    assertEquals(harness.timers.size, 1);
  } finally {
    harness.controller.finish();
  }
});
