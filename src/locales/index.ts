/**
 * @file 本文件负责加载、归一化并合并应用的多语言文案。
 */
import { isLocale, type Locale, type Messages } from "./types.ts";
import arSA from "./lang/ar-SA.json" with { type: "json" };
import bnBD from "./lang/bn-BD.json" with { type: "json" };
import deDE from "./lang/de-DE.json" with { type: "json" };
import enCA from "./lang/en-CA.json" with { type: "json" };
import enGB from "./lang/en-GB.json" with { type: "json" };
import enUS from "./lang/en-US.json" with { type: "json" };
import esES from "./lang/es-ES.json" with { type: "json" };
import faIR from "./lang/fa-IR.json" with { type: "json" };
import frFR from "./lang/fr-FR.json" with { type: "json" };
import heIL from "./lang/he-IL.json" with { type: "json" };
import hiIN from "./lang/hi-IN.json" with { type: "json" };
import idID from "./lang/id-ID.json" with { type: "json" };
import itIT from "./lang/it-IT.json" with { type: "json" };
import jaJP from "./lang/ja-JP.json" with { type: "json" };
import koKR from "./lang/ko-KR.json" with { type: "json" };
import ptBR from "./lang/pt-BR.json" with { type: "json" };
import ptPT from "./lang/pt-PT.json" with { type: "json" };
import ruRU from "./lang/ru-RU.json" with { type: "json" };
import thTH from "./lang/th-TH.json" with { type: "json" };
import trTR from "./lang/tr-TR.json" with { type: "json" };
import urPK from "./lang/ur-PK.json" with { type: "json" };
import viVN from "./lang/vi-VN.json" with { type: "json" };
import zhCN from "./lang/zh-CN.json" with { type: "json" };
import zhHK from "./lang/zh-HK.json" with { type: "json" };
import zhMO from "./lang/zh-MO.json" with { type: "json" };
import zhSG from "./lang/zh-SG.json" with { type: "json" };
import zhTW from "./lang/zh-TW.json" with { type: "json" };

/**
 * 基础语言文案，作为其它语言缺失字段时的兜底内容。
 */
const baseMessages: Messages = zhCN;

/**
 * 各语言相对基础文案的覆盖内容。
 */
const overrides: Record<Locale, Partial<Messages>> = {
  "zh-CN": {},
  "zh-TW": zhTW,
  "zh-HK": zhHK,
  "zh-MO": zhMO,
  "zh-SG": zhSG,
  "en-US": enUS,
  "en-CA": enCA,
  "en-GB": enGB,
  "ja-JP": jaJP,
  "ko-KR": koKR,
  "fr-FR": frFR,
  "de-DE": deDE,
  "es-ES": esES,
  "it-IT": itIT,
  "pt-BR": ptBR,
  "pt-PT": ptPT,
  "ru-RU": ruRU,
  "ar-SA": arSA,
  "hi-IN": hiIN,
  "bn-BD": bnBD,
  "fa-IR": faIR,
  "he-IL": heIL,
  "ur-PK": urPK,
  "vi-VN": viVN,
  "th-TH": thTH,
  "id-ID": idID,
  "tr-TR": trTR,
};

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
 * 未翻译完成时优先使用英文兜底的语言集合。
 */
const englishFallbackLocales: ReadonlySet<Locale> = new Set([
  "en-US",
  "en-CA",
  "en-GB",
  "ja-JP",
  "ko-KR",
  "fr-FR",
  "de-DE",
  "es-ES",
  "it-IT",
  "pt-BR",
  "pt-PT",
  "ru-RU",
  "ar-SA",
  "hi-IN",
  "bn-BD",
  "fa-IR",
  "he-IL",
  "ur-PK",
  "vi-VN",
  "th-TH",
  "id-ID",
  "tr-TR",
]);

/**
 * 按语言标识小写形式建立的精确语言映射。
 */
const normalizedLocaleMap: ReadonlyMap<string, Locale> = new Map(
  Object.keys(overrides).map((locale) => [locale.toLowerCase(), locale as Locale]),
);

/**
 * 获取指定语言需要叠加的文案覆盖链。
 *
 * @param locale 语言标识。
 * @return 文案覆盖链。
 */
function messageOverridesFor(locale: Locale): Partial<Messages>[] {
  const localeMessages = overrides[locale];
  if (locale === "en-US") {
    return [localeMessages];
  }
  if (englishFallbackLocales.has(locale)) {
    return [enUS, localeMessages];
  }
  return [localeMessages];
}

/**
 * 将外部传入的语言值归一化为应用支持的语言标识。
 *
 * @param value 待归一化的语言值。
 * @return 应用支持的语言标识。
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
  return normalizedLocaleMap.get(lowerCaseValue) ?? localeAliases[lowerCaseValue] ?? "zh-CN";
}

/**
 * 获取指定语言的完整文案配置。
 *
 * @param locale 需要获取文案的语言标识。
 * @return 合并兜底内容后的完整文案配置。
 */
export function getMessages(locale: Locale): Messages {
  return mergeMessages(...messageOverridesFor(locale));
}

/**
 * 将局部文案覆盖到基础文案上，生成完整文案配置。
 *
 * @param overrides 需要覆盖基础文案的局部文案配置。
 * @return 合并后的完整文案配置。
 */
export function mergeMessages(...overrides: Partial<Messages>[]): Messages {
  return {
    ...baseMessages,
    ...Object.assign({}, ...overrides),
  };
}
