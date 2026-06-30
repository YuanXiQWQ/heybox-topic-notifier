import type { Locale } from "./types.ts";

export type LanguageOption = {
  code: Locale;
  label: string;
};

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
