/** @file 疫医转变演出的实时骨架资源、时序与降级回归测试。 */
import { assert, assertEquals, assertStrictEquals } from "./test_helpers.ts";
import { Element } from "./test_harness.ts";
import {
  createPlagueDoctorSpineStage,
  plagueDoctorAdventCamera,
  plagueDoctorAdventCameraTarget,
  plagueDoctorAdventEyeSpritePlacement,
  plagueDoctorAdventEyeSpriteUv,
  plagueDoctorAdventEyeState,
  plagueDoctorAdventEyeTimings,
  plagueDoctorAdventWhiteNightAnimation,
  plagueDoctorAdventWhiteNightAssetPaths,
  plagueDoctorAdventWhiteNightRig,
  plagueDoctorAdventWhiteNightSeconds,
  plagueDoctorSpineAnimation,
  plagueDoctorSpineAssetDirectory,
  plagueDoctorSpineAssetPaths,
  plagueDoctorSpineAtlasFile,
  plagueDoctorSpineEyeSlots,
  plagueDoctorSpineEyeSprite,
  plagueDoctorSpineHiddenSlots,
  plagueDoctorSpinePageFiles,
  plagueDoctorSpineRig,
  plagueDoctorSpineRuntimePath,
  plagueDoctorSpineSkeletonFile,
  plagueDoctorSpineWingSlots,
} from "../static/fun/lobotomy-corp/Events/PlagueDoctorSpine.js";

/** static 下彩蛋模块的公开根路径。 */
const moduleRoot = "/static/fun/lobotomy-corp";

/** 骨架数据相对 `Assets` 的目录。 */
const assetDirectory = `Assets/${plagueDoctorSpineAssetDirectory}`;

/**
 * 读取 static 下的文本资源。
 *
 * @param {string} relativePath 相对彩蛋模块根路径的文件路径。
 * @return {string} 文件内容。
 */
function readAsset(relativePath: string): string {
  return Deno.readTextFileSync(
    new URL(`../static/fun/lobotomy-corp/${relativePath}`, import.meta.url),
  );
}

/**
 * 断言两个数字在容差内相等。
 *
 * @param {number} actual 实际值。
 * @param {number} expected 期望值。
 * @param {number} tolerance 容差。
 */
function assertClose(
  actual: number,
  expected: number,
  tolerance: number,
): void {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected} ± ${tolerance}, got ${actual}`,
  );
}

/**
 * 把测试替身断言为宿主文档类型。
 *
 * @param {object} value 测试替身。
 * @return {Document} 宿主文档类型。
 */
function asDocument(value: object): Document {
  return value as unknown as Document;
}

Deno.test("Plague Doctor Spine：资源路径指向解包工程的骨架与两页贴图", () => {
  const paths = plagueDoctorSpineAssetPaths(moduleRoot);
  assertEquals(
    paths.assetDirectory,
    "Assets/Resources/spinedata/plaguedoctor",
  );
  assertEquals(paths.pathPrefix, `${moduleRoot}/Assets/`);
  assertEquals(
    paths.atlasPath,
    `${plagueDoctorSpineAssetDirectory}/${plagueDoctorSpineAtlasFile}`,
  );
  assertEquals(
    paths.skeletonPath,
    `${plagueDoctorSpineAssetDirectory}/${plagueDoctorSpineSkeletonFile}`,
  );
  // 两副骨架共用同一个 AssetManager，白夜骨架的相对路径同样带 shakedata 一级。
  const whiteNight = plagueDoctorAdventWhiteNightAssetPaths(moduleRoot);
  assertEquals(
    whiteNight.skeletonPath,
    "Resources/spinedata/deathangel/skeleton_5.json",
  );
  assertEquals(
    whiteNight.atlasPath,
    "Resources/spinedata/deathangel/skeleton.atlas.txt",
  );
});

Deno.test("Plague Doctor Spine：Atlas 分页与骨架动画随仓库分发", () => {
  const atlas = readAsset(`${assetDirectory}/${plagueDoctorSpineAtlasFile}`);
  const pages = atlas
    .split(/\r?\n/u)
    .filter((line) => /^skeleton2?\.png$/u.test(line));
  assertEquals(pages, [...plagueDoctorSpinePageFiles]);
  for (const page of pages) {
    const bytes = Deno.readFileSync(
      new URL(
        `../static/fun/lobotomy-corp/${assetDirectory}/${page}`,
        import.meta.url,
      ),
    );
    assert(bytes.byteLength > 0, page);
  }
  const skeleton = JSON.parse(
    readAsset(`${assetDirectory}/${plagueDoctorSpineSkeletonFile}`),
  ) as { animations: Record<string, unknown>; slots: { name: string }[] };
  assert(
    Object.keys(skeleton.animations).includes(plagueDoctorSpineAnimation),
    Object.keys(skeleton.animations).join(", "),
  );
  // 形态覆盖用的 slot 名必须都在骨架里存在，否则运行时找不到它们。
  const slotNames = new Set(skeleton.slots.map((slot) => slot.name));
  const expected = [
    ...plagueDoctorSpineHiddenSlots,
    ...plagueDoctorSpineWingSlots,
    plagueDoctorSpineEyeSlots.firstHalf,
    plagueDoctorSpineEyeSlots.secondHalf,
    plagueDoctorSpineEyeSlots.closed,
  ];
  for (const name of expected) {
    assert(slotNames.has(name), `骨架里没有 slot ${name}`);
  }
  // 睁眼精灵夹在 slot 19 与 20 之间：`Baby_eye_open` 与 `Baby_eye_open_2` 相邻。
  const indexes = skeleton.slots.map((slot) => slot.name);
  assertStrictEquals(
    indexes.indexOf(plagueDoctorSpineEyeSlots.firstHalf) + 1,
    plagueDoctorSpineEyeSlots.spriteSplitIndex,
  );
  assertStrictEquals(
    indexes.indexOf(plagueDoctorSpineEyeSlots.secondHalf),
    plagueDoctorSpineEyeSlots.spriteSplitIndex,
  );
});

Deno.test("Plague Doctor Spine：运行时与骨架 JSON 由同一份官方构建驱动", () => {
  const runtime = readAsset(plagueDoctorSpineRuntimePath);
  assert(runtime.includes("SceneRenderer.prototype.drawSkeleton"));
  assert(runtime.includes("AssetManager"));
  // 运行时按 `xy / 页尺寸` 取 UV，且上传贴图时不翻转，因此 v 自上而下。
  assert(runtime.includes("region.v = y / page.height;"));
});

Deno.test("Plague Doctor Spine：骨架缩放与预制体局部变换相乘", () => {
  assertEquals(plagueDoctorSpineRig.skeletonScale, 0.01);
  assertEquals(plagueDoctorSpineRig.scale, 0.9);
  assertEquals(plagueDoctorSpineRig.positionX, 0);
  assertEquals(plagueDoctorSpineRig.positionY, -0.5);
  assertEquals(plagueDoctorAdventWhiteNightRig.skeletonScale, 0.01);
  assertEquals(plagueDoctorAdventWhiteNightRig.scale, 0.85);
  assertEquals(plagueDoctorAdventWhiteNightRig.positionX, 0.06);
  assertEquals(plagueDoctorAdventWhiteNightRig.positionY, -0.59);
  assertEquals(plagueDoctorAdventWhiteNightAnimation, "0_Default_inside");
});

Deno.test("Plague Doctor Spine：镜头取景与导出脚本实测值一致", () => {
  assertEquals(plagueDoctorAdventCamera.orthographicSize, 4);
  assertEquals(plagueDoctorAdventCamera.focusOffsetX, -0.2);
  assertEquals(plagueDoctorAdventCamera.focusOffsetY, -0.9);
  // `ExportPlagueDoctorAdvent` 在参考录像上打印过 `bone136 world=(0.3367311,2.768446)`
  // 与 `镜头=(0.1367311,1.868446)`。
  const target = plagueDoctorAdventCameraTarget(0.3367311, 2.768446);
  assertClose(target.x, 0.1367311, 1e-9);
  assertClose(target.y, 1.868446, 1e-9);
  assertEquals(plagueDoctorSpineEyeSprite.boneName, "bone136");
});

Deno.test("Plague Doctor Spine：睁眼按 3 秒计时在 0.2 / 0.6 分两半", () => {
  assertEquals(plagueDoctorAdventEyeTimings.cameraMoveSeconds, 1);
  assertEquals(plagueDoctorAdventEyeTimings.adventSeconds, 3);
  assertEquals(plagueDoctorAdventEyeTimings.firstEyeRate, 0.2);
  assertEquals(plagueDoctorAdventEyeTimings.secondEyeRate, 0.6);
  assertEquals(plagueDoctorAdventWhiteNightSeconds, 4);

  // 镜头还没到位：两半都不出现。
  assertEquals(plagueDoctorAdventEyeState(0), {
    firstHalf: false,
    rate: 0,
    secondHalf: false,
  });
  assertEquals(plagueDoctorAdventEyeState(1).rate, 0);
  // 镜头到位 + 0.6 秒（Rate 0.2）：第一半睁眼精灵出现。
  assertEquals(plagueDoctorAdventEyeState(1.6).firstHalf, true);
  assertEquals(plagueDoctorAdventEyeState(1.6).secondHalf, false);
  // 镜头到位 + 1.8 秒（Rate 0.6）：第二半网格出现。
  assertEquals(plagueDoctorAdventEyeState(2.8).secondHalf, true);
  assertEquals(plagueDoctorAdventEyeState(4).rate, 1);
});

Deno.test("Plague Doctor Spine：_eye1 精灵按骨骼跟随时长与 prefab 局部变换摆放", () => {
  const placement = plagueDoctorAdventEyeSpritePlacement(0, 0, 0);
  const scale = plagueDoctorSpineRig.scale;
  assertClose(
    placement.width,
    plagueDoctorSpineEyeSprite.rectWidth /
      plagueDoctorSpineEyeSprite.pixelsToUnits * scale,
    1e-12,
  );
  assertClose(
    placement.height,
    plagueDoctorSpineEyeSprite.rectHeight /
      plagueDoctorSpineEyeSprite.pixelsToUnits * scale,
    1e-12,
  );
  assertClose(
    placement.pivotX,
    plagueDoctorSpineEyeSprite.pivotX * placement.width,
    1e-12,
  );
  assertClose(
    placement.pivotY,
    plagueDoctorSpineEyeSprite.pivotY * placement.height,
    1e-12,
  );
  assertClose(placement.x, plagueDoctorSpineEyeSprite.localX * scale, 1e-12);
  assertClose(placement.y, plagueDoctorSpineEyeSprite.localY * scale, 1e-12);
  // 角度＝跟骨骼世界旋转（这里传 0）＋ prefab 局部旋转。
  assertClose(placement.angle, plagueDoctorSpineEyeSprite.localAngle, 1e-9);

  // 骨骼旋转时局部偏移跟着一起转（BoneFollower 跟随骨骼旋转）。
  const rotated = plagueDoctorAdventEyeSpritePlacement(1, 2, 90);
  const localX = plagueDoctorSpineEyeSprite.localX * scale;
  const localY = plagueDoctorSpineEyeSprite.localY * scale;
  assertClose(rotated.x, 1 - localY, 1e-9);
  assertClose(rotated.y, 2 + localX, 1e-9);
  assertClose(
    rotated.angle,
    90 + plagueDoctorSpineEyeSprite.localAngle,
    1e-9,
  );
});

Deno.test("Plague Doctor Spine：_eye1 精灵的 UV 从 Unity 纹理坐标换算到页面自上而下", () => {
  const pageWidth = 1024;
  const pageHeight = 512;
  const uv = plagueDoctorAdventEyeSpriteUv(pageWidth, pageHeight)!;
  const sprite = plagueDoctorSpineEyeSprite;
  assertClose(uv.u1, sprite.rectX / pageWidth, 1e-12);
  assertClose(uv.u2, (sprite.rectX + sprite.rectWidth) / pageWidth, 1e-12);
  // Unity 的 `m_Rect.y` 自下而上，页面贴图自上而下。
  const top = pageHeight - sprite.rectY - sprite.rectHeight;
  assertClose(uv.vTop, top / pageHeight, 1e-12);
  assertClose(uv.vBottom, (top + sprite.rectHeight) / pageHeight, 1e-12);
  assert(uv.vTop < uv.vBottom);
  // 精灵所在页面就是 Atlas 的第 2 页；Atlas 页名照抄文件名（含扩展名）。
  assertEquals(sprite.pageName, "skeleton2.png");
  // 眼睛朝向：prefab 的局部旋转是 -62.746834°（由四元数 (0,0,-0.52061355,0.8537925)
  // 换算），跟骨骼的世界旋转再由 BoneFollower 叠上去。
  assertEquals(sprite.localAngle, -62.746834);
  assertEquals(plagueDoctorAdventEyeSpriteUv(0, pageHeight), undefined);
});

Deno.test("Plague Doctor Spine：缺少 WebGL 时舞台放弃接管画面", () => {
  const document = asDocument({
    body: new Element(),
    createElement: () => new Element(),
  });
  assertEquals(
    createPlagueDoctorSpineStage({
      assetRoot: `${moduleRoot}/Assets`,
      document,
      globalObject: {},
    }),
    undefined,
  );
  assertEquals(createPlagueDoctorSpineStage({}), undefined);
});

Deno.test("Plague Doctor Spine：有 WebGL 时先交出画布再异步建骨架", () => {
  const canvas = Object.assign(new Element(), {
    // 只需要一个非空 WebGL 上下文句柄，真正的渲染由浏览器验证。
    getContext: () => ({}),
  });
  const document = asDocument({
    body: new Element(),
    createElement: () => canvas,
  });
  const globalObject: Record<string, unknown> = {
    cancelAnimationFrame: () => {},
    requestAnimationFrame: () => 1,
  };
  const stage = createPlagueDoctorSpineStage({
    assetRoot: `${moduleRoot}/Assets`,
    document,
    globalObject,
  })!;
  assertEquals(stage.canvas, canvas);
  assertStrictEquals(
    canvas.className,
    "lobotomy-corp-plague-doctor-advent-spine",
  );
  // 画布自身不做隐藏：可见范围由网页的世界层节点（`hidden`）控制。
  assertStrictEquals(canvas.hidden, false);
  assertEquals(stage.currentAnimation, undefined);
  assertEquals(stage.isReady(), false);
  // 骨架还没就绪时演出照常计时：`play()` 返回 false 而不是抛错。
  assertStrictEquals(stage.play(), false);
  stage.ready.catch(() => {});
  stage.dispose();
  assertStrictEquals(canvas.removed, true);
});

/**
 * 造一个只实现舞台用到接口的 Spine 运行时替身。
 *
 * 真实运行时无法在 Deno 里跑，但「演出开始时骨架还没加载完」这条时序必须能回归：
 * 网页在第一个钟声响起时就调 `play()`，那时骨架通常还没就绪。
 *
 * @return {{frames: number[], runtime: Record<string, unknown>}} 替身运行时与帧队列。
 */
function fakeSpineRuntime(): {
  frames: number[];
  runtime: Record<string, unknown>;
} {
  const frames: number[] = [];
  class FakeAnimationState {
    static animations: string[] = [];
    /** @param {object} _data 动画数据。 */
    constructor(_data: object) {}
    /** @param {number} _track 轨道。 @param {string} name 动画名。 */
    setAnimation(_track: number, name: string): void {
      FakeAnimationState.animations.push(name);
    }
    /** @param {object} _skeleton 骨架。 */
    apply(_skeleton: object): void {}
    /** @param {number} _delta 步进。 */
    update(_delta: number): void {}
  }
  class FakeSkeleton {
    bones = [{ rotation: 0, worldX: 0.3367311, worldY: 2.768446 }];
    /** @return {object} 跟骨骼。 */
    findBone(): object {
      return this.bones[0];
    }
    /** @return {object} 任意 slot。 */
    findSlot(): object {
      return {
        data: {index: 0},
        getAttachment: () => null,
        setAttachment: () => {},
      };
    }
    /** @return {null} 没有附件。 */
    getAttachment(): null {
      return null;
    }
    /** @return {void} 空实现。 */
    updateWorldTransform(): void {}
  }
  const page = {height: 512, name: "skeleton2.png", texture: {}, width: 1024};
  return {
    frames,
    runtime: {
      AnimationState: FakeAnimationState,
      AnimationStateData: class {},
      AtlasAttachmentLoader: class {},
      Color: class {},
      Skeleton: FakeSkeleton,
      SkeletonJson: class {
        scale = 1;
        /** @return {{findAnimation: () => object}} 骨架数据。 */
        readSkeletonData(): object {
          return {findAnimation: () => ({})};
        }
      },
      webgl: {
        AssetManager: class {
          /** @param {string} path 资源相对路径。 @return {object|string} 舞台需要的资源句柄。 */
          get(path: string): object | string {
            // 骨架走 `JSON.parse`，Atlas 走运行时对象，与真实 AssetManager 一致。
            return path.includes("atlas")
              ? {pages: [page]}
              : '{"animations":{},"slots":[]}';
          }
          /** @return {{pages: object[]}} Atlas。 */
          getErrors(): object[] {
            return [];
          }
          /** @return {boolean} 直接完成加载。 */
          hasErrors(): boolean {
            return false;
          }
          /** @return {boolean} 直接完成加载。 */
          isLoadingComplete(): boolean {
            return true;
          }
          /** @return {void} 空实现。 */
          loadText(): void {}
          /** @return {void} 空实现。 */
          loadTextureAtlas(): void {}
        },
        ResizeMode: {Expand: 1},
        SceneRenderer: class {
          QUAD_TRIANGLES = [0, 1, 2, 2, 3, 0];
          batcher = {
            draw: () => {},
            setBlendMode: () => {},
          };
          camera = {
            position: {x: 0, y: 0},
            update: () => {},
            zoom: 1,
          };
          /** @return {void} 空实现。 */
          begin(): void {}
          /** @return {void} 空实现。 */
          dispose(): void {}
          /** @return {void} 空实现。 */
          drawSkeleton(): void {}
          /** @return {void} 空实现。 */
          end(): void {}
          /** @return {void} 空实现。 */
          resize(): void {}
        },
      },
    },
  };
}

Deno.test("Plague Doctor Spine：骨架就绪前调 play 也要在就绪后自动开演", async () => {
  const {frames, runtime} = fakeSpineRuntime();
  const canvas = Object.assign(new Element(), {
    clientHeight: 1080,
    clientWidth: 1920,
    getContext: () => ({
      ONE: 1,
      ONE_MINUS_SRC_ALPHA: 2,
      clear: () => {},
      clearColor: () => {},
      viewport: () => {},
    }),
  });
  const document = asDocument({
    body: new Element(),
    createElement: () => canvas,
  });
  const globalObject: Record<string, unknown> = {
    cancelAnimationFrame: () => {},
    performance: {now: () => 0},
    requestAnimationFrame: () => frames.push(1),
    spine: runtime,
  };
  const stage = createPlagueDoctorSpineStage({
    assetRoot: `${moduleRoot}/Assets`,
    document,
    globalObject,
  })!;
  // 真实页面就是在这个时刻调的：骨架还在加载，`play()` 只能记下请求。
  assertStrictEquals(stage.play(), false);
  assertStrictEquals(stage.isReady(), false);
  assertStrictEquals(stage.currentAnimation, undefined);

  await stage.ready;
  // 就绪后必须自己接上演出，否则盘心里永远没有人。
  assertStrictEquals(stage.isReady(), true);
  assertStrictEquals(stage.currentAnimation, "0_Default_");
  assert(frames.length > 0, "开演后应当预约下一帧");
  stage.dispose();
});

Deno.test("Plague Doctor Spine：画布样式铺满逻辑画布", async () => {
  const css = await Deno.readTextFile(
    new URL("../static/fun/lobotomy-corp/lobotomy-corp.css", import.meta.url),
  );
  const rule =
    css.match(/\.lobotomy-corp-plague-doctor-advent-spine\s*\{[^}]*\}/s)?.[0] ??
      "";
  assert(/height:\s*100%;/.test(rule));
  assert(/width:\s*100%;/.test(rule));
  assert(/position:\s*absolute;/.test(rule));
  assert(/inset:\s*0;/.test(rule));
  assert(/pointer-events:\s*none;/.test(rule));
});
