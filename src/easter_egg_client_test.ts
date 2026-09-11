/**
 * @file 本文件验证彩蛋前端的协调及《脑叶公司》Trumpet 警报生命周期。
 */
import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
  findAllByClass,
  findByClass,
  requireByClass,
  stripCssComments,
  stripJavaScriptCommentsAndStrings,
} from "./test_helpers.ts";
import {
  AudioMock,
  Element,
  installLobotomyCorpAlertHarness,
  StorageMock,
} from "./test_harness.ts";
import { renderLayout } from "./views/html.ts";
import {
  whiteNightConfessionSuppressionDelayMs,
  whiteNightDeathSequenceDurationMs,
  whiteNightStageMusicAudibleMs,
} from "../static/fun/lobotomy-corp/Events/WhiteNight.js";
import { whiteNightSimpleAdventDurationMs } from "../static/fun/lobotomy-corp/Events/WhiteNightAdvent.js";
import {
  dontTouchMeEffectVideoClassName,
  dontTouchMeExitDelayMs,
  dontTouchMeExitPath,
  dontTouchMeKillEffect,
  dontTouchMeOverlayClassName,
  dontTouchMeRecoilAmplitudeRatio,
  dontTouchMeRecoilArrowCount,
  dontTouchMeRecoilStepMs,
  dontTouchMeShutdownSoundPath,
  dontTouchMeShutdownVideoPath,
  dontTouchMeShoutSoundPath,
  dontTouchMeVideoClassName,
} from "../static/fun/lobotomy-corp/Events/DontTouchMe.js";

/**
 * 派发顶部 Restart 面板的反向动画结束事件，模拟面板收起动画完成。
 *
 * @param overlay 警报 overlay；缺失时不做任何事。
 */
function finishRestartPanelAnimation<
  T extends {
    children: T[];
    className: string;
    dispatch(name: string): void;
  },
>(overlay: T | undefined): void {
  if (!overlay) return;
  findByClass(overlay, "lobotomy-corp-top-panel-active-controller")
    ?.dispatch("animationend");
}

/** Simple Advent 轮盘的逻辑时长（毫秒）；Prelude 在该时刻结束并结算第二笔危急值。 */
const whiteNightPreludeDurationMs = whiteNightSimpleAdventDurationMs;

/** 第二阶段 BGM 开始淡出的时刻（毫秒）：Prelude 结束后再完整可听一个可听窗口。 */
const whiteNightFadeStartMs = whiteNightPreludeDurationMs +
  whiteNightStageMusicAudibleMs;

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
      (alias) => assert(aliases.includes(alias)),
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

  assert(!(aceAttorneyEntry.includes("XMLHttpRequest")));
  assert(!(lobotomyCorpEntry.includes("XMLHttpRequest")));
  assert(!(lobotomyCorpEntry.includes("Abnormalities.json")));
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
    assert(Number.isFinite(portrait390) && portrait390 > 0);
    assert(Number.isFinite(portrait430) && portrait430 > 0);
    assert(portrait390 > 390 / 1920);
    assert(portrait430 > 430 / 1920);
    // CSS 保留 Unity 原版的 0.5 倍根缩放；此处锁定最终视觉量级，防止退化回约 10%。
    assert(Math.abs(portrait390 * 0.5 - 0.199) < 0.01);
    assert(Math.abs(portrait430 * 0.5 - 0.22) < 0.01);

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
  AudioMock.reset();
  // 释放预备媒体时会 removeAttribute("src")，本测试据此确认预备音频已被释放。
  AudioMock.clearSrcOnRemoveAttribute = true;
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
    assertStrictEquals(rejected.saved, false);
    assertEquals(observedCanonicalIds, []);
    assertEquals(api.getDangerScore(), 0);
    assertEquals(api.getSpecialEvent(), undefined);
    assertEquals(storage.getItem("warmnest.lobotomy-corp-day"), null);
    assertEquals(body.children.length, 0);
    assertStrictEquals(rejectedAudio.muted, true);
    assertEquals(rejectedAudio.playCount, 1);
    assert(rejectedAudio.pauseCount >= 1);
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
    assertStrictEquals(confirmed.saved, true);
    assertEquals(observedCanonicalIds, ["T-03-46"]);
    assertEquals(api.getDangerScore(), 44);
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-day")?.includes("T-03-46"),
      true,
    );
    assert(body.children.length > 0);
    assertEquals(api.getSpecialEvent(), "white-night");
    assertEquals(api.getSpecialEventPhase(), "prelude");
    const preparedChurch = AudioMock.items.find((audio) =>
      audio.src.endsWith("Lucifer_standbg0.ogg")
    )!;
    assertStrictEquals(preparedChurch.muted, true);
    assertEquals(preparedChurch.playCount, 1);
    assertStrictEquals(hasMedia(body, "WhiteNight_Confess_Dead.webm"), false);
    const savedIdentityLabel = displayNameLabel.textContent;

    const restarting = api.restartDay();
    finishRestartPanelAnimation(body.children.at(-1));
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
      (name) => assert(api.matches(name)),
    );
    assert(!(api.matches("普通用户")));
    documentMock.documentElement.lang = "zh-HK";
    assertEquals(api.imageLocale(), "zh-TW");
    assertEquals(api.voiceLocale(), "zh-CN");
  } finally {
    if (originalDocument) {
      Object.defineProperty(browser, "document", originalDocument);
    } else Reflect.deleteProperty(browser, "document");
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
    assert(
      requireByClass(navAvatarWrapper, "lobotomy-corp-risk-badge").src
        .endsWith("Risk_Aleph.png"),
    );
    assert(
      requireByClass(settingsAvatarWrapper, "lobotomy-corp-risk-badge").src
        .endsWith("Risk_Aleph.png"),
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
    } else Reflect.deleteProperty(browser, "document");
    if (originalApi) {
      Object.defineProperty(browser, "lobotomyCorpEasterEgg", originalApi);
    } else delete browser.lobotomyCorpEasterEgg;
  }
});

Deno.test("Lobotomy Corporation Fourth Trumpet separates visual and music high-water", async () => {
  AudioMock.reset();
  AudioMock.clearSrcOnRemoveAttribute = true;
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
    (overlay: Element) => findAllByClass(overlay, "lobotomy-corp-alert-corner");
  /** @param {Element} overlay 警报外层。 @return {string} Trumpet 文本。 */ const trumpet =
    (overlay: Element) =>
      requireByClass(overlay, "lobotomy-corp-alert-trumpet-level-content")
        .textContent;
  /** @param {Element} overlay 警报外层。 @return {Element} Restart 面板。 */ const panel =
    (overlay: Element) => requireByClass(overlay, "lobotomy-corp-top-panel");
  /** @param {Element} overlay 警报外层。 @return {Element} EmergencyImage。 */ const risk =
    (overlay: Element) => requireByClass(overlay, "lobotomy-corp-alert-risk");
  /** @param {Element} overlay 警报外层。 @param {number} cornerIndex 含图标的 Corner 索引。 @return {Element} EmergencyImage 的 RectTransform 容器。 */ const riskRect =
    (overlay: Element, cornerIndex: number) =>
      requireByClass(
        corners(overlay)[cornerIndex],
        "lobotomy-corp-alert-factorial",
      );
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
    assert(api.matches("first-trumpet"));
    [
      "FOURTH TRUMPET",
      "Fourth Trumpet",
      "fourth trumpet",
      "fourth-trumpet",
      "fourthtrumpet",
    ].forEach((name) => assert(api.matches(name)));
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
    assertStrictEquals(await first, true);
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
    assertStrictEquals(await second, true);
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
    assert(risk(fourthOverlay).src.endsWith("MiddleArea_4_27.png"));
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
    assert(panel(fourthOverlay) === panel(initialFirstOverlay));
    assert(fourthOverlay === downOverlay);
    assertEquals(
      requireByClass(
        panel(fourthOverlay),
        "lobotomy-corp-top-panel-action-button-text",
      ).textContent,
      "你被解雇了，主管！",
    );
    assertEquals(
      requireByClass(
        panel(fourthOverlay),
        "lobotomy-corp-top-panel-action-button",
      ).attributes["aria-label"],
      "你被解雇了，主管！",
    );
    assertStrictEquals(await down, true);
    assertStrictEquals(await third, true);
    // 低等级 direct 不改写 Fourth owner；曲目结束后才关闭 direct one-shot。
    fourthAudio.dispatch("ended");
    assertStrictEquals(await fourth, true);
    // 同级 direct 不把持续 Danger owner 换成 one-shot；更高 direct 暂时接管音乐。
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
    assertStrictEquals(await equalDirectFirst, true);
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
    assertStrictEquals(await directSecondOverDanger, true);
    // Direct one-shot 结束后恢复底层 Danger 音乐；HUD 仍是实时 Danger 的 First。
    assertEquals(trumpet(body.children.at(-1)!), "First\nTrumpet");
    assertEquals(
      body.children.at(-1)?.dataset.lobotomyCorpAlertMusicSource,
      "danger",
    );
    api.setDangerScore(100);
    const dangerOverlay = body.children.at(-1)!;
    assertEquals(trumpet(dangerOverlay), "Third\nTrumpet");
    assert(risk(dangerOverlay).src.endsWith("Risk_3.png"));
    const dangerThirdAudio = AudioMock.items.at(-1)!;
    const dangerAudioCountBeforeDecay = AudioMock.items.length;
    // 自然衰减跨阈值：HUD 立即降级，但正在播放的曲目与 music high-water 都不变。
    api.setDangerScore(60);
    assertEquals(dangerThirdAudio.pauseCount, 0);
    assertEquals(trumpet(body.children.at(-1)!), "Second\nTrumpet");
    assert(risk(body.children.at(-1)!).src.endsWith("Risk_2.png"));
    assertEquals(api.getDangerMusicHighWaterLevel(), 3);
    dangerThirdAudio.dispatch("ended");
    const replayTimer = [...timers.values()].find((timer) =>
      timer.delay === 5000 && !timer.cleared
    );
    assert(replayTimer !== undefined);
    replayTimer?.callback();
    // replay gap 结束后继续 music high-water 的 Third，而 HUD 仍按 Danger=60 显示 Second。
    assertEquals(trumpet(body.children.at(-1)!), "Second\nTrumpet");
    assertEquals(AudioMock.items.length, dangerAudioCountBeforeDecay);
    assertEquals(AudioMock.items.at(-1), dangerThirdAudio);
    assertEquals(dangerThirdAudio.currentTime, 0);
    api.setDangerScore(9);
    assertEquals(api.getDangerMusicHighWaterLevel(), 0);
    const stop = api.setDangerScore(0);
    assertStrictEquals(await stop, true);
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
    assert(Math.abs(api.getDangerScore() - 20 / 11) < 1e-10);
    void api.handleAbnormalitySubmitted("t-01-54");
    assert(Math.abs(api.getDangerScore() - 20 / 11) < 1e-10);
    void api.handleAbnormalitySubmitted("T-01-68");
    assert(Math.abs(api.getDangerScore() - 60 / 11) < 1e-10);
    void api.handleAbnormalitySubmitted("O-06-20");
    assert(Math.abs(api.getDangerScore() - 135 / 11) < 1e-10);
    const tethRestart = api.restartDay();
    finishRestartPanelAnimation(body.children.at(-1));
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
      requireByClass(
        whiteNightRestartOnlyOverlay,
        "lobotomy-corp-emergency-controller",
      ).dataset
        .lobotomyCorpIngameEffectPaused,
      undefined,
    );
    const whiteNightDay = storage.getItem("warmnest.lobotomy-corp-day") ?? "";
    assert(!(whiteNightDay.includes('"departmentCount"')));
    assert(!(whiteNightDay.includes('"decayPausedRemainingMs"')));
    assert(whiteNightDay.includes('"decayGraceDeadline"'));
    const whiteNightRestart = api.restartDay();
    finishRestartPanelAnimation(whiteNightRestartOnlyOverlay);
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
    finishRestartPanelAnimation(
      [...body.children].reverse().find((element) =>
        !element.removed && element.className === "lobotomy-corp-alert-overlay"
      ),
    );
    await secondWhiteNightRestart;

    // Second 已接管音频后，延迟预热 Promise 不会反向暂停它。
    void api.setDangerScore(45);
    AudioMock.deferNextPlayCount = 1;
    AudioMock.nextDuration = 0.1;
    AudioMock.nextReadyState = 1;
    const preparedSecond = api.prepareDisplayName("O-06-20");
    assertStrictEquals(
      (AudioMock.items.at(-1)! as { muted?: boolean }).muted,
      true,
    );
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
    assertStrictEquals(
      (secondPreparedAudio as { muted?: boolean }).muted,
      false,
    );

    // 同级提交不替换 BGM，未消费的预备音频被释放。
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

    // Restart Day 终止整场 Day：白夜的 ducked Trumpet 停止播放，也不触发淡入。
    const resetBeforeRestartCheck = api.restartDay();
    finishRestartPanelAnimation(
      [...body.children].reverse().find((element) =>
        !element.removed && element.className === "lobotomy-corp-alert-overlay"
      ),
    );
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
    assert(restartHeldVolume > 0 && restartHeldVolume < 1);
    restartSuppressedTrumpet.currentTime = 22;
    const restartDuringWhiteNight = api.restartDay();
    finishRestartPanelAnimation(
      [...body.children].reverse().find((element) =>
        !element.removed && element.className === "lobotomy-corp-alert-overlay"
      ),
    );
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
    assertStrictEquals(reloadedTrumpet.loop, true);
    assertStrictEquals(reloadedTrumpet.muted, false);
    const reloadedHeldVolume = reloadedTrumpet.volume;
    assert(reloadedHeldVolume > 0 && reloadedHeldVolume < 1);
    assertStrictEquals(reloadedTrumpet.autoplayRejected, false);
    assertEquals(reloadedTrumpet.playCount, 2);
    // 首次被拒绝且 Chromium 把 seek 重置为 0 时，持久化仍保留循环内的 12 秒位置。
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
    assert(AudioMock.items.includes(reloadedTrumpet));
    assertEquals(reloadedTrumpet.currentTime, 12);
    assertEquals(reloadedTrumpet.pauseCount, 0);
    assertStrictEquals(reloadedTrumpet.muted, false);
    // 首次交互只恢复播放权限，不改写当前 held 音量。
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
    finishRestartPanelAnimation(
      [...body.children].reverse().find((element) =>
        !element.removed && element.className === "lobotomy-corp-alert-overlay"
      ),
    );
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
  AudioMock.reset();
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
    assert(Math.abs(api.getDangerScore() - 20 / 11) < 1e-10);
    assertEquals(
      storage.getItem("warmnest.lobotomy-corp-day")?.includes("T-01-54"),
      true,
    );

    await import(
      `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
    );
    api = browser.lobotomyCorpEasterEgg!;
    assert(Math.abs(api.getDangerScore() - 20 / 11) < 1e-10);
    await api.handleAbnormalitySubmitted("t-01-54");
    assert(Math.abs(api.getDangerScore() - 20 / 11) < 1e-10);

    await api.handleAbnormalitySubmitted("O-06-20");
    assert(api.getDangerScore() > 0 && api.getDangerScore() < 10);
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
      assertStrictEquals(await confession, true);
      assertEquals(api.getSpecialEvent(), undefined);
      const resumedDay = JSON.parse(
        storage.getItem("warmnest.lobotomy-corp-day") ?? "{}",
      );
      assertEquals(resumedDay.decayGraceDeadline, 211000);
      assertStrictEquals("decayPausedRemainingMs" in resumedDay, false);
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
      // 视觉等级替换只复用面板，不重播 Restart panel 的出现动画。
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

    // replay gap 期间 HUD 变化不取消也不重新计时；gap 到期继续 music high-water 的 Third。
    thirdAudio.dispatch("ended");
    const replayTimer = harness.pendingTimer(5000);
    assert(replayTimer !== undefined);
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
    assert(thirdAudio.pauseCount > 0);
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
    assertStrictEquals(await fourth, true);
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
    assertStrictEquals(await directSecond, true);

    // Danger 覆盖期间跌破 10：只结束底层 Emergency，不打断 Direct one-shot。
    const fourthAtEnd = api.activate("fourth trumpet");
    const fourthAtEndAudio = harness.lastTrumpet()!;
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
    void api.setDangerScore(9);
    assertEquals(api.getDangerMusicHighWaterLevel(), 0);
    assertStrictEquals(harness.hasHud(harness.overlay()!), false);
    assertEquals(
      harness.overlay()!.dataset.lobotomyCorpAlertMusicSource,
      "direct",
    );
    assertEquals(fourthAtEndAudio.pauseCount, 0);
    fourthAtEndAudio.dispatch("ended");
    assertStrictEquals(await fourthAtEnd, true);
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

    // Danger=30 的实时阈值是 First，music high-water 是 Third：恢复后两者并存。
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
    assert(replayTimer !== undefined);
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
    assert(restoredAudio.pauseCount > 0);

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
    assertStrictEquals(await confession, true);
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
    assert(whiteNightThirdAudio.pauseCount > 0);
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
    assert(firstAudio.playCount >= 1);
    const preludeOverlay = harness.overlay()!;
    const preludeController = requireByClass(
      preludeOverlay,
      "lobotomy-corp-emergency-controller",
    );
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
        requireByClass(preludeOverlay, "lobotomy-corp-emergency-controller")
          .dataset.lobotomyCorpIngameEffectPaused,
        undefined,
      );
      assertEquals(firstAudio.pauseCount, preludePauseCount);
      assertEquals(firstAudio.volume, 1);
      assertStrictEquals(firstAudio.loop, false);
      assert(firstAudio.src.endsWith("emergency01_mast.ogg"));
    }

    // Simple Advent 逻辑结束 → 第二阶段 +98 → HUD Third，Third 从头以正常音量播放。
    harness.setNow(whiteNightPreludeDurationMs);
    harness.fireFrames();
    assertEquals(api.getDangerScore(), 100);
    assertEquals(harness.trumpet(harness.overlay()!), "Third\nTrumpet");
    assertEquals(
      requireByClass(harness.overlay()!, "lobotomy-corp-emergency-controller")
        .dataset.lobotomyCorpIngameEffectPaused,
      undefined,
    );
    const thirdAudio = harness.lastTrumpet()!;
    assertEquals(
      thirdAudio.src.endsWith("Resources/sounds/bgm/emergency03_mast.ogg"),
      true,
    );
    assertEquals(thirdAudio.currentTime, 0);
    assertEquals(thirdAudio.volume, 1);
    assertStrictEquals(thirdAudio.muted, false);
    assertStrictEquals(thirdAudio.loop, false);
    assert(thirdAudio.playCount >= 1);
    assertEquals(thirdAudio.pauseCount, 0);
    assert(firstAudio.pauseCount > preludePauseCount);
    // 第二阶段曲目先完整可听一个可听窗口，之后才进入淡出。
    const audibleTimer = harness.pendingTimer(whiteNightStageMusicAudibleMs);
    assert(audibleTimer !== undefined);
    thirdAudio.currentTime = 5;

    // 可听窗口结束前一瞬：仍是正常音量，尚未 fade、尚未 hold。
    harness.setNow(whiteNightFadeStartMs - 1);
    harness.fireFrames();
    assertEquals(thirdAudio.volume, 1);
    assertStrictEquals(thirdAudio.loop, false);
    assertEquals(thirdAudio.pauseCount, 0);
    assertEquals(
      harness.pendingTimer(whiteNightStageMusicAudibleMs),
      audibleTimer,
    );

    // 可听窗口结束时才开始 fade-out（fade 时长不计入可听窗口）。
    harness.setNow(whiteNightFadeStartMs);
    audibleTimer!.callback();
    assertEquals(thirdAudio.volume, 1);
    assertEquals(thirdAudio.pauseCount, 0);

    // 淡出进行到 50%：音量已低于 1.0；同一条 Audio 仍在推进。
    // duck 目标音量是可调参数，因此这里先记录采样值，等淡出结束后用线性插值关系校验。
    harness.setNow(whiteNightFadeStartMs + 500);
    harness.fireFrames();
    const volumeAtHalfFadeOut = thirdAudio.volume;
    assert(volumeAtHalfFadeOut < 1);
    assertStrictEquals(thirdAudio.muted, false);
    assertStrictEquals(thirdAudio.loop, true);

    // fade 完成 → 进入 ducked hold；currentTime 未被重置或暂停。
    harness.setNow(whiteNightFadeStartMs + 1000);
    harness.fireFrames();
    const duckVolume = thirdAudio.volume;
    assert(duckVolume > 0 && duckVolume < 1);
    // 50% 处的采样等于 1.0 → duck 目标音量的线性插值中点。
    assert(Math.abs(volumeAtHalfFadeOut - (1 + duckVolume) / 2) < 1e-9);
    assertEquals(thirdAudio.pauseCount, 0);
    assertStrictEquals(thirdAudio.muted, false);
    assertEquals(thirdAudio.currentTime, 5);
    assertEquals(
      JSON.parse(
        harness.storage.getItem("warmnest.lobotomy-corp-alert") ?? "{}",
      ).playbackState,
      "special-event-held",
    );
    assertEquals(harness.pendingTimer(16), undefined);

    // WhiteNight 存活期间继续保持 ducked hold，不静音。
    harness.setNow(whiteNightFadeStartMs + 1500);
    harness.fireFrames();
    assertEquals(thirdAudio.volume, duckVolume);
    assertEquals(thirdAudio.pauseCount, 0);
    assertEquals(thirdAudio.currentTime, 5);

    // WhiteNight active 中的用户手势：prepareAlertMusicForResume 不改写当前 ducked 音量。
    assert(harness.dispatchDocument("pointerdown") > 0);
    assertEquals(thirdAudio.volume, duckVolume);
    assertStrictEquals(thirdAudio.muted, false);
    assertEquals(thirdAudio.currentTime, 5);

    // 白夜死亡：同一条 held 曲目从当前 ducked 音量、当前进度淡入，不重新开曲。
    const confession = api.commitDisplayName("O-03-03");
    harness.setNow(10000);
    const suppressionTimer = harness.pendingTimer(
      whiteNightConfessionSuppressionDelayMs,
    );
    assert(suppressionTimer !== undefined);
    harness.setNow(10000 + whiteNightConfessionSuppressionDelayMs);
    suppressionTimer!.callback();
    assertEquals(thirdAudio.volume, duckVolume);
    harness.setNow(10000 + whiteNightConfessionSuppressionDelayMs + 1000);
    harness.fireFrames();
    const volumeAtHalfFadeIn = thirdAudio.volume;
    assert(volumeAtHalfFadeIn > duckVolume && volumeAtHalfFadeIn < 1);
    assertStrictEquals(thirdAudio.loop, true);
    assertEquals(thirdAudio.pauseCount, 0);
    assertEquals(thirdAudio.currentTime, 5);
    harness.setNow(10000 + whiteNightConfessionSuppressionDelayMs + 2000);
    harness.fireFrames();
    assertEquals(thirdAudio.volume, 1);
    // 淡入 50% 处的采样等于 duck → 1.0 的线性插值中点。
    assert(Math.abs(volumeAtHalfFadeIn - (duckVolume + 1) / 2) < 1e-9);
    assertStrictEquals(thirdAudio.loop, false);
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
    assertStrictEquals(await confession, true);
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
      harness.setNow(whiteNightPreludeDurationMs);
      harness.fireFrames();
      const fadeAudio = harness.lastTrumpet()!;
      const audibleTimer = harness.pendingTimer(whiteNightStageMusicAudibleMs)!;
      assertEquals(fadeAudio.volume, 1);
      assert(audibleTimer !== undefined);
      fadeAudio.currentTime = 5;

      // 可听窗口结束，开始 1.0 → duck 目标音量的 1 秒淡出。
      harness.setNow(whiteNightFadeStartMs);
      audibleTimer.callback();
      assertEquals(fadeAudio.volume, 1);

      // 淡出进行到 50%（duck 目标可调，这里只记录采样值）。
      harness.setNow(whiteNightFadeStartMs + 500);
      harness.fireFrames();
      const volumeBeforeGesture = fadeAudio.volume;
      assert(volumeBeforeGesture < 1);

      const pauseCountBeforeGesture = fadeAudio.pauseCount;
      const playCountBeforeGesture = fadeAudio.playCount;
      assert(harness.dispatchDocument(gesture) > 0);

      // 用户手势只恢复播放权限：进行中的 fade 不被拉回 duck 目标音量。
      assertEquals(fadeAudio.volume, volumeBeforeGesture);
      assertStrictEquals(fadeAudio.muted, false);
      assertStrictEquals(fadeAudio.loop, true);
      assertEquals(fadeAudio.currentTime, 5);
      assertEquals(fadeAudio.pauseCount, pauseCountBeforeGesture);
      assert(fadeAudio.playCount > playCountBeforeGesture);
      assertEquals(harness.lastTrumpet(), fadeAudio);

      // 淡出进行到 75%：继续按同一线性公式下降，不出现跳变。
      harness.setNow(whiteNightFadeStartMs + 750);
      harness.fireFrames();
      const volumeAfterGesture = fadeAudio.volume;
      assert(volumeAfterGesture < volumeBeforeGesture);

      // 淡出正常收束到 duck 目标音量；同一条 Audio 未被替换，也未重新计时。
      harness.setNow(whiteNightFadeStartMs + 1000);
      harness.fireFrames();
      const duckVolume = fadeAudio.volume;
      assert(duckVolume > 0 && duckVolume < 1);
      assert(duckVolume < volumeAfterGesture);
      // 手势前后的两个采样满足 1.0 → duck 的线性插值（50% 与 75%）。
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

  // pointerdown 与 keydown 共用同一个 recovery handler，两者都保持当前音量。
  await runFadeOutInteraction("pointerdown");
  await runFadeOutInteraction("keydown");
});

Deno.test("WhiteNight death fade-in keeps the in-progress volume through user interaction", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    void api.handleAbnormalitySubmitted("T-03-46");
    harness.setNow(whiteNightPreludeDurationMs);
    harness.fireFrames();
    const fadeAudio = harness.lastTrumpet()!;
    const audibleTimer = harness.pendingTimer(whiteNightStageMusicAudibleMs)!;
    harness.setNow(whiteNightFadeStartMs);
    audibleTimer.callback();
    harness.setNow(whiteNightFadeStartMs + 1000);
    harness.fireFrames();
    const duckVolume = fadeAudio.volume;
    assert(duckVolume > 0 && duckVolume < 1);

    // WhiteNight 死亡：同一条曲目从 duck 目标音量开始 2 秒淡入。
    const confession = api.commitDisplayName("O-03-03");
    harness.setNow(10000);
    const suppressionTimer = harness.pendingTimer(
      whiteNightConfessionSuppressionDelayMs,
    )!;
    assert(suppressionTimer !== undefined);
    harness.setNow(10000 + whiteNightConfessionSuppressionDelayMs);
    suppressionTimer.callback();
    fadeAudio.currentTime = 5;

    // 淡入进行到一半（目标音量可调，这里只记录采样值）。
    harness.setNow(10000 + whiteNightConfessionSuppressionDelayMs + 1000);
    harness.fireFrames();
    const volumeBeforeGesture = fadeAudio.volume;
    assert(volumeBeforeGesture > duckVolume && volumeBeforeGesture < 1);

    const pauseCountBeforeGesture = fadeAudio.pauseCount;
    const playCountBeforeGesture = fadeAudio.playCount;
    assert(harness.dispatchDocument("pointerdown") > 0);

    // 淡入中途的用户交互同样只恢复播放权限，不改写当前音量。
    assertEquals(fadeAudio.volume, volumeBeforeGesture);
    assertStrictEquals(fadeAudio.muted, false);
    assertStrictEquals(fadeAudio.loop, true);
    assertEquals(fadeAudio.currentTime, 5);
    assertEquals(fadeAudio.pauseCount, pauseCountBeforeGesture);
    assert(fadeAudio.playCount > playCountBeforeGesture);
    assertEquals(harness.lastTrumpet(), fadeAudio);

    // 淡入继续正常收束：2000ms 后到 1.0，并退出 special hold。
    harness.setNow(10000 + whiteNightConfessionSuppressionDelayMs + 2000);
    harness.fireFrames();
    assertEquals(fadeAudio.volume, 1);
    // 淡入 50% 处的采样等于 duck → 1.0 的线性插值中点。
    assertEquals(
      Math.abs(volumeBeforeGesture - (duckVolume + 1) / 2) < 1e-9,
      true,
    );
    assertStrictEquals(fadeAudio.loop, false);
    assertEquals(fadeAudio.currentTime, 5);

    harness.setNow(
      10000 + whiteNightConfessionSuppressionDelayMs +
        whiteNightDeathSequenceDurationMs,
    );
    harness.pendingTimer(whiteNightDeathSequenceDurationMs)!.callback();
    assertStrictEquals(await confession, true);
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
      finishRestartPanelAnimation(harness.overlay());
      await restarting;
    };

    // A. 同级 Direct First：Prelude 期间普通仲裁保持同一条 Direct First，不静音。
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
    // Simple Advent 边界之后的第二阶段 BGM（Third）接管同级 Direct First。
    harness.setNow(whiteNightPreludeDurationMs);
    harness.fireFrames();
    assert(harness.lastTrumpet() !== equalDirectAudio);
    assert(equalDirectAudio.pauseCount > 0);
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

    // D. 低于阶段结算的 Direct Second：阶段 BGM（Third）接管，one-shot 不拦截。
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
  // 注释或字符串里出现这些名字（例如兼容读取的旧状态值）不算违规，
  // 因此只在去掉注释与字符串后的代码结构里检查标识符是否残留。
  const scriptCode = stripJavaScriptCommentsAndStrings(script);
  const whiteNightCode = stripJavaScriptCommentsAndStrings(whiteNight);
  const cssCode = stripCssComments(css);
  for (
    const forbidden of [
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
    ]
  ) {
    assert(!cssCode.includes(forbidden));
    assert(!whiteNightCode.includes(forbidden));
    assert(!scriptCode.includes(forbidden));
  }
  // 该标识只出现在持久化兼容读取处：把 ingame-effect-paused 迁移成普通播放。
  // 断言按语义匹配，不依赖源码使用单引号还是双引号。
  assert(
    /saved\.playbackState === ["']ingame-effect-paused["']/.test(script),
  );
  // 该状态只用于读取迁移，不写入持久化。
  assert(!(/\?\s*["']ingame-effect-paused["']/.test(script)));
  assert(
    /saved\.playbackState === ["']ingame-effect-paused["']\s*\?\s*["']normal-playing["']/
      .test(script),
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

    // Second 接管时 HUD 与音乐同时变化：四角节点只因一次状态更新重建一次。
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
    assert(harness.pendingTimer(5000) !== undefined);
    assertEquals(thirdAudio.pauseCount, 1);

    // 进入 WhiteNight Prelude：Simple Advent 不冻结 Alert，普通 replay gap 继续计时。
    void api.handleAbnormalitySubmitted("T-03-46");
    assertEquals(api.getDangerScore(), 100);
    assertEquals(api.getSpecialEvent(), "white-night");
    assertEquals(api.getSpecialEventPhase(), "prelude");
    const replayTimer = harness.pendingTimer(5000);
    assert(replayTimer !== undefined);
    assertEquals(harness.lastTrumpet(), thirdAudio);
    assertEquals(thirdAudio.pauseCount, 1);

    // gap 到期后按普通 Danger 规则重播 high-water 曲目，不被 Prelude 吞掉。
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
    assertEquals(savedSpecialEvent.preludeEndsAt, whiteNightPreludeDurationMs);
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
    // 恢复的普通 Alert 没有 INGAMEEFFECT Pause 状态，HUD 与播放都保持运行。
    assertEquals(
      requireByClass(harness.overlay()!, "lobotomy-corp-emergency-controller")
        .dataset.lobotomyCorpIngameEffectPaused,
      undefined,
    );
    // 媒体元数据就绪后从保存进度继续（不重头、不静音），并由普通 Alert 自行播放。
    resumedAudio.dispatch("loadedmetadata");
    assertEquals(resumedAudio.pauseCount, 0);
    assertEquals(resumedAudio.volume, 1);
    assertStrictEquals(resumedAudio.muted, false);
    assertStrictEquals(resumedAudio.loop, false);
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
    harness.setNow(whiteNightPreludeDurationMs);
    harness.fireFrames();
    const thirdAudio = harness.lastTrumpet()!;
    assertEquals(
      harness.pendingTimer(whiteNightStageMusicAudibleMs) !== undefined,
      true,
    );
    const audioCount = harness.AudioMock.items.length;

    const restarting = api.restartDay();
    assertEquals(
      harness.pendingTimer(whiteNightStageMusicAudibleMs),
      undefined,
    );
    finishRestartPanelAnimation(harness.overlay());
    await restarting;
    assertEquals(api.getDangerScore(), 0);
    assertEquals(api.getSpecialEvent(), undefined);
    const pausedPlayback = {
      pauseCount: thirdAudio.pauseCount,
      volume: thirdAudio.volume,
    };

    // 之后存活下来的计时器不会复活阶段音乐或改变媒体状态。
    harness.setNow(60000);
    harness.fireFrames();
    assertEquals(harness.AudioMock.items.length, audioCount);
    assert(thirdAudio.pauseCount > 0);
    assertEquals(thirdAudio.pauseCount, pausedPlayback.pauseCount);
    assertEquals(thirdAudio.volume, pausedPlayback.volume);
    assertEquals(
      harness.pendingTimer(whiteNightStageMusicAudibleMs),
      undefined,
    );
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
      finishRestartPanelAnimation(harness.overlay());
      await restarting;
    };

    // A. 外层更低：竞态兜底不重建会话，只保留内层已经建立的 Second。
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

Deno.test("DontTouchMe derives camera recoil from CameraMover and RecoilEffect", () => {
  // Main.unity 的 CameraMover：DefaultOrtho 8.5、recoil.scale 3、recoil.recoilCount 2。
  assertEquals(dontTouchMeRecoilAmplitudeRatio(), 3 / 17);
  // Recoil(level, maxTime) 的次数是 level × recoilCount × maxTime × 3。
  assertEquals(dontTouchMeRecoilArrowCount(2, 5), 60);
  assertEquals(dontTouchMeRecoilArrowCount(1, 3), 18);
  // PlayRecoil 在方向列表末尾再追加一次原始位置，因此间隔按次数 + 1 均分。
  assertEquals(dontTouchMeRecoilStepMs(2, 5), 5000 / 61);
  assertEquals(dontTouchMeRecoilStepMs(1, 3), 3000 / 19);
});

Deno.test("DontTouchMe plays one impact per click and only shuts down on the fifth", async () => {
  // 轮询数值 3 表示本 Day 有 3 个部门：满编共 15 人，全员死亡 15 × 4 = 60。
  const harness = installLobotomyCorpAlertHarness({pollingIntervalValue: "3"});
  const originalRandom = Math.random;
  try {
    // 固定选中 touchKill 分支，让两次点击的断言可预期。
    Math.random = () => 0.1;
    await harness.reload();
    const api = harness.api() as unknown as {
      blocksDisplayNameSave: (value: string) => boolean;
      getDangerScore: () => number;
      playDontTouchMe: () => Promise<void>;
    };
    const assetRoot = "/static/fun/lobotomy-corp/Assets";
    const effectVideos = () =>
      harness.createdElements().filter((element) =>
        element.className === dontTouchMeEffectVideoClassName
      );

    // 只有“别碰我”自身接管保存，其它异想体继续走通用彩蛋的保存流程。
    assertEquals(api.blocksDisplayNameSave("O-05-47"), true);
    assertEquals(api.blocksDisplayNameSave(" o-05-47 "), true);
    assertEquals(api.blocksDisplayNameSave("别碰我"), false);
    assertEquals(api.blocksDisplayNameSave("T-03-46"), false);
    assertEquals(api.blocksDisplayNameSave(""), false);

    // 前四次点击只播放效果演出与音效，不跳转、也不进入假关服。
    for (let click = 1; click <= 4; click++) {
      const playback = api.playDontTouchMe();
      const effectVideo = effectVideos().at(-1);
      assert(effectVideo);
      assertEquals(
        effectVideo.src,
        `${assetRoot}/${dontTouchMeKillEffect.videoPath}`,
      );
      effectVideo.dispatch("ended");
      await playback;
      // 全体员工死亡：部门数 3 × 满编 5 人 × 每名 +4 = 60，且不除以部门数。
      if (click === 1) assertEquals(api.getDangerScore(), 60);
      assertEquals(harness.assignedLocations().length, 0);
      assertEquals(
        harness.body.children.some((element) =>
          element.className === dontTouchMeKillEffect.extraClassName
        ),
        false,
      );
    }
    assertEquals(effectVideos().length, 4);
    assertEquals(
      AudioMock.items.filter((audio) => audio.src.includes("touch_dead")).length,
      4,
    );
    assertEquals(
      AudioMock.items.filter((audio) => audio.src.includes("touch_shout"))
        .length,
      0,
    );
    // 每次点击都按同一公式累加，最后由 Danger Score 的上限封顶。
    assertEquals(api.getDangerScore(), 100);

    // 第 5 次点击改为 ExitStart() → ForceExitScene：shout 先响，关服画面延后。
    const shutdown = api.playDontTouchMe();
    // 假关服开始后整页交互被拦截：再点保存或点导航栏都不会生效。
    assertEquals(harness.dispatchDocumentEvent("click").defaultPrevented, true);
    assertEquals(
      harness.dispatchDocumentEvent("submit").defaultPrevented,
      true,
    );
    // ExitStart() 的 Recoil(2, 5f)：1080px 视口的幅度是 1080 × 3/17 ≈ 190.588px，
    // 固定随机数选出左上方向，Unity 的 +y 在 CSS 里取反。
    const recoilAmplitude = Math.round((3 / 17) * 1080 * 1000) / 1000;
    assertEquals(
      harness.body.style.transform,
      `translate3d(${-recoilAmplitude}px, ${-recoilAmplitude}px, 0)`,
    );
    assertEquals(
      AudioMock.items.filter((audio) =>
        audio.src.endsWith(dontTouchMeShoutSoundPath)
      ).length,
      1,
    );
    assertEquals(
      harness.createdElements().some((element) =>
        element.className === dontTouchMeVideoClassName
      ),
      false,
    );

    harness.pendingTimer(dontTouchMeExitDelayMs)!.callback();

    const video = harness.createdElements().find((element) =>
      element.className === dontTouchMeVideoClassName
    );
    assert(video);
    assertEquals(video.src, `${assetRoot}/${dontTouchMeShutdownVideoPath}`);
    assertEquals(
      AudioMock.items.filter((audio) =>
        audio.src.endsWith(dontTouchMeShutdownSoundPath)
      ).length,
      1,
    );
    assert(findByClass(harness.body, dontTouchMeOverlayClassName));

    video.dispatch("ended");
    await shutdown;

    // 保存从未发生：演出结束后跳转错误页，用户返回时仍是修改前的名称。
    assertEquals(harness.assignedLocations(), [dontTouchMeExitPath]);
    // 关服即游戏崩溃：危急值清空、当天持久化状态一并清除，404 页面不会接着响警报。
    assertEquals(api.getDangerScore(), 0);
    assertEquals(harness.storage.getItem("warmnest.lobotomy-corp-day"), null);
    assertEquals(harness.dispatchDocumentEvent("click").defaultPrevented, false);
    assertEquals(
      harness.body.children.some((element) =>
        element.className === dontTouchMeOverlayClassName
      ),
      false,
    );
  } finally {
    Math.random = originalRandom;
    harness.restore();
  }
});

Deno.test("DontTouchMe derives escapable danger from Abnormalities.json", async () => {
  const harness = installLobotomyCorpAlertHarness({pollingIntervalValue: "3"});
  try {
    await harness.reload();
    const api = harness.api() as unknown as {
      escapeAllDangerContribution: (departmentCount: number) => number;
      escapableDangerSummary: () => {
        averageDanger: number;
        count: number;
        totalDanger: number;
      };
    };
    // Abnormalities.json 里 canBreach 为 true 的条目：40 只，总点数 1993。
    const summary = api.escapableDangerSummary();
    assertEquals(summary.count, 40);
    assertEquals(summary.totalDanger, 1993);
    assertEquals(summary.averageDanger, 1993 / 40);
    // 3 个部门容纳 12 只：12 × 平均基值 / 部门数。
    assertEquals(api.escapeAllDangerContribution(3), 12 * (1993 / 40) / 3);
    // 11 个部门容纳 48 只，但可出逃只有 40 只，因此按 40 只计。
    assertEquals(api.escapeAllDangerContribution(11), 40 * (1993 / 40) / 11);
    assertEquals(api.escapeAllDangerContribution(0), 0);
  } finally {
    harness.restore();
  }
});

Deno.test("DontTouchMe panics every worker with the original recoil and no sequence", async () => {
  const alertOverlay = new Element();
  const harness = installLobotomyCorpAlertHarness({
    alertOverlays: [alertOverlay],
    pollingIntervalValue: "3",
  });
  const originalRandom = Math.random;
  try {
    // 固定选中 PanicAllWorker 分支（三选一里的第 2 个）。
    Math.random = () => 0.5;
    await harness.reload();
    const api = harness.api() as unknown as {
      getDangerScore: () => number;
      playDontTouchMe: () => Promise<void>;
    };
    const playback = api.playDontTouchMe();

    // 这一支只有 panic 音效与镜头后坐，没有全屏序列，也不结算危急值。
    assertEquals(
      AudioMock.items.filter((audio) => audio.src.includes("touch_panic"))
        .length,
      1,
    );
    assertEquals(
      harness.createdElements().some((element) =>
        element.className === dontTouchMeEffectVideoClassName
      ),
      false,
    );
    // 全体员工恐慌：部门数 3 × 满编 5 人 × 每名 +2 = 30。
    assertEquals(api.getDangerScore(), 30);
    // CameraMover.Recoil(1, 3f)；固定随机数选出 RIGHTDOWN（x 为 +1、y 为 -1）。
    const recoilAmplitude = Math.round((3 / 17) * 1080 * 1000) / 1000;
    assertEquals(
      harness.body.style.transform,
      `translate3d(${recoilAmplitude}px, ${recoilAmplitude}px, 0)`,
    );
    // 警报 HUD 与“重新开始这一天”面板固定在视口上，用反向位移抵消抖动。
    assertEquals(
      alertOverlay.style.transform,
      `translate3d(${-recoilAmplitude}px, ${-recoilAmplitude}px, 0)`,
    );

    // 18 次方向切换，间隔 3000 / 19 毫秒；最后一次之后立即复位。
    const step = dontTouchMeRecoilStepMs(1, 3);
    for (let index = 1; index < dontTouchMeRecoilArrowCount(1, 3); index++) {
      harness.pendingTimer(step)!.callback();
    }
    await playback;
    assertEquals(harness.body.style.transform, "");
    assertEquals(alertOverlay.style.transform, "");
  } finally {
    Math.random = originalRandom;
    harness.restore();
  }
});

Deno.test("DontTouchMe escapes every abnormality with the WARNING sequence", async () => {
  const harness = installLobotomyCorpAlertHarness({pollingIntervalValue: "3"});
  const originalRandom = Math.random;
  try {
    // 固定选中 SetAllQliphothCounter 分支（三选一里的第 3 个）。
    Math.random = () => 0.9;
    await harness.reload();
    const api = harness.api() as unknown as {
      getDangerScore: () => number;
      playDontTouchMe: () => Promise<void>;
    };
    const playback = api.playDontTouchMe();

    assertEquals(
      AudioMock.items.filter((audio) => audio.src.includes("touch_moodDown"))
        .length,
      1,
    );
    const effectVideo = harness.createdElements().find((element) =>
      element.className === dontTouchMeEffectVideoClassName
    );
    assert(effectVideo);
    assertEquals(
      effectVideo.src,
      "/static/fun/lobotomy-corp/Assets/Resources/sprites/effect/touchwarning.webm",
    );
    // 全体员工出逃：3 个部门容纳 12 只，12 × (1993 / 40) / 3 ≈ 199.3，被 100 封顶。
    assertEquals(api.getDangerScore(), 100);

    effectVideo.dispatch("ended");
    await playback;
    assertEquals(harness.assignedLocations().length, 0);
  } finally {
    Math.random = originalRandom;
    harness.restore();
  }
});

Deno.test("DontTouchMe forgets clicks outside its ten-second window", async () => {
  const harness = installLobotomyCorpAlertHarness();
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.1;
    await harness.reload();
    const api = harness.api() as unknown as {
      playDontTouchMe: () => Promise<void>;
    };

    for (let click = 1; click <= 4; click++) {
      const playback = api.playDontTouchMe();
      const effectVideo = harness.createdElements().findLast((element) =>
        element.className === dontTouchMeEffectVideoClassName
      );
      assert(effectVideo);
      effectVideo.dispatch("ended");
      await playback;
    }

    // 超过 10 秒窗口后，第 5 次点击只播放演出，不进入假关服。
    harness.setNow(10001);
    const playback = api.playDontTouchMe();
    assertEquals(
      harness.createdElements().some((element) =>
        element.className === dontTouchMeVideoClassName
      ),
      false,
    );
    assertEquals(harness.assignedLocations().length, 0);
    const effectVideo = harness.createdElements().findLast((element) =>
      element.className === dontTouchMeEffectVideoClassName
    );
    assert(effectVideo);
    effectVideo.dispatch("ended");
    await playback;
    assertEquals(harness.assignedLocations().length, 0);
  } finally {
    Math.random = originalRandom;
    harness.restore();
  }
});
