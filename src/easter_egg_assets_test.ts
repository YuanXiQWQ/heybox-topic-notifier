/**
 * @file 本文件验证用户名彩蛋资源读取与路径限制。
 */
import { assertEquals } from "./test_helpers.ts";
import {
  aceAttorneyAssetResponse,
  lobotomyCorpAssetResponse,
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
  name: "Lobotomy Corporation OGG assets support normal and byte-range responses",
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
  name: "Lobotomy Corporation migrated original and WarmNest audio is available",
  permissions: { read: true },
  fn: async () => {
    const whiteNightResponse = await lobotomyCorpAssetResponse(
      "Assets/Resources/sounds/creature/whitenight/WhiteNight_Dead1.ogg",
    );
    const warmNestResponse = await lobotomyCorpAssetResponse(
      "Assets/Resources/sounds/bgm/emergency04_mast.wav",
    );

    assertEquals(whiteNightResponse.status, 200);
    assertEquals(whiteNightResponse.headers.get("content-type"), "audio/ogg");
    assertEquals(warmNestResponse.status, 200);
    assertEquals(warmNestResponse.headers.get("content-type"), "audio/wav");
  },
});

Deno.test({
  name: "Easter egg JSON and event modules use safe MIME types",
  permissions: { read: true },
  fn: async () => {
    const characters = await aceAttorneyAssetResponse("Data/Characters.json");
    const event = await aceAttorneyAssetResponse("Events/CourtroomNameChange.js");
    const locale = await lobotomyCorpAssetResponse("Locales/zh-CN.json");

    assertEquals(characters.status, 200);
    assertEquals(characters.headers.get("content-type"), "application/json; charset=utf-8");
    assertEquals(event.headers.get("content-type"), "text/javascript; charset=utf-8");
    assertEquals(locale.headers.get("content-type"), "application/json; charset=utf-8");
  },
});
