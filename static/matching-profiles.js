/** @file 管理匹配配置、配置与话题的单向关联，以及共用设置抽屉的视图切换。 */

/**
 * 共用话题表与气泡的可搜索单选菜单，用相关性和数字、拼音顺序排列候选。
 * @param {HTMLButtonElement} toggle 打开菜单的按钮。
 * @param {string} label 搜索框的可访问名称。
 * @param {Array<object>} choices 候选的显示名称、搜索字段及选中状态。
 * @param {Function} select 提交选择。
 * @return {Function} 外部收起菜单的操作。
 */
function openProfilePicker(toggle, label, choices, select) {
  const input = document.createElement('input');
  const list = document.createElement('div');
  const reference = toggle.parentElement;
  const collator = new Intl.Collator('zh-u-co-pinyin', {
    numeric: true,
    sensitivity: 'base',
  });
  input.type = 'search';
  input.className = 'profile-search';
  input.autocomplete = 'off';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', label);
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'true');
  list.id = 'profile-search-options';
  list.className =
    'matching-picker-menu matching-picker-options profile-search-menu';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', label);
  input.setAttribute('aria-controls', list.id);
  toggle.hidden = true;
  toggle.setAttribute('aria-expanded', 'true');
  toggle.after(input);
  document.body.append(list);
  let items = [];
  let index = -1;
  let closed = false;

  /** 将候选框限制在当前视口，并跟随滚动和输入框宽度。 */
  function position() {
    const rect = input.getBoundingClientRect();
    const width = Math.min(
      Math.max(rect.width, 200),
      document.documentElement.clientWidth - 12,
    );
    list.style.width = width + 'px';
    const left = document.documentElement.dir === 'rtl'
      ? rect.right - width
      : rect.left;
    list.style.left = Math.max(
      6,
      Math.min(left, document.documentElement.clientWidth - width - 6),
    ) + 'px';
    const below = globalThis.innerHeight - rect.bottom - 6;
    const above = below < 100 && rect.top > below;
    list.style.maxHeight =
      Math.max(30, Math.min(240, above ? rect.top - 6 : below)) + 'px';
    list.style.top = (above ? rect.top - list.offsetHeight : rect.bottom) +
      'px';
  }

  /** 过滤候选并将已有归属的相关行放在末尾。 */
  function filter() {
    const query = input.value.trim().toLocaleLowerCase();
    const ranked = choices.map((choice) => {
      const scores = choice.terms.map((term) => {
        const value = term.toLocaleLowerCase();
        return !query || value === query
          ? 0
          : value.startsWith(query)
          ? 1
          : value.includes(query)
          ? 2
          : 3;
      });
      return { choice, rank: Math.min(...scores) };
    }).filter((entry) => entry.rank < 3);
    ranked.sort((a, b) =>
      Number(a.choice.selected) - Number(b.choice.selected) ||
      a.rank - b.rank || collator.compare(a.choice.label, b.choice.label) ||
      collator.compare(a.choice.id, b.choice.id)
    );
    items = ranked.map((entry) => entry.choice);
    list.textContent = '';
    index = -1;
    input.removeAttribute('aria-activedescendant');
    items.forEach((choice, i) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.tabIndex = -1;
      option.id = list.id + '-' + i;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(choice.selected));
      option.textContent = choice.label + (choice.selected ? '  ✓' : '');
      option.addEventListener('pointerdown', (event) => event.preventDefault());
      option.addEventListener('click', () => choose(choice));
      list.append(option);
    });
    list.hidden = items.length === 0;
    position();
  }

  /**
   * 确认候选并恢复触发按钮焦点。
   * @param {object} choice 已选择的项目。
   */
  function choose(choice) {
    close(true);
    if (!choice.selected) select(choice);
  }

  /**
   * 关闭菜单并解绑文档事件。
   * @param {boolean} restore 是否将焦点交回触发按钮。
   */
  function close(restore = false) {
    if (closed) return;
    closed = true;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('scroll', position, true);
    globalThis.removeEventListener('resize', position);
    input.remove();
    list.remove();
    toggle.hidden = false;
    toggle.setAttribute('aria-expanded', 'false');
    if (restore) toggle.focus();
  }

  /**
   * 点击控件外时结束搜索。
   * @param {PointerEvent} event 指针事件。
   */
  function outside(event) {
    if (!list.contains(event.target) && !reference.contains(event.target)) {
      close();
    }
  }

  input.addEventListener('input', (event) => {
    event.stopPropagation();
    filter();
  });
  input.addEventListener('change', (event) => event.stopPropagation());
  input.addEventListener('blur', () => close());
  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (items.length) choose(items[Math.max(0, index)]);
    }
    if (
      (event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length
    ) {
      event.preventDefault();
      index = index < 0
        ? (event.key === 'ArrowDown' ? 0 : items.length - 1)
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
          items.length;
      [...list.children].forEach((item, i) =>
        item.classList.toggle('is-active', i === index)
      );
      input.setAttribute('aria-activedescendant', list.children[index].id);
      list.children[index].scrollIntoView({ block: 'nearest' });
    }
  });
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('scroll', position, true);
  globalThis.addEventListener('resize', position);
  filter();
  input.focus();
  return close;
}

/**
 * 在同一抽屉中串行执行收起和展开，以最后一次点击决定最终视图。
 * @param {HTMLElement} section 匹配卡片。
 * @param {HTMLElement} list 配置列表。
 * @return {Function} 请求打开指定视图。
 */
function initProfileDrawer(section, list) {
  const panel = dropdownPanel(section, 'matchings');
  const heading = dropdownToggle(section, 'matchings');
  const toggle = section.querySelector('[data-profile-toggle]');
  const basic = list.previousElementSibling;
  let shown = storedDropdownOpen('matchings')
    ? (storedDropdownOpen('profiles') ? 'list' : 'basic')
    : '';
  let desired = shown;
  let running = false;

  /**
   * 应用视图、可访问状态及原有标题样式。
   * @param {string} view 视图名称，空值表示收起。
   */
  function display(view) {
    list.hidden = view !== 'list';
    basic.hidden = view !== 'basic';
    panel.hidden = !view;
    setDropdownOpen(section, 'matchings', Boolean(view));
    toggle.setAttribute('aria-expanded', String(view === 'list'));
    heading.setAttribute('aria-expanded', String(view === 'basic'));
    shown = view;
  }

  /**
   * 以实际内容高度播放完整过渡，兼容尚不支持网格轨道插值的 WebView。
   * @param {boolean} opening 是否展开。
   * @return {Promise<void>} 面板到达目标高度。
   */
  async function animate(opening) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const expanded = {
      height: panel.getBoundingClientRect().height + 'px',
      opacity: 1,
      transform: 'translateY(0)',
    };
    const folded = { height: '0px', opacity: 0, transform: 'translateY(-6px)' };
    panel.style.overflow = 'hidden';
    try {
      const animation = panel.animate(
        opening ? [folded, expanded] : [expanded, folded],
        { duration: 220, easing: 'ease' },
      );
      await new Promise((resolve) => {
        animation.onfinish = resolve;
        animation.oncancel = resolve;
      });
    } finally {
      panel.style.removeProperty('overflow');
    }
  }

  /**
   * 串行收放内容并消费过渡期间最后一次点击。
   * @param {string} view 目标视图。
   * @return {Promise<void>} 抽屉稳定。
   */
  async function request(view) {
    desired = view;
    storeDropdownOpen('matchings', Boolean(view));
    if (view) storeDropdownOpen('profiles', view === 'list');
    if (running) return;
    running = true;
    try {
      while (desired !== shown) {
        if (shown) {
          panel.inert = true;
          await animate(false);
          display('');
        }
        if (desired) {
          display(desired);
          await animate(true);
        }
      }
    } finally {
      running = false;
    }
  }
  display(shown);
  heading.addEventListener(
    'click',
    () => request(desired === 'basic' ? '' : 'basic'),
  );
  toggle.addEventListener(
    'click',
    () => request(desired === 'list' ? '' : 'list'),
  );
  return request;
}

/**
 * 初始化配置列表和话题选择器，以话题行的唯一配置标识生成两处视图。
 * @param {HTMLElement} section 匹配卡片。
 * @param {Function} load 将配置恢复到现有匹配控件。
 * @return {object} 页面恢复和连通测试所需的配置入口。
 */
globalThis.initMatchingProfiles = function initMatchingProfiles(section, load) {
  const list = section.querySelector('[data-profile-list]');
  const grid = list.querySelector('[data-profile-grid]');
  const field = list.querySelector('[name="matchingProfiles"]');
  const form = section.closest('form');
  const topics = form.querySelector('[data-topic-editor]');
  const keyword = form.querySelector('[data-keyword-editor]');
  const toggle = section.querySelector('[data-profile-toggle]');
  const defaults = JSON.parse(list.dataset.defaultOptions);
  const usages = JSON.parse(list.dataset.usage);
  const profiles = JSON.parse(field.value);
  const selected = new Set();
  const request = initProfileDrawer(section, list);
  let active = profiles.find((p) => p.id === list.dataset.active) ||
    profiles.find((p) => p.id === 'default');
  let switching = false;
  let closePicker;

  /**
   * 取本地化配置名称。
   * @param {object} profile 匹配配置。
   * @return {string} 用于显示和排序的名称。
   */
  function name(profile) {
    return profile.id === 'default'
      ? list.dataset.defaultLabel
      : profile.name || list.dataset.newLabel;
  }

  /**
   * 获取独立的密钥提交字段，服务器保存的密钥始终只显示遮罩。
   * @param {string} id 配置标识。
   * @return {HTMLInputElement} 待提交密钥字段。
   */
  function secretField(id) {
    const key = 'profileKey_' + id;
    let input = form.elements.namedItem(key);
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.setAttribute('data-secret-hidden-input', '');
      list.append(input);
    }
    return input;
  }

  /**
   * 从字段名找到当前基础或高级控件。
   * @param {string} key 匹配设置属性。
   * @return {HTMLInputElement} 对应控件。
   */
  function control(key) {
    const suffix = key === 'disableThinking'
      ? 'EnableThinking'
      : key[0].toUpperCase() + key.slice(1);
    return form.elements.namedItem('matching' + suffix);
  }

  /** 将仍在编辑的内容写入独立配置字段及离线快照。 */
  function capture() {
    if (switching) return;
    for (const key of Object.keys(defaults)) {
      const element = control(key);
      if (key === 'apiKey') {
        secretField(active.id).value = element.value;
        continue;
      }
      active.options[key] = key === 'disableThinking'
        ? !element.checked
        : element.type === 'checkbox'
        ? element.checked
        : element.type === 'number'
        ? Number(element.value)
        : element.value;
    }
    active.configured =
      section.querySelector('[data-secret-display-input]').dataset
        .secretConfigured === 'true';
    active.thinking = [
      ...section.querySelectorAll(
        '[data-matching-picker="matchingModel"] [role="option"]',
      ),
    ].some((item) =>
      item.dataset.value === active.options.model &&
      item.dataset.thinking === 'true'
    );
    field.value = JSON.stringify(profiles);
  }

  /**
   * 切换共用编辑器所编辑的配置。
   * @param {object} profile 目标配置。
   */
  function edit(profile) {
    switching = true;
    active = profile;
    list.dataset.active = profile.id;
    for (const [key, value] of Object.entries(profile.options)) {
      if (key === 'apiKey') continue;
      const element = control(key);
      if (element.type === 'checkbox') {
        element.checked = key === 'disableThinking' ? !value : value;
      } else element.value = value;
    }
    load(profile, secretField(profile.id).value);
    switching = false;
    updateUsage();
    toggle.textContent = name(active);
  }

  /** 根据当前配置的调用量、价格与上限刷新高级设置。 */
  function updateUsage() {
    const el = section.querySelector('[data-profile-usage]');
    const usage = usages[active.id] ||
      { calls: 0, inputTokens: 0, outputTokens: 0, unknownUsage: 0 };
    const p = active.options;
    const cost = p.inputPrice > 0 && p.outputPrice > 0 && !usage.unknownUsage
      ? '¥' +
        ((usage.inputTokens * p.inputPrice +
          usage.outputTokens * p.outputPrice) / 1000000).toFixed(4)
      : '—';
    el.textContent = el.dataset.calls + ': ' + usage.calls + ' / ' +
      p.dailyLimit + ' · ' + el.dataset.cost + ': ' + cost;
  }

  /**
   * 从话题行读取最新的备注和归属，空白草稿不列为候选。
   * @return {Array<object>} 话题选择数据。
   */
  function topicEntries() {
    return [...topics.querySelectorAll('[data-topic-row]')].map((row) => {
      const id = row.querySelector('[data-topic-id-input]').value.trim();
      const note = row.querySelector('[data-topic-note-input]').value.trim();
      const input = row.querySelector('[data-topic-profile]');
      const profile = profiles.find((p) => p.id === input.value) ||
        profiles.find((p) => p.id === 'default');
      return { id, label: note || id, terms: [id, note], profile, input, row };
    });
  }

  /** 同步气泡与话题的单选归属，并按实际配置显示关键词操作。 */
  function refreshTopics() {
    const entries = topicEntries();
    const byId = new Map();
    for (const entry of entries) {
      if (!entry.id) continue;
      if (byId.has(entry.id)) entry.profile = byId.get(entry.id).profile;
      else byId.set(entry.id, entry);
    }
    const target = form.elements.namedItem('activeKeywordTarget').value;
    const hasRules = entries.some((entry) =>
      entry.profile.options.mode !== 'ai'
    );
    const targetEntry = entries.find((entry) =>
      entry.id && entry.id === target
    );
    setMatchingRowVisible(
      keyword,
      targetEntry ? targetEntry.profile.options.mode !== 'ai' : hasRules,
      false,
    );
    topics.classList.toggle('profiles-ai-only', !hasRules);
    for (const entry of entries) {
      entry.input.value = entry.profile.id;
      const label = name(entry.profile);
      entry.row.querySelector('[data-profile-label]').textContent = label;
      entry.row.querySelector('[data-topic-profile-toggle]').setAttribute(
        'aria-label',
        list.dataset.applyLabel + ' · ' + label,
      );
      entry.row.querySelector('[data-action="edit-topic-keywords"]').hidden =
        entry.profile.options.mode === 'ai';
    }
    for (const row of grid.querySelectorAll('[data-profile-row]')) {
      const box = row.querySelector('[data-profile-topics]');
      box.textContent = '';
      for (
        const entry of [...byId.values()].filter((e) =>
          e.profile.id === row.dataset.profileRow
        )
      ) {
        const chip = document.createElement('span');
        chip.className = 'profile-chip';
        const label = document.createElement('span');
        label.textContent = entry.label;
        chip.append(label);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.disabled = entry.profile.id === 'default';
        remove.setAttribute(
          'aria-label',
          list.dataset.removeLabel + ' · ' + entry.label,
        );
        remove.addEventListener('click', () => assign(entry, 'default'));
        chip.append(remove);
        box.append(chip);
      }
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'profile-chip profile-chip-add';
      plus.textContent = '+';
      plus.setAttribute('aria-label', list.dataset.topicLabel + ' +');
      plus.setAttribute('aria-haspopup', 'listbox');
      plus.setAttribute('aria-expanded', 'false');
      plus.addEventListener('click', () => {
        closePicker?.();
        const choices = [...byId.values()].map((e) => ({
          ...e,
          selected: e.profile.id === row.dataset.profileRow,
        }));
        closePicker = openProfilePicker(
          plus,
          list.dataset.topicLabel,
          choices,
          (e) => assign(e, row.dataset.profileRow),
        );
      });
      box.append(plus);
    }
  }

  /**
   * 更新话题的唯一归属，同时刷新两侧视图。
   * @param {object} entry 话题行。
   * @param {string} id 配置标识。
   */
  function assign(entry, id) {
    const activeRow = document.activeElement?.closest('[data-profile-row]');
    for (const item of topicEntries()) {
      if (item.row === entry.row || (entry.id && item.id === entry.id)) {
        item.input.value = id;
      }
    }
    refreshTopics();
    activeRow?.querySelector('.profile-chip-add')?.focus();
    scheduleAutoSave();
  }

  /** 同步表头选择、批量操作和默认配置保护状态。 */
  function selection() {
    const checkbox = list.querySelector('[data-profile-all]');
    for (const row of grid.querySelectorAll('[data-profile-row]')) {
      row.querySelector('[data-profile-selected]').checked = selected.has(
        row.dataset.profileRow,
      );
    }
    const eligible = [
      ...grid.querySelectorAll('[data-profile-selected]:enabled'),
    ];
    syncCheckboxState(checkbox, eligible);
    checkbox.disabled = eligible.length === 0;
    const header = grid.firstElementChild;
    header.querySelector('[data-profile-action="edit"]').disabled =
      selected.size !== 1;
    header.querySelector('[data-profile-action="copy"]').disabled =
      selected.size === 0;
    header.querySelector('[data-profile-action="delete"]').disabled =
      selected.size === 0;
  }

  /** 根据持久顺序重建配置行，并刷新关联视图。 */
  function render() {
    grid.querySelectorAll('[data-profile-row]').forEach((row) => row.remove());
    for (const profile of profiles) {
      const row = list.querySelector('template').content.firstElementChild
        .cloneNode(true);
      row.dataset.profileRow = profile.id;
      const isDefault = profile.id === 'default';
      const input = row.querySelector('[data-profile-name]');
      input.value = name(profile);
      input.disabled = isDefault;
      const checkbox = row.querySelector('[data-profile-selected]');
      checkbox.disabled = isDefault;
      checkbox.setAttribute('aria-label', name(profile));
      input.placeholder = name(profile);
      row.querySelector('[data-profile-action="delete"]').disabled =
        isDefault;
      grid.append(row);
    }
    selection();
    refreshTopics();
    toggle.textContent = name(active);
    field.value = JSON.stringify(profiles);
  }

  /**
   * 在指定位置插入新配置，复制时保留选项并引用来源的凭据。
   * @param {object|null} source 要复制的配置。
   * @param {number} index 插入位置。
   * @return {object} 新建的配置。
   */
  function insert(source, index) {
    const id = crypto.randomUUID();
    const label = source
      ? name(source).replace(/（\d+）$/u, '') || name(source)
      : list.dataset.newLabel;
    const names = new Set(profiles.map(name));
    let title = label;
    if (source || names.has(title)) {
      let number = 1;
      do {
        const suffix = source ? '（' + number + '）' : ' ' + number;
        title = label.slice(0, 100 - suffix.length) + suffix;
        number++;
      } while (names.has(title));
    }
    const options = { ...(source?.options || defaults) };
    delete options.apiKey;
    const profile = {
      id,
      name: title,
      options,
      configured: source?.configured || false,
      thinking: source?.thinking || false,
    };
    if (source) {
      profile.source = source.source || source.id;
      secretField(id).value = secretField(source.id).value;
    }
    profiles.splice(index, 0, profile);
    return profile;
  }

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-profile-action]');
    if (!button) return;
    capture();
    const row = button.closest('[data-profile-row]');
    const targets = profiles.filter((p) =>
      row ? p.id === row.dataset.profileRow : selected.has(p.id)
    );
    const action = button.dataset.profileAction;
    if (action === 'edit' && targets.length === 1) {
      edit(targets[0]);
      request('basic');
      return;
    }
    let added;
    if (action === 'add') {
      added = insert(
        null,
        row ? profiles.indexOf(targets[0]) + 1 : profiles.length,
      );
    }
    if (action === 'copy') {
      for (const source of targets) {
        added = insert(source, profiles.indexOf(source) + 1);
      }
    }
    if (action === 'delete') {
      for (const profile of targets) {
        if (profile.id === 'default') continue;
        profiles.splice(profiles.indexOf(profile), 1);
        selected.delete(profile.id);
        secretField(profile.id).remove();
        if (profile === active) edit(profiles.find((p) => p.id === 'default'));
      }
    }
    render();
    if (added) {
      const input = grid.querySelector(
        '[data-profile-row="' + added.id + '"] [data-profile-name]',
      );
      input.focus();
      input.select();
    }
    scheduleAutoSave();
  });
  list.addEventListener('input', (event) => {
    if (!event.target.matches('[data-profile-name]:enabled')) return;
    const profile = profiles.find((p) =>
      p.id === event.target.closest('[data-profile-row]').dataset.profileRow
    );
    profile.name = event.target.value;
    event.target.closest('[data-profile-row]').querySelector(
      '[data-profile-selected]',
    ).setAttribute('aria-label', name(profile));
    toggle.textContent = name(active);
    refreshTopics();
    capture();
  });
  list.addEventListener('change', (event) => {
    if (event.target.matches('[data-profile-all]')) {
      selected.clear();
      if (event.target.checked) {
        for (const p of profiles) {
          if (p.id !== 'default') selected.add(p.id);
        }
      }
    } else if (event.target.matches('[data-profile-selected]:enabled')) {
      const id = event.target.closest('[data-profile-row]').dataset.profileRow;
      if (event.target.checked) selected.add(id);
      else selected.delete(id);
    } else return;
    selection();
  });
  grid.addEventListener(
    'pointerdown',
    (event) => beginRuleDrag(event, 'profile', topics, keyword),
  );
  grid.addEventListener('keydown', (event) => {
    if (
      !event.target.closest('[data-rule-drag-handle]') ||
      !['ArrowUp', 'ArrowDown'].includes(event.key)
    ) return;
    const row = event.target.closest('[data-profile-row]');
    const adjacent = event.key === 'ArrowUp'
      ? row.previousElementSibling
      : row.nextElementSibling;
    if (!adjacent?.matches('[data-profile-row]')) return;
    event.preventDefault();
    if (event.key === 'ArrowUp') adjacent.before(row);
    else adjacent.after(row);
    row.querySelector('[data-rule-drag-handle]').focus();
    row.dispatchEvent(new Event('profile-reorder', { bubbles: true }));
  });
  grid.addEventListener('profile-reorder', () => {
    const ordered = [...grid.querySelectorAll('[data-profile-row]')].map(
      (row) => profiles.find((p) => p.id === row.dataset.profileRow),
    );
    profiles.splice(0, profiles.length, ...ordered);
    capture();
    scheduleAutoSave();
  });
  topics.addEventListener('click', (event) => {
    const button = event.target.closest('[data-topic-profile-toggle]');
    if (!button) {
      if (event.target.closest('[data-action="edit-topic-keywords"]')) {
        refreshTopics();
      }
      return;
    }
    closePicker?.();
    const entry = topicEntries().find((e) => e.row.contains(button));
    const choices = profiles.map((p) => ({
      id: p.id,
      label: name(p),
      terms: [name(p)],
      selected: p === entry.profile,
    }));
    closePicker = openProfilePicker(
      button,
      list.dataset.applyLabel,
      choices,
      (p) => assign(entry, p.id),
    );
  });
  topics.addEventListener('input', (event) => {
    if (event.target.matches('[data-topic-id-input],[data-topic-note-input]')) {
      refreshTopics();
    }
  });
  new MutationObserver(refreshTopics).observe(
    topics.querySelector('.topic-rule-grid'),
    { childList: true },
  );
  form.addEventListener('profile-capture', capture);
  form.addEventListener('profile-saved', (event) => {
    const submitted = JSON.parse(event.detail.get('matchingProfiles'));
    for (const profile of profiles) {
      if (profile.source && submitted.some((row) => row.id === profile.id)) {
        delete profile.source;
      }
    }
    if (
      control('apiKey').value === event.detail.get('profileKey_' + active.id)
    ) control('apiKey').value = '';
  });
  section.addEventListener('change', (event) => {
    if (switching || !event.target.name?.startsWith('matching')) return;
    capture();
    updateUsage();
    if (event.target === control('mode')) refreshTopics();
  });
  return {
    /** 恢复离线页面或服务端提供的当前配置。 */
    restore() {
      topics.querySelectorAll('.profile-search').forEach((input) =>
        input.remove()
      );
      topics.querySelectorAll('[data-topic-profile-toggle]').forEach(
        (button) => {
          button.hidden = false;
          button.setAttribute('aria-expanded', 'false');
        },
      );
      edit(active);
      render();
    },
    /**
     * 给模型请求附加对应的凭据标识。
     * @param {FormData} data 请求字段。
     */
    identify(data) {
      data.set('matchingCredentialProfile', active.id);
      if (active.source) data.set('matchingCopySource', active.source);
    },
  };
};
