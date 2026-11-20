/** @file 定义匹配模式、AI 调用限制和缓存设置的默认值与规范化规则。 */
import type { TopicPost } from "../models.ts";
import {
  type AiProvider,
  aiProviders,
  normalizeAiProvider,
} from "./ai_providers.ts";
/** 历史帖子的原始快照与排除原因。旧反例需从历史补齐原帖。 */
export type MatchingCounterexample = {
  addedAt: number;
  id: string;
  topicId: string;
  topicNote: string;
  url: string;
  title: string;
  post?: TopicPost;
  reason: string;
  /** 历史表格展示的纯文本正文。 */
  body?: string;
  details?: {
    publishedAt: string;
    matchedAt: string;
    kind: "ai" | "keyword";
    value: string;
    location: string;
    /** 混合模式下同时记录的 AI 判定。 */
    ai?: { reason: string; location: string };
  };
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
      ...(typeof item.body === "string" ? { body: item.body } : {}),
      ...(item.details && typeof item.details === "object"
        ? {
          details: {
            publishedAt: String(item.details.publishedAt ?? ""),
            matchedAt: String(item.details.matchedAt ?? ""),
            kind: item.details.kind === "ai" ? "ai" : "keyword",
            value: String(item.details.value ?? ""),
            location: String(item.details.location ?? ""),
            ...(typeof item.details.ai?.reason === "string"
              ? { ai: { reason: item.details.ai.reason, location: String(item.details.ai.location ?? "unknown") } }
              : {}),
          },
        }
        : {}),
      addedAt: Number.isSafeInteger(item.addedAt) ? item.addedAt : 0,
      id: item.id,
      title: String(item.title ?? ""),
      topicId: String(item.topicId ?? ""),
      topicNote: String(item.topicNote ?? ""),
      url: /^https?:\/\//i.test(item.url) ? String(item.url) : "",
      ...(item.post?.id === item.id && isCounterexamplePost(item.post)
        ? { post: item.post }
        : {}),
      reason: String(item.reason ?? "").slice(0, 1000),
    });
  }
  return [...unique.values()];
}

/**
 * 验证历史帖子包含全部原始字段，避免将缺少正文或评论的摘录当作原帖。
 * @param {unknown} value 待保存的帖子快照。
 * @return {boolean} 是否为可发送的原帖。
 */
function isCounterexamplePost(value: unknown): value is TopicPost {
  if (!value || typeof value !== "object") return false;
  const post = value as Record<string, unknown>;
  return ["id", "title", "body", "excerpt", "url", "publishedAt"].every(
    (key) => typeof post[key] === "string",
  ) && [post.comments, post.commentReplies].every((list) =>
    Array.isArray(list) && list.every((entry) => typeof entry === "string")
  );
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
