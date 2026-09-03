/**
 * @file 本文件提供认证流程使用的邮箱地址规范化能力。
 */

/**
 * RFC 常见邮箱总长度上限。
 */
const maxEmailAddressLength = 254;

/**
 * RFC 常见邮箱本地部分长度上限。
 */
const maxEmailLocalPartLength = 64;

/**
 * 邮箱本地部分允许的常见字符集合。
 */
const emailLocalPartPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;

/**
 * 域名标签允许的 ASCII 字符集合。
 */
const domainLabelPattern = /^[a-z0-9-]+$/;

/**
 * 规范化邮箱地址。
 *
 * @param value 原始邮箱地址。
 * @return 合法时返回规范化邮箱地址，不合法时返回 undefined。
 */
export function normalizeEmailAddress(value: string): string | undefined {
  const email = value.trim().toLowerCase();
  if (
    email.length === 0 ||
    email.length > maxEmailAddressLength ||
    hasEmailSpaceOrControlCharacter(email)
  ) {
    return undefined;
  }

  const parts = email.split("@");
  if (parts.length !== 2) {
    return undefined;
  }

  const [localPart, domain] = parts;
  if (!validEmailLocalPart(localPart) || !validEmailDomain(domain)) {
    return undefined;
  }

  return `${localPart}@${domain}`;
}

/**
 * 判断邮箱地址中是否含有空白或控制字符。
 *
 * @param value 邮箱地址。
 * @return 存在空白或控制字符时返回 true。
 */
function hasEmailSpaceOrControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 32 || codePoint === 127) {
      return true;
    }
  }

  return false;
}

/**
 * 判断邮箱本地部分是否合法。
 *
 * @param value 邮箱本地部分。
 * @return 合法时返回 true。
 */
function validEmailLocalPart(value: string): boolean {
  return value.length > 0 &&
    value.length <= maxEmailLocalPartLength &&
    !value.startsWith(".") &&
    !value.endsWith(".") &&
    !value.includes("..") &&
    emailLocalPartPattern.test(value);
}

/**
 * 判断邮箱域名是否合法。
 *
 * @param value 邮箱域名。
 * @return 合法时返回 true。
 */
function validEmailDomain(value: string): boolean {
  return value.length > 0 &&
    value.length <= maxEmailAddressLength &&
    !value.includes("..") &&
    value.split(".").every(validDomainLabel);
}

/**
 * 判断域名标签是否合法。
 *
 * @param value 域名标签。
 * @return 合法时返回 true。
 */
function validDomainLabel(value: string): boolean {
  return value.length > 0 &&
    value.length <= 63 &&
    !value.startsWith("-") &&
    !value.endsWith("-") &&
    domainLabelPattern.test(value);
}
