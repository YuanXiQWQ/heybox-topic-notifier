/**
 * @file 本文件定义应用中可供用户选择的语言选项。
 */
import type { Locale } from "./types.ts";

/**
 * 语言选择项结构。
 */
export type LanguageOption = {
  /**
   * 语言标识。
   */
  code: Locale;
  /**
   * 展示给用户的语言名称。
   */
  label: string;
};

/**
 * 应用支持的语言选择项列表。
 */
export const languageOptions: LanguageOption[] = [
  {
    code: "zh-CN",
    label: "简体中文",
  },
  {
    code: "zh-TW",
    label: "正體中文（臺灣）",
  },
  {
    code: "zh-HK",
    label: "繁體中文（香港）",
  },
  {
    code: "zh-MO",
    label: "繁體中文（澳門）",
  },
  {
    code: "zh-SG",
    label: "简体中文（新加坡）",
  },
  {
    code: "en",
    label: "English",
  },
  {
    code: "en-CA",
    label: "English (Canada)",
  },
  {
    code: "en-GB",
    label: "English (UK)",
  },
  {
    code: "ja-JP",
    label: "日本語",
  },
  {
    code: "ko-KR",
    label: "한국어",
  },
  {
    code: "fr-FR",
    label: "Français",
  },
  {
    code: "de-DE",
    label: "Deutsch",
  },
  {
    code: "es-ES",
    label: "Español",
  },
  {
    code: "it-IT",
    label: "Italiano",
  },
  {
    code: "pt-BR",
    label: "Português (Brasil)",
  },
  {
    code: "pt-PT",
    label: "Português (Portugal)",
  },
  {
    code: "ru-RU",
    label: "Русский",
  },
  {
    code: "ar-SA",
    label: "العربية",
  },
  {
    code: "hi-IN",
    label: "हिन्दी",
  },
  {
    code: "bn-BD",
    label: "বাংলা",
  },
  {
    code: "fa-IR",
    label: "فارسی",
  },
  {
    code: "he-IL",
    label: "עברית",
  },
  {
    code: "ur-PK",
    label: "اردو",
  },
  {
    code: "vi-VN",
    label: "Tiếng Việt",
  },
  {
    code: "th-TH",
    label: "ไทย",
  },
  {
    code: "id-ID",
    label: "Bahasa Indonesia",
  },
  {
    code: "tr-TR",
    label: "Türkçe",
  },
];
