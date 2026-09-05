/**
 * @file 本文件验证用户名彩蛋前端匹配规则。
 */
import { assertEquals } from "./test_helpers.ts";

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
    await import("../static/easter-egg/ace-attorney/ace-attorney.js");
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
    children: MockElement[] = [];
    className = "";
    dataset: Record<string, string> = {};
    hidden = false;
    removed = false;
    src = "";
    textContent = "";
    type = "";
    #listeners = new Map<string, (() => void)[]>();

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
     * @param {() => void} listener 事件处理函数。
     */
    addEventListener(eventName: string, listener: () => void): void {
      const listeners = this.#listeners.get(eventName) ?? [];
      listeners.push(listener);
      this.#listeners.set(eventName, listeners);
    }

    /**
     * 移除模拟事件监听器。
     *
     * @param {string} eventName 事件名称。
     * @param {() => void} listener 事件处理函数。
     */
    removeEventListener(eventName: string, listener: () => void): void {
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
     * @param {string} _name 属性名称。
     * @param {string} _value 属性值。
     */
    setAttribute(_name: string, _value: string): void {
      // 模拟元素不需要保留无障碍属性内容。
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
      this.#listeners.get(eventName)?.forEach((listener) => listener());
    }
  }

  class MockAudio {
    hidden = false;
    preload = "";
    src: string;

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
     * @param {string} _eventName 事件名称。
     * @param {() => void} _listener 事件处理函数。
     */
    addEventListener(_eventName: string, _listener: () => void): void {
      // 由关闭按钮结束本轮模拟警报。
    }

    /**
     * 移除模拟音频事件监听器。
     *
     * @param {string} _eventName 事件名称。
     * @param {() => void} _listener 事件处理函数。
     */
    removeEventListener(_eventName: string, _listener: () => void): void {
      // 模拟音频未持有监听器。
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
    localStorage?: unknown;
    performance?: unknown;
    sessionStorage?: unknown;
    lobotomyCorpEasterEgg?: {
      activate: (value: string) => Promise<boolean>;
      matches: (value: string) => boolean;
    };
  };
  const originalAudio = Object.getOwnPropertyDescriptor(browserGlobal, "Audio");
  const originalDocument = Object.getOwnPropertyDescriptor(
    browserGlobal,
    "document",
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
    querySelectorAll: () => [],
  };
  Object.defineProperty(browserGlobal, "Audio", {
    configurable: true,
    value: MockAudio,
  });
  Object.defineProperty(browserGlobal, "document", {
    configurable: true,
    value: documentMock,
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
      `../static/easter-egg/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
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
    assertEquals(overlay.children.length, 6);
    assertEquals(
      overlay.children[0].src.endsWith("images/first-trumpet/tr-corner.png"),
      true,
    );
    assertEquals(overlay.children[4].className, "lobotomy-corp-alert-close");
    assertEquals(overlay.children[5].hidden, true);
    overlay.children[4].dispatch("click");
    assertEquals(await completed, true);
    assertEquals(overlay.removed, true);
    assertEquals(sessionStorage.getItem("warmnest.lobotomy-corp-alert"), null);

    sessionStorage.setItem(
      "warmnest.lobotomy-corp-alert",
      JSON.stringify({
        assetDirectory: "first-trumpet",
        position: 12,
        startedAt: Date.now(),
      }),
    );
    Object.defineProperty(browserGlobal, "performance", {
      configurable: true,
      value: {
        getEntriesByType: () => [{ type: "reload" }],
      },
    });
    await import(
      `../static/easter-egg/lobotomy-corp/lobotomy-corp.js?reload-test=${crypto.randomUUID()}`
    );
    assertEquals(sessionStorage.getItem("warmnest.lobotomy-corp-alert"), null);
    assertEquals(body.children.length, 1);
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
      Object.defineProperty(browserGlobal, "localStorage", originalLocalStorage);
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
