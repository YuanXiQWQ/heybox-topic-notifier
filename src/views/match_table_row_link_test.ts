/**
 * @file 本文件验证命中表格整行帖子跳转资源会被页面布局加载。
 */
import { renderLayout } from "./html.ts";

Deno.test("renderLayout enables the middle match-table cells as one post link area", () => {
  const html = renderLayout({
    body: "<table class=\"match-table\"></table>",
    csrfToken: "test-csrf-token",
    darkMode: false,
    locale: "zh-CN",
    themeColor: "#bd7fff",
    title: "测试",
  });

  assertIncludes(
    html,
    ".match-table tbody tr.match-table-row-link > td:nth-child(n + 2):nth-last-child(n + 2)",
  );
  assertIncludes(html, "row.classList.add(\"match-table-row-link\")");
  assertIncludes(html, "row.dataset.postUrl = postUrl");
  assertIncludes(html, "cell.cellIndex === 0 || cell.cellIndex === lastCellIndex");
  assertIncludes(html, "event.key !== \"Enter\" && event.key !== \" \"");
  assertIncludes(html, "const observer = new MutationObserver");
});

/**
 * 断言字符串包含指定片段。
 *
 * @param actual 实际字符串。
 * @param expected 期望包含的片段。
 */
function assertIncludes(actual: string, expected: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`Expected output to include ${expected}`);
  }
}
