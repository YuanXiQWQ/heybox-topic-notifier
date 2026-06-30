import type { Locale, Messages } from "./types.ts";
import en from "./en.json" with { type: "json" };
import zhCN from "./zh-CN.json" with { type: "json" };

const baseMessages: Messages = zhCN;

const overrides: Record<Locale, Partial<Messages>> = {
  "zh-CN": {},
  en,
};

export function normalizeLocale(value: string | undefined): Locale {
  return value === "en" ? "en" : "zh-CN";
}

export function getMessages(locale: Locale): Messages {
  return mergeMessages(overrides[locale]);
}

export function mergeMessages(override: Partial<Messages>): Messages {
  return {
    ...baseMessages,
    ...override,
  };
}
