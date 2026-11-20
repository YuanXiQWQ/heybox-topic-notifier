/** @file 为 AI 分类请求及其缓存指纹生成历史误匹配样本。 */

/**
 * 将原帖、当时命中的依据及用户的纠正配对，保留原始字段、文本及评论顺序。
 * @param {import("../src/services/matching_settings.ts").MatchingCounterexample[]} examples 配置中的反例。
 * @return {string} 反例 JSON 数组；没有完整样本时为空。
 */
export function counterexamplePrompt(examples = []) {
  const samples = examples
    .filter((item) => item.post && item.reason.trim())
    .map(({ post, details, reason }) => ({
      post,
      ...(details ? {
        previousMatch: details.kind === "ai"
          ? { kind: "ai", decision: "match", reason: details.value, location: details.location }
          : {
            kind: "keyword", keyword: details.value, location: details.location,
            ...(details.ai ? { ai: { decision: "match", ...details.ai } } : {}),
          },
      } : {}),
      reason: reason.trim(),
    }));
  return samples.length ? JSON.stringify(samples, null, 2) : "";
}
