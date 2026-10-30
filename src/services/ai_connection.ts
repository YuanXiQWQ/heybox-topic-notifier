/** @file 使用固定短文本测试 AI 分类接口，复用用户租约与每日调用额度。 */
import { aiEndpoint, createAiMatcher } from "./ai_matcher.ts";
import { matchingRuntimeForDay } from "./matching_engine.ts";
import type { MatchingSettings } from "./matching_settings.ts";
import type { MatchingStore } from "../storage/matching_types.ts";

/** 连通测试仅返回状态和经过分类器脱敏的错误。 */
export type AiConnectionTestResult = {
  ok: boolean;
  error?: "configuration" | "busy" | "limit" | "request" | "unavailable";
  detail?: string;
};

/**
 * 验证当前配置能完成分类请求，成功时重置故障提醒；不创建帖子记录、通知或判定缓存。
 * @param {MatchingSettings} settings 当前表单中的匹配配置。
 * @param {MatchingStore | undefined} store 用户匹配运行状态。
 * @param {ReturnType<typeof createAiMatcher>} ai 可注入的分类器。
 * @param {() => number} now 时钟。
 * @return {Promise<AiConnectionTestResult>} 连通结果。
 */
export async function testAiConnection(
  settings: MatchingSettings,
  store?: MatchingStore,
  ai = createAiMatcher(),
  now = Date.now,
): Promise<AiConnectionTestResult> {
  try {
    aiEndpoint(settings.apiUrl);
    if (
      settings.mode === "rules" || !settings.apiKey || !settings.model ||
      !settings.prompt
    ) throw new Error("config");
  } catch {
    return { ok: false, error: "configuration" };
  }
  if (!store) return { ok: false, error: "unavailable" };
  const token = crypto.randomUUID();
  if (!await store.acquire(token, now())) return { ok: false, error: "busy" };
  try {
    const runtime = matchingRuntimeForDay(await store.runtime(), now());
    if (runtime.calls >= settings.dailyLimit) {
      return { ok: false, error: "limit" };
    }
    runtime.calls++;
    runtime.unknownUsage++;
    await store.saveRuntime(runtime);
    const decision = await ai.classify({
      id: "connection-test",
      title: "连接测试",
      body: "这是用于验证模型接口的测试内容。",
      excerpt: "",
      comments: [],
      commentReplies: [],
      url: "",
      publishedAt: "",
    }, settings);
    runtime.inputTokens += decision.inputTokens;
    runtime.outputTokens += decision.outputTokens;
    if (decision.usageKnown) runtime.unknownUsage--;
    if (decision.error || !decision.decision) runtime.failures++;
    else {
      delete runtime.aiFailure;
      runtime.lastError = undefined;
    }
    await store.saveRuntime(runtime);
    return decision.error || !decision.decision
      ? { ok: false, error: "request", detail: decision.error }
      : { ok: true };
  } finally {
    await store.release(token);
  }
}
