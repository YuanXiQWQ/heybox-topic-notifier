/**
 * @file 本文件负责加载、归一化并合并应用的多语言文案。
 */
import type { Locale, Messages } from "./types.ts";
import en from "./en.json" with { type: "json" };
import zhCN from "./zh-CN.json" with { type: "json" };

/**
 * 基础语言文案，作为其它语言缺失字段时的兜底内容。
 */
const baseMessages: Messages = zhCN;

/**
 * 各语言相对基础文案的覆盖内容。
 */
const overrides: Record<Locale, Partial<Messages>> = {
  "zh-CN": {},
  en,
};

/**
 * 将外部传入的语言值归一化为应用支持的语言标识。
 *
 * @param value 待归一化的语言值。
 * @return 应用支持的语言标识。
 */
export function normalizeLocale(value: string | undefined): Locale {
  return value === "en" ? "en" : "zh-CN";
}

/**
 * 获取指定语言的完整文案配置。
 *
 * @param locale 需要获取文案的语言标识。
 * @return 合并兜底内容后的完整文案配置。
 */
export function getMessages(locale: Locale): Messages {
  return mergeMessages(overrides[locale]);
}

/**
 * 将局部文案覆盖到基础文案上，生成完整文案配置。
 *
 * @param override 需要覆盖基础文案的局部文案配置。
 * @return 合并后的完整文案配置。
 */
export function mergeMessages(override: Partial<Messages>): Messages {
  return {
    ...baseMessages,
    ...override,
  };
}
