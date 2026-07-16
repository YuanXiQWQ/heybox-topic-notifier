let autoSaveForm;
let autoSaveKeywordEditor;
let autoSaveTopicEditor;
let autoSaveTimer;
let autoSaveController;
let testNotifyErrorDetailsUrl;
let testNotifyStatusTimer;
let lastSavedSignature = "";
let reloadAfterSave = false;
const notificationTransitionMs = 190;
const dropdownStoragePrefix = "heybox-notifier.settings.dropdown.";

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
  initNotificationSettings();
  initPollingSettings();
  initThemePicker();
  initKeywordRuleStorage(topicEditor, keywordEditor);
  initAutoSave(topicEditor.closest("form"), topicEditor, keywordEditor);
  updateKeywordSummary(keywordEditor);
}

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

  function rowName(row) {
    return row.dataset.notificationField;
  }

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

function initPollingSettings() {
  const enabledToggle = document.querySelector("[data-polling-enabled-toggle]");
  const intervalValueInput = document.querySelector("[data-polling-interval-value]");
  const intervalUnitSelect = document.querySelector("[data-polling-interval-unit]");
  const section = document.querySelector("[data-polling-section]");
  const rows = Array.from(document.querySelectorAll("[data-polling-field]"));

  if (!(enabledToggle instanceof HTMLInputElement)) {
    return;
  }

  let transitionToken = 0;

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
  });

  intervalValueInput?.addEventListener("blur", () => {
    validateMinimumInterval();
  });

  intervalUnitSelect?.addEventListener("change", () => {
    validateMinimumInterval();
  });

  validateMinimumInterval();
  syncPollingFields(false);
}

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

function dropdownPanel(editor, name) {
  return editor.querySelector(`[data-${name.slice(0, -1)}-panel]`);
}

function dropdownToggle(editor, name) {
  return editor.querySelector(`[data-action="toggle-${name}"]`);
}

function storedDropdownOpen(name) {
  try {
    return localStorage.getItem(dropdownStorageKey(name)) === "open";
  } catch {
    return false;
  }
}

function storeDropdownOpen(name, isOpen) {
  try {
    localStorage.setItem(dropdownStorageKey(name), isOpen ? "open" : "closed");
  } catch {
    // Keep the dropdown usable when browser storage is unavailable.
  }
}

function dropdownStorageKey(name) {
  return `${dropdownStoragePrefix}${name}`;
}

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

function actionButtonFromEvent(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return undefined;
  }

  const button = target.closest("[data-action]");
  return button instanceof HTMLButtonElement ? button : undefined;
}

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

function commonKeywordRulesInput() {
  return document.querySelector("[data-common-keyword-rules]");
}

function findActiveTopicRow(topicEditor, activeTarget) {
  return topicEditor.querySelector('[data-topic-row][data-active-keyword-target="true"]') ??
    findTopicRowById(topicEditor, activeTarget);
}

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

function isEditorEvent(event) {
  const target = event.target;
  return target instanceof Element &&
    Boolean(target.closest("[data-topic-editor], [data-keyword-editor]"));
}

function scheduleAutoSave() {
  if (!autoSaveForm) {
    return;
  }

  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    void saveSettingsNow();
  }, 450);
}

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
      body: new FormData(autoSaveForm),
      headers: { "x-autosave": "1" },
      method: autoSaveForm.method || "post",
      signal: autoSaveController.signal,
    });

    if (!response.ok) {
      throw new Error(`Save failed with ${response.status}`);
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

async function sendTestNotification(testNotifyButton) {
  const fallbackError = testNotifyButton?.dataset?.testNotifyFailed ?? "";

  try {
    const response = await fetch("/test-notify", {
      headers: { "x-test-notify": "1" },
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

function renderTestNotifyErrorPage(errorLink, errorDetails) {
  const appName = errorLink.dataset.errorAppName || document.title || "Heybox Topic Notifier";
  const appOrigin = globalThis.location?.origin || "";
  const colorMode = errorLink.dataset.errorDarkMode === "true" ? "dark" : "light";
  const errorTitle = errorLink.dataset.errorTitle || "Error message";
  const locale = errorLink.dataset.errorLocale || document.documentElement.lang || "zh-CN";
  const generatedAt = new Date().toLocaleString();
  const navDashboard = errorLink.dataset.errorNavDashboard || "Dashboard";
  const navHistory = errorLink.dataset.errorNavHistory || "History";
  const navSettings = errorLink.dataset.errorNavSettings || "Settings";
  const returnLabel = errorLink.dataset.errorReturnLabel || navSettings;
  const summary = errorLink.dataset.errorSummary || errorTitle;
  const themeColor = errorLink.dataset.errorThemeColor || "#bd7fff";

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

function settingsSignature() {
  if (!autoSaveForm) {
    return "";
  }

  return new URLSearchParams(new FormData(autoSaveForm)).toString();
}

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

function ensureAtLeastOneTopicRow(editor) {
  if (editor.querySelector("[data-topic-row]")) {
    return;
  }

  const template = editor.querySelector("[data-topic-row-template]");
  const grid = editor.querySelector(".topic-rule-grid");
  grid.append(template.content.cloneNode(true));
}

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

function topicKeywordRulesValue(row) {
  return row.querySelector("[data-topic-keyword-rules]")?.value ??
    row.querySelector("[data-action='edit-topic-keywords']")?.dataset.topicKeywords ??
    "[]";
}

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

function replaceKeywordRows(keywordEditor, rules) {
  const grid = keywordEditor.querySelector(".keyword-rule-grid");
  keywordEditor.querySelectorAll("[data-keyword-row]").forEach((row) => row.remove());

  const normalizedRules = rules.length > 0 ? rules : [{ keyword: "", locations: [] }];
  normalizedRules.forEach((rule) => {
    grid.append(keywordRowFromRule(keywordEditor, rule));
  });

  reindexKeywordRows(keywordEditor);
}

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

function toggleKeywordOption(button) {
  const row = button.closest("[data-keyword-row]");
  if (!row) {
    return;
  }

  const option = button.dataset.option;
  const isEnabled = button.getAttribute("aria-pressed") === "true";
  setKeywordOption(row, option, !isEnabled);
}

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

function keywordOptionEnabled(row, option) {
  const input = row.querySelector(`[data-keyword-option="${option}"]`);
  return input instanceof HTMLInputElement && input.value === "on";
}

function insertKeywordRow(editor, actionButton) {
  const grid = editor.querySelector(".keyword-rule-grid");
  const row = actionButton.closest("[data-keyword-row]");
  const newRow = keywordRowFromRule(editor, { keyword: "", locations: [] });

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

function ensureAtLeastOneKeywordRow(editor) {
  if (editor.querySelector("[data-keyword-row]")) {
    return;
  }

  const grid = editor.querySelector(".keyword-rule-grid");
  grid.append(keywordRowFromRule(editor, { keyword: "", locations: [] }));
}

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

function openKeywordPanel(keywordEditor) {
  setDropdownOpen(keywordEditor, "keywords", true, { persist: true });
}

function findTopicRowById(topicEditor, id) {
  return Array.from(topicEditor.querySelectorAll("[data-topic-row]"))
    .find((row) => row.querySelector("[data-topic-id-input]").value.trim() === id);
}

function commonKeywordButton(topicEditor) {
  return topicEditor.querySelector(
    '[data-action="edit-topic-keywords"][data-keyword-target="common"]',
  );
}

function activeKeywordTargetInput() {
  return document.querySelector("[data-active-keyword-target]");
}

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
