/**
 * @file 本文件提供认证和 CSRF 共享的轻量密码学辅助工具。
 */

/**
 * 将字节数组编码为 Base64URL 字符串。
 *
 * @param value 待编码字节。
 * @return Base64URL 字符串。
 */
export function base64UrlEncode(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

/**
 * 将 Base64URL 字符串解码为字节数组。
 *
 * @param value Base64URL 字符串。
 * @return 解码后的字节数组。
 */
export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + (4 - normalized.length % 4) % 4,
    "=",
  );
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

/**
 * 使用常量时间比较两个字符串。
 *
 * @param left 左侧字符串。
 * @param right 右侧字符串。
 * @return 两个字符串相等时返回 true。
 */
export function constantTimeEquals(
  left: string | undefined,
  right: string,
): boolean {
  if (!left) {
    return false;
  }

  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let diff = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}
