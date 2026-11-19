/** @file 检查真实设置页的双抽屉、快速切换、气泡改绑及独立高级设置。 */
globalThis.entryProbe = 'pending';
try {
  if (document.readyState === 'loading') {
    await new Promise((resolve) =>
      document.addEventListener('DOMContentLoaded', resolve, { once: true })
    );
  }
  /** @param {boolean} value 断言结果。 @param {string} message 错误说明。 */
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  /** @param {string} selector 控件选择器。 @return {HTMLElement} 对应控件。 */
  const find = (selector) => document.querySelector(selector);
  /** @return {Promise<void>} 等待收起与展开均完成。 */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 560));
  const heading = find('[data-action="toggle-matchings"]');
  const toggle = find('[data-profile-toggle]');
  if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
  await settle();
  heading.click();
  toggle.click();
  heading.click();
  toggle.click();
  await settle();
  check(
    toggle.getAttribute('aria-expanded') === 'true' &&
      !find('[data-profile-list]').hidden,
    'profile list did not finish opening',
  );
  find('.profile-head [data-profile-action="add"]').click();
  const row = find('[data-profile-row]:last-child');
  row.querySelector('.profile-chip-add').click();
  find('.profile-search-menu [role="option"]').click();
  check(
    row.querySelectorAll('.profile-chip button').length === 1,
    'topic assignment',
  );
  row.querySelector('.profile-chip-add').click();
  check(
    find('.profile-search-menu').lastElementChild.getAttribute(
      'aria-selected',
    ) === 'true',
    'linked topic should sort last',
  );
  find('.profile-search').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  row.querySelector('[data-profile-action="edit"]').click();
  await settle();
  const mode = find('[name="matchingMode"]');
  mode.value = 'ai';
  mode.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  check(
    find('[data-matching-panel]').contains(find('[data-advanced-editor]')) &&
      !find('[data-advanced-editor]').hidden,
    'nested advanced settings',
  );
  find('[name="matchingPrompt"]').value = '仅判断这个社区';
  find('[name="matchingDailyLimit"]').value = '12';
  const form = mode.form;
  form.dispatchEvent(new Event('profile-capture'));
  const values = JSON.parse(form.elements.matchingProfiles.value);
  check(
    values[0].options.mode === 'rules' &&
      values[1].options.prompt === '仅判断这个社区' &&
      values[1].options.dailyLimit === 12,
    'scoped settings snapshot',
  );
  toggle.click();
  await settle();
  row.querySelector('.profile-chip button').click();
  check(
    !row.querySelector('.profile-chip button') &&
      find('[data-profile-row="default"] .profile-chip button').disabled,
    'default fallback',
  );
  check(
    [...document.querySelectorAll('[data-topic-profile]')].every((el) =>
      el.value === 'default'
    ),
    'topic dropdown projection',
  );
  globalThis.entryProbe = 'passed';
} catch (error) {
  globalThis.entryProbe = String(error.stack || error);
}
