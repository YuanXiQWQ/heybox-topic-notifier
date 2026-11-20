/** @file 为设置页预览和 AI 分类请求生成相同的反例资料。 */

/**
 * 将有注释的历史原帖与原因配对，保留原始字段、文本及评论顺序。
 * @param {Array<{post?: object,reason:string}>} examples 配置中的反例。
 * @return {string} 反例 JSON 数组；没有完整样本时为空。
 */
export function counterexamplePrompt(examples = []) {
  const samples = examples
    .filter((item) => item.post && item.reason.trim())
    .map((item) => ({ post: item.post, reason: item.reason.trim() }));
  return samples.length ? JSON.stringify(samples, null, 2) : "";
}
