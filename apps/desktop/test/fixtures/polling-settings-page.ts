/** @file 生成真实分时段设置页，验证原生选择控件、日期换算与卡片操作。 */
import { renderSettings } from "../../../../src/views/settings.ts";
import { defaultAppSettingsFromEnv } from "../../../../src/services/default_settings.ts";

const settings = defaultAppSettingsFromEnv();
settings.locale = "zh-CN";
settings.polling.schedule = {
  enabled: false,
  timeZone: "UTC",
  rows: [
    {
      id: "first",
      edited: true,
      calendar: "gregory",
      era: "ce",
      start: "10:00",
      end: "21:00",
      intervalValue: "30",
      intervalUnit: "minute",
      postLimit: "10",
      sort: "publishTime",
    },
    {
      id: "second",
      edited: true,
      calendar: "gregory",
      era: "ce",
      start: "21:00",
      end: "23:00",
      intervalValue: "1",
      intervalUnit: "hour",
      postLimit: "20",
      sort: "replyTime",
    },
  ],
};
const html = renderSettings({
  account: {
    id: "schedule-test",
    displayName: "测试",
    username: "schedule-test",
  },
  csrfToken: "test",
  settings,
});
const probe = Deno.readTextFileSync(
  new URL("polling-settings.js", import.meta.url),
);
console.log(
  html.replace(
    "</head>",
    '<script>history.replaceState(null,"","/settings?panel=polling");</script></head>',
  )
    .replace("</body>", `<script type="module">${probe}</script></body>`),
);
