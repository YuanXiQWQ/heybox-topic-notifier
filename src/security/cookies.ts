/**
 * @file 本文件提供 Cookie 请求头解析工具。
 */

/**
 * 解析 Cookie 请求头。
 *
 * @param value Cookie 请求头。
 * @return Cookie 名值映射。
 */
export function parseCookies(value: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of value?.split(";") ?? []) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    cookies.set(part.slice(0, separatorIndex).trim(), part.slice(separatorIndex + 1).trim());
  }
  return cookies;
}
