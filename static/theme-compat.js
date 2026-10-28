/** @file 为不支持 CSS 颜色混合的 WebView 计算主题色，并跟随本机主题切换。 */
// @ts-check

(() => {
  if (globalThis.CSS?.supports('color', 'color-mix(in srgb, #000, #fff)')) return;
  const root = document.documentElement;
  let lastInputs = '';

  /**
   * 解析项目主题使用的十六进制颜色。
   * @param {string} value 三位或六位十六进制颜色。
   * @return {number[]} sRGB 三通道分量。
   */
  function channels(value) {
    let hex = value.trim().replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map((part) => part + part).join('');
    return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  }

  /**
   * 按与主题 CSS 相同的 sRGB 权重混合两种不透明颜色。
   * @param {string} first 第一种颜色。
   * @param {string} second 第二种颜色。
   * @param {number} weight 第一种颜色占比。
   * @return {string} 可供旧 WebView 使用的 RGB 颜色。
   */
  function mix(first, second, weight) {
    const other = channels(second);
    return `rgb(${channels(first).map((part, index) =>
      Math.round(part * weight + other[index] * (1 - weight))).join(', ')})`;
  }

  /** 根据当前主色和明暗模式更新兼容颜色；自身写入不会重复触发计算。 */
  function updateTheme() {
    const style = getComputedStyle(root);
    const theme = style.getPropertyValue('--theme-color').trim();
    const dark = root.dataset.colorMode === 'dark';
    const inputs = `${theme}:${dark}`;
    if (inputs === lastInputs || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(theme)) return;
    lastInputs = inputs;
    const values = {
      '--theme-strong': mix(theme, style.getPropertyValue('--ink'), 0.82),
      '--theme-link': mix(theme, style.getPropertyValue('--link-base'), 0.76),
      '--theme-soft': mix(theme, style.getPropertyValue('--surface-soft-base'), 0.08),
      '--theme-soft-strong': mix(theme, style.getPropertyValue('--surface-soft-base'), 0.14),
      '--theme-border': mix(theme, style.getPropertyValue('--border'), 0.22),
      '--bg': mix(theme, dark ? '#101317' : '#f6f7f8', dark ? 0.07 : 0.05),
      '--secondary-button': mix(theme, style.getPropertyValue('--muted-strong'), dark ? 0.48 : 0.54),
    };
    for (const [name, value] of Object.entries(values)) root.style.setProperty(name, value);
  }

  updateTheme();
  new MutationObserver(updateTheme).observe(root, {
    attributes: true,
    attributeFilter: ['style', 'data-color-mode'],
  });
})();
