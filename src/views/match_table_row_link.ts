/**
 * @file 本文件提供命中表格中间内容区域的整行帖子跳转样式与交互。
 */

/**
 * 渲染命中表格整行帖子跳转样式。
 *
 * @return 命中表格整行帖子跳转样式标签。
 */
export function renderMatchTableRowLinkStyle(): string {
  return `<style>
    .match-table tbody tr.match-table-row-link > td:nth-child(n + 2):nth-last-child(n + 2) {
      cursor: pointer;
      transition: background-color 160ms ease;
    }

    .match-table tbody tr.match-table-row-link:has(> td:nth-child(n + 2):nth-last-child(n + 2):hover)
      > td:nth-child(n + 2):nth-last-child(n + 2),
    .match-table tbody tr.match-table-row-link:has(> td:nth-child(n + 2):nth-last-child(n + 2):focus-within)
      > td:nth-child(n + 2):nth-last-child(n + 2),
    .match-table tbody tr.match-table-row-link:focus-visible
      > td:nth-child(n + 2):nth-last-child(n + 2) {
      background: var(--theme-soft-strong);
    }

    .match-table tbody tr.match-table-row-link:has(> td:nth-child(n + 2):nth-last-child(n + 2):active)
      > td:nth-child(n + 2):nth-last-child(n + 2) {
      background: color-mix(in srgb, var(--theme-color) 20%, var(--surface));
    }

    .match-table tbody tr.match-table-row-link:focus-visible {
      outline: none;
    }

    .match-table tbody tr.match-table-row-link:focus-visible > td:nth-child(n + 2):nth-last-child(n + 2) {
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

    .match-table tbody tr.match-table-row-link:focus-visible > td:nth-last-child(2) {
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
 * @return 命中表格整行帖子跳转脚本标签。
 */
export function renderMatchTableRowLinkScript(): string {
  return `<script>
    (() => {
      const rowSelector = ".match-table tbody tr";
      const initializedAttribute = "data-post-link-initialized";

      const validPostUrl = (rawUrl) => {
        try {
          const url = new URL(rawUrl, window.location.href);
          return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
        } catch {
          return "";
        }
      };

      const initializeRow = (row) => {
        if (!(row instanceof HTMLTableRowElement) || row.hasAttribute(initializedAttribute)) {
          return;
        }

        const titleCell = row.cells.item(1);
        const titleLink = titleCell?.querySelector("a[href]");
        if (!(titleLink instanceof HTMLAnchorElement)) {
          return;
        }

        const postUrl = validPostUrl(titleLink.href);
        if (!postUrl) {
          return;
        }

        const title = titleLink.textContent?.trim() ?? "";
        const content = row.cells.item(2)?.textContent?.trim() ?? "";
        row.setAttribute(initializedAttribute, "true");
        row.classList.add("match-table-row-link");
        row.dataset.postUrl = postUrl;
        row.tabIndex = 0;
        row.setAttribute("role", "link");
        row.setAttribute("aria-label", title || content || postUrl);
      };

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
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const row = target.closest("tr.match-table-row-link");
        const cell = target.closest("td");
        if (
          !(row instanceof HTMLTableRowElement) ||
          !(cell instanceof HTMLTableCellElement) ||
          cell.parentElement !== row
        ) {
          return;
        }

        const lastCellIndex = row.cells.length - 1;
        if (cell.cellIndex === 0 || cell.cellIndex === lastCellIndex) {
          return;
        }

        if (target.closest("a, button, input, label, select, textarea")) {
          return;
        }

        if (selectionTouchesRow(row)) {
          return;
        }

        openPost(row);
      });

      document.addEventListener("keydown", (event) => {
        const row = event.target;
        if (!(row instanceof HTMLTableRowElement) || !row.matches("tr.match-table-row-link")) {
          return;
        }

        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

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
