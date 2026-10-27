/** @file 定义匹配模式、AI 调用限制和缓存设置的默认值与规范化规则。 */
import {
  type AiProvider,
  aiProviders,
  normalizeAiProvider,
} from "./ai_providers.ts";
export type MatchingSettings = {
  mode: "rules" | "ai" | "hybrid";
  provider: AiProvider;
  apiUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
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
