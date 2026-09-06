/**
 * @file 本文件验证用户名彩蛋前端匹配规则。
 */
import { assertEquals, assertRejects } from "./test_helpers.ts";

Deno.test("Easter egg coordinator interrupts only a different game", async () => {
  const browserGlobal = globalThis as unknown as {
    easterEggCoordinator?: {
      finish: (gameId: string, stop: () => void) => void;
      start: (gameId: string, stop: () => void) => void;
    };
  };
  const originalCoordinator = browserGlobal.easterEggCoordinator;
  const interruptions: string[] = [];
  const stopAceAttorney = () => interruptions.push("ace-attorney");
  const stopDuplicateAceAttorney = () =>
    interruptions.push("duplicate-ace-attorney");
  const stopLobotomyCorp = () => interruptions.push("lobotomy-corp");

  try {
    await import(
      `../static/fun/coordinator.js?test=${crypto.randomUUID()}`
    );
    const coordinator = browserGlobal.easterEggCoordinator;
    if (!coordinator) {
      throw new Error("彩蛋协调器 API 未初始化。");
    }

    coordinator.start("ace-attorney", stopAceAttorney);
    coordinator.start("ace-attorney", stopDuplicateAceAttorney);
    assertEquals(interruptions, []);
    coordinator.finish("ace-attorney", stopDuplicateAceAttorney);

    coordinator.start("lobotomy-corp", stopLobotomyCorp);
    assertEquals(interruptions, ["ace-attorney"]);
    coordinator.finish("ace-attorney", stopAceAttorney);

    coordinator.start("future-game", () => interruptions.push("future-game"));
    assertEquals(interruptions, ["ace-attorney", "lobotomy-corp"]);
  } finally {
    if (originalCoordinator) {
      browserGlobal.easterEggCoordinator = originalCoordinator;
    } else {
      delete browserGlobal.easterEggCoordinator;
    }
  }
});

Deno.test("username Easter egg matches names and resolves localized assets", async () => {
  const browserGlobal = globalThis as unknown as {
    document?: unknown;
    usernameEasterEgg?: {
      imageLocale: () => string;
      matches: (username: string) => boolean;
      theme: (
        username: string,
      ) => "trilogy" | "aa456" | "investigations" | undefined;
      voiceLocale: (username?: string) => string;
    };
  };
  const originalDocument = browserGlobal.document;
  const documentMock = {
    documentElement: { lang: "zh-CN" },
    querySelectorAll: () => [],
  };
  Object.defineProperty(browserGlobal, "document", {
    configurable: true,
    value: documentMock,
  });

  try {
    await import("../static/fun/ace-attorney/ace-attorney.js");
    const api = browserGlobal.usernameEasterEgg;
    if (!api) {
      throw new Error("用户名彩蛋 API 未初始化。");
    }

    [
      "Phoenix Wright",
      "wright phoenix",
      "成步堂龙一",
      "龍一成歩堂",
      "成步堂 龍一",
      "なるほどう りゅういち",
      "りゅういちなるほどう",
      "나루호도 류이치",
      "Apollo Justice",
      "法介王泥喜",
      "おどろきほうすけ",
      "오도로키 호스케",
      "Athena Cykes",
      "心音 希月",
      "きづき ここね",
      "키즈키 코코네",
      "Miles Edgeworth",
      "怜侍御剑",
      "みつるぎれいじ",
      "Benjamin Hunter",
      "御劍 怜侍",
      "미츠루기 레이지",
      "Mia Fey",
      "Mía Fey",
      "千尋綾里",
      "あやさと ちひろ",
      "아야사토 치히로",
    ].forEach((username) => assertEquals(api.matches(username), true));
    assertEquals(api.matches("Phoenix"), false);
    assertEquals(api.matches("普通用户"), false);
    assertEquals(api.theme("成步堂龙一"), "trilogy");
    assertEquals(api.theme("御剑怜侍"), "investigations");
    assertEquals(api.theme("Miles Edgeworth"), "investigations");
    assertEquals(api.theme("怜侍御剣"), "investigations");
    assertEquals(api.theme("王泥喜法介"), "aa456");
    assertEquals(api.theme("希月心音"), "aa456");
    assertEquals(api.theme("普通用户"), undefined);

    [
      ["zh-CN", "zh-CN"],
      ["zh-SG", "zh-CN"],
      ["zh-TW", "zh-TW"],
      ["zh-HK", "zh-TW"],
      ["zh-MO", "zh-TW"],
      ["ja-JP", "ja-JP"],
      ["fr-FR", "fr-FR"],
      ["en-GB", "en-US"],
      ["pt-PT", "en-US"],
      ["it-IT", "en-US"],
    ].forEach(([locale, expected]) => {
      documentMock.documentElement.lang = locale;
      assertEquals(api.imageLocale(), expected);
    });

    [
      ["zh-HK", "zh-CN"],
      ["ja-JP", "ja-JP"],
      ["en-GB", "en-US"],
      ["de-DE", "de-DE"],
      ["pt-BR", "pt-BR"],
      ["es-ES", "es-ES"],
      ["it-IT", "en-US"],
    ].forEach(([locale, expected]) => {
      documentMock.documentElement.lang = locale;
      assertEquals(api.voiceLocale(), expected);
    });
    documentMock.documentElement.lang = "es-ES";
    assertEquals(api.voiceLocale("Apollo Justice"), "en-US");
  } finally {
    Object.defineProperty(browserGlobal, "document", {
      configurable: true,
      value: originalDocument,
    });
    delete browserGlobal.usernameEasterEgg;
  }
});

Deno.test("Lobotomy Corporation alert matches Trumpet names and closes cleanly", async () => {
  class MockElement {
    alt = "";
    attributes: Record<string, string> = {};
    children: MockElement[] = [];
    className = "";
    dataset: Record<string, string> = {};
    disabled = false;
    hidden = false;
    offsetWidth = 1200;
    removed = false;
    src = "";
    style: {
      [property: string]: string | ((property: string, value: string) => void);
    } = {};
    textContent = "";
    type = "";
    #listeners = new Map<string, ((event: Event) => void)[]>();

    /**
     * 创建可记录内联样式的模拟元素。
     */
    constructor() {
      this.style.setProperty = (property: string, value: string) => {
        this.style[property] = value;
      };
    }

    /**
     * 追加模拟的 DOM 子节点。
     *
     * @param {...MockElement} children 要追加的子节点。
     */
    append(...children: MockElement[]): void {
      this.children.push(...children);
    }

    /**
     * 注册模拟事件监听器。
     *
     * @param {string} eventName 事件名称。
     * @param {(event: Event) => void} listener 事件处理函数。
     */
    addEventListener(
      eventName: string,
      listener: (event: Event) => void,
    ): void {
      const listeners = this.#listeners.get(eventName) ?? [];
      listeners.push(listener);
      this.#listeners.set(eventName, listeners);
    }

    /**
     * 移除模拟事件监听器。
     *
     * @param {string} eventName 事件名称。
     * @param {(event: Event) => void} listener 事件处理函数。
     */
    removeEventListener(
      eventName: string,
      listener: (event: Event) => void,
    ): void {
      const listeners = this.#listeners.get(eventName) ?? [];
      this.#listeners.set(
        eventName,
        listeners.filter((registeredListener) =>
          registeredListener !== listener
        ),
      );
    }

    /**
     * 设置模拟属性。
     *
     * @param {string} name 属性名称。
     * @param {string} value 属性值。
     */
    setAttribute(name: string, value: string): void {
      this.attributes[name] = value;
    }

    /**
     * 标记模拟元素已从页面移除。
     */
    remove(): void {
      this.removed = true;
    }

    /**
     * 触发模拟事件。
     *
     * @param {string} eventName 事件名称。
     */
    dispatch(eventName: string): void {
      const event = new Event(eventName);
      this.#listeners.get(eventName)?.forEach((listener) => listener(event));
    }
  }

  class MockAudio {
    hidden = false;
    preload = "";
    src: string;
    #listeners = new Map<string, ((event: Event) => void)[]>();

    /**
     * 创建模拟音频。
     *
     * @param {string} source 音频资源地址。
     */
    constructor(source: string) {
      this.src = source;
    }

    /**
     * 注册模拟音频事件监听器。
     *
     * @param {string} eventName 事件名称。
     * @param {(event: Event) => void} listener 事件处理函数。
     */
    addEventListener(
      eventName: string,
      listener: (event: Event) => void,
    ): void {
      const listeners = this.#listeners.get(eventName) ?? [];
      listeners.push(listener);
      this.#listeners.set(eventName, listeners);
    }

    /**
     * 移除模拟音频事件监听器。
     *
     * @param {string} eventName 事件名称。
     * @param {(event: Event) => void} listener 事件处理函数。
     */
    removeEventListener(
      eventName: string,
      listener: (event: Event) => void,
    ): void {
      const listeners = this.#listeners.get(eventName) ?? [];
      this.#listeners.set(
        eventName,
        listeners.filter((registeredListener) =>
          registeredListener !== listener
        ),
      );
    }

    /**
     * 模拟开始播放音频。
     *
     * @return {Promise<void>} 已开始播放的 Promise。
     */
    play(): Promise<void> {
      return Promise.resolve();
    }

    /**
     * 模拟暂停音频。
     */
    pause(): void {
      // 模拟音频无需额外清理。
    }

    /**
     * 以真实 Event 参数触发模拟媒体事件。
     *
     * @param {string} eventName 事件名称。
     */
    dispatch(eventName: string): void {
      const event = new Event(eventName);
      this.#listeners.get(eventName)?.forEach((listener) => listener(event));
    }

    /**
     * 设置模拟媒体节点的属性。
     *
     * @param {string} _name 属性名。
     * @param {string} _value 属性值。
     */
    setAttribute(_name: string, _value: string): void {
      // 模拟媒体节点不需要保留属性。
    }
  }

  class MockSessionStorage {
    #entries = new Map<string, string>();

    /**
     * 读取模拟会话存储中的值。
     *
     * @param {string} key 存储键。
     * @return {string|null} 对应的值；不存在时返回 null。
     */
    getItem(key: string): string | null {
      return this.#entries.get(key) ?? null;
    }

    /**
     * 写入模拟会话存储。
     *
     * @param {string} key 存储键。
     * @param {string} value 存储值。
     */
    setItem(key: string, value: string): void {
      this.#entries.set(key, value);
    }

    /**
     * 删除模拟会话存储中的值。
     *
     * @param {string} key 存储键。
     */
    removeItem(key: string): void {
      this.#entries.delete(key);
    }
  }

  const browserGlobal = globalThis as unknown as {
    Audio?: unknown;
    document?: unknown;
    innerWidth?: number;
    localStorage?: unknown;
    performance?: unknown;
    sessionStorage?: unknown;
    lobotomyCorpEasterEgg?: {
      activate: (value: string) => Promise<boolean>;
      getDangerScore: () => number;
      matches: (value: string) => boolean;
      setDangerScore: (dangerScore: number) => Promise<boolean>;
    };
  };
  const originalAudio = Object.getOwnPropertyDescriptor(browserGlobal, "Audio");
  const originalDocument = Object.getOwnPropertyDescriptor(
    browserGlobal,
    "document",
  );
  const originalInnerWidth = Object.getOwnPropertyDescriptor(
    browserGlobal,
    "innerWidth",
  );
  const originalSessionStorage = Object.getOwnPropertyDescriptor(
    browserGlobal,
    "sessionStorage",
  );
  const originalLocalStorage = Object.getOwnPropertyDescriptor(
    browserGlobal,
    "localStorage",
  );
  const originalPerformance = Object.getOwnPropertyDescriptor(
    browserGlobal,
    "performance",
  );
  const body = new MockElement();
  const sessionStorage = new MockSessionStorage();
  const documentMock = {
    body,
    createElement: () => new MockElement(),
    documentElement: {
      dataset: { lobotomyCorpRestartDay: "重新开始这一天" },
      lang: "zh-CN",
    },
    querySelectorAll: () => [],
  };

  /**
   * 读取模拟 EmergencyController 的四个 Corner 节点。
   *
   * @param {MockElement} overlay 警报外层节点。
   * @return {MockElement[]} ActiveControl 中的 Corner 节点。
   */
  function emergencyCorners(overlay: MockElement): MockElement[] {
    return overlay.children[0].children[0].children;
  }

  /**
   * 读取 Corner/Texture 下的 Triangle Sprite 节点。
   *
   * @param {MockElement} corner Unity 风格 Corner 节点。
   * @return {MockElement} Triangle 图片节点。
   */
  function cornerTriangle(corner: MockElement): MockElement {
    return corner.children[0].children[0];
  }

  /**
   * 读取 Corner/Texture/Factorial 下的 Risk Sprite 节点。
   *
   * @param {MockElement} corner 含 Factorial 的 Corner 节点。
   * @return {MockElement} Risk 图片节点。
   */
  function cornerRisk(corner: MockElement): MockElement {
    return corner.children[0].children[1].children[0];
  }

  /**
   * 读取独立于 HUD 闪烁的顶部结束面板。
   *
   * @param {MockElement} overlay 警报外层节点。
   * @return {MockElement} 顶部结束面板节点。
   */
  function topPanelFor(overlay: MockElement): MockElement {
    return overlay.children[1];
  }

  /**
   * 读取顶部结束面板中的业务结束按钮。
   *
   * @param {MockElement} overlay 警报外层节点。
   * @return {MockElement} 结束警报按钮节点。
   */
  function endAlertButtonFor(overlay: MockElement): MockElement {
    return topPanelFor(overlay).children[0].children[1].children[1];
  }

  /**
   * 读取顶部面板的 ActiveController 动画节点。
   *
   * @param {MockElement} overlay 警报外层节点。
   * @return {MockElement} 面板动画节点。
   */
  function topPanelActiveControllerFor(overlay: MockElement): MockElement {
    return topPanelFor(overlay).children[0];
  }

  /**
   * 触发顶部面板反向动画完成，以模拟浏览器 animationend。
   *
   * @param {MockElement} overlay 警报外层节点。
   */
  function finishTopPanelDisappear(overlay: MockElement): void {
    topPanelActiveControllerFor(overlay).dispatch("animationend");
  }

  /**
   * 读取警报外层节点中的模拟音频。
   *
   * @param {MockElement} overlay 警报外层节点。
   * @return {MockAudio} 警报音频节点。
   */
  function alertAudioFor(overlay: MockElement): MockAudio {
    return overlay.children[2] as unknown as MockAudio;
  }

  Object.defineProperty(browserGlobal, "Audio", {
    configurable: true,
    value: MockAudio,
  });
  Object.defineProperty(browserGlobal, "document", {
    configurable: true,
    value: documentMock,
  });
  Object.defineProperty(browserGlobal, "innerWidth", {
    configurable: true,
    value: 1920,
  });
  Object.defineProperty(browserGlobal, "sessionStorage", {
    configurable: true,
    value: sessionStorage,
  });
  Object.defineProperty(browserGlobal, "localStorage", {
    configurable: true,
    value: sessionStorage,
  });

  try {
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    const api = browserGlobal.lobotomyCorpEasterEgg;
    if (!api) {
      throw new Error("脑叶公司彩蛋 API 未初始化。");
    }

    [
      "FIRST TRUMPET",
      "first-trumpet",
      "first trumpet",
      "second trumpet",
      "third trumpet",
    ].forEach(
      (name) => assertEquals(api.matches(name), true),
    );
    assertEquals(api.matches("fourth trumpet"), false);

    const completed = api.activate("first trumpet");
    assertEquals(body.children.length, 1);
    assertEquals(
      sessionStorage.getItem("warmnest.lobotomy-corp-alert")?.includes(
        '"assetDirectory":"first-trumpet"',
      ),
      true,
    );
    const overlay = body.children[0];
    const firstCorners = emergencyCorners(overlay);
    const topPanel = topPanelFor(overlay);
    assertEquals(overlay.children.length, 3);
    assertEquals(firstCorners.length, 4);
    assertEquals(
      overlay.children[0].style["--lobotomy-corp-unity-canvas-scale"],
      "1",
    );
    assertEquals(topPanel.className, "lobotomy-corp-top-panel");
    assertEquals(
      topPanel.style["--lobotomy-corp-unity-canvas-scale"],
      "1",
    );
    assertEquals(
      topPanel.children[0].className,
      "lobotomy-corp-top-panel-active-controller",
    );
    assertEquals(
      topPanel.children[0].children[0].src.endsWith("Sprite/Valve.png"),
      true,
    );
    assertEquals(
      topPanel.children[0].children[1].className,
      "lobotomy-corp-top-panel-frame-outter",
    );
    assertEquals(
      topPanel.children[0].children[1].children[0].src.endsWith(
        "Sprite/Risk_Frame_Inner.png",
      ),
      true,
    );
    assertEquals(
      endAlertButtonFor(overlay).className,
      "lobotomy-corp-top-panel-action-button",
    );
    assertEquals(
      endAlertButtonFor(overlay).children[2].textContent,
      "重新开始这一天",
    );
    assertEquals(
      endAlertButtonFor(overlay).attributes["aria-label"],
      "重新开始这一天",
    );
    assertEquals(
      endAlertButtonFor(overlay).children[0].className,
      "lobotomy-corp-top-panel-action-button-sprite normal",
    );
    assertEquals(
      endAlertButtonFor(overlay).children[1].className,
      "lobotomy-corp-top-panel-action-button-sprite pressed",
    );
    Object.defineProperty(browserGlobal, "innerWidth", {
      configurable: true,
      value: 2560,
    });
    globalThis.dispatchEvent(new Event("resize"));
    assertEquals(
      overlay.children[0].style["--lobotomy-corp-unity-canvas-scale"],
      String(2560 / 1920),
    );
    assertEquals(
      topPanel.style["--lobotomy-corp-unity-canvas-scale"],
      String(2560 / 1920),
    );
    Object.defineProperty(browserGlobal, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    globalThis.dispatchEvent(new Event("resize"));
    assertEquals(
      overlay.children[0].style["--lobotomy-corp-unity-canvas-scale"],
      String(1280 / 1920),
    );
    Object.defineProperty(browserGlobal, "innerWidth", {
      configurable: true,
      value: 720,
    });
    globalThis.dispatchEvent(new Event("resize"));
    assertEquals(
      overlay.children[0].style["--lobotomy-corp-unity-canvas-scale"],
      String(720 / 1920),
    );
    assertEquals(
      cornerTriangle(firstCorners[0]).src.endsWith("Sprite/Triangle_1.png"),
      true,
    );
    assertEquals(
      cornerTriangle(firstCorners[2]).src.endsWith("Sprite/Triangle_2.png"),
      true,
    );
    assertEquals(
      cornerRisk(firstCorners[0]).src.endsWith("Sprite/Risk_1.png"),
      true,
    );
    assertEquals(
      firstCorners[0].children[0].children[1].style.transform,
      "rotate(135deg)",
    );
    assertEquals(
      firstCorners[2].children[0].children[1].style.transform,
      "rotate(-45deg) scaleY(-1)",
    );
    assertEquals(
      firstCorners[2].children[0].children[1].className,
      "lobotomy-corp-alert-trumpet-level",
    );
    assertEquals(
      firstCorners[2].children[0].children[1].style.left,
      "95.9px",
    );
    assertEquals(
      firstCorners[2].children[0].children[1].style.top,
      "236px",
    );
    assertEquals(
      firstCorners[2].children[0].children[1].style.width,
      "430.2px",
    );
    assertEquals(
      firstCorners[2].children[0].children[1].style.height,
      "150px",
    );
    assertEquals(
      firstCorners[2].children[0].children[1].children[0].className,
      "lobotomy-corp-alert-trumpet-level-content",
    );
    assertEquals(
      firstCorners[2].children[0].children[1].children[0].textContent,
      "First\nTrumpet",
    );
    assertEquals(firstCorners[0].children[1].textContent, "ALERT ".repeat(85));
    assertEquals(overlay.children[2].hidden, true);
    assertEquals(
      overlay.children[2].src.endsWith("Assets/AudioClip/first-trumpet.wav"),
      true,
    );
    endAlertButtonFor(overlay).dispatch("click");
    assertEquals(overlay.removed, false);
    assertEquals(endAlertButtonFor(overlay).disabled, true);
    assertEquals(
      topPanel.dataset.lobotomyCorpTopPanelState,
      "disappearing",
    );
    assertEquals(sessionStorage.getItem("warmnest.lobotomy-corp-alert"), null);
    finishTopPanelDisappear(overlay);
    assertEquals(await completed, true);
    assertEquals(overlay.removed, true);

    const firstAlert = api.activate("first trumpet");
    const firstOverlay = body.children[1];
    const firstTopPanel = topPanelFor(firstOverlay);
    if (firstTopPanel === topPanel) {
      throw new Error("独立警报必须创建新面板并重新播放 Appear 动画。");
    }
    assertEquals(
      firstTopPanel.dataset.lobotomyCorpTopPanelReused,
      undefined,
    );
    const thirdAlert = api.activate("third trumpet");
    const thirdOverlay = body.children[2];
    assertEquals(firstOverlay.removed, true);
    if (topPanelFor(thirdOverlay) !== firstTopPanel) {
      throw new Error("Trumpet 等级切换应复用同一个顶部结束面板。");
    }
    assertEquals(
      cornerRisk(emergencyCorners(thirdOverlay)[0]).src.endsWith(
        "Sprite/Risk_3.png",
      ),
      true,
    );
    assertEquals(
      sessionStorage.getItem("warmnest.lobotomy-corp-alert")?.includes(
        '"assetDirectory":"third-trumpet"',
      ),
      true,
    );
    assertEquals(await firstAlert, true);

    const secondAlert = api.activate("second trumpet");
    const secondOverlay = body.children[3];
    assertEquals(thirdOverlay.removed, true);
    if (topPanelFor(secondOverlay) !== firstTopPanel) {
      throw new Error("连续切换 Trumpet 等级不应创建额外顶部结束面板。");
    }
    assertEquals(
      cornerRisk(emergencyCorners(secondOverlay)[0]).src.endsWith(
        "Sprite/Risk_2.png",
      ),
      true,
    );
    assertEquals(await thirdAlert, true);

    api.activate("second trumpet");
    assertEquals(secondOverlay.removed, false);
    assertEquals(body.children.length, 4);
    endAlertButtonFor(secondOverlay).dispatch("click");
    assertEquals(secondOverlay.removed, false);
    assertEquals(
      topPanelFor(secondOverlay).dataset.lobotomyCorpTopPanelState,
      "disappearing",
    );
    finishTopPanelDisappear(secondOverlay);
    assertEquals(await secondAlert, true);
    assertEquals(secondOverlay.removed, true);

    assertEquals(api.getDangerScore(), 0);
    const firstDangerAlert = api.setDangerScore(10);
    const firstDangerOverlay = body.children[4];
    assertEquals(api.getDangerScore(), 10);
    assertEquals(
      cornerRisk(emergencyCorners(firstDangerOverlay)[0]).src.endsWith(
        "Sprite/Risk_1.png",
      ),
      true,
    );
    api.setDangerScore(49);
    assertEquals(firstDangerOverlay.removed, false);
    assertEquals(body.children.length, 5);

    const secondDangerAlert = api.setDangerScore(50);
    const secondDangerOverlay = body.children[5];
    assertEquals(firstDangerOverlay.removed, true);
    assertEquals(api.getDangerScore(), 50);
    assertEquals(
      cornerRisk(emergencyCorners(secondDangerOverlay)[0]).src.endsWith(
        "Sprite/Risk_2.png",
      ),
      true,
    );
    assertEquals(await firstDangerAlert, true);
    api.setDangerScore(79);
    assertEquals(secondDangerOverlay.removed, false);
    assertEquals(body.children.length, 6);

    const thirdDangerAlert = api.setDangerScore(80);
    const thirdDangerOverlay = body.children[6];
    assertEquals(secondDangerOverlay.removed, true);
    assertEquals(api.getDangerScore(), 80);
    assertEquals(
      cornerRisk(emergencyCorners(thirdDangerOverlay)[0]).src.endsWith(
        "Sprite/Risk_3.png",
      ),
      true,
    );
    assertEquals(await secondDangerAlert, true);
    api.setDangerScore(100);
    assertEquals(thirdDangerOverlay.removed, false);
    assertEquals(body.children.length, 7);
    const clearDangerAlert = api.setDangerScore(9);
    assertEquals(thirdDangerOverlay.removed, false);
    finishTopPanelDisappear(thirdDangerOverlay);
    assertEquals(await clearDangerAlert, true);
    assertEquals(await thirdDangerAlert, true);
    assertEquals(thirdDangerOverlay.removed, true);
    assertEquals(api.getDangerScore(), 9);
    assertEquals(sessionStorage.getItem("warmnest.lobotomy-corp-alert"), null);
    await assertRejects(
      () => api.setDangerScore(101),
      "Danger Score 必须是 0 到 100 的整数。",
    );
    assertEquals(api.getDangerScore(), 9);

    const audioEndedAlert = api.activate("first trumpet");
    const audioEndedOverlay = body.children[7];
    const audioEndedTopPanel = topPanelFor(audioEndedOverlay);
    alertAudioFor(audioEndedOverlay).dispatch("ended");
    assertEquals(audioEndedOverlay.removed, false);
    assertEquals(
      audioEndedTopPanel.dataset.lobotomyCorpTopPanelState,
      "disappearing",
    );
    finishTopPanelDisappear(audioEndedOverlay);
    assertEquals(await audioEndedAlert, true);

    const audioErrorAlert = api.activate("first trumpet");
    const audioErrorOverlay = body.children[8];
    if (topPanelFor(audioErrorOverlay) === audioEndedTopPanel) {
      throw new Error("audio ended 事件不能把面板误存为可复用实例。");
    }
    alertAudioFor(audioErrorOverlay).dispatch("error");
    assertEquals(audioErrorOverlay.removed, false);
    finishTopPanelDisappear(audioErrorOverlay);
    assertEquals(await audioErrorAlert, true);

    const alertAfterAudioError = api.activate("first trumpet");
    const overlayAfterAudioError = body.children[9];
    if (
      topPanelFor(overlayAfterAudioError) === topPanelFor(audioErrorOverlay)
    ) {
      throw new Error("audio error 事件不能把面板误存为可复用实例。");
    }
    endAlertButtonFor(overlayAfterAudioError).dispatch("click");
    finishTopPanelDisappear(overlayAfterAudioError);
    assertEquals(await alertAfterAudioError, true);

    sessionStorage.setItem(
      "warmnest.lobotomy-corp-alert",
      JSON.stringify({
        assetDirectory: "first-trumpet",
        position: 12,
        startedAt: Date.now(),
      }),
    );
    const alertOverlayCountBeforeReload = body.children.length;
    Object.defineProperty(browserGlobal, "performance", {
      configurable: true,
      value: {
        getEntriesByType: () => [{ type: "reload" }],
      },
    });
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?reload-test=${crypto.randomUUID()}`
    );
    assertEquals(sessionStorage.getItem("warmnest.lobotomy-corp-alert"), null);
    assertEquals(body.children.length, alertOverlayCountBeforeReload);

    sessionStorage.setItem(
      "warmnest.lobotomy-corp-alert",
      JSON.stringify({
        assetDirectory: "third-trumpet",
        position: 12,
        startedAt: Date.now(),
      }),
    );
    Object.defineProperty(browserGlobal, "performance", {
      configurable: true,
      value: {
        getEntriesByType: () => [{ type: "navigate" }],
      },
    });
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?restore-test=${crypto.randomUUID()}`
    );
    const restoredOverlay = body.children[alertOverlayCountBeforeReload];
    assertEquals(restoredOverlay.children.length, 3);
    assertEquals(
      topPanelFor(restoredOverlay).className,
      "lobotomy-corp-top-panel",
    );
    endAlertButtonFor(restoredOverlay).dispatch("click");
    assertEquals(restoredOverlay.removed, false);
    finishTopPanelDisappear(restoredOverlay);
    assertEquals(restoredOverlay.removed, true);
    assertEquals(sessionStorage.getItem("warmnest.lobotomy-corp-alert"), null);
  } finally {
    if (originalAudio) {
      Object.defineProperty(browserGlobal, "Audio", originalAudio);
    } else {
      delete browserGlobal.Audio;
    }
    if (originalDocument) {
      Object.defineProperty(browserGlobal, "document", originalDocument);
    } else {
      delete browserGlobal.document;
    }
    if (originalInnerWidth) {
      Object.defineProperty(browserGlobal, "innerWidth", originalInnerWidth);
    } else {
      delete browserGlobal.innerWidth;
    }
    if (originalSessionStorage) {
      Object.defineProperty(
        browserGlobal,
        "sessionStorage",
        originalSessionStorage,
      );
    } else {
      delete browserGlobal.sessionStorage;
    }
    if (originalLocalStorage) {
      Object.defineProperty(
        browserGlobal,
        "localStorage",
        originalLocalStorage,
      );
    } else {
      delete browserGlobal.localStorage;
    }
    if (originalPerformance) {
      Object.defineProperty(browserGlobal, "performance", originalPerformance);
    } else {
      delete browserGlobal.performance;
    }
    delete browserGlobal.lobotomyCorpEasterEgg;
  }
});
