/**
 * @file 本文件用于验证多语言文案合并和兜底逻辑。
 */
import { getMessages, mergeMessages, normalizeLocale } from "./index.ts";
import type { Messages } from "./types.ts";

/**
 * 验证英文文案缺失字段时会回退到简体中文文案。
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
    throw new Error(`Expected fallback settingsTitle, got ${merged.settingsTitle}`);
  }
});

/**
 * 验证新语言在未翻译时按预期使用兜底文案。
 */
Deno.test("regional and untranslated messages use locale fallback chain", () => {
  const zhCN = getMessages("zh-CN");
  const en = getMessages("en");

  if (getMessages("zh-TW").settingsTitle !== zhCN.settingsTitle) {
    throw new Error("Expected Traditional Chinese placeholder to fall back to Simplified Chinese");
  }

  if (getMessages("en-GB").settingsTitle !== en.settingsTitle) {
    throw new Error("Expected English regional placeholder to fall back to English");
  }

  if (getMessages("de-DE").settingsTitle !== en.settingsTitle) {
    throw new Error("Expected untranslated non-Chinese locale to fall back to English");
  }
});

/**
 * 验证常见浏览器语言标签能归一化到项目语言。
 */
Deno.test("normalizeLocale maps aliases and browser language tags", () => {
  const cases: Array<[string | undefined, ReturnType<typeof normalizeLocale>]> = [
    [undefined, "zh-CN"],
    ["en-US", "en"],
    ["zh-Hant-HK", "zh-HK"],
    ["zh-Hans-SG", "zh-SG"],
    ["ja", "ja-JP"],
    ["unknown", "zh-CN"],
  ];

  for (const [input, expected] of cases) {
    const actual = normalizeLocale(input);
    if (actual !== expected) {
      throw new Error(`Expected ${String(input)} to normalize to ${expected}, got ${actual}`);
    }
  }
});
