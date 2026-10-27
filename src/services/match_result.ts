/** @file 统一匹配结果的简短原因、类型和历史记录兼容规则。 */
import type { MatchResult } from "../models.ts";
import type { MatchingSettings } from "./matching_settings.ts";

/** AI 原因最多保留三十个 Unicode 字符，截断时包含省略号。 */
export const aiReasonLimit = 30;

/**
 * 将 AI 原因规范为有长度上限的单行文字。
 * @param {string} reason 模型原因。
 * @return {string} 简短原因。
 */
export function shortAiReason(reason: string): string {
  const chars = Array.from(reason.replace(/\s+/gu, " ").trim());
  return chars.length > aiReasonLimit
    ? chars.slice(0, aiReasonLimit - 1).join("") + "…"
    : chars.join("");
}

/**
 * 读取明确的匹配类型；缓存可按原判定模式归类，历史 AI 前缀记录的位置视为未记录。
 * @param {MatchResult} result 已存或新生成的匹配结果。
 * @param {MatchingSettings["mode"] | undefined} mode 缓存所属的匹配模式。
 * @return {MatchResult} 可直接展示并持久化的结果。
 */
export function normalizeMatchResult(
  result: MatchResult,
  mode?: MatchingSettings["mode"],
): MatchResult {
  const isAi = mode
    ? mode === "ai"
    : result.kind
    ? result.kind === "ai"
    : result.keyword.startsWith("AI: ");
  if (!isAi) {
    return {
      keyword: result.keyword,
      location: result.location,
      kind: "keyword",
    };
  }
  // 未带类型的 AI 记录将原因存于 AI: 前缀后，且没有可信的来源位置。
  return {
    kind: "ai",
    keyword: "",
    aiReason: shortAiReason(
      result.aiReason ?? result.keyword.replace(/^AI: /, ""),
    ),
    location: result.kind === "ai" ? result.location : "unknown",
  };
}
