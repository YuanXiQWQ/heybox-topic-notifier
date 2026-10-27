/** @file 验证模型发现的出站限制、模型筛选和思考参数协议。 */
import { assert, assertEquals, assertRejects } from "@std/assert";
import { fetchAiModels } from "./ai_models.ts";
import {
  aiGenerationParameters,
  supportsThinkingToggle,
} from "./ai_providers.ts";
import { normalizeMatchingSettings } from "./matching_settings.ts";

/** 离线模型查询配置。 */
const settings = normalizeMatchingSettings({
  provider: "openai",
  apiKey: "fixture-key",
});

Deno.test("models use the built-in endpoint and only return bounded text model IDs", async () => {
  const result = await fetchAiModels(settings, {
    resolveDns: () => Promise.resolve(["93.184.216.34"]),
    fetch: (url, init) => {
      assertEquals(String(url), "https://api.openai.com/v1/models");
      assertEquals(init?.method, undefined);
      assertEquals(init?.redirect, "error");
      assertEquals(
        (init?.headers as Record<string, string>).authorization,
        "Bearer fixture-key",
      );
      return Promise.resolve(Response.json({
        data: [
          { id: "gpt-4.1" },
          { id: "gpt-4.1" },
          { id: "gpt-5.1" },
          { id: "text-embedding-3-small" },
          { id: "gpt-image-1" },
          { id: "gpt-audio" },
          { id: "gpt-5.1-codex" },
          { id: "gpt-no-text", output_modalities: ["audio"] },
          { id: "x".repeat(201) },
        ],
      }));
    },
  });
  assertEquals(result, [{ id: "gpt-4.1", thinking: false }, {
    id: "gpt-5.1",
    thinking: true,
  }]);
});

Deno.test("models never forward credentials to private addresses or without a key", async () => {
  let calls = 0;
  const options = {
    resolveDns: () => Promise.resolve(["127.0.0.1"]),
    fetch: () => {
      calls++;
      return Promise.resolve(Response.json({ data: [] }));
    },
  };
  await assertRejects(() => fetchAiModels(settings, options));
  await assertRejects(() =>
    fetchAiModels({ ...settings, apiKey: "" }, options)
  );
  await assertRejects(() =>
    fetchAiModels({ ...settings, apiUrl: "https://localhost" }, options)
  );
  assertEquals(calls, 0);
});

Deno.test("models reject provider failures, invalid data and oversized bodies", async () => {
  for (
    const response of [
      new Response("secret diagnostic", { status: 401 }),
      Response.json({ error: "oops" }),
      new Response("x".repeat(1024 * 1024 + 1)),
    ]
  ) {
    const error = await assertRejects(() =>
      fetchAiModels(settings, {
        resolveDns: () => Promise.resolve(["93.184.216.34"]),
        fetch: () => Promise.resolve(response),
      })
    );
    assert(!String(error).includes("secret diagnostic"));
  }
});

Deno.test("thinking defaults off and uses supported model-specific parameters", () => {
  assertEquals(normalizeMatchingSettings().disableThinking, true);
  assertEquals(aiGenerationParameters("deepseek-flash", true, 160), {
    max_tokens: 160,
    thinking: { type: "disabled" },
  });
  assertEquals(aiGenerationParameters("deepseek-flash", false, 160), {
    max_tokens: 160,
    thinking: { type: "enabled" },
  });
  assertEquals(aiGenerationParameters("gpt-5.1", true, 160), {
    max_completion_tokens: 160,
    reasoning_effort: "none",
  });
  assertEquals(aiGenerationParameters("gpt-6.1-sol", true, 160), {
    max_completion_tokens: 160,
    reasoning_effort: "low",
  });
  assertEquals(aiGenerationParameters("qwen3-32b", true, 160), {
    max_tokens: 160,
    enable_thinking: false,
  });
  assertEquals(aiGenerationParameters("unknown-model", true, 160), {
    max_tokens: 160,
  });
  assertEquals(supportsThinkingToggle("gpt-4.1"), false);
  assertEquals(supportsThinkingToggle("gpt-6.1-sol"), false);
  assertEquals(supportsThinkingToggle("deepseek-reasoner"), false);
  assertEquals(
    normalizeMatchingSettings({
      provider: "openai",
      apiUrl: "https://other.example",
    }).apiUrl,
    "https://api.openai.com/v1",
  );
});
