/** @file 编辑当前配置的历史反例，并与分类器共用提示词预览格式。 */
import { counterexamplePrompt } from "./matching-counterexample-prompt.js";

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
  if (!root) return;
  const labels = JSON.parse(
    root.querySelector("[data-example-labels]").dataset.exampleLabels,
  );
  const rows = root.querySelector("[data-example-rows]");
  const picker = root.querySelector("[data-example-picker]");
  const panel = root.querySelector(".example-history");
  const search = root.querySelector("[data-example-search]");
  const all = root.querySelector("[data-example-all]");
  const results = root.querySelector("[data-example-results]");
  const status = root.querySelector("[data-example-status]");
  const draft = root.querySelector("[data-example-draft]");
  const sources = root.querySelector("[data-example-source]");
  const excerpt = root.querySelector("[data-example-excerpt]");
  const reason = root.querySelector("[data-example-reason]");
  const preview = root.querySelector("[data-example-preview]");
  const number = new Intl.NumberFormat(document.documentElement.lang);
  let history = [], candidates = [], pieces = [], revision = 0;

  /** 刷新本配置的反例数量与实际提交给分类器的样本。 */
  function updatePreview() {
    root.querySelector("[data-counterexample-summary]").textContent = number
      .format(examples().length);
    preview.querySelector("pre").textContent = counterexamplePrompt(examples());
    preview.hidden = !examples().length;
  }

  /** 从快照渲染已收录的帖子；原因可直接编辑并随设置自动保存。 */
  function render() {
    rows.textContent = "";
    const notes = new Map(topics().map((t) => [t.id, t.note]));
    for (const item of examples()) {
      const row = document.createElement("article");
      const title = document.createElement(
        /^https?:\/\//i.test(item.url) ? "a" : "strong",
      );
      title.textContent = item.title || item.id;
      if (title.tagName === "A") {
        title.href = item.url;
        title.target = "_blank";
        title.rel = "noopener noreferrer";
      }
      const topic = document.createElement("small");
      topic.textContent = notes.get(item.topicId) || item.topicNote ||
        item.topicId;
      const quote = document.createElement("blockquote");
      quote.textContent = labels[item.source] + " · " + item.excerpt;
      const label = document.createElement("label");
      label.textContent = labels.reason;
      const input = document.createElement("textarea");
      input.rows = 2;
      input.maxLength = 1000;
      input.value = item.reason;
      input.addEventListener("input", () => {
        if (!input.value.trim()) return;
        item.reason = input.value;
        updatePreview();
        save();
      });
      input.addEventListener("blur", () => {
        input.value = item.reason;
      });
      label.append(input);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "text-action-button";
      remove.textContent = labels.remove;
      remove.addEventListener("click", () => {
        examples().splice(examples().indexOf(item), 1);
        render();
        if (!panel.hidden) filter();
        save();
        picker.focus();
      });
      row.append(title, topic, quote, label, remove);
      rows.append(row);
    }
    updatePreview();
  }

  /** 按配置的话题归属、帖子标题、ID 和话题备注筛选历史。 */
  function filter() {
    const byTopic = new Map(topics().map((t) => [t.id, t]));
    const selected = new Set(examples().map((item) => item.id));
    const query = search.value.trim().toLocaleLowerCase();
    const unique = new Map();
    for (const post of history) {
      const topic = byTopic.get(post.topicId);
      if (!all.checked && !topic?.assigned) continue;
      if (
        ![post.title, post.id, topic?.note, post.topicId].some((v) =>
          String(v || "").toLocaleLowerCase().includes(query)
        )
      ) continue;
      if (!unique.has(post.id)) unique.set(post.id, post);
    }
    candidates = [...unique.values()];
    results.textContent = "";
    for (const post of candidates) {
      const note = byTopic.get(post.topicId)?.note || post.topicId;
      const option = new Option(
        (selected.has(post.id) ? "✓ " : "") +
          (post.title || post.id) + " · " + note,
        post.id,
      );
      option.disabled = selected.has(post.id);
      results.add(option);
    }
    results.selectedIndex = -1;
    draft.hidden = true;
    status.textContent = candidates.length ? "" : labels.empty;
  }

  /** 选择原帖正文、具体评论或回复，可在摘录框中继续精简。 */
  function choosePost() {
    const post = candidates[results.selectedIndex];
    if (!post) return;
    pieces = [
      ["title", post.title],
      ["body", post.body],
      ...(post.comments || []).map((text) => ["comments", text]),
      ...(post.replies || []).map((text) => ["replies", text]),
    ].filter(([, text]) => text);
    sources.textContent = "";
    const counts = {};
    pieces.forEach(([kind, text], i) => {
      counts[kind] = (counts[kind] || 0) + 1;
      const detail = ["comments", "replies"].includes(kind)
        ? " " + number.format(counts[kind]) + " · " + text.slice(0, 50)
        : "";
      sources.add(new Option(labels[kind] + detail, String(i)));
    });
    const preferred = pieces.findIndex(([kind]) =>
      kind === (post.location === "excerpt" ? "body" : post.location)
    );
    sources.selectedIndex = preferred >= 0
      ? preferred
      : Math.max(0, pieces.findIndex(([kind]) => kind === "body"));
    excerpt.value = pieces[sources.selectedIndex]?.[1] || "";
    reason.value = "";
    draft.hidden = false;
  }

  /** 关闭选择器并使未完成的历史请求失效。 */
  function close() {
    revision++;
    panel.hidden = draft.hidden = true;
    picker.setAttribute("aria-expanded", "false");
  }

  /** 按需读取账号历史，断网时使用该账号最近成功读取的加密快照。 */
  async function open() {
    const current = ++revision;
    const user = document.body.dataset.appUserId;
    const store = globalThis.AppLocalStore;
    picker.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    history = [];
    search.value = "";
    all.checked = false;
    filter();
    status.textContent = "…";
    search.focus();
    try {
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
      if (current !== revision) return;
      history = records;
      filter();
    } catch {
      if (current === revision) status.textContent = labels.error;
    }
  }
  picker.addEventListener("click", () => panel.hidden ? open() : close());
  search.addEventListener("input", filter);
  all.addEventListener("change", filter);
  results.addEventListener("change", choosePost);
  sources.addEventListener("change", () => {
    excerpt.value = pieces[sources.selectedIndex][1];
  });
  root.querySelector("[data-example-add]").addEventListener("click", () => {
    const post = candidates[results.selectedIndex];
    if (!post || examples().some((item) => item.id === post.id)) return;
    const text =
      (excerpt.value.slice(excerpt.selectionStart, excerpt.selectionEnd) ||
        excerpt.value).trim();
    for (
      const [field, valid, message] of [[
        reason,
        reason.value.trim(),
        labels.reason,
      ], [excerpt, text && text.length <= 2000, labels.excerptHint]]
    ) {
      if (!valid) {
        field.setCustomValidity(message);
        field.reportValidity();
        field.setCustomValidity("");
        return;
      }
    }
    const topic = topics().find((t) => t.id === post.topicId);
    examples().push({
      addedAt: Date.now(),
      id: post.id,
      title: post.title,
      topicId: post.topicId,
      topicNote: topic?.note || "",
      url: post.url,
      source: pieces[sources.selectedIndex]?.[0] || "title",
      excerpt: text,
      reason: reason.value.trim(),
    });
    close();
    render();
    save();
    picker.focus();
  });
  root.addEventListener("input", (event) => event.stopPropagation());
  root.addEventListener("change", (event) => event.stopPropagation());
  return {
    /** 切换配置时清除未提交的选择并恢复该配置保存的反例。 */
    restore() {
      close();
      render();
    },
  };
};
