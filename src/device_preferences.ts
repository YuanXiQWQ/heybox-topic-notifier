/** @file 从当前设备的请求读取显示偏好，不使用账号保存的外观作为设备默认值。 */

/** 仅属于设备、不能参与账号设置同步的字段。 */
export const devicePreferenceFields = [
  "darkMode",
  "locale",
  "themeColor",
] as const;

/**
 * 读取本设备手动选择的偏好 Cookie；无效编码视为没有选择。
 * @param {string | null | undefined} cookies 请求 Cookie。
 * @param {string} field 偏好字段。
 * @return {string | undefined} 本设备的显式值。
 */
export function devicePreferenceCookie(
  cookies: string | null | undefined,
  field: string,
): string | undefined {
  const prefix = `heybox-device-${field}=`;
  const value = cookies?.split(";").map((part) => part.trim()).find((part) =>
    part.startsWith(prefix)
  );
  try {
    return value ? decodeURIComponent(value.slice(prefix.length)) : undefined;
  } catch {
    return undefined;
  }
}
