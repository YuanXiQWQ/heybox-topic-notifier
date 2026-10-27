/** @file 安全获取供应商模型列表，不执行推理或记录密钥。 */
import { aiEndpoint, type AiMatcherOptions } from "./ai_matcher.ts";
import { supportsThinkingToggle } from "./ai_providers.ts";
import type { MatchingSettings } from "./matching_settings.ts";
import { validateResolvedOutboundHost } from "./outbound_security.ts";

/** 返回给模型选择器的公开模型信息。 */
export type AiModelOption = { id: string; thinking: boolean };

/**
 * 获取可用于文本分类的模型，限制请求时长、响应大小和列表长度。
 * @param {MatchingSettings} settings 当前供应商凭据。
 * @param {AiMatcherOptions} options 可注入的网络依赖。
 * @return {Promise<AiModelOption[]>} 去重排序后的模型列表。
 */
export async function fetchAiModels(
  settings: MatchingSettings,
  options: AiMatcherOptions = {},
): Promise<AiModelOption[]> {
  if (!settings.apiKey) throw new Error("credentials");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("timeout"));
      }, 10000);
    });
    return await Promise.race([loadModels(), timeout]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }

  /**
   * 校验目标并读取受限模型响应。
   * @return {Promise<AiModelOption[]>} 支持文本输出的模型。
   */
  async function loadModels(): Promise<AiModelOption[]> {
    const url = aiEndpoint(settings.apiUrl).replace(
      /\/chat\/completions$/,
      "/models",
    );
    const resolved = await validateResolvedOutboundHost(new URL(url).hostname, {
      allowedHosts: [],
      serviceLabel: "AI",
      resolveDns: options.resolveDns ?? Deno.resolveDns,
    });
    if (!resolved.ok || controller.signal.aborted) throw new Error("endpoint");
    const response = await (options.fetch ?? fetch)(url, {
      headers: { authorization: `Bearer ${settings.apiKey}` },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("provider");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("body");
    let text = "", size = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 1024 * 1024) throw new Error("size");
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      await reader.cancel();
    }
    const data: unknown = JSON.parse(text).data;
    if (!Array.isArray(data)) throw new Error("format");
    const ids = new Set<string>();
    for (const entry of data) {
      if (
        !entry || typeof entry.id !== "string" || !entry.id ||
        entry.id.length > 200
      ) continue;
      if (
        Array.isArray(entry.output_modalities) &&
        !entry.output_modalities.includes("text")
      ) continue;
      if (
        /embed|whisper|tts|dall-e|image|audio|realtime|moderation|rerank|sora/i
          .test(entry.id)
      ) continue;
      if (
        settings.provider === "openai" &&
        (!/^(gpt-|o[134](?:-|$))/i.test(entry.id) ||
          /codex|deep-research|search|instruct|pro(?:-|$)/i.test(entry.id))
      ) continue;
      ids.add(entry.id);
      if (ids.size >= 1000) break;
    }
    return [...ids].sort().map((id) => ({
      id,
      thinking: supportsThinkingToggle(id),
    }));
  }
}
