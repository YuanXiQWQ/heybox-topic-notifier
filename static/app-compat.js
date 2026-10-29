/** @file 为应用页面补充旧 WebView 缺少的超时信号与安全随机 UUID。 */
// @ts-check

(() => {
  if (typeof globalThis.AbortSignal?.timeout !== 'function') {
    /**
     * 在指定时间后中止请求，超时同样作用于响应体读取。
     * @param {number} milliseconds 超时毫秒数。
     * @return {AbortSignal} 自动取消的信号。
     */
    AbortSignal.timeout = function (milliseconds) {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), milliseconds);
      return controller.signal;
    };
  }
  if (globalThis.crypto && typeof crypto.randomUUID !== 'function') {
    /**
     * 使用系统安全随机源生成符合版本和变体位要求的 UUID v4。
     * @return {`${string}-${string}-${string}-${string}-${string}`} 随机标识符。
     */
    crypto.randomUUID = function () {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    };
  }
})();
