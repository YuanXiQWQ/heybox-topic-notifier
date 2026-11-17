/** @file 生成实际设置页，供两端验证疫医演出复用真实显示名称字段。 */
import { renderSettings } from "../../../../src/views/settings.ts";
import { defaultAppSettingsFromEnv } from "../../../../src/services/default_settings.ts";

const settings = defaultAppSettingsFromEnv();
settings.locale = "zh-CN";
const html = renderSettings({
  account: { id: "advent-test", displayName: "原始显示名称", username: "advent-test" },
  csrfToken: "test",
  settings,
});
const probe = Deno.readTextFileSync(new URL("advent-focus.js", import.meta.url));
console.log(html.replace("</body>", `<script type="module">${probe}</script></body>`));
