/** @file 白夜特殊事件的状态、媒体与动画事件回归测试。 */
import {
  assert,
  assertEquals,
  assertStrictEquals,
  requireByClass,
  stripJavaScriptCommentsAndStrings,
} from "./test_helpers.ts";
import { AudioMock, Element } from "./test_harness.ts";
import {
  createWhiteNightConfessionViewportRenderer,
  createWhiteNightEvent,
  whiteNightConfessionSuppressionDelayMs,
  whiteNightConfessionViewportLayout,
  whiteNightConfessionViewportSlice,
  whiteNightConfessParticleSystem,
  whiteNightDeathSequenceDurationMs,
  whiteNightDeathSounds,
  whiteNightStageMusicAudibleMs,
} from "../static/fun/lobotomy-corp/Events/WhiteNight.js";

/**
 * 创建足以驱动白夜 Event 的最小 DOM 节点。
 *
 * @return {object} 事件测试的 document mock。
 */
function createDocumentMock() {
  const body = new Element();
  return {
    body,
    createElement: () => new Element(),
    querySelector: () => undefined,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

/**
 * 创建可验证 capture 阻断和 DOM 清理的 document mock。
 *
 * @return {object} document、控件及事件派发 API。
 */
function createInteractiveDocument() {
  type Listener = (event: Record<string, unknown>) => void;
  const listeners = new Map<string, Listener[]>();
  const body = new Element();
  const pollingValue = new Element();
  pollingValue.value = "5";
  pollingValue.selectors.add("[data-polling-interval-value]");
  const pollingUnit = new Element();
  pollingUnit.value = "minute";
  pollingUnit.selectors.add("[data-polling-interval-unit]");
  const saveHost = new Element();
  const saveButton = new Element();
  saveButton.textContent = "Save";
  saveButton.setAttribute("aria-label", "Save account");
  saveButton.selectors.add("[data-account-save-button]");
  saveHost.append(saveButton);
  const displayNameInput = new Element();
  displayNameInput.selectors.add("[data-account-display-name-input]");

  /** @param {Element} root 根节点。 @param {string} className 类名。 @return {Element[]} 匹配节点。 */
  const nodesByClass = (
    root: Element,
    className: string,
  ): Element[] => [
    ...(root.className === className ? [root] : []),
    ...root.children.flatMap((child) => nodesByClass(child, className)),
  ];
  const document = {
    body,
    /** @return {Element} 新节点。 */
    createElement: () => new Element(),
    /** @param {string} selector 选择器。 @return {Element|undefined} 匹配控件。 */
    querySelector: (selector: string) =>
      selector === "[data-account-save-button]"
        ? saveButton
        : selector === "[data-account-display-name-input]"
        ? displayNameInput
        : undefined,
    /** @param {string} selector 选择器。 @return {Element[]} 匹配控件。 */
    querySelectorAll: (selector: string) =>
      selector.includes("[data-polling-interval-value]")
        ? [pollingValue, pollingUnit]
        : selector === ".lobotomy-corp-confession-work-icon"
        ? nodesByClass(saveHost, "lobotomy-corp-confession-work-icon")
        : selector === ".lobotomy-corp-white-night-message"
        ? nodesByClass(body, "lobotomy-corp-white-night-message")
        : [],
    /** @param {string} type 类型。 @param {Listener} listener 监听器。 */
    addEventListener: (type: string, listener: Listener) =>
      listeners.set(type, [...(listeners.get(type) ?? []), listener]),
    /** @param {string} type 类型。 @param {Listener} listener 监听器。 */
    removeEventListener: (type: string, listener: Listener) =>
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((item) => item !== listener),
      ),
  };

  /**
   * 按注册顺序派发事件并模拟 stopImmediatePropagation。
   *
   * @param {string} type 事件类型。
   * @param {Element} target 事件目标。
   * @param {Record<string, unknown>} extra 补充字段。
   * @return {{prevented: boolean, stopped: boolean}} 阻断结果。
   */
  const dispatch = (
    type: string,
    target: Element,
    extra: Record<string, unknown> = {},
  ) => {
    const result = { prevented: false, stopped: false };
    const event = {
      ...extra,
      target,
      preventDefault: () => result.prevented = true,
      stopImmediatePropagation: () => result.stopped = true,
    };
    for (const listener of [...(listeners.get(type) ?? [])]) {
      listener(event);
      if (result.stopped) break;
    }
    return result;
  };
  return {
    body,
    dispatch,
    displayNameInput,
    document,
    listeners,
    pollingUnit,
    pollingValue,
    saveButton,
    saveHost,
  };
}

Deno.test("WhiteNight follows Confess suppression, Dead_23 events, and complete audio tails", async () => {
  const browser = globalThis as typeof globalThis & {
    Audio?: unknown;
    document?: unknown;
    setTimeout?: unknown;
    clearTimeout?: unknown;
  };
  const originals = Object.fromEntries(
    ["Audio", "document", "setTimeout", "clearTimeout"].map((
      name,
    ) => [name, Object.getOwnPropertyDescriptor(browser, name)]),
  );
  const scheduled: Array<{ callback: () => void; delay: number }> = [];
  // 死亡音效从非零进度起播，且释放媒体后仍按 src 过滤实例，因此不清空 src。
  AudioMock.reset();
  AudioMock.initialCurrentTime = 91;
  AudioMock.initialMuted = true;
  const document = createDocumentMock();
  let resumeCount = 0;
  let pausedDecay = 0;
  let resumedDecay = 0;
  try {
    Object.defineProperties(browser, {
      Audio: { configurable: true, value: AudioMock },
      document: { configurable: true, value: document },
      setTimeout: {
        configurable: true,
        value: (
          callback: () => void,
          delay = 0,
        ) => (scheduled.push({ callback, delay }), scheduled.length),
      },
      clearTimeout: { configurable: true, value: () => {} },
    });
    const storages = [{
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {},
    }];
    const event = createWhiteNightEvent({
      assetRoot: "/Assets",
      confessionAliases: () => new Set(["confession"]),
      ensureCoordinator: () => {},
      finishRestartPanel: () => {},
      getAlert: () => ({ holdMusicForSpecialEvent: () => {} }),
      holdAlertMusic: () => {},
      isReload: () => false,
      messages: () => ({ "oneSin.specialWork.confession": "Confess" }),
      mountRestartPanel: () => {},
      normalize: (value: string) => value.trim().toLowerCase(),
      pauseDangerDecay: () => pausedDecay++,
      resumeAlertMusic: () => resumeCount++,
      resumeDangerDecay: () => resumedDecay++,
      storageKey: "white-night",
      storages: () => storages,
    }) as {
      confess: () => Promise<boolean>;
      finish: () => void;
      getId: () => string | undefined;
      getPhase: () => string | undefined;
      start: (options: { source: string }) => boolean;
    };
    event.start({ source: "plague-doctor-transformation" });
    assertEquals(event.getId(), "white-night");
    assertEquals(pausedDecay, 1);
    assertEquals(
      document.body.children.filter((node) =>
        node.className === "lobotomy-corp-white-night-entity"
      ).length,
      1,
    );
    const completion = event.confess();
    assertEquals(event.getPhase(), "ending");
    assertEquals(resumeCount, 0);
    assertEquals(
      document.body.children.filter((node) =>
        node.className === "lobotomy-corp-white-night-entity"
      ).length,
      1,
    );
    const deathEntity = document.body.children.find((node) =>
      node.className === "lobotomy-corp-white-night-confession-entity"
    )!;
    const confessionVideo = requireByClass(
      deathEntity,
      "lobotomy-corp-white-night-confession-video",
    );
    const confessParticles = requireByClass(
      deathEntity,
      "lobotomy-corp-white-night-confess-particles",
    );
    assertEquals(
      confessionVideo.src,
      "",
    );
    assertStrictEquals(confessionVideo.hidden, true);
    assertEquals(confessParticles.children.length, 23);
    assertEquals(
      confessParticles.children.every((ray) =>
        ray.dataset.asset.endsWith("Texture2D/CFX3_T_RayStraight.png")
      ),
      true,
    );
    assert(
      confessParticles.children.every((ray) =>
        ray.styleProperties.get("--lobotomy-corp-ray-color") ===
          "100.000000% 96.186610% 65.441175%"
      ),
    );
    const church = AudioMock.items.find((audio) =>
      audio.src.endsWith("Lucifer_standbg0.ogg")
    )!;
    assertEquals(church.pauseCount, 0);
    const suppression = scheduled.find(({ delay }) =>
      delay === whiteNightConfessionSuppressionDelayMs
    )!;
    suppression.callback();
    assertEquals(
      document.body.children.filter((node) =>
        node.className === "lobotomy-corp-white-night-entity"
      ).length,
      0,
    );
    assertEquals(
      confessionVideo.src.endsWith("WhiteNight_Confess_Dead.webm"),
      true,
    );
    assertStrictEquals(confessionVideo.hidden, false);
    assert(church.pauseCount > 0);
    assertEquals(resumeCount, 1);
    assertEquals(
      scheduled.map(({ delay }) => delay).filter((delay) =>
        delay !== whiteNightConfessionSuppressionDelayMs
      ),
      [3167, 4267, 4800, whiteNightDeathSequenceDurationMs],
    );
    scheduled.filter(({ delay }) =>
      whiteNightDeathSounds.some(({ at }) => delay === Math.round(at * 1000))
    ).forEach(({ callback }) => callback());
    scheduled.find(({ delay }) => delay === whiteNightDeathSequenceDurationMs)!
      .callback();
    assertStrictEquals(await completion, true);
    assertEquals(resumeCount, 1);
    assertEquals(resumedDecay, 1);
    const deathAudios = AudioMock.items.filter((audio) =>
      whiteNightDeathSounds.some(({ path }) => audio.src.endsWith(path))
    );
    assertEquals(deathAudios.length, 3);
    deathAudios.forEach((audio) => {
      assertEquals(audio.currentTime, 0);
      assertStrictEquals(audio.muted, false);
      assertEquals(audio.playCount, 1);
      assert(audio.pauseCount > 0);
    });
  } finally {
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
  }
});

Deno.test("direct WhiteNight submission stays in Prelude until Simple Advent ends", async () => {
  const browser = globalThis as typeof globalThis & {
    document?: unknown;
    setTimeout?: unknown;
    clearTimeout?: unknown;
  };
  const originals = Object.fromEntries(
    ["document", "setTimeout", "clearTimeout"].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(browser, name),
    ]),
  );
  const timers: Array<{ callback: () => void; delay: number }> = [];
  let pausedDecay = 0;
  let settledActiveDanger = 0;
  const stageMusicCalls: Array<{
    alert: { assetDirectory: string };
    audibleMs: number;
    thenHold: boolean;
  }> = [];
  // 阶段警报由共享层按「本次 Danger 结算结果」提供。
  const stageAlerts = [
    { assetDirectory: "third-trumpet", level: 3, soundPath: "third.ogg" },
    { assetDirectory: "second-trumpet", level: 2, soundPath: "second.ogg" },
  ];
  let stageAlertIndex = 0;
  try {
    Object.defineProperties(browser, {
      document: { configurable: true, value: undefined },
      setTimeout: {
        configurable: true,
        value: (
          callback: () => void,
          delay = 0,
        ) => (timers.push({ callback, delay }), timers.length),
      },
      clearTimeout: { configurable: true, value: () => {} },
    });
    const event = createWhiteNightEvent({
      assetRoot: "/Assets",
      confessionAliases: () => new Set(["confession"]),
      ensureCoordinator: () => {},
      finishRestartPanel: () => {},
      getAlert: () => ({}),
      holdAlertMusic: () => {},
      isReload: () => false,
      messages: () => ({}),
      mountRestartPanel: () => {},
      normalize: (value: string) => value.trim().toLowerCase(),
      pauseDangerDecay: () => pausedDecay++,
      resumeAlertMusic: () => {},
      resumeDangerDecay: () => {},
      setSpecialEventStageAlertMusic: (
        alert: { assetDirectory: string },
        options: { audibleMs?: number; thenHold?: boolean },
      ) => {
        stageMusicCalls.push({
          alert,
          audibleMs: Number(options.audibleMs ?? 0),
          thenHold: options.thenHold === true,
        });
      },
      settleWhiteNightActive: () => settledActiveDanger++,
      stageMusicAlert: () =>
        stageAlerts[stageAlertIndex++ % stageAlerts.length],
      storageKey: "white-night",
      storages: () => [],
    }) as {
      confess: () => Promise<boolean>;
      finish: () => void;
      getPhase: () => string | undefined;
      isActive: () => boolean;
      start: (options: { source: string }) => boolean;
    };

    assertStrictEquals(event.start({ source: "direct-submission" }), true);
    assertEquals(event.getPhase(), "prelude");
    assert(!(event.isActive()));
    assertEquals(pausedDecay, 0);
    assertStrictEquals(await event.confess(), false);
    assertEquals(timers.length, 1);
    assert(timers[0].delay > 0 && timers[0].delay <= 4000);
    // Simple Advent 只负责视觉与 4 秒边界：Prelude 不暂停也不接管任何音乐，
    // 第一阶段 BGM 完全由 +44 结算正常产生的 Danger Alert 播放。
    assertEquals(stageMusicCalls.length, 0);

    timers[0].callback();
    assertEquals(settledActiveDanger, 1);
    assertEquals(event.getPhase(), "active");
    assert(event.isActive());
    assertEquals(pausedDecay, 1);
    // 第二阶段 BGM 同样由第二阶段结算结果决定，并且完整可听一个可听窗口后才淡出。
    assertEquals(stageMusicCalls.length, 1);
    assertEquals(stageMusicCalls[0].alert, stageAlerts[0]);
    assertEquals(stageMusicCalls[0].audibleMs, whiteNightStageMusicAudibleMs);
    assertStrictEquals(stageMusicCalls[0].thenHold, true);
    event.finish();

    // Restart Day 在 Prelude 期间不需要解除任何 Pause：Simple Advent 从不冻结 Alert。
    assertStrictEquals(event.start({ source: "direct-submission" }), true);
    event.finish();
  } finally {
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
  }
});

Deno.test("WhiteNight stage Trumpet follows each settlement result even when it drops", () => {
  const browser = globalThis as typeof globalThis & {
    document?: unknown;
    setTimeout?: unknown;
    clearTimeout?: unknown;
  };
  const originals = Object.fromEntries(
    ["document", "setTimeout", "clearTimeout"].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(browser, name),
    ]),
  );
  const timers: Array<{ callback: () => void; delay: number }> = [];
  const stageMusicCalls: Array<{
    alert: { assetDirectory: string };
    audibleMs: number;
    thenHold: boolean;
  }> = [];
  // 假想的第二阶段结算结果：Second（可能低于普通 Danger high-water 的 Third）。
  const stageAlerts = [
    { assetDirectory: "second-trumpet", level: 2, soundPath: "second.ogg" },
  ];
  let stageAlertIndex = 0;
  try {
    Object.defineProperties(browser, {
      document: { configurable: true, value: undefined },
      setTimeout: {
        configurable: true,
        value: (
          callback: () => void,
          delay = 0,
        ) => (timers.push({ callback, delay }), timers.length),
      },
      clearTimeout: { configurable: true, value: () => {} },
    });
    const event = createWhiteNightEvent({
      assetRoot: "/Assets",
      confessionAliases: () => new Set(),
      ensureCoordinator: () => {},
      finishRestartPanel: () => {},
      getAlert: () => ({}),
      holdAlertMusic: () => {},
      isReload: () => false,
      messages: () => ({}),
      mountRestartPanel: () => {},
      normalize: (value: string) => value,
      pauseDangerDecay: () => {},
      resumeAlertMusic: () => {},
      resumeDangerDecay: () => {},
      setSpecialEventStageAlertMusic: (
        alert: { assetDirectory: string },
        options: { audibleMs?: number; thenHold?: boolean },
      ) => {
        stageMusicCalls.push({
          alert,
          audibleMs: Number(options.audibleMs ?? 0),
          thenHold: options.thenHold === true,
        });
      },
      settleWhiteNightActive: () => {},
      stageMusicAlert: () =>
        stageAlerts[stageAlertIndex++ % stageAlerts.length],
      storageKey: "white-night",
      storages: () => [],
    }) as {
      finish: () => void;
      start: (options: { source: string }) => boolean;
    };

    assertStrictEquals(event.start({ source: "direct-submission" }), true);
    // Prelude 不接管音乐：第一阶段 BGM 由 +44 的正常 Danger Alert 播放。
    assertEquals(stageMusicCalls.length, 0);
    timers[0].callback();
    // 第二阶段：结算结果比 high-water 更低时，仍使用真实结算结果并完整可听一个可听窗口。
    assertEquals(stageMusicCalls.length, 1);
    assertEquals(stageMusicCalls[0].alert, stageAlerts[0]);
    assertEquals(stageMusicCalls[0].audibleMs, whiteNightStageMusicAudibleMs);
    assertStrictEquals(stageMusicCalls[0].thenHold, true);
    event.finish();
  } finally {
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
  }
});

Deno.test("WhiteNight stage music never hardcodes a Trumpet level", async () => {
  const source = await Deno.readTextFile(
    new URL(
      "../static/fun/lobotomy-corp/Events/WhiteNight.js",
      import.meta.url,
    ),
  );
  // 注释与字符串里提到资源名不算违规，因此只在去掉它们后的代码结构里检查标识符。
  const code = stripJavaScriptCommentsAndStrings(source);
  assert(code.includes("stageMusicAlert"));
  for (
    const forbidden of [
      "firsttrumpet",
      "secondtrumpet",
      "thirdtrumpet",
      "emergency01",
      "emergency02",
      "emergency03",
      "emergency04",
    ]
  ) {
    assert(!(code.includes(forbidden)));
  }
});

Deno.test("WhiteNight restores the staged Trumpet timeline from the saved phase", () => {
  const browser = globalThis as typeof globalThis & {
    Audio?: unknown;
    document?: unknown;
    location?: unknown;
  };
  const originals = Object.fromEntries(
    ["Audio", "document", "location"].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(browser, name),
    ]),
  );
  const originalDateNow = Date.now;
  const savedState = new Map<string, string>();
  const stageAlert = {
    assetDirectory: "third-trumpet",
    level: 3,
    soundPath: "third.ogg",
  };
  /**
   * 本 mock 使用的 WhiteNight duck 目标音量。
   *
   * 它只用于验证「WhiteNight 传入的剩余比例 → 共享层插值」这条链路自洽，
   * 因此无需与 lobotomy-corp.js 的可调常量保持同步。
   */
  const duckVolume = 0.4;
  const calls: {
    fade: Array<{ durationMs: number; startVolume: number }>;
    fadeStartRatios: number[];
    hold: number;
    stage: Array<{ alert: unknown; audibleMs: number; thenHold: boolean }>;
  } = { fade: [], fadeStartRatios: [], hold: 0, stage: [] };
  const storage = {
    /** @param {string} key 键。 @return {string|null} 值。 */
    getItem: (key: string) => savedState.get(key) ?? null,
    /** @param {string} key 键。 */ removeItem: (key: string) =>
      savedState.delete(key),
    /** @param {string} key 键。 @param {string} value 值。 */
    setItem: (key: string, value: string) => savedState.set(key, value),
  };
  /**
   * 用一个已保存的 Trumpet 演出阶段启动恢复。
   *
   * @param {Record<string, unknown>} saved 白夜持久化状态。
   * @return {object} 事件 API。
   */
  const restoreWith = (saved: Record<string, unknown>) => {
    savedState.clear();
    savedState.set("white-night", JSON.stringify(saved));
    const event = createWhiteNightEvent({
      assetRoot: "/Assets",
      confessionAliases: () => new Set(),
      ensureCoordinator: () => {},
      // 与共享层一致：淡出固定从 1 插值到 duck 音量，剩余比例 1 → 1.0、0 → duck 音量。
      alertMusicFadeOutStartVolume: (remainingRatio: number) => {
        calls.fadeStartRatios.push(remainingRatio);
        return duckVolume + (1 - duckVolume) * remainingRatio;
      },
      fadeAlertMusicToSpecialEventHold: (
        durationMs: number,
        options: { startVolume?: number },
      ) => {
        calls.fade.push({
          durationMs,
          startVolume: Number(options.startVolume ?? 1),
        });
      },
      finishRestartPanel: () => {},
      getAlert: () => ({}),
      holdAlertMusic: () => calls.hold++,
      isReload: () => false,
      messages: () => ({}),
      mountRestartPanel: () => {},
      normalize: (value: string) => value,
      pauseDangerDecay: () => {},
      resumeAlertMusic: () => {},
      resumeDangerDecay: () => {},
      setSpecialEventStageAlertMusic: (
        alert: unknown,
        options: { audibleMs?: number; thenHold?: boolean },
      ) => {
        calls.stage.push({
          alert,
          audibleMs: Number(options.audibleMs ?? 0),
          thenHold: options.thenHold === true,
        });
      },
      settleWhiteNightActive: () => {},
      specialEventMusicFadeOutMs: 1000,
      stageMusicAlert: () => stageAlert,
      storageKey: "white-night",
      storages: () => [storage],
    }) as { finish: () => void; restore: () => boolean };
    return event;
  };
  try {
    Object.defineProperties(browser, {
      Audio: { configurable: true, value: undefined },
      document: { configurable: true, value: undefined },
      location: {
        configurable: true,
        value: {
          href: "https://warmnest.test/settings",
          pathname: "/settings",
          search: "",
        },
      },
    });
    const savedBase = {
      churchPosition: 0,
      id: "white-night",
      lockLocation: "/settings",
      phase: "active",
      source: "direct-submission",
      trumpetFadeMs: 1000,
    };

    // A. 可听窗口内：只补剩余时长，不重播完整的可听窗口。
    Date.now = () => 50000;
    const audible = restoreWith({
      ...savedBase,
      trumpetDeadline: 51500,
      trumpetPhase: "audible",
    });
    assertStrictEquals(audible.restore(), true);
    assertEquals(calls.stage.length, 1);
    assertEquals(calls.stage[0].alert, stageAlert);
    assertEquals(calls.stage[0].audibleMs, 1500);
    assertStrictEquals(calls.stage[0].thenHold, true);
    assertEquals(calls.fade, []);
    assertEquals(calls.hold, 0);
    audible.finish();

    // B. 淡出中途：按保存进度用 1 → duck 音量公式重建起始音量，不直接跳到静音。
    calls.stage.length = 0;
    Date.now = () => 50000;
    const fading = restoreWith({
      ...savedBase,
      trumpetDeadline: 49600,
      trumpetPhase: "audible",
    });
    assertStrictEquals(fading.restore(), true);
    assertEquals(calls.stage, []);
    assertEquals(calls.fade.length, 1);
    assertEquals(calls.fade[0].durationMs, 600);
    // 剩余 600 / 1000 = 0.6 → 音量 0.4 + 0.6 * 0.6 = 0.76。
    assertEquals(calls.fadeStartRatios, [0.6]);
    assertEquals(
      calls.fade[0].startVolume,
      duckVolume + (1 - duckVolume) * 0.6,
    );
    assertEquals(calls.hold, 0);
    fading.finish();

    // C. 已 hold：继续维持后台 ducked 曲目，不重新播放阶段 BGM。
    calls.fade.length = 0;
    calls.hold = 0;
    const held = restoreWith({
      ...savedBase,
      trumpetPhase: "held",
    });
    assertStrictEquals(held.restore(), true);
    assertEquals(calls.stage, []);
    assertEquals(calls.fade, []);
    assertEquals(calls.hold, 1);
    held.finish();
  } finally {
    Date.now = originalDateNow;
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
  }
});

Deno.test("WhiteNight Confess transcribes the prefab ParticleSystem parameters", () => {
  assertEquals(whiteNightConfessParticleSystem.transform, {
    positionX: 5.8399997,
    positionY: 17.959997,
    rotationZ: 19.816715,
  });
  assertEquals(whiteNightConfessParticleSystem.shape, {
    scaleX: 4.5,
    scaleY: 1,
    scaleZ: 1,
  });
  assertEquals(whiteNightConfessParticleSystem.emissionRate, 4);
  assertEquals(whiteNightConfessParticleSystem.initial, {
    lifetimeSeconds: 5,
    speed: 1,
    sizeX: 4.13,
    sizeY: 1.5,
    color: {
      red: 0.60294116,
      green: 0.57994866,
      blue: 0.39457178,
      alpha: 0.559,
    },
  });
  assertEquals(whiteNightConfessParticleSystem.renderer, {
    lengthScale: 10,
    pivotY: 4.63,
  });
  assertEquals(whiteNightConfessParticleSystem.camera, {
    orthographicSize: 8.5,
  });
});

Deno.test("WhiteNight exports the actual Dead_23 Animation Event timings", () => {
  assertEquals(whiteNightConfessionSuppressionDelayMs, 5700);
  assertEquals(whiteNightDeathSequenceDurationMs, 8830);
  assertEquals(whiteNightDeathSounds.map(({ at }) => at), [
    3.1667,
    4.2667,
    4.8,
  ]);
});

Deno.test("WhiteNight keeps source-specific entry behavior per entry source", () => {
  const browser = globalThis as typeof globalThis & {
    Audio?: unknown;
    document?: unknown;
  };
  const originals = Object.fromEntries(
    ["Audio", "document"].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(browser, name),
    ]),
  );
  AudioMock.reset();
  AudioMock.clearSrcOnRemoveAttribute = true;
  const document = createDocumentMock();
  let apostlesCompletionCount = 0;
  let hasTwelveApostles = false;
  let resumeCount = 0;
  try {
    Object.defineProperties(browser, {
      Audio: { configurable: true, value: AudioMock },
      document: { configurable: true, value: document },
    });
    const event = createWhiteNightEvent({
      assetRoot: "/Assets",
      confessionAliases: () => new Set(),
      ensureCoordinator: () => {},
      finishRestartPanel: () => {},
      getAlert: () => ({}),
      hasTwelveApostles: () => hasTwelveApostles,
      holdAlertMusic: () => {},
      isReload: () => false,
      messages: () => ({}),
      mountRestartPanel: () => {},
      normalize: (value: string) => value,
      pauseDangerDecay: () => {},
      playApostlesCompletion: () => apostlesCompletionCount++,
      resumeAlertMusic: () => {},
      resumeDangerDecay: () => resumeCount++,
      storageKey: "white-night",
      storages: () => [],
    }) as {
      finish: () => void;
      getSource: () => string | undefined;
      start: (options: { source: string }) => boolean;
    };

    assertStrictEquals(event.start({ source: "direct-submission" }), true);
    assertEquals(event.getSource(), "direct-submission");
    assertEquals(AudioMock.items.length, 1);
    assertEquals(apostlesCompletionCount, 0);
    event.finish();

    assertEquals(
      event.start({ source: "plague-doctor-transformation" }),
      true,
    );
    assertEquals(event.getSource(), "plague-doctor-transformation");
    assertEquals(AudioMock.items.length, 2);
    assertEquals(apostlesCompletionCount, 0);
    event.finish();

    assertStrictEquals(event.start({ source: "apostles-replay" }), true);
    assertEquals(AudioMock.items.length, 3);
    assertEquals(apostlesCompletionCount, 0);
    event.finish();

    hasTwelveApostles = true;
    assertStrictEquals(event.start({ source: "direct-submission" }), true);
    assertEquals(apostlesCompletionCount, 0);
    event.finish();
    assertEquals(resumeCount, 4);
    assert(AudioMock.items.every((audio) => audio.pauseCount > 0));
  } finally {
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
  }
});

Deno.test("WhiteNight blocks escape and polling before downstream handlers while preserving the real save button", async () => {
  const browser = globalThis as typeof globalThis & {
    Audio?: unknown;
    document?: unknown;
    location?: unknown;
  };
  const originals = Object.fromEntries(
    ["Audio", "document", "location"].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(browser, name),
    ]),
  );
  AudioMock.reset();
  AudioMock.clearSrcOnRemoveAttribute = true;
  const harness = createInteractiveDocument();
  const shownMessages: string[] = [];
  let replaceTarget = "";
  try {
    Object.defineProperties(browser, {
      Audio: { configurable: true, value: AudioMock },
      document: { configurable: true, value: harness.document },
      location: {
        configurable: true,
        value: {
          href: "https://warmnest.test/settings",
          pathname: "/settings",
          replace: (target: string) => replaceTarget = target,
          search: "",
        },
      },
    });
    const event = createWhiteNightEvent({
      assetRoot: "/Assets",
      blockMessage: (key: string) => {
        shownMessages.push(key);
        return key;
      },
      confessionAliases: () =>
        new Set([
          "confess",
          "confesarse",
          "懺悔",
          "고해",
          "исповедь",
          "xoa dịu",
          "赎罪",
        ]),
      ensureCoordinator: () => {},
      finishRestartPanel: () => {},
      getAlert: () => ({}),
      holdAlertMusic: () => {},
      isReload: () => false,
      messages: () => ({ "oneSin.specialWork.confession": "Confess" }),
      mountRestartPanel: () => {},
      normalize: (value: string) =>
        value.normalize("NFKC").trim().toLowerCase(),
      pauseDangerDecay: () => {},
      resumeAlertMusic: () => {},
      resumeDangerDecay: () => {},
      storageKey: "white-night",
      storages: () => [],
    }) as {
      finish: () => void;
      start: (options: { source: string }) => boolean;
    };
    assertStrictEquals(
      event.start({ source: "plague-doctor-transformation" }),
      true,
    );

    let downstreamNavigation = 0;
    harness.document.addEventListener("click", () => downstreamNavigation++);
    const link = new Element();
    link.selectors.add("a[href]");
    const linkResult = harness.dispatch("click", link);
    assertEquals(linkResult, { prevented: true, stopped: true });
    assertEquals(downstreamNavigation, 0);

    const navigationForm = new Element();
    navigationForm.setAttribute("action", "/history");
    const navigationResult = harness.dispatch("submit", navigationForm);
    assertEquals(navigationResult, { prevented: true, stopped: true });
    assertEquals(
      shownMessages.slice(-2),
      [
        "whiteNight.blockNavigation.denyPresence",
        "whiteNight.blockNavigation.unknownStory",
      ],
    );

    let logoutRequestCount = 0;
    harness.document.addEventListener("submit", () => logoutRequestCount++);
    const logoutForm = new Element();
    logoutForm.setAttribute(
      "action",
      "https://warmnest.test/logout?locale=en-US",
    );
    const logoutResult = harness.dispatch("submit", logoutForm);
    assertEquals(logoutResult, { prevented: true, stopped: true });
    assertEquals(logoutRequestCount, 0);
    assert(shownMessages.includes("whiteNight.blockExit"));

    const accountForm = new Element();
    accountForm.selectors.add("[data-account-form]");
    assertStrictEquals(
      harness.dispatch("submit", accountForm).prevented,
      false,
    );

    const refreshResult = harness.dispatch(
      "keydown",
      new Element(),
      { key: "F5" },
    );
    assertEquals(refreshResult, { prevented: true, stopped: true });

    let autoSaveCount = 0;
    harness.document.addEventListener("input", () => autoSaveCount++);
    harness.document.addEventListener("change", () => autoSaveCount++);
    harness.pollingValue.value = "9";
    const pollingResult = harness.dispatch("input", harness.pollingValue);
    assertEquals(pollingResult, { prevented: true, stopped: true });
    assertEquals(harness.pollingValue.value, "5");
    assertEquals(autoSaveCount, 0);
    assert(shownMessages.includes("whiteNight.blockTime"));

    harness.pollingUnit.value = "hour";
    const pollingUnitResult = harness.dispatch("change", harness.pollingUnit);
    assertEquals(pollingUnitResult, { prevented: true, stopped: true });
    assertEquals(harness.pollingUnit.value, "minute");
    assertEquals(autoSaveCount, 0);

    for (
      const confession of [
        "  O-03-03  ",
        "CONFESS",
        "Confesarse",
        "懺悔",
        "고해",
        "Исповедь",
        "Xoa dịu",
        "赎罪",
      ]
    ) {
      harness.displayNameInput.value = confession;
      harness.dispatch("input", harness.displayNameInput);
      assertEquals(harness.saveButton.textContent, "Confess");
      assertEquals(
        harness.saveHost.children.at(-1) === harness.saveButton,
        true,
      );
      assertEquals(
        harness.saveHost.children.filter((node) =>
          node.className === "lobotomy-corp-confession-work-icon"
        ).length,
        1,
      );
    }
    harness.displayNameInput.value = "ordinary";
    harness.dispatch("input", harness.displayNameInput);
    assertEquals(harness.saveButton.textContent, "Save");

    harness.displayNameInput.value = "O-03-03";
    harness.dispatch("input", harness.displayNameInput);
    const cancel = new Element();
    cancel.selectors.add("[data-account-cancel-button]");
    harness.dispatch("click", cancel);
    assertEquals(harness.saveButton.textContent, "Save");

    (browser.location as { pathname: string }).pathname = "/history";
    globalThis.dispatchEvent(new Event("popstate"));
    assertEquals(replaceTarget, "/settings");

    event.finish();
    await Promise.resolve();
    assertEquals(harness.saveButton.textContent, "Save");
    assertEquals(
      harness.body.children.some((node) =>
        node.className.startsWith("lobotomy-corp-white-night")
      ),
      false,
    );
    assertEquals(
      AudioMock.items.every((audio) =>
        audio.pauseCount > 0 && audio.src === ""
      ),
      true,
    );
    const audioCountAfterFinish = AudioMock.items.length;
    const messageCountAfterFinish = shownMessages.length;
    const downstreamNavigationAfterFinish = downstreamNavigation;
    harness.dispatch("click", link);
    assertEquals(downstreamNavigation, downstreamNavigationAfterFinish + 1);
    assertEquals(AudioMock.items.length, audioCountAfterFinish);
    assertEquals(shownMessages.length, messageCountAfterFinish);
  } finally {
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
  }
});

Deno.test("WhiteNight reload retries both church and the pending recovery bell on interaction", async () => {
  const browser = globalThis as typeof globalThis & {
    Audio?: unknown;
    document?: unknown;
    location?: unknown;
  };
  const originals = Object.fromEntries(
    ["Audio", "document", "location"].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(browser, name),
    ]),
  );
  let bellAttempts = 0;
  let churchAttempts = 0;
  AudioMock.reset();
  AudioMock.clearSrcOnRemoveAttribute = true;
  // 模拟 Chromium 在被 autoplay 拒绝或刚开始播放时丢失预设 seek。
  AudioMock.playHook = (audio) => {
    if (audio.src.endsWith("Lucifer_standbg0.ogg")) {
      churchAttempts++;
      audio.currentTime = 0;
      return churchAttempts === 1
        ? Promise.reject(new Error("autoplay blocked"))
        : Promise.resolve();
    }
    if (audio.src.endsWith("Lucifer_Bell0.ogg") && bellAttempts++ === 0) {
      return Promise.reject(new Error("autoplay blocked"));
    }
    return undefined;
  };
  const harness = createInteractiveDocument();
  const values = new Map<string, string>([[
    "white-night",
    JSON.stringify({
      id: "white-night",
      churchPosition: 26.5,
      lockLocation: "/settings",
      phase: "active",
      source: "direct-submission",
    }),
  ]]);
  const storage = {
    /** @param {string} key 键。 @return {string|null} 值。 */
    getItem: (key: string) => values.get(key) ?? null,
    /** @param {string} key 键。 @param {string} value 值。 */
    setItem: (key: string, value: string) => values.set(key, value),
    /** @param {string} key 键。 */
    removeItem: (key: string) => values.delete(key),
  };
  let event: { finish: () => void; restore: () => boolean } | undefined;
  try {
    Object.defineProperties(browser, {
      Audio: { configurable: true, value: AudioMock },
      document: { configurable: true, value: harness.document },
      location: {
        configurable: true,
        value: {
          href: "https://warmnest.test/settings",
          pathname: "/settings",
          search: "",
        },
      },
    });
    event = createWhiteNightEvent({
      assetRoot: "/Assets",
      confessionAliases: () => new Set(),
      ensureCoordinator: () => {},
      finishRestartPanel: () => {},
      getAlert: () => ({}),
      holdAlertMusic: () => {},
      isReload: () => true,
      messages: () => ({}),
      mountRestartPanel: () => {},
      normalize: (value: string) => value,
      pauseDangerDecay: () => {},
      resumeAlertMusic: () => {},
      resumeDangerDecay: () => {},
      storageKey: "white-night",
      storages: () => [storage],
    }) as { finish: () => void; restore: () => boolean };
    assertStrictEquals(event.restore(), true);
    await Promise.resolve();
    await Promise.resolve();
    assert(
      harness.body.children.some((node) =>
        node.className === "lobotomy-corp-white-night-entity" &&
        node.children.some((child) =>
          child.src.endsWith("WhiteNight_Escape_Idle.webm")
        )
      ),
    );
    assertEquals(
      harness.body.children.some((node) =>
        node.className === "lobotomy-corp-white-night-message"
      ),
      true,
    );
    assertEquals(
      JSON.parse(values.get("white-night") ?? "{}").pendingRecoveryBell,
      true,
    );
    const church = AudioMock.items.find((audio) =>
      audio.src.endsWith("Lucifer_standbg0.ogg")
    )!;
    assertEquals(church.playCount, 1);
    assertEquals(church.currentTime, 0);
    assertEquals(
      JSON.parse(values.get("white-night") ?? "{}").churchPosition,
      26.5,
    );

    harness.dispatch("pointerdown", new Element());
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(church.playCount, 2);
    assertEquals(church.currentTime, 26.5);
    assertEquals(
      AudioMock.items.filter((audio) => audio.src.endsWith("Lucifer_Bell0.ogg"))
        .length,
      2,
    );
    assertEquals(
      JSON.parse(values.get("white-night") ?? "{}").pendingRecoveryBell,
      false,
    );
  } finally {
    event?.finish();
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
  }
});

Deno.test("WhiteNight refresh message is deliberately layered above the Trumpet HUD", async () => {
  const css = await Deno.readTextFile(
    new URL("../static/fun/lobotomy-corp/lobotomy-corp.css", import.meta.url),
  );
  const messageRule =
    css.match(/\.lobotomy-corp-white-night-message\s*\{[^}]*\}/s)
      ?.[0] ?? "";
  assert(/z-index:\s*10010;/.test(messageRule));
  assert(/pointer-events:\s*none;/.test(messageRule));
});

Deno.test("WhiteNight Confess extends only the cropped outer effect around an unchanged center", async () => {
  const layout = whiteNightConfessionViewportLayout(1251, 1249, 586, 584)!;
  const { start, end } = whiteNightConfessionViewportSlice;
  const expectedScale = Math.min(980 / 586, 980 / 584);

  assertEquals(layout.sourceX, [0, 586 * start, 586 * end, 586]);
  assertEquals(layout.sourceY, [0, 584 * start, 584 * end, 584]);
  assertEquals(layout.targetX[0], 0);
  assertEquals(layout.targetX[3], 1251);
  assertEquals(layout.targetY[0], 0);
  assertEquals(layout.targetY[3], 1249);
  assert(
    Math.abs(
      (layout.targetX[2] - layout.targetX[1]) /
          (layout.sourceX[2] - layout.sourceX[1]) - expectedScale,
    ) < 1e-9,
  );
  assert(
    Math.abs(
      (layout.targetY[2] - layout.targetY[1]) /
          (layout.sourceY[2] - layout.sourceY[1]) - expectedScale,
    ) < 1e-9,
  );

  const drawCalls: unknown[][] = [];
  const context = {
    clearRect: () => {},
    drawImage: (...args: unknown[]) => drawCalls.push(args),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
  };
  const canvas = {
    clientHeight: 1249,
    clientWidth: 1251,
    getContext: () => context,
    height: 0,
    width: 0,
  };
  const video = {
    ended: false,
    paused: true,
    readyState: 4,
    videoHeight: 584,
    videoWidth: 586,
  };
  const renderer = createWhiteNightConfessionViewportRenderer(
    video as unknown as HTMLVideoElement,
    canvas as unknown as HTMLCanvasElement,
  )!;
  renderer.draw();

  assertEquals(canvas.width, 1251);
  assertEquals(canvas.height, 1249);
  assertEquals(drawCalls.length, 9);
  assertStrictEquals(drawCalls[4][0], video);
  assertEquals(drawCalls[4].slice(1, 5), [
    layout.sourceX[1],
    layout.sourceY[1],
    layout.sourceX[2] - layout.sourceX[1],
    layout.sourceY[2] - layout.sourceY[1],
  ]);

  const css = await Deno.readTextFile(
    new URL("../static/fun/lobotomy-corp/lobotomy-corp.css", import.meta.url),
  );
  const canvasRule =
    css.match(/\.lobotomy-corp-white-night-confession-canvas\s*\{[^}]*\}/s)
      ?.[0] ?? "";
  assert(/height:\s*100%;/.test(canvasRule));
  assert(/width:\s*100%;/.test(canvasRule));
  assert(/position:\s*absolute;/.test(canvasRule));
});
