/** @file 白夜特殊事件的状态、媒体与动画事件回归测试。 */
import { assertEquals } from "./test_helpers.ts";
import {
  createWhiteNightEvent,
  whiteNightConfessionSuppressionDelayMs,
  whiteNightDeathSequenceDurationMs,
  whiteNightDeathSounds,
} from "../static/fun/lobotomy-corp/Events/WhiteNight.js";

/**
 * 创建足以驱动白夜 Event 的最小 DOM 节点。
 *
 * @return {object} 事件测试的 document mock。
 */
function createDocumentMock() {
  class NodeMock {
    children: NodeMock[] = [];
    className = "";
    dataset: Record<string, string> = {};
    hidden = false;
    listeners = new Map<string, Array<() => void>>();
    parentElement?: NodeMock;
    src = "";
    style = { setProperty: () => {} };
    append(...children: NodeMock[]): void {
      children.forEach((child) => {
        child.parentElement = this;
        this.children.push(child);
      });
    }
    addEventListener(type: string, listener: () => void): void {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    removeEventListener(type: string, listener: () => void): void {
      this.listeners.set(
        type,
        (this.listeners.get(type) ?? []).filter((item) => item !== listener),
      );
    }
    remove(): void {
      this.parentElement?.children.splice(
        this.parentElement.children.indexOf(this),
        1,
      );
    }
    setAttribute(_name: string, _value: string): void {}
    removeAttribute(_name: string): void {}
    querySelector(): undefined {
      return undefined;
    }
  }
  const body = new NodeMock();
  return {
    body,
    createElement: () => new NodeMock(),
    querySelector: () => undefined,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

/** 可执行 capture 顺序与 DOM 查询的白夜交互节点。 */
class InteractiveNode {
  attributes: Record<string, string> = {};
  children: InteractiveNode[] = [];
  className = "";
  dataset: Record<string, string> = {};
  parentElement?: InteractiveNode;
  selectors = new Set<string>();
  src = "";
  style = { setProperty: () => {} };
  textContent = "";
  value = "";

  /** @param {...InteractiveNode} children 要追加的子节点。 */
  append(...children: InteractiveNode[]): void {
    children.forEach((child) => {
      child.parentElement = this;
      this.children.push(child);
    });
  }

  /**
   * 在指定子节点前插入节点。
   *
   * @param {InteractiveNode} child 新节点。
   * @param {InteractiveNode} before 参照节点。
   */
  insertBefore(child: InteractiveNode, before: InteractiveNode): void {
    child.parentElement = this;
    const index = this.children.indexOf(before);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
  }

  /** @param {string} selector 选择器。 @return {boolean} 是否匹配。 */
  matches(selector: string): boolean {
    return this.selectors.has(selector) ||
      (selector === ".lobotomy-corp-top-panel-action-button" &&
        this.className === "lobotomy-corp-top-panel-action-button") ||
      (selector === ".lobotomy-corp-confession-work-icon" &&
        this.className === "lobotomy-corp-confession-work-icon");
  }

  /** @param {string} selector 选择器。 @return {InteractiveNode|undefined} 最近匹配节点。 */
  closest(selector: string): InteractiveNode | undefined {
    if (
      this.matches(selector) ||
      (selector.includes("[data-polling-interval-value]") &&
        (this.selectors.has("[data-polling-interval-value]") ||
          this.selectors.has("[data-polling-interval-unit]")))
    ) return this;
    return this.parentElement?.closest(selector);
  }

  /** @param {string} selector 选择器。 @return {InteractiveNode|undefined} 首个后代。 */
  querySelector(selector: string): InteractiveNode | undefined {
    return this.children.find((child) =>
      child.matches(selector) || child.querySelector(selector)
    );
  }

  /** @param {string} name 属性名。 @return {string|null} 属性值。 */
  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  /** @param {string} name 属性名。 @param {string} value 属性值。 */
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  /** @param {string} name 属性名。 */
  removeAttribute(name: string): void {
    delete this.attributes[name];
    if (name === "src") this.src = "";
  }

  /** 从父节点移除自身。 */
  remove(): void {
    const index = this.parentElement?.children.indexOf(this) ?? -1;
    if (index >= 0) this.parentElement?.children.splice(index, 1);
    this.parentElement = undefined;
  }

  /** 测试节点不拥有独立事件监听器。 */
  addEventListener(): void {}

  /** 测试节点不拥有独立事件监听器。 */
  removeEventListener(): void {}

  /** 测试媒体暂停占位。 */
  pause(): void {}

  /** 测试媒体释放占位。 */
  load(): void {}
}

/**
 * 创建可验证 capture 阻断和 DOM 清理的 document mock。
 *
 * @return {object} document、控件及事件派发 API。
 */
function createInteractiveDocument() {
  type Listener = (event: Record<string, unknown>) => void;
  const listeners = new Map<string, Listener[]>();
  const body = new InteractiveNode();
  const pollingValue = new InteractiveNode();
  pollingValue.value = "5";
  pollingValue.selectors.add("[data-polling-interval-value]");
  const pollingUnit = new InteractiveNode();
  pollingUnit.value = "minute";
  pollingUnit.selectors.add("[data-polling-interval-unit]");
  const saveHost = new InteractiveNode();
  const saveButton = new InteractiveNode();
  saveButton.textContent = "Save";
  saveButton.setAttribute("aria-label", "Save account");
  saveButton.selectors.add("[data-account-save-button]");
  saveHost.append(saveButton);
  const displayNameInput = new InteractiveNode();
  displayNameInput.selectors.add("[data-account-display-name-input]");

  /** @param {InteractiveNode} root 根节点。 @param {string} className 类名。 @return {InteractiveNode[]} 匹配节点。 */
  const nodesByClass = (
    root: InteractiveNode,
    className: string,
  ): InteractiveNode[] => [
    ...(root.className === className ? [root] : []),
    ...root.children.flatMap((child) => nodesByClass(child, className)),
  ];
  const document = {
    body,
    /** @return {InteractiveNode} 新节点。 */
    createElement: () => new InteractiveNode(),
    /** @param {string} selector 选择器。 @return {InteractiveNode|undefined} 匹配控件。 */
    querySelector: (selector: string) =>
      selector === "[data-account-save-button]"
        ? saveButton
        : selector === "[data-account-display-name-input]"
        ? displayNameInput
        : undefined,
    /** @param {string} selector 选择器。 @return {InteractiveNode[]} 匹配控件。 */
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
   * @param {InteractiveNode} target 事件目标。
   * @param {Record<string, unknown>} extra 补充字段。
   * @return {{prevented: boolean, stopped: boolean}} 阻断结果。
   */
  const dispatch = (
    type: string,
    target: InteractiveNode,
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
  class AudioMock {
    static items: AudioMock[] = [];
    currentTime = 91;
    loop = false;
    muted = true;
    pauseCount = 0;
    playCount = 0;
    constructor(public src: string) {
      AudioMock.items.push(this);
    }
    play(): Promise<void> {
      this.playCount++;
      return Promise.resolve();
    }
    pause(): void {
      this.pauseCount++;
    }
    setAttribute(_name: string, _value: string): void {}
    removeAttribute(_name: string): void {}
    load(): void {}
    addEventListener(_type: string, _listener: () => void): void {}
  }
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
      getId: () => string | undefined;
      getPhase: () => string | undefined;
      start: (options: { source: string }) => boolean;
    };
    event.start({ source: "direct-submission" });
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
    assertEquals(
      deathEntity.children[0].src,
      "",
    );
    assertEquals(deathEntity.children[0].hidden, true);
    assertEquals(deathEntity.children[1].children.length, 23);
    assertEquals(
      deathEntity.children[1].children.every((ray) =>
        ray.src.endsWith("Texture2D/CFX3_T_RayStraight.png")
      ),
      true,
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
      deathEntity.children[0].src.endsWith("WhiteNight_Confess_Dead.webm"),
      true,
    );
    assertEquals(deathEntity.children[0].hidden, false);
    assertEquals(church.pauseCount > 0, true);
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
    assertEquals(await completion, true);
    assertEquals(resumeCount, 1);
    assertEquals(resumedDecay, 1);
    const deathAudios = AudioMock.items.filter((audio) =>
      whiteNightDeathSounds.some(({ path }) => audio.src.endsWith(path))
    );
    assertEquals(deathAudios.length, 3);
    deathAudios.forEach((audio) => {
      assertEquals(audio.currentTime, 0);
      assertEquals(audio.muted, false);
      assertEquals(audio.playCount, 1);
      assertEquals(audio.pauseCount > 0, true);
    });
  } finally {
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
  }
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

Deno.test("WhiteNight keeps source-specific entry behavior instead of treating every source alike", () => {
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
  class AudioMock {
    static items: AudioMock[] = [];
    currentTime = 0;
    muted = false;
    pauseCount = 0;
    src: string;
    /** @param {string} src 音频地址。 */
    constructor(src: string) {
      this.src = src;
      AudioMock.items.push(this);
    }
    /** @return {Promise<void>} 播放结果。 */
    play(): Promise<void> {
      return Promise.resolve();
    }
    /** 暂停音频。 */
    pause(): void {
      this.pauseCount++;
    }
    /** @param {string} _name 属性名。 @param {string} _value 属性值。 */
    setAttribute(_name: string, _value: string): void {}
    /** @param {string} name 属性名。 */
    removeAttribute(name: string): void {
      if (name === "src") this.src = "";
    }
    /** 释放音频。 */
    load(): void {}
    /** 测试不触发自然 ended。 */
    addEventListener(): void {}
  }
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

    assertEquals(event.start({ source: "direct-submission" }), true);
    assertEquals(event.getSource(), "direct-submission");
    assertEquals(AudioMock.items.length, 2);
    assertEquals(apostlesCompletionCount, 0);
    event.finish();

    assertEquals(
      event.start({ source: "plague-doctor-transformation" }),
      true,
    );
    assertEquals(event.getSource(), "plague-doctor-transformation");
    assertEquals(AudioMock.items.length, 3);
    assertEquals(apostlesCompletionCount, 0);
    event.finish();

    assertEquals(event.start({ source: "apostles-replay" }), true);
    assertEquals(AudioMock.items.length, 5);
    assertEquals(apostlesCompletionCount, 1);
    event.finish();

    hasTwelveApostles = true;
    assertEquals(event.start({ source: "direct-submission" }), true);
    assertEquals(apostlesCompletionCount, 2);
    event.finish();
    assertEquals(resumeCount, 4);
    assertEquals(AudioMock.items.every((audio) => audio.pauseCount > 0), true);
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
  class AudioMock {
    static items: AudioMock[] = [];
    currentTime = 0;
    muted = false;
    pauseCount = 0;
    playCount = 0;
    src: string;
    /** @param {string} src 音频地址。 */
    constructor(src: string) {
      this.src = src;
      AudioMock.items.push(this);
    }
    /** @return {Promise<void>} 播放结果。 */
    play(): Promise<void> {
      this.playCount++;
      return Promise.resolve();
    }
    /** 暂停音频。 */
    pause(): void {
      this.pauseCount++;
    }
    /** @param {string} _name 属性名。 @param {string} _value 属性值。 */
    setAttribute(_name: string, _value: string): void {}
    /** @param {string} name 属性名。 */
    removeAttribute(name: string): void {
      if (name === "src") this.src = "";
    }
    /** 释放音频。 */
    load(): void {}
    /** 测试不触发自然 ended。 */
    addEventListener(): void {}
  }
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
    assertEquals(event.start({ source: "direct-submission" }), true);

    let downstreamNavigation = 0;
    harness.document.addEventListener("click", () => downstreamNavigation++);
    const link = new InteractiveNode();
    link.selectors.add("a[href]");
    const linkResult = harness.dispatch("click", link);
    assertEquals(linkResult, { prevented: true, stopped: true });
    assertEquals(downstreamNavigation, 0);

    const navigationForm = new InteractiveNode();
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
    const logoutForm = new InteractiveNode();
    logoutForm.setAttribute(
      "action",
      "https://warmnest.test/logout?locale=en-US",
    );
    const logoutResult = harness.dispatch("submit", logoutForm);
    assertEquals(logoutResult, { prevented: true, stopped: true });
    assertEquals(logoutRequestCount, 0);
    assertEquals(shownMessages.includes("whiteNight.blockExit"), true);

    const accountForm = new InteractiveNode();
    accountForm.selectors.add("[data-account-form]");
    assertEquals(harness.dispatch("submit", accountForm).prevented, false);

    const refreshResult = harness.dispatch(
      "keydown",
      new InteractiveNode(),
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
    assertEquals(shownMessages.includes("whiteNight.blockTime"), true);

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
    const cancel = new InteractiveNode();
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
  class AudioMock {
    static items: AudioMock[] = [];
    static blockedPlays = 2;
    currentTime = 0;
    muted = false;
    pauseCount = 0;
    playCount = 0;
    src: string;
    /** @param {string} src 音频地址。 */
    constructor(src: string) {
      this.src = src;
      AudioMock.items.push(this);
    }
    /** @return {Promise<void>} 播放或自动播放拒绝结果。 */
    play(): Promise<void> {
      this.playCount++;
      if (AudioMock.blockedPlays > 0) {
        AudioMock.blockedPlays--;
        return Promise.reject(new Error("autoplay blocked"));
      }
      return Promise.resolve();
    }
    /** 暂停音频。 */
    pause(): void {
      this.pauseCount++;
    }
    /** @param {string} _name 属性名。 @param {string} _value 属性值。 */
    setAttribute(_name: string, _value: string): void {}
    /** @param {string} name 属性名。 */
    removeAttribute(name: string): void {
      if (name === "src") this.src = "";
    }
    /** 释放音频。 */
    load(): void {}
    /** 测试不触发自然 ended。 */
    addEventListener(): void {}
  }
  const harness = createInteractiveDocument();
  const values = new Map<string, string>([[
    "white-night",
    JSON.stringify({
      id: "white-night",
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
    assertEquals(event.restore(), true);
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(
      harness.body.children.some((node) =>
        node.className === "lobotomy-corp-white-night-entity" &&
        node.children[0]?.src.endsWith("WhiteNight_Escape_Idle.webm")
      ),
      true,
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

    harness.dispatch("pointerdown", new InteractiveNode());
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(church.playCount, 2);
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
