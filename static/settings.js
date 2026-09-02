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
 * 安全设置自动保存防抖定时器。
 */
let securityAutoSaveTimer;
/**
 * 安全设置自动保存请求控制器。
 */
let securityAutoSaveController;
/**
 * 最近一次成功保存的安全设置表单签名。
 */
let lastSavedSecuritySignature = "";
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
 * 当前密码输入停止后触发自动验证的等待时间。
 */
const accountPasswordVerifyDelayMs = 650;
/**
 * 邮箱验证码输入停止后触发自动校验的等待时间。
 */
const emailBindingVerifyDelayMs = 650;
/**
 * 邮箱再认证验证码允许重新发送前的等待秒数。
 */
const reauthEmailResendDelaySeconds = 60;
/**
 * 认证方法面板过渡序号。
 */
let authMethodPanelTransitionId = 0;
/**
 * 等待再认证后继续执行的敏感操作表单。
 */
let pendingSensitiveActionForm;
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
  initSecretEditors();
  initPollingSettings();
  initAccountSettings();
  initAuthMethodPanels();
  initEmailBinding();
  initTotpBinding();
  initTotpManualKeyCopy();
  initRecoveryCodeDownload();
  initRecoveryCodeConfirmation();
  initRecoveryCodeGeneration();
  initPasskeyBinding();
  initGoogleBinding();
  initSensitiveActionForms();
  initReauth();
  initSecuritySettingsAutoSave();
  initThemePicker();
  initKeywordRuleStorage(topicEditor, keywordEditor);
  initAutoSave(topicEditor.closest("form"), topicEditor, keywordEditor);
  updateKeywordSummary(keywordEditor);
}

/**
 * 初始化验证器绑定的原地更新流程。
 *
 * @param {ParentNode} [scope] 查找范围。
 */
function initTotpBinding(scope = document) {
  const section = scope.querySelector("[data-totp-binding-section]");
  const form = section?.querySelector("[data-totp-binding-form]");
  if (
    !(section instanceof HTMLElement) ||
    !(form instanceof HTMLFormElement) ||
    form.dataset.totpBindingInitialized === "true"
  ) {
    return;
  }

  form.dataset.totpBindingInitialized = "true";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitTotpBinding(section, form);
  });
}

/**
 * 原地打开或确认验证器绑定，不触发整页导航。
 *
 * @param {HTMLElement} section 验证器绑定区域。
 * @param {HTMLFormElement} form 验证器绑定表单。
 * @return {Promise<boolean>} 页面状态更新成功时返回 true。
 */
async function submitTotpBinding(section, form) {
  if (form.dataset.totpBindingPending === "true") {
    return false;
  }
  if (!form.checkValidity()) {
    form.reportValidity();
    return false;
  }

  const submitButton = document.querySelector(
    `[form="${form.id}"][type="submit"]`,
  );
  const status = section.querySelector("[data-totp-binding-status]");
  form.dataset.totpBindingPending = "true";
  if (submitButton instanceof HTMLButtonElement) {
    submitButton.disabled = true;
  }

  try {
    if (form.method.toLowerCase() === "get") {
      const url = new URL(form.action);
      for (const [name, value] of formDataFromForm(form)) {
        if (typeof value === "string") {
          url.searchParams.append(name, value);
        }
      }
      return await refreshTwoStepSettings(url.href);
    }

    const response = await fetch(form.action, {
      body: formDataFromForm(form),
      headers: csrfRequestHeaders({ "x-totp-binding": "1" }),
      method: form.method || "post",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      setInlineStatus(
        status,
        totpBindingErrorMessage(section, payload.error),
        "error",
      );
      return false;
    }
    if (typeof payload.redirectTo !== "string") {
      return false;
    }
    return await refreshTwoStepSettings(payload.redirectTo);
  } catch {
    setInlineStatus(
      status,
      section.dataset.totpCodeError || "",
      "error",
    );
    return false;
  } finally {
    delete form.dataset.totpBindingPending;
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = false;
    }
  }
}

/**
 * 获取验证器绑定错误对应的本地化文案。
 *
 * @param {HTMLElement} section 验证器绑定区域。
 * @param {unknown} error 服务端错误码。
 * @return {string} 对应的错误文案。
 */
function totpBindingErrorMessage(section, error) {
  switch (error) {
    case "config":
      return section.dataset.totpConfigError || "";
    case "notFound":
      return section.dataset.totpNotFoundError || "";
    default:
      return section.dataset.totpCodeError || "";
  }
}

/**
 * 后台读取设置页并解析成独立文档，避免浏览器发生页面导航。
 *
 * @param {string} url 设置页地址。
 * @return {Promise<Document>} 解析后的设置页文档。
 */
async function fetchSettingsDocument(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not refresh settings.");
  }
  const parsed = new DOMParser().parseFromString(
    await response.text(),
    "text/html",
  );
  if (!(parsed instanceof Document)) {
    throw new Error("Could not parse settings.");
  }
  return parsed;
}

/**
 * 原地同步两步验证设置区域并重新绑定交互。
 *
 * @param {string} url 最新设置页地址。
 * @return {Promise<boolean>} 区域更新成功时返回 true。
 */
async function refreshTwoStepSettings(url) {
  const parsed = await fetchSettingsDocument(url);
  const currentForm = document.querySelector("[data-security-settings-form]");
  const nextForm = parsed.querySelector("[data-security-settings-form]");
  const currentSection = document.querySelector(
    'section[aria-labelledby="account-two-step-heading"]',
  );
  const nextSection = parsed.querySelector(
    'section[aria-labelledby="account-two-step-heading"]',
  );
  if (
    !(currentForm instanceof HTMLFormElement) ||
    !(nextForm instanceof HTMLFormElement) ||
    !(currentSection instanceof HTMLElement) ||
    !(nextSection instanceof HTMLElement)
  ) {
    return false;
  }

  currentForm.replaceWith(nextForm);
  currentSection.replaceWith(nextSection);
  pendingSensitiveActionForm = undefined;
  initAuthMethodPanels(nextSection);
  initTotpBinding(nextSection);
  initTotpManualKeyCopy(nextSection);
  initRecoveryCodeDownload();
  initRecoveryCodeConfirmation();
  initRecoveryCodeGeneration();
  initSensitiveActionForms(nextSection);
  initReauth(nextSection);
  initSecuritySettingsAutoSave();
  return true;
}

/**
 * 原地同步 Passkey 设置行并重新绑定交互。
 *
 * @param {string} url 最新设置页地址。
 * @return {Promise<boolean>} 设置行更新成功时返回 true。
 */
async function refreshPasskeySettings(url) {
  const parsed = await fetchSettingsDocument(url);
  const currentRow = document.querySelector("#auth-method-passkey");
  const nextRow = parsed.querySelector("#auth-method-passkey");
  if (
    !(currentRow instanceof HTMLElement) ||
    !(nextRow instanceof HTMLElement)
  ) {
    return false;
  }

  currentRow.replaceWith(nextRow);
  pendingSensitiveActionForm = undefined;
  initAuthMethodPanels(nextRow);
  initPasskeyBinding(nextRow);
  initSensitiveActionForms(nextRow);
  initReauth(nextRow);
  return true;
}

/**
 * 初始化验证器手动密钥复制按钮。
 *
 * @param {ParentNode} [scope] 查找范围。
 */
function initTotpManualKeyCopy(scope = document) {
  const key = scope.querySelector("[data-totp-manual-key]");
  const button = scope.querySelector("[data-totp-copy-button]");
  const status = scope.querySelector("[data-totp-copy-status]");

  if (
    !(key instanceof HTMLElement) ||
    !(button instanceof HTMLButtonElement) ||
    !(status instanceof HTMLElement)
  ) {
    return;
  }

  const copyLabel = button.dataset.totpCopyLabel || "";
  let resetTimer;

  button.addEventListener("click", async () => {
    button.disabled = true;
    const copied = await copyTextToClipboard(key.textContent?.trim() || "");
    const feedback = copied
      ? button.dataset.totpCopySuccess || copyLabel
      : button.dataset.totpCopyFailed || copyLabel;

    button.disabled = false;
    button.dataset.state = copied ? "copied" : "failed";
    button.setAttribute("aria-label", feedback);
    button.title = feedback;
    status.textContent = feedback;
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      delete button.dataset.state;
      button.setAttribute("aria-label", copyLabel);
      button.title = copyLabel;
      status.textContent = "";
    }, 1800);
  });
}

/**
 * 初始化首次展示恢复码的纯文本下载按钮。
 */
function initRecoveryCodeDownload() {
  const list = document.querySelector("[data-recovery-code-list]");
  const button = document.querySelector("[data-recovery-codes-download]");
  const status = document.querySelector("[data-recovery-download-status]");
  if (
    !(list instanceof HTMLElement) ||
    !(button instanceof HTMLButtonElement) ||
    !(status instanceof HTMLElement)
  ) {
    return;
  }

  const downloadLabel = button.dataset.recoveryDownloadLabel || "";
  button.addEventListener("click", () => {
    const codes = Array.from(list.querySelectorAll("code"))
      .map((code) => code.textContent?.trim() || "")
      .filter(Boolean);
    const appName = button.dataset.recoveryDownloadAppName?.trim() || "";
    const fileLabel = button.dataset.recoveryDownloadFileLabel?.trim() || "";
    if (!appName || !fileLabel) {
      button.dataset.state = "failed";
      status.textContent = button.dataset.recoveryDownloadFailed ||
        downloadLabel;
      return;
    }
    const date = localDateString(
      new Date(),
      document.documentElement.lang || navigator.language,
    );
    const filename = `${safeDownloadFilenamePart(appName)}-${
      safeDownloadFilenamePart(fileLabel)
    }-${safeDownloadFilenamePart(date)}.txt`;
    const content = `${appName} - ${fileLabel}\n${date}\n\n${
      codes.join("\n")
    }\n\n${button.dataset.recoveryDownloadHint || ""}\n`;

    try {
      const blobUrl = URL.createObjectURL(
        new Blob([`\uFEFF${content}`], { type: "text/plain;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
      status.textContent = downloadLabel;
    } catch {
      const feedback = button.dataset.recoveryDownloadFailed || downloadLabel;
      button.dataset.state = "failed";
      status.textContent = feedback;
    }
  });
}

/**
 * 生成本地日期字符串。
 *
 * @param {Date} date 日期对象。
 * @param {string} locale 当前页面语言。
 * @return {string} 按当前语言格式化的本地日期。
 */
function localDateString(date, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

/**
 * 清理下载文件名片段中的系统保留字符。
 *
 * @param {string} value 原始文件名片段。
 * @return {string} 可安全用于文件名的片段。
 */
function safeDownloadFilenamePart(value) {
  const filenamePart = Array.from(
    value,
    (character) =>
      character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character)
        ? "_"
        : character,
  ).join("").trim().replace(/[. ]+$/, "");
  return filenamePart || "_";
}

/**
 * 初始化恢复码保存确认按钮，确认后立即从页面清除明文。
 */
function initRecoveryCodeConfirmation() {
  const reveal = document.querySelector("[data-recovery-code-reveal]");
  const button = document.querySelector("[data-recovery-codes-confirm]");
  if (
    !(reveal instanceof HTMLElement) ||
    !(button instanceof HTMLButtonElement)
  ) {
    return;
  }

  button.addEventListener("click", () => {
    reveal.querySelectorAll("code").forEach((code) => {
      code.textContent = "";
    });
    const panel = reveal.closest("[data-auth-method-panel]");
    const generateButton = document.querySelector(
      "[data-recovery-codes-generate]",
    );
    const generationRoot = panel?.querySelector(
      "[data-recovery-code-generation]",
    );
    reveal.remove();
    if (generateButton instanceof HTMLButtonElement) {
      generateButton.hidden = false;
    }
    if (generationRoot instanceof HTMLElement) {
      generationRoot.hidden = false;
    }
    if (
      panel instanceof HTMLElement &&
      generateButton instanceof HTMLButtonElement
    ) {
      setAuthMethodPanelVisible(panel, generateButton, false);
    }
  });
}

/**
 * 初始化恢复码原地确认和生成流程。
 */
function initRecoveryCodeGeneration() {
  const root = document.querySelector("[data-recovery-code-generation]");
  const button = document.querySelector("[data-recovery-codes-generate]");
  if (
    !(root instanceof HTMLElement) ||
    !(button instanceof HTMLButtonElement)
  ) {
    return;
  }

  const status = root.querySelector("[data-recovery-generation-status]");
  let generating = false;

  root.addEventListener("reauth-success", () => {
    void generateRecoveryCodes();
  });
  root.addEventListener("reauth-cancel", (event) => {
    if (
      !(event.target instanceof HTMLElement) ||
      !event.target.matches(
        '[data-reauth-section][data-reauth-purpose="recovery_codes"]',
      )
    ) {
      return;
    }

    event.preventDefault();
    const panel = root.closest("[data-auth-method-panel]");
    if (panel instanceof HTMLElement) {
      setAuthMethodPanelVisible(panel, button, false);
    }
  });

  /**
   * 请求生成恢复码，并定位回恢复码设置行展示结果。
   *
   * @return {Promise<void>} 生成请求完成后的 Promise。
   */
  async function generateRecoveryCodes() {
    if (generating) {
      return;
    }

    generating = true;
    button.disabled = true;
    setInlineStatus(
      status,
      root.dataset.recoveryGenerating || "",
      "pending",
    );
    try {
      const body = new URLSearchParams();
      body.set(csrfFieldName, currentCsrfToken());
      const response = await fetch(
        root.dataset.recoveryGenerateUrl ||
          "/account/recovery-codes/generate",
        {
          body,
          headers: csrfRequestHeaders({
            "content-type": "application/x-www-form-urlencoded",
            "x-recovery-code-generate": "1",
          }),
          method: "POST",
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (
        !response.ok ||
        typeof payload.redirectTo !== "string"
      ) {
        setInlineStatus(
          status,
          root.dataset.recoveryGenerateFailed || "",
          "error",
        );
        return;
      }

      globalThis.location.assign(payload.redirectTo);
    } catch {
      setInlineStatus(
        status,
        root.dataset.recoveryGenerateFailed || "",
        "error",
      );
    } finally {
      generating = false;
      button.disabled = false;
    }
  }
}

/**
 * 将文本写入系统剪贴板，并在 Clipboard API 不可用时使用选区复制回退。
 *
 * @param {string} value 待复制文本。
 * @return {Promise<boolean>} 复制成功时返回 true。
 */
async function copyTextToClipboard(value) {
  if (!value) {
    return false;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

/**
 * 初始化通知设置联动和测试通知交互。
 */
function initNotificationSettings() {
  const providerSelect = document.querySelector(
    "[data-notification-provider-select]",
  );
  const emailServiceSelect = document.querySelector(
    "[data-notification-email-service-select]",
  );
  const serviceSelect = document.querySelector(
    "[data-notification-webhook-service-select]",
  );
  const testNotifyButton = document.querySelector("[data-test-notify-button]");
  const rows = Array.from(
    document.querySelectorAll("[data-notification-field]"),
  );

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
    setTestNotifyStatus(
      testNotifyButton.dataset.testNotifySending ?? "",
      "pending",
      {
        persistMs: 0,
      },
    );
    try {
      const saved = await saveSettingsNow();
      if (saved) {
        await sendTestNotification(testNotifyButton);
      } else {
        setTestNotifyStatus(
          testNotifyButton.dataset.testNotifyFailed ?? "",
          "error",
        );
      }
    } finally {
      testNotifyButton.disabled = false;
    }
  });

  applyNotificationFields(visibleFields, false, ++transitionToken);
}

/**
 * 初始化敏感令牌输入框的解锁和自动锁定交互。
 */
function initSecretEditors() {
  document.querySelectorAll("[data-secret-editor]").forEach((editor) => {
    const input = editor.querySelector("[data-secret-display-input]");
    const button = editor.querySelector("[data-secret-edit-button]");
    if (
      !(input instanceof HTMLInputElement) ||
      !(button instanceof HTMLButtonElement)
    ) {
      return;
    }

    button.addEventListener("click", () => {
      unlockSecretEditor(input);
    });

    input.addEventListener("blur", () => {
      lockSecretEditorAfterEdit(input);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
  });
}

/**
 * 解锁敏感令牌输入框。
 *
 * @param {HTMLInputElement} input 敏感令牌展示输入框。
 */
function unlockSecretEditor(input) {
  input.readOnly = false;
  input.type = "password";
  input.value = "";
  input.focus();
}

/**
 * 在输入框失焦后锁定敏感令牌。
 *
 * @param {HTMLInputElement} input 敏感令牌展示输入框。
 */
function lockSecretEditorAfterEdit(input) {
  const editor = input.closest("[data-secret-editor]");
  const hiddenInput = editor?.querySelector("[data-secret-hidden-input]");
  if (!(hiddenInput instanceof HTMLInputElement)) {
    lockSecretDisplay(input, input.value.length);
    return;
  }

  const submittedValue = input.value;
  if (submittedValue.length > 0) {
    hiddenInput.value = submittedValue;
    input.dataset.secretConfigured = "true";
    lockSecretDisplay(input, submittedValue.length);
    scheduleAutoSave();
    return;
  }

  hiddenInput.value = "";
  lockSecretDisplay(
    input,
    input.dataset.secretConfigured === "true"
      ? Number(input.dataset.secretMaskLength)
      : 0,
  );
}

/**
 * 锁定敏感令牌展示输入框并显示遮罩。
 *
 * @param {HTMLInputElement} input 敏感令牌展示输入框。
 * @param {number} maskLength 遮罩点数量。
 */
function lockSecretDisplay(input, maskLength) {
  const normalizedLength = normalizedSecretMaskLength(maskLength);
  input.type = "text";
  input.value = secretMask(normalizedLength);
  input.dataset.secretMaskLength = String(normalizedLength);
  input.readOnly = true;
}

/**
 * 生成指定长度的令牌遮罩。
 *
 * @param {number} length 遮罩长度。
 * @return {string} 遮罩文本。
 */
function secretMask(length) {
  return "•".repeat(normalizedSecretMaskLength(length));
}

/**
 * 规范化令牌遮罩长度。
 *
 * @param {number} length 原始遮罩长度。
 * @return {number} 可用于展示的遮罩长度。
 */
function normalizedSecretMaskLength(length) {
  return Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0;
}

/**
 * 清除已成功提交的令牌明文。
 */
function clearSecretSubmissionValues() {
  document.querySelectorAll("[data-secret-hidden-input]").forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input.value = "";
    }
  });
}

/**
 * 初始化轮询设置联动。
 */
function initPollingSettings() {
  const enabledToggle = document.querySelector("[data-polling-enabled-toggle]");
  const intervalValueInput = document.querySelector(
    "[data-polling-interval-value]",
  );
  const intervalUnitSelect = document.querySelector(
    "[data-polling-interval-unit]",
  );
  const subMinuteHint = document.querySelector(
    "[data-polling-sub-minute-hint]",
  );
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
  const currentPasswordRow = form.querySelector(
    "[data-account-current-password-row]",
  );
  const currentPasswordInput = form.querySelector(
    "[data-account-current-password-input]",
  );
  const currentPasswordStatus = form.querySelector(
    "[data-account-current-password-status]",
  );
  const passkeyReauthRow = form.querySelector(
    "[data-account-passkey-reauth-row]",
  );
  const passkeyStatus = form.querySelector("[data-account-passkey-status]");
  const passkeyRetryButton = form.querySelector(
    "[data-account-passkey-retry-button]",
  );
  const passwordFallbackButton = form.querySelector(
    "[data-account-password-fallback-button]",
  );
  const newPasswordStatus = form.querySelector(
    "[data-account-new-password-status]",
  );
  const confirmPasswordStatus = form.querySelector(
    "[data-account-confirm-password-status]",
  );
  const newPasswordRows = Array.from(
    form.querySelectorAll("[data-account-new-password-row]"),
  );
  const unlockedFields = Array.from(
    form.querySelectorAll("[data-account-unlocked-field]"),
  );
  const actions = form.querySelector("[data-account-actions]");
  const saveButton = form.querySelector("[data-account-save-button]");
  const cancelButton = form.querySelector("[data-account-cancel-button]");
  const actionStatus = form.querySelector("[data-account-status]");
  const fieldStatuses = Array.from(
    form.querySelectorAll(".account-field-status"),
  );
  const passkeyAvailable = form.dataset.accountPasskeyAvailable === "true";
  const passwordAvailable = form.dataset.accountPasswordAvailable === "true";
  let mode = form.dataset.accountInitialMode || "";
  let reauthVerified = form.dataset.accountRecentlyVerified === "true";
  let transitionToken = 0;
  let pendingAccountModePointerMode = "";
  let passkeyReauthToken = 0;
  let currentPasswordVerifyTimer;
  let currentPasswordVerifyController;
  let currentPasswordVerifyToken = 0;

  if (
    !(actionInput instanceof HTMLInputElement) ||
    !(usernameInput instanceof HTMLInputElement) ||
    !(currentPasswordRow instanceof HTMLElement) ||
    !(currentPasswordInput instanceof HTMLInputElement) ||
    !(passkeyReauthRow instanceof HTMLElement) ||
    !(passkeyRetryButton instanceof HTMLButtonElement) ||
    !(passwordFallbackButton instanceof HTMLButtonElement) ||
    !(actions instanceof HTMLElement) ||
    !(saveButton instanceof HTMLButtonElement)
  ) {
    return;
  }

  actionInput.value = mode;
  lockAccountTargets();
  setCurrentPasswordInputEnabled(!currentPasswordRow.hidden);
  if (mode && reauthVerified) {
    setCurrentPasswordInputEnabled(false);
    hideAccountElement(currentPasswordRow, false, ++transitionToken);
    unlockSelectedTarget();
  }

  document
    .querySelectorAll("[data-account-mode], [data-account-mode-trigger]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        if (button instanceof HTMLButtonElement) {
          const nextMode = button.dataset.accountMode ||
            button.dataset.accountModeTrigger || "";
          collapseOtherAuthEditors();
          selectAccountMode(
            nextMode,
            {
              scrollIntoView: button.hasAttribute("data-account-mode-trigger"),
            },
          );
          setTimeout(() => {
            if (pendingAccountModePointerMode === nextMode) {
              pendingAccountModePointerMode = "";
            }
          }, 0);
        }
      });
    });

  cancelButton?.addEventListener("click", () => {
    resetAccountEditor();
  });
  form.addEventListener("account-editor-reset", () => {
    resetAccountEditor();
  });

  passkeyRetryButton.addEventListener("click", () => {
    void startAccountPasskeyReauth();
  });

  passwordFallbackButton.addEventListener("click", () => {
    showCurrentPasswordFallback();
  });

  currentPasswordInput.addEventListener("input", () => {
    if (currentPasswordInput.disabled || currentPasswordRow.hidden) {
      return;
    }

    reauthVerified = false;
    lockAccountTargets();
    clearStatus(currentPasswordStatus);
    scheduleCurrentPasswordVerification();
  });

  currentPasswordInput.addEventListener("blur", (event) => {
    // 浏览器密码管理器属于页面外界面，失焦时不会提供 relatedTarget。
    // 此时保持编辑器展开，等待密码管理器回填或用户返回页面。
    if (!(event.relatedTarget instanceof Element)) {
      return;
    }

    setTimeout(() => {
      if (
        mode &&
        currentPasswordInput.value.length === 0 &&
        !pendingAccountModePointerMode &&
        document.activeElement !== currentPasswordInput
      ) {
        resetAccountEditor();
      }
    }, 0);
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    const modeButton = target instanceof Element
      ? target.closest("[data-account-mode], [data-account-mode-trigger]")
      : null;
    const editorControl = target instanceof Element
      ? target.closest(
        "[data-account-password-fallback-button], [data-account-passkey-retry-button], [data-account-cancel-button], [data-account-save-button]",
      )
      : null;
    pendingAccountModePointerMode = modeButton instanceof HTMLElement
      ? modeButton.dataset.accountMode ||
        modeButton.dataset.accountModeTrigger || ""
      : "";

    if (
      !mode ||
      currentPasswordInput.value.length > 0 ||
      reauthVerified
    ) {
      return;
    }

    if (
      !(target instanceof Element) ||
      target === currentPasswordInput ||
      modeButton ||
      editorControl
    ) {
      return;
    }

    setTimeout(() => {
      if (mode && currentPasswordInput.value.length === 0) {
        resetAccountEditor();
      }
    }, 0);
  }, true);

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

  form.addEventListener("submit", (event) => {
    if (!mode) {
      event.preventDefault();
      return;
    }

    if (!reauthVerified) {
      event.preventDefault();
      if (!currentPasswordRow.hidden && passwordAvailable) {
        void verifyCurrentPassword(true);
      } else if (passkeyAvailable) {
        void startAccountPasskeyReauth();
      }
    }
  });

  /**
   * 选择账户编辑模式，并按来源决定是否定位到账户区。
   *
   * @param {string} nextMode 账户编辑模式。
   * @param {{ scrollIntoView?: boolean }} options 模式切换选项。
   */
  function selectAccountMode(nextMode, options = {}) {
    if (nextMode !== "username" && nextMode !== "password") {
      return;
    }

    const shouldScroll = options.scrollIntoView === true;
    if (mode === nextMode) {
      resetAccountEditor();
      return;
    }

    const keepReauthVerification = reauthVerified;
    mode = nextMode;
    actionInput.value = nextMode;
    usernameInput.value = usernameInput.dataset.accountUsernameOriginal ||
      usernameInput.value;
    cancelCurrentPasswordVerification();
    setCurrentPasswordInputEnabled(false);
    cancelAccountPasskeyReauth();
    lockAccountTargets();
    showAccountElement(actions, true, ++transitionToken);
    hideAccountElement(currentPasswordRow, false, ++transitionToken);
    hideAccountElement(passkeyReauthRow, false, ++transitionToken);
    setNewPasswordRowsVisible(false, false);
    scrollAccountEditorIntoView(shouldScroll);

    if (mode !== "password") {
      clearUnlockedPasswordFields();
    }

    if (keepReauthVerification) {
      clearAccountTargetStatuses();
      unlockSelectedTarget({ preventScroll: shouldScroll });
      return;
    }

    reauthVerified = false;
    clearUnlockedPasswordFields();
    clearAllAccountStatuses();
    if (passkeyAvailable && supportsPasskeyReauth()) {
      showAccountElement(passkeyReauthRow, false, ++transitionToken);
      passwordFallbackButton.hidden = !passwordAvailable;
      void startAccountPasskeyReauth();
      return;
    }

    if (passwordAvailable) {
      showCurrentPasswordFallback({
        message: passkeyAvailable
          ? form.dataset.accountPasskeyUnsupported || ""
          : "",
        preventScroll: shouldScroll,
      });
      return;
    }

    showAccountElement(passkeyReauthRow, false, ++transitionToken);
    setStatus(
      passkeyStatus,
      passkeyAvailable
        ? form.dataset.accountPasskeyUnsupported || ""
        : form.dataset.accountReauthUnavailable || "",
      "error",
    );
    passkeyRetryButton.hidden = true;
    passwordFallbackButton.hidden = true;
  }

  function resetAccountEditor() {
    mode = "";
    reauthVerified = form.dataset.accountRecentlyVerified === "true";
    actionInput.value = "";
    usernameInput.value = usernameInput.dataset.accountUsernameOriginal ||
      usernameInput.value;
    setCurrentPasswordInputEnabled(false);
    clearUnlockedPasswordFields();
    clearAllAccountStatuses();
    lockAccountTargets();
    cancelCurrentPasswordVerification();
    cancelAccountPasskeyReauth();
    hideAccountElement(actions, true, ++transitionToken);
    hideAccountElement(currentPasswordRow, true, ++transitionToken);
    hideAccountElement(passkeyReauthRow, true, ++transitionToken);
    newPasswordRows.forEach((row) =>
      hideAccountElement(row, true, ++transitionToken)
    );
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

  /**
   * 设置当前密码输入是否参与表单和密码管理器自动填充。
   *
   * @param {boolean} enabled 是否启用当前密码输入。
   */
  function setCurrentPasswordInputEnabled(enabled) {
    currentPasswordInput.disabled = !enabled;
    if (!enabled) {
      currentPasswordInput.value = "";
    }
  }

  /**
   * 解锁当前编辑目标，并把焦点移动到目标控件。
   *
   * @param {{ preventScroll?: boolean }} options 聚焦选项。
   */
  function unlockSelectedTarget(options = {}) {
    const preventScroll = options.preventScroll === true;
    if (mode === "username") {
      usernameInput.readOnly = false;
      focusAccountControl(usernameInput, preventScroll);
    }

    if (mode === "password") {
      setNewPasswordRowsVisible(true, false);
      unlockedFields.forEach((field) => {
        if (field instanceof HTMLInputElement) {
          field.disabled = false;
        }
      });
      const firstPasswordField = unlockedFields.find((field) =>
        field instanceof HTMLInputElement
      );
      focusAccountControl(firstPasswordField, preventScroll);
    }

    saveButton.disabled = false;
  }

  /**
   * 将账户编辑区域带入视口。
   *
   * @param {boolean} shouldScroll 是否定位到账户编辑区。
   */
  function scrollAccountEditorIntoView(shouldScroll) {
    if (!shouldScroll) {
      return;
    }

    form.scrollIntoView({
      behavior: "auto",
      block: "center",
    });
  }

  /**
   * 聚焦账户编辑控件，必要时避免浏览器再次滚动页面。
   *
   * @param {Element|undefined} control 目标控件。
   * @param {boolean} preventScroll 是否阻止聚焦触发滚动。
   */
  function focusAccountControl(control, preventScroll) {
    if (control instanceof HTMLElement) {
      control.focus({ preventScroll });
    }
  }

  /**
   * 设置新密码和确认密码行是否可见。
   *
   * @param {boolean} visible 是否显示新密码行。
   * @param {boolean} animate 是否播放过渡动画。
   */
  function setNewPasswordRowsVisible(visible, animate) {
    newPasswordRows.forEach((row) => {
      if (!(row instanceof HTMLElement)) {
        return;
      }

      const token = ++transitionToken;
      if (visible) {
        showAccountElement(row, animate, token);
      } else {
        hideAccountElement(row, animate, token);
      }
    });
  }

  /**
   * 清空账户设置中待解锁的密码字段。
   */
  function clearUnlockedPasswordFields() {
    unlockedFields.forEach((field) => {
      if (field instanceof HTMLInputElement) {
        field.value = "";
      }
    });
  }

  /**
   * 安排当前密码自动验证。
   */
  function scheduleCurrentPasswordVerification() {
    cancelCurrentPasswordVerification();
    if (!currentPasswordInput.value) {
      return;
    }

    currentPasswordVerifyTimer = setTimeout(() => {
      void verifyCurrentPassword();
    }, accountPasswordVerifyDelayMs);
  }

  /**
   * 取消等待中或进行中的当前密码验证。
   */
  function cancelCurrentPasswordVerification() {
    clearTimeout(currentPasswordVerifyTimer);
    currentPasswordVerifyController?.abort();
    currentPasswordVerifyController = undefined;
  }

  /**
   * 使等待中的账户 Passkey 验证结果失效。
   */
  function cancelAccountPasskeyReauth() {
    passkeyReauthToken += 1;
    passkeyRetryButton.disabled = false;
    passkeyRetryButton.hidden = true;
    passwordFallbackButton.hidden = true;
  }

  /**
   * 使用 Passkey 完成账户编辑前的强再认证。
   *
   * @return {Promise<boolean>} Passkey 验证通过时返回 true。
   */
  async function startAccountPasskeyReauth() {
    if (!mode || !passkeyAvailable || !supportsPasskeyReauth()) {
      if (passwordAvailable) {
        showCurrentPasswordFallback({
          message: form.dataset.accountPasskeyUnsupported || "",
        });
      }
      return false;
    }

    const token = ++passkeyReauthToken;
    lockAccountTargets();
    showAccountElement(passkeyReauthRow, false, ++transitionToken);
    setCurrentPasswordInputEnabled(false);
    hideAccountElement(currentPasswordRow, false, ++transitionToken);
    passkeyRetryButton.disabled = true;
    passkeyRetryButton.hidden = true;
    passwordFallbackButton.hidden = !passwordAvailable;
    setStatus(
      passkeyStatus,
      form.dataset.accountPasskeyPending || "",
      "pending",
    );
    clearStatus(actionStatus);

    try {
      await performPasskeyReauth(form);
      if (token !== passkeyReauthToken || !mode) {
        return false;
      }

      reauthVerified = true;
      form.dataset.accountRecentlyVerified = "true";
      setStatus(
        passkeyStatus,
        form.dataset.accountPasskeyVerified || "",
        "success",
      );
      hideAccountElement(passkeyReauthRow, false, ++transitionToken);
      passwordFallbackButton.hidden = true;
      unlockSelectedTarget({ preventScroll: true });
      return true;
    } catch {
      if (token !== passkeyReauthToken || !mode) {
        return false;
      }

      reauthVerified = false;
      if (passwordAvailable) {
        lockAccountTargets();
        showAccountElement(passkeyReauthRow, false, ++transitionToken);
        setCurrentPasswordInputEnabled(false);
        hideAccountElement(currentPasswordRow, false, ++transitionToken);
        setStatus(
          passkeyStatus,
          form.dataset.accountPasskeyFailed || "",
          "error",
        );
        passkeyRetryButton.hidden = false;
        passwordFallbackButton.hidden = false;
      } else {
        setStatus(
          passkeyStatus,
          form.dataset.accountPasskeyFailed || "",
          "error",
        );
        passkeyRetryButton.hidden = false;
        passwordFallbackButton.hidden = true;
      }
      return false;
    } finally {
      if (token === passkeyReauthToken) {
        passkeyRetryButton.disabled = false;
      }
    }
  }

  /**
   * 显示当前密码回退流程并聚焦密码框。
   *
   * @param {{ message?: string, preventScroll?: boolean }} options 回退显示选项。
   */
  function showCurrentPasswordFallback(options = {}) {
    cancelAccountPasskeyReauth();
    reauthVerified = false;
    hideAccountElement(passkeyReauthRow, false, ++transitionToken);
    setCurrentPasswordInputEnabled(true);
    showAccountElement(currentPasswordRow, false, ++transitionToken);
    if (options.message) {
      setStatus(actionStatus, options.message, "error");
    } else {
      clearStatus(actionStatus);
    }
    focusAccountControl(
      currentPasswordInput,
      options.preventScroll === true,
    );
  }

  /**
   * 验证当前密码并在通过后解锁当前编辑目标。
   *
   * @param {boolean} showRequired 为空时是否显示必填提示。
   * @return {Promise<boolean>} 当前密码验证通过时返回 true。
   */
  async function verifyCurrentPassword(showRequired = false) {
    if (!currentPasswordInput.value) {
      if (showRequired) {
        setStatus(
          currentPasswordStatus,
          form.dataset.accountPasswordRequired || "",
          "error",
        );
        currentPasswordInput.focus();
      }
      return false;
    }

    const submittedPassword = currentPasswordInput.value;
    const token = ++currentPasswordVerifyToken;
    currentPasswordVerifyController?.abort();
    currentPasswordVerifyController = new AbortController();
    try {
      const body = new URLSearchParams();
      body.set("currentPassword", submittedPassword);
      const response = await fetch("/account/verify-password", {
        body,
        headers: csrfRequestHeaders({
          "content-type": "application/x-www-form-urlencoded",
        }),
        method: "POST",
        signal: currentPasswordVerifyController.signal,
      });
      if (
        token !== currentPasswordVerifyToken ||
        currentPasswordInput.value !== submittedPassword
      ) {
        return false;
      }

      if (response.ok) {
        reauthVerified = true;
        form.dataset.accountRecentlyVerified = "true";
        setStatus(
          currentPasswordStatus,
          form.dataset.accountPasswordVerified || "",
          "success",
        );
        setCurrentPasswordInputEnabled(false);
        hideAccountElement(currentPasswordRow, false, ++transitionToken);
        unlockSelectedTarget({ preventScroll: true });
        return true;
      } else {
        reauthVerified = false;
        lockAccountTargets();
        setStatus(
          currentPasswordStatus,
          form.dataset.accountPasswordInvalid || "",
          "error",
        );
        return false;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return false;
      }

      reauthVerified = false;
      lockAccountTargets();
      setStatus(
        currentPasswordStatus,
        form.dataset.accountPasswordInvalid || "",
        "error",
      );
      return false;
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
    clearStatus(passkeyStatus);
    fieldStatuses.forEach((status) => clearStatus(status));
  }

  /**
   * 清空当前编辑目标的字段状态，并保留当前密码验证通过提示。
   */
  function clearAccountTargetStatuses() {
    clearStatus(actionStatus);
    clearStatus(passkeyStatus);
    clearStatus(usernameStatus);
    clearStatus(newPasswordStatus);
    clearStatus(confirmPasswordStatus);
  }
}

/**
 * 初始化认证方法面板展开收起。
 *
 * @param {ParentNode} [scope] 查找范围。
 */
function initAuthMethodPanels(scope = document) {
  const buttons = scope.querySelectorAll("[data-auth-method-toggle]");
  buttons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const panelId = button.dataset.authMethodToggle || "";
    const panel = authMethodPanelFor(button, panelId);
    if (!(panel instanceof HTMLElement)) {
      return;
    }

    button.addEventListener("click", () => {
      const shouldShow = panel.hidden || panel.classList.contains(
        "is-collapsed",
      );
      if (shouldShow) {
        collapseOtherAuthEditors(panel, button);
      }
      setAuthMethodPanelVisible(
        panel,
        button,
        shouldShow,
      );
    });
  });
}

/**
 * 查找按钮对应的认证方法面板。
 *
 * @param {HTMLButtonElement} button 展开按钮。
 * @param {string} panelId 面板 ID。
 * @return {HTMLElement|undefined} 对应面板。
 */
function authMethodPanelFor(button, panelId) {
  const scope = button.closest(".settings-group") || document;
  return Array.from(scope.querySelectorAll("[data-auth-method-panel]"))
    .find((panel) => panel.dataset.authMethodPanel === panelId);
}

/**
 * 收起设置页内其它认证编辑器和认证方法面板。
 *
 * @param {HTMLElement} [activePanel] 当前要展开的面板。
 * @param {HTMLButtonElement} [activeButton] 当前点击的展开按钮。
 */
function collapseOtherAuthEditors(activePanel, activeButton) {
  closeSiblingEmailBindingPanels();
  document.querySelector("[data-account-form]")?.dispatchEvent(
    new CustomEvent("account-editor-reset"),
  );
  removeTransientReauthSections(document, activePanel);
  document.querySelectorAll("[data-auth-method-panel]").forEach((panel) => {
    if (!(panel instanceof HTMLElement) || panel === activePanel) {
      return;
    }

    const button = Array.from(
      panel.closest(".auth-method-row")?.querySelectorAll(
        "[data-auth-method-toggle]",
      ) ?? [],
    ).find((candidate) =>
      candidate instanceof HTMLButtonElement &&
      candidate.dataset.authMethodToggle === panel.dataset.authMethodPanel
    );
    setAuthMethodPanelVisible(
      panel,
      button instanceof HTMLButtonElement && button !== activeButton
        ? button
        : undefined,
      false,
    );
  });
}

/**
 * 收起同一范围内的邮箱编辑器。
 *
 * @param {ParentNode} [scope] 查找范围。
 */
function closeSiblingEmailBindingPanels(scope = document) {
  scope.querySelectorAll("[data-email-binding-form]").forEach((form) => {
    form.dispatchEvent(new CustomEvent("email-binding-reset"));
  });
}

/**
 * 设置认证方法面板显示状态。
 *
 * @param {HTMLElement} panel 认证方法面板。
 * @param {HTMLButtonElement} [button] 展开按钮。
 * @param {boolean} visible 是否显示。
 */
function setAuthMethodPanelVisible(panel, button, visible) {
  const row = panel.closest(".auth-method-row");
  const transitionToken = String(++authMethodPanelTransitionId);
  panel.dataset.authMethodTransitionToken = transitionToken;
  button?.setAttribute("aria-expanded", visible ? "true" : "false");

  if (visible) {
    panel.hidden = false;
    row?.classList.add("is-open");
    panel.classList.add("is-collapsed");
    requestAnimationFrame(() => {
      if (panel.dataset.authMethodTransitionToken === transitionToken) {
        panel.classList.remove("is-collapsed");
      }
    });
    return;
  }

  removeTransientReauthSections(panel);
  clearCredentialBindingStatuses(panel);
  panel.classList.add("is-collapsed");
  row?.classList.remove("is-open");
  setTimeout(() => {
    if (
      panel.dataset.authMethodTransitionToken === transitionToken &&
      panel.classList.contains("is-collapsed")
    ) {
      panel.hidden = true;
    }
  }, notificationTransitionMs);
}

/**
 * 清除认证方法面板内只属于本次展开周期的操作结果。
 *
 * @param {ParentNode} panel 认证方法面板。
 */
function clearCredentialBindingStatuses(panel) {
  panel.querySelectorAll(
    "[data-totp-binding-status], [data-passkey-binding-status]",
  ).forEach((status) => clearInlineStatus(status));
}

/**
 * 删除已结束操作留下的临时再认证区域，并清理对应地址状态。
 *
 * @param {ParentNode} scope 查找范围。
 * @param {HTMLElement} [retainedPanel] 仍在使用再认证区域的活动面板。
 */
function removeTransientReauthSections(scope, retainedPanel) {
  let removed = false;
  scope.querySelectorAll(
    '[data-reauth-section][data-reauth-purpose="reauth"]',
  ).forEach((section) => {
    if (retainedPanel?.contains(section)) {
      return;
    }

    section.dispatchEvent(new CustomEvent("reauth-dispose"));
    section.remove();
    removed = true;
  });

  if (!removed) {
    return;
  }

  pendingSensitiveActionForm = undefined;
  const url = new URL(globalThis.location.href);
  for (
    const parameter of [
      "googleError",
      "passkeyError",
      "securityError",
      "totpError",
    ]
  ) {
    if (url.searchParams.get(parameter) === "reauth") {
      url.searchParams.delete(parameter);
    }
  }
  globalThis.history.replaceState(
    globalThis.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

/**
 * 初始化两步验证设置自动保存。
 */
function initSecuritySettingsAutoSave() {
  const form = document.querySelector("[data-security-settings-form]");
  const status = document.querySelector("[data-security-settings-status]");
  if (
    !(form instanceof HTMLFormElement) ||
    form.dataset.securityAutoSaveInitialized === "true"
  ) {
    return;
  }

  form.dataset.securityAutoSaveInitialized = "true";
  lastSavedSecuritySignature = formSignature(form);
  const controls = externalAutoSaveControls(form);
  const toggle = securitySettingsToggle(form);
  controls.forEach((control) => {
    control.addEventListener("change", () => {
      if (
        control === toggle &&
        !toggle.checked &&
        form.dataset.securityRecentlyVerified !== "true"
      ) {
        requireSecuritySettingsReauth(form);
        return;
      }

      scheduleSecurityAutoSave(form, status);
    });
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveSecuritySettingsNow(form, status);
  });

  const reauthHost = document.querySelector(
    "[data-security-settings-reauth]",
  );
  reauthHost?.addEventListener("reauth-success", (event) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.matches(
        '[data-reauth-section][data-reauth-purpose="reauth"]',
      )
    ) {
      void completeSecuritySettingsDisable(form, status, reauthHost);
    }
  });
  reauthHost?.addEventListener("reauth-cancel", (event) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.matches(
        '[data-reauth-section][data-reauth-purpose="reauth"]',
      )
    ) {
      event.preventDefault();
      pendingSensitiveActionForm = undefined;
      setAuthMethodPanelVisible(reauthHost, undefined, false);
    }
  });
}

/**
 * 获取两步验证设置表单关联的启用开关。
 *
 * @param {HTMLFormElement} form 安全设置表单。
 * @return {HTMLInputElement|undefined} 两步验证开关；未找到时返回 undefined。
 */
function securitySettingsToggle(form) {
  const toggle = Array.from(externalAutoSaveControls(form)).find((control) =>
    control instanceof HTMLInputElement && control.name === "twoFactorEnabled"
  );
  return toggle instanceof HTMLInputElement ? toggle : undefined;
}

/**
 * 保持两步验证为开启状态，并原地展示关闭前的身份验证方法。
 *
 * @param {HTMLFormElement} form 安全设置表单。
 */
function requireSecuritySettingsReauth(form) {
  const toggle = securitySettingsToggle(form);
  if (toggle) {
    toggle.checked = true;
  }
  pendingSensitiveActionForm = undefined;
  form.dataset.securityRecentlyVerified = "false";
  syncSecuritySettingsSummary(form);
  showSecuritySettingsReauth();
}

/**
 * 从惰性模板原地展开关闭两步验证所需的身份验证方法。
 */
function showSecuritySettingsReauth() {
  const host = document.querySelector("[data-security-settings-reauth]");
  const template = host?.querySelector("[data-security-reauth-template]");
  if (
    !(host instanceof HTMLElement) ||
    !(template instanceof HTMLTemplateElement)
  ) {
    return;
  }

  collapseOtherAuthEditors(host);
  let section = host.querySelector(
    '[data-reauth-section][data-reauth-purpose="reauth"]',
  );
  let created = false;
  if (!(section instanceof HTMLElement)) {
    host.insertBefore(template.content.cloneNode(true), template);
    section = host.querySelector(
      '[data-reauth-section][data-reauth-purpose="reauth"]',
    );
    created = true;
  }
  if (section instanceof HTMLElement) {
    if (created) {
      initReauthSection(section);
    }
    setAuthMethodPanelVisible(host, undefined, true);
  }
}

/**
 * 身份验证成功后自动关闭两步验证，并立即收起身份验证方法。
 *
 * @param {HTMLFormElement} form 安全设置表单。
 * @param {Element|null} status 状态元素。
 * @param {Element} reauthHost 身份验证方法面板。
 * @return {Promise<void>} 自动保存完成后的 Promise。
 */
async function completeSecuritySettingsDisable(form, status, reauthHost) {
  form.dataset.securityRecentlyVerified = "true";
  if (reauthHost instanceof HTMLElement) {
    setAuthMethodPanelVisible(reauthHost, undefined, false);
  }

  const toggle = securitySettingsToggle(form);
  if (!(toggle instanceof HTMLInputElement)) {
    return;
  }

  toggle.checked = false;
  syncSecuritySettingsSummary(form);
  const saved = await saveSecuritySettingsNow(form, status);
  if (!saved && form.dataset.securityRecentlyVerified === "true") {
    toggle.checked = true;
    syncSecuritySettingsSummary(form);
  }
}

/**
 * 安排一次两步验证设置自动保存。
 *
 * @param {HTMLFormElement} form 安全设置表单。
 * @param {Element|null} status 状态元素。
 */
function scheduleSecurityAutoSave(form, status) {
  clearTimeout(securityAutoSaveTimer);
  securityAutoSaveTimer = setTimeout(() => {
    void saveSecuritySettingsNow(form, status);
  }, 350);
}

/**
 * 立即保存两步验证设置。
 *
 * @param {HTMLFormElement} form 安全设置表单。
 * @param {Element|null} status 状态元素。
 * @return {Promise<boolean>} 保存成功或无需保存时返回 true，保存失败时返回 false。
 */
async function saveSecuritySettingsNow(form, status) {
  clearTimeout(securityAutoSaveTimer);
  const signature = formSignature(form);
  if (signature === lastSavedSecuritySignature) {
    return true;
  }

  securityAutoSaveController?.abort();
  securityAutoSaveController = new AbortController();
  setSecuritySettingsStatus(form, status, "saving");

  try {
    const response = await fetch(form.action, {
      body: formDataFromForm(form),
      headers: csrfRequestHeaders({ "x-autosave": "1" }),
      method: form.method || "post",
      signal: securityAutoSaveController.signal,
    });

    if (!response.ok) {
      const errorCode = await setSecuritySettingsError(
        form,
        status,
        response,
      );
      if (errorCode === "reauth") {
        requireSecuritySettingsReauth(form);
      }
      return false;
    }

    lastSavedSecuritySignature = formSignature(form);
    syncSecuritySettingsSummary(form);
    setSecuritySettingsStatus(form, status, "saved");
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return false;
    }

    setSecuritySettingsStatus(form, status, "error");
    return false;
  }
}

/**
 * 显示两步验证设置保存错误。
 *
 * @param {HTMLFormElement} form 安全设置表单。
 * @param {Element|null} status 状态元素。
 * @param {Response} response 保存响应。
 * @return {Promise<string>} 服务端返回的错误码。
 */
async function setSecuritySettingsError(form, status, response) {
  const payload = await response.json().catch(() => ({}));
  const code = typeof payload.error === "string" ? payload.error : "error";
  const message = form.dataset[`security${capitalize(code)}`] ||
    form.dataset.securityError ||
    "";
  setInlineStatus(status, message, "error");
  setSecurityStatusRowVisible(status, message.length > 0);
  return code;
}

/**
 * 设置两步验证保存状态。
 *
 * @param {HTMLFormElement} form 安全设置表单。
 * @param {Element|null} status 状态元素。
 * @param {"saving"|"saved"|"error"} state 保存状态。
 */
function setSecuritySettingsStatus(form, status, state) {
  const message = form.dataset[`security${capitalize(state)}`] || "";
  setInlineStatus(status, message, state === "error" ? "error" : "success");
  setSecurityStatusRowVisible(status, message.length > 0);
}

/**
 * 设置两步验证状态栏容器显隐。
 *
 * @param {Element|null} status 状态元素。
 * @param {boolean} visible 是否显示状态栏容器。
 */
function setSecurityStatusRowVisible(status, visible) {
  const row = status?.closest("[data-security-settings-status-row]");
  if (row instanceof HTMLElement) {
    row.hidden = !visible;
  }
}

/**
 * 同步两步验证设置摘要文案。
 *
 * @param {HTMLFormElement} form 安全设置表单。
 */
function syncSecuritySettingsSummary(form) {
  const summary = document.querySelector("[data-security-two-factor-summary]");
  if (!(summary instanceof HTMLElement)) {
    return;
  }

  const toggle = securitySettingsToggle(form);
  if (!(toggle instanceof HTMLInputElement)) {
    return;
  }

  summary.textContent = toggle.checked
    ? form.dataset.securityEnabled ?? ""
    : form.dataset.securityDisabled ?? "";
}

/**
 * 将单词首字母大写。
 *
 * @param {string} value 原始单词。
 * @return {string} 首字母大写后的单词。
 */
function capitalize(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "";
}

/**
 * 初始化邮箱绑定验证码发送流程。
 */
function initEmailBinding() {
  const form = document.querySelector("[data-email-binding-form]");
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const scope = form.closest(".settings-group") || document;
  const emailInput = scope.querySelector("[data-email-binding-input]");
  const codeInput = scope.querySelector("[data-email-code-input]");
  const codeRow = scope.querySelector("[data-email-code-row]");
  const editButton = scope.querySelector("[data-email-binding-edit-button]");
  const verificationIdInput = form.querySelector(
    "[data-email-verification-id]",
  );
  const sendButton = scope.querySelector("[data-email-send-code-button]");
  const sendStatus = scope.querySelector("[data-email-send-status]");
  const verifyStatus = scope.querySelector("[data-email-verify-status]");
  let emailBindingVerifyTimer;
  let emailBindingVerifyController;
  let emailBindingVerifyToken = 0;
  let emailBindingTransitionToken = 0;

  if (
    !(emailInput instanceof HTMLInputElement) ||
    !(codeInput instanceof HTMLInputElement) ||
    !(codeRow instanceof HTMLElement) ||
    !(editButton instanceof HTMLButtonElement) ||
    !(verificationIdInput instanceof HTMLInputElement) ||
    !(sendButton instanceof HTMLButtonElement)
  ) {
    return;
  }

  editButton.addEventListener("click", () => {
    if (!emailInput.readOnly) {
      resetEmailBindingEditor();
      return;
    }

    openEmailBindingEditor();
  });

  form.addEventListener("email-binding-reset", () => {
    resetEmailBindingEditor();
  });

  sendButton.addEventListener("click", async (event) => {
    event.preventDefault();
    await sendEmailBindingCode();
  });

  emailInput.addEventListener("input", () => {
    verificationIdInput.value = "";
    codeInput.value = "";
    cancelEmailBindingVerification();
    clearInlineStatus(sendStatus);
    clearInlineStatus(verifyStatus);
  });

  codeInput.addEventListener("input", () => {
    clearInlineStatus(verifyStatus);
    scheduleEmailBindingVerification();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void verifyEmailBindingCode(true);
  });

  /**
   * 打开邮箱编辑器并显示验证码输入行。
   */
  function openEmailBindingEditor() {
    collapseOtherAuthEditors();
    emailInput.readOnly = false;
    showEmailBindingElement(codeRow, true, ++emailBindingTransitionToken);
    emailInput.closest(".auth-method-row")?.classList.add("is-open");
    emailInput.focus();
    emailInput.select();
  }

  /**
   * 关闭邮箱编辑器并恢复原始邮箱值。
   */
  function resetEmailBindingEditor() {
    emailInput.readOnly = true;
    emailInput.value = emailInput.dataset.emailBindingOriginal ||
      emailInput.value;
    codeInput.value = "";
    verificationIdInput.value = "";
    cancelEmailBindingVerification();
    clearInlineStatus(sendStatus);
    clearInlineStatus(verifyStatus);
    hideEmailBindingElement(codeRow, true, ++emailBindingTransitionToken);
    emailInput.closest(".auth-method-row")?.classList.remove("is-open");
  }

  /**
   * 向后端请求发送邮箱绑定验证码。
   */
  async function sendEmailBindingCode() {
    if (!emailInput.checkValidity()) {
      setInlineStatus(sendStatus, form.dataset.emailInvalid || "", "error");
      emailInput.reportValidity();
      return;
    }

    sendButton.disabled = true;
    setInlineStatus(sendStatus, form.dataset.emailSending || "", "pending");
    clearInlineStatus(verifyStatus);

    try {
      const response = await fetch(
        form.dataset.emailSendUrl || "/auth/email-verifications",
        {
          body: emailVerificationRequestBody(form),
          headers: csrfRequestHeaders({
            "content-type": "application/x-www-form-urlencoded",
          }),
          method: "POST",
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || typeof payload.id !== "string") {
        verificationIdInput.value = "";
        setInlineStatus(
          sendStatus,
          form.dataset.emailSendFailed || "",
          "error",
        );
        return;
      }

      verificationIdInput.value = payload.id;
      codeInput.value = "";
      showEmailBindingElement(codeRow, true, ++emailBindingTransitionToken);
      setInlineStatus(sendStatus, form.dataset.emailSent || "", "success");
      codeInput.focus();
    } catch {
      verificationIdInput.value = "";
      setInlineStatus(sendStatus, form.dataset.emailSendFailed || "", "error");
    } finally {
      sendButton.disabled = false;
      resetTurnstileWidget();
    }
  }

  /**
   * 安排一次邮箱验证码自动校验。
   */
  function scheduleEmailBindingVerification() {
    cancelEmailBindingVerification();
    if (!codeInput.value.trim()) {
      return;
    }

    emailBindingVerifyTimer = setTimeout(() => {
      void verifyEmailBindingCode();
    }, emailBindingVerifyDelayMs);
  }

  /**
   * 取消等待中或进行中的邮箱验证码校验。
   */
  function cancelEmailBindingVerification() {
    clearTimeout(emailBindingVerifyTimer);
    emailBindingVerifyController?.abort();
    emailBindingVerifyController = undefined;
  }

  /**
   * 校验邮箱验证码，成功后直接完成绑定。
   *
   * @param {boolean} showRequired 是否显示必填提示。
   * @return {Promise<boolean>} 验证码校验通过时返回 true。
   */
  async function verifyEmailBindingCode(showRequired = false) {
    if (!emailInput.checkValidity()) {
      setInlineStatus(sendStatus, form.dataset.emailInvalid || "", "error");
      if (showRequired) {
        emailInput.reportValidity();
      }
      return false;
    }

    if (!verificationIdInput.value.trim()) {
      if (showRequired || codeInput.value.trim()) {
        setInlineStatus(
          verifyStatus,
          form.dataset.emailCodeRequired || "",
          "error",
        );
      }
      return false;
    }

    if (!codeInput.checkValidity()) {
      if (showRequired || codeInput.value.trim()) {
        setInlineStatus(
          verifyStatus,
          form.dataset.emailCodeInvalid || "",
          "error",
        );
      }
      return false;
    }

    const submittedEmail = emailInput.value;
    const submittedCode = codeInput.value;
    const submittedVerificationId = verificationIdInput.value;
    const token = ++emailBindingVerifyToken;
    emailBindingVerifyController?.abort();
    emailBindingVerifyController = new AbortController();

    try {
      const response = await fetch(form.action, {
        body: formDataFromForm(form),
        headers: csrfRequestHeaders({ "x-email-binding-verify": "1" }),
        method: form.method || "post",
        signal: emailBindingVerifyController.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (
        token !== emailBindingVerifyToken ||
        emailInput.value !== submittedEmail ||
        codeInput.value !== submittedCode ||
        verificationIdInput.value !== submittedVerificationId
      ) {
        return false;
      }

      if (!response.ok) {
        setInlineStatus(
          verifyStatus,
          emailBindingErrorMessage(form, payload.error),
          "error",
        );
        return false;
      }

      setInlineStatus(
        verifyStatus,
        form.dataset.emailUpdated || "",
        "success",
      );
      const redirectTo = typeof payload.redirectTo === "string"
        ? payload.redirectTo
        : "/settings?email=updated";
      globalThis.location.assign(redirectTo);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return false;
      }

      setInlineStatus(
        verifyStatus,
        form.dataset.emailCodeInvalid || "",
        "error",
      );
      return false;
    }
  }

  /**
   * 显示邮箱验证码区域。
   *
   * @param {HTMLElement} element 要显示的区域。
   * @param {boolean} animate 是否播放过渡动画。
   * @param {number} token 本次动画令牌。
   */
  function showEmailBindingElement(element, animate, token) {
    element.hidden = false;
    element.dataset.emailBindingTransitionToken = String(token);

    if (!animate) {
      element.classList.remove("is-collapsed");
      return;
    }

    element.classList.add("is-collapsed");
    element.getBoundingClientRect();
    element.classList.remove("is-collapsed");
  }

  /**
   * 隐藏邮箱验证码区域。
   *
   * @param {HTMLElement} element 要隐藏的区域。
   * @param {boolean} animate 是否播放过渡动画。
   * @param {number} token 本次动画令牌。
   */
  function hideEmailBindingElement(element, animate, token) {
    element.dataset.emailBindingTransitionToken = String(token);
    element.classList.add("is-collapsed");

    if (!animate) {
      element.hidden = true;
      return;
    }

    setTimeout(() => {
      if (
        element.dataset.emailBindingTransitionToken === String(token) &&
        element.classList.contains("is-collapsed")
      ) {
        element.hidden = true;
      }
    }, notificationTransitionMs);
  }
}

/**
 * 初始化 Passkey 绑定流程。
 *
 * @param {ParentNode} [scope] 查找范围。
 */
function initPasskeyBinding(scope = document) {
  const section = scope.querySelector("[data-passkey-binding-section]");
  if (!(section instanceof HTMLElement)) {
    return;
  }

  const bindButton = section.querySelector("[data-passkey-bind-button]");
  const labelInput = section.querySelector("[data-passkey-label-input]");
  const status = section.querySelector("[data-passkey-binding-status]");

  if (!(bindButton instanceof HTMLButtonElement)) {
    return;
  }

  if (
    !("PublicKeyCredential" in globalThis) ||
    !navigator.credentials ||
    typeof navigator.credentials.create !== "function"
  ) {
    bindButton.disabled = true;
    setInlineStatus(
      status,
      section.dataset.passkeyUnsupported || "",
      "error",
    );
    return;
  }

  bindButton.addEventListener("click", async (event) => {
    event.preventDefault();
    await bindPasskey();
  });

  /**
   * 请求浏览器创建 Passkey 并提交服务端校验。
   *
   * @return {Promise<void>} 绑定流程完成后的 Promise。
   */
  async function bindPasskey() {
    bindButton.disabled = true;
    setInlineStatus(
      status,
      section.dataset.passkeyBinding || "",
      "pending",
    );

    try {
      const optionsPayload = await fetchPasskeyRegistrationOptions(section);
      const credential = await navigator.credentials.create({
        publicKey: creationOptionsFromJson(optionsPayload.optionsJSON),
      });
      if (!(credential instanceof globalThis.PublicKeyCredential)) {
        throw new Error("Browser did not return a Passkey credential.");
      }

      const verified = await verifyPasskeyRegistration(section, {
        challengeId: optionsPayload.challengeId,
        credential: registrationCredentialToJson(credential),
        label: labelInput instanceof HTMLInputElement ? labelInput.value : "",
      });
      setInlineStatus(status, section.dataset.passkeyBound || "", "success");
      if (typeof verified.redirectTo === "string") {
        await refreshPasskeySettings(verified.redirectTo).catch(() => false);
      }
    } catch {
      setInlineStatus(status, section.dataset.passkeyFailed || "", "error");
    } finally {
      bindButton.disabled = false;
    }
  }
}

/**
 * 初始化 Google 绑定按钮。
 */
function initGoogleBinding() {
  const roots = document.querySelectorAll("[data-google-binding]");
  roots.forEach((root) => {
    if (root instanceof HTMLElement) {
      initGoogleBindingRoot(root, 0);
    }
  });
}

/**
 * 初始化单个 Google 绑定区域。
 *
 * @param {HTMLElement} root Google 绑定区域。
 * @param {number} attempt 当前等待 Google 脚本加载的次数。
 */
function initGoogleBindingRoot(root, attempt) {
  const button = root.querySelector("[data-google-bind-button]");
  const form = root.querySelector("[data-google-bind-form]");
  const credentialInput = root.querySelector("[data-google-bind-credential]");
  const status = root.querySelector("[data-google-binding-status]");
  const clientId = root.dataset.googleClientId || "";
  const googleIdentity = globalThis.google?.accounts?.id;

  if (
    !(button instanceof HTMLElement) ||
    !(form instanceof HTMLFormElement) ||
    !(credentialInput instanceof HTMLInputElement) ||
    !clientId
  ) {
    return;
  }

  if (!googleIdentity) {
    if (attempt < 40) {
      setTimeout(() => initGoogleBindingRoot(root, attempt + 1), 100);
    } else {
      setInlineStatus(status, root.dataset.googleFailed || "", "error");
    }
    return;
  }

  googleIdentity.initialize({
    callback: (response) => {
      const credential = response?.credential;
      if (typeof credential !== "string" || !credential.trim()) {
        setInlineStatus(status, root.dataset.googleFailed || "", "error");
        return;
      }

      credentialInput.value = credential;
      setInlineStatus(status, root.dataset.googleBinding || "", "pending");
      form.submit();
    },
    client_id: clientId,
  });
  googleIdentity.renderButton(button, {
    shape: "rectangular",
    size: "large",
    text: "continue_with",
    theme: "outline",
    type: "standard",
  });
}

/**
 * 初始化无需刷新页面的敏感凭证删除流程。
 *
 * @param {ParentNode} [scope] 查找范围。
 */
function initSensitiveActionForms(scope = document) {
  scope.querySelectorAll("[data-sensitive-action-form]").forEach((form) => {
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitSensitiveAction(form);
    });
  });
}

/**
 * 原地提交敏感操作，并在需要时展开再认证区域。
 *
 * @param {HTMLFormElement} form 待提交的敏感操作表单。
 * @return {Promise<boolean>} 操作完成时返回 true。
 */
async function submitSensitiveAction(form) {
  if (form.dataset.sensitiveActionPending === "true") {
    return false;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  form.dataset.sensitiveActionPending = "true";
  if (submitButton instanceof HTMLButtonElement) {
    submitButton.disabled = true;
  }

  try {
    const response = await fetch(form.action, {
      body: formDataFromForm(form),
      headers: csrfRequestHeaders({ "x-sensitive-action": "1" }),
      method: form.method || "post",
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 409 && payload.error === "reauth") {
      pendingSensitiveActionForm = form;
      showSensitiveActionReauth(form);
      return false;
    }
    if (!response.ok || payload.ok !== true) {
      return false;
    }

    completeCredentialDeletion(form, payload);
    return true;
  } catch {
    return false;
  } finally {
    delete form.dataset.sensitiveActionPending;
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = false;
    }
  }
}

/**
 * 在敏感操作所属面板内展开再认证区域。
 *
 * @param {HTMLFormElement} form 触发敏感操作的表单。
 */
function showSensitiveActionReauth(form) {
  const panel = form.closest("[data-auth-method-panel]");
  const template = panel?.querySelector("[data-sensitive-reauth-template]");
  if (
    !(panel instanceof HTMLElement) ||
    !(template instanceof HTMLTemplateElement) ||
    panel.querySelector(
      '[data-reauth-section][data-reauth-purpose="reauth"]',
    )
  ) {
    return;
  }

  panel.append(template.content.cloneNode(true));
  const section = panel.querySelector(
    '[data-reauth-section][data-reauth-purpose="reauth"]',
  );
  if (section instanceof HTMLElement) {
    section.classList.add("is-collapsed");
    initReauthSection(section);
    requestAnimationFrame(() => section.classList.remove("is-collapsed"));
  }
}

/**
 * 将已删除的凭证从页面移除并同步摘要和状态。
 *
 * @param {HTMLFormElement} form 已完成的删除表单。
 * @param {{remainingCount?: number}} payload 服务端删除结果。
 */
function completeCredentialDeletion(form, payload) {
  const section = form.closest(
    "[data-totp-binding-section], [data-passkey-binding-section]",
  );
  if (!(section instanceof HTMLElement)) {
    return;
  }

  const remainingCount = Number(payload.remainingCount);
  form.closest("li")?.remove();
  const list = section.querySelector(".passkey-credential-list");
  if (remainingCount === 0 && list instanceof HTMLElement) {
    const empty = document.createElement("span");
    empty.className = "field-hint";
    empty.textContent = section.dataset.credentialEmpty || "";
    list.replaceWith(empty);
  }

  const row = section.closest(".auth-method-row");
  const summary = row?.querySelector(".auth-method-summary");
  if (summary instanceof HTMLElement) {
    summary.textContent = remainingCount > 0
      ? (section.dataset.credentialCountTemplate || "").replace(
        "{count}",
        String(remainingCount),
      )
      : section.dataset.credentialEmpty || "";
  }

  const status = section.querySelector(
    "[data-totp-binding-status], [data-passkey-binding-status]",
  );
  setInlineStatus(status, section.dataset.credentialDeleted || "", "success");
  pendingSensitiveActionForm = undefined;
  const panel = section.closest("[data-auth-method-panel]");
  if (panel instanceof HTMLElement) {
    removeTransientReauthSections(panel);
  }
}

/**
 * 初始化敏感操作再认证交互。
 *
 * @param {ParentNode} [scope] 查找范围。
 */
function initReauth(scope = document) {
  scope.querySelectorAll("[data-reauth-section]").forEach((section) => {
    if (section instanceof HTMLElement) {
      initReauthSection(section);
    }
  });
}

/**
 * 初始化单个敏感操作再认证面板。
 *
 * @param {HTMLElement} section 再认证区域。
 */
function initReauthSection(section) {
  if (
    !(section instanceof HTMLElement) ||
    section.dataset.reauthInitialized === "true"
  ) {
    return;
  }
  section.dataset.reauthInitialized = "true";

  const globalStatus = section.querySelector("[data-reauth-status]");
  const passwordForm = section.querySelector("[data-reauth-password-form]");
  const totpForm = section.querySelector("[data-reauth-totp-form]");
  const recoveryCodeForm = section.querySelector(
    "[data-reauth-recovery-code-form]",
  );
  const emailForm = section.querySelector("[data-reauth-email-form]");
  const passkeyButton = section.querySelector("[data-reauth-passkey-button]");
  const cancelButton = section.querySelector("[data-reauth-cancel-button]");

  initReauthMethodSelector(section);

  if (passwordForm instanceof HTMLFormElement) {
    bindReauthForm(
      passwordForm,
      section.dataset.reauthPasswordUrl || "/account/reauth/password",
      passwordForm.querySelector("[data-reauth-password-status]"),
    );
  }

  if (totpForm instanceof HTMLFormElement) {
    bindReauthForm(
      totpForm,
      section.dataset.reauthTotpUrl || "/account/reauth/totp",
      totpForm.querySelector("[data-reauth-totp-status]"),
    );
  }

  if (recoveryCodeForm instanceof HTMLFormElement) {
    bindReauthForm(
      recoveryCodeForm,
      section.dataset.reauthRecoveryCodeUrl ||
        "/account/reauth/recovery-code",
      recoveryCodeForm.querySelector("[data-reauth-recovery-code-status]"),
    );
  }

  if (emailForm instanceof HTMLFormElement) {
    initEmailReauthForm(section, emailForm, globalStatus);
  }

  if (passkeyButton instanceof HTMLButtonElement) {
    initPasskeyReauth(section, passkeyButton, globalStatus);
  }

  if (cancelButton instanceof HTMLButtonElement) {
    cancelButton.addEventListener("click", () => cancelReauth(section));
  }

  /**
   * 绑定普通表单式再认证方式。
   *
   * @param {HTMLFormElement} form 再认证表单。
   * @param {string} url 再认证接口地址。
   * @param {Element|null} status 方法状态元素。
   */
  function bindReauthForm(form, url, status) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await submitReauthForm(section, form, url, status, globalStatus);
    });
  }
}

/**
 * 初始化再认证方式按钮与对应输入区域的展开收起。
 *
 * @param {HTMLElement} section 再认证区域。
 */
function initReauthMethodSelector(section) {
  const buttons = Array.from(
    section.querySelectorAll("[data-reauth-method-button]"),
  ).filter((button) => button instanceof HTMLButtonElement);
  const panels = Array.from(
    section.querySelectorAll("[data-reauth-method-panel]"),
  ).filter((panel) => panel instanceof HTMLElement);

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const selectedMethod = button.dataset.reauthMethodButton || "";
      buttons.forEach((candidate) => {
        candidate.setAttribute(
          "aria-pressed",
          candidate === button ? "true" : "false",
        );
      });
      panels.forEach((panel) => {
        setReauthMethodPanelVisible(
          panel,
          panel.dataset.reauthMethodPanel === selectedMethod,
        );
      });

      const selectedPanel = panels.find((panel) =>
        panel.dataset.reauthMethodPanel === selectedMethod
      );
      const input = selectedPanel?.querySelector(
        'input:not([type="hidden"])',
      );
      if (input instanceof HTMLInputElement) {
        input.focus();
      }
    });
  });
}

/**
 * 设置单个再认证输入区域的显示状态。
 *
 * @param {HTMLElement} panel 再认证输入区域。
 * @param {boolean} visible 是否显示。
 */
function setReauthMethodPanelVisible(panel, visible) {
  const transitionToken = String(++authMethodPanelTransitionId);
  panel.dataset.reauthMethodTransitionToken = transitionToken;
  if (visible) {
    panel.hidden = false;
    panel.classList.add("is-collapsed");
    requestAnimationFrame(() => {
      if (panel.dataset.reauthMethodTransitionToken === transitionToken) {
        panel.classList.remove("is-collapsed");
      }
    });
    return;
  }

  panel.classList.add("is-collapsed");
  setTimeout(() => {
    if (
      panel.dataset.reauthMethodTransitionToken === transitionToken &&
      panel.classList.contains("is-collapsed")
    ) {
      panel.hidden = true;
    }
  }, notificationTransitionMs);
}

/**
 * 取消当前再认证，并通知所属设置入口收起面板。
 *
 * @param {HTMLElement} section 再认证区域。
 */
function cancelReauth(section) {
  invalidateReauthAttempt(section);
  section.dispatchEvent(new CustomEvent("reauth-dispose"));
  resetReauthSection(section);
  pendingSensitiveActionForm = undefined;
  const cancelEvent = new CustomEvent("reauth-cancel", {
    bubbles: true,
    cancelable: true,
  });
  section.dispatchEvent(cancelEvent);
  if (cancelEvent.defaultPrevented) {
    return;
  }

  section.classList.add("is-collapsed");
  setTimeout(() => {
    if (section.classList.contains("is-collapsed")) {
      section.remove();
    }
  }, notificationTransitionMs);
}

/**
 * 清空再认证方式选择、输入内容和方法状态。
 *
 * @param {HTMLElement} section 再认证区域。
 */
function resetReauthSection(section) {
  section.querySelectorAll("form").forEach((form) => form.reset());
  section.querySelectorAll("[data-reauth-method-button]").forEach((button) => {
    button.setAttribute("aria-pressed", "false");
  });
  section.querySelectorAll("[data-reauth-method-panel]").forEach((panel) => {
    if (panel instanceof HTMLElement) {
      setReauthMethodPanelVisible(panel, false);
    }
  });
  section.querySelectorAll(
    "[data-reauth-password-status], [data-reauth-totp-status], " +
      "[data-reauth-recovery-code-status], [data-reauth-email-status]",
  ).forEach((status) => clearInlineStatus(status));

  const delivery = section.querySelector("[data-reauth-email-delivery]");
  if (delivery instanceof HTMLElement) {
    delivery.hidden = true;
  }
  const countdown = section.querySelector("[data-reauth-email-countdown]");
  if (countdown instanceof HTMLElement) {
    countdown.textContent = String(reauthEmailResendDelaySeconds);
  }
  const resendButton = section.querySelector(
    "[data-reauth-email-resend-button]",
  );
  if (resendButton instanceof HTMLButtonElement) {
    resendButton.disabled = true;
  }
  const emailMethodButton = section.querySelector(
    '[data-reauth-method-button="email"]',
  );
  if (emailMethodButton instanceof HTMLButtonElement) {
    emailMethodButton.disabled = false;
  }
  setInlineStatus(
    section.querySelector("[data-reauth-status]"),
    section.dataset.reauthInitialStatus || "",
    "success",
  );
}

/**
 * 为新一次再认证请求生成序号，使旧请求结果失效。
 *
 * @param {HTMLElement} section 再认证区域。
 * @return {string} 新请求序号。
 */
function nextReauthAttempt(section) {
  const attempt = Number(section.dataset.reauthAttempt || "0") + 1;
  section.dataset.reauthAttempt = String(attempt);
  return section.dataset.reauthAttempt;
}

/**
 * 使当前尚未结束的再认证请求失效。
 *
 * @param {HTMLElement} section 再认证区域。
 */
function invalidateReauthAttempt(section) {
  nextReauthAttempt(section);
}

/**
 * 初始化邮箱验证码再认证方式。
 *
 * @param {HTMLElement} section 再认证区域。
 * @param {HTMLFormElement} form 邮箱再认证表单。
 * @param {Element|null} globalStatus 全局状态元素。
 */
function initEmailReauthForm(section, form, globalStatus) {
  const emailInput = form.querySelector("[data-reauth-email-input]");
  const verificationIdInput = form.querySelector(
    "[data-reauth-email-verification-id]",
  );
  const codeInput = form.querySelector("[data-reauth-email-code-input]");
  const methodButton = section.querySelector(
    '[data-reauth-method-button="email"]',
  );
  const delivery = form.querySelector("[data-reauth-email-delivery]");
  const countdown = form.querySelector("[data-reauth-email-countdown]");
  const resendButton = form.querySelector(
    "[data-reauth-email-resend-button]",
  );
  const status = form.querySelector("[data-reauth-email-status]");

  if (
    !(emailInput instanceof HTMLInputElement) ||
    !(verificationIdInput instanceof HTMLInputElement) ||
    !(codeInput instanceof HTMLInputElement) ||
    !(methodButton instanceof HTMLButtonElement) ||
    !(delivery instanceof HTMLElement) ||
    !(countdown instanceof HTMLElement) ||
    !(resendButton instanceof HTMLButtonElement)
  ) {
    return;
  }

  let resendTimer;
  let requestId = 0;
  let sending = false;

  methodButton.addEventListener("click", async (event) => {
    event.preventDefault();
    if (!verificationIdInput.value.trim()) {
      await sendReauthEmailCode();
    }
  });

  resendButton.addEventListener("click", async (event) => {
    event.preventDefault();
    if (!resendButton.disabled) {
      await sendReauthEmailCode();
    }
  });

  codeInput.addEventListener("input", () => {
    clearInlineStatus(status);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!verificationIdInput.value.trim()) {
      setInlineStatus(
        status,
        section.dataset.reauthEmailCodeRequired || "",
        "error",
      );
      codeInput.focus();
      return;
    }

    await submitReauthForm(
      section,
      form,
      section.dataset.reauthEmailVerifyUrl || "/account/reauth/email",
      status,
      globalStatus,
    );
  });

  section.addEventListener("reauth-dispose", () => {
    requestId += 1;
    sending = false;
    clearInterval(resendTimer);
  });

  /**
   * 发送邮箱再认证验证码。
   *
   * @return {Promise<void>} 发送完成后的 Promise。
   */
  async function sendReauthEmailCode() {
    if (sending) {
      return;
    }

    sending = true;
    const currentRequestId = ++requestId;
    methodButton.disabled = true;
    resendButton.disabled = true;
    clearInterval(resendTimer);
    setInlineStatus(
      status,
      section.dataset.reauthEmailSending || "",
      "pending",
    );

    try {
      const body = reauthFormBody(form, section);
      body.set("purpose", "reauth");
      const response = await fetch(
        section.dataset.reauthEmailSendUrl || "/auth/email-verifications",
        {
          body,
          headers: csrfRequestHeaders({
            "content-type": "application/x-www-form-urlencoded",
          }),
          method: "POST",
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (currentRequestId !== requestId) {
        return;
      }
      if (!response.ok || typeof payload.id !== "string") {
        verificationIdInput.value = "";
        delivery.hidden = true;
        setInlineStatus(
          status,
          section.dataset.reauthEmailSendFailed || "",
          "error",
        );
        return;
      }

      verificationIdInput.value = payload.id;
      codeInput.value = "";
      clearInlineStatus(status);
      delivery.hidden = false;
      startEmailResendCountdown();
      codeInput.focus();
    } catch {
      if (currentRequestId !== requestId) {
        return;
      }
      verificationIdInput.value = "";
      delivery.hidden = true;
      setInlineStatus(
        status,
        section.dataset.reauthEmailSendFailed || "",
        "error",
      );
    } finally {
      if (currentRequestId === requestId) {
        sending = false;
        methodButton.disabled = false;
      }
    }
  }

  /**
   * 启动邮箱验证码重新发送倒计时。
   */
  function startEmailResendCountdown() {
    let remainingSeconds = reauthEmailResendDelaySeconds;
    countdown.textContent = String(remainingSeconds);
    resendButton.disabled = true;
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      remainingSeconds -= 1;
      countdown.textContent = String(Math.max(remainingSeconds, 0));
      if (remainingSeconds <= 0) {
        clearInterval(resendTimer);
        resendButton.disabled = false;
      }
    }, 1000);
  }
}

/**
 * 初始化 Passkey 再认证方式。
 *
 * @param {HTMLElement} section 再认证区域。
 * @param {HTMLButtonElement} button Passkey 再认证按钮。
 * @param {Element|null} globalStatus 全局状态元素。
 */
function initPasskeyReauth(section, button, globalStatus) {
  const status = section.querySelector("[data-reauth-passkey-status]") ||
    globalStatus;
  if (!supportsPasskeyReauth()) {
    button.disabled = true;
    setInlineStatus(
      status,
      section.dataset.reauthFailed || "",
      "error",
    );
    return;
  }

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    const attempt = nextReauthAttempt(section);
    button.disabled = true;
    setInlineStatus(
      status,
      section.dataset.reauthPasskeyPending || "",
      "pending",
    );

    try {
      await performPasskeyReauth(section);
      if (section.dataset.reauthAttempt !== attempt) {
        return;
      }
      setReauthSuccess(section, status, globalStatus);
    } catch {
      if (section.dataset.reauthAttempt === attempt) {
        setReauthFailure(section, status);
      }
    } finally {
      button.disabled = false;
    }
  });
}

/**
 * 判断当前浏览器是否支持 Passkey 再认证。
 *
 * @return {boolean} 浏览器具备 WebAuthn 凭据获取能力时返回 true。
 */
function supportsPasskeyReauth() {
  return "PublicKeyCredential" in globalThis &&
    Boolean(navigator.credentials) &&
    typeof navigator.credentials.get === "function";
}

/**
 * 执行一次 Passkey 再认证并把凭据交给服务端验证。
 *
 * @param {HTMLElement} section 提供 Passkey 接口地址的数据元素。
 * @return {Promise<Object>} 服务端返回的验证结果。
 */
async function performPasskeyReauth(section) {
  const optionsPayload = await fetchPasskeyReauthOptions(section);
  const credential = await navigator.credentials.get({
    publicKey: authenticationOptionsFromJson(optionsPayload.optionsJSON),
  });
  if (!(credential instanceof globalThis.PublicKeyCredential)) {
    throw new Error("Browser did not return a Passkey credential.");
  }

  return await verifyPasskeyReauth(section, {
    challengeId: optionsPayload.challengeId,
    credential: authenticationCredentialToJson(credential),
    reauthPurpose: section.dataset.reauthPurpose || "reauth",
  });
}

/**
 * 提交普通再认证表单。
 *
 * @param {HTMLElement} section 再认证区域。
 * @param {HTMLFormElement} form 再认证表单。
 * @param {string} url 再认证接口地址。
 * @param {Element|null} status 方法状态元素。
 * @param {Element|null} globalStatus 全局状态元素。
 * @return {Promise<void>} 提交完成后的 Promise。
 */
async function submitReauthForm(section, form, url, status, globalStatus) {
  const attempt = nextReauthAttempt(section);
  try {
    const response = await fetch(url, {
      body: reauthFormBody(form, section),
      headers: csrfRequestHeaders({
        "content-type": "application/x-www-form-urlencoded",
      }),
      method: "POST",
    });
    if (section.dataset.reauthAttempt !== attempt) {
      return;
    }
    if (!response.ok) {
      setReauthFailure(section, status);
      return;
    }

    setReauthSuccess(section, status, globalStatus);
    form.reset();
  } catch {
    if (section.dataset.reauthAttempt === attempt) {
      setReauthFailure(section, status);
    }
  }
}

/**
 * 构造带 CSRF 的再认证表单请求体。
 *
 * @param {HTMLFormElement} form 再认证表单。
 * @param {HTMLElement} section 再认证区域。
 * @return {URLSearchParams} 编码后的请求体。
 */
function reauthFormBody(form, section) {
  const body = new URLSearchParams();
  for (const [key, value] of new FormData(form)) {
    if (typeof value === "string") {
      body.set(key, value);
    }
  }
  body.set(csrfFieldName, currentCsrfToken());
  body.set("reauthPurpose", section.dataset.reauthPurpose || "reauth");
  return body;
}

/**
 * 获取 Passkey 再认证参数。
 *
 * @param {HTMLElement} section 再认证区域。
 * @return {Promise<{challengeId: string, optionsJSON: Object}>} 认证参数。
 */
async function fetchPasskeyReauthOptions(section) {
  const response = await fetch(
    section.dataset.reauthPasskeyOptionsUrl ||
      "/account/passkeys/reauth-options",
    {
      body: "{}",
      headers: csrfRequestHeaders({
        "content-type": "application/json",
      }),
      method: "POST",
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (
    !response.ok ||
    typeof payload.challengeId !== "string" ||
    typeof payload.optionsJSON !== "object" ||
    payload.optionsJSON === null
  ) {
    throw new Error("Could not create Passkey authentication options.");
  }
  return payload;
}

/**
 * 提交 Passkey 再认证结果。
 *
 * @param {HTMLElement} section 再认证区域。
 * @param {Object} payload Passkey 认证结果。
 * @return {Promise<Object>} 后端校验结果。
 */
async function verifyPasskeyReauth(section, payload) {
  const response = await fetch(
    section.dataset.reauthPasskeyVerifyUrl || "/account/passkeys/reauth",
    {
      body: JSON.stringify(payload),
      headers: csrfRequestHeaders({
        "content-type": "application/json",
      }),
      method: "POST",
    },
  );
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("Could not verify Passkey authentication.");
  }
  return responsePayload;
}

/**
 * 将服务端 JSON 认证参数转换为浏览器 WebAuthn 参数。
 *
 * @param {Object} optionsJSON 服务端返回的认证参数。
 * @return {PublicKeyCredentialRequestOptions} 浏览器认证参数。
 */
function authenticationOptionsFromJson(optionsJSON) {
  return {
    ...optionsJSON,
    allowCredentials: (optionsJSON.allowCredentials || []).map(
      credentialDescriptorFromJson,
    ),
    challenge: base64UrlToArrayBuffer(optionsJSON.challenge),
  };
}

/**
 * 将浏览器认证凭证转换为服务端 SimpleWebAuthn JSON。
 *
 * @param {PublicKeyCredential} credential 浏览器认证凭证。
 * @return {Object} 可提交服务端的认证凭证。
 */
function authenticationCredentialToJson(credential) {
  const response = credential.response;
  return {
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    response: {
      authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      signature: arrayBufferToBase64Url(response.signature),
      userHandle: optionalArrayBufferToBase64Url(response.userHandle),
    },
    type: credential.type,
  };
}

/**
 * 设置再认证成功状态，同步页面认证状态并继续等待中的敏感操作。
 *
 * @param {HTMLElement} section 再认证区域。
 * @param {Element|null} status 方法状态元素。
 * @param {Element|null} globalStatus 全局状态元素。
 */
function setReauthSuccess(section, status, globalStatus) {
  section.dispatchEvent(new CustomEvent("reauth-dispose"));
  if (section.dataset.reauthPurpose === "reauth") {
    const securityForm = document.querySelector(
      "[data-security-settings-form]",
    );
    if (securityForm instanceof HTMLFormElement) {
      securityForm.dataset.securityRecentlyVerified = "true";
    }
  }

  if (
    section.dataset.reauthPurpose === "reauth" &&
    pendingSensitiveActionForm instanceof HTMLFormElement &&
    pendingSensitiveActionForm.isConnected
  ) {
    const form = pendingSensitiveActionForm;
    pendingSensitiveActionForm = undefined;
    void submitSensitiveAction(form);
    return;
  }

  setInlineStatus(status, section.dataset.reauthSuccess || "", "success");
  setInlineStatus(
    globalStatus,
    section.dataset.reauthSuccess || "",
    "success",
  );
  section.dispatchEvent(new CustomEvent("reauth-success", { bubbles: true }));
}

/**
 * 设置再认证失败状态。
 *
 * @param {HTMLElement} section 再认证区域。
 * @param {Element|null} status 方法状态元素。
 */
function setReauthFailure(section, status) {
  setInlineStatus(status, section.dataset.reauthFailed || "", "error");
}

/**
 * 向后端请求 Passkey 注册参数。
 *
 * @param {HTMLElement} section Passkey 绑定区域。
 * @return {Promise<{challengeId: string, optionsJSON: Object}>} 注册参数。
 */
async function fetchPasskeyRegistrationOptions(section) {
  const response = await fetch(
    section.dataset.passkeyOptionsUrl ||
      "/account/passkeys/register-options",
    {
      body: "{}",
      headers: csrfRequestHeaders({
        "content-type": "application/json",
      }),
      method: "POST",
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (
    !response.ok ||
    typeof payload.challengeId !== "string" ||
    typeof payload.optionsJSON !== "object" ||
    payload.optionsJSON === null
  ) {
    throw new Error("Could not create Passkey registration options.");
  }
  return payload;
}

/**
 * 向后端提交 Passkey 注册结果。
 *
 * @param {HTMLElement} section Passkey 绑定区域。
 * @param {Object} payload 注册结果。
 * @return {Promise<Object>} 后端校验结果。
 */
async function verifyPasskeyRegistration(section, payload) {
  const response = await fetch(
    section.dataset.passkeyRegisterUrl || "/account/passkeys/register",
    {
      body: JSON.stringify(payload),
      headers: csrfRequestHeaders({
        "content-type": "application/json",
      }),
      method: "POST",
    },
  );
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("Could not verify Passkey registration.");
  }
  return responsePayload;
}

/**
 * 将服务端 JSON 注册参数转换为浏览器 WebAuthn 参数。
 *
 * @param {Object} optionsJSON 服务端返回的注册参数。
 * @return {PublicKeyCredentialCreationOptions} 浏览器注册参数。
 */
function creationOptionsFromJson(optionsJSON) {
  return {
    ...optionsJSON,
    challenge: base64UrlToArrayBuffer(optionsJSON.challenge),
    excludeCredentials: (optionsJSON.excludeCredentials || []).map(
      credentialDescriptorFromJson,
    ),
    user: {
      ...optionsJSON.user,
      id: base64UrlToArrayBuffer(optionsJSON.user.id),
    },
  };
}

/**
 * 将服务端 JSON 凭证描述符转换为浏览器 WebAuthn 描述符。
 *
 * @param {Object} descriptor 服务端凭证描述符。
 * @return {PublicKeyCredentialDescriptor} 浏览器凭证描述符。
 */
function credentialDescriptorFromJson(descriptor) {
  return {
    ...descriptor,
    id: base64UrlToArrayBuffer(descriptor.id),
  };
}

/**
 * 将浏览器注册凭证转换为服务端 SimpleWebAuthn JSON。
 *
 * @param {PublicKeyCredential} credential 浏览器注册凭证。
 * @return {Object} 可提交服务端的注册凭证。
 */
function registrationCredentialToJson(credential) {
  const response = credential.response;
  return {
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    response: {
      attestationObject: arrayBufferToBase64Url(response.attestationObject),
      authenticatorData: typeof response.getAuthenticatorData === "function"
        ? arrayBufferToBase64Url(response.getAuthenticatorData())
        : undefined,
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      publicKey: typeof response.getPublicKey === "function"
        ? optionalArrayBufferToBase64Url(response.getPublicKey())
        : undefined,
      publicKeyAlgorithm: typeof response.getPublicKeyAlgorithm === "function"
        ? response.getPublicKeyAlgorithm()
        : undefined,
      transports: typeof response.getTransports === "function"
        ? response.getTransports()
        : undefined,
    },
    type: credential.type,
  };
}

/**
 * 将 Base64URL 字符串解码为 ArrayBuffer。
 *
 * @param {string} value Base64URL 字符串。
 * @return {ArrayBuffer} 解码后的 ArrayBuffer。
 */
function base64UrlToArrayBuffer(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + (4 - normalized.length % 4) % 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/**
 * 将可空 ArrayBuffer 编码为 Base64URL 字符串。
 *
 * @param {ArrayBuffer|null} value 可空 ArrayBuffer。
 * @return {string|undefined} Base64URL 字符串。
 */
function optionalArrayBufferToBase64Url(value) {
  return value ? arrayBufferToBase64Url(value) : undefined;
}

/**
 * 将 ArrayBuffer 编码为 Base64URL 字符串。
 *
 * @param {ArrayBuffer} value ArrayBuffer。
 * @return {string} Base64URL 字符串。
 */
function arrayBufferToBase64Url(value) {
  const bytes = new Uint8Array(value);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

/**
 * 构建邮箱验证码发送请求体。
 *
 * @param {HTMLFormElement} form 邮箱绑定表单。
 * @return {URLSearchParams} 编码后的请求体。
 */
function emailVerificationRequestBody(form) {
  const body = new URLSearchParams();
  for (const [key, value] of new FormData(form)) {
    if (typeof value === "string") {
      body.set(key, value);
    }
  }

  body.set(csrfFieldName, currentCsrfToken());
  body.set("purpose", "email_binding");
  return body;
}

/**
 * 生成邮箱绑定错误码对应的提示文案。
 *
 * @param {HTMLFormElement} form 邮箱绑定表单。
 * @param {unknown} error 后端错误码。
 * @return {string} 本地化错误提示。
 */
function emailBindingErrorMessage(form, error) {
  switch (error) {
    case "expired":
      return form.dataset.emailVerificationExpired || "";
    case "invalid":
      return form.dataset.emailInvalid || "";
    case "notFound":
      return form.dataset.emailVerificationMissing || "";
    case "attempts":
    case "code":
    default:
      return form.dataset.emailCodeInvalid || "";
  }
}

/**
 * 重置 Turnstile widget，便于用户再次发送验证码。
 */
function resetTurnstileWidget() {
  const turnstile = globalThis.turnstile;
  if (turnstile && typeof turnstile.reset === "function") {
    turnstile.reset();
  }
}

/**
 * 设置内联状态消息。
 *
 * @param {Element|null} element 状态元素。
 * @param {string} message 状态消息。
 * @param {string} state 状态类型。
 */
function setInlineStatus(element, message, state) {
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

/**
 * 清除内联状态消息。
 *
 * @param {Element|null} element 状态元素。
 */
function clearInlineStatus(element) {
  setInlineStatus(element, "", "success");
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
      topicEditor.querySelectorAll("[data-role='select-topic-row']").forEach(
        (checkbox) => {
          checkbox.checked = target.checked;
        },
      );
      syncHeaderCheckbox(
        topicEditor,
        "[data-role='select-all-topics']",
        "[data-role='select-topic-row']",
      );
    }

    if (target.matches("[data-role='select-topic-row']")) {
      syncHeaderCheckbox(
        topicEditor,
        "[data-role='select-all-topics']",
        "[data-role='select-topic-row']",
      );
    }

    if (target.matches("[data-role='enable-all-topics']")) {
      topicEditor.querySelectorAll("[data-role='topic-enabled']").forEach(
        (checkbox) => {
          checkbox.checked = target.checked;
        },
      );
      syncHeaderCheckbox(
        topicEditor,
        "[data-role='enable-all-topics']",
        "[data-role='topic-enabled']",
      );
      shouldSave = true;
    }

    if (target.matches("[data-role='topic-enabled']")) {
      syncHeaderCheckbox(
        topicEditor,
        "[data-role='enable-all-topics']",
        "[data-role='topic-enabled']",
      );
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

  topicEditor.addEventListener("focusout", (event) => {
    if (
      pruneIncompleteDraftTopicRows(
        topicEditor,
        keywordEditor,
        event.relatedTarget,
      )
    ) {
      scheduleAutoSave();
    }
  });

  syncHeaderCheckbox(
    topicEditor,
    "[data-role='select-all-topics']",
    "[data-role='select-topic-row']",
  );
  syncHeaderCheckbox(
    topicEditor,
    "[data-role='enable-all-topics']",
    "[data-role='topic-enabled']",
  );
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
      keywordEditor.querySelectorAll("[data-role='select-keyword-row']")
        .forEach((checkbox) => {
          checkbox.checked = target.checked;
        });
      syncHeaderCheckbox(
        keywordEditor,
        "[data-role='select-all-keywords']",
        "[data-role='select-keyword-row']",
      );
    }

    if (target.matches("[data-role='select-keyword-row']")) {
      syncHeaderCheckbox(
        keywordEditor,
        "[data-role='select-all-keywords']",
        "[data-role='select-keyword-row']",
      );
    }

    if (target.matches("[data-role='select-keyword-location']")) {
      const location = target.dataset.location;
      keywordEditor
        .querySelectorAll(`[name$="_location_${location}"]`)
        .forEach((checkbox) => {
          checkbox.checked = target.checked;
        });
      syncKeywordLocationHeader(keywordEditor, location);
      shouldSave = true;
    }

    if (target.name.includes("_location_")) {
      syncKeywordLocationHeaders(keywordEditor);
      shouldSave = true;
    }

    updateKeywordSummary(keywordEditor);
    if (shouldSave) {
      scheduleAutoSave();
    }
  });

  keywordEditor.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && isKeywordTextInput(target)) {
      syncKeywordOptionsFromInput(target);
    }

    updateKeywordSummary(keywordEditor);
    scheduleAutoSave();
  });

  keywordEditor.addEventListener("focusout", (event) => {
    if (pruneIncompleteDraftKeywordRows(keywordEditor, event.relatedTarget)) {
      scheduleAutoSave();
    }
  });

  syncHeaderCheckbox(
    keywordEditor,
    "[data-role='select-all-keywords']",
    "[data-role='select-keyword-row']",
  );
  syncKeywordLocationHeaders(keywordEditor);
}

/**
 * 根据一组行复选框同步表头复选框状态。
 *
 * @param {HTMLElement} container 需要同步的表格容器。
 * @param {string} headerSelector 表头复选框选择器。
 * @param {string} itemSelector 行复选框选择器。
 */
function syncHeaderCheckbox(container, headerSelector, itemSelector) {
  const header = container.querySelector(headerSelector);
  if (!(header instanceof HTMLInputElement)) {
    return;
  }

  const items = Array.from(container.querySelectorAll(itemSelector))
    .filter((item) => item instanceof HTMLInputElement);
  syncCheckboxState(header, items);
}

/**
 * 根据子复选框选中数量更新父复选框的全选状态。
 *
 * @param {HTMLInputElement} header 父级复选框。
 * @param {HTMLInputElement[]} items 子复选框列表。
 */
function syncCheckboxState(header, items) {
  const checkedCount = items.filter((item) => item.checked).length;
  header.checked = items.length > 0 && checkedCount === items.length;
  header.indeterminate = false;
}

/**
 * 同步关键词编辑器中所有匹配位置表头复选框。
 *
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 */
function syncKeywordLocationHeaders(keywordEditor) {
  keywordEditor.querySelectorAll("[data-role='select-keyword-location']")
    .forEach((checkbox) => {
      if (checkbox instanceof HTMLInputElement) {
        syncKeywordLocationHeader(keywordEditor, checkbox.dataset.location);
      }
    });
}

/**
 * 同步关键词编辑器中单个匹配位置表头复选框。
 *
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 * @param {string|undefined} location 匹配位置名称。
 */
function syncKeywordLocationHeader(keywordEditor, location) {
  if (!location) {
    return;
  }

  const header = Array.from(
    keywordEditor.querySelectorAll("[data-role='select-keyword-location']"),
  )
    .find((checkbox) =>
      checkbox instanceof HTMLInputElement &&
      checkbox.dataset.location === location
    );
  if (!(header instanceof HTMLInputElement)) {
    return;
  }

  const items = Array.from(
    keywordEditor.querySelectorAll("[name*='_location_']"),
  )
    .filter((item) =>
      item instanceof HTMLInputElement &&
      item.name.endsWith(`_location_${location}`)
    );
  syncCheckboxState(header, items);
}

/**
 * 清理所有已失焦且必填字段为空的新增草稿行。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 * @return {boolean} 实际删除行时返回 true。
 */
function pruneIncompleteDraftRows(topicEditor, keywordEditor) {
  const prunedTopics = pruneIncompleteDraftTopicRows(
    topicEditor,
    keywordEditor,
  );
  const prunedKeywords = pruneIncompleteDraftKeywordRows(keywordEditor);
  return prunedTopics || prunedKeywords;
}

/**
 * 清理已失焦且未填写话题 ID 的新增话题行。
 *
 * @param {HTMLElement} topicEditor 话题编辑器元素。
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 * @param {EventTarget|null} [focusTarget] 失焦后的焦点目标。
 * @return {boolean} 实际删除行时返回 true。
 */
function pruneIncompleteDraftTopicRows(
  topicEditor,
  keywordEditor,
  focusTarget = document.activeElement,
) {
  let removed = false;
  topicEditor.querySelectorAll("[data-topic-row][data-draft-row='true']")
    .forEach((row) => {
      if (rowContainsFocusTarget(row, focusTarget)) {
        return;
      }

      const topicId =
        row.querySelector("[data-topic-id-input]")?.value.trim() ?? "";
      if (topicId.length > 0) {
        delete row.dataset.draftRow;
        return;
      }

      row.remove();
      removed = true;
    });

  if (!removed) {
    return false;
  }

  ensureAtLeastOneTopicRow(topicEditor);
  reindexTopicRows(topicEditor);

  const activeTarget = activeKeywordTargetInput().value;
  if (
    activeTarget !== "common" && !findTopicRowById(topicEditor, activeTarget)
  ) {
    switchKeywordTarget(
      topicEditor,
      keywordEditor,
      commonKeywordButton(topicEditor),
    );
  }

  updateActiveTopicSummary(topicEditor);
  return true;
}

/**
 * 清理已失焦且未填写关键词的新增关键词行。
 *
 * @param {HTMLElement} keywordEditor 关键词编辑器元素。
 * @param {EventTarget|null} [focusTarget] 失焦后的焦点目标。
 * @return {boolean} 实际删除行时返回 true。
 */
function pruneIncompleteDraftKeywordRows(
  keywordEditor,
  focusTarget = document.activeElement,
) {
  let removed = false;
  keywordEditor.querySelectorAll("[data-keyword-row][data-draft-row='true']")
    .forEach((row) => {
      if (rowContainsFocusTarget(row, focusTarget)) {
        return;
      }

      const keyword =
        row.querySelector("input[name^='keyword_']")?.value.trim() ?? "";
      if (keyword.length > 0) {
        delete row.dataset.draftRow;
        return;
      }

      row.remove();
      removed = true;
    });

  if (!removed) {
    return false;
  }

  ensureAtLeastOneKeywordRow(keywordEditor);
  reindexKeywordRows(keywordEditor);
  updateKeywordSummary(keywordEditor);
  return true;
}

/**
 * 判断焦点目标是否仍在行内。
 *
 * @param {Element} row 规则行元素。
 * @param {EventTarget|null} focusTarget 焦点目标。
 * @return {boolean} 焦点目标仍在行内时返回 true。
 */
function rowContainsFocusTarget(row, focusTarget) {
  return focusTarget instanceof Node && row.contains(focusTarget);
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

  const row = handle.closest(
    kind === "topic" ? "[data-topic-row]" : "[data-keyword-row]",
  );
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
    !state.started &&
    Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 4
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
    const id = state.row.querySelector("[data-topic-id-input]")?.value.trim() ??
      "";
    const note =
      state.row.querySelector("[data-topic-note-input]")?.value.trim() ?? "";
    return [note, id].filter(Boolean).join(" ") || state.handle.title;
  }

  const keyword =
    state.row.querySelector("input[name^='keyword_']")?.value.trim() ?? "";
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
  targetRow.classList.add(
    insertBefore ? "is-rule-drag-over-before" : "is-rule-drag-over-after",
  );

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
  const topicId =
    topicRow.querySelector("[data-topic-id-input]")?.value.trim() ?? "";
  if (!topicId) {
    return false;
  }

  const activeTarget = activeKeywordTargetInput().value || "common";
  return activeTarget === "common" ||
    findActiveTopicRow(topicEditor, activeTarget) !== topicRow;
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
function moveKeywordRowToTopic(
  topicEditor,
  keywordEditor,
  keywordRow,
  topicRow,
) {
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
  const keyword = row.querySelector("input[name^='keyword_']")?.value.trim() ??
    "";
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
  return topicEditor.querySelector(
    '[data-topic-row][data-active-keyword-target="true"]',
  ) ??
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
      document.documentElement.style.setProperty(
        "--theme-color",
        colorInput.value,
      );
      scheduleAutoSave();
    });
  }

  if (darkModeInput instanceof HTMLInputElement) {
    darkModeInput.addEventListener("change", () => {
      document.documentElement.dataset.colorMode = darkModeInput.checked
        ? "dark"
        : "light";
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

  const handleInput = (event) => {
    if (isEditorEvent(event)) {
      return;
    }

    scheduleAutoSave();
  };

  const handleChange = (event) => {
    if (isEditorEvent(event)) {
      return;
    }

    const target = event.target;
    if (target instanceof HTMLSelectElement && target.name === "locale") {
      reloadAfterSave = true;
    }

    scheduleAutoSave();
  };

  form.addEventListener("input", handleInput);
  form.addEventListener("change", handleChange);
  externalAutoSaveControls(form).forEach((control) => {
    control.addEventListener("input", handleInput);
    control.addEventListener("change", handleChange);
  });
}

/**
 * 获取通过 form 属性关联到自动保存表单的外部控件。
 *
 * @param {HTMLFormElement} form 设置表单。
 * @return {Element[]} 外部关联控件列表。
 */
function externalAutoSaveControls(form) {
  if (!form.id) {
    return [];
  }

  return Array.from(document.querySelectorAll(`[form="${form.id}"]`))
    .filter((control) => !form.contains(control));
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
  pruneIncompleteDraftRows(autoSaveTopicEditor, autoSaveKeywordEditor);
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

    clearSecretSubmissionValues();
    lastSavedSignature = settingsSignature();
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
  if (!(status instanceof HTMLElement)) {
    return;
  }

  clearTimeout(testNotifyStatusTimer);
  const statusText = status.querySelector("[data-test-notify-status-text]");
  if (statusText) {
    statusText.textContent = text;
  } else {
    status.textContent = text;
  }
  updateTestNotifyErrorLink(
    status,
    state === "error" ? options.errorDetails : undefined,
  );
  status.hidden = text.length === 0 && !options.errorDetails;

  if (state) {
    status.dataset.state = state;
  } else {
    delete status.dataset.state;
  }

  const persistMs = options.persistMs ?? (state === "error" ? 0 : 2200);
  if (text && persistMs > 0) {
    testNotifyStatusTimer = setTimeout(() => {
      const currentStatusText =
        status.querySelector("[data-test-notify-status-text]") ?? status;
      if (currentStatusText.textContent === text) {
        currentStatusText.textContent = "";
        updateTestNotifyErrorLink(status);
        status.hidden = true;
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
  const appName = errorLink.dataset.errorAppName || document.title ||
    "Heybox Topic Notifier";
  const appOrigin = globalThis.location?.origin || "";
  const colorMode = errorLink.dataset.errorDarkMode === "true"
    ? "dark"
    : "light";
  const direction = errorLink.dataset.errorDirection === "rtl" ? "rtl" : "ltr";
  const errorTitle = errorLink.dataset.errorTitle || "Error message";
  const locale = errorLink.dataset.errorLocale ||
    document.documentElement.lang || "zh-CN";
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
          <dd><pre class="error-detail-content" dir="ltr">${
    escapeHtml(errorDetails)
  }</pre></dd>
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

  return formSignature(autoSaveForm);
}

/**
 * 生成指定表单的字段签名。
 *
 * @param {HTMLFormElement} form 表单元素。
 * @return {string} 表单字段序列化后的签名。
 */
function formSignature(form) {
  const params = new URLSearchParams();
  for (const [key, value] of formDataFromForm(form).entries()) {
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
    autoSaveForm
      .dataset[`autosave${state[0].toUpperCase()}${state.slice(1)}`] ??
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
  newRow.dataset.draftRow = "true";

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
  const selectedRows = Array.from(
    topicEditor.querySelectorAll("[data-topic-row]"),
  )
    .filter((row) =>
      row.querySelector("[data-role='select-topic-row']")?.checked
    );

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
  if (
    activeTarget !== "common" && !findTopicRowById(topicEditor, activeTarget)
  ) {
    switchKeywordTarget(
      topicEditor,
      keywordEditor,
      commonKeywordButton(topicEditor),
    );
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
  editor.querySelectorAll("[data-topic-row]").forEach((row, index) => {
    row.querySelectorAll("input").forEach((input) => {
      if (!input.name) {
        return;
      }

      input.name = input.name.replace(
        /topic_(?:__index__|\d+)_/,
        `topic_${index}_`,
      );
    });
  });

  syncHeaderCheckbox(
    editor,
    "[data-role='select-all-topics']",
    "[data-role='select-topic-row']",
  );
  syncHeaderCheckbox(
    editor,
    "[data-role='enable-all-topics']",
    "[data-role='topic-enabled']",
  );
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
  const target = row
    ? row.querySelector("[data-topic-id-input]").value.trim()
    : "common";
  topicEditor.querySelectorAll("[data-topic-row]").forEach((topicRow) => {
    topicRow.dataset.activeKeywordTarget = "false";
  });
  if (row) {
    row.dataset.activeKeywordTarget = "true";
  }
  activeKeywordTargetInput().value = target || "common";

  const rules = row ? parseRules(topicKeywordRulesValue(row)) : parseRules(
    commonKeywordRulesInput().value || topicEditor.dataset.commonKeywords,
  );

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
    row.querySelector("[data-action='edit-topic-keywords']")?.dataset
      .topicKeywords ??
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
  keywordEditor.querySelectorAll("[data-keyword-row]").forEach((row) =>
    row.remove()
  );

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
    input.checked = Array.isArray(rule.locations) &&
      rule.locations.includes(location);
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
        const keyword = row.querySelector("input[name^='keyword_']").value
          .trim();
        const locations = Array.from(
          row.querySelectorAll("[name*='_location_']"),
        )
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
  markKeywordOptionManual(row, option);
}

/**
 * 根据关键词输入内容同步可自动识别的选项。
 *
 * @param {HTMLInputElement} input 关键词输入框。
 */
function syncKeywordOptionsFromInput(input) {
  const row = input.closest("[data-keyword-row]");
  if (!(row instanceof HTMLElement)) {
    return;
  }

  const keyword = input.value.trim();
  if (!keyword) {
    clearKeywordOptionDetectionState(row, "caseSensitive");
    clearKeywordOptionDetectionState(row, "useRegex");
    return;
  }

  syncDetectedKeywordOption(row, "caseSensitive", hasMixedAsciiCase(keyword));
  syncDetectedKeywordOption(row, "useRegex", looksLikeRegexPattern(keyword));
}

/**
 * 同步单个自动识别选项。
 *
 * @param {HTMLElement} row 关键词规则行元素。
 * @param {string} option 选项名称。
 * @param {boolean} detected 是否识别到需要启用该选项。
 */
function syncDetectedKeywordOption(row, option, detected) {
  const manualKey = keywordOptionStateDatasetKey("manual", option);
  const autoKey = keywordOptionStateDatasetKey("auto", option);
  if (!manualKey || !autoKey || row.dataset[manualKey] === "true") {
    return;
  }

  if (detected) {
    setKeywordOption(row, option, true);
    row.dataset[autoKey] = "true";
    return;
  }

  if (row.dataset[autoKey] === "true") {
    setKeywordOption(row, option, false);
    delete row.dataset[autoKey];
  }
}

/**
 * 标记关键词选项已由用户手动设置。
 *
 * @param {HTMLElement} row 关键词规则行元素。
 * @param {string|undefined} option 选项名称。
 */
function markKeywordOptionManual(row, option) {
  const manualKey = keywordOptionStateDatasetKey("manual", option);
  const autoKey = keywordOptionStateDatasetKey("auto", option);
  if (!manualKey || !autoKey) {
    return;
  }

  row.dataset[manualKey] = "true";
  delete row.dataset[autoKey];
}

/**
 * 清理关键词选项的自动识别状态。
 *
 * @param {HTMLElement} row 关键词规则行元素。
 * @param {string} option 选项名称。
 */
function clearKeywordOptionDetectionState(row, option) {
  const manualKey = keywordOptionStateDatasetKey("manual", option);
  const autoKey = keywordOptionStateDatasetKey("auto", option);
  if (!manualKey || !autoKey) {
    return;
  }

  if (row.dataset[autoKey] === "true") {
    setKeywordOption(row, option, false);
  }
  delete row.dataset[manualKey];
  delete row.dataset[autoKey];
}

/**
 * 生成关键词选项检测状态的数据集键。
 *
 * @param {"manual"|"auto"} state 状态类型。
 * @param {string|undefined} option 选项名称。
 * @return {string} 数据集键，未知选项返回空字符串。
 */
function keywordOptionStateDatasetKey(state, option) {
  if (option === "caseSensitive") {
    return state === "manual"
      ? "keywordOptionManualCaseSensitive"
      : "keywordOptionAutoCaseSensitive";
  }

  if (option === "useRegex") {
    return state === "manual"
      ? "keywordOptionManualUseRegex"
      : "keywordOptionAutoUseRegex";
  }

  return "";
}

/**
 * 判断关键词输入框是否为关键词文本字段。
 *
 * @param {HTMLInputElement} input 输入框。
 * @return {boolean} 是关键词文本字段时返回 true。
 */
function isKeywordTextInput(input) {
  return input.name.startsWith("keyword_") &&
    !input.name.includes("_location_") &&
    !input.dataset.keywordOption;
}

/**
 * 判断文本是否同时包含 ASCII 大写和小写字母。
 *
 * @param {string} value 待检测文本。
 * @return {boolean} 同时存在大小写字母时返回 true。
 */
function hasMixedAsciiCase(value) {
  return /[A-Z]/.test(value) && /[a-z]/.test(value);
}

/**
 * 判断文本是否像常见正则表达式。
 *
 * @param {string} value 待检测文本。
 * @return {boolean} 命中常见正则特征时返回 true。
 */
function looksLikeRegexPattern(value) {
  return /(^|[^\\])(\.\*|\.\+|\.\?)/.test(value) ||
    /\\[dDsSwWbB]/.test(value) ||
    /\[[^\]]+\]/.test(value) ||
    /\(\?/.test(value) ||
    /\([^)]*\|[^)]*\)/.test(value) ||
    /\{\d+,?\d*\}/.test(value) ||
    /\{\d*,\d+\}/.test(value) ||
    /(^|[^\\])[\^$|]/.test(value);
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
  newRow.dataset.draftRow = "true";

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
    .filter((row) =>
      row.querySelector("[data-role='select-keyword-row']")?.checked
    );

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
  editor.querySelectorAll("[data-keyword-row]").forEach((row, index) => {
    row.querySelectorAll("input").forEach((input) => {
      if (!input.name) {
        return;
      }

      input.name = input.name.replace(
        /keyword_(?:__index__|\d+)/,
        `keyword_${index}`,
      );
    });
  });

  syncHeaderCheckbox(
    editor,
    "[data-role='select-all-keywords']",
    "[data-role='select-keyword-row']",
  );
  syncKeywordLocationHeaders(editor);
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
  summary.textContent = note && id
    ? `${note}（${id}）`
    : note || id || summary.dataset.commonLabel;
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
  const items = Array.from(
    summary.querySelectorAll("[data-keyword-summary-item]"),
  );
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
