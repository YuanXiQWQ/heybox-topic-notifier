/**
 * @file 本文件验证 404 页面的渲染与本地化。
 */
import { assert, assertEquals } from "../test_helpers.ts";
import { getMessages } from "../locales/index.ts";
import type { Locale } from "../locales/types.ts";
import type { AppSettings } from "../models.ts";
import { renderNotFound } from "./not_found.ts";

/** 测试页面使用的 CSRF 令牌。 */
const testCsrfToken = "csrf-test-token";

Deno.test("renderNotFound keeps the app shell and the 404 marker", () => {
  const messages = getMessages("zh-CN");
  const html = renderNotFound({
    csrfToken: testCsrfToken,
    settings: settings("zh-CN"),
  });

  // 沿用普通页面的外壳与样式，只替换主内容。
  assert(html.includes('class="topbar"'));
  assert(html.includes('class="primary-nav"'));
  assert(html.includes('class="not-found"'));
  assert(html.includes('<p class="not-found-code">404</p>'));
  assert(html.includes(`<h1>${messages.notFoundTitle}</h1>`));
  assert(
    html.includes(
      `<p class="not-found-description">${messages.notFoundDescription}</p>`,
    ),
  );
  assert(
    html.includes(
      `<button type="submit">${messages.notFoundAction}</button>`,
    ),
  );
  assert(html.includes('<form method="get" action="/">'));
  assertEquals(html.includes(`<title>${messages.notFoundTitle}`), true);
});

Deno.test("renderNotFound localizes the page and keeps the account menu", () => {
  const messages = getMessages("en-US");
  const html = renderNotFound({
    account: { displayName: "Tester", id: "user-1", username: "tester" },
    csrfToken: testCsrfToken,
    settings: settings("en-US"),
  });

  assert(html.includes('lang="en-US"'));
  assert(html.includes(`<h1>${messages.notFoundTitle}</h1>`));
  assert(html.includes(`<p class="not-found-code">404</p>`));
  assertEquals(messages.notFoundTitle, "Page not found");
  // 已登录访客仍然能看到账户菜单，可以从 404 页面回到正常流程。
  assert(html.includes('class="nav-account-menu"'));
});

/**
 * 创建测试使用的应用设置。
 *
 * @param locale 页面语言。
 * @return 应用设置。
 */
function settings(locale: Locale): AppSettings {
  return {
    activeKeywordTarget: "common",
    commonKeywordRules: [],
    darkMode: true,
    locale,
    notificationEmailAddress: "",
    notificationEmailApiToken: "",
    notificationEmailApiUrl: "",
    notificationEmailFrom: "",
    notificationEmailService: "smtp",
    notificationProvider: "disabled",
    notificationPushPlusToken: "",
    notificationServerChanSendKey: "",
    notificationSmtpHost: "",
    notificationSmtpPassword: "",
    notificationSmtpPort: 465,
    notificationSmtpSecure: true,
    notificationSmtpUsername: "",
    notificationWebhookService: "custom",
    notificationWebhookUrl: "",
    notificationWxPusherSpt: "",
    polling: {
      enabled: false,
      intervalUnit: "minute",
      intervalValue: 1,
      postLimit: 20,
      sort: "publishTime",
    },
    themeColor: "#bd7fff",
    topics: [],
  };
}
