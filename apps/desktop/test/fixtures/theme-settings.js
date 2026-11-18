/** @file 在真实设置页检查 HEX、RGB、系统选色草稿、取消与本机持久化。 */
globalThis.entryProbe = 'pending';
try {
  if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once: true}));
  /** @param {boolean} value 断言结果。 @param {string} message 失败说明。 */
  const check = (value, message) => { if (!value) throw new Error(message); };
  /** @return {Promise<void>} 等待保存回调和布局完成。 */
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  /** @param {HTMLInputElement} control 编辑字段。 @param {string} value 输入内容。 */
  const input = (control, value) => { control.value = value; control.dispatchEvent(new Event('input', {bubbles: true})); };
  await frame();
  const trigger = document.querySelector('[data-theme-color-input]');
  const original = trigger.value;
  const dialog = document.querySelector('[data-theme-color-dialog]');
  const hex = dialog.querySelector('[data-theme-color-hex]');
  const channels = [...dialog.querySelectorAll('[data-theme-color-channel]')];
  const palette = dialog.querySelector('[data-theme-color-draft]');
  const form = dialog.querySelector('form');
  const cancel = dialog.querySelector('[data-theme-color-cancel]');
  trigger.click();
  check(dialog.open, 'theme must open the shared editor');
  input(hex, '#0F8');
  check(palette.value === '#00ff88' && channels.map(field => field.value).join() === '0,255,136', 'short HEX must update RGB and preview');
  input(hex, '#12');
  form.requestSubmit();
  await frame();
  check(dialog.open && trigger.value === original && hex.getAttribute('aria-invalid') === 'true', 'incomplete HEX must not save');
  input(hex, '12G456');
  check(!form.checkValidity(), 'invalid HEX characters must be rejected');
  input(hex, '123456');
  check(palette.value === '#123456', 'six-digit HEX without prefix must be accepted');
  input(channels[0], '256');
  form.requestSubmit();
  await frame();
  check(dialog.open && trigger.value === original, 'out-of-range RGB must not save');
  input(channels[0], '');
  check(!form.checkValidity(), 'empty RGB must not silently become zero');
  input(channels[0], '12.5');
  check(!form.checkValidity(), 'RGB must use integer channels');
  input(channels[0], '255'); input(channels[1], '16'); input(channels[2], '0');
  check(hex.value === '#FF1000' && palette.value === '#ff1000', 'RGB must update HEX and preview');
  input(palette, '#102030');
  check(hex.value === '#102030' && channels.map(field => field.value).join() === '16,32,48', 'system picker draft must update all numeric fields');
  cancel.click();
  check(!dialog.open && trigger.value === original, 'cancel must preserve the original theme');
  trigger.click();
  check(hex.value === original.toUpperCase(), 'reopen must discard canceled drafts');
  input(hex, '#123abc');
  form.requestSubmit();
  await frame();
  check(!dialog.open && trigger.value === '#123abc', 'valid HEX must save and close');
  check(document.documentElement.style.getPropertyValue('--theme-color') === '#123abc', 'saved value must apply to the page');
  check(document.cookie.includes('heybox-device-themeColor=%23123abc'), 'saved value must persist on this device');
  trigger.click();
  check(hex.value === '#123ABC' && channels.map(field => field.value).join() === '18,58,188', 'reopen must restore persisted color');
  input(channels[0], '0'); input(channels[1], '255'); input(channels[2], '128');
  form.requestSubmit();
  await frame();
  check(!dialog.open && trigger.value === '#00ff80', 'RGB boundary values must save');
  globalThis.applicationAppearance.save('themeColor', original);
  trigger.click();
  await frame();
  check(dialog.scrollWidth <= dialog.clientWidth + 1 && dialog.getBoundingClientRect().width <= innerWidth, 'mobile editor must not overflow horizontally');
  cancel.click();
  console.log('THEME_VALUES_OK');
  globalThis.entryProbe = 'passed';
} catch (error) {
  globalThis.entryProbe = String(error.stack || error);
}
