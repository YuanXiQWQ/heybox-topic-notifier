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
      voiceLocale: () => string;
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
      "なるほどう りゅういち",
      "りゅういちなるほどう",
      "Apollo Justice",
      "法介王泥喜",
      "おどろきほうすけ",
      "Athena Cykes",
      "心音 希月",
      "きづき ここね",
      "Miles Edgeworth",
      "怜侍御剑",
      "みつるぎれいじ",
      "Mia Fey",
      "千尋綾里",
      "あやさと ちひろ",
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
      ["zh-HK", "zh"],
      ["ja-JP", "jp"],
      ["en-GB", "en"],
      ["de-DE", "en"],
    ].forEach(([locale, expected]) => {
      documentMock.documentElement.lang = locale;
      assertEquals(api.voiceLocale(), expected);
    });
  } finally {
    Object.defineProperty(browserGlobal, "document", {
      configurable: true,
      value: originalDocument,
    });
    delete browserGlobal.usernameEasterEgg;
  }
});
