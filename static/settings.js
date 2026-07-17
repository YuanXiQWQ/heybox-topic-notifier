/**
 * @file 本文件负责设置页的前端交互、自动保存和测试通知反馈。
 */
/**
 * 当前自动保存表单。
 */
let autoSaveForm;
/**
 * 当前自动保存关联的关键词编辑器。
 */
let autoSaveKeywordEditor;
/**
 * 当前自动保存关联的话题编辑器。
 */
let autoSaveTopicEditor;
/**
 * 自动保存防抖定时器。
 */
let autoSaveTimer;
/**
 * 自动保存请求控制器。
 */
let autoSaveController;
/**
 * 测试通知错误详情页临时地址。
 */
let testNotifyErrorDetailsUrl;
/**
 * 测试通知状态清理定时器。
 */
let testNotifyStatusTimer;
/**
 * 最近一次成功保存的表单签名。
 */
let lastSavedSignature = '';
/**
 * 保存成功后是否需要刷新页面。
 */
let reloadAfterSave = false;
/**
 * 通知和轮询设置行展开收起动画时间。
 */
const notificationTransitionMs = 190;
/**
 * 设置页下拉面板状态在本地存储中的键前缀。
 */
const dropdownStoragePrefix = 'heybox-notifier.settings.dropdown.';

/**
 * 初始化设置页所有编辑器。
 */
function initSettingsEditors() {
  const topicEditor = document.querySelector('[data-topic-editor]');
  const keywordEditor = document.querySelector('[data-keyword-editor]');

  if (!topicEditor || !keywordEditor) {
    return;
  }

  initDropdown(topicEditor, 'topics');
  initDropdown(keywordEditor, 'keywords');
  initTopicEditor(topicEditor, keywordEditor);
  initKeywordEditor(keywordEditor);
  initNotificationSettings();
  initPollingSettings();
  initThemePicker();
  initKeywordRuleStorage(topicEditor, keywordEditor);
  initAutoSave(topicEditor.closest('form'), topicEditor, keywordEditor);
  updateKeywordSummary(keywordEditor);
}

/**
 * 初始化通知设置联动和测试通知交互。
 */
function initNotificationSettings() {
  const providerSelect = document.querySelector('[data-notification-provider-select]');
  const emailServiceSelect = document.querySelector('[data-notification-email-service-select]');
  const serviceSelect = document.querySelector('[data-notification-webhook-service-select]');
  const testNotifyButton = document.querySelector('[data-test-notify-button]');
  const testNotifyStatus = document.querySelector('[data-test-notify-status]');
  const rows = Array.from(document.querySelectorAll('[data-notification-field]'));

  if (!(providerSelect instanceof HTMLSelectElement)) {
    return;
  }

  let visibleFields = desiredNotificationFields();
  let transitionToken = 0;

  /**
   * 计算当前通知方式需要显示的字段集合。
   *
   * @return {Set<string>} 需要显示的通知字段名称集合。
   */
  function desiredNotificationFields() {
    if (providerSelect.value === 'email') {
      const fields = [
        'email-service',
        'email-address',
        'email-from',
      ];

      if (emailServiceSelect?.value === 'api') {
        fields.push('email-api-url', 'email-api-token');
      } else {
        fields.push(
            'smtp-host',
            'smtp-port',
            'smtp-secure',
            'smtp-username',
            'smtp-password',
        );
      }

      return new Set(fields);
    }

    if (providerSelect.value !== 'webhook') {
      return new Set();
    }

    return new Set([
      'webhook-service',
      serviceSelect?.value || 'custom',
    ]);
  }

  /**
   * 获取通知设置行对应的字段名称。
   *
   * @param {HTMLElement} row 通知设置行元素。
   * @return {string|undefined} 通知字段名称。
   */
  function rowName(row) {
    return row.dataset.notificationField;
  }

  /**
   * 显示通知设置行。
   *
   * @param {HTMLElement} row 通知设置行元素。
   * @param {boolean} animate 是否播放展开动画。
   * @param {number} token 本轮过渡标记。
   */
  function showRow(row, animate, token) {
    row.hidden = false;
    row.dataset.notificationTransitionToken = String(token);

    if (!animate) {
      row.classList.remove('is-collapsed');
      return;
    }

    row.classList.add('is-collapsed');
    row.getBoundingClientRect();
    row.classList.remove('is-collapsed');
  }

  /**
   * 隐藏通知设置行。
   *
   * @param {HTMLElement} row 通知设置行元素。
   * @param {boolean} animate 是否播放收起动画。
   * @param {number} token 本轮过渡标记。
   */
  function hideRow(row, animate, token) {
    row.dataset.notificationTransitionToken = String(token);
    row.classList.add('is-collapsed');

    if (!animate) {
      row.hidden = true;
      return;
    }

    setTimeout(() => {
      if (
          row.dataset.notificationTransitionToken === String(token) &&
          row.classList.contains('is-collapsed')
      ) {
        row.hidden = true;
      }
    }, notificationTransitionMs);
  }

  /**
   * 根据字段集合更新通知设置行显示状态。
   *
   * @param {Set<string>} fields 需要显示的字段集合。
   * @param {boolean} animate 是否播放过渡动画。
   * @param {number} token 本轮过渡标记。
   */
  function applyNotificationFields(fields, animate, token) {
    for (const row of rows) {
      if (fields.has(rowName(row))) {
        showRow(row, animate, token);
      } else {
        hideRow(row, animate, token);
      }
    }

    if (testNotifyButton instanceof HTMLButtonElement) {
      testNotifyButton.hidden = providerSelect.value === 'disabled';
      if (testNotifyStatus instanceof HTMLElement) {
        testNotifyStatus.hidden = testNotifyButton.hidden;
      }
      if (testNotifyButton.hidden) {
        setTestNotifyStatus('');
      }
    }
  }

  /**
   * 同步当前通知方式对应的设置字段。
   *
   * @param {boolean} animate 是否播放过渡动画。
   */
  function syncNotificationFields(animate) {
    const targetFields = desiredNotificationFields();
    const token = ++transitionToken;

    applyNotificationFields(targetFields, animate, token);

    visibleFields = targetFields;
  }

  providerSelect.addEventListener('change', () => {
    syncNotificationFields(true);
    scheduleAutoSave();
  });

  emailServiceSelect?.addEventListener('change', () => {
    syncNotificationFields(true);
    scheduleAutoSave();
  });

  serviceSelect?.addEventListener('change', () => {
    syncNotificationFields(true);
    scheduleAutoSave();
  });

  testNotifyButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    if (!(testNotifyButton instanceof HTMLButtonElement)) {
      return;
    }

    testNotifyButton.disabled = true;
    setTestNotifyStatus(testNotifyButton.dataset.testNotifySending ?? '', 'pending', {
      persistMs: 0,
    });
    try {
      const saved = await saveSettingsNow();
      if (saved) {
        await sendTestNotification(testNotifyButton);
      } else {
        setTestNotifyStatus(testNotifyButton.dataset.testNotifyFailed ?? '', 'error');
      }
    } finally {
      testNotifyButton.disabled = false;
    }
  });

  applyNotificationFields(visibleFields, false, ++transitionToken);
}

/**
 * 初始化轮询设置联动。
 */
function initPollingSettings() {
  const enabledToggle = document.querySelector('[data-polling-enabled-toggle]');
  const intervalValueInput = document.querySelector('[data-polling-interval-value]');
  const intervalUnitSelect = document.querySelector('[data-polling-interval-unit]');
  const subMinuteHint = document.querySelector('[data-polling-sub-minute-hint]');
  const section = document.querySelector('[data-polling-section]');
  const rows = Array.from(document.querySelectorAll('[data-polling-field]'));

  if (!(enabledToggle instanceof HTMLInputElement)) {
    return;
  }

  let transitionToken = 0;

  /**
   * 显示轮询设置行。
   *
   * @param {HTMLElement} row 轮询设置行元素。
   * @param {boolean} animate 是否播放展开动画。
   * @param {number} token 本轮过渡标记。
   */
  function showRow(row, animate, token) {
    row.hidden = false;
    row.dataset.pollingTransitionToken = String(token);

    if (!animate) {
      row.classList.remove('is-collapsed');
      return;
    }

    row.classList.add('is-collapsed');
    row.getBoundingClientRect();
    row.classList.remove('is-collapsed');
  }

  /**
   * 隐藏轮询设置行。
   *
   * @param {HTMLElement} row 轮询设置行元素。
   * @param {boolean} animate 是否播放收起动画。
   * @param {number} token 本轮过渡标记。
   */
  function hideRow(row, animate, token) {
    row.dataset.pollingTransitionToken = String(token);
    row.classList.add('is-collapsed');

    if (!animate) {
      row.hidden = true;
      return;
    }

    setTimeout(() => {
      if (
          row.dataset.pollingTransitionToken === String(token) &&
          row.classList.contains('is-collapsed')
      ) {
        row.hidden = true;
      }
    }, notificationTransitionMs);
  }

  /**
   * 校验并修正轮询间隔的最小值。
   *
   * @return {boolean} 间隔有效或无需校验时返回 true。
   */
  function validateMinimumInterval() {
    if (
        !(intervalValueInput instanceof HTMLInputElement) ||
        !(intervalUnitSelect instanceof HTMLSelectElement)
    ) {
      return true;
    }

    intervalValueInput.min = intervalUnitSelect.value === 'second' ? '3' : '1';

    const intervalValue = Number(intervalValueInput.value);
    if (
        intervalUnitSelect.value === 'second' &&
        Number.isFinite(intervalValue) &&
        intervalValue < 3
    ) {
      intervalValueInput.value = '3';
      if (section instanceof HTMLElement) {
        showToast(section, section.dataset.pollingIntervalTooShort);
      }
      return false;
    }

    return true;
  }

  /**
   * 同步低于一分钟轮询间隔的提示显示状态。
   */
  function syncSubMinuteHint() {
    if (
        !(subMinuteHint instanceof HTMLElement) ||
        !(intervalValueInput instanceof HTMLInputElement) ||
        !(intervalUnitSelect instanceof HTMLSelectElement)
    ) {
      return;
    }

    const intervalValue = Number(intervalValueInput.value);
    subMinuteHint.hidden = !(
        intervalUnitSelect.value === 'second' &&
        Number.isFinite(intervalValue) &&
        intervalValue < 60
    );
  }

  /**
   * 同步轮询设置行显示状态。
   *
   * @param {boolean} animate 是否播放过渡动画。
   */
  function syncPollingFields(animate) {
    const token = ++transitionToken;

    for (const row of rows) {
      if (enabledToggle.checked) {
        showRow(row, animate, token);
      } else {
        hideRow(row, animate, token);
      }
    }
  }

  enabledToggle.addEventListener('change', () => {
    syncPollingFields(true);
    scheduleAutoSave();
  });

  intervalValueInput?.addEventListener('change', () => {
    validateMinimumInterval();
    syncSubMinuteHint();
  });

  intervalValueInput?.addEventListener('blur', () => {
    validateMinimumInterval();
    syncSubMinuteHint();
  });

  intervalValueInput?.addEventListener('input', () => {
    syncSubMinuteHint();
  });

  intervalUnitSelect?.addEventListener('change', () => {
    validateMinimumInterval();
    syncSubMinuteHint();
  });

  validateMinimumInterval();
  syncSubMinuteHint();
  syncPollingFields(false);
}

/**
 * 初始化设置页下拉面板。
 *
 * @param {HTMLElement} editor 下拉面板所属编辑器。
 * @param {string} name 下拉面板名称。
 */
function initDropdown(editor, name) {
  const panel = dropdownPanel(editor, name);
  const toggle = dropdownToggle(editor, name);
  panel.hidden = false;
  setDropdownOpen(editor, name, storedDropdownOpen(name), {persist: false});

  toggle.addEventListener('click', () => {
    const className = `is-${name.slice(0, -1)}-open`;
    const isOpen = !editor.classList.contains(className);
    setDropdownOpen(editor, name, isOpen, {persist: true});
  });
}

/**
 * 设置下拉面板展开状态。
 *
 * @param {HTMLElement} editor 下拉面板所属编辑器。
 * @param {string} name 下拉面板名称。
 * @param {boolean} isOpen 是否展开。
 * @param {Object} options 展开状态选项。
 */
function setDropdownOpen(editor, name, isOpen, options = {}) {
  const panel = dropdownPanel(editor, name);
  const toggle = dropdownToggle(editor, name);
  const className = `is-${name.slice(0, -1)}-open`;

  editor.classList.toggle(className, isOpen);
  panel.setAttribute('aria-hidden', String(!isOpen));
  panel.inert = !isOpen;
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.classList.toggle('is-open', isOpen);

  if (options.persist) {
    storeDropdownOpen(name, isOpen);
  }
}

/**
 * 获取指定名称的下拉面板元素。
 *
 * @param {HTMLElement} editor 下拉面板所属编辑器。
 * @param {string} name 下拉面板名称。
 * @return {HTMLElement} 下拉面板元素。
 */
function dropdownPanel(editor, name) {
  return editor.querySelector(`[data-${name.slice(0, -1)}-panel]`);
}

/**
 * 获取指定名称的下拉按钮元素。
 *
 * @param {HTMLElement} editor 下拉面板所属编辑器。
 * @param {string} name 下拉面板名称。
 * @return {HTMLButtonElement} 下拉按钮元素。
 */
function dropdownToggle(editor, name) {
  return editor.querySelector(`[data-action="toggle-${name}"]`);
}

/**
 * 读取下拉面板本地存储中的展开状态。
 *
 * @param {string} name 下拉面板名称。
 * @return {boolean} 已存储为展开时返回 true。
 */
function storedDropdownOpen(name) {
  try {
    return localStorage.getItem(dropdownStorageKey(name)) === 'open';
  } catch {
    return false;
  }
}

/**
 * 存储下拉面板展开状态。
 *
 * @param {string} name 下拉面板名称。
 * @param {boolean} isOpen 是否展开。
 */
function storeDropdownOpen(name, isOpen) {
  try {
    localStorage.setItem(dropdownStorageKey(name), isOpen ? 'open' : 'closed');
  } catch {
    // Keep the dropdown usable when browser storage is unavailable.
  }
}

/**
 * 生成下拉面板状态存储键。
 *
 * @param {string} name 下拉面板名称。
 * @return {string} 本地存储键。
 */
function dropdownStorageKey(name) {
  return `${dropdownStoragePrefix}${name}`;
}

/**
 * 初始化话题编辑器。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 */
function initTopicEditor(topicEditor, keywordEditor) {
  topicEditor.addEventListener('click', (event) => {
    const button = actionButtonFromEvent(event);
    if (!button) {
      return;
    }

    if (button.dataset.action === 'insert-topic') {
      insertTopicRow(topicEditor, button);
      scheduleAutoSave();
      return;
    }

    if (button.dataset.action === 'delete-topics') {
      deleteTopicRows(topicEditor, keywordEditor, button);
      scheduleAutoSave();
      return;
    }

    if (button.dataset.action === 'edit-topic-keywords') {
      switchKeywordTarget(topicEditor, keywordEditor, button);
      scheduleAutoSave();
    }
  });

  topicEditor.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    let shouldSave = false;

    if (target.matches('[data-role=\'select-all-topics\']')) {
      topicEditor.querySelectorAll('[data-role=\'select-topic-row\']').forEach((checkbox) => {
        checkbox.checked = target.checked;
      });
    }

    if (target.matches('[data-role=\'enable-all-topics\']')) {
      topicEditor.querySelectorAll('[data-role=\'topic-enabled\']').forEach((checkbox) => {
        checkbox.checked = target.checked;
      });
      shouldSave = true;
    }

    if (target.matches('[data-role=\'topic-enabled\']')) {
      shouldSave = true;
    }

    if (shouldSave) {
      scheduleAutoSave();
    }
  });

  topicEditor.addEventListener('input', () => {
    updateActiveTopicSummary(topicEditor);
    scheduleAutoSave();
  });
}

/**
 * 初始化关键词编辑器。
 *
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 */
function initKeywordEditor(keywordEditor) {
  keywordEditor.addEventListener('click', (event) => {
    const button = actionButtonFromEvent(event);
    if (!button) {
      return;
    }

    if (button.dataset.action === 'insert-keyword') {
      insertKeywordRow(keywordEditor, button);
      updateKeywordSummary(keywordEditor);
      scheduleAutoSave();
      return;
    }

    if (button.dataset.action === 'delete-keywords') {
      deleteKeywordRows(keywordEditor, button);
      updateKeywordSummary(keywordEditor);
      scheduleAutoSave();
      return;
    }

    if (button.dataset.action === 'toggle-keyword-option') {
      toggleKeywordOption(button);
      scheduleAutoSave();
    }
  });

  keywordEditor.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    let shouldSave = false;

    if (target.matches('[data-role=\'select-all-keywords\']')) {
      keywordEditor.querySelectorAll('[data-role=\'select-keyword-row\']').forEach((checkbox) => {
        checkbox.checked = target.checked;
      });
    }

    if (target.matches('[data-role=\'select-keyword-location\']')) {
      const location = target.dataset.location;
      keywordEditor
          .querySelectorAll(`[name$="_location_${location}"]`)
          .forEach((checkbox) => {
            checkbox.checked = target.checked;
          });
      shouldSave = true;
    }

    if (target.name.includes('_location_')) {
      shouldSave = true;
    }

    updateKeywordSummary(keywordEditor);
    if (shouldSave) {
      scheduleAutoSave();
    }
  });

  keywordEditor.addEventListener('input', () => {
    updateKeywordSummary(keywordEditor);
    scheduleAutoSave();
  });
}

/**
 * 从事件中解析操作按钮。
 *
 * @param {Event} event DOM 事件。
 * @return {HTMLButtonElement|undefined} 操作按钮元素，未命中时返回 undefined。
 */
function actionButtonFromEvent(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return undefined;
  }

  const button = target.closest('[data-action]');
  return button instanceof HTMLButtonElement ? button : undefined;
}

/**
 * 初始化关键词规则在话题和关键词编辑器之间的同步。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 */
function initKeywordRuleStorage(topicEditor, keywordEditor) {
  const activeTarget = activeKeywordTargetInput().value || 'common';
  const commonInput = commonKeywordRulesInput();

  if (activeTarget === 'common') {
    commonInput.value = serializeKeywordRows(keywordEditor);
  } else {
    const activeRow = findActiveTopicRow(topicEditor, activeTarget);
    if (activeRow) {
      setTopicKeywordRules(activeRow, serializeKeywordRows(keywordEditor));
    }
  }

  topicEditor.dataset.commonKeywords = commonInput.value || '[]';
  topicEditor.closest('form')?.addEventListener('submit', () => {
    persistCurrentKeywordRows(topicEditor, keywordEditor);
  });
}

/**
 * 获取通用关键词规则隐藏输入框。
 *
 * @return {HTMLInputElement} 通用关键词规则输入框。
 */
function commonKeywordRulesInput() {
  return document.querySelector('[data-common-keyword-rules]');
}

/**
 * 查找指定活动目标对应的话题行。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {string} activeTarget 活动关键词目标。
 * @return {HTMLElement|undefined} 话题行元素。
 */
function findActiveTopicRow(topicEditor, activeTarget) {
  return topicEditor.querySelector('[data-topic-row][data-active-keyword-target="true"]') ??
      findTopicRowById(topicEditor, activeTarget);
}

/**
 * 初始化主题色和暗色模式控件。
 */
function initThemePicker() {
  const colorInput = document.querySelector('[data-theme-color-input]');
  const darkModeInput = document.querySelector('[data-dark-mode-input]');

  if (colorInput instanceof HTMLInputElement) {
    colorInput.addEventListener('input', () => {
      document.documentElement.style.setProperty('--theme-color', colorInput.value);
      scheduleAutoSave();
    });
  }

  if (darkModeInput instanceof HTMLInputElement) {
    darkModeInput.addEventListener('change', () => {
      document.documentElement.dataset.colorMode = darkModeInput.checked ? 'dark' : 'light';
      scheduleAutoSave();
    });
  }
}

/**
 * 初始化表单自动保存。
 *
 * @param {HTMLFormElement|null} form 设置表单。
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 */
function initAutoSave(form, topicEditor, keywordEditor) {
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  autoSaveForm = form;
  autoSaveTopicEditor = topicEditor;
  autoSaveKeywordEditor = keywordEditor;
  lastSavedSignature = settingsSignature();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveSettingsNow();
  });

  form.addEventListener('input', (event) => {
    if (isEditorEvent(event)) {
      return;
    }

    scheduleAutoSave();
  });

  form.addEventListener('change', (event) => {
    if (isEditorEvent(event)) {
      return;
    }

    const target = event.target;
    if (target instanceof HTMLSelectElement && target.name === 'locale') {
      reloadAfterSave = true;
    }

    scheduleAutoSave();
  });
}

/**
 * 判断事件是否来自可编辑控件。
 *
 * @param {Event} event DOM 事件。
 * @return {boolean} 来自编辑控件时返回 true。
 */
function isEditorEvent(event) {
  const target = event.target;
  return target instanceof Element &&
      Boolean(target.closest('[data-topic-editor], [data-keyword-editor]'));
}

/**
 * 安排一次自动保存。
 */
function scheduleAutoSave() {
  if (!autoSaveForm) {
    return;
  }

  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    void saveSettingsNow();
  }, 450);
}

/**
 * 立即保存当前设置表单。
 *
 * @return {Promise<boolean>} 保存成功或无需保存时返回 true，保存失败时返回 false。
 */
async function saveSettingsNow() {
  if (!autoSaveForm || !autoSaveTopicEditor || !autoSaveKeywordEditor) {
    return true;
  }

  clearTimeout(autoSaveTimer);
  persistCurrentKeywordRows(autoSaveTopicEditor, autoSaveKeywordEditor);

  const signature = settingsSignature();
  if (signature === lastSavedSignature) {
    return true;
  }

  autoSaveController?.abort();
  autoSaveController = new AbortController();
  setAutoSaveStatus('saving');

  try {
    const response = await fetch(autoSaveForm.action, {
      body: new FormData(autoSaveForm),
      headers: {'x-autosave': '1'},
      method: autoSaveForm.method || 'post',
      signal: autoSaveController.signal,
    });

    if (!response.ok) {
      setAutoSaveStatus('error');
      return false;
    }

    lastSavedSignature = signature;
    setAutoSaveStatus('saved');
    if (reloadAfterSave) {
      location.reload();
    }
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return false;
    }

    setAutoSaveStatus('error');
    return false;
  }
}

/**
 * 发送测试通知并更新发送状态。
 *
 * @param {HTMLButtonElement} testNotifyButton 测试通知按钮。
 */
async function sendTestNotification(testNotifyButton) {
  const fallbackError = testNotifyButton?.dataset?.testNotifyFailed ?? '';

  try {
    const response = await fetch('/test-notify', {
      headers: {'x-test-notify': '1'},
      method: 'POST',
    });
    const text = await response.text();
    if (response.ok) {
      setTestNotifyStatus(text, 'success');
    } else {
      const statusLine = `HTTP ${response.status}${
          response.statusText ? ` ${response.statusText}` : ''
      }`;
      setTestNotifyStatus(fallbackError, 'error', {
        errorDetails: [statusLine, text || fallbackError].join('\n\n'),
      });
    }
  } catch (error) {
    const errorDetails = error instanceof Error ? error.message : fallbackError;
    setTestNotifyStatus(fallbackError, 'error', {errorDetails});
  }
}

/**
 * 更新测试通知的状态文案和错误详情入口。
 *
 * @param {string} text 状态文案。
 * @param {string} state 状态类型。
 * @param {Object} options 状态展示选项。
 */
function setTestNotifyStatus(text, state = '', options = {}) {
  const status = document.querySelector('[data-test-notify-status]');
  if (!status) {
    return;
  }

  clearTimeout(testNotifyStatusTimer);
  const statusText = status.querySelector('[data-test-notify-status-text]');
  if (statusText) {
    statusText.textContent = text;
  } else {
    status.textContent = text;
  }
  updateTestNotifyErrorLink(status, state === 'error' ? options.errorDetails : undefined);

  if (state) {
    status.dataset.state = state;
  } else {
    delete status.dataset.state;
  }

  const persistMs = options.persistMs ?? (state === 'error' ? 0 : 2200);
  if (text && persistMs > 0) {
    testNotifyStatusTimer = setTimeout(() => {
      const currentStatusText = status.querySelector('[data-test-notify-status-text]') ?? status;
      if (currentStatusText.textContent === text) {
        currentStatusText.textContent = '';
        updateTestNotifyErrorLink(status);
        delete status.dataset.state;
      }
    }, persistMs);
  }
}

/**
 * 更新测试通知错误详情链接。
 *
 * @param {HTMLElement} status 测试通知状态容器。
 * @param {string|undefined} errorDetails 错误详情文本。
 */
function updateTestNotifyErrorLink(status, errorDetails) {
  const errorLink = status.querySelector('[data-test-notify-error-link]');
  if (!(errorLink instanceof HTMLAnchorElement)) {
    return;
  }

  if (testNotifyErrorDetailsUrl) {
    URL.revokeObjectURL(testNotifyErrorDetailsUrl);
    testNotifyErrorDetailsUrl = undefined;
  }

  if (!errorDetails) {
    errorLink.hidden = true;
    errorLink.removeAttribute('href');
    return;
  }

  testNotifyErrorDetailsUrl = URL.createObjectURL(
      new Blob(
          [renderTestNotifyErrorPage(errorLink, errorDetails)],
          {type: 'text/html;charset=utf-8'},
      ),
  );
  errorLink.href = testNotifyErrorDetailsUrl;
  errorLink.hidden = false;
}

/**
 * 渲染测试通知错误详情页面。
 *
 * @param {HTMLAnchorElement} errorLink 错误详情链接元素。
 * @param {string} errorDetails 错误详情文本。
 * @return {string} 错误详情 HTML 页面。
 */
function renderTestNotifyErrorPage(errorLink, errorDetails) {
  const appName = errorLink.dataset.errorAppName || document.title || 'Heybox Topic Notifier';
  const appOrigin = globalThis.location?.origin || '';
  const colorMode = errorLink.dataset.errorDarkMode === 'true' ? 'dark' : 'light';
  const errorTitle = errorLink.dataset.errorTitle || 'Error message';
  const locale = errorLink.dataset.errorLocale || document.documentElement.lang || 'zh-CN';
  const generatedAt = new Date().toLocaleString();
  const navDashboard = errorLink.dataset.errorNavDashboard || 'Dashboard';
  const navHistory = errorLink.dataset.errorNavHistory || 'History';
  const navSettings = errorLink.dataset.errorNavSettings || 'Settings';
  const returnLabel = errorLink.dataset.errorReturnLabel || navSettings;
  const summary = errorLink.dataset.errorSummary || errorTitle;
  const themeColor = errorLink.dataset.errorThemeColor || '#BD7FFF';

  return `<!doctype html>
<html
  lang="${escapeHtml(locale)}"
  data-color-mode="${escapeHtml(colorMode)}"
  style="--theme-color: ${escapeHtml(themeColor)}"
>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(appName)}</title>
  <link rel="icon" href="https://cdn.max-c.com/heybox/logo/app_251.png">
  <link rel="stylesheet" href="${escapeHtml(appOrigin)}/static/app.css">
  <style>
    .error-detail-content {
      background: var(--control-bg);
      border: 1px solid var(--control-border);
      border-radius: 6px;
      box-sizing: border-box;
      font: 15px/1.7 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      margin: 0;
      min-height: 240px;
      overflow: auto;
      padding: 18px;
      white-space: pre-wrap;
      width: min(100%, 960px);
      word-break: break-word;
    }
    .settings-list > div.error-detail-row {
      grid-template-columns: 1fr;
      padding: 22px;
    }
    .error-detail-row dd {
      display: flex;
      justify-content: center;
      margin: 0;
      min-width: 0;
    }
    .error-detail-actions {
      display: flex;
      justify-content: center;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <header class="topbar">
    <a class="brand" href="${escapeHtml(appOrigin)}/">${escapeHtml(appName)}</a>
    <nav class="primary-nav" aria-label="Primary">
      <a href="${escapeHtml(appOrigin)}/">${escapeHtml(navDashboard)}</a>
      <a href="${escapeHtml(appOrigin)}/settings">${escapeHtml(navSettings)}</a>
      <a href="${escapeHtml(appOrigin)}/history">${escapeHtml(navHistory)}</a>
    </nav>
  </header>
  <main class="shell">
    <section class="page-heading">
      <div>
        <h1>${escapeHtml(errorTitle)}</h1>
        <p>${escapeHtml(summary)} - ${escapeHtml(generatedAt)}</p>
      </div>
    </section>
    <section class="settings-group" aria-label="${escapeHtml(errorTitle)}">
      <dl class="settings-list">
        <div class="error-detail-row">
          <dd><pre class="error-detail-content">${escapeHtml(errorDetails)}</pre></dd>
        </div>
      </dl>
      <div class="error-detail-actions">
        <a class="button-link" href="${escapeHtml(appOrigin)}/settings">${
      escapeHtml(returnLabel)
  }</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

/**
 * 转义 HTML 特殊字符。
 *
 * @param {*} value 待转义内容。
 * @return {string} 转义后的字符串。
 */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;',
      })[char]);
}

/**
 * 生成当前设置表单签名。
 *
 * @return {string} 表单字段序列化后的签名。
 */
function settingsSignature() {
  if (!autoSaveForm) {
    return '';
  }

  const params = new URLSearchParams();
  for (const [key, value] of new FormData(autoSaveForm).entries()) {
    params.append(key, String(value));
  }
  return params.toString();
}

/**
 * 更新自动保存状态文案。
 *
 * @param {string} state 自动保存状态。
 * @param {string|undefined} text 自定义状态文案。
 */
function setAutoSaveStatus(state, text) {
  const status = document.querySelector('[data-autosave-status]');
  if (!status || !autoSaveForm) {
    return;
  }

  status.dataset.state = state;
  status.textContent = text ??
      autoSaveForm.dataset[`autosave${state[0].toUpperCase()}${state.slice(1)}`] ??
      '';
}

/**
 * 在话题规则表中插入一行。
 *
 * @param {HTMLElement} editor 话题编辑器元素。
 * @param {HTMLButtonElement} actionButton 触发插入的操作按钮。
 */
function insertTopicRow(editor, actionButton) {
  const template = editor.querySelector('[data-topic-row-template]');
  const grid = editor.querySelector('.topic-rule-grid');
  const row = actionButton.closest('[data-topic-row]');
  const fragment = template.content.cloneNode(true);
  const newRow = fragment.querySelector('[data-topic-row]');

  if (row) {
    row.after(newRow);
  } else {
    const firstRow = grid.querySelector('[data-topic-row]');
    if (firstRow) {
      firstRow.before(newRow);
    } else {
      grid.append(newRow);
    }
  }

  reindexTopicRows(editor);
  newRow.querySelector('[data-topic-id-input]').focus();
}

/**
 * 删除已选中的话题规则行。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 * @param {HTMLButtonElement} actionButton 触发删除的操作按钮。
 */
function deleteTopicRows(topicEditor, keywordEditor, actionButton) {
  const selectedRows = Array.from(topicEditor.querySelectorAll('[data-topic-row]'))
      .filter((row) => row.querySelector('[data-role=\'select-topic-row\']')?.checked);

  if (selectedRows.length > 0) {
    selectedRows.forEach((row) => row.remove());
  } else {
    const row = actionButton.closest('[data-topic-row]');
    if (!row) {
      showToast(topicEditor, topicEditor.dataset.deleteMessage);
      return;
    }

    row.remove();
  }

  ensureAtLeastOneTopicRow(topicEditor);
  reindexTopicRows(topicEditor);

  const activeTarget = activeKeywordTargetInput().value;
  if (activeTarget !== 'common' && !findTopicRowById(topicEditor, activeTarget)) {
    switchKeywordTarget(topicEditor, keywordEditor, commonKeywordButton(topicEditor));
  }

  updateActiveTopicSummary(topicEditor);
}

/**
 * 确保话题规则表至少保留一行。
 *
 * @param {HTMLElement} editor 话题编辑器元素。
 */
function ensureAtLeastOneTopicRow(editor) {
  if (editor.querySelector('[data-topic-row]')) {
    return;
  }

  const template = editor.querySelector('[data-topic-row-template]');
  const grid = editor.querySelector('.topic-rule-grid');
  grid.append(template.content.cloneNode(true));
}

/**
 * 重新生成话题规则行的字段索引。
 *
 * @param {HTMLElement} editor 话题编辑器元素。
 */
function reindexTopicRows(editor) {
  editor.querySelectorAll('[data-role=\'select-all-topics\']').forEach((checkbox) => {
    checkbox.checked = false;
  });

  editor.querySelectorAll('[data-topic-row]').forEach((row, index) => {
    row.querySelectorAll('input').forEach((input) => {
      if (!input.name) {
        return;
      }

      input.name = input.name.replace(/topic_(?:__index__|\d+)_/, `topic_${index}_`);
    });
  });
}

/**
 * 切换当前正在编辑关键词规则的话题目标。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 * @param {HTMLButtonElement} button 目标话题的关键词编辑按钮。
 */
function switchKeywordTarget(topicEditor, keywordEditor, button) {
  persistCurrentKeywordRows(topicEditor, keywordEditor);

  const row = button.closest('[data-topic-row]');
  const target = row ? row.querySelector('[data-topic-id-input]').value.trim() : 'common';
  topicEditor.querySelectorAll('[data-topic-row]').forEach((topicRow) => {
    topicRow.dataset.activeKeywordTarget = 'false';
  });
  if (row) {
    row.dataset.activeKeywordTarget = 'true';
  }
  activeKeywordTargetInput().value = target || 'common';

  const rules = row
      ? parseRules(topicKeywordRulesValue(row))
      : parseRules(commonKeywordRulesInput().value || topicEditor.dataset.commonKeywords);

  replaceKeywordRows(keywordEditor, rules);
  updateActiveTopicSummary(topicEditor);
  updateKeywordSummary(keywordEditor);
  openKeywordPanel(keywordEditor);
}

/**
 * 持久化当前关键词编辑器中的规则到对应话题。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 */
function persistCurrentKeywordRows(topicEditor, keywordEditor) {
  const activeTarget = activeKeywordTargetInput().value || 'common';
  const serialized = serializeKeywordRows(keywordEditor);

  if (activeTarget === 'common') {
    topicEditor.dataset.commonKeywords = serialized;
    commonKeywordRulesInput().value = serialized;
    return;
  }

  const row = findActiveTopicRow(topicEditor, activeTarget);
  if (row) {
    setTopicKeywordRules(row, serialized);
  }
}

/**
 * 读取话题行保存的关键词规则。
 *
 * @param {HTMLElement} row 话题规则行元素。
 * @return {string} 序列化后的关键词规则。
 */
function topicKeywordRulesValue(row) {
  return row.querySelector('[data-topic-keyword-rules]')?.value ??
      row.querySelector('[data-action=\'edit-topic-keywords\']')?.dataset.topicKeywords ??
      '[]';
}

/**
 * 写入话题行的关键词规则。
 *
 * @param {HTMLElement} row 话题规则行元素。
 * @param {string} serialized 序列化后的关键词规则。
 */
function setTopicKeywordRules(row, serialized) {
  const input = row.querySelector('[data-topic-keyword-rules]');
  const button = row.querySelector('[data-action=\'edit-topic-keywords\']');
  if (input) {
    input.value = serialized;
  }
  if (button) {
    button.dataset.topicKeywords = serialized;
  }
}

/**
 * 使用指定规则替换关键词编辑器中的行。
 *
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 * @param {Array<Object>} rules 关键词规则数组。
 */
function replaceKeywordRows(keywordEditor, rules) {
  const grid = keywordEditor.querySelector('.keyword-rule-grid');
  keywordEditor.querySelectorAll('[data-keyword-row]').forEach((row) => row.remove());

  const normalizedRules = rules.length > 0 ? rules : [{keyword: '', locations: []}];
  normalizedRules.forEach((rule) => {
    grid.append(keywordRowFromRule(keywordEditor, rule));
  });

  reindexKeywordRows(keywordEditor);
}

/**
 * 根据关键词规则创建关键词行。
 *
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 * @param {Object} rule 关键词规则。
 * @return {HTMLElement} 新创建的关键词行元素。
 */
function keywordRowFromRule(keywordEditor, rule) {
  const template = keywordEditor.querySelector('[data-keyword-row-template]');
  const fragment = template.content.cloneNode(true);
  const row = fragment.querySelector('[data-keyword-row]');
  row.querySelector('input[name^=\'keyword_\']').value = rule.keyword ?? '';
  setKeywordOption(row, 'caseSensitive', rule.caseSensitive === true);
  setKeywordOption(row, 'useRegex', rule.useRegex === true);
  row.querySelectorAll('[name*=\'_location_\']').forEach((input) => {
    const location = input.name.match(/_location_(.+)$/)?.[1];
    input.checked = Array.isArray(rule.locations) && rule.locations.includes(location);
  });
  return row;
}

/**
 * 解析序列化的关键词规则。
 *
 * @param {string} value 序列化后的关键词规则。
 * @return {Array<Object>} 关键词规则数组。
 */
function parseRules(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 序列化关键词编辑器中的有效规则。
 *
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 * @return {string} 序列化后的关键词规则。
 */
function serializeKeywordRows(keywordEditor) {
  return JSON.stringify(
      Array.from(keywordEditor.querySelectorAll('[data-keyword-row]'))
          .map((row) => {
            const keyword = row.querySelector('input[name^=\'keyword_\']').value.trim();
            const locations = Array.from(row.querySelectorAll('[name*=\'_location_\']'))
                .filter((input) => input.checked)
                .map((input) => input.name.match(/_location_(.+)$/)?.[1])
                .filter(Boolean);
            const caseSensitive = keywordOptionEnabled(row, 'caseSensitive');
            const useRegex = keywordOptionEnabled(row, 'useRegex');

            return {caseSensitive, keyword, locations, useRegex};
          })
          .filter((rule) => rule.keyword && rule.locations.length > 0),
  );
}

/**
 * 切换关键词规则选项状态。
 *
 * @param {HTMLButtonElement} button 选项按钮。
 */
function toggleKeywordOption(button) {
  const row = button.closest('[data-keyword-row]');
  if (!row) {
    return;
  }

  const option = button.dataset.option;
  const isEnabled = button.getAttribute('aria-pressed') === 'true';
  setKeywordOption(row, option, !isEnabled);
}

/**
 * 设置关键词规则选项状态。
 *
 * @param {HTMLElement} row 关键词规则行元素。
 * @param {string|undefined} option 选项名称。
 * @param {boolean} isEnabled 是否启用。
 */
function setKeywordOption(row, option, isEnabled) {
  const input = row.querySelector(`[data-keyword-option="${option}"]`);
  const button = row.querySelector(
      `[data-action="toggle-keyword-option"][data-option="${option}"]`,
  );

  if (input instanceof HTMLInputElement) {
    input.value = isEnabled ? 'on' : '';
  }

  if (button instanceof HTMLButtonElement) {
    button.setAttribute('aria-pressed', String(isEnabled));
  }
}

/**
 * 判断关键词规则选项是否启用。
 *
 * @param {HTMLElement} row 关键词规则行元素。
 * @param {string|undefined} option 选项名称。
 * @return {boolean} 选项启用时返回 true。
 */
function keywordOptionEnabled(row, option) {
  const input = row.querySelector(`[data-keyword-option="${option}"]`);
  return input instanceof HTMLInputElement && input.value === 'on';
}

/**
 * 在关键词规则表中插入一行。
 *
 * @param {HTMLElement} editor 关键词编辑器元素。
 * @param {HTMLButtonElement} actionButton 触发插入的操作按钮。
 */
function insertKeywordRow(editor, actionButton) {
  const grid = editor.querySelector('.keyword-rule-grid');
  const row = actionButton.closest('[data-keyword-row]');
  const newRow = keywordRowFromRule(editor, {keyword: '', locations: []});

  if (row) {
    row.after(newRow);
  } else {
    const firstRow = grid.querySelector('[data-keyword-row]');
    if (firstRow) {
      firstRow.before(newRow);
    } else {
      grid.append(newRow);
    }
  }

  reindexKeywordRows(editor);
  newRow.querySelector('input[name^=\'keyword_\']').focus();
}

/**
 * 删除已选中的关键词规则行。
 *
 * @param {HTMLElement} editor 关键词编辑器元素。
 * @param {HTMLButtonElement} actionButton 触发删除的操作按钮。
 */
function deleteKeywordRows(editor, actionButton) {
  const selectedRows = Array.from(editor.querySelectorAll('[data-keyword-row]'))
      .filter((row) => row.querySelector('[data-role=\'select-keyword-row\']')?.checked);

  if (selectedRows.length > 0) {
    selectedRows.forEach((row) => row.remove());
  } else {
    const row = actionButton.closest('[data-keyword-row]');
    if (!row) {
      showToast(editor, editor.dataset.deleteMessage);
      return;
    }

    row.remove();
  }

  ensureAtLeastOneKeywordRow(editor);
  reindexKeywordRows(editor);
}

/**
 * 确保关键词规则表至少保留一行。
 *
 * @param {HTMLElement} editor 关键词编辑器元素。
 */
function ensureAtLeastOneKeywordRow(editor) {
  if (editor.querySelector('[data-keyword-row]')) {
    return;
  }

  const grid = editor.querySelector('.keyword-rule-grid');
  grid.append(keywordRowFromRule(editor, {keyword: '', locations: []}));
}

/**
 * 重新生成关键词规则行的字段索引。
 *
 * @param {HTMLElement} editor 关键词编辑器元素。
 */
function reindexKeywordRows(editor) {
  editor.querySelectorAll('[data-role=\'select-all-keywords\']').forEach((checkbox) => {
    checkbox.checked = false;
  });
  editor.querySelectorAll('[data-role=\'select-keyword-location\']').forEach((checkbox) => {
    checkbox.checked = false;
  });

  editor.querySelectorAll('[data-keyword-row]').forEach((row, index) => {
    row.querySelectorAll('input').forEach((input) => {
      if (!input.name) {
        return;
      }

      input.name = input.name.replace(/keyword_(?:__index__|\d+)/, `keyword_${index}`);
    });
  });
}

/**
 * 更新当前关键词编辑目标摘要。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 */
function updateActiveTopicSummary(topicEditor) {
  const activeTarget = activeKeywordTargetInput().value || 'common';
  const summary = topicEditor.querySelector('[data-topic-summary]');

  if (activeTarget === 'common') {
    topicEditor.querySelectorAll('[data-topic-row]').forEach((row) => {
      row.dataset.activeKeywordTarget = 'false';
    });
    summary.textContent = summary.dataset.commonLabel;
    return;
  }

  const activeRow = topicEditor.querySelector(
      '[data-topic-row][data-active-keyword-target="true"]',
  );
  const row = activeRow ?? findTopicRowById(topicEditor, activeTarget);
  if (!row) {
    summary.textContent = summary.dataset.commonLabel;
    return;
  }

  const id = row.querySelector('[data-topic-id-input]').value.trim();
  const note = row.querySelector('[data-topic-note-input]').value.trim();
  activeKeywordTargetInput().value = id || 'common';
  summary.textContent = note && id ? `${note}（${id}）` : note || id || summary.dataset.commonLabel;
}

/**
 * 更新关键词摘要文本。
 *
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 */
function updateKeywordSummary(keywordEditor) {
  const summary = keywordEditor.querySelector('[data-keyword-summary]');
  const keywords = Array.from(
          keywordEditor.querySelectorAll(
              'input[name^=\'keyword_\']:not([name*=\'_location_\']):not([data-keyword-option])',
          ),
      )
      .map((input) => input.value.trim())
      .filter(Boolean);

  summary.textContent = '';
  keywords.slice(0, 5).forEach((keyword, index) => {
    if (index > 0) {
      const separator = document.createElement('span');
      separator.className = 'summary-separator';
      separator.textContent = '|';
      summary.append(separator);
    }

    const item = document.createElement('span');
    item.dataset.keywordSummaryItem = 'true';
    item.textContent = keyword;
    summary.append(item);
  });

  if (keywords.length > 5) {
    summary.append('...');
  }

  fitKeywordSummary(summary);
}

/**
 * 压缩关键词摘要，使其适配可见宽度。
 *
 * @param {HTMLElement} summary 关键词摘要元素。
 */
function fitKeywordSummary(summary) {
  const items = Array.from(summary.querySelectorAll('[data-keyword-summary-item]'));
  for (const item of items.toReversed()) {
    if (summary.scrollWidth <= summary.clientWidth) {
      return;
    }

    const previous = item.previousElementSibling;
    item.remove();
    if (previous?.classList.contains('summary-separator')) {
      previous.remove();
    }
    summary.append('...');
  }
}

/**
 * 展开关键词编辑面板。
 *
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 */
function openKeywordPanel(keywordEditor) {
  setDropdownOpen(keywordEditor, 'keywords', true, {persist: true});
}

/**
 * 根据话题 ID 查找话题规则行。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {string} id 话题 ID。
 * @return {HTMLElement|undefined} 匹配的话题规则行。
 */
function findTopicRowById(topicEditor, id) {
  return Array.from(topicEditor.querySelectorAll('[data-topic-row]'))
      .find((row) => row.querySelector('[data-topic-id-input]').value.trim() === id);
}

/**
 * 获取通用关键词规则按钮。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @return {HTMLButtonElement} 通用关键词规则按钮。
 */
function commonKeywordButton(topicEditor) {
  return topicEditor.querySelector(
      '[data-action="edit-topic-keywords"][data-keyword-target="common"]',
  );
}

/**
 * 获取当前活动关键词目标输入框。
 *
 * @return {HTMLInputElement} 当前活动关键词目标输入框。
 */
function activeKeywordTargetInput() {
  return document.querySelector('[data-active-keyword-target]');
}

/**
 * 显示编辑器内提示消息。
 *
 * @param {HTMLElement} editor 编辑器根元素。
 * @param {string|undefined} message 提示消息。
 */
function showToast(editor, message) {
  const existing = editor.querySelector('[data-keyword-toast]');
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'keyword-toast';
  toast.dataset.keywordToast = 'true';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  editor.append(toast);

  setTimeout(() => {
    toast.classList.add('is-hiding');
  }, 1800);

  setTimeout(() => {
    toast.remove();
  }, 2200);
}

document.addEventListener('DOMContentLoaded', initSettingsEditors);
