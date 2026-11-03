/** @file 为各类页面提供设备显示设置，账号业务配置保持独立。 */
import { devicePreferenceCookie } from "../device_preferences.ts";
import { localeFromRequest } from "../locales/locale.ts";
import type { AppSettings } from "../models.ts";

/**
 * 为页面投影当前设备偏好，账号设置对象保持不变。
 * @param {AppSettings} settings 账号业务设置。
 * @param {Request} request 当前设备请求。
 * @return {AppSettings} 仅供当前请求显示的设置。
 */
export function settingsForDevice(
  settings: AppSettings,
  request: Request,
): AppSettings {
  const cookies = request.headers.get("cookie");
  const color = devicePreferenceCookie(cookies, "themeColor");
  return {
    ...settings,
    locale: localeFromRequest(request),
    darkMode: devicePreferenceCookie(cookies, "darkMode") === "true",
    themeColor: color && /^#[a-f0-9]{6}$/i.test(color) ? color : "#bd7fff",
  };
}
