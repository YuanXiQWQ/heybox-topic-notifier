/** @file 生成真实设置页，供两端验证主题色精确输入与本机保存。 */
import { renderSettings } from "../../../../src/views/settings.ts";
import { defaultAppSettingsFromEnv } from "../../../../src/services/default_settings.ts";

const settings = defaultAppSettingsFromEnv();
settings.locale = "zh-CN";
const html = renderSettings({
  account: { id: "theme-test", displayName: "测试", username: "theme-test" },
  csrfToken: "test",
  settings,
});
const probe = Deno.readTextFileSync(
  new URL("theme-settings.js", import.meta.url),
);
console.log(
  html.replace("</body>", `<script type="module">${probe}</script></body>`),
);
