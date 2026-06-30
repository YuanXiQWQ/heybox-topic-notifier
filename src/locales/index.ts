import { en } from "./en.ts";
import type { Locale, Messages } from "./types.ts";
import { zhCN } from "./zh-CN.ts";

const dictionaries: Record<Locale, Messages> = {
  "zh-CN": zhCN,
  en,
};

export function normalizeLocale(value: string | undefined): Locale {
  return value === "en" ? "en" : "zh-CN";
}

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}
