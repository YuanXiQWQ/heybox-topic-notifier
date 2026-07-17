/**
 * @file 本文件提供视图层文本处理工具。
 */
/**
 * 截断并压缩文本空白。
 *
 * @param value 原始文本。
 * @param maxLength 最大展示长度。
 * @return 处理后的文本。
 */
export function truncateText(value: string, maxLength = 80): string {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
