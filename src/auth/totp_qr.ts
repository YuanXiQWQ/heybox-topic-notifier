/**
 * @file 本文件按需加载二维码依赖，把 otpauth 链接渲染成设置页展示用的二维码。
 */
// @ts-types="npm:@types/qrcode@^1.5.5"
import QRCode from "qrcode";

/**
 * 生成 TOTP 绑定二维码的 Data URL。
 *
 * @param {string} otpAuthUri otpauth 链接。
 * @return {Promise<string>} PNG 格式的 Data URL。
 */
export async function totpQrCodeDataUrl(otpAuthUri: string): Promise<string> {
  return await QRCode.toDataURL(otpAuthUri, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 240,
  });
}
