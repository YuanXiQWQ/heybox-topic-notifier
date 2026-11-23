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
  /**
   * 等待 Android 测试驱动完成指定的真实输入，再继续检查页面状态。
   * @param {string} stage 原生驱动等待的输入阶段。
   * @return {Promise<void>} 本次按键或触摸已结束。
   */
  const androidInput = async (stage) => {
    globalThis.entryProbe = stage;
    await new Promise((resolve) => document.addEventListener('matching-input-complete', resolve, {once: true}));
    globalThis.entryProbe = 'pending';
  };
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
  const examplesToggle = find('[data-action="toggle-counterexamples"]');
  if (examplesToggle.getAttribute('aria-expanded') !== 'true') examplesToggle.click();
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
    saved[0].options.counterexamples[0].post.comments[0] === '当时卡住了' &&
    !find('[data-example-preview]'),
    'editable profile-specific evidence without a preview');
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
    const example = find('[data-example-rows]').firstElementChild;
    const title = example.querySelector('[data-example-title]');
    const body = example.querySelector('[data-example-body]');
    const details = example.querySelector('.match-detail-list');
    check([title, body, details].every((el) =>
      el.classList.contains('is-overflowing') && el.tabIndex === 0
    ), 'saved titles, bodies and clipped details have keyboard previews');
    check(body.clientHeight <= parseFloat(getComputedStyle(body).lineHeight) * 5 + 2,
      'long saved posts use the five-line history preview');
    if (new URLSearchParams(location.search).has('mouse')) {
      details.scrollIntoView({ block: 'center' });
      globalThis.entryStage = 'hover-saved-details';
      await new Promise((resolve) => document.addEventListener('details-hover-checked', resolve, { once: true }));
    }
    if (globalThis.nativeMatchingInput) {
      body.focus({preventScroll: true});
      await androidInput('tab-to-saved-details');
    } else {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      details.focus({preventScroll: true});
    }
    check(document.activeElement === details, 'Tab focuses the saved details cell (active: ' +
      document.activeElement?.outerHTML.slice(0, 100) + ', inert: ' + details.closest('[inert]')?.id + ')');
    check(getComputedStyle(details).position === 'absolute' &&
      getComputedStyle(details.querySelectorAll('dd .match-detail-value')[2]).whiteSpace === 'normal',
      'focusing clipped details expands the full AI reason');
    details.blur();
    const opened = [];
    const nativeOpen = globalThis.open;
    globalThis.open = (url) => { opened.push(url); return null; };
    try {
      for (const cell of example.querySelectorAll('[data-post-link-cell]')) cell.click();
      title.click();
      title.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      const tooltip = find('#app-tooltip');
      const cell = details.parentElement;
      cell.scrollIntoView({block: 'center', behavior: 'instant'});
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      let heldReason;
      cell.addEventListener('pointerup', () => { heldReason = tooltip.hidden ? '' : tooltip.textContent; }, {once: true});
      if (globalThis.nativeMatchingInput) {
        await androidInput('hold-saved-details');
      } else {
        const touch = { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, bubbles: true };
        cell.dispatchEvent(new PointerEvent('pointerdown', touch));
        await settle();
        cell.dispatchEvent(new PointerEvent('pointerup', touch));
        cell.click();
      }
      check(heldReason?.includes('疑似求助'.repeat(50)) && !tooltip.hidden && tooltip.textContent === heldReason,
        'holding a saved details cell exposes the complete matching reason through release');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const selectedText = document.createRange();
      selectedText.selectNodeContents(body);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(selectedText);
      body.click();
      selection.removeAllRanges();
      annotation.click();
      const mark = example.querySelector('[data-row-check]');
      mark.click();
      check(mark.checked, 'selection is independent of opening the post');
      mark.click();
      check(opened.length === 5 && opened.every((url) => url === title.href),
        'only activating saved post cells or the keyboard link opens the original');
    } finally {
      globalThis.open = nativeOpen;
    }
    const originalDir = document.documentElement.dir;
    for (const dir of ['ltr', 'rtl']) {
      document.documentElement.dir = dir;
      for (const wrapper of examples.querySelectorAll('.example-table-scroll')) {
        const bounds = wrapper.getBoundingClientRect();
        check(bounds.width > 0 && wrapper.scrollWidth <= wrapper.clientWidth + 1 &&
          bounds.left >= -1 && bounds.right <= document.documentElement.clientWidth + 1,
          dir + ' tables fit inside the drawer');
      }
      for (const row of [head, example]) {
        const [select, title, body, details, reason, remove, add] =
          Array.from(row.children, (cell) => cell.getBoundingClientRect());
        check([title, body, details].every((cell) => Math.abs(cell.top - select.top) < 1) &&
          [remove, add].every((cell) => Math.abs(cell.top - reason.top) < 1),
          dir + ' example cells align with their headings');
        if (matchMedia('(max-width: 620px)').matches) {
          check(reason.top >= select.bottom - 1 && reason.width > row.clientWidth / 2,
            dir + ' second line gives the editable reason most of the width');
        } else {
          check(Math.abs(reason.top - select.top) < 1, dir + ' wide examples use one line');
        }
      }
      check(Array.from(first.cells).every((cell) => cell.offsetTop === first.cells[0].offsetTop),
        dir + ' history selection stays on one line');
    }
    document.documentElement.dir = originalDir;
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
        items()[2].details.value === '疑似求助' && items()[2].reason === '',
      'batch add across pages retains the prior match',
    );
    const stored = find('[data-example-rows] [data-post="10"]');
    const why = stored.querySelector('[data-example-reason]');
    why.value = '原帖是在分享经历';
    why.dispatchEvent(new Event('input', { bubbles: true }));
    check(
      items()[2].reason === why.value &&
        JSON.stringify(items()[2].post) === JSON.stringify(history[10].post) &&
        items()[2].details.location === history[10].details.location,
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
    head.querySelector('[data-example-picker]').click();
    await settle();
    find('[data-history-pick-all]').click();
    find('[data-example-pages] button:last-child').click();
    find('[data-history-pick-all]').click();
    find('[data-example-add]').click();
    check(!find('[data-saved-pagination]').hidden && find('[data-example-rows]').children.length === 10,
      'large saved lists show the first ten examples');
    find('[data-saved-pages] button:last-child').click();
    check(find('[data-example-rows]').children.length === 1 &&
      find('[data-example-rows] [data-post="10"]'), 'saved page two contains the remaining post');
    find('[data-saved-size="all"]').click();
    check(find('[data-example-rows]').children.length === 11, 'all saved examples fit on one page');
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
