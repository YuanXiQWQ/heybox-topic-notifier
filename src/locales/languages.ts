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
    code: "en",
    label: "English",
  },
];
