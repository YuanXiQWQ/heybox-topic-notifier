/** @file 为桌面和 Android 的真实设置页生成多配置交互回归场景。 */
import { renderSettings } from "../../../../src/views/settings.ts";
import { defaultAppSettingsFromEnv } from "../../../../src/services/default_settings.ts";

/** 回归页面使用固定话题、账号和语言。 */
const settings = defaultAppSettingsFromEnv();
settings.locale = "zh-CN";
settings.matching!.counterexamples = [{
  id: "10-post",
  topicId: "10",
  topicNote: "社区十",
  url: "",
  title: "通关回顾",
  source: "comments",
  excerpt: "当时卡住了",
  reason: "作者在回顾经历",
  addedAt: 1,
}];
settings.topics = [{
  id: "10",
  note: "社区十",
  enabled: true,
  keywordRules: [],
}, { id: "2", note: "", enabled: true, keywordRules: [] }];
/** 实际页面及与设备共用的交互探针。 */
const page = renderSettings({
  settings,
  csrfToken: "test",
  account: {
    id: "profile-test",
    username: "profile-test",
    displayName: "配置测试",
  },
});
/** 仅在测试页面执行的控件操作。 */
const probe = Deno.readTextFileSync(
  new URL("matching-profiles.js", import.meta.url),
);
console.log(
  page.replace("</body>", `<script type="module">${probe}</script></body>`),
);
