/** @file 检查设置抽屉切换、话题改绑、分配置反例注释和高级设置。 */
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
  const base = find('[data-profile-row="default"]');
  const all = find('[data-profile-all]');
  check(
    base.querySelector('[data-profile-selected]').disabled &&
      base.querySelector('[data-profile-name]').disabled && all.disabled,
    'default profile selection and name must be locked',
  );
  base.querySelector('[data-profile-action="copy"]').click();
  find('[data-profile-row]:last-child [data-profile-action="copy"]').click();
  check(
    [...document.querySelectorAll('[data-profile-row] [data-profile-name]')]
      .map((input) => input.value).join(',') === '默认配置,默认配置（1）,默认配置（2）',
    'copies should share one numbered sequence',
  );
  all.click();
  check(
    all.checked && !find('[data-profile-row="default"] [data-profile-selected]').checked &&
      document.querySelectorAll('[data-profile-selected]:checked').length === 2,
    'select all should skip the default profile',
  );
  find('.profile-head [data-profile-action="delete"]').click();
  check(all.disabled && !all.checked, 'empty bulk selection');
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
  find('[data-profile-row="default"] [data-profile-action="edit"]').click();
  await settle();
  const examples = find('[data-counterexample-editor]');
  const keywords = find('[data-keyword-editor]');
  check(examples.hidden && !keywords.hidden, 'rules mode shows only keywords');
  mode.value = 'ai';
  mode.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  check(!examples.hidden && keywords.hidden &&
    examples.nextElementSibling === find('[data-advanced-editor]'), 'AI example drawer');
  find('[data-action="toggle-counterexamples"]').click();
  const annotation = find('[data-example-rows] textarea');
  annotation.value = '评论引用了过去的困难';
  annotation.dispatchEvent(new Event('input', { bubbles: true }));
  const saved = JSON.parse(form.elements.matchingProfiles.value);
  check(saved[0].options.counterexamples[0].reason === annotation.value &&
    saved[1].options.counterexamples.length === 0 &&
    JSON.parse(find('[data-example-preview] pre').textContent)[0].source === 'comments',
    'editable profile-specific evidence and preview');
  mode.value = 'hybrid';
  mode.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  check(!examples.hidden && !keywords.hidden, 'hybrid mode shows both drawers');
  globalThis.entryProbe = 'passed';
} catch (error) {
  globalThis.entryProbe = String(error.stack || error);
}
