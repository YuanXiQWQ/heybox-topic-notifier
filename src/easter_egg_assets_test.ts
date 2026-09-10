/**
 * @file 本文件验证用户名彩蛋资源读取与路径限制。
 */
import { assertEquals } from "./test_helpers.ts";
import {
  aceAttorneyAssetResponse,
  lobotomyCorpAssetResponse,
  lobotomyCorpWhiteNightEventResponse,
} from "./easter_egg_assets.ts";

Deno.test({
  name: "Easter egg asset response rejects traversal and unknown files",
  permissions: { read: true },
  fn: async () => {
    const traversalResponse = await aceAttorneyAssetResponse(
      "../ace-attorney.js",
    );
    const nestedTraversalResponse = await aceAttorneyAssetResponse(
      "AA123/../../ace-attorney.js",
    );
    const unknownResponse = await aceAttorneyAssetResponse(
      "Common/Derived/images/zh/unknown.png",
    );

    assertEquals(traversalResponse.status, 404);
    assertEquals(nestedTraversalResponse.status, 404);
    assertEquals(unknownResponse.status, 404);
  },
});

Deno.test({
  name: "WhiteNight event module is served as a JavaScript module",
  permissions: { read: true },
  fn: async () => {
    const response = await lobotomyCorpWhiteNightEventResponse();

    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assertEquals(
      (await response.text()).includes("createWhiteNightEvent"),
      true,
    );
  },
});

Deno.test({
  name:
    "CanvasScaler module is served to the browser with a JavaScript MIME type",
  permissions: { read: true },
  fn: async () => {
    const response = await lobotomyCorpAssetResponse("Events/CanvasScaler.js");

    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assertEquals(
      (await response.text()).includes("lobotomyCorpCanvasScaleForViewport"),
      true,
    );
  },
});

Deno.test({
  name:
    "Lobotomy Corporation OGG assets support normal and byte-range responses",
  permissions: { read: true },
  fn: async () => {
    const firstResponse = await lobotomyCorpAssetResponse(
      "Assets/Resources/sounds/bgm/emergency01_mast.ogg",
    );
    const secondResponse = await lobotomyCorpAssetResponse(
      "Assets/Resources/sounds/bgm/emergency02_mast.ogg",
    );
    const normalResponse = await lobotomyCorpAssetResponse(
      "Assets/Resources/sounds/bgm/emergency03_mast.ogg",
    );
    const rangeResponse = await lobotomyCorpAssetResponse(
      "Assets/Resources/sounds/bgm/emergency03_mast.ogg",
      "bytes=12-35",
    );
    const invalidResponse = await lobotomyCorpAssetResponse(
      "Assets/Resources/sounds/bgm/emergency03_mast.ogg",
      "bytes=999999999-",
    );

    assertEquals(firstResponse.status, 200);
    assertEquals(secondResponse.status, 200);
    assertEquals(normalResponse.status, 200);
    assertEquals(normalResponse.headers.get("content-type"), "audio/ogg");
    assertEquals(rangeResponse.status, 206);
    assertEquals(rangeResponse.headers.get("accept-ranges"), "bytes");
    assertEquals(
      rangeResponse.headers.get("content-range")?.startsWith("bytes 12-35/"),
      true,
    );
    assertEquals((await rangeResponse.arrayBuffer()).byteLength, 24);
    assertEquals(invalidResponse.status, 416);
  },
});

Deno.test({
  name:
    "Lobotomy Corporation migrated original and WarmNest audio is available",
  permissions: { read: true },
  fn: async () => {
    const whiteNightResponses = await Promise.all(
      [1, 2, 3].map((index) =>
        lobotomyCorpAssetResponse(
          `Assets/Resources/sounds/creature/whitenight/WhiteNight_Dead${index}.ogg`,
        )
      ),
    );
    const warmNestResponse = await lobotomyCorpAssetResponse(
      "Assets/Resources/sounds/bgm/emergency04_mast.wav",
    );

    whiteNightResponses.forEach((response) => {
      assertEquals(response.status, 200);
      assertEquals(response.headers.get("content-type"), "audio/ogg");
    });
    assertEquals(warmNestResponse.status, 200);
    assertEquals(warmNestResponse.headers.get("content-type"), "audio/wav");
  },
});

Deno.test({
  name:
    "WhiteNight Confess serves the Material MainTex and rejects the unrelated ray",
  permissions: { read: true },
  fn: async () => {
    const actual = await lobotomyCorpAssetResponse(
      "Assets/Texture2D/CFX3_T_RayStraight.png",
    );
    const unrelated = await lobotomyCorpAssetResponse(
      "Assets/Texture2D/CFXM4_T_RayStraight AB.png",
    );

    assertEquals(actual.status, 200);
    assertEquals(actual.headers.get("content-type"), "image/png");
    assertEquals(unrelated.status, 404);
  },
});

Deno.test({
  name:
    "WhiteNight Confess renders the prefab Stretched Billboard and ADD blend",
  permissions: { read: true },
  fn: async () => {
    const css = await Deno.readTextFile(
      new URL(
        "../static/fun/lobotomy-corp/lobotomy-corp.css",
        import.meta.url,
      ),
    );

    assertEquals(css.includes("rotate(109.816715deg)"), true);
    assertEquals(css.includes("width: var(--lobotomy-corp-ray-width)"), true);
    assertEquals(css.includes("height: var(--lobotomy-corp-ray-height)"), true);
    assertEquals(css.includes("mask-mode: luminance"), true);
    assertEquals(
      css.match(/mix-blend-mode: plus-lighter;/g)?.length ?? 0,
      1,
    );
    assertEquals(css.includes("isolation: isolate"), false);
    assertEquals(
      css.includes(
        "background-color: rgb(var(--lobotomy-corp-ray-color))",
      ),
      true,
    );
    assertEquals(css.includes("25.509644%"), true);
    assertEquals(css.includes("49.319458%"), true);
    assertEquals(css.includes("67.353323%"), true);
  },
});

Deno.test({
  name: "WhiteNight WebM entities support MIME and byte-range playback",
  permissions: { read: true },
  fn: async () => {
    const normal = await lobotomyCorpAssetResponse(
      "Assets/Resources/sprites/creaturesprite/deathangel/WhiteNight_Escape_Idle.webm",
    );
    const death = await lobotomyCorpAssetResponse(
      "Assets/Resources/sprites/creaturesprite/deathangel/WhiteNight_Confess_Dead.webm",
    );
    const range = await lobotomyCorpAssetResponse(
      "Assets/Resources/sprites/creaturesprite/deathangel/WhiteNight_Confess_Dead.webm",
      "bytes=0-31",
    );

    assertEquals(normal.status, 200);
    assertEquals(normal.headers.get("content-type"), "video/webm");
    assertEquals(death.status, 200);
    assertEquals(death.headers.get("content-type"), "video/webm");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await death.arrayBuffer(),
    );
    const deathHash = Array.from(
      new Uint8Array(digest),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("").toUpperCase();
    assertEquals(
      deathHash,
      "8BBC9197C2028C3C61FD778B1557470F0D51B920E6C9EB60CE87CDB1CB4A82A0",
    );
    assertEquals(range.status, 206);
    assertEquals(range.headers.get("accept-ranges"), "bytes");
    assertEquals((await range.arrayBuffer()).byteLength, 32);
  },
});

Deno.test({
  name: "Easter egg JSON and event modules use safe MIME types",
  permissions: { read: true },
  fn: async () => {
    const characters = await aceAttorneyAssetResponse("Data/Characters.json");
    const event = await aceAttorneyAssetResponse(
      "Events/CourtroomNameChange.js",
    );
    const locale = await lobotomyCorpAssetResponse("Locales/zh-CN.json");

    assertEquals(characters.status, 200);
    assertEquals(
      characters.headers.get("content-type"),
      "application/json; charset=utf-8",
    );
    assertEquals(
      event.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assertEquals(
      locale.headers.get("content-type"),
      "application/json; charset=utf-8",
    );
  },
});
