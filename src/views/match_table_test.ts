/**
 * @file 本文件验证命中记录表格查询、分页和页面渲染行为。
 */
import { getMessages } from "../locales/index.ts";
import type { AppSettings, MatchRecord } from "../models.ts";
import { renderHistory } from "./history.ts";
import {
  applyMatchTableQuery,
  compactPages,
  parseMatchTableQuery,
} from "./match_table.ts";
import type { MatchTableResult } from "./match_table.ts";
import { renderMatchRecordsSection } from "./match_table_view.ts";
import { renderSettings } from "./settings.ts";

/**
 * 视图测试使用的固定 CSRF 令牌。
 */
const testCsrfToken = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

Deno.test("parseMatchTableQuery normalizes unsupported values", () => {
  const query = parseMatchTableQuery(
    new URLSearchParams("range=bad&page=-1&pageSize=777"),
  );

  assertEquals(query, {
    from: "",
    page: 1,
    pageSize: 10,
    range: "all",
    to: "",
  });
});

Deno.test("applyMatchTableQuery filters by recent matched time and paginates", () => {
  const now = new Date("2026-06-30T12:00:00.000Z");
  const result = applyMatchTableQuery([
    record("1", "2026-06-30T11:59:00.000Z"),
    record("2", "2026-06-30T10:00:00.000Z"),
    record("3", "2026-06-30T11:30:00.000Z"),
  ], {
    from: "",
    page: 1,
    pageSize: 1,
    range: "hour",
    to: "",
  }, now);

  assertEquals(result.records.map((item) => item.id), ["1"]);
  assertEquals(result.totalRecords, 2);
  assertEquals(result.totalPages, 2);
});

Deno.test("applyMatchTableQuery supports custom China-time range", () => {
  const result = applyMatchTableQuery([
    record("inside", "2026-06-30T06:30:00.000Z"),
    record("outside", "2026-06-30T08:30:00.000Z"),
  ], {
    from: "2026-06-30T14:00",
    page: 1,
    pageSize: "all",
    range: "custom",
    to: "2026-06-30T15:00",
  });

  assertEquals(result.records.map((item) => item.id), ["inside"]);
});

Deno.test("compactPages keeps edges and current page vicinity", () => {
  assertEquals(compactPages(8, 20), [1, 2, 3, "...", 7, 8, 9, "...", 19, 20]);
});

Deno.test("renderMatchRecordsSection opens post title links in a new tab", () => {
  const html = renderMatchRecordsSection({
    action: {
      bulkButtonAttribute: "data-test-bulk",
      emptySelectionMessage: "empty",
      icon: "",
      label: "complete",
      rowCheckboxAttribute: "data-test-row",
      selectAllAttribute: "data-test-all",
    },
    csrfToken: testCsrfToken,
    emptyMessage: "empty",
    filterToggleId: "test-filter",
    formAction: "/matches/complete",
    heading: "heading",
    headingId: "heading-id",
    locale: "zh-CN",
    messages: getMessages("zh-CN"),
    path: "/",
    table: table([record("title-link", "2026-06-30T12:00:00.000Z")]),
    titleLinkClass: "pending-title-link",
  });

  assertIncludes(
    html,
    `<a class="match-table-title-link pending-title-link" href="https://example.com/title-link" target="_blank" rel="noopener noreferrer">title-link</a>`,
  );
  assertIncludes(
    html,
    `<input type="hidden" name="csrfToken" value="${testCsrfToken}">`,
  );
});

Deno.test("renderMatchRecordsSection repairs stored rich-content JSON", () => {
  const match = record("rich-content", "2026-06-30T12:00:00.000Z");
  match.post.body = JSON.stringify([
    { text: "可见正文", type: "text" },
    { text: "/storage/emulated/0/image.jpg", type: "img" },
  ]);
  const html = renderMatchRecordsSection({
    action: {
      bulkButtonAttribute: "data-test-bulk",
      emptySelectionMessage: "empty",
      icon: "",
      label: "complete",
      rowCheckboxAttribute: "data-test-row",
      selectAllAttribute: "data-test-all",
    },
    csrfToken: testCsrfToken,
    emptyMessage: "empty",
    filterToggleId: "test-filter",
    formAction: "/matches/complete",
    heading: "heading",
    headingId: "heading-id",
    locale: "zh-CN",
    messages: getMessages("zh-CN"),
    path: "/",
    table: table([match]),
  });

  assertIncludes(html, '<span class="table-clip">可见正文</span>');
  assertNotIncludes(html, "storage/emulated");
  assertNotIncludes(html, "&quot;type&quot;");
});

Deno.test("renderMatchRecordsSection marks timestamps for live relative updates", () => {
  const match = record("relative-time", "2026-06-30T12:05:00.000Z");
  match.post.publishedAt = "2026-06-30T12:00:00.000Z";
  const html = renderMatchRecordsSection({
    action: {
      bulkButtonAttribute: "data-test-bulk",
      emptySelectionMessage: "empty",
      icon: "",
      label: "complete",
      rowCheckboxAttribute: "data-test-row",
      selectAllAttribute: "data-test-all",
    },
    csrfToken: testCsrfToken,
    emptyMessage: "empty",
    filterToggleId: "test-filter",
    formAction: "/matches/complete",
    heading: "heading",
    headingId: "heading-id",
    locale: "zh-CN",
    messages: getMessages("zh-CN"),
    path: "/",
    table: table([match]),
    titleLinkClass: "pending-title-link",
  });

  assertIncludes(html, `data-relative-time="2026-06-30T12:00:00.000Z"`);
  assertIncludes(html, `data-relative-time="2026-06-30T12:05:00.000Z"`);
  assertIncludes(html, `const updateKey = '__matchTableRelativeTimeUpdate';`);
  assertIncludes(html, `window[updateKey] = updateRelativeTimes;`);
});

Deno.test("renderMatchRecordsSection refreshes table actions without page navigation", () => {
  const html = renderMatchRecordsSection({
    action: {
      bulkButtonAttribute: "data-test-bulk",
      emptySelectionMessage: "empty",
      icon: "",
      label: "complete",
      rowCheckboxAttribute: "data-test-row",
      selectAllAttribute: "data-test-all",
    },
    csrfToken: testCsrfToken,
    emptyMessage: "empty",
    filterToggleId: "test-filter",
    formAction: "/matches/complete",
    heading: "heading",
    headingId: "heading-id",
    locale: "zh-CN",
    messages: getMessages("zh-CN"),
    path: "/",
    table: table([record("scroll-row", "2026-06-30T12:00:00.000Z")]),
    titleLinkClass: "pending-title-link",
  });

  assertIncludes(html, `data-match-table-section="heading-id"`);
  assertIncludes(html, `data-match-table-form`);
  assertIncludes(
    html,
    `const installedKey = "__matchTableActionScriptInstalled";`,
  );
  assertIncludes(html, `event.preventDefault();`);
  assertIncludes(html, `const response = await fetch(form.action, {`);
  assertIncludes(html, `headers: { "x-match-table-refresh": "1" },`);
  assertIncludes(html, `formData.append(submitter.name, submitter.value);`);
  assertIncludes(html, `currentSection.replaceWith(nextSection);`);
  assertIncludes(html, `window["__matchTableFilterInit"]?.();`);
  assertNotIncludes(html, `sessionStorage`);
  assertNotIncludes(html, `scrollTo`);
});

Deno.test("renderMatchRecordsSection folds match metadata into one details column", () => {
  const match = record("detail-row", "2026-06-30T12:00:00.000Z");
  const html = renderMatchRecordsSection({
    action: {
      bulkButtonAttribute: "data-test-bulk",
      emptySelectionMessage: "empty",
      icon: "",
      label: "complete",
      rowCheckboxAttribute: "data-test-row",
      selectAllAttribute: "data-test-all",
    },
    csrfToken: testCsrfToken,
    emptyMessage: "empty",
    filterToggleId: "test-filter",
    formAction: "/matches/complete",
    heading: "heading",
    headingId: "heading-id",
    locale: "zh-CN",
    messages: getMessages("zh-CN"),
    path: "/",
    table: table([match]),
    titleLinkClass: "pending-title-link",
  });

  assertIncludes(html, "<th>详细信息</th>");
  assertIncludes(html, "<dt>发布：</dt>");
  assertIncludes(html, "<dt>命中：</dt>");
  assertIncludes(html, "<dt>关键词：</dt>");
  assertIncludes(html, "<dt>位置：</dt>");
  assertNotIncludes(html, "<th>发帖时间</th>");
  assertNotIncludes(html, "<th>命中时间</th>");
  assertNotIncludes(html, "<th>命中关键词</th>");
  assertNotIncludes(html, "<th>匹配位置</th>");
});

Deno.test("renderHistory keeps history post titles emphasized", () => {
  const html = renderHistory({
    csrfToken: testCsrfToken,
    historyTable: table([record("history-link", "2026-06-30T12:00:00.000Z")]),
    settings: settings(),
  });

  assertIncludes(
    html,
    `<a class="match-table-title-link pending-title-link" href="https://example.com/history-link" target="_blank" rel="noopener noreferrer">history-link</a>`,
  );
});

Deno.test("settings and history pages keep the app tab title", () => {
  const appSettings = settings();
  const historyHtml = renderHistory({
    csrfToken: testCsrfToken,
    historyTable: table([]),
    settings: appSettings,
  });
  const settingsHtml = renderSettings({
    csrfToken: testCsrfToken,
    settings: appSettings,
  });

  assertIncludes(historyHtml, "<title>小黑盒话题提醒</title>");
  assertIncludes(settingsHtml, "<title>小黑盒话题提醒</title>");
  assertIncludes(historyHtml, "<h1>命中历史</h1>");
  assertIncludes(settingsHtml, "<h1>设置</h1>");
});

Deno.test("settings page loads the latest settings interactions", () => {
  const html = renderSettings({
    csrfToken: testCsrfToken,
    settings: settings(),
  });

  assertIncludes(
    html,
    `/static/settings.js?v=20260903-transient-status`,
  );
});

Deno.test("renderSettings marks navigation and locale controls with icons", () => {
  const html = renderSettings({
    csrfToken: testCsrfToken,
    settings: settings(),
  });

  assertIncludes(html, `<form class="nav-item" method="get" action="/">`);
  assertIncludes(
    html,
    `<form class="nav-item" method="get" action="/settings">`,
  );
  assertIncludes(
    html,
    `<form class="nav-item" method="get" action="/history">`,
  );
  assertIncludes(
    html,
    `<button class="nav-link-button" type="submit"><svg class="nav-icon"`,
  );
  assertIncludes(html, `class="settings-label-with-icon"`);
  assertIncludes(html, `class="settings-label-icon"`);
  assertIncludes(html, `viewBox="0 -960 960 960"`);
  assertIncludes(html, `d="m476-80`);
  assertNotIncludes(html, `<dt>`);
});

Deno.test("renderSettings keeps settings row actions compact", () => {
  const html = renderSettings({
    account: {
      emailVerified: false,
      primaryEmail: undefined,
      username: "alice",
    },
    csrfToken: testCsrfToken,
    secondFactorMethods: [],
    securitySettings: {
      preferredSecondFactor: undefined,
      twoFactorEnabled: false,
      userId: "user-1",
    },
    settings: settings(),
  });

  assertIncludes(html, `data-account-mode="username"`);
  assertIncludes(html, `data-account-mode-trigger="password"`);
  assertIncludes(html, `aria-label="修改用户名"`);
  assertIncludes(html, `aria-label="修改密码"`);
  assertIncludes(html, `data-tooltip="修改用户名"`);
  assertIncludes(html, `data-tooltip="修改密码"`);
  assertIncludes(html, `class="settings-row-switch-cell"`);
  assertIncludes(html, `data-test-notify-status`);
  assertIncludes(html, `data-test-notify-button`);
  assertIncludes(
    html,
    `aria-label="${getMessages(settings().locale).testNotify}"`,
  );
  assertIncludes(
    html,
    `data-tooltip="${getMessages(settings().locale).testNotify}"`,
  );
  assertIncludes(html, `data-security-settings-status-row`);
  assertNotIncludes(html, `data-account-verify-button`);
  assertNotIncludes(html, `data-account-mode="password"`);
  assertNotIncludes(html, `>修改用户名</button>`);
  assertNotIncludes(html, `>修改密码</button>`);
  assertNotIncludes(html, `>验证当前密码</button>`);
});

Deno.test("renderSettings escapes an injection-like username", () => {
  const html = renderSettings({
    account: {
      emailVerified: false,
      primaryEmail: undefined,
      username: `\"><script>alert(1)</script>`,
    },
    csrfToken: testCsrfToken,
    secondFactorMethods: [],
    securitySettings: {
      preferredSecondFactor: undefined,
      twoFactorEnabled: false,
      userId: "user-1",
    },
    settings: settings(),
  });

  assertIncludes(
    html,
    `value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"`,
  );
  assertNotIncludes(html, `<script>alert(1)</script>`);
});

Deno.test("renderSettings keeps account password mode behind current password verification", () => {
  const html = renderSettings({
    account: {
      emailVerified: false,
      primaryEmail: undefined,
      username: "alice",
    },
    csrfToken: testCsrfToken,
    secondFactorMethods: [],
    securitySettings: {
      preferredSecondFactor: undefined,
      twoFactorEnabled: false,
      userId: "user-1",
    },
    settings: settings(),
  });

  assertIncludes(html, `data-account-mode-trigger="password"`);
  assertIncludes(html, `data-account-new-password-row`);
  assertIncludes(html, `data-account-unlocked-field`);
  assertIncludes(
    html,
    `autocomplete="current-password"
                  data-account-current-password-input
                  disabled`,
  );
  assertIncludes(html, `name="newPassword"`);
  assertIncludes(html, `name="confirmPassword"`);
  assertIncludes(
    html,
    `data-account-unlocked-field
                  disabled`,
  );
  assertNotIncludes(html, `data-auth-method-panel="password"`);
  assertNotIncludes(html, `data-password-login-method-form`);
  assertNotIncludes(html, `data-password-login-current-input`);
  assertNotIncludes(html, `data-password-login-target-row`);
  assertNotIncludes(html, `data-password-login-unlocked-field`);
  assertNotIncludes(html, `data-password-login-actions`);
  assertNotIncludes(html, `data-password-login-save-button`);
  assertNotIncludes(html, `data-account-verify-button`);
});

Deno.test("renderSettings marks RTL pages and isolates technical inputs", () => {
  const appSettings: AppSettings = {
    ...settings(),
    locale: "ar-SA",
    notificationSmtpHost: "smtp.example.com",
    topics: [{ enabled: true, id: "12345", keywordRules: [], note: "" }],
  };
  const html = renderSettings({
    csrfToken: testCsrfToken,
    settings: appSettings,
  });

  assertIncludes(html, `lang="ar-SA"`);
  assertIncludes(html, `dir="rtl"`);
  assertIncludes(
    html,
    `name="notificationSmtpHost"\n                dir="ltr"`,
  );
  assertIncludes(html, `name="topic_0_id" dir="ltr" value="12345"`);
});

Deno.test("renderSettings does not expose notification secrets", () => {
  const appSettings = {
    ...settings(),
    notificationEmailApiToken: "email-api-token-secret",
    notificationPushPlusToken: "pushplus-token-secret",
    notificationServerChanSendKey: "server-chan-sendkey-secret",
    notificationSmtpPassword: "smtp-password-secret",
    notificationWebhookUrl: "https://example.com/webhook/secret-token",
    notificationWxPusherSpt: "wxpusher-spt-secret",
  };
  const html = renderSettings({
    csrfToken: testCsrfToken,
    settings: appSettings,
  });

  assertIncludes(html, `class="secret-display-input"`);
  assertIncludes(
    html,
    `class="settings-row-action-button settings-icon-action-button"`,
  );
  assertIncludes(html, `class="settings-row-action-icon"`);
  assertIncludes(html, `data-secret-edit-button`);
  assertIncludes(html, `data-secret-configured="true"`);
  assertNotIncludes(html, appSettings.notificationEmailApiToken);
  assertNotIncludes(html, appSettings.notificationPushPlusToken);
  assertNotIncludes(html, appSettings.notificationServerChanSendKey);
  assertNotIncludes(html, appSettings.notificationSmtpPassword);
  assertNotIncludes(html, appSettings.notificationWebhookUrl);
  assertNotIncludes(html, appSettings.notificationWxPusherSpt);
});

Deno.test("renderSettings renders email binding controls and verified email state", () => {
  const html = renderSettings({
    account: {
      emailVerified: true,
      primaryEmail: "alice@example.com",
      username: "alice",
    },
    csrfToken: testCsrfToken,
    emailCredentials: [{
      createdAt: "2026-07-31T12:00:00.000Z",
      email: "alice@example.com",
      lastVerifiedAt: "2026-07-31T12:05:00.000Z",
      userId: "user-1",
      verified: true,
    }],
    settings: settings(),
    turnstileSiteKey: "turnstile-site-key",
  });

  assertIncludes(html, `data-email-binding-form`);
  assertIncludes(html, `id="email-binding-form"`);
  assertIncludes(html, `action="/account/email/verify?locale=zh-CN"`);
  assertIncludes(
    html,
    `data-email-send-url="/auth/email-verifications?locale=zh-CN"`,
  );
  assertIncludes(html, `data-email-binding-edit-button`);
  assertIncludes(html, `data-email-summary-row`);
  assertIncludes(html, `data-email-binding-original="alice@example.com"`);
  assertIncludes(html, `form="email-binding-form"`);
  assertIncludes(
    html,
    `class="auth-method-row account-option-row email-binding-code-row`,
  );
  assertIncludes(html, `data-email-code-row`);
  assertIncludes(html, `data-email-send-code-button`);
  assertIncludes(html, `data-email-code-invalid=`);
  assertIncludes(html, `name="verificationId"`);
  assertIncludes(html, `autocomplete="one-time-code"`);
  assertIncludes(html, `alice@example.com`);
  assertIncludes(html, `readonly`);
  assertNotIncludes(html, `data-auth-method-toggle="email"`);
  assertNotIncludes(html, `data-auth-method-panel="email"`);
  assertNotIncludes(html, `email-binding-code-panel`);
  assertBefore(html, `data-email-summary-row`, `data-email-code-row`);
  assertIncludes(html, `class="settings-turnstile cf-turnstile"`);
  assertIncludes(html, `data-response-field-name="cf-turnstile-response"`);
  assertIncludes(
    html,
    `https://challenges.cloudflare.com/turnstile/v0/api.js`,
  );
});

Deno.test("renderSettings renders TOTP binding setup controls", () => {
  const html = renderSettings({
    account: {
      emailVerified: true,
      primaryEmail: "alice@example.com",
      username: "alice",
    },
    csrfToken: testCsrfToken,
    securitySettings: {
      preferredSecondFactor: undefined,
      twoFactorEnabled: false,
      userId: "user-1",
    },
    settings: settings(),
    recoveryCodes: [
      "2345-6789-ABCD",
      "EFGH-JKLM-NPQR",
    ],
    totpCredentials: [{
      credentialId: "authenticator-credential-id",
      enabledAt: "2026-08-01T00:00:00.000Z",
      label: "Work phone",
      recoveryCodeHashes: ["hash-1", "hash-2"],
      secretEncrypted: "stored-encrypted-secret",
      userId: "user-1",
    }],
    totpSetup: {
      qrCodeDataUrl: "data:image/png;base64,test-qr-code",
      secretBase32: "ABCDEFGHIJKLMNOP",
      secretEncrypted: "encrypted-secret",
    },
  });

  assertIncludes(html, `data-totp-binding-form`);
  assertIncludes(html, `action="/account/totp/verify?locale=zh-CN"`);
  assertIncludes(html, `name="secretEncrypted" value="encrypted-secret"`);
  assertIncludes(html, `data-totp-qr-code`);
  assertIncludes(html, `src="data:image/png;base64,test-qr-code"`);
  assertIncludes(html, `data-totp-manual-key`);
  assertIncludes(html, `>ABCDEFGHIJKLMNOP</code>`);
  assertIncludes(html, `data-totp-copy-button`);
  assertIncludes(html, `class="totp-copy-icon"`);
  assertNotIncludes(html, `value="ABCDEFGHIJKLMNOP"`);
  assertNotIncludes(html, `data-totp-otpauth-uri`);
  assertIncludes(html, `data-totp-code-input`);
  assertIncludes(html, `data-totp-code-error=`);
  assertIncludes(html, `data-totp-config-error=`);
  assertIncludes(html, `data-totp-not-found-error=`);
  assertIncludes(html, `确认绑定`);
  const totpPanel = html.slice(
    html.indexOf(`data-totp-binding-section`),
    html.indexOf(`data-auth-method-panel="recovery-codes"`),
  );
  assertIncludes(totpPanel, `action="/account/totp/delete?locale=zh-CN"`);
  assertIncludes(totpPanel, `data-auth-credential-action="delete"`);
  assertIncludes(totpPanel, `data-sensitive-action-form`);
  assertIncludes(totpPanel, `data-sensitive-reauth-template`);
  assertIncludes(totpPanel, `data-reauth-recovery-code-form`);
  assertIncludes(
    totpPanel,
    `data-reauth-method-button="recovery-code"`,
  );
  assertIncludes(
    totpPanel,
    `data-reauth-recovery-code-url="/account/reauth/recovery-code?locale=zh-CN"`,
  );
  assertIncludes(totpPanel, `class="auth-method-credential-heading"`);
  assertIncludes(totpPanel, `data-auth-credential-action="confirm"`);
  assertIncludes(totpPanel, `aria-label="删除"`);
  assertIncludes(totpPanel, `aria-label="确认绑定"`);
  assertNotIncludes(totpPanel, `>状态</span>`);
  assertNotIncludes(totpPanel, `已绑定 1 个验证器。`);
  assertBefore(
    totpPanel,
    `data-auth-credential-action="confirm"`,
    `data-auth-credential-action="delete"`,
  );
  assertNotIncludes(totpPanel, `>删除</button>`);
  assertNotIncludes(totpPanel, `>确认绑定</button>`);
  assertIncludes(html, `data-recovery-code-reveal`);
  assertIncludes(html, `data-recovery-codes-download`);
  assertIncludes(html, `data-recovery-codes-confirm`);
  assertIncludes(html, `data-recovery-codes-generate`);
  assertIncludes(html, `data-auth-credential-action="refresh"`);
  assertIncludes(html, `data-recovery-code-generation`);
  assertIncludes(html, `data-reauth-purpose="recovery_codes"`);
  assertIncludes(html, `class="auth-method-toggle-button" hidden`);
  assertIncludes(html, `data-recovery-code-generation\n    hidden`);
  assertIncludes(html, `>确认</button>`);
  assertIncludes(html, `aria-label="下载恢复码"`);
  assertIncludes(
    html,
    `data-recovery-download-app-name="小黑盒话题提醒"`,
  );
  assertIncludes(html, `data-recovery-download-file-label="恢复码"`);
  assertNotIncludes(html, `data-recovery-codes-copy`);
  assertIncludes(html, `2345-6789-ABCD`);
});

Deno.test("renderSettings offers recovery code generation for an existing authenticator", () => {
  const html = renderSettings({
    account: {
      emailVerified: true,
      primaryEmail: "alice@example.com",
      username: "alice",
    },
    csrfToken: testCsrfToken,
    securitySettings: {
      preferredSecondFactor: undefined,
      twoFactorEnabled: false,
      userId: "user-1",
    },
    settings: settings(),
    totpCredentials: [{
      credentialId: "legacy-authenticator",
      enabledAt: "2026-08-01T00:00:00.000Z",
      label: "旧验证器",
      recoveryCodeHashes: [],
      secretEncrypted: "stored-encrypted-secret",
      userId: "user-1",
    }],
  });

  assertIncludes(html, `data-recovery-codes-generate`);
  assertIncludes(html, `data-auth-credential-action="add"`);
  assertIncludes(html, `data-auth-method-toggle="recovery-codes"`);
  assertIncludes(html, `aria-label="生成恢复码"`);
  assertIncludes(html, `data-recovery-code-generation`);
  assertIncludes(html, `data-reauth-section`);
  assertIncludes(html, `data-reauth-purpose="recovery_codes"`);
  assertIncludes(html, `请选择一种方式确认身份`);
  assertNotIncludes(html, `action="/account/recovery-codes/generate"`);
  assertNotIncludes(html, `data-recovery-code-reveal`);
});

Deno.test("renderSettings offers recovery code regeneration when codes already exist", () => {
  const html = renderSettings({
    account: {
      emailVerified: true,
      primaryEmail: "alice@example.com",
      username: "alice",
    },
    csrfToken: testCsrfToken,
    securitySettings: {
      preferredSecondFactor: undefined,
      twoFactorEnabled: false,
      userId: "user-1",
    },
    settings: settings(),
    totpCredentials: [{
      credentialId: "authenticator-with-recovery-codes",
      enabledAt: "2026-08-01T00:00:00.000Z",
      label: "手机验证器",
      recoveryCodeHashes: ["old-hash"],
      secretEncrypted: "stored-encrypted-secret",
      userId: "user-1",
    }],
  });

  assertIncludes(html, `data-recovery-codes-generate`);
  assertIncludes(html, `data-auth-credential-action="refresh"`);
  assertIncludes(html, `aria-label="重新生成恢复码"`);
  assertIncludes(html, `data-recovery-code-generation`);
  assertIncludes(html, `data-reauth-purpose="recovery_codes"`);
  assertIncludes(html, `确认成功后将废除全部旧恢复码`);
  assertNotIncludes(html, `data-recovery-code-reveal`);
});

Deno.test("renderSettings localizes the recovery code download filename parts", () => {
  const html = renderSettings({
    account: {
      emailVerified: true,
      primaryEmail: "alice@example.com",
      username: "alice",
    },
    csrfToken: testCsrfToken,
    recoveryCodes: ["2345-6789-ABCD"],
    securitySettings: {
      preferredSecondFactor: undefined,
      twoFactorEnabled: false,
      userId: "user-1",
    },
    settings: { ...settings(), locale: "en-US" },
    totpCredentials: [{
      credentialId: "authenticator-with-recovery-codes",
      enabledAt: "2026-08-01T00:00:00.000Z",
      label: "Phone authenticator",
      recoveryCodeHashes: ["stored-hash"],
      secretEncrypted: "stored-encrypted-secret",
      userId: "user-1",
    }],
  });

  assertIncludes(html, `aria-label="Download recovery codes"`);
  assertIncludes(
    html,
    `data-recovery-download-app-name="Heybox Topic Notifier"`,
  );
  assertIncludes(
    html,
    `data-recovery-download-file-label="Recovery codes"`,
  );
  assertNotIncludes(html, `data-recovery-download-file-label="恢复码"`);
});

Deno.test("renderSettings places auth sections below notifications and above global settings", () => {
  const html = renderSettings({
    account: {
      emailVerified: true,
      primaryEmail: "alice@example.com",
      username: "alice",
    },
    csrfToken: testCsrfToken,
    securitySettings: {
      preferredSecondFactor: undefined,
      twoFactorEnabled: false,
      userId: "user-1",
    },
    settings: settings(),
  });

  assertBefore(
    html,
    `id="notification-settings-heading"`,
    `id="login-methods-heading"`,
  );
  assertBefore(
    html,
    `id="login-methods-heading"`,
    `id="account-two-step-heading"`,
  );
  assertBefore(
    html,
    `id="account-two-step-heading"`,
    `id="global-settings-heading"`,
  );
  assertIncludes(html, `data-email-binding-edit-button`);
  assertIncludes(html, `data-email-code-row`);
  assertBefore(html, `data-email-code-row`, `data-auth-method-toggle="totp"`);
  assertIncludes(html, `data-auth-method-toggle="totp"`);
  assertNotIncludes(html, `data-auth-method-toggle="recovery-codes"`);
  assertNotIncludes(html, `class="auth-method-text-button"`);
  assertIncludes(html, `data-account-mode-trigger="password"`);
  assertNotIncludes(html, `data-auth-method-panel="password"`);
  assertIncludes(html, `data-auth-method-panel="passkey"`);
  assertIncludes(html, `data-auth-method-panel="google"`);
  assertIncludes(html, `class="auth-method-toggle-button"`);
  assertIncludes(html, `class="auth-method-action-icon"`);
  assertIncludes(html, `data-auth-icon="email"`);
  assertIncludes(html, `data-auth-icon="password"`);
  assertIncludes(html, `data-auth-icon="passkey"`);
  assertIncludes(html, `data-auth-icon="google"`);
  assertIncludes(html, `data-auth-icon="two-factor"`);
  assertIncludes(html, `data-auth-icon="preferred-method"`);
  assertIncludes(html, `data-auth-icon="authenticator"`);
  assertIncludes(html, `data-auth-icon="recovery-codes"`);
  assertIncludes(html, `aria-label="修改密码"`);
  assertIncludes(html, `data-tooltip="添加 Passkey"`);
  assertNotIncludes(html, `>修改密码</button>`);
  assertNotIncludes(html, `>添加 Passkey</button>`);
  assertNotIncludes(html, `>绑定</button>`);
  assertNotIncludes(html, `class="secondary"`);
  assertNotIncludes(html, `class="secondary `);
  assertIncludes(html, `form="settings-autosave-form"`);
  assertNotIncludes(html, `敏感操作确认`);
});

Deno.test("renderSettings renders Passkey binding controls", () => {
  const html = renderSettings({
    account: {
      emailVerified: true,
      primaryEmail: "alice@example.com",
      username: "alice",
    },
    csrfToken: testCsrfToken,
    passkeyBindingStatus: { code: "updated", type: "success" },
    passkeyCredentials: [{
      backedUp: true,
      counter: 0,
      createdAt: "2026-08-01T00:00:00.000Z",
      credentialId: "passkey-credential-id",
      label: "Work laptop",
      lastUsedAt: "2026-08-01T00:10:00.000Z",
      publicKey: "public-key",
      transports: ["internal"],
      userId: "user-1",
    }],
    reauthPasswordAvailable: true,
    reauthRecentlyVerified: false,
    settings: settings(),
  });

  assertIncludes(html, `data-passkey-binding-section`);
  assertIncludes(html, `data-passkey-bind-button`);
  assertIncludes(html, `data-passkey-label-input`);
  assertIncludes(html, `action="/account/passkeys/delete?locale=zh-CN"`);
  assertIncludes(html, `name="credentialId"`);
  assertIncludes(html, `Work laptop`);
  const localizedCreatedAt = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date("2026-08-01T00:00:00.000Z"));
  assertIncludes(html, localizedCreatedAt);
  assertIncludes(localizedCreatedAt, "年");
  assertNotIncludes(html, "2026-08-01T00:00:00.000Z");
  assertIncludes(html, `Passkey 已绑定。`);
  assertIncludes(html, `data-transient-success-status`);
  assertIncludes(html, `data-account-passkey-available="true"`);
  assertIncludes(html, `data-account-password-available="true"`);
  assertIncludes(html, `data-account-recently-verified="false"`);
  assertIncludes(html, `data-account-passkey-reauth-row`);
  assertIncludes(html, `data-account-passkey-retry-button`);
  assertIncludes(html, `data-account-password-fallback-button`);
  assertBefore(html, `data-account-status`, `data-account-actions`);
  assertIncludes(html, `data-reauth-passkey-options-url=`);
  assertIncludes(html, `data-reauth-passkey-verify-url=`);
  assertIncludes(html, `>改用当前密码</button>`);
  const passkeyPanel = html.slice(
    html.indexOf(`data-passkey-binding-section`),
    html.indexOf(`data-auth-method-panel="google"`),
  );
  assertIncludes(passkeyPanel, `data-auth-credential-action="delete"`);
  assertIncludes(passkeyPanel, `data-sensitive-action-form`);
  assertIncludes(passkeyPanel, `data-sensitive-reauth-template`);
  assertIncludes(passkeyPanel, `class="auth-method-credential-heading"`);
  assertIncludes(passkeyPanel, `data-auth-credential-action="add"`);
  assertIncludes(passkeyPanel, `aria-label="删除"`);
  assertIncludes(passkeyPanel, `aria-label="绑定 Passkey"`);
  assertNotIncludes(passkeyPanel, `>状态</span>`);
  assertNotIncludes(passkeyPanel, `已绑定 1 个 Passkey。`);
  assertBefore(
    passkeyPanel,
    `data-auth-credential-action="add"`,
    `data-auth-credential-action="delete"`,
  );
  assertNotIncludes(passkeyPanel, `>删除</button>`);
  assertNotIncludes(passkeyPanel, `>绑定 Passkey</button>`);
});

Deno.test("renderSettings renders account security controls", () => {
  const html = renderSettings({
    account: {
      emailVerified: true,
      primaryEmail: "alice@example.com",
      username: "alice",
    },
    csrfToken: testCsrfToken,
    secondFactorMethods: ["email", "totp"],
    securitySettings: {
      preferredSecondFactor: "email",
      twoFactorEnabled: true,
      userId: "user-1",
    },
    securityStatus: { code: "updated", type: "success" },
    settings: settings(),
    totpCredentials: [{
      credentialId: "authenticator-with-recovery-codes",
      enabledAt: "2026-08-01T00:00:00.000Z",
      label: "手机验证器",
      recoveryCodeHashes: ["stored-hash"],
      secretEncrypted: "stored-encrypted-secret",
      userId: "user-1",
    }],
  });

  assertIncludes(html, `data-security-settings-form`);
  assertIncludes(html, `data-security-recently-verified="false"`);
  assertIncludes(html, `data-security-settings-reauth`);
  assertIncludes(html, `data-security-reauth-template`);
  assertIncludes(html, `data-auth-method-panel="two-factor"`);
  assertIncludes(
    html,
    `class="auth-method-panel is-collapsed"\n              data-auth-method-panel="two-factor"\n              data-security-settings-reauth\n              hidden`,
  );
  assertIncludes(html, `data-security-saving=`);
  assertIncludes(html, `action="/account/security?locale=zh-CN"`);
  assertIncludes(html, `name="twoFactorEnabled"`);
  assertIncludes(html, `checked`);
  assertIncludes(html, `name="preferredSecondFactor"`);
  assertIncludes(html, `value="email" selected`);
  assertIncludes(html, `data-auth-method-toggle="totp"`);
  assertIncludes(html, `aria-label="编辑"`);
  assertIncludes(html, `开启两步验证`);
  assertIncludes(html, `邮箱验证码`);
  assertIncludes(html, `双重验证设置已保存。`);
  assertIncludes(html, `data-transient-success-status`);
  assertIncludes(html, `data-inline-status-container`);
  assertNotIncludes(html, `保存安全设置`);
  const securityPanel = html.slice(
    html.indexOf(`data-auth-method-panel="two-factor"`),
    html.indexOf(`name="preferredSecondFactor"`),
  );
  assertIncludes(securityPanel, `data-reauth-method-button="totp"`);
  assertNotIncludes(
    securityPanel,
    `data-reauth-method-button="recovery-code"`,
  );
});

Deno.test("renderSettings renders Google unbind as an icon action", () => {
  const html = renderSettings({
    account: {
      emailVerified: true,
      primaryEmail: "alice@example.com",
      username: "alice",
    },
    csrfToken: testCsrfToken,
    googleBindingStatus: { code: "updated", type: "success" },
    googleIdentity: {
      createdAt: "2026-08-01T00:00:00.000Z",
      email: "alice@example.com",
      provider: "google",
      providerUserId: "google-subject-id",
      userId: "user-1",
    },
    settings: settings(),
  });

  assertIncludes(html, `action="/account/google/unbind?locale=zh-CN"`);
  assertIncludes(html, `class="auth-method-toggle-button"`);
  assertIncludes(html, `aria-label="解绑"`);
  assertIncludes(html, `data-tooltip="解绑"`);
  assertIncludes(html, `已绑定 alice@example.com`);
  assertNotIncludes(html, `Google 已绑定。`);
  assertNotIncludes(html, `data-auth-method-panel="google"`);
  assertNotIncludes(html, `>解绑</button>`);
});

/**
 * 创建表格测试数据。
 *
 * @param records 命中记录列表。
 * @return 表格计算结果。
 */
function table(records: MatchRecord[]): MatchTableResult {
  return {
    from: "",
    page: 1,
    pageSize: 10,
    range: "all",
    records,
    to: "",
    totalPages: 1,
    totalRecords: records.length,
  };
}

/**
 * 创建测试命中记录。
 *
 * @param id 记录 ID。
 * @param matchedAt 命中时间。
 * @return 测试命中记录。
 */
function record(id: string, matchedAt: string): MatchRecord {
  return {
    id,
    keyword: "求助",
    location: "title",
    matchedAt,
    post: {
      body: "",
      commentReplies: [],
      comments: [],
      excerpt: "",
      id,
      publishedAt: matchedAt,
      title: id,
      url: `https://example.com/${id}`,
    },
  };
}

/**
 * 创建测试使用的应用设置。
 *
 * @return 应用设置。
 */
function settings(): AppSettings {
  return {
    activeKeywordTarget: "common",
    commonKeywordRules: [],
    darkMode: false,
    locale: "zh-CN",
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
    notificationWebhookService: "pushPlus",
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

/**
 * 断言两个值的 JSON 表示相等。
 *
 * @param actual 实际值。
 * @param expected 期望值。
 * @return 断言通过时无返回值。
 */
function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

/**
 * 断言字符串包含指定片段。
 *
 * @param actual 实际字符串。
 * @param expected 期望包含的片段。
 * @return 断言通过时无返回值。
 */
function assertIncludes(actual: string, expected: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`Expected output to include ${expected}`);
  }
}

/**
 * 断言字符串不包含指定片段。
 *
 * @param actual 实际字符串。
 * @param expected 不期望出现的片段。
 * @return 断言通过时无返回值。
 */
function assertNotIncludes(actual: string, expected: string): void {
  if (actual.includes(expected)) {
    throw new Error(`Expected output not to include ${expected}`);
  }
}

/**
 * 断言一个片段先于另一个片段出现。
 *
 * @param actual 实际字符串。
 * @param first 期望先出现的片段。
 * @param second 期望后出现的片段。
 */
function assertBefore(actual: string, first: string, second: string): void {
  const firstIndex = actual.indexOf(first);
  const secondIndex = actual.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    throw new Error(`Expected ${first} to appear before ${second}`);
  }
}
