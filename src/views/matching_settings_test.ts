/** @file 验证匹配设置表单的保存、边界约束、密钥遮罩及主题布局。 */
import { assert, assertEquals } from "../test_helpers.ts";
import { defaultAppSettingsFromEnv } from "../services/default_settings.ts";
import { normalizeMatchingSettings } from "../services/matching_settings.ts";
import { createRoutes, settingsFromForm } from "../routes.ts";
import type { AppContext } from "../services/app_context.ts";
import { testCsrfForm, testCsrfHeaders } from "../test_helpers.ts";
import { renderSettings } from "./settings.ts";
import {
  renderMatchingAdvanced,
  renderMatchingSection,
} from "./matching_settings.ts";

Deno.test("matching settings preserve secrets and clamp user supplied limits", () => {
  const settings = {
    ...defaultAppSettingsFromEnv(),
    matching: normalizeMatchingSettings({
      apiKey: "private-key",
      apiUrl: "https://example.com/v1",
    }),
  };
  const result = settingsFromForm({
    matchingMode: "hybrid",
    matchingApiUrl: "https://example.com/v1",
    matchingApiKey: "",
    matchingDailyLimit: "999999",
    matchingMaxInputChars: "-1",
    matchingMaxOutputTokens: "bad",
    matchingCacheMaxEntries: "999999",
    matchingIncludeComments: "on",
  }, settings);
  assertEquals(result.matching?.mode, "hybrid");
  assertEquals(result.matching?.apiKey, "private-key");
  assertEquals(result.matching?.dailyLimit, 10000);
  assertEquals(result.matching?.maxInputChars, 200);
  assertEquals(result.matching?.maxOutputTokens, 160);
  assertEquals(result.matching?.cacheMaxEntries, 50000);
  assertEquals(result.matching?.includeComments, true);
  assertEquals(settingsFromForm({}, settings).matching, settings.matching);
});

Deno.test("matching settings use shared layout and never render saved API secrets", () => {
  const settings = {
    ...defaultAppSettingsFromEnv(),
    matching: normalizeMatchingSettings({
      mode: "ai",
      apiKey: "private-key",
      prompt: "</textarea><script>alert(1)</script>",
    }),
  };
  const html = renderSettings({ settings, csrfToken: "test-token" });
  assert(
    html.includes(
      "data-matching-editor",
    ),
  );
  assert(html.includes("data-matching-mode"));
  assert(
    html.includes('name="matchingApiKey" value="" data-secret-hidden-input'),
  );
  assert(!html.includes("private-key"));
  assert(!html.includes("</textarea><script>alert(1)</script>"));
  assert(html.includes("&lt;/textarea&gt;"));
});

Deno.test("matching settings stay between topics and keywords and expose only relevant controls", () => {
  const settings = {
    ...defaultAppSettingsFromEnv(),
    matching: normalizeMatchingSettings({
      mode: "ai",
      provider: "openai",
      model: "gpt-4.1",
    }),
  };
  const html = renderSettings({ settings, csrfToken: "test-token" });
  const positions = [
    "data-topic-editor",
    "data-matching-editor",
    "data-keyword-editor",
    "data-advanced-editor",
  ].map((marker) => html.indexOf(marker));
  assert(
    positions.every((position, index) =>
      position >= 0 && (index === 0 || position > positions[index - 1])
    ),
  );
  assert(!html.includes('id="matching-settings-heading"'));
  assert(html.includes('matching-conditional-row"\n      hidden'));
  const basic = renderMatchingSection(settings, "");
  assert(basic.includes("搜索公司"));
  assert(basic.includes("搜索模型"));
  assert(basic.includes("data-matching-url hidden"));
  assert(basic.includes("data-matching-thinking hidden"));
  assert(!basic.includes("matchingDailyLimit"));
  assert(!basic.includes("field-hint"));
  const modeRow = basic.slice(
    basic.indexOf('name="matchingMode"'),
    basic.indexOf('data-matching-picker="matchingProvider"'),
  );
  assert(modeRow.includes("data-test-ai-button"));
  assert(modeRow.includes('aria-label="测试连通"'));
  const advanced = renderMatchingAdvanced(settings);
  assert(advanced.includes("matchingDailyLimit"));
  assert(advanced.includes("matchingCacheMaxEntries"));
  assert(!advanced.includes("field-hint"));
  assert(!advanced.includes("话题缓存期限"));
});

Deno.test("AI connection route rejects missing CSRF and cannot use credentials from another provider", async () => {
  const settings = {
    ...defaultAppSettingsFromEnv(),
    matching: normalizeMatchingSettings({
      mode: "ai",
      provider: "deepseek",
      model: "deepseek-flash",
      apiKey: "fixture-secret",
    }),
  };
  const app = createRoutes(
    {
      storage: { getSettings: () => Promise.resolve(settings) },
    } as unknown as AppContext,
  );
  const denied = await app.request("/settings/test-ai", {
    method: "POST",
    body: new URLSearchParams(),
  });
  assertEquals(denied.status, 403);
  await denied.body?.cancel();
  const wrongProvider = await app.request("/settings/test-ai", {
    method: "POST",
    headers: testCsrfHeaders(),
    body: testCsrfForm(
      new URLSearchParams({ matchingMode: "ai", matchingProvider: "openai" }),
    ),
  });
  assertEquals(wrongProvider.status, 400);
  assertEquals(await wrongProvider.json(), {
    ok: false,
    error: "configuration",
  });
});

Deno.test("switching company or endpoint cannot reuse another service API key", () => {
  const settings = {
    ...defaultAppSettingsFromEnv(),
    matching: normalizeMatchingSettings({
      provider: "deepseek",
      apiKey: "private-key",
    }),
  };
  const switched = settingsFromForm({
    matchingMode: "ai",
    matchingProvider: "openai",
    matchingApiKey: "",
  }, settings);
  assertEquals(switched.matching?.apiKey, "");
  assertEquals(switched.matching?.apiUrl, "https://api.openai.com/v1");
  const replaced = settingsFromForm({
    matchingMode: "ai",
    matchingProvider: "custom",
    matchingApiUrl: "https://other.example/v1",
    matchingApiKey: "new-key",
  }, settings);
  assertEquals(replaced.matching?.apiKey, "new-key");
  assertEquals(replaced.matching?.disableThinking, true);
  assertEquals(
    settingsFromForm(
      { matchingMode: "ai", matchingEnableThinking: "on" },
      settings,
    ).matching?.disableThinking,
    false,
  );
});

Deno.test("model discovery requires CSRF and never reuses saved credentials after provider changes", async () => {
  const settings = {
    ...defaultAppSettingsFromEnv(),
    matching: normalizeMatchingSettings({
      provider: "deepseek",
      apiKey: "fixture-secret",
    }),
  };
  const app = createRoutes(
    {
      storage: { getSettings: () => Promise.resolve(settings) },
    } as unknown as AppContext,
  );
  const forbidden = await app.request("/settings/matching-models", {
    method: "POST",
    body: new URLSearchParams(),
  });
  assertEquals(forbidden.status, 403);
  await forbidden.body?.cancel();
  const missing = await app.request("/settings/matching-models", {
    method: "POST",
    headers: testCsrfHeaders(),
    body: testCsrfForm(new URLSearchParams({ matchingProvider: "openai" })),
  });
  assertEquals(missing.status, 400);
  assertEquals(await missing.json(), { error: "credentials" });
  assertEquals(missing.headers.get("cache-control"), "no-store");
});
