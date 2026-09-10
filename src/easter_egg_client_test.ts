/**
 * @file 本文件验证彩蛋前端的协调及《脑叶公司》Trumpet 警报生命周期。
 */
import { assertEquals, assertRejects } from "./test_helpers.ts";
import { renderLayout } from "./views/html.ts";
import {
  whiteNightConfessionSuppressionDelayMs,
  whiteNightDeathSequenceDurationMs,
} from "../static/fun/lobotomy-corp/Events/WhiteNight.js";

/**
 * 从页面内联脚本中读取《脑叶公司》当前本地化。
 *
 * @param {string} locale 页面 locale。
 * @return {Record<string, string>} 注入的游戏文本。
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

/**
 * 统计页面上仍然可见的 Alert overlay 数量。
 *
 * 用于验证竞态兜底不会因为重复 start 而在同一页面挂载第二个会话。
 *
 * @param {{children: Array<{className: string, removed: boolean}>}} body 页面 body 替身。
 * @return {number} 未移除的 Alert overlay 数量。
 */
function visibleAlertOverlayCount(
  body: { children: Array<{ className: string; removed: boolean }> },
): number {
  return body.children.filter((element) =>
    !element.removed && element.className === "lobotomy-corp-alert-overlay"
  ).length;
}

/**
 * 读取服务器注入的全部赎罪特殊工作别名。
 *
 * @return {string[]} 所有维护 locale 的赎罪文本。
 */
function renderedLobotomyCorpConfessionAliases(): string[] {
  const html = renderLayout({
    body: "",
    csrfToken: "test",
    darkMode: false,
    locale: "zh-CN",
    themeColor: "#000000",
    title: "test",
  });
  const serialized =
    /<script type="application\/json" id="lobotomy-corp-confession-aliases-data">([^<]+)<\/script>/u
      .exec(html)?.[1];
  if (!serialized) throw new Error("Expected embedded confession aliases.");
  return JSON.parse(serialized);
}

/**
 * 安装《脑叶公司》Alert 测试所需的浏览器替身。
 *
 * 只模拟 Alert 生命周期真正依赖的能力：可控时钟与计时器、音频、最小 DOM 与存储。
 *
 * @param {{navigationType?: "navigate" | "reload", now?: number}} [options] 初始导航类型与可控时钟起点。
 * @return {object} 测试上下文。
 */
function installLobotomyCorpAlertHarness(
  options: { navigationType?: "navigate" | "reload"; now?: number } = {},
) {
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
    /** @param {string} name 属性名。 */ removeAttribute(name: string): void {
      delete this.attributes[name];
    }
    /** @param {...Element} nodes 替换当前子节点列表。 */ replaceChildren(
      ...nodes: Element[]
    ): void {
      this.children = [...nodes];
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
    autoplayRejected = false;
    duration = Number.NaN;
    currentTime = 0;
    loop = false;
    muted = false;
    pauseCount = 0;
    playCount = 0;
    preload = "";
    readyState = 0;
    volume = 1;
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
    /** 释放媒体资源。 */ load(): void {}
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
    innerHeight?: number;
    innerWidth?: number;
    localStorage?: unknown;
    location?: unknown;
    performance?: unknown;
    sessionStorage?: unknown;
    lobotomyCorpEasterEgg?: {
      activate: (name: string) => Promise<boolean>;
      commitDisplayName: (name: string) => Promise<boolean>;
      getDangerMusicHighWaterLevel: () => number;
      getDangerScore: () => number;
      getSpecialEvent: () => string | undefined;
      getSpecialEventPhase: () => string | undefined;
      handleAbnormalitySubmitted: (name: string) => Promise<boolean>;
      matches: (name: string) => boolean;
      matchingAbnormality: (
        name: string,
      ) => { canonicalId: string } | undefined;
      prepareDisplayName: (name: string) => {
        commit: () => Promise<boolean>;
        dispose: () => void;
      };
      restartDay: () => Promise<boolean>;
      setDangerScore: (score: number) => Promise<boolean>;
      startWhiteNight: (options: { source: string }) => boolean;
    };
  };
  const original = Object.fromEntries(
    [
      "Audio",
      "document",
      "innerHeight",
      "innerWidth",
      "localStorage",
      "location",
      "performance",
      "sessionStorage",
      "setTimeout",
      "clearTimeout",
    ].map((name) => [name, Object.getOwnPropertyDescriptor(browser, name)]),
  );
  const originalDateNow = Date.now;
  const body = new Element();
  const storage = new StorageMock();
  const documentListeners = new Map<string, ((event: Event) => void)[]>();
  const createdElements: Element[] = [];
  let navigationType = options.navigationType ?? "navigate";
  let now = options.now ?? 0;
  let nextTimerId = 0;
  const timers = new Map<
    number,
    {
      callback: () => void;
      delay: number;
      cleared: boolean;
      fired: boolean;
    }
  >();
  const localeData = Deno.readTextFileSync(
    new URL("../static/fun/lobotomy-corp/Locales/zh-CN.json", import.meta.url),
  );
  const abnormalitiesData = Deno.readTextFileSync(
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
        addEventListener: (name: string, listener: (event: Event) => void) =>
          documentListeners.set(name, [
            ...(documentListeners.get(name) ?? []),
            listener,
          ]),
        createElement: () => {
          const element = new Element();
          createdElements.push(element);
          return element;
        },
        documentElement: { lang: "zh-CN" },
        getElementById: (id: string) =>
          id === "lobotomy-corp-locale-data"
            ? { textContent: localeData }
            : id === "lobotomy-corp-abnormalities-data"
            ? { textContent: abnormalitiesData }
            : null,
        querySelector: () => undefined,
        querySelectorAll: () => [],
        removeEventListener: (name: string, listener: (event: Event) => void) =>
          documentListeners.set(
            name,
            (documentListeners.get(name) ?? []).filter((item) =>
              item !== listener
            ),
          ),
      },
    },
    innerHeight: { configurable: true, value: 1080 },
    innerWidth: { configurable: true, value: 1920 },
    localStorage: { configurable: true, value: storage },
    location: {
      configurable: true,
      value: {
        href: "https://warmnest.test/settings",
        pathname: "/settings",
        search: "",
      },
    },
    performance: {
      configurable: true,
      value: { getEntriesByType: () => [{ type: navigationType }] },
    },
    sessionStorage: { configurable: true, value: storage },
    setTimeout: {
      configurable: true,
      value: (callback: () => void, delay = 0) => {
        const id = ++nextTimerId;
        const timer = {
          callback: () => {
            timer.fired = true;
            callback();
          },
          cleared: false,
          delay,
          fired: false,
        };
        timers.set(id, timer);
        return id;
      },
    },
    clearTimeout: {
      configurable: true,
      value: (id: number) => {
        const timer = timers.get(id);
        if (timer) timer.cleared = true;
      },
    },
  });
  Date.now = () => now;
  return {
    AudioMock,
    body,
    storage,
    timers,
    /** @return {object} 当前已加载的彩蛋 API。 */ api: () =>
      browser.lobotomyCorpEasterEgg!,
    /** 重新导入模块，模拟内部导航或完整刷新。 */ reload: () =>
      import(
        `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
      ),
    /** @param {number} value 可控时钟。 */ setNow: (value: number) => {
      now = value;
    },
    /** @param {"navigate" | "reload"} value 下一次导航类型。 */ setNavigationType:
      (value: "navigate" | "reload") => {
        navigationType = value;
      },
    /** @param {number} delay 计时器延迟。 @return {object|undefined} 仍未取消的计时器。 */ pendingTimer:
      (delay: number) =>
        [...timers.values()].find((timer) =>
          timer.delay === delay && !timer.cleared && !timer.fired
        ),
    /**
     * 按注册顺序在 document 上派发一次事件，用于模拟真实用户手势。
     *
     * @param {string} name 事件名。
     * @return {number} 已派发的监听器数量。
     */
    dispatchDocument: (name: string) => {
      const listeners = [...(documentListeners.get(name) ?? [])];
      listeners.forEach((listener) => listener(new Event(name)));
      return listeners.length;
    },
    /** @return {number} 触发当前所有待执行的 16ms 回调（Advent 帧与音乐渐变步进共用该延迟）。 */
    fireFrames: () => {
      const pending = [...timers.values()].filter((timer) =>
        timer.delay === 16 && !timer.cleared && !timer.fired
      );
      pending.forEach((timer) => timer.callback());
      return pending.length;
    },
    /** @return {AudioMock|undefined} 最近创建的 Trumpet 曲目。 */ lastTrumpet:
      () =>
        [...AudioMock.items].reverse().find((audio) =>
          audio.src.includes("Resources/sounds/bgm/emergency")
        ),
    /** @return {Element[]} 本次测试中按创建顺序记录的全部 DOM 节点。 */
    createdElements: () => createdElements,
    /** @return {Element|undefined} 最近一次挂载且仍可见的 Alert overlay。 */
    overlay: () =>
      [...body.children].reverse().find((element) =>
        !element.removed && element.className === "lobotomy-corp-alert-overlay"
      ),
    /** @param {Element} overlay Alert overlay。 @return {string} Trumpet 文本。 */
    trumpet: (overlay: Element) =>
      overlay.children[0].children[0].children[2].children[0].children[1]
        .children[0].textContent,
    /** @param {Element} overlay Alert overlay。 @return {boolean} 当前是否显示四角警报框。 */
    hasHud: (overlay: Element) =>
      overlay.children[0]?.className === "lobotomy-corp-emergency-controller",
    /** @param {Element} overlay Alert overlay。 @return {Element} 顶部 Restart Day 面板。 */
    panel: (overlay: Element) =>
      overlay.children.find((child) =>
        child.className === "lobotomy-corp-top-panel"
      )!,
    /** @param {Element} overlay Alert overlay。 @return {string|undefined} EmergencyImage 文件名。 */
    riskFile: (overlay: Element) =>
      overlay.children[0].children[0].children[0].children[0].children[1]
        .children[0].src.split("/").at(-1),
    /** 移除测试期间安装的全部浏览器替身。 */ restore: () => {
      Date.now = originalDateNow;
      for (const [name, descriptor] of Object.entries(original)) {
        if (descriptor) Object.defineProperty(browser, name, descriptor);
        else delete (browser as Record<string, unknown>)[name];
      }
      delete browser.lobotomyCorpEasterEgg;
    },
  };
}

Deno.test("Lobotomy Corporation locale data is injected from game JSON with fallbacks", () => {
  const simplifiedChinese = renderedLobotomyCorpLocale("zh-CN");
  assertEquals(simplifiedChinese.restartDay, "重新开始这一天");
  assertEquals(simplifiedChinese.firedManager, "你被解雇了，主管！");
  assertEquals(
    simplifiedChinese["whiteNight.blockNavigation.denyPresence"],
    "休得否认我的存在，我就在你的眼前。",
  );
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

Deno.test("Lobotomy Corporation injects every maintained Confession alias", () => {
  const aliases = renderedLobotomyCorpConfessionAliases();
  assertEquals(aliases.length, 8);
  ["Confess", "Confesarse", "懺悔", "고해", "Исповедь", "Xoa dịu", "赎罪"]
    .forEach(
      (alias) => assertEquals(aliases.includes(alias), true),
    );
});

Deno.test("WhiteNight only injects the selected locale text", () => {
  const html = renderLayout({
    body: "",
    csrfToken: "test",
    darkMode: false,
    locale: "zh-CN",
    themeColor: "#000000",
    title: "test",
  });
  assertEquals(
    html.includes("lobotomy-corp-white-night-presentation-data"),
    false,
  );
  assertEquals(
    renderedLobotomyCorpLocale("zh-CN")["whiteNight.blockTime"],
    "切莫相信时间，我将为你指明道路。",
  );
});

Deno.test("Lobotomy Corporation abnormality data is safely injected from its source of truth", () => {
  const abnormalities = renderedLobotomyCorpAbnormalities();
  assertEquals(
    "dangerOnBreachOverride" in (abnormalities["T-03-46"] as object),
    false,
  );
  assertEquals(
    (abnormalities["D-01-106"] as { riskLevel: string }).riskLevel,
    "ZAYIN",
  );
  ["D-01-105", "F-02-70", "O-02-63", "T-06-27"].forEach((id) =>
    assertEquals(
      (abnormalities[id] as { canBreach: boolean }).canBreach,
      false,
    )
  );
  assertEquals(
    (abnormalities["O-04-08"] as { canBreach: boolean }).canBreach,
    true,
  );
  assertEquals(
    (abnormalities["O-04-08"] as { riskLevel: string }).riskLevel,
    "HE",
  );
  assertEquals(
    (abnormalities["Bald-is-awesome!"] as { aliases: string[] }).aliases
      .includes("秃头-真是-太棒啦！"),
    true,
  );
});

Deno.test("Lobotomy Corporation injects the saved display name for nav identity derivation", () => {
  const html = renderLayout({
    account: { displayName: "T-03-46", username: "manager" },
    body: "",
    csrfToken: "test",
    darkMode: false,
    locale: "zh-CN",
    themeColor: "#000000",
    title: "test",
  });
  assertEquals(
    html.includes(
      'id="lobotomy-corp-account-identity-data">{"displayName":"T-03-46"}',
    ),
    true,
  );
  assertEquals(
    html.includes('data-lobotomy-corp-risk-host="nav"'),
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

Deno.test("Lobotomy Corporation CanvasScaler keeps portrait HUDs legible", async () => {
  const browser = globalThis as typeof globalThis & {
    document?: unknown;
    lobotomyCorpEasterEgg?: {
      canvasScaleForViewport: (width: number, height: number) => number;
      canvasViewportForUpdate: (
        previous: { height: number; width: number } | undefined,
        next: { height: number; width: number },
      ) => { height: number; width: number };
    };
  };
  const original = Object.fromEntries(
    ["document", "lobotomyCorpEasterEgg"].map((
      name,
    ) => [name, Object.getOwnPropertyDescriptor(browser, name)]),
  );
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
      documentElement: { lang: "zh-CN" },
      getElementById: (id: string) =>
        id === "lobotomy-corp-locale-data"
          ? { textContent: localeData }
          : id === "lobotomy-corp-abnormalities-data"
          ? { textContent: abnormalitiesData }
          : null,
    },
  });
  try {
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    const scale = browser.lobotomyCorpEasterEgg!.canvasScaleForViewport;
    assertEquals(scale(1920, 1080), 1);
    assertEquals(scale(1280, 720), 1280 / 1920);
    assertEquals(scale(844, 390), 844 / 1920);

    const scalesNearFormerBreakpoint = [767, 768, 769, 770].map((width) =>
      scale(width, 1024)
    );
    scalesNearFormerBreakpoint.slice(1).forEach((current, index) =>
      assertEquals(
        Math.abs(current - scalesNearFormerBreakpoint[index]) < 0.003,
        true,
      )
    );

    const portrait390 = scale(390, 844);
    const portrait430 = scale(430, 932);
    assertEquals(Number.isFinite(portrait390) && portrait390 > 0, true);
    assertEquals(Number.isFinite(portrait430) && portrait430 > 0, true);
    assertEquals(portrait390 > 390 / 1920, true);
    assertEquals(portrait430 > 430 / 1920, true);
    // CSS 保留 Unity 原版的 0.5 倍根缩放；此处锁定最终视觉量级，防止退化回约 10%。
    assertEquals(Math.abs(portrait390 * 0.5 - 0.199) < 0.01, true);
    assertEquals(Math.abs(portrait430 * 0.5 - 0.22) < 0.01, true);

    const portraitViewport = { height: 844, width: 390 };
    const browserChromeViewport = browser.lobotomyCorpEasterEgg!
      .canvasViewportForUpdate(
        portraitViewport,
        { height: 760, width: 390 },
      );
    assertEquals(browserChromeViewport, portraitViewport);
    assertEquals(
      scale(browserChromeViewport.width, browserChromeViewport.height),
      portrait390,
    );
    const landscapeViewport = browser.lobotomyCorpEasterEgg!
      .canvasViewportForUpdate(browserChromeViewport, {
        height: 390,
        width: 844,
      });
    assertEquals(landscapeViewport, { height: 390, width: 844 });
    assertEquals(
      scale(landscapeViewport.width, landscapeViewport.height),
      844 / 1920,
    );
  } finally {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
    delete browser.lobotomyCorpEasterEgg;
  }
});

Deno.test("settings transaction disposes failed prepared media and commits only confirmed abnormality saves", async () => {
  class Element {
    attributes: Record<string, string> = {};
    children: Element[] = [];
    classList = { add: () => {}, remove: () => {} };
    dataset: Record<string, string> = {};
    disabled = false;
    hidden = false;
    offsetWidth = 1;
    src = "";
    style: Record<string, unknown> = {};
    textContent = "";
    #events = new Map<string, ((event: Event) => void)[]>();
    /** 创建可记录 HUD 生命周期的模拟节点。 */
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
    /** @param {string} name 属性名。 */ removeAttribute(name: string): void {
      delete this.attributes[name];
      if (name === "src") this.src = "";
    }
    /** 标记节点已从当前视觉树中移除。 */ remove(): void {}
    /** 触发指定事件。 @param {string} name 事件名。 */ dispatch(
      name: string,
    ): void {
      this.#events.get(name)?.forEach((listener) => listener(new Event(name)));
    }
  }
  class AudioMock extends Element {
    static items: AudioMock[] = [];
    currentTime = 0;
    duration = Number.NaN;
    muted = false;
    pauseCount = 0;
    playCount = 0;
    preload = "";
    readyState = 0;
    /** @param {string} source 音频地址。 */ constructor(source: string) {
      super();
      this.src = source;
      AudioMock.items.push(this);
    }
    /** @return {Promise<void>} 播放结果。 */ play(): Promise<void> {
      this.playCount++;
      return Promise.resolve();
    }
    /** 暂停预备或正式音频。 */ pause(): void {
      this.pauseCount++;
    }
    /** 释放已移除音源的解码资源。 */ load(): void {}
  }
  class StorageMock {
    values = new Map<string, string>();
    /** @param {string} key 键。 @return {string|null} 值。 */ getItem(
      key: string,
    ): string | null {
      return this.values.get(key) ?? null;
    }
    /** @param {string} key 键。 @param {string} value 值。 */ setItem(
      key: string,
      value: string,
    ): void {
      this.values.set(key, value);
    }
    /** @param {string} key 键。 */ removeItem(key: string): void {
      this.values.delete(key);
    }
  }
  const browser = globalThis as typeof globalThis & {
    Audio?: unknown;
    FormData?: unknown;
    HTMLInputElement?: unknown;
    document?: unknown;
    fetch?: unknown;
    localStorage?: unknown;
    location?: unknown;
    performance?: unknown;
    sessionStorage?: unknown;
    lobotomyCorpEasterEgg?: {
      getDangerScore: () => number;
      getSpecialEvent: () => string | undefined;
      getSpecialEventPhase: () => string | undefined;
      onAbnormalitySubmitted: (listener: (id: string) => void) => () => boolean;
      prepareDisplayName: (name: string) => {
        commit: () => Promise<boolean>;
        dispose: () => void;
      };
      restartDay: () => Promise<boolean>;
    };
  };
  const original = Object.fromEntries(
    [
      "Audio",
      "FormData",
      "HTMLInputElement",
      "document",
      "fetch",
      "localStorage",
      "location",
      "performance",
      "sessionStorage",
      "lobotomyCorpEasterEgg",
    ].map((name) => [name, Object.getOwnPropertyDescriptor(browser, name)]),
  );
  const body = new Element();
  const displayNameLabel = new Element();
  displayNameLabel.textContent = "Original display name";
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
  Object.defineProperties(browser, {
    Audio: { configurable: true, value: AudioMock },
    FormData: {
      configurable: true,
      value: class FormDataMock {
        /** @param {unknown} _form 测试表单。 */ constructor(_form: unknown) {}
      },
    },
    HTMLInputElement: {
      configurable: true,
      value: class HTMLInputElementMock {},
    },
    document: {
      configurable: true,
      value: {
        addEventListener: () => {},
        body,
        createElement: () => new Element(),
        documentElement: { lang: "zh-CN" },
        getElementById: (id: string) =>
          id === "lobotomy-corp-locale-data"
            ? { textContent: localeData }
            : id === "lobotomy-corp-abnormalities-data"
            ? { textContent: abnormalitiesData }
            : null,
        querySelector: (selector: string) =>
          selector === "[data-polling-interval-value]"
            ? { value: "1" }
            : selector === "[data-account-display-name-label]"
            ? displayNameLabel
            : null,
        querySelectorAll: () => [],
      },
    },
    localStorage: { configurable: true, value: storage },
    location: { configurable: true, value: { href: "https://warmnest.test/" } },
    performance: {
      configurable: true,
      value: { getEntriesByType: () => [{ type: "navigate" }] },
    },
    sessionStorage: { configurable: true, value: storage },
  });
  const settingsClient = Deno.readTextFileSync(
    new URL("../static/settings.js", import.meta.url),
  );
  type SaveTransaction = (
    easterEgg: {
      activate: (value: string) => Promise<boolean>;
      commitDisplayName?: (value: string) => Promise<boolean>;
    },
    form: { action: string; method: string },
    mode: "displayName" | "username",
    displayName: string,
  ) => Promise<{ responseUrl: URL; saved: boolean }>;
  try {
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    const transaction = new Function(
      `${settingsClient}\nreturn submitLobotomyCorpAccountSaveTransaction;`,
    )() as SaveTransaction;
    const api = browser.lobotomyCorpEasterEgg!;
    const observedCanonicalIds: string[] = [];
    api.onAbnormalitySubmitted((id) => observedCanonicalIds.push(id));
    const form = { action: "https://warmnest.test/settings", method: "post" };

    /**
     * 判断模拟 DOM 子树中是否存在指定媒体。
     *
     * @param {Element} node 当前节点。
     * @param {string} suffix 媒体路径结尾。
     * @return {boolean} 找到媒体时返回 true。
     */
    const hasMedia = (node: Element, suffix: string): boolean =>
      node.src.endsWith(suffix) ||
      node.children.some((child) => hasMedia(child, suffix));

    Object.defineProperty(browser, "fetch", {
      configurable: true,
      value: () =>
        Promise.resolve({
          ok: false,
          url: "https://warmnest.test/settings?account=invalid",
        }),
    });
    const rejected = await transaction(
      api as never,
      form,
      "displayName",
      "T-03-46",
    );
    await Promise.resolve();
    const rejectedAudio = AudioMock.items[0];
    assertEquals(rejected.saved, false);
    assertEquals(observedCanonicalIds, []);
    assertEquals(api.getDangerScore(), 0);
    assertEquals(api.getSpecialEvent(), undefined);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-day"), null);
    assertEquals(body.children.length, 0);
    assertEquals(rejectedAudio.muted, true);
    assertEquals(rejectedAudio.playCount, 1);
    assertEquals(rejectedAudio.pauseCount >= 1, true);
    assertEquals(rejectedAudio.src, "");

    Object.defineProperty(browser, "fetch", {
      configurable: true,
      value: () => Promise.reject(new Error("network failed")),
    });
    await assertRejects(
      () => transaction(api as never, form, "displayName", "T-03-46"),
      "network failed",
    );
    assertEquals(
      AudioMock.items.filter((audio) => audio.src === "").length >= 2,
      true,
    );
    assertEquals(api.getDangerScore(), 0);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-day"), null);
    assertEquals(body.children.length, 0);

    Object.defineProperty(browser, "fetch", {
      configurable: true,
      value: () =>
        Promise.resolve({
          ok: true,
          url: "https://warmnest.test/settings?account=updated",
        }),
    });
    const confirmed = await transaction(
      api as never,
      form,
      "displayName",
      "T-03-46",
    );
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(confirmed.saved, true);
    assertEquals(observedCanonicalIds, ["T-03-46"]);
    assertEquals(api.getDangerScore(), 44);
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-day")?.includes("T-03-46"),
      true,
    );
    assertEquals(body.children.length > 0, true);
    assertEquals(api.getSpecialEvent(), "white-night");
    assertEquals(api.getSpecialEventPhase(), "prelude");
    const preparedChurch = AudioMock.items.find((audio) =>
      audio.src.endsWith("Lucifer_standbg0.ogg")
    )!;
    assertEquals(preparedChurch.muted, true);
    assertEquals(preparedChurch.playCount, 1);
    assertEquals(hasMedia(body, "WhiteNight_Confess_Dead.webm"), false);
    const savedIdentityLabel = displayNameLabel.textContent;

    const restarting = api.restartDay();
    body.children.at(-1)?.children[1]?.children[0]?.dispatch("animationend");
    await restarting;
    assertEquals(api.getDangerScore(), 0);
    assertEquals(api.getSpecialEvent(), undefined);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-day"), null);
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-special-event"),
      null,
    );
    assertEquals(displayNameLabel.textContent, savedIdentityLabel);
  } finally {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
    delete browser.lobotomyCorpEasterEgg;
  }
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

Deno.test("Lobotomy Corporation derives every risk host from server-rendered identity", async () => {
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
  const navAvatarWrapper = new Element();
  const navAvatar = new Element();
  navAvatarWrapper.append(navAvatar);
  const settingsAvatarWrapper = new Element();
  const settingsAvatar = new Element();
  settingsAvatarWrapper.append(settingsAvatar);
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
          : id === "lobotomy-corp-account-identity-data"
          ? { textContent: JSON.stringify({ displayName: "T-03-46" }) }
          : null,
      querySelector: (selector: string) =>
        selector === "[data-account-display-name-label]" ? label : undefined,
      querySelectorAll: (selector: string) =>
        selector === "[data-lobotomy-corp-risk-host]"
          ? [navAvatarWrapper, settingsAvatarWrapper]
          : [],
    },
  });
  try {
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    assertEquals(label.textContent, "白夜");
    assertEquals(navAvatar.children.length, 0);
    assertEquals(settingsAvatar.children.length, 0);
    assertEquals(
      navAvatarWrapper.children[1].src.endsWith("Risk_Aleph.png"),
      true,
    );
    assertEquals(
      settingsAvatarWrapper.children[1].src.endsWith("Risk_Aleph.png"),
      true,
    );
    await browser.lobotomyCorpEasterEgg!.commitDisplayName("Bald-is-awesome!");
    assertEquals(label.textContent, "你是个秃子...");
    assertEquals(
      navAvatarWrapper.querySelector(".lobotomy-corp-risk-badge")?.src.endsWith(
        "Risk_Zayin.png",
      ),
      true,
    );
    assertEquals(
      settingsAvatarWrapper.querySelector(".lobotomy-corp-risk-badge")?.src
        .endsWith(
          "Risk_Zayin.png",
        ),
      true,
    );
    assertEquals(browser.lobotomyCorpEasterEgg!.getDangerScore(), 0);
    await browser.lobotomyCorpEasterEgg!.commitDisplayName("O-03-03");
    assertEquals(
      navAvatarWrapper.querySelector(".lobotomy-corp-risk-badge") !==
        undefined,
      true,
    );
    assertEquals(
      settingsAvatarWrapper.querySelector(".lobotomy-corp-risk-badge") !==
        undefined,
      true,
    );
    assertEquals(browser.lobotomyCorpEasterEgg!.getDangerScore(), 0);
    await browser.lobotomyCorpEasterEgg!.commitDisplayName("ordinary user");
    assertEquals(label.textContent, "显示名称");
    assertEquals(
      navAvatarWrapper.querySelector(".lobotomy-corp-risk-badge"),
      undefined,
    );
    assertEquals(
      settingsAvatarWrapper.querySelector(".lobotomy-corp-risk-badge"),
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
    /** @param {...Element} nodes 替换当前子节点列表。 */ replaceChildren(
      ...nodes: Element[]
    ): void {
      this.children = [...nodes];
    }
    /** 标记节点已删除。 */ remove(): void {
      this.removed = true;
    }
    /** @param {string} name 事件名。 */ dispatch(name: string): void {
      this.#events.get(name)?.forEach((listener) => listener(new Event(name)));
    }
  }
  class AudioMock extends Element {
    static deferredPlayResolvers: (() => void)[] = [];
    static deferNextPlayCount = 0;
    static items: AudioMock[] = [];
    static nextDuration = Number.NaN;
    static nextReadyState = 0;
    static playSnapshots: {
      audio: AudioMock;
      loop: boolean;
      muted: boolean;
      src: string;
      volume: number;
    }[] = [];
    static rejectNextTrumpetPlayCount = 0;
    static rejectUnmutedAutoplay = false;
    static resetTrumpetPositionOnPlay = false;
    autoplayRejected = false;
    duration = AudioMock.nextDuration;
    currentTime = 0;
    loop = false;
    muted = false;
    pauseCount = 0;
    playCount = 0;
    preload = "";
    readyState = AudioMock.nextReadyState;
    volume = 1;
    /** @param {string} source 音频地址。 */ constructor(source: string) {
      super();
      this.src = source;
      AudioMock.items.push(this);
    }
    /** @return {Promise<void>} 播放结果。 */ play(): Promise<void> {
      this.playCount++;
      AudioMock.playSnapshots.push({
        audio: this,
        loop: this.loop,
        muted: this.muted,
        src: this.src,
        volume: this.volume,
      });
      if (
        AudioMock.resetTrumpetPositionOnPlay &&
        this.src.includes("Resources/sounds/bgm/emergency")
      ) {
        this.currentTime = 0;
      }
      if (
        this.src.includes("Resources/sounds/bgm/emergency") &&
        AudioMock.rejectNextTrumpetPlayCount > 0
      ) {
        AudioMock.rejectNextTrumpetPlayCount--;
        return Promise.reject(new Error("trumpet autoplay blocked"));
      }
      if (AudioMock.rejectUnmutedAutoplay && this.muted !== true) {
        this.autoplayRejected = true;
        return Promise.reject(new Error("unmuted autoplay blocked"));
      }
      if (AudioMock.deferNextPlayCount > 0) {
        AudioMock.deferNextPlayCount--;
        return new Promise((resolve) =>
          AudioMock.deferredPlayResolvers.push(resolve)
        );
      }
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
      commitDisplayName: (name: string) => Promise<boolean>;
      matches: (name: string) => boolean;
      matchingAbnormality: (name: string) => {
        canonicalId: string;
        abnormality: { canBreach: boolean; riskLevel: string };
      } | undefined;
      handleAbnormalitySubmitted: (name: string) => Promise<boolean>;
      getDangerMusicHighWaterLevel: () => number;
      getDangerScore: () => number;
      getSpecialEvent: () => string | undefined;
      getSpecialEventPhase: () => string | undefined;
      prepareDisplayName: (name: string) => {
        commit: () => Promise<boolean>;
      };
      restartDay: () => Promise<boolean>;
      setDangerScore: (score: number) => Promise<boolean>;
      startWhiteNight: (options: { source: string }) => boolean;
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
      "setTimeout",
      "clearTimeout",
      "Date",
    ].map((name) => [name, Object.getOwnPropertyDescriptor(browser, name)]),
  );
  const body = new Element();
  const storage = new StorageMock();
  const documentListeners = new Map<string, ((event: Event) => void)[]>();
  let navigationType = "navigate";
  const now = 0;
  let nextTimerId = 0;
  const timers = new Map<
    number,
    { callback: () => void; delay: number; cleared: boolean }
  >();
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
        addEventListener: (name: string, listener: (event: Event) => void) =>
          documentListeners.set(name, [
            ...(documentListeners.get(name) ?? []),
            listener,
          ]),
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
        removeEventListener: (name: string, listener: (event: Event) => void) =>
          documentListeners.set(
            name,
            (documentListeners.get(name) ?? []).filter((item) =>
              item !== listener
            ),
          ),
      },
    },
    innerWidth: { configurable: true, value: 1920 },
    localStorage: { configurable: true, value: storage },
    sessionStorage: { configurable: true, value: storage },
    performance: {
      configurable: true,
      value: { getEntriesByType: () => [{ type: navigationType }] },
    },
    setTimeout: {
      configurable: true,
      value: (callback: () => void, delay = 0) => {
        const id = ++nextTimerId;
        timers.set(id, { callback, cleared: false, delay });
        return id;
      },
    },
    clearTimeout: {
      configurable: true,
      value: (id: number) => {
        const timer = timers.get(id);
        if (timer) timer.cleared = true;
      },
    },
    Date: {
      configurable: true,
      value: class DateMock extends Date {
        /** @return {number} 可控的测试时钟。 */
        static override now(): number {
          return now;
        }
      },
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
    assertEquals(
      secondAudio.src.endsWith("Resources/sounds/bgm/emergency02_mast.ogg"),
      true,
    );
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
    assertEquals(
      fourthAudio.src.endsWith("Resources/sounds/bgm/emergency04_mast.wav"),
      true,
    );
    assertEquals(fourthAudio.currentTime, 0);
    assertEquals(fourthAudio.playCount, 1);
    // 视觉等级替换复用同一个会话的 Restart panel，不重播 Appear 动画。
    assertEquals(panel(fourthOverlay) === panel(initialFirstOverlay), true);
    assertEquals(fourthOverlay === downOverlay, true);
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
    assertEquals(await third, true);
    // 低等级 direct 不能改写 Fourth owner；曲目结束后才真正关闭 direct one-shot。
    fourthAudio.dispatch("ended");
    assertEquals(await fourth, true);
    // 同级 direct 不得把持续 Danger owner 偷换为 one-shot；更高 direct 只能暂时接管音乐。
    void api.setDangerScore(20);
    const equalDangerFirst = AudioMock.items.at(-1)!;
    assertEquals(
      body.children.at(-1)?.dataset.lobotomyCorpAlertSource,
      "danger",
    );
    assertEquals(
      body.children.at(-1)?.dataset.lobotomyCorpAlertMusicSource,
      "danger",
    );
    const equalDirectFirst = api.activate("first trumpet");
    assertEquals(AudioMock.items.at(-1), equalDangerFirst);
    assertEquals(await equalDirectFirst, true);
    const directSecondOverDanger = api.activate("second trumpet");
    const directSecondAudio = AudioMock.items.at(-1)!;
    // Direct 只接管音乐：2 > 1；四角 HUD 仍然跟随实时 Danger 显示 First。
    assertEquals(
      directSecondAudio.src.endsWith(
        "Resources/sounds/bgm/emergency02_mast.ogg",
      ),
      true,
    );
    assertEquals(trumpet(body.children.at(-1)!), "First\nTrumpet");
    assertEquals(
      body.children.at(-1)?.dataset.lobotomyCorpAlertSource,
      "danger",
    );
    assertEquals(
      body.children.at(-1)?.dataset.lobotomyCorpAlertMusicSource,
      "direct",
    );
    directSecondAudio.dispatch("ended");
    assertEquals(await directSecondOverDanger, true);
    // Direct one-shot 结束后恢复底层 Danger 音乐；HUD 仍是实时 Danger 的 First。
    assertEquals(trumpet(body.children.at(-1)!), "First\nTrumpet");
    assertEquals(
      body.children.at(-1)?.dataset.lobotomyCorpAlertMusicSource,
      "danger",
    );
    api.setDangerScore(100);
    const dangerOverlay = body.children.at(-1)!;
    assertEquals(trumpet(dangerOverlay), "Third\nTrumpet");
    assertEquals(risk(dangerOverlay).src.endsWith("Risk_3.png"), true);
    const dangerThirdAudio = AudioMock.items.at(-1)!;
    const dangerAudioCountBeforeDecay = AudioMock.items.length;
    // 自然衰减跨阈值：HUD 立即降级，但正在播放的曲目与 music high-water 都不变。
    api.setDangerScore(60);
    assertEquals(dangerThirdAudio.pauseCount, 0);
    assertEquals(trumpet(body.children.at(-1)!), "Second\nTrumpet");
    assertEquals(risk(body.children.at(-1)!).src.endsWith("Risk_2.png"), true);
    assertEquals(api.getDangerMusicHighWaterLevel(), 3);
    dangerThirdAudio.dispatch("ended");
    const replayTimer = [...timers.values()].find((timer) =>
      timer.delay === 5000 && !timer.cleared
    );
    assertEquals(replayTimer !== undefined, true);
    replayTimer?.callback();
    // replay gap 结束后继续 music high-water 的 Third，而 HUD 仍按 Danger=60 显示 Second。
    assertEquals(trumpet(body.children.at(-1)!), "Second\nTrumpet");
    assertEquals(AudioMock.items.length, dangerAudioCountBeforeDecay);
    assertEquals(AudioMock.items.at(-1), dangerThirdAudio);
    assertEquals(dangerThirdAudio.currentTime, 0);
    api.setDangerScore(9);
    assertEquals(api.getDangerMusicHighWaterLevel(), 0);
    const stop = api.setDangerScore(0);
    assertEquals(await stop, true);
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
    const audioCountBeforeWhiteNight = AudioMock.items.length;
    void api.handleAbnormalitySubmitted("T-03-46");
    assertEquals(api.getDangerScore(), 44);
    assertEquals(api.getSpecialEvent(), "white-night");
    const whiteNightPreludeAudio = AudioMock.items[audioCountBeforeWhiteNight];
    // Simple Advent 期间 Alert 全程正常运行：第一阶段 Trumpet 保持正常音量，
    // 四角警报框的 pulse 持续运行，不存在 WhiteNight 专用的 Pause 状态。
    assertEquals(whiteNightPreludeAudio.pauseCount, 0);
    assertEquals(whiteNightPreludeAudio.volume, 1);
    assertEquals(
      whiteNightPreludeAudio.src.endsWith(
        "Resources/sounds/bgm/emergency01_mast.ogg",
      ),
      true,
    );
    const whiteNightRestartOnlyOverlay = [...body.children].reverse().find(
      (element) =>
        !element.removed &&
        element.className === "lobotomy-corp-alert-overlay",
    )!;
    assertEquals(whiteNightRestartOnlyOverlay.children.length, 3);
    assertEquals(
      whiteNightRestartOnlyOverlay.children[0].dataset
        .lobotomyCorpIngameEffectPaused,
      undefined,
    );
    const whiteNightDay = storage.getItem("warmnest.lobotomy-corp-day") ?? "";
    assertEquals(whiteNightDay.includes('"departmentCount"'), false);
    assertEquals(whiteNightDay.includes('"decayPausedRemainingMs"'), false);
    assertEquals(whiteNightDay.includes('"decayGraceDeadline"'), true);
    const whiteNightRestart = api.restartDay();
    whiteNightRestartOnlyOverlay.children[1]?.children[0]?.dispatch(
      "animationend",
    );
    await whiteNightRestart;
    assertEquals(api.getSpecialEvent(), undefined);
    assertEquals(api.getDangerScore(), 0);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-day"), null);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-alert"), null);
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-special-event"),
      null,
    );
    assertEquals(
      body.children.some((element) =>
        !element.removed &&
        element.className.startsWith("lobotomy-corp-white-night")
      ),
      false,
    );

    // 保持普通 Trumpet 的既有媒体高水位回归覆盖。
    const secondWhiteNightRestart = api.restartDay();
    [...body.children].reverse().find((element) =>
      !element.removed && element.className === "lobotomy-corp-alert-overlay"
    )?.children[1]?.children[0].dispatch("animationend");
    await secondWhiteNightRestart;

    // 延迟预热 Promise 必须不能在 Second 已接管音频后反向暂停它。
    void api.setDangerScore(45);
    AudioMock.deferNextPlayCount = 1;
    AudioMock.nextDuration = 0.1;
    AudioMock.nextReadyState = 1;
    const preparedSecond = api.prepareDisplayName("O-06-20");
    assertEquals((AudioMock.items.at(-1)! as { muted?: boolean }).muted, true);
    AudioMock.nextDuration = Number.NaN;
    AudioMock.nextReadyState = 0;
    const secondPreparedAudio = AudioMock.items.at(-1)!;
    void preparedSecond.commit();
    secondPreparedAudio.currentTime = 7;
    AudioMock.deferredPlayResolvers.splice(0).forEach((resolve) => resolve());
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(
      secondPreparedAudio.src.endsWith(
        "Resources/sounds/bgm/emergency02_mast.ogg",
      ),
      true,
    );
    assertEquals(secondPreparedAudio.pauseCount, 0);
    assertEquals(secondPreparedAudio.currentTime, 7);
    assertEquals(secondPreparedAudio.playCount, 2);
    assertEquals((secondPreparedAudio as { muted?: boolean }).muted, false);

    // 同级提交不会替换 BGM，未消费的预备音频必须被释放。
    const redundantSecond = api.prepareDisplayName("second trumpet");
    const redundantSecondAudio = AudioMock.items.at(-1)!;
    void redundantSecond.commit();
    assertEquals(redundantSecondAudio.pauseCount, 1);
    assertEquals(secondPreparedAudio.pauseCount, 0);

    // Third 降级至 Second 时维持 Third 的音乐，并释放未消费的 Second。
    const preparedThird = api.prepareDisplayName("third trumpet");
    const thirdPreparedAudio = AudioMock.items.at(-1)!;
    void preparedThird.commit();
    const lowerSecond = api.prepareDisplayName("second trumpet");
    const lowerSecondAudio = AudioMock.items.at(-1)!;
    void lowerSecond.commit();
    assertEquals(
      thirdPreparedAudio.src.endsWith(
        "Resources/sounds/bgm/emergency03_mast.ogg",
      ),
      true,
    );
    assertEquals(thirdPreparedAudio.pauseCount, 0);
    assertEquals(lowerSecondAudio.pauseCount, 1);

    // Restart Day 终止整场 Day：白夜的 ducked Trumpet 必须停止，不能触发淡入。
    const resetBeforeRestartCheck = api.restartDay();
    [...body.children].reverse().find((element) =>
      !element.removed && element.className === "lobotomy-corp-alert-overlay"
    )?.children[1]?.children[0].dispatch("animationend");
    await resetBeforeRestartCheck;
    void api.setDangerScore(45);
    await Promise.resolve();
    assertEquals(
      api.startWhiteNight({ source: "plague-doctor-transformation" }),
      true,
    );
    const restartSuppressedTrumpet = AudioMock.items.findLast((audio) =>
      audio.src.includes("Resources/sounds/bgm/emergency")
    )!;
    const restartSuppressedPauseCount = restartSuppressedTrumpet.pauseCount;
    // WhiteNight active 的 held 音量是可调参数：只要求它是 (0, 1) 之间的背景音量。
    const restartHeldVolume = restartSuppressedTrumpet.volume;
    assertEquals(restartHeldVolume > 0 && restartHeldVolume < 1, true);
    restartSuppressedTrumpet.currentTime = 22;
    const restartDuringWhiteNight = api.restartDay();
    [...body.children].reverse().find((element) =>
      !element.removed && element.className === "lobotomy-corp-alert-overlay"
    )?.children[1]?.children[0].dispatch("animationend");
    await restartDuringWhiteNight;
    assertEquals(api.getSpecialEvent(), undefined);
    assertEquals(
      restartSuppressedTrumpet.pauseCount,
      restartSuppressedPauseCount + 1,
    );
    assertEquals(
      (restartSuppressedTrumpet as { volume?: number }).volume,
      restartHeldVolume,
    );
    assertEquals(storage.getItem("warmnest.lobotomy-corp-alert"), null);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-day"), null);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-special-event"), null);

    // 完整刷新已知仍在白夜时，Trumpet 以 ducked hold 恢复：loop 后台推进、
    // 不主动静音；若 autoplay policy 拒绝，则首次交互只补齐播放而不重建或暂停媒体会话。
    storage.setItem(
      "warmnest.lobotomy-corp-alert",
      JSON.stringify({
        musicAssetDirectory: "third-trumpet",
        position: 112,
        startedAt: 0,
        visualAssetDirectory: "third-trumpet",
      }),
    );
    storage.setItem(
      "warmnest.lobotomy-corp-day",
      JSON.stringify({
        countedAbnormalityIds: ["T-03-46"],
        dangerScore: 85,
      }),
    );
    storage.setItem(
      "warmnest.lobotomy-corp-special-event",
      JSON.stringify({
        churchPosition: 26.5,
        id: "white-night",
        lockLocation: "/settings",
        phase: "active",
        source: "direct-submission",
      }),
    );
    navigationType = "reload";
    AudioMock.nextDuration = 50;
    AudioMock.nextReadyState = 1;
    // Alert 初始化与 WhiteNight.restore() 都可能在真实交互前尝试播放；两次均拒绝，
    // 以验证 pending 位置不会被临时 0 污染，随后由首次交互完成第三次重试。
    AudioMock.rejectNextTrumpetPlayCount = 2;
    AudioMock.rejectUnmutedAutoplay = true;
    AudioMock.resetTrumpetPositionOnPlay = true;
    const reloadAudioStart = AudioMock.items.length;
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    const reloadedApi = browser.lobotomyCorpEasterEgg!;
    const reloadedTrumpet = AudioMock.items.slice(reloadAudioStart).find(
      (audio) =>
        audio.src.endsWith("Resources/sounds/bgm/emergency03_mast.ogg"),
    )!;
    assertEquals(reloadedTrumpet.loop, true);
    assertEquals(reloadedTrumpet.muted, false);
    const reloadedHeldVolume = reloadedTrumpet.volume;
    assertEquals(reloadedHeldVolume > 0 && reloadedHeldVolume < 1, true);
    assertEquals(reloadedTrumpet.autoplayRejected, false);
    assertEquals(reloadedTrumpet.playCount, 2);
    // 首次被拒绝且 Chromium 把 seek 重置为 0 时，持久化仍必须保留循环内的 12 秒位置。
    assertEquals(reloadedTrumpet.currentTime, 0);
    assertEquals(
      JSON.parse(storage.getItem("warmnest.lobotomy-corp-alert") ?? "{}")
        .position,
      12,
    );
    AudioMock.rejectUnmutedAutoplay = false;
    const reloadedTrumpetPlayCountBeforeInteraction = reloadedTrumpet.playCount;
    documentListeners.get("pointerdown")?.forEach((listener) =>
      listener(new Event("pointerdown"))
    );
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(AudioMock.items.includes(reloadedTrumpet), true);
    assertEquals(reloadedTrumpet.currentTime, 12);
    assertEquals(reloadedTrumpet.pauseCount, 0);
    assertEquals(reloadedTrumpet.muted, false);
    // 首次交互只恢复播放权限，不得改写当前 held 音量。
    assertEquals(reloadedTrumpet.volume, reloadedHeldVolume);
    assertEquals(
      reloadedTrumpet.playCount,
      reloadedTrumpetPlayCountBeforeInteraction + 1,
    );
    reloadedTrumpet.currentTime = 37;
    reloadedTrumpet.dispatch("timeupdate");
    assertEquals(
      JSON.parse(storage.getItem("warmnest.lobotomy-corp-alert") ?? "{}")
        .position,
      37,
    );
    const reloadedRestart = reloadedApi.restartDay();
    [...body.children].reverse().find((element) =>
      !element.removed && element.className === "lobotomy-corp-alert-overlay"
    )?.children[1]?.children[0].dispatch("animationend");
    await reloadedRestart;
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
      getSpecialEvent: () => string | undefined;
      handleAbnormalitySubmitted: (name: string) => Promise<boolean>;
      matchingAbnormality: (
        name: string,
      ) => { canonicalId: string } | undefined;
      prepareDisplayName: (name: string) => {
        commit: () => Promise<boolean>;
        dispose: () => void;
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
    /** 测试音频不触发自然事件。 */ addEventListener(): void {}
    /** 测试音频不触发自然事件。 */ removeEventListener(): void {}
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
    const cancelledTrumpet = api.prepareDisplayName("third trumpet");
    cancelledTrumpet.dispose();
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

    await api.handleAbnormalitySubmitted("T-03-46");
    assertEquals(api.getSpecialEvent(), "white-night");
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-special-event") !== null,
      true,
    );
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-day")?.includes(
        '"decayPausedRemainingMs"',
      ),
      false,
    );
    const reloadAudioStart = AudioMock.items.length;
    navigationType = "reload";
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    api = browser.lobotomyCorpEasterEgg!;
    assertEquals(api.getSpecialEvent(), "white-night");
    assertEquals(api.getDangerScore(), 44);
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-day")?.includes(
        '"decayPausedRemainingMs"',
      ),
      false,
    );
    assertEquals(
      AudioMock.items.slice(reloadAudioStart).some((audio) =>
        audio.src.endsWith("Lucifer_standbg0.ogg")
      ),
      false,
    );
    const whiteNightAudioStart = reloadAudioStart;
    coordinatorStop?.();
    assertEquals(api.getSpecialEvent(), undefined);
    assertEquals(api.getDangerScore(), 0);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-day"), null);
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-special-event"),
      null,
    );
    assertEquals(
      AudioMock.items.slice(whiteNightAudioStart).every((audio) =>
        audio.pauseCount > 0
      ),
      true,
    );

    navigationType = "navigate";
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

Deno.test("Lobotomy Corporation snapshots polling-value departments for a Day", async () => {
  class StorageMock {
    values = new Map<string, string>();
    /** @param {string} key 键。 @return {string|null} 值。 */ getItem(
      key: string,
    ): string | null {
      return this.values.get(key) ?? null;
    }
    /** @param {string} key 键。 @param {string} value 值。 */ setItem(
      key: string,
      value: string,
    ): void {
      this.values.set(key, value);
    }
    /** @param {string} key 键。 */ removeItem(key: string): void {
      this.values.delete(key);
    }
  }
  const browser = globalThis as typeof globalThis & {
    document?: unknown;
    localStorage?: unknown;
    performance?: unknown;
    sessionStorage?: unknown;
    lobotomyCorpEasterEgg?: {
      getDangerScore: () => number;
      handleAbnormalitySubmitted: (value: string) => Promise<boolean>;
      restartDay: () => Promise<boolean>;
    };
  };
  const original = Object.fromEntries(
    ["document", "localStorage", "performance", "sessionStorage"].map((
      name,
    ) => [name, Object.getOwnPropertyDescriptor(browser, name)]),
  );
  const storage = new StorageMock();
  const pollingValue = { value: "5" };
  const localeData = Deno.readTextFileSync(
    new URL("../static/fun/lobotomy-corp/Locales/zh-CN.json", import.meta.url),
  );
  const abnormalitiesData = Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/Data/Abnormalities.json",
      import.meta.url,
    ),
  );
  Object.defineProperties(browser, {
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
        querySelector: (selector: string) =>
          selector === "[data-polling-interval-value]"
            ? pollingValue
            : undefined,
      },
    },
    localStorage: { configurable: true, value: storage },
    performance: {
      configurable: true,
      value: { getEntriesByType: () => [{ type: "navigate" }] },
    },
    sessionStorage: { configurable: true, value: storage },
  });
  try {
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    let api = browser.lobotomyCorpEasterEgg!;
    await api.handleAbnormalitySubmitted("D-01-106");
    await api.handleAbnormalitySubmitted("T-01-54");
    assertEquals(api.getDangerScore(), 5);
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-day")?.includes(
        '"departmentCount":5',
      ),
      true,
    );
    pollingValue.value = "1";
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    api = browser.lobotomyCorpEasterEgg!;
    await api.handleAbnormalitySubmitted("F-01-02");
    assertEquals(api.getDangerScore(), 9);
    await api.restartDay();
    await api.handleAbnormalitySubmitted("D-01-106");
    assertEquals(api.getDangerScore(), 5);
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-day")?.includes(
        '"departmentCount":1',
      ),
      true,
    );
  } finally {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
    delete browser.lobotomyCorpEasterEgg;
  }
});

Deno.test("WhiteNight freezes and resumes the exact remaining Danger decay time", async () => {
  class StorageMock {
    values = new Map<string, string>();
    /** @param {string} key 键。 @return {string|null} 值。 */
    getItem(key: string): string | null {
      return this.values.get(key) ?? null;
    }
    /** @param {string} key 键。 @param {string} value 值。 */
    setItem(key: string, value: string): void {
      this.values.set(key, value);
    }
    /** @param {string} key 键。 */
    removeItem(key: string): void {
      this.values.delete(key);
    }
  }
  const browser = globalThis as typeof globalThis & {
    document?: unknown;
    localStorage?: unknown;
    location?: unknown;
    performance?: unknown;
    sessionStorage?: unknown;
    lobotomyCorpEasterEgg?: {
      commitDisplayName: (value: string) => Promise<boolean>;
      getSpecialEvent: () => string | undefined;
      handleAbnormalitySubmitted: (value: string) => Promise<boolean>;
      restartDay: () => Promise<boolean>;
      startWhiteNight: (options: { source: string }) => boolean;
    };
  };
  const original = Object.fromEntries(
    [
      "Audio",
      "document",
      "localStorage",
      "location",
      "performance",
      "sessionStorage",
      "setTimeout",
      "clearTimeout",
    ].map((name) => [name, Object.getOwnPropertyDescriptor(browser, name)]),
  );
  const storage = new StorageMock();
  const localeData = Deno.readTextFileSync(
    new URL("../static/fun/lobotomy-corp/Locales/en-US.json", import.meta.url),
  );
  const abnormalitiesData = Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/Data/Abnormalities.json",
      import.meta.url,
    ),
  );
  let now = 1000;
  let nextTimerId = 0;
  const timers = new Map<
    number,
    { callback: () => void; delay: number; cleared: boolean }
  >();
  try {
    Object.defineProperties(browser, {
      Audio: { configurable: true, value: undefined },
      document: {
        configurable: true,
        value: {
          documentElement: { lang: "en-US" },
          getElementById: (id: string) =>
            id === "lobotomy-corp-locale-data"
              ? { textContent: localeData }
              : id === "lobotomy-corp-abnormalities-data"
              ? { textContent: abnormalitiesData }
              : null,
          querySelector: (selector: string) =>
            selector === "[data-polling-interval-value]"
              ? { value: "1" }
              : undefined,
        },
      },
      localStorage: { configurable: true, value: storage },
      location: {
        configurable: true,
        value: {
          href: "https://warmnest.test/settings",
          pathname: "/settings",
          search: "",
        },
      },
      performance: {
        configurable: true,
        value: { getEntriesByType: () => [{ type: "navigate" }] },
      },
      sessionStorage: { configurable: true, value: storage },
      setTimeout: {
        configurable: true,
        value: (callback: () => void, delay = 0) => {
          const id = ++nextTimerId;
          timers.set(id, { callback, cleared: false, delay });
          return id;
        },
      },
      clearTimeout: {
        configurable: true,
        value: (id: number) => {
          const timer = timers.get(id);
          if (timer) timer.cleared = true;
        },
      },
    });
    const originalDateNow = Date.now;
    Date.now = () => now;
    try {
      await import(
        `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
      );
      const api = browser.lobotomyCorpEasterEgg!;
      await api.handleAbnormalitySubmitted("D-01-106");
      now = 3000;
      assertEquals(
        api.startWhiteNight({ source: "plague-doctor-transformation" }),
        true,
      );
      const frozenDay = JSON.parse(
        storage.getItem("warmnest.lobotomy-corp-day") ?? "{}",
      );
      assertEquals(frozenDay.decayPausedRemainingMs, 28000);

      now = 183000;
      const confession = api.commitDisplayName("O-03-03");
      const suppression = [...timers.values()].find((timer) =>
        timer.delay === whiteNightConfessionSuppressionDelayMs &&
        !timer.cleared
      );
      if (!suppression) {
        throw new Error("Expected WhiteNight Confess suppression timer.");
      }
      suppression.callback();
      const fallback = [...timers.values()].find((timer) =>
        timer.delay === whiteNightDeathSequenceDurationMs && !timer.cleared
      );
      if (!fallback) {
        throw new Error("Expected WhiteNight death fallback timer.");
      }
      fallback.callback();
      assertEquals(await confession, true);
      assertEquals(api.getSpecialEvent(), undefined);
      const resumedDay = JSON.parse(
        storage.getItem("warmnest.lobotomy-corp-day") ?? "{}",
      );
      assertEquals(resumedDay.decayGraceDeadline, 211000);
      assertEquals("decayPausedRemainingMs" in resumedDay, false);
      assertEquals(
        [...timers.values()].some((timer) =>
          timer.delay === 28000 && !timer.cleared
        ),
        true,
      );
      await api.restartDay();
    } finally {
      Date.now = originalDateNow;
    }
  } finally {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(browser, name, descriptor);
      else delete (browser as Record<string, unknown>)[name];
    }
    delete browser.lobotomyCorpEasterEgg;
  }
});

Deno.test("Lobotomy Corporation keeps the Danger HUD real-time while the music keeps its high-water", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();

    // Danger=90：HUD 与音乐同时进入 Third，music high-water = 3。
    void api.setDangerScore(90);
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
    assertEquals(harness.riskFile(harness.overlay()!), "Risk_3.png");
    assertEquals(api.getDangerMusicHighWaterLevel(), 3);
    const initialOverlay = harness.overlay()!;
    const initialPanel = harness.panel(initialOverlay);
    const thirdAudio = harness.lastTrumpet()!;
    assertEquals(
      thirdAudio.src.endsWith("Resources/sounds/bgm/emergency03_mast.ogg"),
      true,
    );
    thirdAudio.currentTime = 12.3;
    const firstEmergencyAudioCount = harness.AudioMock.items.length;

    // Danger 自然衰减：HUD 立即逐级降级，正在播放的 Third 与 music high-water 都不动。
    for (
      const [score, text, risk] of [
        [79, "Second\nTrumpet", "Risk_2.png"],
        [49, "First\nTrumpet", "Risk_1.png"],
        [20, "First\nTrumpet", "Risk_1.png"],
        [10, "First\nTrumpet", "Risk_1.png"],
      ] as [number, string, string][]
    ) {
      void api.setDangerScore(score);
      assertEquals(harness.trumpet(harness.overlay()!), text);
      assertEquals(harness.riskFile(harness.overlay()!), risk);
      assertEquals(api.getDangerMusicHighWaterLevel(), 3);
      assertEquals(thirdAudio.pauseCount, 0);
      assertEquals(thirdAudio.currentTime, 12.3);
      assertEquals(harness.AudioMock.items.length, firstEmergencyAudioCount);
      assertEquals(harness.overlay(), initialOverlay);
      assertEquals(harness.panel(harness.overlay()!), initialPanel);
      // 视觉等级替换只复用面板，不得重播 Restart panel 的出现动画。
      assertEquals(
        harness.panel(harness.overlay()!).dataset.lobotomyCorpTopPanelReused,
        "true",
      );
      assertEquals(
        JSON.parse(
          harness.storage.getItem("warmnest.lobotomy-corp-day") ?? "{}",
        ).dangerMusicHighWaterLevel,
        3,
      );
    }

    // replay gap 期间 HUD 变化不得取消或重新计时；gap 到期继续 music high-water 的 Third。
    thirdAudio.dispatch("ended");
    const replayTimer = harness.pendingTimer(5000);
    assertEquals(replayTimer !== undefined, true);
    void api.setDangerScore(20);
    assertEquals(harness.pendingTimer(5000), replayTimer);
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
    replayTimer?.callback();
    assertEquals(harness.AudioMock.items.length, firstEmergencyAudioCount);
    assertEquals(harness.AudioMock.items.at(-1), thirdAudio);
    assertEquals(thirdAudio.currentTime, 0);
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
    assertEquals(harness.riskFile(harness.overlay()!), "Risk_1.png");

    // Danger 跌破 10：HUD 消失、Danger 音乐停止、music high-water 清零。
    void api.setDangerScore(9);
    assertEquals(harness.overlay(), undefined);
    assertEquals(api.getDangerMusicHighWaterLevel(), 0);
    assertEquals(api.getDangerScore(), 9);
    assertEquals(thirdAudio.pauseCount > 0, true);
    assertEquals(harness.pendingTimer(5000), undefined);
    assertEquals(
      JSON.parse(
        harness.storage.getItem("warmnest.lobotomy-corp-day") ?? "{}",
      ).dangerMusicHighWaterLevel,
      undefined,
    );

    // 下一场 Emergency 重新建立 high-water：First 不沿用上一场的 Third。
    void api.setDangerScore(20);
    assertEquals(api.getDangerMusicHighWaterLevel(), 1);
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
    const firstAudio = harness.lastTrumpet()!;
    assertEquals(
      firstAudio.src.endsWith("Resources/sounds/bgm/emergency01_mast.ogg"),
      true,
    );

    // 只有 high-water 突破当前音乐等级才换曲：20 → 60 换 Second，60 → 90 换 Third。
    const secondEmergencyAudioCount = harness.AudioMock.items.length;
    void api.setDangerScore(60);
    assertEquals(harness.trumpet(harness.overlay()!), "Second\nTrumpet");
    assertEquals(api.getDangerMusicHighWaterLevel(), 2);
    assertEquals(harness.AudioMock.items.length, secondEmergencyAudioCount + 1);
    const secondAudio = harness.lastTrumpet()!;
    assertEquals(
      secondAudio.src.endsWith("Resources/sounds/bgm/emergency02_mast.ogg"),
      true,
    );
    assertEquals(firstAudio.pauseCount, 1);
    void api.setDangerScore(90);
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
    assertEquals(api.getDangerMusicHighWaterLevel(), 3);
    const thirdOfSecondEmergency = harness.lastTrumpet()!;
    assertEquals(
      thirdOfSecondEmergency.src.endsWith(
        "Resources/sounds/bgm/emergency03_mast.ogg",
      ),
      true,
    );
    assertEquals(secondAudio.pauseCount, 1);

    // 再次衰减到 First：音乐仍是 Third，HUD 立即变回 First。
    void api.setDangerScore(49);
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
    assertEquals(harness.riskFile(harness.overlay()!), "Risk_1.png");
    assertEquals(harness.AudioMock.items.at(-1), thirdOfSecondEmergency);
    assertEquals(thirdOfSecondEmergency.pauseCount, 0);
    void api.setDangerScore(9);
    assertEquals(harness.overlay(), undefined);
    assertEquals(api.getDangerMusicHighWaterLevel(), 0);
  } finally {
    harness.restore();
  }
});

Deno.test("Lobotomy Corporation arbitrates Direct Trumpet against the music owner instead of the HUD", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();

    // 先建立 Third 音乐，再让 Danger 回落到 20：HUD First、音乐 Third。
    void api.setDangerScore(90);
    const dangerThirdAudio = harness.lastTrumpet()!;
    void api.setDangerScore(20);
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
    assertEquals(harness.riskFile(harness.overlay()!), "Risk_1.png");
    assertEquals(api.getDangerMusicHighWaterLevel(), 3);
    assertEquals(harness.overlay()!.dataset.lobotomyCorpAlertMusicLevel, "3");
    dangerThirdAudio.currentTime = 9.5;

    // First / Second / Third 都不高于当前 Third 音乐：不接管，也不改变 HUD 与音乐进度。
    for (const lower of ["first trumpet", "second trumpet", "third trumpet"]) {
      const audioCountBefore = harness.AudioMock.items.length;
      void api.activate(lower);
      assertEquals(harness.AudioMock.items.length, audioCountBefore);
      assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
      assertEquals(
        harness.overlay()!.dataset.lobotomyCorpAlertSource,
        "danger",
      );
      assertEquals(
        harness.overlay()!.dataset.lobotomyCorpAlertMusicSource,
        "danger",
      );
      assertEquals(dangerThirdAudio.pauseCount, 0);
      assertEquals(dangerThirdAudio.currentTime, 9.5);
    }

    // 只有严格高于当前音乐等级的 Fourth 能接管音乐；HUD 仍是实时 Danger 的 First。
    const fourth = api.activate("fourth trumpet");
    const fourthAudio = harness.lastTrumpet()!;
    assertEquals(
      fourthAudio.src.endsWith("Resources/sounds/bgm/emergency04_mast.wav"),
      true,
    );
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
    assertEquals(harness.overlay()!.dataset.lobotomyCorpAlertSource, "danger");
    assertEquals(
      harness.overlay()!.dataset.lobotomyCorpAlertMusicSource,
      "direct",
    );
    assertEquals(dangerThirdAudio.pauseCount, 1);

    // Direct 覆盖期间 Danger 升到 60：只有 HUD 变 Second，同级 Direct 音乐不被抢走。
    void api.setDangerScore(60);
    assertEquals(harness.trumpet(harness.overlay()!), "Second\nTrumpet");
    assertEquals(api.getDangerMusicHighWaterLevel(), 3);
    assertEquals(
      harness.overlay()!.dataset.lobotomyCorpAlertMusicSource,
      "direct",
    );
    assertEquals(harness.AudioMock.items.at(-1), fourthAudio);
    assertEquals(fourthAudio.pauseCount, 0);

    // Fourth 播完：恢复 music high-water 的 Third，而 HUD 仍是实时 Danger 的 Second。
    fourthAudio.dispatch("ended");
    assertEquals(await fourth, true);
    const restoredThird = harness.lastTrumpet()!;
    assertEquals(
      restoredThird.src.endsWith("Resources/sounds/bgm/emergency03_mast.ogg"),
      true,
    );
    assertEquals(harness.trumpet(harness.overlay()!), "Second\nTrumpet");
    assertEquals(
      harness.overlay()!.dataset.lobotomyCorpAlertMusicSource,
      "danger",
    );

    // 结束本次 Emergency 后由 Direct Second 建立会话：HUD 与音乐都用它自己的等级。
    void api.setDangerScore(9);
    assertEquals(harness.overlay(), undefined);
    const directSecond = api.activate("second trumpet");
    const directSecondAudio = harness.lastTrumpet()!;
    assertEquals(harness.trumpet(harness.overlay()!), "Second\nTrumpet");
    assertEquals(harness.overlay()!.dataset.lobotomyCorpAlertSource, "direct");
    assertEquals(
      harness.overlay()!.dataset.lobotomyCorpAlertMusicSource,
      "direct",
    );

    // Danger 升到 20：HUD 改由实时 Danger 显示 First；1 不高于 Direct Second，音乐不接管。
    void api.setDangerScore(20);
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
    assertEquals(api.getDangerMusicHighWaterLevel(), 1);
    assertEquals(
      harness.overlay()!.dataset.lobotomyCorpAlertMusicSource,
      "direct",
    );
    assertEquals(harness.AudioMock.items.at(-1), directSecondAudio);
    assertEquals(directSecondAudio.pauseCount, 0);

    // Danger 升到 90：high-water Third 严格高于 Direct Second，Danger 音乐立即接管。
    void api.setDangerScore(90);
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
    assertEquals(api.getDangerMusicHighWaterLevel(), 3);
    assertEquals(
      harness.overlay()!.dataset.lobotomyCorpAlertMusicSource,
      "danger",
    );
    assertEquals(directSecondAudio.pauseCount, 1);
    const dangerOverDirect = harness.lastTrumpet()!;
    assertEquals(
      dangerOverDirect.src.endsWith(
        "Resources/sounds/bgm/emergency03_mast.ogg",
      ),
      true,
    );
    assertEquals(dangerOverDirect.currentTime, 0);
    assertEquals(await directSecond, true);

    // Danger 覆盖期间跌破 10：只结束底层 Emergency，不打断 Direct one-shot。
    const fourthAtEnd = api.activate("fourth trumpet");
    const fourthAtEndAudio = harness.lastTrumpet()!;
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
    void api.setDangerScore(9);
    assertEquals(api.getDangerMusicHighWaterLevel(), 0);
    assertEquals(harness.hasHud(harness.overlay()!), false);
    assertEquals(
      harness.overlay()!.dataset.lobotomyCorpAlertMusicSource,
      "direct",
    );
    assertEquals(fourthAtEndAudio.pauseCount, 0);
    fourthAtEndAudio.dispatch("ended");
    assertEquals(await fourthAtEnd, true);
    assertEquals(harness.overlay(), undefined);
  } finally {
    harness.restore();
  }
});

Deno.test("Lobotomy Corporation restores the real-time HUD next to the Danger music high-water", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    // 只有内部导航恢复路径会保留 Day；完整 reload 会按既有规则清空 Day。
    harness.storage.setItem(
      "warmnest.lobotomy-corp-day",
      JSON.stringify({
        countedAbnormalityIds: ["T-01-68"],
        dangerMusicHighWaterLevel: 3,
        dangerScore: 30,
        decayGraceDeadline: 30000,
      }),
    );
    harness.storage.setItem(
      "warmnest.lobotomy-corp-alert",
      JSON.stringify({
        directSession: false,
        musicAssetDirectory: "third-trumpet",
        musicSource: "danger",
        playbackState: "replay-intermission",
        position: 5,
        replayAt: 5000,
        startedAt: 0,
        visualAssetDirectory: "first-trumpet",
      }),
    );
    await harness.reload();
    const api = harness.api();

    // Danger=30 的实时阈值是 First，music high-water 是 Third：恢复后两者必须并存。
    assertEquals(api.getDangerScore(), 30);
    assertEquals(api.getDangerMusicHighWaterLevel(), 3);
    assertEquals(harness.overlay()!.dataset.lobotomyCorpAlertSource, "danger");
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
    assertEquals(harness.riskFile(harness.overlay()!), "Risk_1.png");
    assertEquals(harness.overlay()!.dataset.lobotomyCorpAlertMusicLevel, "3");
    const restoredAudio = harness.lastTrumpet()!;
    assertEquals(
      restoredAudio.src.endsWith("Resources/sounds/bgm/emergency03_mast.ogg"),
      true,
    );

    // 恢复时正处于 replay gap：剩余 gap 到期继续 Third，HUD 仍按实时 Danger 显示 First。
    assertEquals(restoredAudio.pauseCount, 0);
    const replayTimer = harness.pendingTimer(5000);
    assertEquals(replayTimer !== undefined, true);
    replayTimer?.callback();
    assertEquals(harness.AudioMock.items.at(-1), restoredAudio);
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
    assertEquals(restoredAudio.currentTime, 0);

    // HUD 升级但没有突破 music high-water（30 → 60）时只改 HUD，不换曲、不重播。
    const restoredAudioCount = harness.AudioMock.items.length;
    void api.setDangerScore(60);
    assertEquals(harness.trumpet(harness.overlay()!), "Second\nTrumpet");
    assertEquals(harness.riskFile(harness.overlay()!), "Risk_2.png");
    assertEquals(api.getDangerMusicHighWaterLevel(), 3);
    assertEquals(harness.AudioMock.items.length, restoredAudioCount);
    assertEquals(restoredAudio.pauseCount, 0);

    // 继续自然衰减到 First 区间，再跌破 10：HUD 消失并结束本次 Emergency。
    void api.setDangerScore(20);
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
    assertEquals(api.getDangerMusicHighWaterLevel(), 3);
    void api.setDangerScore(9);
    assertEquals(harness.overlay(), undefined);
    assertEquals(api.getDangerMusicHighWaterLevel(), 0);
    assertEquals(restoredAudio.pauseCount > 0, true);

    await api.restartDay();
    assertEquals(api.getDangerScore(), 0);

    // 白夜 direct submission：+44 → First，+98 → Third，镇压后恢复 Third 音乐。
    void api.handleAbnormalitySubmitted("T-03-46");
    assertEquals(api.getSpecialEvent(), "white-night");
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
    assertEquals(api.getDangerMusicHighWaterLevel(), 1);
    harness.setNow(5000);
    harness.pendingTimer(16)?.callback();
    assertEquals(api.getDangerScore(), 100);
    assertEquals(api.getDangerMusicHighWaterLevel(), 3);
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
    const whiteNightThirdAudio = harness.lastTrumpet()!;
    assertEquals(
      whiteNightThirdAudio.src.endsWith(
        "Resources/sounds/bgm/emergency03_mast.ogg",
      ),
      true,
    );

    const confession = api.commitDisplayName("O-03-03");
    harness.pendingTimer(whiteNightConfessionSuppressionDelayMs)?.callback();
    harness.pendingTimer(whiteNightDeathSequenceDurationMs)?.callback();
    assertEquals(await confession, true);
    assertEquals(api.getSpecialEvent(), undefined);
    // WhiteNight hold 结束后恢复的是本次 Emergency 的 music high-water Third。
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
    assertEquals(api.getDangerMusicHighWaterLevel(), 3);

    // 镇压后的完整衰减链：HUD 逐级降到 none，音乐始终保持 Third，直到 Danger < 10。
    const whiteNightAudioCount = harness.AudioMock.items.length;
    for (
      const [score, text, risk] of [
        [79, "Second\nTrumpet", "Risk_2.png"],
        [49, "First\nTrumpet", "Risk_1.png"],
        [20, "First\nTrumpet", "Risk_1.png"],
        [10, "First\nTrumpet", "Risk_1.png"],
      ] as [number, string, string][]
    ) {
      void api.setDangerScore(score);
      assertEquals(harness.trumpet(harness.overlay()!), text);
      assertEquals(harness.riskFile(harness.overlay()!), risk);
      assertEquals(api.getDangerMusicHighWaterLevel(), 3);
      assertEquals(whiteNightThirdAudio.pauseCount, 0);
      assertEquals(harness.overlay()!.dataset.lobotomyCorpAlertMusicLevel, "3");
      assertEquals(harness.AudioMock.items.length, whiteNightAudioCount);
    }
    void api.setDangerScore(9);
    assertEquals(harness.overlay(), undefined);
    assertEquals(api.getDangerMusicHighWaterLevel(), 0);
    assertEquals(whiteNightThirdAudio.pauseCount > 0, true);
  } finally {
    harness.restore();
  }
});

Deno.test("Lobotomy Corporation raises the restored Danger music high-water to the live threshold", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    // 存档里的 music high-water 低于当前 Danger 阈值，且存档中的音轨更低。
    harness.storage.setItem(
      "warmnest.lobotomy-corp-day",
      JSON.stringify({
        countedAbnormalityIds: ["T-01-68"],
        dangerMusicHighWaterLevel: 1,
        dangerScore: 90,
      }),
    );
    harness.storage.setItem(
      "warmnest.lobotomy-corp-alert",
      JSON.stringify({
        directSession: false,
        musicAssetDirectory: "first-trumpet",
        musicSource: "danger",
        playbackState: "normal-playing",
        position: 0,
        startedAt: 0,
        visualAssetDirectory: "first-trumpet",
      }),
    );
    await harness.reload();
    const api = harness.api();

    // HUD 只按当前 Danger（Third）计算；music high-water 只补升到 Third，不沿用存档的 First。
    assertEquals(api.getDangerMusicHighWaterLevel(), 3);
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
    assertEquals(harness.riskFile(harness.overlay()!), "Risk_3.png");
    assertEquals(harness.overlay()!.dataset.lobotomyCorpAlertMusicLevel, "3");
    assertEquals(
      harness.lastTrumpet()!.src.endsWith(
        "Resources/sounds/bgm/emergency03_mast.ogg",
      ),
      true,
    );
  } finally {
    harness.restore();
  }
});
Deno.test("WhiteNight keeps the Prelude Alert running and hands the stage BGM over in order", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();

    // t = 0：提交 T-03-46 → +44 → 实时 HUD First，First Trumpet 从头播放。
    void api.handleAbnormalitySubmitted("T-03-46");
    assertEquals(api.getDangerScore(), 44);
    assertEquals(api.getSpecialEvent(), "white-night");
    assertEquals(api.getSpecialEventPhase(), "prelude");
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
    const firstAudio = harness.lastTrumpet()!;
    assertEquals(
      firstAudio.src.endsWith("Resources/sounds/bgm/emergency01_mast.ogg"),
      true,
    );
    assertEquals(firstAudio.playCount >= 1, true);
    const preludeOverlay = harness.overlay()!;
    const preludeController = preludeOverlay.children[0];
    // Simple Advent 期间 Alert 全程正常运行：EmergencyController 不写任何 INGAMEEFFECT Pause 状态。
    assertEquals(
      preludeController.dataset.lobotomyCorpIngameEffectPaused,
      undefined,
    );
    const preludePauseCount = firstAudio.pauseCount;

    // t = 0～4s：普通 Alert lifecycle 照常运行，HUD pulse 不停，BGM 不暂停、不降速。
    for (const at of [1000, 2000, 3999]) {
      harness.setNow(at);
      harness.fireFrames();
      assertEquals(
        preludeOverlay.children[0].dataset.lobotomyCorpIngameEffectPaused,
        undefined,
      );
      assertEquals(firstAudio.pauseCount, preludePauseCount);
      assertEquals(firstAudio.volume, 1);
      assertEquals(firstAudio.loop, false);
      assertEquals(firstAudio.src.endsWith("emergency01_mast.ogg"), true);
    }

    // t = 4000：Simple Advent 逻辑结束 → 第二阶段 +98 → HUD Third，Third 从头以正常音量播放。
    harness.setNow(4000);
    harness.fireFrames();
    assertEquals(api.getDangerScore(), 100);
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
    assertEquals(
      harness.overlay()!.children[0]?.dataset.lobotomyCorpIngameEffectPaused,
      undefined,
    );
    const thirdAudio = harness.lastTrumpet()!;
    assertEquals(
      thirdAudio.src.endsWith("Resources/sounds/bgm/emergency03_mast.ogg"),
      true,
    );
    assertEquals(thirdAudio.currentTime, 0);
    assertEquals(thirdAudio.volume, 1);
    assertEquals(thirdAudio.muted, false);
    assertEquals(thirdAudio.loop, false);
    assertEquals(thirdAudio.playCount >= 1, true);
    assertEquals(thirdAudio.pauseCount, 0);
    assertEquals(firstAudio.pauseCount > preludePauseCount, true);
    // 第二阶段曲目必须先完整可听 3000ms，之后才允许淡出。
    const audibleTimer = harness.pendingTimer(3000);
    assertEquals(audibleTimer !== undefined, true);
    thirdAudio.currentTime = 5;

    // t = 6999：仍处于正常音量播放窗口，尚未 fade、尚未 hold。
    harness.setNow(6999);
    harness.fireFrames();
    assertEquals(thirdAudio.volume, 1);
    assertEquals(thirdAudio.loop, false);
    assertEquals(thirdAudio.pauseCount, 0);
    assertEquals(harness.pendingTimer(3000), audibleTimer);

    // t = 7000：第 3 秒边界才开始 fade-out（fade 时长不计入可听窗口）。
    harness.setNow(7000);
    audibleTimer!.callback();
    assertEquals(thirdAudio.volume, 1);
    assertEquals(thirdAudio.pauseCount, 0);

    // t = 7500：淡出进行到 50%，音量已低于 1.0；同一条 Audio 仍在推进。
    // duck 目标音量是可调参数，因此这里先记录采样值，等淡出结束后用线性插值关系校验。
    harness.setNow(7500);
    harness.fireFrames();
    const volumeAtHalfFadeOut = thirdAudio.volume;
    assertEquals(volumeAtHalfFadeOut < 1, true);
    assertEquals(thirdAudio.muted, false);
    assertEquals(thirdAudio.loop, true);

    // t = 8000：fade 完成 → 进入 ducked hold；currentTime 未被重置或暂停。
    harness.setNow(8000);
    harness.fireFrames();
    const duckVolume = thirdAudio.volume;
    assertEquals(duckVolume > 0 && duckVolume < 1, true);
    // 50% 处的采样必须严格等于 1.0 → duck 目标音量的线性插值中点。
    assertEquals(Math.abs(volumeAtHalfFadeOut - (1 + duckVolume) / 2) < 1e-9, true);
    assertEquals(thirdAudio.pauseCount, 0);
    assertEquals(thirdAudio.muted, false);
    assertEquals(thirdAudio.currentTime, 5);
    assertEquals(
      JSON.parse(
        harness.storage.getItem("warmnest.lobotomy-corp-alert") ?? "{}",
      ).playbackState,
      "special-event-held",
    );
    assertEquals(harness.pendingTimer(16), undefined);

    // WhiteNight 存活期间继续保持 ducked hold，绝不静音。
    harness.setNow(8500);
    harness.fireFrames();
    assertEquals(thirdAudio.volume, duckVolume);
    assertEquals(thirdAudio.pauseCount, 0);
    assertEquals(thirdAudio.currentTime, 5);

    // WhiteNight active 中的用户手势：prepareAlertMusicForResume 不得改写当前 ducked 音量。
    assertEquals(harness.dispatchDocument("pointerdown") > 0, true);
    assertEquals(thirdAudio.volume, duckVolume);
    assertEquals(thirdAudio.muted, false);
    assertEquals(thirdAudio.currentTime, 5);

    // 白夜死亡：同一条 held 曲目从当前 ducked 音量、当前进度淡入，不重新开曲。
    const confession = api.commitDisplayName("O-03-03");
    harness.setNow(10000);
    const suppressionTimer = harness.pendingTimer(
      whiteNightConfessionSuppressionDelayMs,
    );
    assertEquals(suppressionTimer !== undefined, true);
    harness.setNow(10000 + whiteNightConfessionSuppressionDelayMs);
    suppressionTimer!.callback();
    assertEquals(thirdAudio.volume, duckVolume);
    harness.setNow(10000 + whiteNightConfessionSuppressionDelayMs + 1000);
    harness.fireFrames();
    const volumeAtHalfFadeIn = thirdAudio.volume;
    assertEquals(volumeAtHalfFadeIn > duckVolume && volumeAtHalfFadeIn < 1, true);
    assertEquals(thirdAudio.loop, true);
    assertEquals(thirdAudio.pauseCount, 0);
    assertEquals(thirdAudio.currentTime, 5);
    harness.setNow(10000 + whiteNightConfessionSuppressionDelayMs + 2000);
    harness.fireFrames();
    assertEquals(thirdAudio.volume, 1);
    // 淡入 50% 处的采样必须严格等于 duck → 1.0 的线性插值中点。
    assertEquals(Math.abs(volumeAtHalfFadeIn - (duckVolume + 1) / 2) < 1e-9, true);
    assertEquals(thirdAudio.loop, false);
    assertEquals(thirdAudio.pauseCount, 0);
    assertEquals(thirdAudio.currentTime, 5);
    assertEquals(
      JSON.parse(
        harness.storage.getItem("warmnest.lobotomy-corp-alert") ?? "{}",
      ).playbackState,
      "normal-playing",
    );
    harness.setNow(
      10000 + whiteNightConfessionSuppressionDelayMs +
        whiteNightDeathSequenceDurationMs,
    );
    harness.pendingTimer(whiteNightDeathSequenceDurationMs)!.callback();
    assertEquals(await confession, true);
    assertEquals(api.getSpecialEvent(), undefined);
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
  } finally {
    harness.restore();
  }
});

Deno.test("WhiteNight fade-out keeps the in-progress volume through user interaction", async () => {
  /**
   * 复现 Stage2 1.0 → duck 目标音量的淡出进行到 50% 的场景，并在该时刻派发用户手势。
   *
   * @param {"pointerdown" | "keydown"} gesture document 上派发的真实用户手势。
   * @return {Promise<void>} 断言完成后返回。
   */
  const runFadeOutInteraction = async (gesture: "pointerdown" | "keydown") => {
    const harness = installLobotomyCorpAlertHarness();
    try {
      await harness.reload();
      const api = harness.api();
      void api.handleAbnormalitySubmitted("T-03-46");
      harness.setNow(4000);
      harness.fireFrames();
      const fadeAudio = harness.lastTrumpet()!;
      const audibleTimer = harness.pendingTimer(3000)!;
      assertEquals(fadeAudio.volume, 1);
      assertEquals(audibleTimer !== undefined, true);
      fadeAudio.currentTime = 5;

      // t = 7000：可听窗口结束，开始 1.0 → duck 目标音量的 1 秒淡出。
      harness.setNow(7000);
      audibleTimer.callback();
      assertEquals(fadeAudio.volume, 1);

      // t = 7500：淡出进行到 50%（duck 目标可调，这里只记录采样值）。
      harness.setNow(7500);
      harness.fireFrames();
      const volumeBeforeGesture = fadeAudio.volume;
      assertEquals(volumeBeforeGesture < 1, true);

      const pauseCountBeforeGesture = fadeAudio.pauseCount;
      const playCountBeforeGesture = fadeAudio.playCount;
      assertEquals(harness.dispatchDocument(gesture) > 0, true);

      // 用户手势只恢复播放权限：不得把进行中的 fade 硬拉回 duck 目标音量。
      assertEquals(fadeAudio.volume, volumeBeforeGesture);
      assertEquals(fadeAudio.muted, false);
      assertEquals(fadeAudio.loop, true);
      assertEquals(fadeAudio.currentTime, 5);
      assertEquals(fadeAudio.pauseCount, pauseCountBeforeGesture);
      assertEquals(fadeAudio.playCount > playCountBeforeGesture, true);
      assertEquals(harness.lastTrumpet(), fadeAudio);

      // t = 7750：继续按同一线性公式下降，不出现跳变。
      harness.setNow(7750);
      harness.fireFrames();
      const volumeAfterGesture = fadeAudio.volume;
      assertEquals(volumeAfterGesture < volumeBeforeGesture, true);

      // t = 8000：淡出正常收束到 duck 目标音量；同一条 Audio 未被替换，也未重新计时。
      harness.setNow(8000);
      harness.fireFrames();
      const duckVolume = fadeAudio.volume;
      assertEquals(duckVolume > 0 && duckVolume < 1, true);
      assertEquals(duckVolume < volumeAfterGesture, true);
      // 手势前后的两个采样必须严格满足 1.0 → duck 的线性插值（50% 与 75%）。
      assertEquals(
        Math.abs(volumeBeforeGesture - (1 + duckVolume) / 2) < 1e-9,
        true,
      );
      assertEquals(
        Math.abs(volumeAfterGesture - (duckVolume + (1 - duckVolume) * 0.25)) <
          1e-9,
        true,
      );
      assertEquals(fadeAudio.pauseCount, pauseCountBeforeGesture);
      assertEquals(fadeAudio.currentTime, 5);
      assertEquals(harness.lastTrumpet(), fadeAudio);
    } finally {
      harness.restore();
    }
  };

  // pointerdown 与 keydown 共用同一个 recovery handler，两者都必须保持当前音量。
  await runFadeOutInteraction("pointerdown");
  await runFadeOutInteraction("keydown");
});

Deno.test("WhiteNight death fade-in keeps the in-progress volume through user interaction", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    void api.handleAbnormalitySubmitted("T-03-46");
    harness.setNow(4000);
    harness.fireFrames();
    const fadeAudio = harness.lastTrumpet()!;
    const audibleTimer = harness.pendingTimer(3000)!;
    harness.setNow(7000);
    audibleTimer.callback();
    harness.setNow(8000);
    harness.fireFrames();
    const duckVolume = fadeAudio.volume;
    assertEquals(duckVolume > 0 && duckVolume < 1, true);

    // WhiteNight 死亡：同一条曲目从 duck 目标音量开始 2 秒淡入。
    const confession = api.commitDisplayName("O-03-03");
    harness.setNow(10000);
    const suppressionTimer = harness.pendingTimer(
      whiteNightConfessionSuppressionDelayMs,
    )!;
    assertEquals(suppressionTimer !== undefined, true);
    harness.setNow(10000 + whiteNightConfessionSuppressionDelayMs);
    suppressionTimer.callback();
    fadeAudio.currentTime = 5;

    // 淡入进行到一半（目标音量可调，这里只记录采样值）。
    harness.setNow(10000 + whiteNightConfessionSuppressionDelayMs + 1000);
    harness.fireFrames();
    const volumeBeforeGesture = fadeAudio.volume;
    assertEquals(volumeBeforeGesture > duckVolume && volumeBeforeGesture < 1, true);

    const pauseCountBeforeGesture = fadeAudio.pauseCount;
    const playCountBeforeGesture = fadeAudio.playCount;
    assertEquals(harness.dispatchDocument("pointerdown") > 0, true);

    // 淡入中途的用户交互同样只能恢复播放权限，不能改写当前音量。
    assertEquals(fadeAudio.volume, volumeBeforeGesture);
    assertEquals(fadeAudio.muted, false);
    assertEquals(fadeAudio.loop, true);
    assertEquals(fadeAudio.currentTime, 5);
    assertEquals(fadeAudio.pauseCount, pauseCountBeforeGesture);
    assertEquals(fadeAudio.playCount > playCountBeforeGesture, true);
    assertEquals(harness.lastTrumpet(), fadeAudio);

    // 淡入继续正常收束：2000ms 后到 1.0，并退出 special hold。
    harness.setNow(10000 + whiteNightConfessionSuppressionDelayMs + 2000);
    harness.fireFrames();
    assertEquals(fadeAudio.volume, 1);
    // 淡入 50% 处的采样必须严格等于 duck → 1.0 的线性插值中点。
    assertEquals(
      Math.abs(volumeBeforeGesture - (duckVolume + 1) / 2) < 1e-9,
      true,
    );
    assertEquals(fadeAudio.loop, false);
    assertEquals(fadeAudio.currentTime, 5);

    harness.setNow(
      10000 + whiteNightConfessionSuppressionDelayMs +
        whiteNightDeathSequenceDurationMs,
    );
    harness.pendingTimer(whiteNightDeathSequenceDurationMs)!.callback();
    assertEquals(await confession, true);
    assertEquals(api.getSpecialEvent(), undefined);
  } finally {
    harness.restore();
  }
});

Deno.test("WhiteNight stage Trumpet takes over lower or equal Direct owners but keeps higher ones", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    /**
     * 结束当前 Day，让下一段场景从干净状态开始。
     *
     * @return {Promise<void>} rest 完成后返回。
     */
    const restart = async () => {
      const restarting = api.restartDay();
      harness.overlay()!.children[1]?.children[0]?.dispatch("animationend");
      await restarting;
    };

    // A. 同级 Direct First：Prelude 期间普通仲裁保持同一条 Direct First，绝不静音。
    void api.activate("first trumpet");
    const equalDirectAudio = harness.lastTrumpet()!;
    void api.handleAbnormalitySubmitted("T-03-46");
    assertEquals(harness.lastTrumpet(), equalDirectAudio);
    assertEquals(equalDirectAudio.pauseCount, 0);
    assertEquals(equalDirectAudio.volume, 1);
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
    assertEquals(
      harness.overlay()!.dataset.lobotomyCorpAlertMusicSource,
      "direct",
    );
    // 4 秒边界之后的第二阶段 BGM（Third）必须接管同级 Direct First，而不是被拦住。
    harness.setNow(4000);
    harness.fireFrames();
    assertEquals(harness.lastTrumpet() !== equalDirectAudio, true);
    assertEquals(equalDirectAudio.pauseCount > 0, true);
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
    assertEquals(
      harness.overlay()!.dataset.lobotomyCorpAlertMusicSource,
      "danger",
    );
    await restart();

    // B. 高于 +44 结算的 Direct Second：普通 Danger 只升不降，Prelude 不打断这条 one-shot。
    void api.activate("second trumpet");
    const higherDirectAudio = harness.lastTrumpet()!;
    void api.handleAbnormalitySubmitted("T-03-46");
    assertEquals(api.getDangerScore(), 44);
    assertEquals(harness.lastTrumpet(), higherDirectAudio);
    assertEquals(higherDirectAudio.pauseCount, 0);
    assertEquals(higherDirectAudio.volume, 1);
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");
    assertEquals(
      harness.overlay()!.dataset.lobotomyCorpAlertMusicSource,
      "direct",
    );
    await restart();

    // C. 更高的 Direct Fourth 同理保持既有项目设计。
    void api.activate("fourth trumpet");
    const fourthAudio = harness.lastTrumpet()!;
    void api.handleAbnormalitySubmitted("T-03-46");
    assertEquals(harness.lastTrumpet(), fourthAudio);
    assertEquals(fourthAudio.pauseCount, 0);
    assertEquals(
      harness.overlay()!.dataset.lobotomyCorpAlertMusicSource,
      "direct",
    );
    assertEquals(api.getDangerMusicHighWaterLevel(), 1);
    await restart();

    // D. 低于阶段结算的 Direct Second：阶段 BGM（Third）必须接管，而不是被 one-shot 拦住。
    void api.setDangerScore(40);
    void api.activate("second trumpet");
    const lowerDirectAudio = harness.lastTrumpet()!;
    void api.handleAbnormalitySubmitted("T-03-46");
    assertEquals(api.getDangerScore(), 84);
    const stageThirdAudio = harness.lastTrumpet()!;
    assertEquals(
      stageThirdAudio.src.endsWith("Resources/sounds/bgm/emergency03_mast.ogg"),
      true,
    );
    assertEquals(lowerDirectAudio.pauseCount, 1);
    assertEquals(stageThirdAudio.volume, 1);
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
    assertEquals(
      harness.overlay()!.dataset.lobotomyCorpAlertMusicSource,
      "danger",
    );
  } finally {
    harness.restore();
  }
});

Deno.test("WhiteNight has no Alert INGAMEEFFECT Pause plumbing", async () => {
  const [script, css, whiteNight] = await Promise.all(
    [
      "../static/fun/lobotomy-corp/lobotomy-corp.js",
      "../static/fun/lobotomy-corp/lobotomy-corp.css",
      "../static/fun/lobotomy-corp/Events/WhiteNight.js",
    ].map((path) => Deno.readTextFile(new URL(path, import.meta.url))),
  );
  // 脚本、样式与事件模块中都不得出现 INGAMEEFFECT Pause 机制的标识、API 或规则。
  for (const forbidden of [
    "lobotomyCorpIngameEffectPaused",
    "ingame-effect-paused",
    "ingameEffectPaused",
    "ingameEffectKeepsTrumpetAudible",
    "replayPausedRemainingMs",
    "pauseAlertForInGameEffect",
    "resumeAlertFromInGameEffect",
    "endAlertInGameEffectForSpecialEvent",
    "syncInGameEffectPausePresentation",
    "keepAlertMusicSuppressed",
    "specialEventMusicSuppressed",
  ]) {
    assertEquals(css.includes(forbidden), false);
    assertEquals(whiteNight.includes(forbidden), false);
  }
  assertEquals(script.includes("ingameEffectPaused"), false);
  assertEquals(script.includes("pauseAlertForInGameEffect"), false);
  assertEquals(script.includes("resumeAlertFromInGameEffect"), false);
  assertEquals(script.includes("endAlertInGameEffectForSpecialEvent"), false);
  assertEquals(script.includes("syncInGameEffectPausePresentation"), false);
  assertEquals(script.includes("lobotomyCorpIngameEffectPaused"), false);
  assertEquals(script.includes("replayPausedRemainingMs"), false);
  // 唯一允许保留的该标识是持久化兼容读取：把 ingame-effect-paused 迁移成普通播放。
  assertEquals(
    script.includes('saved.playbackState === "ingame-effect-paused"'),
    true,
  );
  // 该状态不得被写回持久化。
  assertEquals(/\?\s*"ingame-effect-paused"/.test(script), false);
  assertEquals(
    /saved\.playbackState === "ingame-effect-paused"\s*\?\s*"normal-playing"/
      .test(script),
    true,
  );
});

Deno.test("Direct music takeover renders the HUD exactly once", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    // 建立 Direct First 会话：HUD 与音乐都使用它自己的等级。
    void api.activate("first trumpet");
    assertEquals(harness.trumpet(harness.overlay()!), "First\nTrumpet");

    // Second 接管时 HUD 与音乐同时变化：四角节点只能因为一次状态更新重建一次。
    const before = harness.createdElements().length;
    void api.activate("second trumpet");
    const created = harness.createdElements().slice(before);
    assertEquals(
      created.filter((node) =>
        node.className.startsWith("lobotomy-corp-alert-corner")
      ).length,
      4,
    );
    assertEquals(harness.overlay()!.dataset.lobotomyCorpAlertVisualLevel, "2");
    assertEquals(harness.trumpet(harness.overlay()!), "Second\nTrumpet");
  } finally {
    harness.restore();
  }
});

Deno.test("WhiteNight Prelude keeps the ordinary Danger replay lifecycle running", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    void api.setDangerScore(90);
    const thirdAudio = harness.lastTrumpet()!;
    // 曲目自然结束：Danger 音乐进入 5 秒 replay gap。
    thirdAudio.dispatch("ended");
    assertEquals(harness.pendingTimer(5000) !== undefined, true);
    assertEquals(thirdAudio.pauseCount, 1);

    // 进入 WhiteNight Prelude：Simple Advent 不冻结 Alert，普通 replay gap 必须继续计时。
    void api.handleAbnormalitySubmitted("T-03-46");
    assertEquals(api.getDangerScore(), 100);
    assertEquals(api.getSpecialEvent(), "white-night");
    assertEquals(api.getSpecialEventPhase(), "prelude");
    const replayTimer = harness.pendingTimer(5000);
    assertEquals(replayTimer !== undefined, true);
    assertEquals(harness.lastTrumpet(), thirdAudio);
    assertEquals(thirdAudio.pauseCount, 1);

    // gap 到期后按普通 Danger 规则重播 high-water 曲目，绝不被 Prelude 吞掉。
    harness.setNow(6000);
    replayTimer!.callback();
    assertEquals(harness.lastTrumpet(), thirdAudio);
    assertEquals(thirdAudio.pauseCount, 1);
    assertEquals(thirdAudio.volume, 1);
    assertEquals(thirdAudio.currentTime, 0);
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
    assertEquals(api.getDangerScore(), 100);
  } finally {
    harness.restore();
  }
});

Deno.test("WhiteNight Prelude refresh keeps the remaining Clock time and runs the ordinary Alert", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    let api = harness.api();
    void api.handleAbnormalitySubmitted("T-03-46");
    const preludeAudio = harness.lastTrumpet()!;
    // 第一阶段 BGM 已播放 1.5 秒，轮盘还剩 1.5 秒。
    preludeAudio.currentTime = 1.5;
    harness.setNow(2500);
    preludeAudio.dispatch("timeupdate");
    const savedSpecialEvent = JSON.parse(
      harness.storage.getItem("warmnest.lobotomy-corp-special-event") ?? "{}",
    );
    assertEquals(savedSpecialEvent.trumpetPhase, "prelude");
    assertEquals(savedSpecialEvent.preludeEndsAt, 4000);
    // Prelude 的普通 Alert 以 normal-playing 持久化，不写任何 INGAMEEFFECT Pause 状态。
    assertEquals(
      JSON.parse(
        harness.storage.getItem("warmnest.lobotomy-corp-alert") ?? "{}",
      ).playbackState,
      "normal-playing",
    );

    harness.setNavigationType("reload");
    await harness.reload();
    api = harness.api();
    assertEquals(api.getSpecialEvent(), "white-night");
    assertEquals(api.getSpecialEventPhase(), "prelude");
    const resumedAudio = harness.lastTrumpet()!;
    assertEquals(
      resumedAudio.src.endsWith("Resources/sounds/bgm/emergency01_mast.ogg"),
      true,
    );
    // 恢复的普通 Alert 必须没有 INGAMEEFFECT Pause 状态，HUD 与播放都保持运行。
    assertEquals(
      harness.overlay()!.children[0]?.dataset.lobotomyCorpIngameEffectPaused,
      undefined,
    );
    // 媒体元数据就绪后从保存进度继续（不重头、不静音），并由普通 Alert 自行播放。
    resumedAudio.dispatch("loadedmetadata");
    assertEquals(resumedAudio.pauseCount, 0);
    assertEquals(resumedAudio.volume, 1);
    assertEquals(resumedAudio.muted, false);
    assertEquals(resumedAudio.loop, false);
    assertEquals(resumedAudio.currentTime, 1.5);

    // 刷新恢复只保留剩余 Clock 时间：t = 4000 才结算第二笔 +98。
    harness.fireFrames();
    assertEquals(api.getDangerScore(), 44);
    harness.setNow(2500 + 1400);
    harness.fireFrames();
    assertEquals(api.getDangerScore(), 44);
    harness.setNow(2500 + 1500);
    harness.fireFrames();
    assertEquals(api.getDangerScore(), 100);
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
  } finally {
    harness.restore();
  }
});

Deno.test("WhiteNight staged Trumpet timers are cleared by Restart Day", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    void api.handleAbnormalitySubmitted("T-03-46");
    harness.setNow(4000);
    harness.fireFrames();
    const thirdAudio = harness.lastTrumpet()!;
    assertEquals(harness.pendingTimer(3000) !== undefined, true);
    const audioCount = harness.AudioMock.items.length;

    const restarting = api.restartDay();
    assertEquals(harness.pendingTimer(3000), undefined);
    harness.overlay()!.children[1]?.children[0]?.dispatch("animationend");
    await restarting;
    assertEquals(api.getDangerScore(), 0);
    assertEquals(api.getSpecialEvent(), undefined);
    const pausedPlayback = {
      pauseCount: thirdAudio.pauseCount,
      volume: thirdAudio.volume,
    };

    // 任何仍存活的计时器都不得在之后复活阶段音乐或改变媒体状态。
    harness.setNow(60000);
    harness.fireFrames();
    assertEquals(harness.AudioMock.items.length, audioCount);
    assertEquals(thirdAudio.pauseCount > 0, true);
    assertEquals(thirdAudio.pauseCount, pausedPlayback.pauseCount);
    assertEquals(thirdAudio.volume, pausedPlayback.volume);
    assertEquals(harness.pendingTimer(3000), undefined);
  } finally {
    harness.restore();
  }
});

Deno.test("Lobotomy Corporation reuses an existing session when start races with it", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    const activateWithMedia = api.activate as unknown as (
      value: string,
      preparedMedia: unknown,
    ) => Promise<boolean>;

    /**
     * 结束当前 Day，让下一个竞态场景从没有会话的状态开始。
     *
     * @return {Promise<void>} restart 完成后返回。
     */
    const restart = async () => {
      const restarting = api.restartDay();
      harness.overlay()?.children[1]?.children[0]?.dispatch("animationend");
      await restarting;
    };

    // A. 外层更低：竞态兜底不得重建会话，只保留内层已经建立的 Second。
    let lowerReentry = 0;
    const lowerMedia = {
      consume: () => {
        if (lowerReentry++ === 0) void api.activate("second trumpet");
        return undefined;
      },
      dispose: () => {},
    };
    await activateWithMedia("first trumpet", lowerMedia);
    assertEquals(harness.trumpet(harness.overlay()!), "Second\nTrumpet");
    assertEquals(harness.overlay()!.dataset.lobotomyCorpAlertMusicLevel, "2");
    assertEquals(visibleAlertOverlayCount(harness.body), 1);
    await restart();

    // B. 外层更高：竞态兜底走「严格更高才接管」，接管同一会话而不重建 DOM。
    let higherReentry = 0;
    const higherMedia = {
      consume: () => {
        if (higherReentry++ === 0) void api.activate("second trumpet");
        return undefined;
      },
      dispose: () => {},
    };
    void activateWithMedia("fourth trumpet", higherMedia);
    assertEquals(harness.trumpet(harness.overlay()!), "Fourth\nTrumpet");
    assertEquals(harness.overlay()!.dataset.lobotomyCorpAlertMusicLevel, "4");
    assertEquals(
      harness.lastTrumpet()!.src.endsWith(
        "Resources/sounds/bgm/emergency04_mast.wav",
      ),
      true,
    );
    assertEquals(visibleAlertOverlayCount(harness.body), 1);
  } finally {
    harness.restore();
  }
});
