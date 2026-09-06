/**
 * @file 本文件验证彩蛋前端的协调及《脑叶公司》Trumpet 警报生命周期。
 */
import { assertEquals, assertRejects } from "./test_helpers.ts";

Deno.test("Easter egg coordinator interrupts only a different game", async () => {
  const browser = globalThis as typeof globalThis & {
    easterEggCoordinator?: { start: (id: string, stop: () => void) => void };
  };
  const original = browser.easterEggCoordinator;
  const stopped: string[] = [];
  try {
    await import(`../static/fun/coordinator.js?test=${crypto.randomUUID()}`);
    browser.easterEggCoordinator!.start("ace", () => stopped.push("ace"));
    browser.easterEggCoordinator!.start("ace", () => stopped.push("duplicate"));
    browser.easterEggCoordinator!.start(
      "lobotomy",
      () => stopped.push("lobotomy"),
    );
    assertEquals(stopped, ["ace"]);
  } finally {
    if (original) browser.easterEggCoordinator = original;
    else delete browser.easterEggCoordinator;
  }
});

Deno.test("username Easter egg matches names and resolves localized assets", async () => {
  const browser = globalThis as typeof globalThis & {
    document?: unknown;
    usernameEasterEgg?: {
      imageLocale: () => string;
      matches: (name: string) => boolean;
      voiceLocale: (name?: string) => string;
    };
  };
  const originalDocument = Object.getOwnPropertyDescriptor(browser, "document");
  const documentMock = {
    documentElement: { lang: "zh-CN" },
    querySelectorAll: () => [],
  };
  Object.defineProperty(browser, "document", {
    configurable: true,
    value: documentMock,
  });
  try {
    await import(
      `../static/fun/ace-attorney/ace-attorney.js?test=${crypto.randomUUID()}`
    );
    const api = browser.usernameEasterEgg!;
    ["Phoenix Wright", "成步堂龙一", "御剑怜侍", "王泥喜法介"].forEach(
      (name) => assertEquals(api.matches(name), true),
    );
    assertEquals(api.matches("普通用户"), false);
    documentMock.documentElement.lang = "zh-HK";
    assertEquals(api.imageLocale(), "zh-TW");
    assertEquals(api.voiceLocale(), "zh-CN");
  } finally {
    if (originalDocument) {
      Object.defineProperty(browser, "document", originalDocument);
    } else delete browser.document;
    delete browser.usernameEasterEgg;
  }
});

Deno.test("Lobotomy Corporation Fourth Trumpet separates visual and music high-water", async () => {
  class Element {
    alt = "";
    attributes: Record<string, string> = {};
    children: Element[] = [];
    className = "";
    dataset: Record<string, string> = {};
    disabled = false;
    hidden = false;
    offsetWidth = 1;
    removed = false;
    src = "";
    style: Record<string, unknown> = {};
    textContent = "";
    type = "";
    #events = new Map<string, ((event: Event) => void)[]>();
    /** 创建可记录 DOM 状态的模拟节点。 */
    constructor() {
      this.style.setProperty = (name: string, value: string) =>
        this.style[name] = value;
    }
    /** @param {...Element} nodes 要追加的节点。 */ append(
      ...nodes: Element[]
    ): void {
      this.children.push(...nodes);
    }
    /** @param {string} name 事件名。 @param {(event: Event) => void} listener 监听器。 */ addEventListener(
      name: string,
      listener: (event: Event) => void,
    ): void {
      this.#events.set(name, [...(this.#events.get(name) ?? []), listener]);
    }
    /** @param {string} name 事件名。 @param {(event: Event) => void} listener 监听器。 */ removeEventListener(
      name: string,
      listener: (event: Event) => void,
    ): void {
      this.#events.set(
        name,
        (this.#events.get(name) ?? []).filter((item) => item !== listener),
      );
    }
    /** @param {string} name 属性名。 @param {string} value 属性值。 */ setAttribute(
      name: string,
      value: string,
    ): void {
      this.attributes[name] = value;
    }
    /** 标记节点已删除。 */ remove(): void {
      this.removed = true;
    }
    /** @param {string} name 事件名。 */ dispatch(name: string): void {
      this.#events.get(name)?.forEach((listener) => listener(new Event(name)));
    }
  }
  class AudioMock extends Element {
    static items: AudioMock[] = [];
    currentTime = 0;
    pauseCount = 0;
    playCount = 0;
    preload = "";
    /** @param {string} source 音频地址。 */ constructor(source: string) {
      super();
      this.src = source;
      AudioMock.items.push(this);
    }
    /** @return {Promise<void>} 播放结果。 */ play(): Promise<void> {
      this.playCount++;
      return Promise.resolve();
    }
    /** 暂停音频。 */ pause(): void {
      this.pauseCount++;
    }
  }
  class StorageMock {
    #values = new Map<string, string>();
    /** @param {string} key 键。 @return {string|null} 存储值。 */ getItem(
      key: string,
    ): string | null {
      return this.#values.get(key) ?? null;
    }
    /** @param {string} key 键。 @param {string} value 值。 */ setItem(
      key: string,
      value: string,
    ): void {
      this.#values.set(key, value);
    }
    /** @param {string} key 键。 */ removeItem(key: string): void {
      this.#values.delete(key);
    }
  }
  const browser = globalThis as typeof globalThis & {
    Audio?: unknown;
    document?: unknown;
    innerWidth?: number;
    localStorage?: unknown;
    performance?: unknown;
    sessionStorage?: unknown;
    lobotomyCorpEasterEgg?: {
      activate: (name: string) => Promise<boolean>;
      matches: (name: string) => boolean;
      setDangerScore: (score: number) => Promise<boolean>;
    };
  };
  const original = Object.fromEntries(
    [
      "Audio",
      "document",
      "innerWidth",
      "localStorage",
      "performance",
      "sessionStorage",
    ].map((name) => [name, Object.getOwnPropertyDescriptor(browser, name)]),
  );
  const body = new Element();
  const storage = new StorageMock();
  Object.defineProperties(browser, {
    Audio: { configurable: true, value: AudioMock },
    document: {
      configurable: true,
      value: {
        body,
        createElement: () => new Element(),
        documentElement: {
          dataset: {
            lobotomyCorpFiredManager: "你被解雇了，主管！",
            lobotomyCorpRestartDay: "重新开始这一天",
          },
          lang: "zh-CN",
        },
      },
    },
    innerWidth: { configurable: true, value: 1920 },
    localStorage: { configurable: true, value: storage },
    sessionStorage: { configurable: true, value: storage },
    performance: {
      configurable: true,
      value: { getEntriesByType: () => [{ type: "navigate" }] },
    },
  });
  /** @param {Element} overlay 警报外层。 @return {Element[]} Corner。 */ const corners =
    (overlay: Element) => overlay.children[0].children[0].children;
  /** @param {Element} overlay 警报外层。 @return {string} Trumpet 文本。 */ const trumpet =
    (overlay: Element) =>
      corners(overlay)[2].children[0].children[1].children[0].textContent;
  /** @param {Element} overlay 警报外层。 @return {Element} Restart 面板。 */ const panel =
    (overlay: Element) => overlay.children[1];
  /** @param {Element} overlay 警报外层。 @return {Element} EmergencyImage。 */ const risk =
    (overlay: Element) =>
      corners(overlay)[0].children[0].children[1].children[0];
  try {
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    const api = browser.lobotomyCorpEasterEgg!;
    [
      "FOURTH TRUMPET",
      "Fourth Trumpet",
      "fourth trumpet",
      "fourth-trumpet",
      "fourthtrumpet",
    ].forEach((name) => assertEquals(api.matches(name), true));
    const first = api.activate("first trumpet");
    const firstAudio = AudioMock.items[0];
    const second = api.activate("second trumpet");
    const secondAudio = AudioMock.items[1];
    assertEquals(firstAudio.pauseCount, 1);
    assertEquals(secondAudio.src.endsWith("second-trumpet.wav"), true);
    assertEquals(await first, true);
    const third = api.activate("third trumpet");
    const thirdAudio = AudioMock.items[2];
    thirdAudio.currentTime = 20;
    assertEquals(await second, true);
    const down = api.activate("second trumpet");
    const downOverlay = body.children.at(-1)!;
    assertEquals(thirdAudio.pauseCount, 0);
    assertEquals(AudioMock.items.length, 3);
    assertEquals(thirdAudio.currentTime, 20);
    assertEquals(await third, true);
    const fourth = api.activate("fourth trumpet");
    const fourthOverlay = body.children.at(-1)!;
    assertEquals(trumpet(fourthOverlay), "Fourth\nTrumpet");
    assertEquals(risk(fourthOverlay).src.endsWith("MiddleArea_4_27.png"), true);
    const fourthAudio = AudioMock.items[3];
    assertEquals(AudioMock.items.length, 4);
    assertEquals(thirdAudio.pauseCount, 1);
    assertEquals(fourthAudio.src.endsWith("third-trumpet.wav"), true);
    assertEquals(fourthAudio.currentTime, 0);
    assertEquals(fourthAudio.playCount, 1);
    assertEquals(panel(fourthOverlay) === panel(downOverlay), true);
    assertEquals(
      panel(fourthOverlay).children[0].children[1].children[1].children[2]
        .textContent,
      "你被解雇了，主管！",
    );
    assertEquals(
      panel(fourthOverlay).children[0].children[1].children[1]
        .attributes["aria-label"],
      "你被解雇了，主管！",
    );
    assertEquals(await down, true);
    const visualFirst = api.activate("first trumpet");
    const firstOverlay = body.children.at(-1)!;
    assertEquals(trumpet(firstOverlay), "First\nTrumpet");
    assertEquals(AudioMock.items.length, 4);
    assertEquals(
      panel(firstOverlay).children[0].children[1].children[1].children[2]
        .textContent,
      "重新开始这一天",
    );
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-alert")?.includes(
        '"visualAssetDirectory":"first-trumpet"',
      ),
      true,
    );
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-alert")?.includes(
        '"musicAssetDirectory":"fourth-trumpet"',
      ),
      true,
    );
    assertEquals(await fourth, true);
    api.setDangerScore(100);
    const dangerOverlay = body.children.at(-1)!;
    assertEquals(trumpet(dangerOverlay), "Third\nTrumpet");
    assertEquals(risk(dangerOverlay).src.endsWith("Risk_3.png"), true);
    assertEquals(AudioMock.items.length, 4);
    assertEquals(await visualFirst, true);
    api.setDangerScore(9);
    const noneOverlay = body.children.at(-1)!;
    assertEquals(noneOverlay.children.length, 2);
    assertEquals(fourthAudio.pauseCount, 0);
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-alert")?.includes(
        '"visualAssetDirectory":null',
      ),
      true,
    );
    const stop = api.setDangerScore(0);
    noneOverlay.children[0].children[0].dispatch("animationend");
    assertEquals(await stop, true);
    assertEquals(fourthAudio.pauseCount, 1);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-alert"), null);
    const count = AudioMock.items.length;
    await api.setDangerScore(9);
    assertEquals(AudioMock.items.length, count);
    await assertRejects(
      () => api.setDangerScore(101),
      "Danger Score 必须是 0 到 100 的整数。",
    );
  } finally {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
    delete browser.lobotomyCorpEasterEgg;
  }
});
