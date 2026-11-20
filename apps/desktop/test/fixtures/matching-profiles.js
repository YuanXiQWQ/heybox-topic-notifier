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
  const annotation = find('[data-example-rows] [data-example-reason]');
  const style = getComputedStyle(annotation);
  check(style.resize === 'none' && style.overflowY === 'auto' &&
    !find('[data-example-rows]').querySelector('details, [data-example-excerpt]'),
    'only the reason is editable and has no resize handle');
  annotation.value = '评论引用了过去的困难';
  annotation.dispatchEvent(new Event('input', { bubbles: true }));
  const saved = JSON.parse(form.elements.matchingProfiles.value);
  check(saved[0].options.counterexamples[0].reason === annotation.value &&
    saved[1].options.counterexamples.length === 0 &&
    JSON.parse(find('[data-example-preview] pre').textContent)[0].post.comments[0] === '当时卡住了',
    'editable profile-specific evidence and preview');
  const history = Array.from({ length: 11 }, (_, index) => ({
    id: String(index),
    recordId: '10:' + index,
    topicId: '10',
    title: '历史标题 ' + index,
    body: '完整正文 ' + index,
    post: {
      id: String(index), title: '历史标题 ' + index, body: '原始正文 ' + index,
      excerpt: '', url: '', publishedAt: '2026-11-01', comments: ['示例评论 ' + index],
      commentReplies: ['示例回复 ' + index],
    },
    location: 'comments',
    comments: ['示例评论 ' + index],
    replies: [],
    details: {
      publishedAt: '2026-11-01',
      matchedAt: '2026-11-02',
      kind: 'ai',
      value: '疑似求助',
      location: 'comments',
    },
  }));
  const originalFetch = globalThis.fetch;
  // 离线历史缓存可能只有表格数据，选中后仍可保存原因，待取得原帖再发送。
  delete history[0].post;
  globalThis.fetch = (url, options) =>
    url === '/settings/counterexample-history'
      ? Promise.resolve(
        new Response(JSON.stringify(history), {
          headers: { 'x-app-user': document.body.dataset.appUserId },
        }),
      )
      : originalFetch(url, options);
  try {
    const head = find('.example-table .rule-grid-head');
    const topicHead = find('.topic-rule-head');
    check(
      head.matches('.topic-rule-row') && head.children.length === 7 &&
        head.children[1].textContent === '帖子标题' &&
        head.firstElementChild.className === topicHead.children[1].className &&
        getComputedStyle(head).backgroundColor === getComputedStyle(topicHead).backgroundColor &&
        getComputedStyle(head.children[1]).borderInlineEnd === getComputedStyle(topicHead.children[2]).borderInlineEnd &&
        getComputedStyle(head.children[1]).textAlign === 'center',
      'seven counterexample columns',
    );
    const actionWidth = parseFloat(getComputedStyle(head).getPropertyValue('--rule-action-column'));
    check([head.children[0], head.children[5], head.children[6]].every((cell) =>
      Math.abs(cell.offsetWidth - actionWidth) <= 1
    ), 'counterexample selection and actions use topic table column widths');
    head.querySelector('[data-example-picker]').click();
    await settle();
    check(
      find('[data-example-results]').rows.length === 10 && find('[data-example-add]').disabled,
      'initial history page',
    );
    const first = find('[data-example-results] tr');
    const checkbox = first.querySelector('[data-row-check]');
    first.querySelector('[data-example-title]').click();
    check(checkbox.checked && first.classList.contains('is-selected') && !find('[data-example-add]').disabled,
      'title selects a cached history row and enables adding');
    first.querySelector('.match-detail-list').click();
    check(!checkbox.checked && !first.classList.contains('is-selected'), 'details clear the row');
    first.querySelector('label').click();
    check(checkbox.checked, 'checkbox label toggles once');
    checkbox.click();
    check(!checkbox.checked, 'checkbox toggles once');
    first.querySelector('.table-clip').click();
    check(checkbox.checked, 'post content selects the row');
    find('[data-example-pages] button:last-child').click();
    find('[data-history-pick-all]').click();
    find('[data-example-add]').click();
    /** 读取表单即将保存的默认配置反例。 @return {Array} 当前快照。 */
    const items = () =>
      JSON.parse(form.elements.matchingProfiles.value)[0].options.counterexamples;
    check(
      items().length === 3 && items()[1].body === '完整正文 0' && !items()[1].post &&
        items()[2].details.value === '疑似求助' &&
        JSON.parse(find('[data-example-preview] pre').textContent).length === 1,
      'batch add across pages, empty reasons excluded',
    );
    const stored = find('[data-example-rows] [data-post="10"]');
    const why = stored.querySelector('[data-example-reason]');
    why.value = '原帖是在分享经历';
    why.dispatchEvent(new Event('input', { bubbles: true }));
    check(
      items()[2].reason === why.value &&
        JSON.stringify(JSON.parse(find('[data-example-preview] pre').textContent)[1].post) ===
          JSON.stringify(history[10].post) &&
        JSON.parse(find('[data-example-preview] pre').textContent).length === 2,
      'annotate after adding',
    );
    stored.querySelector('[data-example-picker]').click();
    await settle();
    check(
      find('[data-example-results] [data-row-check]').disabled,
      'already added post disabled',
    );
    const unavailable = find('[data-example-results] tr.is-unavailable');
    unavailable.click();
    check(find('[data-example-add]').disabled && unavailable.querySelector('input').checked,
      'clicking an existing example does not add it again');
    find('[data-example-results] tr[data-post="1"]').click();
    find('[data-example-add]').click();
    check(items().length === 4, 'single add');
    find('[data-example-rows] [data-post="1"] [data-example-delete]').click();
    check(items().length === 3, 'row delete');
    find('[data-example-select-all]').click();
    find('.example-table .rule-grid-head [data-example-delete]').click();
    check(
      items().length === 0 && find('.example-table .rule-grid-head [data-example-picker]').isConnected,
      'bulk delete and empty entry',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  mode.value = 'hybrid';
  mode.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  check(!examples.hidden && !keywords.hidden, 'hybrid mode shows both drawers');
  globalThis.entryProbe = 'passed';
} catch (error) {
  globalThis.entryProbe = String(error.stack || error);
}
