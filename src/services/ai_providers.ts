/** @file 定义 AI 公司接口和模型思考参数，供模型选择与分类请求共享。 */

/** 内置公司的公开接口；自定义配置保留用户填写的兼容接口地址。 */
export const aiProviders = [
  { id: "deepseek", name: "DeepSeek", url: "https://api.deepseek.com" },
  { id: "openai", name: "OpenAI", url: "https://api.openai.com/v1" },
  { id: "custom", name: "", url: "" },
] as const;

/** 支持的公司配置标识。 */
export type AiProvider = typeof aiProviders[number]["id"];

/**
 * 将外部公司标识约束为支持的值，未指定公司的已有配置使用自定义接口。
 * @param {unknown} value 公司标识。
 * @return {AiProvider} 有效标识。
 */
export function normalizeAiProvider(value: unknown): AiProvider {
  return aiProviders.find((provider) => provider.id === value)?.id ?? "custom";
}

/**
 * 判断模型是否支持用户开关思考模式；必须思考的模型不提供开关。
 * @param {string} model 模型标识。
 * @return {boolean} 是否支持切换。
 */
export function supportsThinkingToggle(model: string): boolean {
  return thinkingProtocol(model) !== undefined;
}

/**
 * 识别具有明确可切换思考参数的模型系列。
 * @param {string} model 模型标识。
 * @return {string | undefined} 思考参数协议。
 */
function thinkingProtocol(
  model: string,
): "thinking" | "effort" | "enable" | undefined {
  if (/^deepseek-(flash|v4(?:-flash|-pro)?)(?:$|-)/i.test(model)) {
    return "thinking";
  }
  if (
    /^gpt-(?:5\.[12456](?:$|-)|6-(?:sol|luna)(?:$|-)|6\.1-terra(?:$|-))/i.test(
      model,
    ) && !/chat|codex|pro/i.test(model)
  ) return "effort";
  if (
    /^qwen3(?:-\d+b(?:-a\d+b)?|\.6-(?:plus|flash)|\.7-(?:max|plus|flash)|\.8-(?:max|flash))(?:$|-)/i
      .test(model) &&
    !/thinking|instruct/i.test(model)
  ) return "enable";
  return undefined;
}

/**
 * 根据模型能力构建思考及输出限制参数，未知模型不发送供应商专用参数。
 * @param {string} model 模型标识。
 * @param {boolean} disabled 是否优先关闭思考。
 * @param {number} limit 输出 token 上限。
 * @return {Record<string, unknown>} 分类请求参数。
 */
export function aiGenerationParameters(
  model: string,
  disabled: boolean,
  limit: number,
): Record<string, unknown> {
  const protocol = thinkingProtocol(model);
  const openaiReasoning = /^gpt-[56](?:\.|-|$)|^o[134](?:-|$)/i.test(model);
  const result: Record<string, unknown> = openaiReasoning
    ? { max_completion_tokens: limit }
    : { max_tokens: limit };
  if (protocol === "thinking") {
    result.thinking = { type: disabled ? "disabled" : "enabled" };
  }
  if (protocol === "enable") result.enable_thinking = !disabled;
  if (protocol === "effort") {
    result.reasoning_effort = disabled ? "none" : "low";
  }
  // 强制思考系列使用最低可用档位，避免发送不支持的 none。
  if (!protocol && openaiReasoning && !/chat|codex|pro/i.test(model)) {
    result.reasoning_effort = "low";
  }
  return result;
}
