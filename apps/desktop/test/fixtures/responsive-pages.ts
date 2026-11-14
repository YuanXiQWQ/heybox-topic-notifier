/** @file 为真实浏览器交互测试生成生产布局与记录表格，不连接账号或业务服务器。 */
import { renderLayout } from "../../../../src/views/html.ts";
import { renderMatchRecordsSection } from "../../../../src/views/match_table_view.ts";
import { getMessages } from "../../../../src/locales/index.ts";
import type { MatchRecord } from "../../../../src/models.ts";

/** 本机测试账号及记录使用固定标识，便于断言离线重放。 */
const account = { id: "responsive-test", displayName: "交互测试", username: "test" };
/** 各种服务器记录状态对应的真实页面。 */
const pages: Record<string, string> = {};
for (const path of ["/", "/history", "/settings", "/about"]) {
  for (const state of ["workspace", "history", "deleted"]) {
    const records: MatchRecord[] = state === "deleted" || path === "/" && state === "history" ? [] : [{
      id: "one", keyword: "求助", location: "title", matchedAt: new Date().toISOString(),
      completedAt: state === "history" ? new Date().toISOString() : undefined,
      post: {id: "one", title: "游戏无法启动，需要帮助", body: "启动游戏后没有反应", excerpt: "", comments: [], commentReplies: [], publishedAt: new Date().toISOString(), url: "https://example.com/one"},
    }];
    const messages = getMessages("zh-CN");
    const body = renderMatchRecordsSection({
      action: {bulkButtonAttribute: "data-test-bulk", emptySelectionMessage: "请选择记录", icon: "✓", label: "移动", rowCheckboxAttribute: "data-test-row", selectAllAttribute: "data-test-all"},
      csrfToken: "test", emptyMessage: "暂无记录", filterToggleId: "filter", formAction: path === "/" ? "/matches/complete" : "/matches/delete",
      heading: "帖子", headingId: "posts", locale: "zh-CN", messages, path,
      allowRestore: path === "/history",
      table: {records, totalRecords: records.length, totalPages: 1, page: 1, pageSize: "all", range: "all", from: "", to: ""},
    });
    pages[path + ":" + state] = renderLayout({account, body, csrfToken: "test", darkMode: false, locale: "zh-CN", themeColor: "#bd7fff", title: "交互测试", disableEasterEggs: true});
  }
}
console.log(JSON.stringify(pages));
