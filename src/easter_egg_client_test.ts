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
    const confirmedAudio = AudioMock.items.find((audio) =>
      audio.src.endsWith("Lucifer_standbg0.ogg")
    )!;
    assertEquals(confirmed.saved, true);
    assertEquals(observedCanonicalIds, ["T-03-46"]);
    assertEquals(api.getDangerScore(), 75);
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-day")?.includes("T-03-46"),
      true,
    );
    assertEquals(body.children.length > 0, true);
    assertEquals(api.getSpecialEvent(), "white-night");
    assertEquals(confirmedAudio.muted, false);
    assertEquals(confirmedAudio.playCount, 2);

    const churchPauseCount = confirmedAudio.pauseCount;
    Object.defineProperty(browser, "fetch", {
      configurable: true,
      value: () =>
        Promise.resolve({
          ok: false,
          url: "https://warmnest.test/settings?account=invalid",
        }),
    });
    const rejectedConfession = await transaction(
      api as never,
      form,
      "displayName",
      "  赎罪  ",
    );
    assertEquals(rejectedConfession.saved, false);
    assertEquals(api.getSpecialEvent(), "white-night");
    assertEquals(api.getSpecialEventPhase(), "active");
    assertEquals(confirmedAudio.pauseCount, churchPauseCount);
    assertEquals(hasMedia(body, "WhiteNight_Confess_Dead.webm"), false);

    Object.defineProperty(browser, "fetch", {
      configurable: true,
      value: () =>
        Promise.resolve({
          ok: true,
          url: "https://warmnest.test/settings?account=updated",
        }),
    });
    const confirmedConfession = await transaction(
      api as never,
      form,
      "displayName",
      "O-03-03",
    );
    assertEquals(confirmedConfession.saved, true);
    assertEquals(api.getSpecialEventPhase(), "ending");
    assertEquals(confirmedAudio.pauseCount, churchPauseCount);
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
    duration = AudioMock.nextDuration;
    currentTime = 0;
    pauseCount = 0;
    playCount = 0;
    preload = "";
    readyState = AudioMock.nextReadyState;
    /** @param {string} source 音频地址。 */ constructor(source: string) {
      super();
      this.src = source;
      AudioMock.items.push(this);
    }
    /** @return {Promise<void>} 播放结果。 */ play(): Promise<void> {
      this.playCount++;
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
      getDangerScore: () => number;
      getSpecialEvent: () => string | undefined;
      prepareDisplayName: (name: string) => {
        commit: () => Promise<boolean>;
      };
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
      "setTimeout",
      "clearTimeout",
    ].map((name) => [name, Object.getOwnPropertyDescriptor(browser, name)]),
  );
  const body = new Element();
  const storage = new StorageMock();
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
    assertEquals(
      fourthAudio.src.endsWith("Resources/sounds/bgm/emergency04_mast.wav"),
      true,
    );
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
    assertEquals(Math.abs(api.getDangerScore() - 75 / 11) < 1e-10, true);
    assertEquals(api.getSpecialEvent(), "white-night");
    const whiteNightRestartOnlyOverlay = [...body.children].reverse().find(
      (element) =>
        !element.removed &&
        element.className === "lobotomy-corp-alert-overlay",
    )!;
    assertEquals(whiteNightRestartOnlyOverlay.children.length, 1);
    const whiteNightDay = storage.getItem("warmnest.lobotomy-corp-day") ?? "";
    assertEquals(whiteNightDay.includes('"departmentCount":11'), true);
    assertEquals(whiteNightDay.includes('"decayPausedRemainingMs"'), true);
    assertEquals(whiteNightDay.includes('"decayGraceDeadline"'), false);
    const whiteNightRestart = api.restartDay();
    const whiteNightOverlay = body.children.find((candidate) =>
      candidate.children[1]?.children[0]
    );
    whiteNightOverlay?.children[1].children[0].dispatch("animationend");
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

    // 已有 Trumpet 时白夜只接管音乐；事件期间仍更新 visual/music high-water，
    // 赎罪完成后再从正确的当前高水位曲目开头恢复。
    void api.setDangerScore(45);
    const firstBeforeWhiteNight = AudioMock.items.at(-1)!;
    void api.handleAbnormalitySubmitted("T-03-46");
    assertEquals(api.getSpecialEvent(), "white-night");
    assertEquals(firstBeforeWhiteNight.pauseCount > 0, true);
    const audioCountBeforeHeldUpgrade = AudioMock.items.length;
    void api.setDangerScore(85);
    await Promise.resolve();
    assertEquals(AudioMock.items.length, audioCountBeforeHeldUpgrade);
    const heldThirdOverlay = [...body.children].reverse().find((element) =>
      !element.removed &&
      element.className === "lobotomy-corp-alert-overlay"
    )!;
    assertEquals(trumpet(heldThirdOverlay), "Third\nTrumpet");

    const confessionCompletion = api.commitDisplayName("O-03-03");
    const confessionEntity = [...body.children].reverse().find((element) =>
      element.className === "lobotomy-corp-white-night-confession-entity"
    )!;
    assertEquals(confessionEntity.children[0].hidden, true);
    const suppression = [...timers.values()].find((timer) =>
      timer.delay === whiteNightConfessionSuppressionDelayMs && !timer.cleared
    )!;
    suppression.callback();
    assertEquals(confessionEntity.children[0].hidden, false);
    const deathFallback = [...timers.values()].find((timer) =>
      timer.delay === whiteNightDeathSequenceDurationMs && !timer.cleared
    )!;
    deathFallback.callback();
    assertEquals(await confessionCompletion, true);
    assertEquals(api.getSpecialEvent(), undefined);
    assertEquals(api.getDangerScore(), 85);
    assertEquals(
      AudioMock.items.some((audio) =>
        audio.src.endsWith("Resources/sounds/bgm/emergency03_mast.ogg")
      ),
      true,
    );
    const trumpetRestart = api.restartDay();
    heldThirdOverlay.children[1].children[0].dispatch("animationend");
    await trumpetRestart;

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
      true,
    );
    const reloadAudioStart = AudioMock.items.length;
    navigationType = "reload";
    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    api = browser.lobotomyCorpEasterEgg!;
    assertEquals(api.getSpecialEvent(), "white-night");
    assertEquals(Math.abs(api.getDangerScore() - 75 / 11) < 1e-10, true);
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-day")?.includes(
        '"decayPausedRemainingMs"',
      ),
      true,
    );
    assertEquals(
      AudioMock.items.slice(reloadAudioStart).some((audio) =>
        audio.src.endsWith("Lucifer_standbg0.ogg")
      ),
      true,
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
      assertEquals(api.startWhiteNight({ source: "apostles-replay" }), true);
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
