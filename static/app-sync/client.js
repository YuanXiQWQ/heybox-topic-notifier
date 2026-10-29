/** @file 将本地编辑可靠落盘，再按原始编辑时间向当前账号重放。 */
(() => {
  /** 页面所属账号，始终与重放前的服务端会话再核对。 */
  const userId = document.body.dataset.appUserId;
  if (!userId || !globalThis.AppLocalStore || !globalThis.crypto?.subtle) {
    return;
  }
  /** 当前设备的持久元数据和时钟校准。 */
  let metadata;
  /** 当前页面最后生成的编辑，时钟倒退不会改变本机操作顺序。 */
  let previous;
  /** 合并同一页面内重复触发的同步请求。 */
  let flushing;
  /** 当前操作的服务器结果，只保存在内存中供调用者处理。 */
  const responses = new Map();
  /** 尚未完成本机落盘的操作，退出和更新必须等待。 */
  const writes = new Set();
  /** 当前账号的本地数据库接口。 */
  const store = globalThis.AppLocalStore;
  /** 页面初始化前的结构，不把运行中的彩蛋场景或临时弹窗复制进启动快照。 */
  const initialPage = document.documentElement.cloneNode(true);
  /** 本地元数据初始化任务。 */
  const ready = initialize();

  /**
   * 恢复设备版本和待同步操作，后台校准时钟与注册离线资源处理器。
   * @return {Promise<void>} 本地状态就绪。
   */
  async function initialize() {
    metadata = await store.readState(userId, "device") ??
      { deviceId: crypto.randomUUID(), offset: 0 };
    const pending = await store.pending(userId);
    applyPendingAppearance(pending);
    previous =
      pending.filter((operation) =>
        operation.stamp.deviceId === metadata.deviceId
      )
        .map((operation) => operation.stamp).sort(compareStamp).slice(-1)[0] ??
        metadata.previous;
    await store.writeState(userId, "device", metadata);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/app-sw.js", { scope: "/" }).then(
        async () => {
          const registration = await navigator.serviceWorker.ready;
          registration.active?.postMessage({ type: "app-session", userId });
          registration.active?.postMessage({ type: "app-pages", userId });
          registration.active?.postMessage({
            type: "app-resources",
            urls: [
              ...document.querySelectorAll(
                "script[src],link[rel='stylesheet']",
              ),
            ].map((element) => element.src || element.href),
          });
        },
      ).catch(() => {});
    }
    void flush("background");
  }
  /**
   * 将尚未同步的主题修改应用到其它缓存页面，不覆盖未编辑的主题字段。
   * @param {Array<object>} pending 当前账号的离线操作。
   */
  function applyPendingAppearance(pending) {
    for (
      const operation of pending.filter((item) => item.kind === "settings")
        .sort((a, b) => compareStamp(a.stamp, b.stamp))
    ) {
      const next = new URLSearchParams(operation.body),
        base = new URLSearchParams(operation.base);
      if (
        next.get("themeColor") !== base.get("themeColor") &&
        /^#[a-f0-9]{6}$/i.test(next.get("themeColor") ?? "")
      ) {
        document.documentElement.style.setProperty(
          "--theme-color",
          next.get("themeColor"),
        );
      }
      if (next.get("darkMode") !== base.get("darkMode")) {
        document.documentElement.dataset.colorMode =
          next.get("darkMode") === "on" ? "dark" : "light";
      }
    }
  }
  /**
   * 对本地操作使用与服务端一致的版本顺序。
   * @param {object} left 左版本。
   * @param {object} right 右版本。
   * @return {number} 比较结果。
   */
  function compareStamp(left, right) {
    for (const key of ["editedAt", "counter", "deviceId", "operationId"]) {
      if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
    }
    return 0;
  }
  /**
   * 生成一次编辑版本，网络重试复用已保存的版本。
   * @return {object} 新版本。
   */
  function editStamp() {
    const editedAt = Math.max(
      Date.now() + metadata.offset,
      previous?.editedAt ?? 0,
    );
    previous = {
      editedAt,
      counter: editedAt === previous?.editedAt ? previous.counter + 1 : 0,
      deviceId: metadata.deviceId,
      operationId: crypto.randomUUID(),
    };
    return previous;
  }
  /**
   * 序列化普通业务表单，不把 CSRF 令牌写进离线队列。
   * @param {FormData | URLSearchParams} form 表单快照。
   * @return {string} 可重放的业务字段。
   */
  function serialize(form) {
    const params = new URLSearchParams();
    for (const [name, value] of form) {
      if (name !== "csrfToken" && !name.startsWith("sync")) {
        params.append(name, String(value));
      }
    }
    return params.toString();
  }
  /**
   * 将输入控件当前值反映到 HTML，供断网重启恢复同样的页面和编辑器。
   * @return {string} 当前本地页面快照。
   */
  function capturePage() {
    const clone = initialPage.cloneNode(true);
    for (
      const source of document.querySelectorAll(
        "#settings-autosave-form,[data-match-table-section]",
      )
    ) {
      const selector = source.id
        ? `#${CSS.escape(source.id)}`
        : `[data-match-table-section="${
          CSS.escape(source.dataset.matchTableSection)
        }"]`;
      clone.querySelector(selector)?.replaceWith(source.cloneNode(true));
    }
    clone.setAttribute(
      "style",
      document.documentElement.getAttribute("style") ?? "",
    );
    clone.setAttribute(
      "data-color-mode",
      document.documentElement.getAttribute("data-color-mode") ?? "light",
    );
    const positions = new Map();
    [...clone.querySelectorAll("input,select,textarea")].forEach((element) => {
      if (!element.name) return;
      const formId = element.getAttribute("form") ||
        element.closest("form")?.id;
      if (formId !== "settings-autosave-form") return;
      const position = positions.get(element.name) ?? 0;
      positions.set(element.name, position + 1);
      const current =
        [...document.querySelectorAll(`[name="${CSS.escape(element.name)}"]`)]
          .filter((candidate) => candidate.form?.id === formId)[position];
      if (!current) return;
      if (element instanceof HTMLInputElement) {
        if (element.type === "file") return;
        element.setAttribute("value", current.value);
        element.toggleAttribute("checked", current.checked);
      } else if (element instanceof HTMLTextAreaElement) {
        element.textContent = current.value;
      } else {[...element.options].forEach((option, optionIndex) =>
          option.toggleAttribute(
            "selected",
            current.options[optionIndex].selected,
          )
        );}
    });
    clone.querySelectorAll("dialog[open]").forEach((dialog) =>
      dialog.removeAttribute("open")
    );
    clone.querySelectorAll("*").forEach((element) => {
      for (const attribute of [...element.attributes]) {
        if (
          attribute.name.startsWith("data-") &&
          attribute.name.endsWith("-initialized")
        ) element.removeAttribute(attribute.name);
      }
    });
    clone.querySelectorAll("[data-match-table-form]").forEach((form) => {
      form.removeAttribute("data-match-table-submitting");
      form.removeAttribute("aria-busy");
      form.querySelectorAll("button[type='submit']").forEach((button) =>
        button.removeAttribute("disabled")
      );
    });
    return "<!doctype html>" + clone.outerHTML;
  }
  /**
   * 原子保存设置操作和页面快照，再尝试同步；离线返回明确的本地受理状态。
   * @param {FormData} form 用户本次设置。
   * @param {string} base 用户编辑前的表单。
   * @return {Promise<Response>} 服务器响应或本地已保存响应。
   */
  async function submitSettings(form, base) {
    const html = capturePage();
    await ready;
    const operation = {
      kind: "settings",
      target: "/settings",
      body: serialize(form),
      base: serialize(new URLSearchParams(base)),
      stamp: editStamp(),
    };
    const existing = await store.readState(
      userId,
      `page:${location.pathname}${location.search}`,
    );
    await store.append(
      userId,
      operation,
      `page:${location.pathname}${location.search}`,
      {
        html,
        headers: existing?.headers,
        body: operation.body,
        stamp: operation.stamp,
      },
    );
    metadata.previous = previous;
    await store.writeState(userId, "device", metadata);
    void flush();
    return new Response(null, { status: 202, headers: { "x-app-local": "1" } });
  }
  /**
   * 持久保存记录移动或删除，并在服务端不可达时保留原始操作。
   * @param {string} target 受支持的本站记录操作。
   * @param {FormData} form 已选择记录及返回路径。
   * @return {Promise<Response>} 服务端结果或本地受理响应。
   */
  async function submitRecords(target, form) {
    await ready;
    const path = new URL(target, location.origin).pathname;
    if (
      !["/matches/complete", "/matches/delete", "/matches/restore"].includes(
        path,
      )
    ) throw new Error("Unsupported offline action");
    const selected = new Set(form.getAll("matchId").map(String));
    const rows = Object.fromEntries(
      [...document.querySelectorAll("tr[data-record-id]")].filter((row) =>
        selected.has(row.dataset.recordId)
      ).map((row) => [row.dataset.recordId, row.outerHTML]),
    );
    const operation = {
      kind: "record",
      target: path,
      body: serialize(form),
      rows,
      records: [...document.querySelectorAll("tr[data-record-id]")].filter(row => selected.has(row.dataset.recordId))
        .map(row => ({id:row.dataset.recordId,postId:row.dataset.recordPostId})),
      stamp: editStamp(),
    };
    const existing = await store.readState(
      userId,
      `page:${location.pathname}${location.search}`,
    );
    await store.append(
      userId,
      operation,
      `page:${location.pathname}${location.search}`,
      {
        html: capturePage(),
        headers: existing?.headers,
        stamp: operation.stamp,
      },
    );
    metadata.previous = previous;
    await store.writeState(userId, "device", metadata);
    document.dispatchEvent(new CustomEvent("application-local-records"));
    await flush("submit");
    const response = responses.get(operation.stamp.operationId);
    responses.delete(operation.stamp.operationId);
    return response ??
      new Response(null, { status: 202, headers: { "x-app-local": "1" } });
  }
  /**
   * 验证当前账号后重放队列，只有明确的成功响应才删除本地操作。
   * @param {string} reason 同步触发来源。
   * @return {Promise<void>} 本次同步尝试结束。
   */
  async function drain(reason) {
    const pending = (await store.pending(userId)).sort((a, b) =>
      compareStamp(a.stamp, b.stamp)
    );
    try {
      const started = Date.now();
      const response = await fetch("/api/sync/session", {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return;
      const session = await response.json();
      if (session.userId !== userId) return;
      metadata.offset = Math.round(
        session.serverTime - (started + Date.now()) / 2,
      );
      await store.writeState(userId, "device", metadata);
      for (const operation of pending) {
        const body = new URLSearchParams(operation.body);
        body.set("csrfToken", session.csrfToken);
        body.set("syncStamp", JSON.stringify(operation.stamp));
        if (operation.kind === "settings") body.set("syncBase", operation.base);
        const headers = operation.kind === "settings"
          ? { "x-autosave": "1", "x-settings-sync": "1" }
          : { "x-match-table-refresh": "1", "x-record-sync": "1" };
        const saved = await fetch(operation.target, {
          method: "POST",
          headers,
          body,
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        if (reason === "submit") {
          responses.set(operation.stamp.operationId, saved.clone());
        }
        if (!saved.ok) return;
        await store.acknowledge(userId, operation.stamp.operationId);
        if (operation.kind === "record") document.dispatchEvent(new CustomEvent("application-local-records"));
      }
      if (
        pending.length && reason !== "submit" &&
        !(await store.pending(userId)).length
      ) document.dispatchEvent(new CustomEvent("application-sync-complete"));
    } catch {
      // 无法确认服务端处理结果时保留原操作，下一次重放仍使用同一版本。
    }
  }
  /**
   * 合并重复同步；支持 Web Locks 的浏览器在多个标签页间共享锁。
   * @param {string} reason 同步来源。
   * @return {Promise<void>} 同步尝试结束。
   */
  function flush(reason = "background") {
    flushing = flushing ?? Promise.resolve().then(() =>
      navigator.locks
        ? navigator.locks.request(`heybox-sync:${userId}`, () => drain(reason))
        : drain(reason)
    ).finally(() => {
      flushing = undefined;
    });
    return flushing;
  }
  /**
   * 将待同步的记录管理状态投影到已缓存表格，不影响其它账号的页面。
   * @return {Promise<void>} 本地表格更新完成。
   */
  async function applyPendingRecords() {
    await ready;
    const operations = (await store.pending(userId)).filter((operation) =>
      operation.kind === "record"
    ).sort((a, b) => compareStamp(a.stamp, b.stamp));
    for (const operation of operations) {
      const ids = new Set(
        new URLSearchParams(operation.body).getAll("matchId"),
      );
      const table = document.querySelector("[data-match-table-form] table");
      if (table && operation.target !== "/matches/delete") {
        for (const id of ids) {
          if (table.querySelector(`tr[data-record-id="${CSS.escape(id)}"]`)) {
            continue;
          }
          if (
            location.pathname === "/" && operation.target !== "/matches/restore"
          ) continue;
          const html = operation.rows?.[id];
          if (!html) continue;
          const parsed = new DOMParser().parseFromString(
            `<table>${html}</table>`,
            "text/html",
          );
          const row = parsed.querySelector("tr[data-record-id]");
          if (!row) continue;
          row.querySelectorAll("button[type='submit']").forEach((button) =>
            button.removeAttribute("disabled")
          );
          const checkbox = row.querySelector("input[name='matchId']");
          checkbox?.removeAttribute("checked");
          checkbox?.removeAttribute("data-history-match-checkbox");
          checkbox?.removeAttribute("data-pending-match-checkbox");
          checkbox?.setAttribute(
            location.pathname === "/"
              ? "data-pending-match-checkbox"
              : "data-history-match-checkbox",
            "",
          );
          row.querySelector("[data-match-restore]")?.closest("td")?.remove();
          const primary = row.querySelector("td:last-child button");
          const heading = table.querySelector("th:last-child button");
          if (primary && heading) {
            primary.innerHTML = heading.innerHTML;
            primary.setAttribute(
              "aria-label",
              heading.getAttribute("aria-label"),
            );
            primary.setAttribute(
              "data-tooltip",
              heading.getAttribute("data-tooltip"),
            );
          }
          if (location.pathname === "/history") {
            const secondary = table.querySelector(
              "[data-match-secondary-bulk]",
            );
            if (secondary) {
              const cell = document.createElement("td");
              cell.className = "table-action-cell";
              const button = secondary.cloneNode(true);
              button.removeAttribute("data-match-secondary-bulk");
              button.setAttribute("data-match-restore", "");
              button.name = "matchId";
              button.value = id;
              cell.append(button);
              row.insertBefore(cell, row.lastElementChild);
            }
          }
          table.querySelector("tbody")?.append(row);
        }
      }
      for (const row of document.querySelectorAll("tr[data-record-id]")) {
        if (!ids.has(row.dataset.recordId)) continue;
        if (
          operation.target === "/matches/delete" ||
          (operation.target === "/matches/complete" &&
            location.pathname === "/")
        ) row.remove();
        else {
          row.dataset.recordStatus = operation.target === "/matches/restore"
            ? "workspace"
            : "history";
          const restore = row.querySelector("[data-match-restore]");
          if (restore) restore.hidden = row.dataset.recordStatus !== "history";
        }
      }
    }
    for (
      const section of document.querySelectorAll("[data-match-table-section]")
    ) {
      const empty = !section.querySelector("tbody tr[data-record-id]");
      const form = section.querySelector("[data-match-table-form]");
      const message = section.querySelector("[data-match-empty-message]");
      if (form) form.hidden = empty;
      if (message) message.hidden = !empty;
    }
  }
  /**
   * 保存局部刷新后的可见页面，以便断网重启看到已确认的结果。
   * @return {Promise<void>} 页面持久化完成。
   */
  async function savePage() {
    await ready;
    const name = `page:${location.pathname}${location.search}`;
    const existing = await store.readState(userId, name);
    await store.writeState(userId, name, { ...existing, html: capturePage() });
  }
  globalThis.addEventListener("online", () => {
    void ready.then(() => flush());
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void ready.then(() => flush());
  });
  document.addEventListener("application-records-rendered", () => {
    void applyPendingRecords().then(savePage).catch(() => {});
  });
  setInterval(() => {
    void ready.then(async () => {
      if ((await store.pending(userId)).length) await flush();
    }).catch(() => {});
  }, 30000);
  void ready.then(applyPendingRecords).catch(() => {});
  /**
   * 跟踪一次本地提交，落盘失败会阻止更新退出。
   * @param {Function} submit 提交方法。
   * @param {Array<unknown>} args 提交参数。
   * @return {Promise<Response>} 本地或服务器处理结果。
   */
  function tracked(submit, args) {
    const promise = submit(...args);
    writes.add(promise);
    promise.then(() => writes.delete(promise), () => writes.delete(promise));
    return promise;
  }
  /**
   * 保存仍处于防抖窗口内的设置，并等待本地事务结束。
   * @return {Promise<void>} 可以安全结束应用进程。
   */
  async function prepareForExit() {
    await ready;
    const saveSettings = globalThis.flushSettingsEdits ?? globalThis.saveSettingsNow;
    if (saveSettings && !await saveSettings()) {
      throw new Error("Settings are not saved");
    }
    while (writes.size) await Promise.all([...writes]);
  }
  globalThis.applicationSync = {
    ready,
    submitSettings: (...args) => tracked(submitSettings, args),
    submitRecords: (...args) => tracked(submitRecords, args),
    prepareForExit,
    applyPendingRecords,
    flush,
    capturePage,
    userId,
  };
})();
