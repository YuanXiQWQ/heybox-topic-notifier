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
let lastSavedSignature = "";
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
const dropdownStoragePrefix = "heybox-notifier.settings.dropdown.";
/**
 * CSRF 表单字段名称。
 */
const csrfFieldName = "csrfToken";
/**
 * CSRF 请求头名称。
 */
const csrfHeaderName = "x-csrf-token";
/**
 * 关键词规则可匹配的位置列表。
 */
const keywordMatchLocations = ["title", "body", "comments", "replies"];
/**
 * 当前正在拖拽的规则行状态。
 */
let activeRuleDrag;

/**
 * 初始化设置页所有编辑器。
 */
function initSettingsEditors() {
  const topicEditor = document.querySelector("[data-topic-editor]");
  const keywordEditor = document.querySelector("[data-keyword-editor]");

  if (!topicEditor || !keywordEditor) {
    return;
  }

  initDropdown(topicEditor, "topics");
  initDropdown(keywordEditor, "keywords");
  initTopicEditor(topicEditor, keywordEditor);
  initKeywordEditor(keywordEditor);
  initRuleDragging(topicEditor, keywordEditor);
  initNotificationSettings();
  initPollingSettings();
  initAccountSettings();
  initThemePicker();
  initKeywordRuleStorage(topicEditor, keywordEditor);
  initAutoSave(topicEditor.closest("form"), topicEditor, keywordEditor);
  updateKeywordSummary(keywordEditor);
}

/**
 * 初始化通知设置联动和测试通知交互。
 */
function initNotificationSettings() {
  const providerSelect = document.querySelector("[data-notification-provider-select]");
  const emailServiceSelect = document.querySelector("[data-notification-email-service-select]");
  const serviceSelect = document.querySelector("[data-notification-webhook-service-select]");
  const testNotifyButton = document.querySelector("[data-test-notify-button]");
  const testNotifyStatus = document.querySelector("[data-test-notify-status]");
  const rows = Array.from(document.querySelectorAll("[data-notification-field]"));

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
    if (providerSelect.value === "email") {
      const fields = [
        "email-service",
        "email-address",
        "email-from",
      ];

      if (emailServiceSelect?.value === "api") {
        fields.push("email-api-url", "email-api-token");
      } else {
        fields.push(
          "smtp-host",
          "smtp-port",
          "smtp-secure",
          "smtp-username",
          "smtp-password",
        );
      }

      return new Set(fields);
    }

    if (providerSelect.value !== "webhook") {
      return new Set();
    }

    return new Set([
      "webhook-service",
      serviceSelect?.value || "custom",
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
      row.classList.remove("is-collapsed");
      return;
    }

    row.classList.add("is-collapsed");
    row.getBoundingClientRect();
    row.classList.remove("is-collapsed");
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
    row.classList.add("is-collapsed");

    if (!animate) {
      row.hidden = true;
      return;
    }

    setTimeout(() => {
      if (
        row.dataset.notificationTransitionToken === String(token) &&
        row.classList.contains("is-collapsed")
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
      testNotifyButton.hidden = providerSelect.value === "disabled";
      if (testNotifyStatus instanceof HTMLElement) {
        testNotifyStatus.hidden = testNotifyButton.hidden;
      }
      if (testNotifyButton.hidden) {
        setTestNotifyStatus("");
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

  providerSelect.addEventListener("change", () => {
    syncNotificationFields(true);
    scheduleAutoSave();
  });

  emailServiceSelect?.addEventListener("change", () => {
    syncNotificationFields(true);
    scheduleAutoSave();
  });

  serviceSelect?.addEventListener("change", () => {
    syncNotificationFields(true);
    scheduleAutoSave();
  });

  testNotifyButton?.addEventListener("click", async (event) => {
    event.preventDefault();
    if (!(testNotifyButton instanceof HTMLButtonElement)) {
      return;
    }

    testNotifyButton.disabled = true;
    setTestNotifyStatus(testNotifyButton.dataset.testNotifySending ?? "", "pending", {
      persistMs: 0,
    });
    try {
      const saved = await saveSettingsNow();
      if (saved) {
        await sendTestNotification(testNotifyButton);
      } else {
        setTestNotifyStatus(testNotifyButton.dataset.testNotifyFailed ?? "", "error");
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
  const enabledToggle = document.querySelector("[data-polling-enabled-toggle]");
  const intervalValueInput = document.querySelector("[data-polling-interval-value]");
  const intervalUnitSelect = document.querySelector("[data-polling-interval-unit]");
  const subMinuteHint = document.querySelector("[data-polling-sub-minute-hint]");
  const section = document.querySelector("[data-polling-section]");
  const rows = Array.from(document.querySelectorAll("[data-polling-field]"));

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
      row.classList.remove("is-collapsed");
      return;
    }

    row.classList.add("is-collapsed");
    row.getBoundingClientRect();
    row.classList.remove("is-collapsed");
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
    row.classList.add("is-collapsed");

    if (!animate) {
      row.hidden = true;
      return;
    }

    setTimeout(() => {
      if (
        row.dataset.pollingTransitionToken === String(token) &&
        row.classList.contains("is-collapsed")
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

    intervalValueInput.min = intervalUnitSelect.value === "second" ? "3" : "1";

    const intervalValue = Number(intervalValueInput.value);
    if (
      intervalUnitSelect.value === "second" &&
      Number.isFinite(intervalValue) &&
      intervalValue < 3
    ) {
      intervalValueInput.value = "3";
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
      intervalUnitSelect.value === "second" &&
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

  enabledToggle.addEventListener("change", () => {
    syncPollingFields(true);
    scheduleAutoSave();
  });

  intervalValueInput?.addEventListener("change", () => {
    validateMinimumInterval();
    syncSubMinuteHint();
  });

  intervalValueInput?.addEventListener("blur", () => {
    validateMinimumInterval();
    syncSubMinuteHint();
  });

  intervalValueInput?.addEventListener("input", () => {
    syncSubMinuteHint();
  });

  intervalUnitSelect?.addEventListener("change", () => {
    validateMinimumInterval();
    syncSubMinuteHint();
  });

  validateMinimumInterval();
  syncSubMinuteHint();
  syncPollingFields(false);
}

/**
 * 初始化账户设置编辑流程。
 */
function initAccountSettings() {
  const form = document.querySelector("[data-account-form]");
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const actionInput = form.querySelector("[data-account-action-input]");
  const usernameInput = form.querySelector("[data-account-username-input]");
  const usernameStatus = form.querySelector("[data-account-username-status]");
  const currentPasswordRow = form.querySelector("[data-account-current-password-row]");
  const currentPasswordInput = form.querySelector("[data-account-current-password-input]");
  const currentPasswordStatus = form.querySelector("[data-account-current-password-status]");
  const newPasswordStatus = form.querySelector("[data-account-new-password-status]");
  const confirmPasswordStatus = form.querySelector("[data-account-confirm-password-status]");
  const newPasswordRows = Array.from(form.querySelectorAll("[data-account-new-password-row]"));
  const unlockedFields = Array.from(form.querySelectorAll("[data-account-unlocked-field]"));
  const actions = form.querySelector("[data-account-actions]");
  const saveButton = form.querySelector("[data-account-save-button]");
  const cancelButton = form.querySelector("[data-account-cancel-button]");
  const verifyButton = form.querySelector("[data-account-verify-button]");
  const actionStatus = form.querySelector("[data-account-status]");
  const fieldStatuses = Array.from(form.querySelectorAll(".account-field-status"));
  let mode = form.dataset.accountInitialMode || "";
  let passwordVerified = false;
  let transitionToken = 0;

  if (
    !(actionInput instanceof HTMLInputElement) ||
    !(usernameInput instanceof HTMLInputElement) ||
    !(currentPasswordRow instanceof HTMLElement) ||
    !(currentPasswordInput instanceof HTMLInputElement) ||
    !(actions instanceof HTMLElement) ||
    !(saveButton instanceof HTMLButtonElement)
  ) {
    return;
  }

  actionInput.value = mode;
  lockAccountTargets();

  form.querySelectorAll("[data-account-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button instanceof HTMLButtonElement) {
        selectAccountMode(button.dataset.accountMode || "");
      }
    });
  });

  cancelButton?.addEventListener("click", () => {
    resetAccountEditor();
  });

  currentPasswordInput.addEventListener("input", () => {
    passwordVerified = false;
    lockAccountTargets();
    clearStatus(currentPasswordStatus);
  });

  usernameInput.addEventListener("input", () => {
    clearStatus(usernameStatus);
  });

  unlockedFields.forEach((field) => {
    field.addEventListener("input", () => {
      if (!(field instanceof HTMLInputElement)) {
        return;
      }

      if (field.name === "newPassword") {
        clearStatus(newPasswordStatus);
      }
      if (field.name === "confirmPassword") {
        clearStatus(confirmPasswordStatus);
      }
    });
  });

  verifyButton?.addEventListener("click", async () => {
    await verifyCurrentPassword();
  });

  form.addEventListener("submit", (event) => {
    if (!mode) {
      event.preventDefault();
      return;
    }

    if (!passwordVerified) {
      event.preventDefault();
      setStatus(
        currentPasswordStatus,
        form.dataset.accountPasswordRequired || "",
        "error",
      );
      currentPasswordInput.focus();
    }
  });

  function selectAccountMode(nextMode) {
    if (nextMode !== "username" && nextMode !== "password") {
      return;
    }

    mode = nextMode;
    passwordVerified = false;
    actionInput.value = nextMode;
    usernameInput.value = usernameInput.dataset.accountUsernameOriginal || usernameInput.value;
    currentPasswordInput.value = "";
    clearUnlockedPasswordFields();
    clearAllAccountStatuses();
    lockAccountTargets();
    showAccountElement(actions, true, ++transitionToken);
    showAccountElement(currentPasswordRow, true, ++transitionToken);

    if (mode === "password") {
      newPasswordRows.forEach((row) => showAccountElement(row, true, ++transitionToken));
    } else {
      newPasswordRows.forEach((row) => hideAccountElement(row, true, ++transitionToken));
    }

    currentPasswordInput.focus();
  }

  function resetAccountEditor() {
    mode = "";
    passwordVerified = false;
    actionInput.value = "";
    usernameInput.value = usernameInput.dataset.accountUsernameOriginal || usernameInput.value;
    currentPasswordInput.value = "";
    clearUnlockedPasswordFields();
    clearAllAccountStatuses();
    lockAccountTargets();
    hideAccountElement(actions, true, ++transitionToken);
    hideAccountElement(currentPasswordRow, true, ++transitionToken);
    newPasswordRows.forEach((row) => hideAccountElement(row, true, ++transitionToken));
  }

  function lockAccountTargets() {
    usernameInput.readOnly = true;
    saveButton.disabled = true;
    unlockedFields.forEach((field) => {
      if (field instanceof HTMLInputElement) {
        field.disabled = true;
      }
    });
  }

  function unlockSelectedTarget() {
    if (mode === "username") {
      usernameInput.readOnly = false;
      usernameInput.focus();
    }

    if (mode === "password") {
      unlockedFields.forEach((field) => {
        if (field instanceof HTMLInputElement) {
          field.disabled = false;
        }
      });
      const firstPasswordField = unlockedFields.find((field) => field instanceof HTMLInputElement);
      firstPasswordField?.focus();
    }

    saveButton.disabled = false;
  }

  function clearUnlockedPasswordFields() {
    unlockedFields.forEach((field) => {
      if (field instanceof HTMLInputElement) {
        field.value = "";
      }
    });
  }

  async function verifyCurrentPassword() {
    if (!(verifyButton instanceof HTMLButtonElement)) {
      return;
    }

    if (!currentPasswordInput.value) {
      setStatus(
        currentPasswordStatus,
        form.dataset.accountPasswordRequired || "",
        "error",
      );
      currentPasswordInput.focus();
      return;
    }

    verifyButton.disabled = true;
    try {
      const body = new URLSearchParams();
      body.set("currentPassword", currentPasswordInput.value);
      const response = await fetch("/account/verify-password", {
        body,
        headers: csrfRequestHeaders({ "content-type": "application/x-www-form-urlencoded" }),
        method: "POST",
      });

      if (response.ok) {
        passwordVerified = true;
        setStatus(
          currentPasswordStatus,
          form.dataset.accountPasswordVerified || "",
          "success",
        );
        unlockSelectedTarget();
      } else {
        passwordVerified = false;
        lockAccountTargets();
        setStatus(
          currentPasswordStatus,
          form.dataset.accountPasswordInvalid || "",
          "error",
        );
        currentPasswordInput.focus();
      }
    } finally {
      verifyButton.disabled = false;
    }
  }

  function showAccountElement(element, animate, token) {
    element.hidden = false;
    element.dataset.accountTransitionToken = String(token);

    if (!animate) {
      element.classList.remove("is-collapsed");
      return;
    }

    element.classList.add("is-collapsed");
    element.getBoundingClientRect();
    element.classList.remove("is-collapsed");
  }

  function hideAccountElement(element, animate, token) {
    element.dataset.accountTransitionToken = String(token);
    element.classList.add("is-collapsed");

    if (!animate) {
      element.hidden = true;
      return;
    }

    setTimeout(() => {
      if (
        element.dataset.accountTransitionToken === String(token) &&
        element.classList.contains("is-collapsed")
      ) {
        element.hidden = true;
      }
    }, notificationTransitionMs);
  }

  function setStatus(element, message, state) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    element.textContent = message;
    element.hidden = message.length === 0;
    if (state === "error") {
      element.dataset.state = "error";
    } else {
      delete element.dataset.state;
    }
  }

  function clearStatus(element) {
    setStatus(element, "", "success");
  }

  function clearAllAccountStatuses() {
    clearStatus(actionStatus);
    fieldStatuses.forEach((status) => clearStatus(status));
  }
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
  setDropdownOpen(editor, name, storedDropdownOpen(name), { persist: false });

  toggle.addEventListener("click", () => {
    const className = `is-${name.slice(0, -1)}-open`;
    const isOpen = !editor.classList.contains(className);
    setDropdownOpen(editor, name, isOpen, { persist: true });
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
  panel.setAttribute("aria-hidden", String(!isOpen));
  panel.inert = !isOpen;
  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.classList.toggle("is-open", isOpen);

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
    return localStorage.getItem(dropdownStorageKey(name)) === "open";
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
    localStorage.setItem(dropdownStorageKey(name), isOpen ? "open" : "closed");
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
  topicEditor.addEventListener("click", (event) => {
    const button = actionButtonFromEvent(event);
    if (!button) {
      return;
    }

    if (button.dataset.action === "insert-topic") {
      insertTopicRow(topicEditor, button);
      scheduleAutoSave();
      return;
    }

    if (button.dataset.action === "delete-topics") {
      deleteTopicRows(topicEditor, keywordEditor, button);
      scheduleAutoSave();
      return;
    }

    if (button.dataset.action === "edit-topic-keywords") {
      switchKeywordTarget(topicEditor, keywordEditor, button);
      scheduleAutoSave();
    }
  });

  topicEditor.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    let shouldSave = false;

    if (target.matches("[data-role='select-all-topics']")) {
      topicEditor.querySelectorAll("[data-role='select-topic-row']").forEach((checkbox) => {
        checkbox.checked = target.checked;
      });
    }

    if (target.matches("[data-role='enable-all-topics']")) {
      topicEditor.querySelectorAll("[data-role='topic-enabled']").forEach((checkbox) => {
        checkbox.checked = target.checked;
      });
      shouldSave = true;
    }

    if (target.matches("[data-role='topic-enabled']")) {
      shouldSave = true;
    }

    if (shouldSave) {
      scheduleAutoSave();
    }
  });

  topicEditor.addEventListener("input", () => {
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
  keywordEditor.addEventListener("click", (event) => {
    const button = actionButtonFromEvent(event);
    if (!button) {
      return;
    }

    if (button.dataset.action === "insert-keyword") {
      insertKeywordRow(keywordEditor, button);
      updateKeywordSummary(keywordEditor);
      scheduleAutoSave();
      return;
    }

    if (button.dataset.action === "delete-keywords") {
      deleteKeywordRows(keywordEditor, button);
      updateKeywordSummary(keywordEditor);
      scheduleAutoSave();
      return;
    }

    if (button.dataset.action === "toggle-keyword-option") {
      toggleKeywordOption(button);
      scheduleAutoSave();
    }
  });

  keywordEditor.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    let shouldSave = false;

    if (target.matches("[data-role='select-all-keywords']")) {
      keywordEditor.querySelectorAll("[data-role='select-keyword-row']").forEach((checkbox) => {
        checkbox.checked = target.checked;
      });
    }

    if (target.matches("[data-role='select-keyword-location']")) {
      const location = target.dataset.location;
      keywordEditor
        .querySelectorAll(`[name$="_location_${location}"]`)
        .forEach((checkbox) => {
          checkbox.checked = target.checked;
        });
      shouldSave = true;
    }

    if (target.name.includes("_location_")) {
      shouldSave = true;
    }

    updateKeywordSummary(keywordEditor);
    if (shouldSave) {
      scheduleAutoSave();
    }
  });

  keywordEditor.addEventListener("input", () => {
    updateKeywordSummary(keywordEditor);
    scheduleAutoSave();
  });
}

/**
 * 初始化话题和关键词规则行拖拽交互。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 */
function initRuleDragging(topicEditor, keywordEditor) {
  topicEditor.addEventListener("pointerdown", (event) => {
    beginRuleDrag(event, "topic", topicEditor, keywordEditor);
  });

  keywordEditor.addEventListener("pointerdown", (event) => {
    beginRuleDrag(event, "keyword", topicEditor, keywordEditor);
  });
}

/**
 * 开始跟踪规则行拖拽。
 *
 * @param {PointerEvent} event 指针按下事件。
 * @param {"topic"|"keyword"} kind 拖拽行类型。
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 */
function beginRuleDrag(event, kind, topicEditor, keywordEditor) {
  const handle = ruleDragHandleFromEvent(event);
  if (!handle || activeRuleDrag || event.button !== 0) {
    return;
  }

  const row = handle.closest(kind === "topic" ? "[data-topic-row]" : "[data-keyword-row]");
  if (!(row instanceof HTMLElement)) {
    return;
  }

  event.preventDefault();
  activeRuleDrag = {
    dropTargetTopicRow: undefined,
    ghost: undefined,
    handle,
    keywordEditor,
    kind,
    moved: false,
    pointerId: event.pointerId,
    row,
    started: false,
    startX: event.clientX,
    startY: event.clientY,
    topicEditor,
  };

  document.addEventListener("pointermove", updateActiveRuleDrag);
  document.addEventListener("pointerup", finishActiveRuleDrag);
  document.addEventListener("pointercancel", finishActiveRuleDrag);
  handle.setPointerCapture?.(event.pointerId);
}

/**
 * 从事件中解析规则行拖拽手柄。
 *
 * @param {Event} event DOM 事件。
 * @return {HTMLButtonElement|undefined} 拖拽手柄按钮。
 */
function ruleDragHandleFromEvent(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return undefined;
  }

  const handle = target.closest("[data-rule-drag-handle]");
  return handle instanceof HTMLButtonElement ? handle : undefined;
}

/**
 * 更新当前拖拽行的位置和目标。
 *
 * @param {PointerEvent} event 指针移动事件。
 */
function updateActiveRuleDrag(event) {
  const state = activeRuleDrag;
  if (!state || event.pointerId !== state.pointerId) {
    return;
  }

  event.preventDefault();
  if (
    !state.started && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 4
  ) {
    return;
  }

  if (!state.started) {
    startRuleDragPreview(state);
  }

  updateRuleDragGhost(state, event);
  updateRuleDragTarget(state, event);
}

/**
 * 完成当前规则行拖拽。
 *
 * @param {PointerEvent} event 指针结束事件。
 */
function finishActiveRuleDrag(event) {
  const state = activeRuleDrag;
  if (!state || event.pointerId !== state.pointerId) {
    return;
  }

  activeRuleDrag = undefined;
  if (state.started) {
    completeRuleDrag(state);
  }
  cleanupRuleDrag(state);
}

/**
 * 创建拖拽预览并标记原始行。
 *
 * @param {Object} state 拖拽状态。
 */
function startRuleDragPreview(state) {
  state.started = true;
  state.row.classList.add("is-rule-dragging");

  const ghost = document.createElement("div");
  ghost.className = "rule-drag-ghost";
  ghost.textContent = ruleDragPreviewText(state);
  document.body.append(ghost);
  state.ghost = ghost;
}

/**
 * 生成拖拽预览文本。
 *
 * @param {Object} state 拖拽状态。
 * @return {string} 拖拽预览文本。
 */
function ruleDragPreviewText(state) {
  if (state.kind === "topic") {
    const id = state.row.querySelector("[data-topic-id-input]")?.value.trim() ?? "";
    const note = state.row.querySelector("[data-topic-note-input]")?.value.trim() ?? "";
    return [note, id].filter(Boolean).join(" ") || state.handle.title;
  }

  const keyword = state.row.querySelector("input[name^='keyword_']")?.value.trim() ?? "";
  return keyword || state.handle.title;
}

/**
 * 更新拖拽预览的位置。
 *
 * @param {Object} state 拖拽状态。
 * @param {PointerEvent} event 指针移动事件。
 */
function updateRuleDragGhost(state, event) {
  if (!(state.ghost instanceof HTMLElement)) {
    return;
  }

  state.ghost.style.left = `${event.clientX}px`;
  state.ghost.style.top = `${event.clientY}px`;
}

/**
 * 根据当前指针位置更新拖拽目标。
 *
 * @param {Object} state 拖拽状态。
 * @param {PointerEvent} event 指针移动事件。
 */
function updateRuleDragTarget(state, event) {
  clearRuleDragIndicators();

  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (!(target instanceof Element)) {
    state.dropTargetTopicRow = undefined;
    return;
  }

  if (state.kind === "topic") {
    updateTopicDragTarget(state, target, event.clientY);
    return;
  }

  updateKeywordDragTarget(state, target, event.clientY);
}

/**
 * 更新话题行拖拽目标。
 *
 * @param {Object} state 拖拽状态。
 * @param {Element} target 指针命中的元素。
 * @param {number} clientY 指针垂直位置。
 */
function updateTopicDragTarget(state, target, clientY) {
  const targetRow = target.closest("[data-topic-row]");
  if (
    !(targetRow instanceof HTMLElement) ||
    targetRow === state.row ||
    !state.topicEditor.contains(targetRow)
  ) {
    return;
  }

  moveDraggedRowBesideTarget(state, targetRow, clientY);
}

/**
 * 更新关键词行拖拽目标。
 *
 * @param {Object} state 拖拽状态。
 * @param {Element} target 指针命中的元素。
 * @param {number} clientY 指针垂直位置。
 */
function updateKeywordDragTarget(state, target, clientY) {
  const keywordRow = target.closest("[data-keyword-row]");
  if (
    keywordRow instanceof HTMLElement &&
    keywordRow !== state.row &&
    state.keywordEditor.contains(keywordRow)
  ) {
    state.dropTargetTopicRow = undefined;
    moveDraggedRowBesideTarget(state, keywordRow, clientY);
    return;
  }

  const topicRow = target.closest("[data-topic-row]");
  if (
    topicRow instanceof HTMLElement &&
    state.topicEditor.contains(topicRow) &&
    topicRowCanReceiveKeyword(state.topicEditor, topicRow)
  ) {
    topicRow.classList.add("is-keyword-drop-target");
    state.dropTargetTopicRow = topicRow;
    return;
  }

  state.dropTargetTopicRow = undefined;
}

/**
 * 将正在拖拽的行移动到目标行前后。
 *
 * @param {Object} state 拖拽状态。
 * @param {HTMLElement} targetRow 目标行。
 * @param {number} clientY 指针垂直位置。
 */
function moveDraggedRowBesideTarget(state, targetRow, clientY) {
  const rect = targetRow.getBoundingClientRect();
  const insertBefore = clientY < rect.top + rect.height / 2;
  targetRow.classList.add(insertBefore ? "is-rule-drag-over-before" : "is-rule-drag-over-after");

  if (insertBefore) {
    targetRow.before(state.row);
  } else {
    targetRow.after(state.row);
  }
  state.moved = true;
}

/**
 * 完成拖拽后的数据同步。
 *
 * @param {Object} state 拖拽状态。
 */
function completeRuleDrag(state) {
  if (state.kind === "topic") {
    if (state.moved) {
      reindexTopicRows(state.topicEditor);
      updateActiveTopicSummary(state.topicEditor);
      scheduleAutoSave();
    }
    return;
  }

  if (
    state.dropTargetTopicRow instanceof HTMLElement &&
    moveKeywordRowToTopic(
      state.topicEditor,
      state.keywordEditor,
      state.row,
      state.dropTargetTopicRow,
    )
  ) {
    scheduleAutoSave();
    return;
  }

  if (state.moved) {
    reindexKeywordRows(state.keywordEditor);
    updateKeywordSummary(state.keywordEditor);
    scheduleAutoSave();
  }
}

/**
 * 清理拖拽状态和临时样式。
 *
 * @param {Object} state 拖拽状态。
 */
function cleanupRuleDrag(state) {
  document.removeEventListener("pointermove", updateActiveRuleDrag);
  document.removeEventListener("pointerup", finishActiveRuleDrag);
  document.removeEventListener("pointercancel", finishActiveRuleDrag);
  state.handle.releasePointerCapture?.(state.pointerId);
  state.row.classList.remove("is-rule-dragging");
  state.ghost?.remove();
  clearRuleDragIndicators();
}

/**
 * 清除规则行拖拽落点样式。
 */
function clearRuleDragIndicators() {
  document
    .querySelectorAll(
      ".is-rule-drag-over-before, .is-rule-drag-over-after, .is-keyword-drop-target",
    )
    .forEach((row) => {
      row.classList.remove(
        "is-rule-drag-over-before",
        "is-rule-drag-over-after",
        "is-keyword-drop-target",
      );
    });
}

/**
 * 判断话题行是否可接收当前关键词。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {HTMLElement} topicRow 目标话题行。
 * @return {boolean} 可以接收关键词时返回 true。
 */
function topicRowCanReceiveKeyword(topicEditor, topicRow) {
  const topicId = topicRow.querySelector("[data-topic-id-input]")?.value.trim() ?? "";
  if (!topicId) {
    return false;
  }

  const activeTarget = activeKeywordTargetInput().value || "common";
  return activeTarget === "common" || findActiveTopicRow(topicEditor, activeTarget) !== topicRow;
}

/**
 * 将关键词行移动到目标话题。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 * @param {HTMLElement} keywordRow 需要移动的关键词行。
 * @param {HTMLElement} topicRow 目标话题行。
 * @return {boolean} 实际移动成功时返回 true。
 */
function moveKeywordRowToTopic(topicEditor, keywordEditor, keywordRow, topicRow) {
  const rule = keywordRuleFromRow(keywordRow);
  if (!keywordRuleIsPersistable(rule)) {
    return false;
  }

  keywordRow.remove();
  ensureAtLeastOneKeywordRow(keywordEditor);
  reindexKeywordRows(keywordEditor);
  persistCurrentKeywordRows(topicEditor, keywordEditor);

  const targetRules = parseRules(topicKeywordRulesValue(topicRow));
  targetRules.push(rule);
  setTopicKeywordRules(topicRow, JSON.stringify(targetRules));
  updateKeywordSummary(keywordEditor);
  updateActiveTopicSummary(topicEditor);
  return true;
}

/**
 * 从关键词行读取规则对象。
 *
 * @param {HTMLElement} row 关键词规则行元素。
 * @return {{caseSensitive: boolean, keyword: string, locations: string[], useRegex: boolean}} 关键词规则。
 */
function keywordRuleFromRow(row) {
  const keyword = row.querySelector("input[name^='keyword_']")?.value.trim() ?? "";
  const locations = Array.from(row.querySelectorAll("[name*='_location_']"))
    .filter((input) => input.checked)
    .map((input) => input.name.match(/_location_(.+)$/)?.[1])
    .filter(Boolean);

  return {
    caseSensitive: keywordOptionEnabled(row, "caseSensitive"),
    keyword,
    locations,
    useRegex: keywordOptionEnabled(row, "useRegex"),
  };
}

/**
 * 判断关键词规则是否可持久化。
 *
 * @param {{keyword: string, locations: string[]}} rule 关键词规则。
 * @return {boolean} 关键词和匹配位置都存在时返回 true。
 */
function keywordRuleIsPersistable(rule) {
  return rule.keyword.length > 0 && rule.locations.length > 0;
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

  const button = target.closest("[data-action]");
  return button instanceof HTMLButtonElement ? button : undefined;
}

/**
 * 初始化关键词规则在话题和关键词编辑器之间的同步。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 */
function initKeywordRuleStorage(topicEditor, keywordEditor) {
  const activeTarget = activeKeywordTargetInput().value || "common";
  const commonInput = commonKeywordRulesInput();

  if (activeTarget === "common") {
    commonInput.value = serializeKeywordRows(keywordEditor);
  } else {
    const activeRow = findActiveTopicRow(topicEditor, activeTarget);
    if (activeRow) {
      setTopicKeywordRules(activeRow, serializeKeywordRows(keywordEditor));
    }
  }

  topicEditor.dataset.commonKeywords = commonInput.value || "[]";
  topicEditor.closest("form")?.addEventListener("submit", () => {
    persistCurrentKeywordRows(topicEditor, keywordEditor);
  });
}

/**
 * 获取通用关键词规则隐藏输入框。
 *
 * @return {HTMLInputElement} 通用关键词规则输入框。
 */
function commonKeywordRulesInput() {
  return document.querySelector("[data-common-keyword-rules]");
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
  const colorInput = document.querySelector("[data-theme-color-input]");
  const darkModeInput = document.querySelector("[data-dark-mode-input]");

  if (colorInput instanceof HTMLInputElement) {
    colorInput.addEventListener("input", () => {
      document.documentElement.style.setProperty("--theme-color", colorInput.value);
      scheduleAutoSave();
    });
  }

  if (darkModeInput instanceof HTMLInputElement) {
    darkModeInput.addEventListener("change", () => {
      document.documentElement.dataset.colorMode = darkModeInput.checked ? "dark" : "light";
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveSettingsNow();
  });

  form.addEventListener("input", (event) => {
    if (isEditorEvent(event)) {
      return;
    }

    scheduleAutoSave();
  });

  form.addEventListener("change", (event) => {
    if (isEditorEvent(event)) {
      return;
    }

    const target = event.target;
    if (target instanceof HTMLSelectElement && target.name === "locale") {
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
    Boolean(target.closest("[data-topic-editor], [data-keyword-editor]"));
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
  setAutoSaveStatus("saving");

  try {
    const response = await fetch(autoSaveForm.action, {
      body: formDataFromForm(autoSaveForm),
      headers: csrfRequestHeaders({ "x-autosave": "1" }),
      method: autoSaveForm.method || "post",
      signal: autoSaveController.signal,
    });

    if (!response.ok) {
      setAutoSaveStatus("error");
      return false;
    }

    lastSavedSignature = signature;
    setAutoSaveStatus("saved");
    if (reloadAfterSave) {
      location.reload();
    }
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return false;
    }

    setAutoSaveStatus("error");
    return false;
  }
}

/**
 * 发送测试通知并更新发送状态。
 *
 * @param {HTMLButtonElement} testNotifyButton 测试通知按钮。
 */
async function sendTestNotification(testNotifyButton) {
  const fallbackError = testNotifyButton?.dataset?.testNotifyFailed ?? "";

  try {
    const response = await fetch("/test-notify", {
      headers: csrfRequestHeaders({ "x-test-notify": "1" }),
      method: "POST",
    });
    const text = await response.text();
    if (response.ok) {
      setTestNotifyStatus(text, "success");
    } else {
      const statusLine = `HTTP ${response.status}${
        response.statusText ? ` ${response.statusText}` : ""
      }`;
      setTestNotifyStatus(fallbackError, "error", {
        errorDetails: [statusLine, text || fallbackError].join("\n\n"),
      });
    }
  } catch (error) {
    const errorDetails = error instanceof Error ? error.message : fallbackError;
    setTestNotifyStatus(fallbackError, "error", { errorDetails });
  }
}

/**
 * 构建包含 CSRF 令牌的请求头。
 *
 * @param {Record<string, string>} headers 原始请求头。
 * @return {Record<string, string>} 合并 CSRF 令牌后的请求头。
 */
function csrfRequestHeaders(headers = {}) {
  const token = currentCsrfToken();
  return token ? { ...headers, [csrfHeaderName]: token } : headers;
}

/**
 * 从当前页面隐藏字段读取 CSRF 令牌。
 *
 * @return {string} 当前页面 CSRF 令牌。
 */
function currentCsrfToken() {
  const input = document.querySelector(`input[name="${csrfFieldName}"]`);
  return input instanceof HTMLInputElement ? input.value : "";
}

/**
 * 更新测试通知的状态文案和错误详情入口。
 *
 * @param {string} text 状态文案。
 * @param {string} state 状态类型。
 * @param {Object} [options] 状态展示选项。
 */
function setTestNotifyStatus(text, state = "", options = {}) {
  const status = document.querySelector("[data-test-notify-status]");
  if (!status) {
    return;
  }

  clearTimeout(testNotifyStatusTimer);
  const statusText = status.querySelector("[data-test-notify-status-text]");
  if (statusText) {
    statusText.textContent = text;
  } else {
    status.textContent = text;
  }
  updateTestNotifyErrorLink(status, state === "error" ? options.errorDetails : undefined);

  if (state) {
    status.dataset.state = state;
  } else {
    delete status.dataset.state;
  }

  const persistMs = options.persistMs ?? (state === "error" ? 0 : 2200);
  if (text && persistMs > 0) {
    testNotifyStatusTimer = setTimeout(() => {
      const currentStatusText = status.querySelector("[data-test-notify-status-text]") ?? status;
      if (currentStatusText.textContent === text) {
        currentStatusText.textContent = "";
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
 * @param {string|undefined} [errorDetails] 错误详情文本。
 */
function updateTestNotifyErrorLink(status, errorDetails) {
  const errorLink = status.querySelector("[data-test-notify-error-link]");
  if (!(errorLink instanceof HTMLAnchorElement)) {
    return;
  }

  if (testNotifyErrorDetailsUrl) {
    URL.revokeObjectURL(testNotifyErrorDetailsUrl);
    testNotifyErrorDetailsUrl = undefined;
  }

  if (!errorDetails) {
    errorLink.hidden = true;
    errorLink.removeAttribute("href");
    return;
  }

  testNotifyErrorDetailsUrl = URL.createObjectURL(
    new Blob(
      [renderTestNotifyErrorPage(errorLink, errorDetails)],
      { type: "text/html;charset=utf-8" },
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
  const appName = errorLink.dataset.errorAppName || document.title || "Heybox Topic Notifier";
  const appOrigin = globalThis.location?.origin || "";
  const colorMode = errorLink.dataset.errorDarkMode === "true" ? "dark" : "light";
  const direction = errorLink.dataset.errorDirection === "rtl" ? "rtl" : "ltr";
  const errorTitle = errorLink.dataset.errorTitle || "Error message";
  const locale = errorLink.dataset.errorLocale || document.documentElement.lang || "zh-CN";
  const generatedAt = new Date().toLocaleString(locale);
  const navDashboard = errorLink.dataset.errorNavDashboard || "Dashboard";
  const navHistory = errorLink.dataset.errorNavHistory || "History";
  const navSettings = errorLink.dataset.errorNavSettings || "Settings";
  const returnLabel = errorLink.dataset.errorReturnLabel || navSettings;
  const summary = errorLink.dataset.errorSummary || errorTitle;
  const themeColor = errorLink.dataset.errorThemeColor || "#BD7FFF";

  return `<!doctype html>
<html
  lang="${escapeHtml(locale)}"
  dir="${escapeHtml(direction)}"
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
          <dd><pre class="error-detail-content" dir="ltr">${escapeHtml(errorDetails)}</pre></dd>
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
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
}

/**
 * 生成当前设置表单签名。
 *
 * @return {string} 表单字段序列化后的签名。
 */
function settingsSignature() {
  if (!autoSaveForm) {
    return "";
  }

  const params = new URLSearchParams();
  for (const [key, value] of formDataFromForm(autoSaveForm).entries()) {
    params.append(key, String(value));
  }
  return params.toString();
}

/**
 * 从浏览器表单创建 FormData。
 *
 * 此脚本在浏览器执行；Deno 的 FormData 类型声明缺少 HTMLFormElement 重载。
 *
 * @param {HTMLFormElement} form 表单元素。
 * @return {FormData} 表单数据。
 */
function formDataFromForm(form) {
  // noinspection JSCheckFunctionSignatures
  return new FormData(form);
}

/**
 * 更新自动保存状态文案。
 *
 * @param {string} state 自动保存状态。
 * @param {string|undefined} [text] 自定义状态文案。
 */
function setAutoSaveStatus(state, text) {
  const status = document.querySelector("[data-autosave-status]");
  if (!status || !autoSaveForm) {
    return;
  }

  status.dataset.state = state;
  status.textContent = text ??
    autoSaveForm.dataset[`autosave${state[0].toUpperCase()}${state.slice(1)}`] ??
    "";
}

/**
 * 在话题规则表中插入一行。
 *
 * @param {HTMLElement} editor 话题编辑器元素。
 * @param {HTMLButtonElement} actionButton 触发插入的操作按钮。
 */
function insertTopicRow(editor, actionButton) {
  const template = editor.querySelector("[data-topic-row-template]");
  const grid = editor.querySelector(".topic-rule-grid");
  const row = actionButton.closest("[data-topic-row]");
  const fragment = template.content.cloneNode(true);
  const newRow = fragment.querySelector("[data-topic-row]");

  if (row) {
    row.after(newRow);
  } else {
    const firstRow = grid.querySelector("[data-topic-row]");
    if (firstRow) {
      firstRow.before(newRow);
    } else {
      grid.append(newRow);
    }
  }

  reindexTopicRows(editor);
  newRow.querySelector("[data-topic-id-input]").focus();
}

/**
 * 删除已选中的话题规则行。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 * @param {HTMLButtonElement} actionButton 触发删除的操作按钮。
 */
function deleteTopicRows(topicEditor, keywordEditor, actionButton) {
  const selectedRows = Array.from(topicEditor.querySelectorAll("[data-topic-row]"))
    .filter((row) => row.querySelector("[data-role='select-topic-row']")?.checked);

  if (selectedRows.length > 0) {
    selectedRows.forEach((row) => row.remove());
  } else {
    const row = actionButton.closest("[data-topic-row]");
    if (!row) {
      showToast(topicEditor, topicEditor.dataset.deleteMessage);
      return;
    }

    row.remove();
  }

  ensureAtLeastOneTopicRow(topicEditor);
  reindexTopicRows(topicEditor);

  const activeTarget = activeKeywordTargetInput().value;
  if (activeTarget !== "common" && !findTopicRowById(topicEditor, activeTarget)) {
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
  if (editor.querySelector("[data-topic-row]")) {
    return;
  }

  const template = editor.querySelector("[data-topic-row-template]");
  const grid = editor.querySelector(".topic-rule-grid");
  grid.append(template.content.cloneNode(true));
}

/**
 * 重新生成话题规则行的字段索引。
 *
 * @param {HTMLElement} editor 话题编辑器元素。
 */
function reindexTopicRows(editor) {
  editor.querySelectorAll("[data-role='select-all-topics']").forEach((checkbox) => {
    checkbox.checked = false;
  });

  editor.querySelectorAll("[data-topic-row]").forEach((row, index) => {
    row.querySelectorAll("input").forEach((input) => {
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

  const row = button.closest("[data-topic-row]");
  const target = row ? row.querySelector("[data-topic-id-input]").value.trim() : "common";
  topicEditor.querySelectorAll("[data-topic-row]").forEach((topicRow) => {
    topicRow.dataset.activeKeywordTarget = "false";
  });
  if (row) {
    row.dataset.activeKeywordTarget = "true";
  }
  activeKeywordTargetInput().value = target || "common";

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
  const activeTarget = activeKeywordTargetInput().value || "common";
  const serialized = serializeKeywordRows(keywordEditor);

  if (activeTarget === "common") {
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
  return row.querySelector("[data-topic-keyword-rules]")?.value ??
    row.querySelector("[data-action='edit-topic-keywords']")?.dataset.topicKeywords ??
    "[]";
}

/**
 * 写入话题行的关键词规则。
 *
 * @param {HTMLElement} row 话题规则行元素。
 * @param {string} serialized 序列化后的关键词规则。
 */
function setTopicKeywordRules(row, serialized) {
  const input = row.querySelector("[data-topic-keyword-rules]");
  const button = row.querySelector("[data-action='edit-topic-keywords']");
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
  const grid = keywordEditor.querySelector(".keyword-rule-grid");
  keywordEditor.querySelectorAll("[data-keyword-row]").forEach((row) => row.remove());

  const normalizedRules = rules.length > 0 ? rules : [newKeywordRule()];
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
  const template = keywordEditor.querySelector("[data-keyword-row-template]");
  const fragment = template.content.cloneNode(true);
  const row = fragment.querySelector("[data-keyword-row]");
  row.querySelector("input[name^='keyword_']").value = rule.keyword ?? "";
  setKeywordOption(row, "caseSensitive", rule.caseSensitive === true);
  setKeywordOption(row, "useRegex", rule.useRegex === true);
  row.querySelectorAll("[name*='_location_']").forEach((input) => {
    const location = input.name.match(/_location_(.+)$/)?.[1];
    input.checked = Array.isArray(rule.locations) && rule.locations.includes(location);
  });
  return row;
}

/**
 * 创建默认关键词规则。
 *
 * @return {{keyword: string, locations: string[]}} 默认关键词规则。
 */
function newKeywordRule() {
  return { keyword: "", locations: keywordMatchLocations };
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
    Array.from(keywordEditor.querySelectorAll("[data-keyword-row]"))
      .map((row) => {
        const keyword = row.querySelector("input[name^='keyword_']").value.trim();
        const locations = Array.from(row.querySelectorAll("[name*='_location_']"))
          .filter((input) => input.checked)
          .map((input) => input.name.match(/_location_(.+)$/)?.[1])
          .filter(Boolean);
        const caseSensitive = keywordOptionEnabled(row, "caseSensitive");
        const useRegex = keywordOptionEnabled(row, "useRegex");

        return { caseSensitive, keyword, locations, useRegex };
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
  const row = button.closest("[data-keyword-row]");
  if (!row) {
    return;
  }

  const option = button.dataset.option;
  const isEnabled = button.getAttribute("aria-pressed") === "true";
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
    input.value = isEnabled ? "on" : "";
  }

  if (button instanceof HTMLButtonElement) {
    button.setAttribute("aria-pressed", String(isEnabled));
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
  return input instanceof HTMLInputElement && input.value === "on";
}

/**
 * 在关键词规则表中插入一行。
 *
 * @param {HTMLElement} editor 关键词编辑器元素。
 * @param {HTMLButtonElement} actionButton 触发插入的操作按钮。
 */
function insertKeywordRow(editor, actionButton) {
  const grid = editor.querySelector(".keyword-rule-grid");
  const row = actionButton.closest("[data-keyword-row]");
  const newRow = keywordRowFromRule(editor, newKeywordRule());

  if (row) {
    row.after(newRow);
  } else {
    const firstRow = grid.querySelector("[data-keyword-row]");
    if (firstRow) {
      firstRow.before(newRow);
    } else {
      grid.append(newRow);
    }
  }

  reindexKeywordRows(editor);
  newRow.querySelector("input[name^='keyword_']").focus();
}

/**
 * 删除已选中的关键词规则行。
 *
 * @param {HTMLElement} editor 关键词编辑器元素。
 * @param {HTMLButtonElement} actionButton 触发删除的操作按钮。
 */
function deleteKeywordRows(editor, actionButton) {
  const selectedRows = Array.from(editor.querySelectorAll("[data-keyword-row]"))
    .filter((row) => row.querySelector("[data-role='select-keyword-row']")?.checked);

  if (selectedRows.length > 0) {
    selectedRows.forEach((row) => row.remove());
  } else {
    const row = actionButton.closest("[data-keyword-row]");
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
  if (editor.querySelector("[data-keyword-row]")) {
    return;
  }

  const grid = editor.querySelector(".keyword-rule-grid");
  grid.append(keywordRowFromRule(editor, newKeywordRule()));
}

/**
 * 重新生成关键词规则行的字段索引。
 *
 * @param {HTMLElement} editor 关键词编辑器元素。
 */
function reindexKeywordRows(editor) {
  editor.querySelectorAll("[data-role='select-all-keywords']").forEach((checkbox) => {
    checkbox.checked = false;
  });
  editor.querySelectorAll("[data-role='select-keyword-location']").forEach((checkbox) => {
    checkbox.checked = false;
  });

  editor.querySelectorAll("[data-keyword-row]").forEach((row, index) => {
    row.querySelectorAll("input").forEach((input) => {
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
  const activeTarget = activeKeywordTargetInput().value || "common";
  const summary = topicEditor.querySelector("[data-topic-summary]");

  if (activeTarget === "common") {
    topicEditor.querySelectorAll("[data-topic-row]").forEach((row) => {
      row.dataset.activeKeywordTarget = "false";
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

  const id = row.querySelector("[data-topic-id-input]").value.trim();
  const note = row.querySelector("[data-topic-note-input]").value.trim();
  activeKeywordTargetInput().value = id || "common";
  summary.textContent = note && id ? `${note}（${id}）` : note || id || summary.dataset.commonLabel;
}

/**
 * 更新关键词摘要文本。
 *
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 */
function updateKeywordSummary(keywordEditor) {
  const summary = keywordEditor.querySelector("[data-keyword-summary]");
  const keywords = Array.from(
    keywordEditor.querySelectorAll(
      "input[name^='keyword_']:not([name*='_location_']):not([data-keyword-option])",
    ),
  )
    .map((input) => input.value.trim())
    .filter(Boolean);

  summary.textContent = "";
  keywords.slice(0, 5).forEach((keyword, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "summary-separator";
      separator.textContent = "|";
      summary.append(separator);
    }

    const item = document.createElement("span");
    item.dataset.keywordSummaryItem = "true";
    item.textContent = keyword;
    summary.append(item);
  });

  if (keywords.length > 5) {
    summary.append("...");
  }

  fitKeywordSummary(summary);
}

/**
 * 压缩关键词摘要，使其适配可见宽度。
 *
 * @param {HTMLElement} summary 关键词摘要元素。
 */
function fitKeywordSummary(summary) {
  const items = Array.from(summary.querySelectorAll("[data-keyword-summary-item]"));
  for (const item of items.toReversed()) {
    if (summary.scrollWidth <= summary.clientWidth) {
      return;
    }

    const previous = item.previousElementSibling;
    item.remove();
    if (previous?.classList.contains("summary-separator")) {
      previous.remove();
    }
    summary.append("...");
  }
}

/**
 * 展开关键词编辑面板。
 *
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 */
function openKeywordPanel(keywordEditor) {
  setDropdownOpen(keywordEditor, "keywords", true, { persist: true });
}

/**
 * 根据话题 ID 查找话题规则行。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {string} id 话题 ID。
 * @return {HTMLElement|undefined} 匹配的话题规则行。
 */
function findTopicRowById(topicEditor, id) {
  for (const row of topicEditor.querySelectorAll("[data-topic-row]")) {
    if (!(row instanceof HTMLElement)) {
      continue;
    }

    const idInput = row.querySelector("[data-topic-id-input]");
    if (idInput instanceof HTMLInputElement && idInput.value.trim() === id) {
      return row;
    }
  }

  return undefined;
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
  return document.querySelector("[data-active-keyword-target]");
}

/**
 * 显示编辑器内提示消息。
 *
 * @param {HTMLElement} editor 编辑器根元素。
 * @param {string|undefined} message 提示消息。
 */
function showToast(editor, message) {
  const existing = editor.querySelector("[data-keyword-toast]");
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement("div");
  toast.className = "keyword-toast";
  toast.dataset.keywordToast = "true";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  editor.append(toast);

  setTimeout(() => {
    toast.classList.add("is-hiding");
  }, 1800);

  setTimeout(() => {
    toast.remove();
  }, 2200);
}

document.addEventListener("DOMContentLoaded", initSettingsEditors);
