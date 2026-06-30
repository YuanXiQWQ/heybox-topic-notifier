function initKeywordEditor(editor) {
  const panel = editor.querySelector("[data-keyword-panel]");
  const toggle = editor.querySelector("[data-action='toggle-keywords']");

  editor.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const actionButton = target.closest("[data-action]");
    if (!(actionButton instanceof HTMLButtonElement)) {
      return;
    }

    const action = actionButton.dataset.action;
    if (action === "toggle-keywords") {
      const isOpen = panel.hidden;
      panel.hidden = !isOpen;
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.classList.toggle("is-open", isOpen);
      return;
    }

    if (action === "insert-keyword") {
      insertKeywordRow(editor, actionButton);
      return;
    }

    if (action === "delete-keywords") {
      deleteKeywordRows(editor, actionButton);
    }
  });

  editor.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.matches("[data-role='select-all-keywords']")) {
      editor.querySelectorAll("[data-role='select-keyword-row']").forEach((checkbox) => {
        checkbox.checked = target.checked;
      });
    }
  });
}

function insertKeywordRow(editor, actionButton) {
  const template = editor.querySelector("[data-keyword-row-template]");
  const grid = editor.querySelector(".keyword-rule-grid");
  const row = actionButton.closest("[data-keyword-row]");
  const fragment = template.content.cloneNode(true);
  const newRow = fragment.querySelector("[data-keyword-row]");

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
      showKeywordToast(editor, editor.dataset.deleteMessage);
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

  const template = editor.querySelector("[data-keyword-row-template]");
  const grid = editor.querySelector(".keyword-rule-grid");
  grid.append(template.content.cloneNode(true));
}

function reindexKeywordRows(editor) {
  editor.querySelectorAll("[data-role='select-all-keywords']").forEach((checkbox) => {
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

document.querySelectorAll("[data-keyword-editor]").forEach(initKeywordEditor);

function showKeywordToast(editor, message) {
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
