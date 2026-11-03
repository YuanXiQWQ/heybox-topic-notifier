/** @file 定义账号名称的校验规则与查找时的规范形式。 */

/**
 * 校验用户名或显示名称的 Unicode 字符、可见内容和长度。
 * @param {string} name 待检查的名称。
 * @return {boolean} 名称是否可以用于账号。
 */
export function validAccountName(name: string): boolean {
  const length = [...name].length;
  return length >= 1 && length <= 80 && /\S/u.test(name) &&
    !/\p{C}/u.test(name);
}

/**
 * 规范化用户名。
 *
 * @param {string} value 原始用户名。
 * @return {string} 小写并去除首尾空白后的用户名。
 */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 规范化显示名称，同时保留用户输入的大小写。
 *
 * @param {string} value 原始显示名称。
 * @return {string} 去除首尾空白后的显示名称。
 */
export function normalizeDisplayName(value: string): string {
  return value.trim();
}
