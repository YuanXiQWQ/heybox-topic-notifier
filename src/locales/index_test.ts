/**
 * @file 本文件用于验证多语言文案合并和兜底逻辑。
 */
import {
  getMessages,
  localeFromRequest,
  mergeMessages,
  normalizeLocale,
} from "./index.ts";
import type { Messages } from "./types.ts";

/**
 * 验证美式英文文案缺失字段时会回退到简体中文文案。
 */
Deno.test("English messages fall back to Simplified Chinese for missing keys", () => {
  const zhCN = getMessages("zh-CN");
  const partialEnglish: Partial<Messages> = {
    appName: "Test App",
  };
  const merged = mergeMessages(partialEnglish);

  if (merged.appName !== "Test App") {
    throw new Error(`Expected override appName, got ${merged.appName}`);
  }

  if (merged.settingsTitle !== zhCN.settingsTitle) {
    throw new Error(
      `Expected fallback settingsTitle, got ${merged.settingsTitle}`,
    );
  }
});

/**
 * 验证新语言在未翻译时按预期使用兜底文案。
 */
Deno.test("regional and untranslated messages use locale fallback chain", () => {
  const zhTW = getMessages("zh-TW");
  const enUS = getMessages("en-US");

  if (zhTW.settingsTitle !== "設定") {
    throw new Error("Expected Traditional Chinese settings title");
  }

  if (getMessages("en-GB").settingsTitle !== enUS.settingsTitle) {
    throw new Error(
      "Expected English regional placeholder to fall back to American English",
    );
  }

  if (getMessages("de-DE").settingsTitle !== "Einstellungen") {
    throw new Error("Expected German settings title");
  }
});

/**
 * 验证所有受支持语言都显式提供原游戏的 RestartButton 文案。
 */
Deno.test("Lobotomy Corporation restart text is explicit for every locale", () => {
  const restartTexts = {
    "ar-SA": "Rewind to the Memory Repository.",
    "bn-BD": "Rewind to the Memory Repository.",
    "de-DE": "Rewind to the Memory Repository.",
    "en-CA": "Rewind to the Memory Repository.",
    "en-GB": "Rewind to the Memory Repository.",
    "en-US": "Rewind to the Memory Repository.",
    "es-ES": "Volver al Repositorio de Memoria",
    "fa-IR": "Rewind to the Memory Repository.",
    "fr-FR": "Retourner à l'Ancrage Mémoriel",
    "he-IL": "Rewind to the Memory Repository.",
    "hi-IN": "Rewind to the Memory Repository.",
    "id-ID": "Rewind to the Memory Repository.",
    "it-IT": "Rewind to the Memory Repository.",
    "ja-JP": "再挑戦",
    "ko-KR": "재도전",
    "pt-BR": "Retroceder ao Repositório de Memória.",
    "pt-PT": "Voltar através do Repositório de Memórias",
    "ru-RU": "Возврат к точке сохранения",
    "th-TH": "Rewind to the Memory Repository.",
    "tr-TR": "Rewind to the Memory Repository.",
    "ur-PK": "Rewind to the Memory Repository.",
    "vi-VN": "Trở về kho bộ nhớ",
    "zh-CN": "重新开始这一天",
    "zh-HK": "從紀錄點重新開始",
    "zh-MO": "從紀錄點重新開始",
    "zh-SG": "重新开始这一天",
    "zh-TW": "從紀錄點重新開始",
  } as const;

  for (const [locale, expected] of Object.entries(restartTexts)) {
    const actual = getMessages(locale as keyof typeof restartTexts)
      .lobotomyCorpRestartDay;
    if (actual !== expected) {
      throw new Error(`Expected ${locale} restart text ${expected}, got ${actual}`);
    }
  }
});

/**
 * 验证常见浏览器语言标签能归一化到项目语言。
 */
Deno.test("normalizeLocale maps aliases and browser language tags", () => {
  const cases: Array<[string | undefined, ReturnType<typeof normalizeLocale>]> =
    [
      [undefined, "zh-CN"],
      ["en-US", "en-US"],
      ["zh-Hant-HK", "zh-HK"],
      ["zh-Hans-SG", "zh-SG"],
      ["ja", "ja-JP"],
      ["unknown", "zh-CN"],
    ];

  for (const [input, expected] of cases) {
    const actual = normalizeLocale(input);
    if (actual !== expected) {
      throw new Error(
        `Expected ${String(input)} to normalize to ${expected}, got ${actual}`,
      );
    }
  }
});

/**
 * 验证请求语言优先使用查询参数，并支持浏览器语言回退。
 */
Deno.test("localeFromRequest resolves query and browser language", () => {
  const queryLocale = localeFromRequest(
    new Request("http://localhost/settings?locale=ja-JP", {
      headers: { "accept-language": "en-GB,en;q=0.9" },
    }),
  );
  const browserLocale = localeFromRequest(
    new Request("http://localhost/settings", {
      headers: { "accept-language": "fr-CA,fr;q=0.9" },
    }),
  );

  if (queryLocale !== "ja-JP") {
    throw new Error(`Expected query locale ja-JP, got ${queryLocale}`);
  }
  if (browserLocale !== "fr-FR") {
    throw new Error(`Expected browser locale fr-FR, got ${browserLocale}`);
  }
});
