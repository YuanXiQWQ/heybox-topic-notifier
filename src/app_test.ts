/**
 * @file 本文件验证应用装配层的通用中间件行为。
 */
import { createApplication } from "./app.ts";
import { getMessages } from "./locales/index.ts";
import { assert, assertEquals } from "./test_helpers.ts";

Deno.test("application adds baseline security headers", async () => {
  const { app } = createApplication();

  const response = await app.request("https://example.com/login");
  const contentSecurityPolicy =
    response.headers.get("content-security-policy") ?? "";

  assertEquals(response.status, 200);
  assert(contentSecurityPolicy.includes("default-src 'self'"));
  assert(contentSecurityPolicy.includes("frame-ancestors 'none'"));
  assertEquals(
    contentSecurityPolicy.includes(
      "frame-src https://challenges.cloudflare.com https://accounts.google.com/gsi/",
    ),
    true,
  );
  assert(contentSecurityPolicy.includes("object-src 'none'"));
  assertEquals(
    contentSecurityPolicy.includes(
      "img-src 'self' https://cdn.max-c.com data: blob:",
    ),
    true,
  );
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
  assert(response.headers.get("content-security-policy") !== null);
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

Deno.test("application renders the styled 404 page for unmatched routes", async () => {
  const { app } = createApplication();
  // POST /healthz 是少数无需登录就能走到路由匹配的请求：该路径豁免认证，但没有
  // POST 路由，因此会落在 notFound 处理器上。已登录用户访问任意失效地址走同一条路径。
  const response = await app.request("/healthz", { method: "POST" });
  const html = await response.text();

  assertEquals(response.status, 404);
  assert(html.includes('class="not-found"'));
  assert(html.includes("<p class=\"not-found-code\">404</p>"));
  assert(html.includes(getMessages("zh-CN").notFoundTitle));
});

Deno.test("unmatched paths send anonymous visitors to the login page first", async () => {
  const { app } = createApplication();
  const response = await app.request("/definitely-missing");

  // 未登录访客先被认证中间件送去登录页，登录后按 returnTo 回到原地址再看到 404。
  assertEquals(response.status, 303);
  assertEquals(
    response.headers.get("location"),
    "/login?locale=zh-CN&returnTo=%2Fdefinitely-missing",
  );
});

Deno.test({
  name:
    "application exposes username Easter egg resources without authentication",
  permissions: { env: true, read: true },
  fn: async () => {
    const { app } = createApplication();

    const coordinatorResponse = await app.request(
      "/static/fun/coordinator.js",
    );
    const scriptResponse = await app.request(
      "/static/fun/ace-attorney/ace-attorney.js",
    );
    const eventResponse = await app.request(
      "/static/fun/ace-attorney/Events/CourtroomNameChange.js",
    );
    const stylesheetResponse = await app.request(
      "/static/fun/ace-attorney/ace-attorney.css",
    );
    const imageResponse = await app.request(
      "/static/fun/ace-attorney/Common/Derived/images/zh-CN/igiari.png",
    );
    const subtitleUiResponses = await Promise.all([
      "/static/fun/ace-attorney/AA123/StreamingAssets/menu/common/talk_bg.png",
      "/static/fun/ace-attorney/Common/Derived/AA456/text-box-ui/text_box_ui.png",
      "/static/fun/ace-attorney/Common/Derived/AA456/text-box-ui/name_bg_tiled.png",
      "/static/fun/ace-attorney/Common/Derived/images/interjections/zh-CN.png",
      "/static/fun/ace-attorney/Common/Derived/images/interjections/zh-TW.png",
      "/static/fun/ace-attorney/Common/Derived/AAI12/text-box-ui/MessageWindow_TextBase_R_game.png",
    ].map((assetPath) => app.request(assetPath)));
    const audioResponse = await app.request(
      "/static/fun/ace-attorney/AA123/StreamingAssets/Sound/se/strm/voice/zh-CN/phoenix-wright/igiari.wav",
    );
    const soundEffectResponse = await app.request(
      "/static/fun/ace-attorney/Common/Derived/sounds/sfx-blipmale.wav",
    );
    const script = await scriptResponse.text();
    const event = await eventResponse.text();
    const coordinator = await coordinatorResponse.text();
    const normalizedEvent = event.replaceAll("\r\n", "\n");
    const stylesheet = await stylesheetResponse.text();
    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
    const soundEffectBytes = new Uint8Array(
      await soundEffectResponse.arrayBuffer(),
    );

    assertEquals(coordinatorResponse.status, 200);
    assert(coordinator.includes("previousEasterEgg?.stop()"));
    assertEquals(scriptResponse.status, 200);
    assertEquals(
      script.includes("ace-attorney-easter-egg-data"),
      true,
    );
    assertEquals(
      event.includes(
        'continueButton.className = "username-easter-egg-continue"',
      ),
      true,
    );
    assertEquals(
      event.includes("username-easter-egg-theme-${character.theme}"),
      true,
    );
    assertEquals(
      event.includes("Common/Derived/images/interjections/${imageLocale}.png"),
      true,
    );
    assertEquals(
      normalizedEvent.includes(
        'choiceLocked = true;\n        actions.hidden = true;\n        overlay.classList.remove("is-choosing");',
      ),
      true,
    );
    assertEquals(
      event.includes('soundEffectSource("sfx-pichoop")'),
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
    assert(stylesheet.includes("left: 50%;"));
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
        "/AA123/StreamingAssets/menu/common/talk_bg.png",
      ),
      true,
    );
    assertEquals(
      stylesheet.includes(
        "/AA123/StreamingAssets/menu/common/select_arrow.png",
      ),
      true,
    );
    assertEquals(
      stylesheet.includes(
        "/Common/Derived/AA456/text-box-ui/text_box_ui.png",
      ),
      true,
    );
    assertEquals(
      stylesheet.includes(
        "/Common/Derived/AAI12/text-box-ui/MessageWindow_TextBase_R_game.png",
      ),
      true,
    );
    assertEquals(
      stylesheet.includes(
        "/Common/Derived/AAI12/text-box-ui/MessageWindow_NameBase_R.png",
      ),
      true,
    );
    assertEquals(
      stylesheet.includes(
        "/Common/Derived/AAI12/text-box-ui/sactx-0-1024x64-BC7-Message-a8bee319.png",
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
    assert(stylesheet.includes("border-color: transparent"));
    assertEquals(
      stylesheet.includes("background-color: rgb(255 218 82 / 0.88)"),
      true,
    );
    assert(stylesheet.includes("height: 1px;"));
    assertEquals(
      stylesheet.includes(
        ':root[dir="rtl"] .username-easter-egg-theme-aa456 .username-easter-egg-speaker::before',
      ),
      true,
    );
    assert(stylesheet.includes("transform: scaleX(-1);"));
    assertEquals(
      stylesheet.includes("clamp(26px, 2.8vw, 38px)"),
      true,
    );
    assert(stylesheet.includes("padding: 24px;"));
    assert(stylesheet.includes("max-height: 100%;"));
    assert(stylesheet.includes("max-width: 100%;"));
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
      "/static/fun/lobotomy-corp/lobotomy-corp.js",
    );
    const stylesheetResponse = await app.request(
      "/static/fun/lobotomy-corp/lobotomy-corp.css",
    );
    const canvasScalerResponse = await app.request(
      "/static/fun/lobotomy-corp/Events/CanvasScaler.js",
    );
    const dontTouchMeResponse = await app.request(
      "/static/fun/lobotomy-corp/Events/DontTouchMe.js",
    );
    const dangerScoreResponse = await app.request(
      "/static/fun/lobotomy-corp/Events/DangerScore.js",
    );
    const shutdownVideoResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/MovieTexture/DontTouchMeGameShutdown.webm",
    );
    const shutdownSoundResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Resources/sounds/creature/dont_touch_me/touch_off.ogg",
    );
    const killEffectResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Resources/sprites/effect/touchkill.webm",
    );
    const deadSoundResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Resources/sounds/creature/dont_touch_me/touch_dead1.ogg",
    );
    const warningEffectResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Resources/sprites/effect/touchwarning.webm",
    );
    const moodDownSoundResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Resources/sounds/creature/dont_touch_me/touch_moodDown.ogg",
    );
    const audioResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Resources/sounds/bgm/emergency01_mast.ogg",
    );
    const fontResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Font/norwester.otf",
    );
    const panelFontResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Font/BMDOHYEON.ttf",
    );
    const restartFontResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Font/norwester_new.ttf",
    );
    const russianRestartFontResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Font/norwester_ru.ttf",
    );
    const triangleResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Sprite/Triangle_1.png",
    );
    const riskResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Sprite/Risk_3.png",
    );
    const fourthRiskResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Sprite/MiddleArea_4_27.png",
    );
    const endButtonResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Sprite/End_1.png",
    );
    const valveResponse = await app.request(
      "/static/fun/lobotomy-corp/Assets/Sprite/Valve.png",
    );
    const script = await scriptResponse.text();
    const stylesheet = await stylesheetResponse.text();
    const frameOutterRule = stylesheet.match(
      /\.lobotomy-corp-top-panel-frame-outter\s*\{[^}]+\}/u,
    )?.[0] ?? "";
    const restartButtonRule = stylesheet.match(
      /button\.lobotomy-corp-top-panel-action-button\s*\{[^}]+\}/u,
    )?.[0] ?? "";
    const restartButtonPressedRule = stylesheet.match(
      /button\.lobotomy-corp-top-panel-action-button:active:not\(:disabled\)\s*\{[^}]+\}/u,
    )?.[0] ?? "";
    const trumpetLevelContentRule = stylesheet.match(
      /\.lobotomy-corp-alert-trumpet-level-content\s*\{[^}]+\}/u,
    )?.[0] ?? "";
    const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());

    assertEquals(scriptResponse.status, 200);
    assert(script.includes("firsttrumpet"));
    assert(script.includes("/[\\s-]+/gu"));
    assert(script.includes("lobotomy-corp-top-panel"));
    assert(!(script.includes("lobotomy-corp-alert-close")));
    assert(!(script.includes("data-lobotomy-corp-restart-day")));
    assert(!(script.includes('textContent = "结束警报"')));
    assert(!(script.includes("脑叶公司警报控制面板")));
    assert(script.includes("[0, 234, 219]"));
    assert(script.includes("[5, 174, 164]"));
    assertEquals(
      script.includes('addEventListener("click", finishAlert)'),
      false,
    );
    assertEquals(
      script.includes('addEventListener("ended", finishAlert)'),
      false,
    );
    assertEquals(stylesheetResponse.status, 200);
    assertEquals(canvasScalerResponse.status, 200);
    assertEquals(
      canvasScalerResponse.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assertEquals(
      (await canvasScalerResponse.text()).includes(
        "lobotomyCorpCanvasScaleForViewport",
      ),
      true,
    );
    assertEquals(dontTouchMeResponse.status, 200);
    assertEquals(
      dontTouchMeResponse.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assertEquals(
      (await dontTouchMeResponse.text()).includes(
        "createDontTouchMeShutdown",
      ),
      true,
    );
    assertEquals(dangerScoreResponse.status, 200);
    assertEquals(
      dangerScoreResponse.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assertEquals(
      (await dangerScoreResponse.text()).includes(
        "escapeAllDangerContribution",
      ),
      true,
    );
    assertEquals(shutdownVideoResponse.status, 200);
    assertEquals(
      shutdownVideoResponse.headers.get("content-type"),
      "video/webm",
    );
    assertEquals(
      shutdownVideoResponse.headers.get("accept-ranges"),
      "bytes",
    );
    assertEquals(shutdownSoundResponse.status, 200);
    assertEquals(
      shutdownSoundResponse.headers.get("content-type"),
      "audio/ogg",
    );
    assertEquals(killEffectResponse.status, 200);
    assertEquals(killEffectResponse.headers.get("content-type"), "video/webm");
    assertEquals(deadSoundResponse.status, 200);
    assertEquals(deadSoundResponse.headers.get("content-type"), "audio/ogg");
    assertEquals(warningEffectResponse.status, 200);
    assertEquals(
      warningEffectResponse.headers.get("content-type"),
      "video/webm",
    );
    assertEquals(moodDownSoundResponse.status, 200);
    assertEquals(
      moodDownSoundResponse.headers.get("content-type"),
      "audio/ogg",
    );
    assert(stylesheet.includes("pointer-events: none"));
    assertEquals(
      stylesheet.includes("LobotomyNorwester"),
      true,
    );
    assert(stylesheet.includes("cubic-bezier(0.333333, 0,"));
    assert(stylesheet.includes("opacity: 0.4"));
    assert(stylesheet.includes("opacity: 0.8"));
    assert(stylesheet.includes("LobotomyRestartTitle"));
    assert(stylesheet.includes("LobotomyRestartTitleKorean"));
    assert(stylesheet.includes("LobotomyRestartTitleRussian"));
    assert(stylesheet.includes("Risk_Frame_Outter.png"));
    assert(script.includes("End_1.png"));
    assert(!(stylesheet.includes("background-blend-mode")));
    assert(stylesheet.includes("background: transparent"));
    assert(stylesheet.includes("border-radius: 0"));
    assert(stylesheet.includes("box-shadow: none"));
    assert(stylesheet.includes("font-weight: normal"));
    assert(stylesheet.includes("align-items: center"));
    assert(stylesheet.includes("justify-content: center"));
    assert(trumpetLevelContentRule.includes("line-height: normal"));
    assert(!(trumpetLevelContentRule.includes("line-height: 1")));
    assert(stylesheet.includes("min-height: 0"));
    assert(frameOutterRule.includes("height: 188px"));
    assert(frameOutterRule.includes("width: 887px"));
    assert(restartButtonRule.includes("height: 109px"));
    assert(restartButtonRule.includes("width: 812px"));
    assert(restartButtonRule.includes("left: 50%"));
    assert(restartButtonRule.includes("top: 50%"));
    assertEquals(
      restartButtonRule.includes(
        "--lobotomy-corp-restart-anchored-position-x: -2.5px",
      ),
      true,
    );
    assertEquals(
      restartButtonRule.includes(
        "--lobotomy-corp-restart-anchored-position-y: 12px",
      ),
      true,
    );
    assertEquals(
      restartButtonRule.includes(
        "calc(-50% + var(--lobotomy-corp-restart-anchored-position-x))",
      ),
      true,
    );
    assertEquals(
      restartButtonRule.includes(
        "calc(-50% - var(--lobotomy-corp-restart-anchored-position-y))",
      ),
      true,
    );
    assertEquals(
      restartButtonPressedRule.includes(
        "--lobotomy-corp-restart-anchored-position-y: 5px",
      ),
      true,
    );
    assert(!(stylesheet.includes("top: 52px")));
    assert(!(stylesheet.includes("top: 45px")));
    assert(!(stylesheet.includes("calc(50% - 408.5px)")));
    assertEquals(
      stylesheet.includes(
        "button.lobotomy-corp-top-panel-action-button:hover:not(:disabled)",
      ),
      true,
    );
    assert(stylesheet.includes("lobotomy-corp-top-panel-appear"));
    assert(!(stylesheet.includes("clamp(96px, 19vmin, 495px)")));
    assert(!(stylesheet.includes("rotate(90deg)")));
    assert(!(stylesheet.includes("rotate(180deg)")));
    assertEquals(audioResponse.status, 200);
    assertEquals(audioResponse.headers.get("content-type"), "audio/ogg");
    assertEquals(new TextDecoder().decode(audioBytes.slice(0, 4)), "OggS");
    assertEquals(fontResponse.status, 200);
    assertEquals(fontResponse.headers.get("content-type"), "font/otf");
    assertEquals(panelFontResponse.status, 200);
    assertEquals(panelFontResponse.headers.get("content-type"), "font/ttf");
    assertEquals(restartFontResponse.status, 200);
    assertEquals(restartFontResponse.headers.get("content-type"), "font/ttf");
    assertEquals(russianRestartFontResponse.status, 200);
    assertEquals(
      russianRestartFontResponse.headers.get("content-type"),
      "font/ttf",
    );
    assertEquals(triangleResponse.headers.get("content-type"), "image/png");
    assertEquals(riskResponse.headers.get("content-type"), "image/png");
    assertEquals(fourthRiskResponse.status, 200);
    assertEquals(fourthRiskResponse.headers.get("content-type"), "image/png");
    assertEquals(endButtonResponse.headers.get("content-type"), "image/png");
    assertEquals(valveResponse.headers.get("content-type"), "image/png");
  },
});

Deno.test("application auth pages do not load name Easter eggs", async () => {
  const { app } = createApplication();

  const registerResponse = await app.request("/register");
  const loginResponse = await app.request("/login");
  const registerHtml = await registerResponse.text();
  const loginHtml = await loginResponse.text();

  assert(!(registerHtml.includes('name="displayName"')));
  assert(!(registerHtml.includes("显示名称")));
  assertEquals(
    registerHtml.includes("data-username-easter-egg-register"),
    false,
  );
  assert(!(loginHtml.includes("data-username-easter-egg-register")));
  assert(!(loginHtml.includes("/static/fun/ace-attorney/")));
  assert(!(loginHtml.includes("/static/fun/lobotomy-corp/")));
  assertEquals(
    registerHtml.includes("/static/fun/ace-attorney/"),
    false,
  );
  assertEquals(
    registerHtml.includes("/static/fun/lobotomy-corp/"),
    false,
  );
});
