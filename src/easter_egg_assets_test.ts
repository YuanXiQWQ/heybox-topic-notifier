/**
 * @file 本文件验证用户名彩蛋资源读取与路径限制。
 */
import { assert, assertEquals } from "./test_helpers.ts";
import {
  aceAttorneyAssetResponse,
  lobotomyCorpAssetResponse,
  lobotomyCorpWhiteNightEventResponse,
} from "./easter_egg_assets.ts";
import {
  whiteNightSpineAssetPaths,
  whiteNightSpineAssetDirectory,
  whiteNightSpineAtlasFile,
  whiteNightSpineRangeTexture,
  whiteNightSpineRuntimePath,
  whiteNightSpineSkeletonFile,
} from "../static/fun/lobotomy-corp/Events/WhiteNightSpine.js";
import {
  plagueDoctorSpineAssetDirectory,
  plagueDoctorSpineAtlasFile,
  plagueDoctorSpinePageFiles,
  plagueDoctorSpineSkeletonFile,
} from "../static/fun/lobotomy-corp/Events/PlagueDoctorSpine.js";

Deno.test({
  name: "WhiteNight Spine 运行时、骨架与白圈资源都能通过彩蛋资源路由读取",
  permissions: { read: true },
  fn: async () => {
    const cases: [string, string][] = [
      ["Events/WhiteNightSpine.js", "text/javascript; charset=utf-8"],
      [whiteNightSpineRuntimePath, "text/javascript; charset=utf-8"],
      [
        `Assets/${whiteNightSpineAssetDirectory}/${whiteNightSpineSkeletonFile}`,
        "application/json; charset=utf-8",
      ],
      [
        `Assets/${whiteNightSpineAssetDirectory}/${whiteNightSpineAtlasFile}`,
        "text/plain; charset=utf-8",
      ],
      [
        `Assets/${whiteNightSpineAssetDirectory}/skeleton.png`,
        "image/png",
      ],
      [`Assets/${whiteNightSpineRangeTexture}`, "image/png"],
      // 疫医骨架：JSON、Atlas 与两页贴图同样走 `Assets/Resources/spinedata` 规则。
      [
        `Assets/${plagueDoctorSpineAssetDirectory}/${plagueDoctorSpineSkeletonFile}`,
        "application/json; charset=utf-8",
      ],
      [
        `Assets/${plagueDoctorSpineAssetDirectory}/${plagueDoctorSpineAtlasFile}`,
        "text/plain; charset=utf-8",
      ],
      ...plagueDoctorSpinePageFiles.map((page): [string, string] => [
        `Assets/${plagueDoctorSpineAssetDirectory}/${page}`,
        "image/png",
      ]),
      [
        "Assets/Resources/sounds/creature/whitenight/WhiteNight_Atk.ogg",
        "audio/ogg",
      ],
    ];
    for (const [assetPath, contentType] of cases) {
      const response = await lobotomyCorpAssetResponse(assetPath);
      assertEquals(response.status, 200, assetPath);
      assertEquals(
        response.headers.get("content-type"),
        contentType,
        assetPath,
      );
    }
  },
});

Deno.test({
  name: "Spine 骨架分页贴图的解析路径不含重复斜杠且可读取",
  permissions: { read: true },
  fn: async () => {
    const paths = whiteNightSpineAssetPaths("/static/fun/lobotomy-corp");
    assertEquals(paths.assetDirectory, "Assets/Resources/spinedata/deathangel");
    assertEquals(paths.pathPrefix, "/static/fun/lobotomy-corp/Assets/Resources/spinedata/");
    assertEquals(paths.atlasPath, "deathangel/skeleton.atlas.txt");
    assertEquals(paths.skeletonPath, "deathangel/skeleton_5.json");

    const atlas = await Deno.readTextFile(
      new URL(
        `../static/fun/lobotomy-corp/${paths.assetDirectory}/${whiteNightSpineAtlasFile}`,
        import.meta.url,
      ),
    );
    const pages = atlas.split(/\r?\n/u).filter((line) =>
      line.endsWith(".png")
    );
    assert(pages.length > 0);
    // `AssetManager` 会把分页贴图拼成「目录前缀 + 父目录 + 页名」，任一段为空都会
    // 产生重复斜杠，资源路由会判为非法路径——这里逐个走一遍真实路由。
    for (const page of pages) {
      const assetPath = `${paths.assetDirectory}/${page}`;
      assert(!assetPath.includes("//"), assetPath);
      const response = await lobotomyCorpAssetResponse(assetPath);
      assertEquals(response.status, 200, assetPath);
    }
  },
});

Deno.test({
  name: "彩蛋事件模块之间的相对导入都能从资源路由取到",
  permissions: { read: true },
  fn: async () => {
    const directory = new URL(
      "../static/fun/lobotomy-corp/Events/",
      import.meta.url,
    );
    for await (const entry of Deno.readDir(directory)) {
      if (!entry.name.endsWith(".js")) continue;
      const source = await Deno.readTextFile(new URL(entry.name, directory));
      for (const match of source.matchAll(/from\s+'\.\/([\w.-]+\.js)'/gu)) {
        const assetPath = `Events/${match[1]}`;
        const response = await lobotomyCorpAssetResponse(assetPath);
        assertEquals(response.status, 200, `${entry.name} → ${assetPath}`);
      }
    }
  },
});

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
    "Plague Doctor module and its tick sound are served to the browser",
  permissions: { read: true },
  fn: async () => {
    const moduleResponse = await lobotomyCorpAssetResponse(
      "Events/PlagueDoctor.js",
    );
    assertEquals(moduleResponse.status, 200);
    assertEquals(
      moduleResponse.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assertEquals(
      (await moduleResponse.text()).includes("createPlagueDoctorEvent"),
      true,
    );
    // 绑定阶段：滴答；完整降临：开场钟声、每名使徒的钟声 + 合唱 + 低语。
    for (
      const sound of [
        "Lucifer_Tick1.ogg",
        "Lucifer_Bell0.ogg",
        "Choir1.ogg",
        "Lucifer_Apostle_Whisper0.ogg",
        "Lucifer_Apostle_Whisper1.ogg",
        "Lucifer_Apostle_Whisper2.ogg",
        "Lucifer_Advent1.ogg",
      ]
    ) {
      const soundResponse = await lobotomyCorpAssetResponse(
        `Assets/Resources/sounds/creature/deathangel/${sound}`,
      );
      assertEquals(soundResponse.status, 200, `${sound} 应可下载`);
      assertEquals(
        soundResponse.headers.get("content-type"),
        "audio/ogg",
        `${sound} 应以 audio/ogg 下发`,
      );
    }
  },
});

Deno.test({
  name:
    "Black Forest event module, CG images, sounds, eggs and gift are served",
  permissions: { read: true },
  fn: async () => {
    const moduleResponse = await lobotomyCorpAssetResponse(
      "Events/BlackForest.js",
    );
    assertEquals(moduleResponse.status, 200);
    assertEquals(
      moduleResponse.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assert(
      (await moduleResponse.text()).includes("createBlackForestEvent"),
    );
    // NarrationCanvas 的三张静态图层与每一句 CG 的状态图。
    for (
      const image of [
        "Background_0.png",
        "BackGroundFoward.png",
        "FrameUpper.png",
        "GatewayAppear.png",
        "BigBirdArrived.png",
        "LongBirdArrived.png",
        "SmallBirdArrived.png",
        "BossBirdAppear.png",
        "BigBirdDead.png",
        "LongBirdDead.png",
        "SmallBirdDead.png",
        "BossBirdDead.png",
      ]
    ) {
      const response = await lobotomyCorpAssetResponse(
        `Assets/Texture2D/${image}`,
      );
      assertEquals(response.status, 200, `${image} 应可下载`);
      assertEquals(
        response.headers.get("content-type"),
        "image/png",
        `${image} 应以 image/png 下发`,
      );
    }
    // BossBird_stat.txt 的 appear / dead 音效。
    for (const sound of ["BossBird_Birth.ogg", "BossBird_Dead.ogg"]) {
      const response = await lobotomyCorpAssetResponse(
        `Assets/Resources/sounds/creature/BossBird/${sound}`,
      );
      assertEquals(response.status, 200, `${sound} 应可下载`);
      assertEquals(response.headers.get("content-type"), "audio/ogg");
    }
    // 三颗鸟蛋与「破晓」饰品贴图。
    for (const egg of ["BigBirdEgg.png", "LongBirdEgg.png", "SmallBirdEgg.png"]) {
      const response = await lobotomyCorpAssetResponse(
        `Assets/Resources/sprites/creaturesprite/bossbird/egg/${egg}`,
      );
      assertEquals(response.status, 200, `${egg} 应可下载`);
      assertEquals(response.headers.get("content-type"), "image/png");
    }
    const gift = await lobotomyCorpAssetResponse(
      "Assets/Resources/sprites/worker/equipment/attachment/BossBirdWing.png",
    );
    assertEquals(gift.status, 200);
    assertEquals(gift.headers.get("content-type"), "image/png");
  },
});

Deno.test({
  name:
    "AdventLight module and its original Copy sprite are served to the browser",
  permissions: { read: true },
  fn: async () => {
    const moduleResponse = await lobotomyCorpAssetResponse(
      "Events/AdventLight.js",
    );
    assertEquals(moduleResponse.status, 200);
    assertEquals(
      moduleResponse.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assert((await moduleResponse.text()).includes("createDeathAngelAdventLight"));

    const spriteResponse = await lobotomyCorpAssetResponse(
      "Assets/Resources/texture/particle/Copy.png",
    );
    assertEquals(spriteResponse.status, 200);
    assertEquals(spriteResponse.headers.get("content-type"), "image/png");
    // PNG 头：89 50 4E 47。
    assertEquals(
      Array.from(new Uint8Array(await spriteResponse.arrayBuffer()).slice(0, 4)),
      [0x89, 0x50, 0x4e, 0x47],
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

    assert(css.includes("rotate(109.816715deg)"));
    assert(css.includes("width: var(--lobotomy-corp-ray-width)"));
    assert(css.includes("height: var(--lobotomy-corp-ray-height)"));
    assert(css.includes("mask-mode: luminance"));
    assertEquals(
      css.match(/mix-blend-mode: plus-lighter;/g)?.length ?? 0,
      1,
    );
    assert(!(css.includes("isolation: isolate")));
    assertEquals(
      css.includes(
        "background-color: rgb(var(--lobotomy-corp-ray-color))",
      ),
      true,
    );
    assert(css.includes("25.509644%"));
    assert(css.includes("49.319458%"));
    assert(css.includes("67.353323%"));
  },
});

Deno.test({
  name: "WebM entities support MIME and byte-range playback",
  permissions: { read: true },
  fn: async () => {
    const normal = await lobotomyCorpAssetResponse(
      "Assets/Resources/sprites/effect/touchwarning.webm",
    );
    const death = await lobotomyCorpAssetResponse(
      "Assets/Resources/sprites/effect/touchkill.webm",
    );
    const range = await lobotomyCorpAssetResponse(
      "Assets/Resources/sprites/effect/touchkill.webm",
      "bytes=0-31",
    );

    assertEquals(normal.status, 200);
    assertEquals(normal.headers.get("content-type"), "video/webm");
    assertEquals(death.status, 200);
    assertEquals(death.headers.get("content-type"), "video/webm");
    // WebM 是 EBML 容器，文件头固定为 1A 45 DF A3。
    const webmSignature = [0x1A, 0x45, 0xDF, 0xA3];
    assertEquals(
      Array.from(new Uint8Array(await death.arrayBuffer()).slice(0, 4)),
      webmSignature,
    );
    assertEquals(range.status, 206);
    assertEquals(range.headers.get("accept-ranges"), "bytes");
    const rangeBytes = new Uint8Array(await range.arrayBuffer());
    assertEquals(rangeBytes.byteLength, 32);
    assertEquals(Array.from(rangeBytes.slice(0, 4)), webmSignature);
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
