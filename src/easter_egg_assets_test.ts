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
    const unknownResponse = await aceAttorneyAssetResponse(
      "images/zh/unknown.png",
    );

    assertEquals(traversalResponse.status, 404);
    assertEquals(unknownResponse.status, 404);
  },
});

Deno.test({
  name: "Lobotomy Corporation audio assets support byte-range seeking",
  permissions: { read: true },
  fn: async () => {
    const response = await lobotomyCorpAssetResponse(
      "sounds/third-trumpet.wav",
      "bytes=12-35",
    );
    const invalidResponse = await lobotomyCorpAssetResponse(
      "sounds/third-trumpet.wav",
      "bytes=999999999-",
    );

    assertEquals(response.status, 206);
    assertEquals(response.headers.get("accept-ranges"), "bytes");
    assertEquals(response.headers.get("content-range")?.startsWith("bytes 12-35/"), true);
    assertEquals((await response.arrayBuffer()).byteLength, 24);
    assertEquals(invalidResponse.status, 416);
  },
});
