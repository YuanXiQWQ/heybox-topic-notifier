/**
 * @file 本文件验证应用装配层的通用中间件行为。
 */
import { createApplication } from "./app.ts";
import { assertEquals } from "./test_helpers.ts";

Deno.test("application adds baseline security headers", async () => {
  const { app } = createApplication();

  const response = await app.request("https://example.com/login");
  const contentSecurityPolicy =
    response.headers.get("content-security-policy") ?? "";

  assertEquals(response.status, 200);
  assertEquals(contentSecurityPolicy.includes("default-src 'self'"), true);
  assertEquals(contentSecurityPolicy.includes("frame-ancestors 'none'"), true);
  assertEquals(
    contentSecurityPolicy.includes(
      "frame-src https://challenges.cloudflare.com https://accounts.google.com/gsi/",
    ),
    true,
  );
  assertEquals(contentSecurityPolicy.includes("object-src 'none'"), true);
  assertEquals(
    contentSecurityPolicy.includes(
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://accounts.google.com/gsi/client",
    ),
    true,
  );
  assertEquals(
    contentSecurityPolicy.includes(
      "connect-src 'self' https://challenges.cloudflare.com https://accounts.google.com/gsi/",
    ),
    true,
  );
  assertEquals(
    contentSecurityPolicy.includes(
      "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    ),
    true,
  );
  assertEquals(
    response.headers.get("cross-origin-opener-policy"),
    "same-origin-allow-popups",
  );
  assertEquals(
    response.headers.get("cross-origin-resource-policy"),
    "same-origin",
  );
  assertEquals(response.headers.get("origin-agent-cluster"), "?1");
  assertEquals(
    response.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  assertEquals(response.headers.get("x-content-type-options"), "nosniff");
  assertEquals(response.headers.get("x-frame-options"), "DENY");
  assertEquals(
    response.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains",
  );
});

Deno.test("application omits HSTS for non-HTTPS requests", async () => {
  const { app } = createApplication();

  const response = await app.request("/login");

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("strict-transport-security"), null);
  assertEquals(response.headers.get("content-security-policy") !== null, true);
});

Deno.test("application serves the favicon without authentication", async () => {
  const { app } = createApplication();

  const response = await app.request("/favicon.ico");
  const bytes = new Uint8Array(await response.arrayBuffer());

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-type"), "image/png");
  assertEquals(response.headers.get("location"), null);
  assertEquals(
    Array.from(bytes.slice(0, 8)),
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
});

Deno.test("application login page declares the public favicon", async () => {
  const { app } = createApplication();

  const response = await app.request("/login");
  const html = await response.text();

  assertEquals(response.status, 200);
  assertEquals(
    html.includes('<link rel="icon" href="/favicon.ico" type="image/png">'),
    true,
  );
});

Deno.test({
  name:
    "application exposes username Easter egg resources without authentication",
  permissions: { env: true, read: true },
  fn: async () => {
    const { app } = createApplication();

    const scriptResponse = await app.request(
      "/static/easter-egg/ace-attorney/ace-attorney.js",
    );
    const stylesheetResponse = await app.request(
      "/static/easter-egg/ace-attorney/ace-attorney.css",
    );
    const imageResponse = await app.request(
      "/static/easter-egg/ace-attorney/assets/images/general/zh-CN/igiari.png",
    );
    const subtitleUiResponses = await Promise.all([
      "/static/easter-egg/ace-attorney/assets/images/aa123/text-box-ui/talk_bg.png",
      "/static/easter-egg/ace-attorney/assets/images/aa456/text-box-ui/text_box_ui.png",
      "/static/easter-egg/ace-attorney/assets/images/aa456/text-box-ui/name_bg_tiled.png",
      "/static/easter-egg/ace-attorney/assets/images/general/interjections/zh-CN.png",
      "/static/easter-egg/ace-attorney/assets/images/general/interjections/zh-TW.png",
      "/static/easter-egg/ace-attorney/assets/images/aa12/text-box-ui/MessageWindow_TextBase_R_game.png",
    ].map((assetPath) => app.request(assetPath)));
    const audioResponse = await app.request(
      "/static/easter-egg/ace-attorney/assets/sounds/aa123/zh-CN/phoenix-wright/igiari.wav",
    );
    const soundEffectResponse = await app.request(
      "/static/easter-egg/ace-attorney/assets/sounds/general/sfx-blipmale.wav",
    );
    const script = await scriptResponse.text();
    const normalizedScript = script.replaceAll("\r\n", "\n");
    const stylesheet = await stylesheetResponse.text();
    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
    const soundEffectBytes = new Uint8Array(
      await soundEffectResponse.arrayBuffer(),
    );

    assertEquals(scriptResponse.status, 200);
    assertEquals(
      script.includes("phoenixWright"),
      true,
    );
    assertEquals(
      script.includes(
        'continueButton.className = "username-easter-egg-continue"',
      ),
      true,
    );
    assertEquals(
      script.includes("username-easter-egg-theme-${character.theme}"),
      true,
    );
    assertEquals(
      script.includes("images/general/interjections/${imageLocale}.png"),
      true,
    );
    assertEquals(
      normalizedScript.includes(
        'choiceLocked = true;\n        actions.hidden = true;\n        overlay.classList.remove("is-choosing");',
      ),
      true,
    );
    assertEquals(
      script.includes('soundEffectSource("sfx-pichoop")'),
      true,
    );
    assertEquals(
      stylesheet.includes(".username-easter-egg-speaker"),
      true,
    );
    assertEquals(
      stylesheet.includes("1050ms step-end"),
      true,
    );
    assertEquals(
      stylesheet.includes("clamp(280px, 30vw, 740px)"),
      true,
    );
    assertEquals(stylesheet.includes("left: 50%;"), true);
    assertEquals(
      stylesheet.includes("width='4' height='4'"),
      true,
    );
    assertEquals(
      stylesheet.includes("username-easter-egg-continue-float"),
      true,
    );
    assertEquals(
      stylesheet.includes(".username-easter-egg-theme-aa456"),
      true,
    );
    assertEquals(
      stylesheet.includes(".is-aa456-chinese-interjection"),
      true,
    );
    assertEquals(
      stylesheet.includes("background-position: left 79.7357%"),
      true,
    );
    assertEquals(
      stylesheet.includes(
        "/assets/images/aa123/text-box-ui/talk_bg.png",
      ),
      true,
    );
    assertEquals(
      stylesheet.includes(
        "/assets/images/aa123/text-box-ui/select_arrow.png",
      ),
      true,
    );
    assertEquals(
      stylesheet.includes(
        "/assets/images/aa456/text-box-ui/text_box_ui.png",
      ),
      true,
    );
    assertEquals(
      stylesheet.includes(
        "/assets/images/aa12/text-box-ui/MessageWindow_TextBase_R_game.png",
      ),
      true,
    );
    assertEquals(
      stylesheet.includes(
        "/assets/images/aa12/text-box-ui/MessageWindow_NameBase_R.png",
      ),
      true,
    );
    assertEquals(
      stylesheet.includes(
        "/assets/images/aa12/text-box-ui/sactx-0-1024x64-BC7-Message-a8bee319.png",
      ),
      true,
    );
    assertEquals(
      stylesheet.includes("font-size: clamp(1.35rem, 2.5vw, 2.1rem)"),
      true,
    );
    assertEquals(
      stylesheet.includes("height: clamp(44px, 6.2vh, 62px)"),
      true,
    );
    assertEquals(
      stylesheet.includes(
        "padding: 3px clamp(64px, 6vw, 116px) 3px clamp(88px, 9vw, 172px)",
      ),
      false,
    );
    assertEquals(
      stylesheet.includes("padding-inline-start: clamp(88px, 9vw, 172px)"),
      true,
    );
    assertEquals(
      stylesheet.includes(
        "border: clamp(5px, 0.42vw, 8px) solid #e9b900",
      ),
      true,
    );
    assertEquals(
      stylesheet.includes("background-color: rgb(255 255 255 / 0.54)"),
      true,
    );
    assertEquals(
      stylesheet.includes("background-color: rgb(255 255 255 / 0.82)"),
      true,
    );
    assertEquals(stylesheet.includes("border-color: transparent"), true);
    assertEquals(
      stylesheet.includes("background-color: rgb(255 218 82 / 0.88)"),
      true,
    );
    assertEquals(stylesheet.includes("height: 1px;"), true);
    assertEquals(
      stylesheet.includes(
        ':root[dir="rtl"] .username-easter-egg-theme-aa456 .username-easter-egg-speaker::before',
      ),
      true,
    );
    assertEquals(stylesheet.includes("transform: scaleX(-1);"), true);
    assertEquals(
      stylesheet.includes("clamp(26px, 2.8vw, 38px)"),
      true,
    );
    assertEquals(stylesheet.includes("padding: 24px;"), true);
    assertEquals(stylesheet.includes("max-height: 100%;"), true);
    assertEquals(stylesheet.includes("max-width: 100%;"), true);
    assertEquals(
      stylesheet.includes("clamp(190px, 28vh, 270px)"),
      false,
    );
    assertEquals(imageResponse.status, 200);
    assertEquals(imageResponse.headers.get("content-type"), "image/png");
    assertEquals(
      Array.from(imageBytes.slice(0, 8)),
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    subtitleUiResponses.forEach((response) => {
      assertEquals(response.status, 200);
      assertEquals(response.headers.get("content-type"), "image/png");
    });
    assertEquals(audioResponse.status, 200);
    assertEquals(audioResponse.headers.get("content-type"), "audio/wav");
    assertEquals(audioResponse.headers.get("location"), null);
    assertEquals(soundEffectResponse.status, 200);
    assertEquals(soundEffectResponse.headers.get("content-type"), "audio/wav");
    assertEquals(
      new TextDecoder().decode(soundEffectBytes.slice(0, 4)),
      "RIFF",
    );
  },
});

Deno.test({
  name:
    "application exposes Lobotomy Corporation alert resources without authentication",
  permissions: { env: true, read: true },
  fn: async () => {
    const { app } = createApplication();

    const scriptResponse = await app.request(
      "/static/easter-egg/lobotomy-corp/lobotomy-corp.js",
    );
    const stylesheetResponse = await app.request(
      "/static/easter-egg/lobotomy-corp/lobotomy-corp.css",
    );
    const imageResponse = await app.request(
      "/static/easter-egg/lobotomy-corp/assets/images/first-trumpet/tr-corner.png",
    );
    const audioResponse = await app.request(
      "/static/easter-egg/lobotomy-corp/assets/sounds/first-trumpet.wav",
    );
    const script = await scriptResponse.text();
    const stylesheet = await stylesheetResponse.text();
    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
    const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());

    assertEquals(scriptResponse.status, 200);
    assertEquals(script.includes("firsttrumpet"), true);
    assertEquals(script.includes("/[\\s-]+/gu"), true);
    assertEquals(script.includes("lobotomy-corp-alert-close"), true);
    assertEquals(stylesheetResponse.status, 200);
    assertEquals(stylesheet.includes("pointer-events: none"), true);
    assertEquals(stylesheet.includes("1s ease-in-out infinite"), true);
    assertEquals(
      stylesheet.includes("clamp(96px, 19vmin, 495px)"),
      true,
    );
    assertEquals(imageResponse.status, 200);
    assertEquals(imageResponse.headers.get("content-type"), "image/png");
    assertEquals(
      Array.from(imageBytes.slice(0, 8)),
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    assertEquals(audioResponse.status, 200);
    assertEquals(audioResponse.headers.get("content-type"), "audio/wav");
    assertEquals(new TextDecoder().decode(audioBytes.slice(0, 4)), "RIFF");
  },
});

Deno.test("application register page enables name Easter eggs", async () => {
  const { app } = createApplication();

  const registerResponse = await app.request("/register");
  const loginResponse = await app.request("/login");
  const registerHtml = await registerResponse.text();
  const loginHtml = await loginResponse.text();

  assertEquals(
    registerHtml.includes(
      "/static/easter-egg/ace-attorney/ace-attorney.js?v=20260905-general-image-path",
    ),
    true,
  );
  assertEquals(
    registerHtml.includes(
      "/static/easter-egg/ace-attorney/ace-attorney.css?v=20260905-investigations-corners",
    ),
    true,
  );
  assertEquals(
    registerHtml.includes(
      "/static/easter-egg/lobotomy-corp/lobotomy-corp.js?v=20260905-trumpet-alerts",
    ),
    true,
  );
  assertEquals(
    registerHtml.includes(
      "/static/easter-egg/lobotomy-corp/lobotomy-corp.css?v=20260905-trumpet-alerts",
    ),
    true,
  );
  assertEquals(
    registerHtml.includes("data-username-easter-egg-register"),
    true,
  );
  assertEquals(registerHtml.includes('name="displayName"'), true);
  assertEquals(
    registerHtml.includes('name="displayName" autocomplete="name" required'),
    false,
  );
  assertEquals(registerHtml.includes("显示名称"), true);
  assertEquals(loginHtml.includes("data-username-easter-egg-register"), false);
  assertEquals(loginHtml.includes("/static/easter-egg/ace-attorney/"), false);
  assertEquals(loginHtml.includes("/static/easter-egg/lobotomy-corp/"), true);
});
