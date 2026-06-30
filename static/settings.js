let autoSaveForm;
let autoSaveKeywordEditor;
let autoSaveTopicEditor;
let autoSaveTimer;
let autoSaveController;
let lastSavedSignature = "";
let reloadAfterSave = false;

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
  initThemePicker();
  initKeywordRuleStorage(topicEditor, keywordEditor);
  initAutoSave(topicEditor.closest("form"), topicEditor, keywordEditor);
  updateKeywordSummary(keywordEditor);
}

function initDropdown(editor, name) {
  const panel = editor.querySelector(`[data-${name.slice(0, -1)}-panel]`);
  const toggle = editor.querySelector(`[data-action="toggle-${name}"]`);
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "true");
  panel.inert = true;

  toggle.addEventListener("click", () => {
    const className = `is-${name.slice(0, -1)}-open`;
    const isOpen = !editor.classList.contains(className);
    editor.classList.toggle(className, isOpen);
    panel.setAttribute("aria-hidden", String(!isOpen));
    panel.inert = !isOpen;
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.classList.toggle("is-open", isOpen);
  });
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
    return;
  }

  persistCurrentKeywordRows(autoSaveTopicEditor, autoSaveKeywordEditor);

  const signature = settingsSignature();
  if (signature === lastSavedSignature) {
    return;
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
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }

    setAutoSaveStatus("error");
  }
}

function settingsSignature() {
  if (!autoSaveForm) {
    return "";
  }

  return new URLSearchParams(new FormData(autoSaveForm)).toString();
}

function setAutoSaveStatus(state) {
  const status = document.querySelector("[data-autosave-status]");
  if (!status || !autoSaveForm) {
    return;
  }

  status.dataset.state = state;
  status.textContent = autoSaveForm.dataset[`autosave${state[0].toUpperCase()}${state.slice(1)}`] ??
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

        return { keyword, locations };
      })
      .filter((rule) => rule.keyword && rule.locations.length > 0),
  );
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
    keywordEditor.querySelectorAll("input[name^='keyword_']:not([name*='_location_'])"),
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
  const panel = keywordEditor.querySelector("[data-keyword-panel]");
  const toggle = keywordEditor.querySelector("[data-action='toggle-keywords']");
  keywordEditor.classList.add("is-keyword-open");
  panel.setAttribute("aria-hidden", "false");
  panel.inert = false;
  toggle.setAttribute("aria-expanded", "true");
  toggle.classList.add("is-open");
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
