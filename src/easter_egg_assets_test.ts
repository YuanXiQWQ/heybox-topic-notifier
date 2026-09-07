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
  name: "Lobotomy Corporation audio assets support byte-range seeking",
  permissions: { read: true },
  fn: async () => {
    const response = await lobotomyCorpAssetResponse(
      "Assets/AudioClip/third-trumpet.wav",
      "bytes=12-35",
    );
    const invalidResponse = await lobotomyCorpAssetResponse(
      "Assets/AudioClip/third-trumpet.wav",
      "bytes=999999999-",
    );

    assertEquals(response.status, 206);
    assertEquals(response.headers.get("accept-ranges"), "bytes");
    assertEquals(
      response.headers.get("content-range")?.startsWith("bytes 12-35/"),
      true,
    );
    assertEquals((await response.arrayBuffer()).byteLength, 24);
    assertEquals(invalidResponse.status, 416);
  },
});

Deno.test({
  name: "Lobotomy Corporation Fourth Trumpet audio is available",
  permissions: { read: true },
  fn: async () => {
    const response = await lobotomyCorpAssetResponse(
      "Assets/AudioClip/fourth-trumpet.wav",
    );

    assertEquals(response.status, 200);
    assertEquals(response.headers.get("content-type"), "audio/wav");
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
