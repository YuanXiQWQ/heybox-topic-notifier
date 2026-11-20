/** @file 为设置页预览和 AI 分类请求生成相同的反例资料。 */

/**
 * 生成供分类器参考的历史误匹配样本，只传递有注释的判定依据。
 * @param {Array<{title:string,source:string,excerpt:string,reason:string}>} examples 配置中的反例。
 * @return {string} 反例 JSON 数组；没有完整样本时为空。
 */
export function counterexamplePrompt(examples = []) {
  const samples = examples.filter((item) => item.reason.trim() && item.excerpt.trim()).map((item) => ({
    title: item.title,
    source: item.source,
    excerpt: item.excerpt.trim(),
    reason: item.reason.trim(),
  }));
  return samples.length ? JSON.stringify(samples, null, 2) : "";
}
