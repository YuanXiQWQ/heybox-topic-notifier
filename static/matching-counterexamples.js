/** @file 管理当前配置的历史选帖与反例原因。 */

/**
 * 初始化随配置切换的反例列表、历史选择器和可编辑注释。
 * @param {HTMLElement} section 匹配设置卡片。
 * @param {Function} examples 获取当前配置的反例数组。
 * @param {Function} topics 获取当前话题备注和配置归属。
 * @param {Function} save 保存配置编辑。
 * @return {{restore: Function}|undefined} 配置切换时的恢复入口。
 */
globalThis.initMatchingCounterexamples = function (
  section,
  examples,
  topics,
  save,
) {
  const root = section.querySelector("[data-counterexample-editor]");
  if (!root?.querySelector("[data-example-row]")) return;
  const content = root.querySelector("[data-example-labels]");
  const labels = JSON.parse(content.dataset.exampleLabels);
  const rows = root.querySelector("[data-example-rows]");
  const results = root.querySelector("[data-example-results]");
  const panel = root.querySelector(".example-history");
  const search = panel.querySelector("[data-example-search]");
  const allTopics = panel.querySelector("[data-example-all]");
  const pageSize = panel.querySelector("[data-example-page-size]");
  const pages = panel.querySelector("[data-example-pages]");
  const status = panel.querySelector("[data-example-status]");
  const add = panel.querySelector("[data-example-add]");
  const addLabel = add.textContent;
  const grid = root.querySelector(".example-table");
  const bulkRemove = grid.querySelector("[data-example-delete]");
  const gridPicker = grid.querySelector("[data-example-picker]");
  // 旧的离线设置草稿可能保留提示词预览节点。
  root.querySelector("[data-example-preview]")?.remove();
  const format = new Intl.NumberFormat(document.documentElement.lang);
  const marked = new Set(), picked = new Map();
  let candidatesById = new Map(), historyRequest;
  const toggle = root.querySelector('[data-action="toggle-counterexamples"]');
  let history = [], candidates = [], page = 1, revision = 0, opener;
  /**
   * 从模板生成脱离文档的行。
   * @param {string} selector 模板选择器。
   * @return {HTMLElement} 模板根元素。
   */
  function clone(selector) {
    return root.querySelector(selector).content.firstElementChild.cloneNode(
      true,
    );
  }
  /**
   * 填充历史页共用的帖子三列；所有外部内容只按文本显示。
   * @param {HTMLElement} row 数据行。
   * @param {object} post 帖子或反例快照。
   */
  function fill(row, post) {
    row.dataset.post = post.id;
    row.querySelector("[data-row-check]").setAttribute(
      "aria-label",
      post.title || post.id,
    );
    const title = row.querySelector("[data-example-title]");
    title.textContent = post.title || post.id;
    if (title instanceof HTMLAnchorElement) {
      if (/^https?:\/\//i.test(post.url)) title.href = post.url;
      else title.removeAttribute("href");
    }
    row.querySelector("[data-example-body], .table-clip").textContent =
      post.body ?? post.post?.body ?? "—";
    const unavailable = row.querySelector("[data-example-unavailable]");
    if (unavailable) unavailable.hidden = Boolean(post.post);
    const detail = post.details;
    const list = row.querySelector(".match-detail-list");
    const [published, matched, value, location] = list.querySelectorAll(
      ".match-detail-value",
    );
    published.dataset.relativeTime = detail?.publishedAt || "";
    matched.dataset.relativeTime = detail?.matchedAt || "";
    value.closest("div").querySelector("dt").textContent =
      (detail?.kind === "ai" ? labels.ai : labels.keyword) + "：";
    value.textContent = detail?.value || "—";
    location.textContent =
      labels[detail?.location || post.location] || "—";
  }
  /**
   * 更新行选择、表头半选与批量动作。
   * @param {HTMLElement} body 表体。
   * @param {Set<string>|Map<string, object>} selection 已选帖子。
   */
  function selectionState(body, selection) {
    const boxes = Array.from(
      body.querySelectorAll("[data-row-check]:not(:disabled)"),
    );
    let count = 0;
    for (const box of boxes) {
      box.checked = selection.has(box.closest("[data-post]").dataset.post);
      if (body === results) box.closest("tr").classList.toggle("is-selected", box.checked);
      if (box.checked) count++;
    }
    const head = body === results
      ? panel.querySelector("[data-history-pick-all]")
      : grid.querySelector("[data-example-select-all]");
    head.disabled = !boxes.length;
    head.checked = boxes.length > 0 && count === boxes.length;
    head.indeterminate = count > 0 && count < boxes.length;
    bulkRemove.disabled = !marked.size;
    add.disabled = !picked.size;
    add.textContent = picked.size > 1
      ? `${addLabel} (${format.format(picked.size)})`
      : addLabel;
  }
  /**
   * 绑定行和本页全选，仅操作当前表格。
   * @param {HTMLElement} body 表体。
   * @param {Set<string>|Map<string, object>} selection 已选帖子。
   */
  function bindSelection(body, selection) {
    /**
     * 保存选择时的帖子快照，可跨搜索结果和话题范围批量添加。
     * @param {string} id 帖子 ID。
     */
    function select(id) {
      if (body === results) picked.set(id, candidatesById.get(id));
      else marked.add(id);
    }
    const table = body.closest('table, [role="table"]');
    table.addEventListener("change", (event) => {
      const input = event.target;
      if (input.matches("[data-example-select-all], [data-history-pick-all]")) {
        for (
          const box of body.querySelectorAll("[data-row-check]:not(:disabled)")
        ) {
          const id = box.closest("[data-post]").dataset.post;
          if (input.checked) select(id);
          else selection.delete(id);
        }
      } else if (input.matches("[data-row-check]")) {
        const id = input.closest("[data-post]").dataset.post;
        if (input.checked) select(id);
        else selection.delete(id);
      } else return;
      selectionState(body, selection);
    });
  }
  /** 渲染已保存的反例与可随时编辑的排除原因。 */
  function render() {
    rows.textContent = "";
    for (const item of examples()) {
      const row = clone("[data-example-row]");
      fill(row, item);
      const reason = row.querySelector("[data-example-reason]");
      reason.value = item.reason;
      reason.addEventListener("input", () => {
        item.reason = reason.value;
        save();
      });
      row.querySelector("[data-example-picker]").setAttribute(
        "aria-expanded",
        String(!panel.hidden),
      );
      rows.append(row);
    }
    selectionState(rows, marked);
    root.querySelector("[data-counterexample-summary]").textContent = format.format(examples().length);
    globalThis.__matchTableRelativeTimeUpdate?.();
  }
  /** 渲染当前历史页，保留其它页中已选的记录。 */
  function showPage() {
    const size = pageSize.value === "all"
      ? Math.max(1, candidates.length)
      : Number(pageSize.value);
    const total = Math.max(1, Math.ceil(candidates.length / size));
    page = Math.min(page, total);
    const saved = new Set(examples().map((item) => item.id));
    results.textContent = "";
    for (const post of candidates.slice((page - 1) * size, page * size)) {
      const row = clone("[data-history-pick-row]");
      fill(row, post);
      const box = row.querySelector("[data-row-check]");
      if (saved.has(post.id)) {
        box.disabled = true;
        box.checked = true;
        row.classList.add("is-unavailable");
      }
      results.append(row);
    }
    pages.textContent = "";
    for (
      const n of [...new Set([1, page - 1, page, page + 1, total])].filter(
        (n) => n > 0 && n <= total,
      ).sort((a, b) => a - b)
    ) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = format.format(n);
      if (n === page) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => {
        page = n;
        showPage();
        pages.querySelector('[aria-current="page"]')?.focus();
      });
      pages.append(button);
    }
    panel.querySelector("[data-example-pagination]").hidden =
      candidates.length <= 10;
    selectionState(results, picked);
    globalThis.__matchTableRelativeTimeUpdate?.();
  }
  /** 按话题、备注、标题及帖子 ID 筛选历史。 */
  function filter() {
    const byTopic = new Map(topics().map((t) => [t.id, t]));
    const q = search.value.trim().toLocaleLowerCase();
    const unique = new Map();
    for (const p of history) {
      const t = byTopic.get(p.topicId);
      if (!allTopics.checked && !t?.assigned) continue;
      if (
        ![p.title, p.id, t?.note, p.topicId].some((v) =>
          String(v || "").toLocaleLowerCase().includes(q)
        )
      ) continue;
      if (!unique.has(p.id)) unique.set(p.id, p);
    }
    candidatesById = unique;
    candidates = [...unique.values()];
    status.textContent = candidates.length ? "" : labels.empty;
    page = 1;
    showPage();
  }
  /** 读取当前账号的历史；断网时采用加密快照并投影待同步的删除。 @return {Promise<Array>} 可选择的历史帖子。 */
  async function readHistory() {
    const user = document.body.dataset.appUserId,
      store = globalThis.AppLocalStore;
    let records;
    const response = await fetch("/settings/counterexample-history", {
      cache: "no-store",
      redirect: "manual",
    }).catch(() => null);
    if (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      records = await response.json();
      if (!Array.isArray(records)) throw new Error("Invalid history");
      if (user && response.headers.get("x-app-user") !== user) {
        throw new Error("Account changed");
      }
      if (user && store) {
        await store.writeState(user, "counterexample-history", records).catch(
          () => {},
        );
      }
    } else {
      if (!user || !store) throw new Error("Offline");
      records = await store.readState(user, "counterexample-history");
      if (!Array.isArray(records)) throw new Error("No cached history");
    }
    if (user && store) {
      const removed = new Set(
        (await store.pending(user).catch(() => [])).filter((op) =>
          op.target === "/matches/delete"
        ).flatMap((op) => op.records?.map((r) => r.id) || []),
      );
      records = records.filter((post) => !removed.has(post.recordId));
    }

    return records;
  }
  /** 合并同时进行的历史请求。 @return {Promise<Array>} 当前账号的历史记录。 */
  function loadHistory() {
    historyRequest ??= readHistory().finally(() => {
      historyRequest = undefined;
    });
    return historyRequest;
  }
  /** 为只有旧摘录的反例补齐仍可从历史取得的帖子信息，保留正在编辑的原因。 */
  async function restoreDetails() {
    const items = examples();
    if (
      toggle.getAttribute("aria-expanded") !== "true" ||
      !items.some((item) => !item.post || !item.details)
    ) return;
    let records;
    try {
      records = await loadHistory();
    } catch {
      return;
    }
    if (items !== examples()) return;
    const byId = new Map(), byTopic = new Map();
    for (const record of records) {
      const key = record.topicId + ":" + record.id;
      if (!byTopic.has(key)) byTopic.set(key, record);
      if (!byId.has(record.id)) byId.set(record.id, record);
    }
    let changed = false;
    for (const [index, row] of Array.from(rows.children).entries()) {
      const item = items[index];
      if (!item || item.post && item.details) continue;
      const post = item.topicId ? byTopic.get(item.topicId + ":" + item.id) : byId.get(item.id);
      if (!post?.post) continue;
      if (!item.post) {
        item.post = post.post;
        if (post.body !== post.post.body) item.body = post.body;
        else delete item.body;
      }
      item.details ??= post.details;
      fill(row, item);
      changed = true;
    }
    if (changed) {
      globalThis.__matchTableRelativeTimeUpdate?.();
      save();
    }
  }
  new MutationObserver(restoreDetails).observe(toggle, {
    attributes: true,
    attributeFilter: ["aria-expanded"],
  });
  /** 收起历史并作废尚在进行的打开请求。 */
  function close() {
    revision++;
    panel.hidden = true;
    picked.clear();
    for (const button of root.querySelectorAll("[data-example-picker]")) {
      button.setAttribute("aria-expanded", "false");
    }
  }
  /**
   * 打开卡片内的历史选择表。
   * @param {HTMLButtonElement} button 触发按钮。
   */
  async function open(button) {
    opener = button;
    const current = ++revision;
    for (const trigger of root.querySelectorAll("[data-example-picker]")) {
      trigger.setAttribute("aria-expanded", "true");
    }
    history = [];
    picked.clear();
    panel.hidden = false;
    allTopics.checked = false;
    search.value = "";
    filter();
    status.textContent = "…";
    search.focus();
    try {
      const records = await loadHistory();
      if (current !== revision) return;
      history = records;
      filter();
    } catch {
      if (current === revision) status.textContent = labels.error;
    }
  }
  root.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-example-picker]");
    if (trigger) {
      if (panel.hidden) open(trigger);
      else close();
      return;
    }
    const remove = event.target.closest("[data-example-delete]");
    if (!remove) return;
    const row = remove.closest("[data-post]");
    const ids = row ? new Set([row.dataset.post]) : new Set(marked);
    const items = examples();
    for (let i = items.length - 1; i >= 0; i--) {
      if (ids.has(items[i].id)) {
        marked.delete(items[i].id);
        items.splice(i, 1);
      }
    }
    render();
    if (!panel.hidden) showPage();
    save();
    gridPicker.focus();
  });
  add.addEventListener("click", () => {
    const items = examples(), saved = new Set(items.map((v) => v.id));
    const notes = new Map(topics().map((t) => [t.id, t.note]));
    let first;
    for (const [id, post] of picked) {
      if (!post || saved.has(id)) continue;
      items.push({
        id,
        addedAt: Date.now(),
        url: post.url,
        title: post.title,
        topicId: post.topicId,
        topicNote: notes.get(post.topicId) || "",
        ...(post.body !== post.post?.body ? { body: post.body } : {}),
        details: post.details,
        ...(post.post ? { post: post.post } : {}),
        reason: "",
      });
      first ??= id;
      saved.add(id);
    }
    close();
    render();
    save();
    const row = [...rows.children].find((r) => r.dataset.post === first);
    (row?.querySelector("[data-example-reason]") || opener)?.focus();
  });
  bindSelection(rows, marked);
  bindSelection(results, picked);
  results.addEventListener("click", (event) => {
    if (event.target.closest("label, input")) return;
    const row = event.target.closest("tr[data-post]");
    if (!row || row.querySelector("[data-row-check]").disabled) return;
    const id = row.dataset.post;
    if (picked.has(id)) picked.delete(id);
    else picked.set(id, candidatesById.get(id));
    selectionState(results, picked);
  });
  search.addEventListener("input", filter);
  allTopics.addEventListener("change", filter);
  pageSize.addEventListener("change", () => {
    page = 1;
    showPage();
  });
  root.addEventListener("input", (event) => event.stopPropagation());
  root.addEventListener("change", (event) => event.stopPropagation());
  return {
    /** 切换配置时清除临时选择并恢复独立保存的反例。 */
    restore() {
      close();
      marked.clear();
      history = [];
      render();
      void restoreDetails();
    },
  };
};
