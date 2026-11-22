/**
 * @file 本文件提供命中表格中间内容区域的整行帖子跳转样式与交互。
 */

/**
 * 渲染命中表格整行帖子跳转样式。
 *
 * @return {string} 命中表格和反例表共用的帖子跳转样式标签。
 */
export function renderMatchTableRowLinkStyle(): string {
  return `<style>
    .match-table-title-text {
      color: var(--theme-link);
    }

    .match-table-row-link > [data-post-link-cell] {
      cursor: pointer;
      transition: background-color 160ms ease;
    }

    :root[data-hover-input] .match-table-row-link:has(> [data-post-link-cell]:hover) > [data-post-link-cell],
    .match-table-row-link:has(> [data-post-link-cell] :focus-visible) > [data-post-link-cell],
    .match-table-row-link:focus-visible > [data-post-link-cell] {
      background: var(--theme-soft-strong);
    }

    .match-table-row-link:has(> [data-post-link-cell]:active) > [data-post-link-cell] {
      background: color-mix(in srgb, var(--theme-color) 20%, var(--surface));
    }

    .match-table tbody tr.match-table-row-link:focus-visible {
      outline: none;
    }

    .match-table tbody tr.match-table-row-link:focus-visible > [data-post-link-cell] {
      box-shadow:
        inset 0 2px 0 var(--theme-strong),
        inset 0 -2px 0 var(--theme-strong);
    }

    .match-table tbody tr.match-table-row-link:focus-visible > td:nth-child(2) {
      box-shadow:
        inset 2px 0 0 var(--theme-strong),
        inset 0 2px 0 var(--theme-strong),
        inset 0 -2px 0 var(--theme-strong);
    }

    .match-table tbody tr.match-table-row-link:focus-visible > [data-post-link-cell]:has(+ .table-action-cell) {
      box-shadow:
        inset -2px 0 0 var(--theme-strong),
        inset 0 2px 0 var(--theme-strong),
        inset 0 -2px 0 var(--theme-strong);
    }
  </style>`;
}

/**
 * 渲染命中表格整行帖子跳转交互脚本。
 *
 * @return {string} 命中表格和反例表共用的帖子跳转脚本标签。
 */
export function renderMatchTableRowLinkScript(): string {
  return `<script>
    (() => {
      const rowSelector = ".match-table tbody:not([data-example-rows]):not([data-example-results]) tr";
      const initializedAttribute = "data-post-link-initialized";

      const validPostUrl = (rawUrl) => {
        if (!rawUrl) return "";
        try {
          const url = new URL(rawUrl, window.location.href);
          return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
        } catch {
          return "";
        }
      };

      const replaceTitleLink = (titleLink) => {
        const titleText = document.createElement("span");
        titleText.className = [titleLink.className, "match-table-title-text"]
          .filter(Boolean)
          .join(" ");
        titleText.textContent = titleLink.textContent ?? "";
        titleLink.replaceWith(titleText);
        return titleText;
      };

      /**
       * 标记命中表的帖子阅读区域，并为有原帖链接的行绑定跳转信息。
       * @param {Element} row 实时渲染或从离线快照恢复的记录行。
       */
      const initializeRow = (row) => {
        if (!(row instanceof HTMLTableRowElement)) return;
        for (const cell of Array.from(row.cells).slice(1, 4)) {
          cell.setAttribute("data-post-link-cell", "");
        }
        if (row.hasAttribute(initializedAttribute)) return;

        const titleCell = row.cells.item(1);
        const titleLink = titleCell?.querySelector("a[href]");
        if (!(titleLink instanceof HTMLAnchorElement)) {
          return;
        }

        const postUrl = validPostUrl(titleLink.href);
        if (!postUrl) {
          return;
        }

        const titleText = replaceTitleLink(titleLink);
        const title = titleText.textContent?.trim() ?? "";
        const content = row.cells.item(2)?.textContent?.trim() ?? "";
        row.setAttribute(initializedAttribute, "true");
        row.classList.add("match-table-row-link");
        row.dataset.postUrl = postUrl;
        row.tabIndex = 0;
        row.setAttribute("role", "link");
        row.setAttribute("aria-label", title || content || postUrl);
      };

      /**
       * 初始化文档或新插入元素中的可点击行。
       * @param {Document|Element} [root] 待扫描的文档或子树。
       */
      const initializeRows = (root = document) => {
        if (root instanceof Element && root.matches(rowSelector)) {
          initializeRow(root);
        }

        for (const row of root.querySelectorAll?.(rowSelector) ?? []) {
          initializeRow(row);
        }
      };

      const selectionTouchesRow = (row) => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          return false;
        }

        const anchorNode = selection.anchorNode;
        const focusNode = selection.focusNode;
        return Boolean(
          (anchorNode && row.contains(anchorNode)) ||
            (focusNode && row.contains(focusNode)),
        );
      };

      const openPost = (row) => {
        const postUrl = validPostUrl(row.dataset.postUrl ?? "");
        if (!postUrl) {
          return;
        }

        const openedWindow = window.open(postUrl, "_blank", "noopener,noreferrer");
        if (openedWindow) {
          openedWindow.opener = null;
        }
      };

      document.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const cell = target.closest("[data-post-link-cell]");
        const row = cell?.parentElement;
        if (!row?.classList.contains("match-table-row-link")) {
          return;
        }

        const control = target.closest("a, button, input, label, select, textarea");
        if (control) {
          if (!control.matches("a[data-example-title][href]") ||
              event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
        }

        if (selectionTouchesRow(row)) {
          return;
        }

        openPost(row);
      });

      document.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        const target = event.target;
        if (!(target instanceof Element)) return;
        const row = target.closest(".match-table-row-link");
        if (!row || target !== row && !(target.matches("a[data-example-title][href]") && event.key === " ")) return;
        event.preventDefault();
        openPost(row);
      });

      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof Element) {
              initializeRows(node);
            }
          }
        }
      });

      const start = () => {
        initializeRows();
        observer.observe(document.documentElement, { childList: true, subtree: true });
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
      } else {
        start();
      }
    })();
  </script>`;
}
