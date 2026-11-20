/** @file 定义匹配模式、AI 调用限制和缓存设置的默认值与规范化规则。 */
import {
  type AiProvider,
  aiProviders,
  normalizeAiProvider,
} from "./ai_providers.ts";
/** 由历史帖子摘录的反例，链接与话题备注仅供设置页显示。 */
export type MatchingCounterexample = {
  addedAt: number;
  id: string;
  topicId: string;
  topicNote: string;
  url: string;
  title: string;
  source: "title" | "body" | "comments" | "replies";
  excerpt: string;
  reason: string;
};
export type MatchingSettings = {
  mode: "rules" | "ai" | "hybrid";
  provider: AiProvider;
  apiUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  counterexamples: MatchingCounterexample[];
  includeComments: boolean;
  disableThinking: boolean;
  dailyLimit: number;
  maxInputChars: number;
  maxOutputTokens: number;
  cacheMaxEntries: number;
  inputPrice: number;
  outputPrice: number;
};

/** 默认规则模式不产生任何 AI 请求；金额单价以每百万 token 的人民币计。 */
export const defaultMatchingSettings: MatchingSettings = {
  mode: "rules",
  provider: "custom",
  apiUrl: "",
  apiKey: "",
  model: "",
  prompt:
    "判断帖子作者是否正在寻求游戏方面的帮助，包括关卡、操作、安装、报错或故障。经验分享、攻略教学、闲聊、引用他人的问题以及明确已解决的问题不算求助。仅有模糊标题且缺少上下文时返回信息不足。",
  includeComments: false,
  counterexamples: [],
  disableThinking: true,
  dailyLimit: 500,
  maxInputChars: 3000,
  maxOutputTokens: 160,
  cacheMaxEntries: 10000,
  inputPrice: 0,
  outputPrice: 0,
};

/**
 * 合并并限制外部匹配设置，避免异常配置产生无限请求或超大输入。
 * @param {Partial<MatchingSettings>} value 外部设置。
 * @return {MatchingSettings} 有界且完整的匹配设置。
 */
export function normalizeMatchingSettings(
  value?: Partial<MatchingSettings>,
): MatchingSettings {
  const settings = { ...defaultMatchingSettings, ...value };
  const provider = normalizeAiProvider(settings.provider);
  return {
    provider,
    mode: settings.mode === "ai" || settings.mode === "hybrid"
      ? settings.mode
      : "rules",
    apiUrl: provider === "custom"
      ? String(settings.apiUrl ?? "").trim().slice(0, 2048)
      : aiProviders.find((entry) => entry.id === provider)!.url,
    apiKey: String(settings.apiKey ?? "").trim().slice(0, 4096),
    model: String(settings.model ?? "").trim().slice(0, 200),
    prompt: String(settings.prompt ?? "").trim().slice(0, 6000),
    counterexamples: normalizeCounterexamples(settings.counterexamples),
    includeComments: settings.includeComments === true,
    disableThinking: settings.disableThinking === true,
    dailyLimit: boundedNumber(settings.dailyLimit, 1, 10000, 500),
    maxInputChars: boundedNumber(settings.maxInputChars, 200, 8000, 3000),
    maxOutputTokens: boundedNumber(settings.maxOutputTokens, 64, 1024, 160),
    cacheMaxEntries: boundedNumber(settings.cacheMaxEntries, 100, 50000, 10000),
    inputPrice: boundedNumber(settings.inputPrice, 0, 100000, 0, false),
    outputPrice: boundedNumber(settings.outputPrice, 0, 100000, 0, false),
  };
}

/**
 * 校验反例快照并按帖子去重，保留正在修改注释的样本。
 * @param {unknown} raw 外部输入。
 * @return {MatchingCounterexample[]} 可随配置保存的反例。
 */
function normalizeCounterexamples(raw: unknown): MatchingCounterexample[] {
  const unique = new Map<string, MatchingCounterexample>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (
      !item || typeof item.id !== "string" || !item.id || unique.has(item.id)
    ) continue;
    unique.set(item.id, {
      addedAt: Number.isSafeInteger(item.addedAt) ? item.addedAt : 0,
      id: item.id,
      title: String(item.title ?? ""),
      topicId: String(item.topicId ?? ""),
      topicNote: String(item.topicNote ?? ""),
      url: /^https?:\/\//i.test(item.url) ? String(item.url) : "",
      source: ["title", "comments", "replies"].includes(item.source)
        ? item.source
        : "body",
      excerpt: String(item.excerpt ?? "").slice(0, 2000),
      reason: String(item.reason ?? "").slice(0, 1000),
    });
  }
  return [...unique.values()];
}

/**
 * 将数值约束在合法范围，非法值使用默认值。
 * @param {unknown} value 输入值。
 * @param {number} min 下限。
 * @param {number} max 上限。
 * @param {number} fallback 默认值。
 * @param {boolean} integer 是否取整数。
 * @return {number} 规范化数值。
 */
function boundedNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
  integer = true,
): number {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, integer ? Math.floor(number) : number))
    : fallback;
}
