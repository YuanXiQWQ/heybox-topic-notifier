/** @file 校验部署级小黑盒设备标识，避免常驻服务重启和独立出口冷启动时更换身份。 */

/** 部署标识允许字母、数字、下划线和连字符，不接受空值或请求分隔符。 */
const deviceIdPattern = /^[a-zA-Z0-9_-]{8,128}$/;

/**
 * 读取必须预先生成并保存的部署设备标识；不在运行时自动生成或轮换。
 * @param {string | undefined} value 部署配置中的标识。
 * @return {string} 校验后的固定标识。
 */
export function requireHeyboxDeviceId(value: string | undefined): string {
  const id = value?.trim();
  if (!id || !deviceIdPattern.test(id)) {
    throw new Error(
      "Configure a persistent HEYBOX_DEVICE_ID (8–128 letters, digits, underscores or hyphens).",
    );
  }
  return id;
}
