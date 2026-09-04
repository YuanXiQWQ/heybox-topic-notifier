/**
 * @file 本文件验证用户名彩蛋资源读取与路径限制。
 */
import { assertEquals } from "./test_helpers.ts";
import { aceAttorneyAssetResponse } from "./easter_egg_assets.ts";

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
