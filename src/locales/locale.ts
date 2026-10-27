/**
 * @file 本文件提供不依赖翻译文案的语言标识归一化与请求语言选择。
 */
import { isLocale, type Locale, locales } from "./types.ts";

/**
 * 外部常见语言标签到项目语言标识的映射。
 */
const localeAliases: Record<string, Locale> = {
  ar: "ar-SA",
  bn: "bn-BD",
  de: "de-DE",
  en: "en-US",
  es: "es-ES",
  fa: "fa-IR",
  fr: "fr-FR",
  he: "he-IL",
  hi: "hi-IN",
  id: "id-ID",
  it: "it-IT",
  ja: "ja-JP",
  ko: "ko-KR",
  pt: "pt-PT",
  ru: "ru-RU",
  th: "th-TH",
  tr: "tr-TR",
  ur: "ur-PK",
  vi: "vi-VN",
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  "zh-hans": "zh-CN",
  "zh-hans-cn": "zh-CN",
  "zh-hans-sg": "zh-SG",
  "zh-hant": "zh-TW",
  "zh-hant-hk": "zh-HK",
  "zh-hant-mo": "zh-MO",
  "zh-hant-tw": "zh-TW",
};

/**
 * 按语言标识小写形式建立的精确语言映射。
 */
const normalizedLocaleMap: ReadonlyMap<string, Locale> = new Map(
  locales.map((
    locale,
  ) => [locale.toLowerCase(), locale]),
);

/**
 * 将外部传入的语言值归一化为应用支持的语言标识。
 *
 * @param {string | undefined} value 待归一化的语言值。
 * @return {Locale} 应用支持的语言标识。
 */
export function normalizeLocale(value: string | undefined): Locale {
  const normalized = value?.trim();
  if (!normalized) {
    return "zh-CN";
  }
  if (isLocale(normalized)) {
    return normalized;
  }
  const lowerCaseValue = normalized.toLowerCase();
  return normalizedLocaleMap.get(lowerCaseValue) ??
    localeAliases[lowerCaseValue] ?? "zh-CN";
}

/**
 * 从请求查询参数和浏览器语言头中解析应用支持的语言。
 *
 * @param {Request} request 当前 HTTP 请求。
 * @param {Locale} fallback 无法识别请求语言时使用的兜底语言。
 * @return {Locale} 应用支持的语言标识。
 */
export function localeFromRequest(
  request: Request,
  fallback: Locale = "zh-CN",
): Locale {
  const url = new URL(request.url);
  const queryLocale = supportedLocaleFromLanguageTag(
    url.searchParams.get("locale"),
  );
  if (queryLocale) {
    return queryLocale;
  }

  for (const part of request.headers.get("accept-language")?.split(",") ?? []) {
    const locale = supportedLocaleFromLanguageTag(part.split(";")[0]?.trim());
    if (locale) {
      return locale;
    }
  }

  return fallback;
}

/**
 * 将外部语言标签匹配为应用支持的语言。
 *
 * @param {string | null | undefined} value 原始语言标签。
 * @return {Locale | undefined} 匹配到的语言标识，无法匹配时返回 undefined。
 */
function supportedLocaleFromLanguageTag(
  value: string | null | undefined,
): Locale | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  return normalizedLocaleMap.get(normalized) ??
    localeAliases[normalized] ??
    localeAliases[normalized.split("-")[0]];
}
