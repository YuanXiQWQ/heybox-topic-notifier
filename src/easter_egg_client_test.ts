/**
 * @file 本文件验证彩蛋前端的协调及《脑叶公司》Trumpet 警报生命周期。
 */
import { assertEquals, assertRejects } from "./test_helpers.ts";
import { renderLayout } from "./views/html.ts";

/**
 * 从页面内联脚本中读取《脑叶公司》当前本地化。
 *
 * @param {string} locale 页面 locale。
 * @return {{restartDay: string, firedManager: string}} 注入的游戏文本。
 */
function renderedLobotomyCorpLocale(
  locale:
    | "en-CA"
    | "en-GB"
    | "en-US"
    | "fr-FR"
    | "zh-CN"
    | "zh-HK"
    | "zh-MO"
    | "zh-SG"
    | "zh-TW",
) {
  const html = renderLayout({
    body: "",
    csrfToken: "test",
    darkMode: false,
    locale,
    themeColor: "#000000",
    title: "test",
  });
  const serialized =
    /<script type="application\/json" id="lobotomy-corp-locale-data">([^<]+)<\/script>/u
      .exec(html)?.[1];
  if (!serialized) {
    throw new Error("Expected embedded Lobotomy Corporation locale data.");
  }
  return JSON.parse(serialized);
}

/**
 * 从页面内联脚本中读取通用异想体资料。
 *
 * @return {Record<string, unknown>} 服务端安全注入的异想体资料。
 */
function renderedLobotomyCorpAbnormalities(): Record<string, unknown> {
  const html = renderLayout({
    body: "",
    csrfToken: "test",
    darkMode: false,
    locale: "zh-CN",
    themeColor: "#000000",
    title: "test",
  });
  const serialized =
    /<script type="application\/json" id="lobotomy-corp-abnormalities-data">([^<]+)<\/script>/u
      .exec(html)?.[1];
  if (!serialized) {
    throw new Error("Expected embedded Lobotomy Corporation abnormality data.");
  }
  return JSON.parse(serialized);
}

Deno.test("Lobotomy Corporation locale data is injected from game JSON with fallbacks", () => {
  assertEquals(renderedLobotomyCorpLocale("zh-CN"), {
    restartDay: "重新开始这一天",
    firedManager: "你被解雇了，主管！",
  });
  assertEquals(
    renderedLobotomyCorpLocale("zh-HK"),
    renderedLobotomyCorpLocale("zh-MO"),
  );
  assertEquals(
    renderedLobotomyCorpLocale("zh-HK"),
    renderedLobotomyCorpLocale("zh-TW"),
  );
  assertEquals(
    renderedLobotomyCorpLocale("zh-SG"),
    renderedLobotomyCorpLocale("zh-CN"),
  );
  assertEquals(
    renderedLobotomyCorpLocale("en-CA"),
    renderedLobotomyCorpLocale("en-GB"),
  );
  assertEquals(
    renderedLobotomyCorpLocale("en-CA"),
    renderedLobotomyCorpLocale("en-US"),
  );
  assertEquals(
    renderedLobotomyCorpLocale("fr-FR"),
    renderedLobotomyCorpLocale("en-US"),
  );
});

Deno.test("Lobotomy Corporation abnormality data is safely injected from its source of truth", () => {
  const abnormalities = renderedLobotomyCorpAbnormalities();
  assertEquals(
    (abnormalities["T-03-46"] as { dangerOnBreachOverride: number })
      .dangerOnBreachOverride,
    98,
  );
  assertEquals(
    (abnormalities["Bald-is-awesome!"] as { aliases: string[] }).aliases
      .includes("秃头-真是-太棒啦！"),
    true,
  );
});

Deno.test("game entries use embedded data without synchronous requests", () => {
  const aceAttorneyEntry = Deno.readTextFileSync(
    new URL("../static/fun/ace-attorney/ace-attorney.js", import.meta.url),
  );
  const lobotomyCorpEntry = Deno.readTextFileSync(
    new URL("../static/fun/lobotomy-corp/lobotomy-corp.js", import.meta.url),
  );

  assertEquals(aceAttorneyEntry.includes("XMLHttpRequest"), false);
  assertEquals(lobotomyCorpEntry.includes("XMLHttpRequest"), false);
  assertEquals(lobotomyCorpEntry.includes("Abnormalities.json"), false);
});

Deno.test("settings commits a matched abnormality only after account save confirmation", () => {
  const settingsClient = Deno.readTextFileSync(
    new URL("../static/settings.js", import.meta.url),
  );
  const submissionIndex = settingsClient.indexOf(
    "async function submitAccountWhileLobotomyCorpAlertIsActive",
  );
  const fetchIndex = settingsClient.indexOf(
    "const response = await fetch(form.action",
    submissionIndex,
  );
  const savedGuardIndex = settingsClient.indexOf("if (!saved)", fetchIndex);
  const commitIndex = settingsClient.indexOf("commitDisplayName", fetchIndex);
  assertEquals(submissionIndex >= 0, true);
  assertEquals(fetchIndex >= 0, true);
  assertEquals(savedGuardIndex > fetchIndex, true);
  assertEquals(commitIndex > savedGuardIndex, true);
});

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
    aceAttorneyCourtroomNameChange?: unknown;
    document?: unknown;
    usernameEasterEgg?: {
      imageLocale: () => string;
      matches: (name: string) => boolean;
      voiceLocale: (name?: string) => string;
    };
  };
  const originalDocument = Object.getOwnPropertyDescriptor(browser, "document");
  const originalEvent = Object.getOwnPropertyDescriptor(
    browser,
    "aceAttorneyCourtroomNameChange",
  );
  const aceAttorneyData = JSON.stringify({
    characters: JSON.parse(Deno.readTextFileSync(
      new URL(
        "../static/fun/ace-attorney/Data/Characters.json",
        import.meta.url,
      ),
    )),
    messages: JSON.parse(Deno.readTextFileSync(
      new URL("../static/fun/ace-attorney/Locales/zh-CN.json", import.meta.url),
    )),
  });
  const documentMock = {
    documentElement: { lang: "zh-CN" },
    getElementById: (id: string) =>
      id === "ace-attorney-easter-egg-data"
        ? { textContent: aceAttorneyData }
        : null,
    querySelectorAll: () => [],
  };
  Object.defineProperty(browser, "document", {
    configurable: true,
    value: documentMock,
  });
  try {
    await import(
      `../static/fun/ace-attorney/Events/CourtroomNameChange.js?test=${crypto.randomUUID()}`
    );
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
    if (originalEvent) {
      Object.defineProperty(
        browser,
        "aceAttorneyCourtroomNameChange",
        originalEvent,
      );
    } else delete browser.aceAttorneyCourtroomNameChange;
    delete browser.usernameEasterEgg;
  }
});

Deno.test("Lobotomy Corporation derives settings identity UI without persisting it", async () => {
  class Element {
    alt = "";
    className = "";
    dataset: Record<string, string | undefined> = {};
    removed = false;
    src = "";
    textContent = "";
    children: Element[] = [];
    /** @param {string} name 属性名称。 @param {string} value 属性值。 */ setAttribute(
      name: string,
      value: string,
    ): void {
      if (name === "aria-hidden") this.dataset.ariaHidden = value;
    }
    /** @param {...Element} nodes 要追加的节点。 */ append(
      ...nodes: Element[]
    ): void {
      this.children.push(...nodes);
    }
    /** @param {string} selector CSS 选择器。 @return {Element|undefined} 匹配节点。 */ querySelector(
      selector: string,
    ): Element | undefined {
      return selector === ".lobotomy-corp-risk-badge"
        ? this.children.find((child) =>
          child.className === "lobotomy-corp-risk-badge" && !child.removed
        )
        : undefined;
    }
    /** 移除当前节点。 */ remove(): void {
      this.removed = true;
    }
  }
  const browser = globalThis as typeof globalThis & {
    Audio?: unknown;
    document?: unknown;
    lobotomyCorpEasterEgg?: {
      commitDisplayName: (name: string) => Promise<boolean>;
      getDangerScore: () => number;
    };
  };
  const originalDocument = Object.getOwnPropertyDescriptor(browser, "document");
  const originalApi = Object.getOwnPropertyDescriptor(
    browser,
    "lobotomyCorpEasterEgg",
  );
  const label = new Element();
  label.textContent = "显示名称";
  const avatarWrapper = new Element();
  const avatar = new Element();
  avatarWrapper.append(avatar);
  const displayNameInput = new Element();
  displayNameInput.dataset.accountDisplayNameOriginal = "T-03-46";
  const localeData = Deno.readTextFileSync(
    new URL("../static/fun/lobotomy-corp/Locales/zh-CN.json", import.meta.url),
  );
  const abnormalitiesData = Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/Data/Abnormalities.json",
      import.meta.url,
    ),
  );
  Object.defineProperty(browser, "document", {
    configurable: true,
    value: {
      createElement: () => new Element(),
      documentElement: { lang: "zh-CN" },
      getElementById: (id: string) =>
        id === "lobotomy-corp-locale-data"
          ? { textContent: localeData }
          : id === "lobotomy-corp-abnormalities-data"
          ? { textContent: abnormalitiesData }
          : null,
      querySelector: (selector: string) =>
        selector === "[data-account-display-name-label]"
          ? label
          : selector === ".account-avatar-risk-wrapper"
          ? avatarWrapper
          : selector === "[data-account-display-name-input]"
          ? displayNameInput
          : undefined,
    },
  });
  try {
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    assertEquals(label.textContent, "白夜");
    assertEquals(avatar.children.length, 0);
    assertEquals(
      avatarWrapper.children[1].src.endsWith("Risk_Aleph.png"),
      true,
    );
    await browser.lobotomyCorpEasterEgg!.commitDisplayName("Bald-is-awesome!");
    assertEquals(label.textContent, "你是个秃子...");
    assertEquals(
      avatarWrapper.querySelector(".lobotomy-corp-risk-badge")?.src.endsWith(
        "Risk_Zayin.png",
      ),
      true,
    );
    assertEquals(browser.lobotomyCorpEasterEgg!.getDangerScore(), 0);
    await browser.lobotomyCorpEasterEgg!.commitDisplayName("O-03-03");
    assertEquals(
      avatarWrapper.querySelector(".lobotomy-corp-risk-badge") !== undefined,
      true,
    );
    assertEquals(browser.lobotomyCorpEasterEgg!.getDangerScore(), 0);
    await browser.lobotomyCorpEasterEgg!.commitDisplayName("ordinary user");
    assertEquals(label.textContent, "显示名称");
    assertEquals(
      avatarWrapper.querySelector(".lobotomy-corp-risk-badge"),
      undefined,
    );
  } finally {
    if (originalDocument) {
      Object.defineProperty(browser, "document", originalDocument);
    } else delete browser.document;
    if (originalApi) {
      Object.defineProperty(browser, "lobotomyCorpEasterEgg", originalApi);
    } else delete browser.lobotomyCorpEasterEgg;
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
      matchingAbnormality: (name: string) => {
        canonicalId: string;
        abnormality: { canBreach: boolean; riskLevel: string };
      } | undefined;
      handleAbnormalitySubmitted: (name: string) => Promise<boolean>;
      getDangerScore: () => number;
      restartDay: () => Promise<boolean>;
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
  const lobotomyCorpLocaleData = Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/Locales/zh-CN.json",
      import.meta.url,
    ),
  );
  const lobotomyCorpAbnormalitiesData = Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/Data/Abnormalities.json",
      import.meta.url,
    ),
  );
  Object.defineProperties(browser, {
    Audio: { configurable: true, value: AudioMock },
    document: {
      configurable: true,
      value: {
        body,
        createElement: () => new Element(),
        documentElement: {
          lang: "zh-CN",
        },
        getElementById: (id: string) =>
          id === "lobotomy-corp-locale-data"
            ? { textContent: lobotomyCorpLocaleData }
            : id === "lobotomy-corp-abnormalities-data"
            ? { textContent: lobotomyCorpAbnormalitiesData }
            : null,
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
  /** @param {Element} overlay 警报外层。 @param {number} cornerIndex 含图标的 Corner 索引。 @return {Element} EmergencyImage 的 RectTransform 容器。 */ const riskRect =
    (overlay: Element, cornerIndex: number) =>
      corners(overlay)[cornerIndex].children[0].children[1];
  try {
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    const api = browser.lobotomyCorpEasterEgg!;
    assertEquals(
      api.matchingAbnormality("  t-03-46  ")?.canonicalId,
      "T-03-46",
    );
    assertEquals(
      api.matchingAbnormality("bald-is-awesome!")?.canonicalId,
      "Bald-is-awesome!",
    );
    assertEquals(api.matchingAbnormality("unknown abnormality"), undefined);
    assertEquals(api.matches("first-trumpet"), true);
    [
      "FOURTH TRUMPET",
      "Fourth Trumpet",
      "fourth trumpet",
      "fourth-trumpet",
      "fourthtrumpet",
    ].forEach((name) => assertEquals(api.matches(name), true));
    const first = api.activate("first trumpet");
    const initialFirstOverlay = body.children.at(-1)!;
    const firstRiskRect = riskRect(initialFirstOverlay, 0);
    const firstAudio = AudioMock.items[0];
    assertEquals(firstRiskRect.style.left, "273px");
    assertEquals(firstRiskRect.style.top, "273px");
    assertEquals(firstRiskRect.style.width, "150px");
    assertEquals(firstRiskRect.style.height, "150px");
    assertEquals(firstRiskRect.style.transform, "rotate(135deg)");
    const second = api.activate("second trumpet");
    const secondOverlay = body.children.at(-1)!;
    const secondRiskRect = riskRect(secondOverlay, 0);
    const secondAudio = AudioMock.items[1];
    assertEquals(secondRiskRect.style.left, "273px");
    assertEquals(secondRiskRect.style.top, "273px");
    assertEquals(secondRiskRect.style.width, "150px");
    assertEquals(secondRiskRect.style.height, "150px");
    assertEquals(secondRiskRect.style.transform, "rotate(135deg)");
    assertEquals(firstAudio.pauseCount, 1);
    assertEquals(secondAudio.src.endsWith("second-trumpet.wav"), true);
    assertEquals(await first, true);
    const third = api.activate("third trumpet");
    const thirdOverlay = body.children.at(-1)!;
    const thirdRiskRect = riskRect(thirdOverlay, 0);
    const thirdAudio = AudioMock.items[2];
    assertEquals(thirdRiskRect.style.left, "273px");
    assertEquals(thirdRiskRect.style.top, "273px");
    assertEquals(thirdRiskRect.style.width, "150px");
    assertEquals(thirdRiskRect.style.height, "150px");
    assertEquals(thirdRiskRect.style.transform, "rotate(135deg)");
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
    const fourthRiskRects = [0, 1, 3].map((cornerIndex) =>
      riskRect(fourthOverlay, cornerIndex)
    );
    assertEquals(trumpet(fourthOverlay), "Fourth\nTrumpet");
    assertEquals(risk(fourthOverlay).src.endsWith("MiddleArea_4_27.png"), true);
    fourthRiskRects.forEach((currentRiskRect) => {
      assertEquals(currentRiskRect.style.left, "290px");
      assertEquals(currentRiskRect.style.top, "284px");
      assertEquals(currentRiskRect.style.width, "110px");
      assertEquals(currentRiskRect.style.height, "110px");
      assertEquals(currentRiskRect.style.transform, "rotate(135deg)");
    });
    const fourthAudio = AudioMock.items[3];
    assertEquals(AudioMock.items.length, 4);
    assertEquals(thirdAudio.pauseCount, 1);
    assertEquals(fourthAudio.src.endsWith("fourth-trumpet.wav"), true);
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
      "Danger Score 必须是 0 到 100 的有限数值。",
    );
    await api.restartDay();
    assertEquals(api.getDangerScore(), 0);
    await api.setDangerScore(5 / 11);
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-day")?.includes(
        '"dangerScore":0.454545',
      ),
      true,
    );
    await api.setDangerScore(0);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-day"), null);
    void api.handleAbnormalitySubmitted("T-01-54");
    assertEquals(Math.abs(api.getDangerScore() - 20 / 11) < 1e-10, true);
    void api.handleAbnormalitySubmitted("t-01-54");
    assertEquals(Math.abs(api.getDangerScore() - 20 / 11) < 1e-10, true);
    void api.handleAbnormalitySubmitted("T-01-68");
    assertEquals(Math.abs(api.getDangerScore() - 60 / 11) < 1e-10, true);
    void api.handleAbnormalitySubmitted("O-06-20");
    assertEquals(Math.abs(api.getDangerScore() - 135 / 11) < 1e-10, true);
    const tethRestart = api.restartDay();
    body.children.at(-1)!.children[1].children[0].dispatch("animationend");
    await tethRestart;
    void api.handleAbnormalitySubmitted("T-03-46");
    assertEquals(api.getDangerScore(), 98);
  } finally {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
    delete browser.lobotomyCorpEasterEgg;
  }
});

Deno.test("Lobotomy Corporation preserves fractional Days across navigation and clears them on reload or coordinator interruption", async () => {
  class StorageMock {
    #values = new Map<string, string>();
    /** @param {string} key 存储键。 @return {string|null} 存储值。 */ getItem(
      key: string,
    ): string | null {
      return this.#values.get(key) ?? null;
    }
    /** @param {string} key 存储键。 @param {string} value 存储值。 */ setItem(
      key: string,
      value: string,
    ): void {
      this.#values.set(key, value);
    }
    /** @param {string} key 存储键。 */ removeItem(key: string): void {
      this.#values.delete(key);
    }
  }
  const browser = globalThis as typeof globalThis & {
    document?: unknown;
    easterEggCoordinator?: { start: (id: string, stop: () => void) => void };
    localStorage?: unknown;
    performance?: unknown;
    sessionStorage?: unknown;
    lobotomyCorpEasterEgg?: {
      getDangerScore: () => number;
      handleAbnormalitySubmitted: (name: string) => Promise<boolean>;
      matchingAbnormality: (
        name: string,
      ) => { canonicalId: string } | undefined;
      prepareDisplayName: (name: string) => {
        cancel: () => void;
        commit: () => Promise<boolean>;
      };
      onAbnormalitySubmitted: (
        listener: (canonicalId: string) => void,
      ) => () => boolean;
    };
  };
  const original = Object.fromEntries(
    [
      "Audio",
      "document",
      "easterEggCoordinator",
      "localStorage",
      "performance",
      "sessionStorage",
    ]
      .map((name) => [name, Object.getOwnPropertyDescriptor(browser, name)]),
  );
  const storage = new StorageMock();
  const localeData = Deno.readTextFileSync(
    new URL("../static/fun/lobotomy-corp/Locales/zh-CN.json", import.meta.url),
  );
  const abnormalitiesData = Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/Data/Abnormalities.json",
      import.meta.url,
    ),
  );
  let navigationType = "navigate";
  let coordinatorStop: (() => void) | undefined;
  class AudioMock {
    static items: AudioMock[] = [];
    currentTime = 0;
    hidden = false;
    pauseCount = 0;
    preload = "";
    /** @param {string} source 音频地址。 */ constructor(public src: string) {
      AudioMock.items.push(this);
    }
    /** @return {Promise<void>} 播放结果。 */ play(): Promise<void> {
      return Promise.resolve();
    }
    /** 暂停预备或活动音频。 */ pause(): void {
      this.pauseCount++;
    }
    /** @param {string} _name 属性名。 @param {string} _value 属性值。 */ setAttribute(
      _name: string,
      _value: string,
    ): void {}
    /** @param {string} _name 属性名。 */ removeAttribute(
      _name: string,
    ): void {}
    /** 释放媒体资源。 */ load(): void {}
  }
  Object.defineProperties(browser, {
    Audio: { configurable: true, value: AudioMock },
    document: {
      configurable: true,
      value: {
        documentElement: { lang: "zh-CN" },
        getElementById: (id: string) =>
          id === "lobotomy-corp-locale-data"
            ? { textContent: localeData }
            : id === "lobotomy-corp-abnormalities-data"
            ? { textContent: abnormalitiesData }
            : null,
      },
    },
    easterEggCoordinator: {
      configurable: true,
      value: {
        start: (_id: string, stop: () => void) => coordinatorStop = stop,
      },
    },
    localStorage: { configurable: true, value: storage },
    performance: {
      configurable: true,
      value: { getEntriesByType: () => [{ type: navigationType }] },
    },
    sessionStorage: { configurable: true, value: storage },
  });
  try {
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    let api = browser.lobotomyCorpEasterEgg!;
    const cancelledWhiteNight = api.prepareDisplayName("T-03-46");
    cancelledWhiteNight.cancel();
    assertEquals(AudioMock.items.length, 1);
    assertEquals(AudioMock.items[0].pauseCount, 1);
    assertEquals(api.getDangerScore(), 0);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-day"), null);
    const observedCanonicalIds: string[] = [];
    api.onAbnormalitySubmitted((canonicalId) =>
      observedCanonicalIds.push(canonicalId)
    );
    await api.handleAbnormalitySubmitted("O-03-03");
    assertEquals(observedCanonicalIds, ["O-03-03"]);
    assertEquals(api.getDangerScore(), 0);
    assertEquals(
      api.matchingAbnormality("  秃头-真是-太棒啦！  ")?.canonicalId,
      "Bald-is-awesome!",
    );
    await api.handleAbnormalitySubmitted("T-01-54");
    assertEquals(Math.abs(api.getDangerScore() - 20 / 11) < 1e-10, true);
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-day")?.includes("T-01-54"),
      true,
    );

    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    api = browser.lobotomyCorpEasterEgg!;
    assertEquals(Math.abs(api.getDangerScore() - 20 / 11) < 1e-10, true);
    await api.handleAbnormalitySubmitted("t-01-54");
    assertEquals(Math.abs(api.getDangerScore() - 20 / 11) < 1e-10, true);

    await api.handleAbnormalitySubmitted("O-06-20");
    assertEquals(api.getDangerScore() > 0 && api.getDangerScore() < 10, true);
    coordinatorStop?.();
    assertEquals(api.getDangerScore(), 0);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-day"), null);

    await api.handleAbnormalitySubmitted("T-01-54");
    navigationType = "reload";
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    assertEquals(browser.lobotomyCorpEasterEgg!.getDangerScore(), 0);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-day"), null);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-alert"), null);
  } finally {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
    delete browser.lobotomyCorpEasterEgg;
  }
});
