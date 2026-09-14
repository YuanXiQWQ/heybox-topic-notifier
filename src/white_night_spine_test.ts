/** @file 白夜 Spine 舞台的资源、取景与降级回归测试。 */
import { assert, assertEquals, assertStrictEquals } from "./test_helpers.ts";
import { Element } from "./test_harness.ts";
import {
  advanceWhiteNightSpineSkill,
  createWhiteNightSpineStage,
  loadWhiteNightSpineRuntime,
  whiteNightEscapeSkillIntervalSeconds,
  whiteNightEscapeSpecialDurationSeconds,
  whiteNightEscapeSpecialEventSeconds,
  whiteNightRangeEffectFrame,
  whiteNightSpineAnimations,
  whiteNightSpineAssetDirectory,
  whiteNightSpineAtlasFile,
  whiteNightSpineModuleRoot,
  whiteNightSpineRangeEffect,
  whiteNightSpineRangeTexture,
  whiteNightSpineRuntimePath,
  whiteNightSpineSkeletonFile,
  whiteNightSpineViewportLayout,
  whiteNightSpineViewportPadding,
} from "../static/fun/lobotomy-corp/Events/WhiteNightSpine.js";

/** static 下彩蛋模块的公开根路径。 */
const moduleRoot = "/static/fun/lobotomy-corp";

/** 骨架数据相对 `Assets` 的目录。 */
const assetDirectory = `Assets/${whiteNightSpineAssetDirectory}`;

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

/** 测试用到的单条骨架动画结构。 */
type WhiteNightAnimationJson = {
  bones?: Record<string, Record<string, Array<{ time: number }>>>;
  slots?: Record<string, Record<string, Array<{ time: number }>>>;
};

/** 测试用到的骨架 JSON 结构。 */
type WhiteNightSkeletonJson = {
  animations: Record<string, WhiteNightAnimationJson>;
  skeleton: { spine: string };
};

/**
 * 解析骨架 JSON。
 *
 * @return {WhiteNightSkeletonJson} 骨架数据。
 */
function readSkeleton(): WhiteNightSkeletonJson {
  return JSON.parse(
    readAsset(`${assetDirectory}/${whiteNightSpineSkeletonFile}`),
  ) as WhiteNightSkeletonJson;
}

/**
 * 计算一条 Spine 动画的时长。
 *
 * @param {WhiteNightAnimationJson} animation 动画数据。
 * @return {number} 全部时间轴里的最大关键帧时间。
 */
function animationDuration(animation: WhiteNightAnimationJson): number {
  let duration = 0;
  for (const timelines of [animation.bones, animation.slots]) {
    for (const timeline of Object.values(timelines ?? {})) {
      for (const keys of Object.values(timeline)) {
        for (const key of keys) duration = Math.max(duration, key.time);
      }
    }
  }
  return duration;
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
 * 替身只实现被调用到的成员，因此这里用断言桥接而不是补齐整个 `Document`。
 *
 * @param {object} value 测试替身。
 * @return {Document} 宿主文档类型。
 */
function asDocument(value: object): Document {
  return value as unknown as Document;
}

Deno.test("WhiteNight Spine：模块根路径由 Assets 目录推导", () => {
  assertEquals(whiteNightSpineModuleRoot(`${moduleRoot}/Assets`), moduleRoot);
  assertEquals(whiteNightSpineModuleRoot(`${moduleRoot}/Assets/`), moduleRoot);
  assertEquals(whiteNightSpineModuleRoot(moduleRoot), moduleRoot);
  assertEquals(whiteNightSpineModuleRoot(""), "");
});

Deno.test("WhiteNight Spine：三条动画名与解包骨架一致", () => {
  const skeleton = readSkeleton();
  const animationNames = Object.keys(skeleton.animations);
  for (const name of Object.values(whiteNightSpineAnimations)) {
    assert(animationNames.includes(name), `${name} 不在骨架动画里`);
  }
  // 随仓库分发的官方运行时是 3.6.53，必须能读这份 3.6.48 数据。
  assertEquals(skeleton.skeleton.spine, "3.6.48");
  // 时长与 Animator 状态里的 Unity 剪辑一一对应：出逃待机 5 秒循环，
  // 特技 7 秒、镇压 7 秒（Dead_23.anim）各播一次。
  assertEquals(
    animationDuration(skeleton.animations[whiteNightSpineAnimations.escapeIdle]),
    5,
  );
  assertEquals(
    animationDuration(
      skeleton.animations[whiteNightSpineAnimations.escapeSpecial],
    ),
    7,
  );
  assertEquals(
    animationDuration(skeleton.animations[whiteNightSpineAnimations.dead]),
    7,
  );
});

Deno.test("WhiteNight Spine：Atlas 分页与运行时随仓库分发", () => {
  const atlas = readAsset(`${assetDirectory}/${whiteNightSpineAtlasFile}`);
  const pages = atlas.split(/\r?\n/u).filter((line) =>
    line.endsWith(".png")
  );
  assertEquals(pages, [
    "skeleton.png",
    "skeleton2.png",
    "skeleton3.png",
    "skeleton4.png",
    "skeleton5.png",
    "skeleton6.png",
  ]);
  for (const page of pages) {
    const bytes = Deno.readFileSync(
      new URL(
        `../static/fun/lobotomy-corp/${assetDirectory}/${page}`,
        import.meta.url,
      ),
    );
    assert(bytes.byteLength > 0, `${page} 内容为空`);
  }
  const runtime = readAsset(whiteNightSpineRuntimePath);
  assert(runtime.includes("webgl.AssetManager = AssetManager;"));
  assert(runtime.includes("SceneRenderer.prototype.drawSkeleton"));
  // 运行时的许可条款要求随分发文件保留授权声明。
  const license = readAsset(
    whiteNightSpineRuntimePath.replace(/\.js$/u, ".LICENSE.txt"),
  );
  assert(license.includes("Spine Runtimes Software License"));
});

Deno.test("WhiteNight Spine：取景把出逃待机包围盒等比放进视口", () => {
  // 数值取自 Unity 导出脚本测得的出逃待机包围盒：
  // 参考视频按 100 px/单位、1.08 留白导出为 1769×1759。
  const bounds = {
    maxX: 789.3035480661171,
    maxY: 1212.6119203841158,
    minX: -847.882151285037,
    minY: -415.9157541129916,
  };
  const layout = whiteNightSpineViewportLayout(1920, 1080, bounds)!;
  assertClose(layout.spanX, 1769, 2);
  assertClose(layout.spanY, 1759, 2);
  assertClose(layout.centerX, -29.289, 0.01);
  assertClose(layout.centerY, 398.348, 0.01);
  // 16:9 下高度先触到 88vh 上限，取景框按 980 的 88% 铺满。
  assertClose(layout.spanY * layout.pixelsPerUnit, 950.4, 0.5);
  assert(layout.spanX * layout.pixelsPerUnit < 1380);
  assertEquals(whiteNightSpineViewportPadding, 1.08);

  assertEquals(
    whiteNightSpineViewportLayout(0, 1080, bounds),
    undefined,
  );
  assertEquals(
    whiteNightSpineViewportLayout(1920, 1080, {
      maxX: 0,
      maxY: 0,
      minX: 0,
      minY: 0,
    }),
    undefined,
  );
});

Deno.test("WhiteNight Spine：运行时只注入一次脚本", async () => {
  const scripts: Element[] = [];
  const document = asDocument({
    body: new Element(),
    createElement: () => {
      const node = new Element();
      scripts.push(node);
      return node;
    },
  });
  const globalObject: Record<string, unknown> = {};
  const pending = loadWhiteNightSpineRuntime({
    document,
    globalObject,
    path: `${moduleRoot}/${whiteNightSpineRuntimePath}`,
  });
  assertEquals(scripts.length, 1);
  assertEquals(
    scripts[0].src,
    `${moduleRoot}/${whiteNightSpineRuntimePath}`,
  );
  globalObject.spine = {webgl: {}};
  scripts[0].dispatch("load");
  assertStrictEquals(await pending, globalObject.spine);

  // 已经存在的命名空间不再注入新脚本。
  assertStrictEquals(
    await loadWhiteNightSpineRuntime({
      document,
      globalObject,
      path: `${moduleRoot}/${whiteNightSpineRuntimePath}`,
    }),
    globalObject.spine,
  );
  assertEquals(scripts.length, 1);

  // 宿主没有 DOM 时直接放弃加载，由调用方退回视频。
  assertEquals(
    await loadWhiteNightSpineRuntime({
      document: undefined,
      globalObject: {},
      path: "spine.js",
    }),
    undefined,
  );
});

Deno.test("WhiteNight Spine：脚本加载失败不会挂在 ready 上", async () => {
  const scripts: Element[] = [];
  const document = asDocument({
    body: new Element(),
    createElement: () => {
      const node = new Element();
      scripts.push(node);
      return node;
    },
  });
  const pending = loadWhiteNightSpineRuntime({
    document,
    globalObject: {},
    path: "missing-spine.js",
  });
  scripts[0].dispatch("error");
  let failed = false;
  try {
    await pending;
  } catch {
    failed = true;
  }
  assertEquals(failed, true);
});

Deno.test("WhiteNight Spine：缺少 WebGL 时舞台放弃接管画面", () => {
  const document = asDocument({
    body: new Element(),
    createElement: () => new Element(),
  });
  assertEquals(
    createWhiteNightSpineStage({
      assetRoot: `${moduleRoot}/Assets`,
      document,
      globalObject: {},
    }),
    undefined,
  );
  assertEquals(createWhiteNightSpineStage({}), undefined);
});

Deno.test("WhiteNight Spine：有 WebGL 时先交出画布再异步建骨架", () => {
  const canvas = Object.assign(new Element(), {
    // 只需要一个非空 WebGL 上下文句柄，真正的渲染由浏览器验证。
    getContext: () => ({}),
  });
  const document = asDocument({
    body: new Element(),
    createElement: () => canvas,
  });
  const globalObject: Record<string, unknown> = {
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
  };
  const stage = createWhiteNightSpineStage({
    assetRoot: `${moduleRoot}/Assets`,
    document,
    globalObject,
  })!;
  assertEquals(stage.canvas, canvas);
  assertStrictEquals(
    canvas.className,
    "lobotomy-corp-white-night-spine",
  );
  assertEquals(stage.currentAnimation, undefined);
  assertEquals(stage.isReady(), false);
  stage.ready.catch(() => {});
  stage.dispose();
  assertStrictEquals(canvas.removed, true);
});

Deno.test("WhiteNight Spine：白圈贴图与特技音效随仓库分发", () => {
  const texture = Deno.readFileSync(
    new URL(
      `../static/fun/lobotomy-corp/Assets/${whiteNightSpineRangeTexture}`,
      import.meta.url,
    ),
  );
  // PNG 的 IHDR 紧随 8 字节签名，宽高各占 4 字节大端。
  const view = new DataView(texture.buffer, texture.byteOffset,
    texture.byteLength);
  assertEquals(view.getUint32(16), whiteNightSpineRangeEffect.spriteSize);
  assertEquals(view.getUint32(20), whiteNightSpineRangeEffect.spriteSize);

  const sound = Deno.readFileSync(
    new URL(
      "../static/fun/lobotomy-corp/Assets/Resources/sounds/creature/whitenight/WhiteNight_Atk.ogg",
      import.meta.url,
    ),
  );
  // Ogg 容器固定以 "OggS" 开头。
  assertEquals(
    Array.from(sound.slice(0, 4)),
    [0x4F, 0x67, 0x67, 0x53],
  );
});

Deno.test("WhiteNight Spine：出逃特技按 60 秒间隔与动画事件调度", () => {
  assertEquals(whiteNightEscapeSkillIntervalSeconds, 60);
  assertEquals(whiteNightEscapeSpecialDurationSeconds, 7);
  assertEquals(whiteNightEscapeSpecialEventSeconds, {range: 4, sound: 3.5});

  let state: {
    idleSeconds: number;
    rangeSeconds: number | undefined;
    specialSeconds: number | undefined;
  } = {idleSeconds: 0, rangeSeconds: undefined, specialSeconds: undefined};
  let step = advanceWhiteNightSpineSkill(state, 59.5);
  assertEquals(step.startSpecial, false);
  state = step.state;
  assertClose(state.idleSeconds, 59.5, 1e-9);

  // 60 秒到点：特技开始，计时器带着余量继续走，不因动画开始而停摆。
  step = advanceWhiteNightSpineSkill(state, 0.6);
  assertEquals(step.startSpecial, true);
  assertEquals(step.endSpecial, false);
  state = step.state;
  assertClose(state.specialSeconds!, 0.6, 1e-9);
  assertClose(state.idleSeconds, 0.1, 1e-9);

  // 3.5 秒的动画事件只响一次。
  step = advanceWhiteNightSpineSkill(state, 2.8);
  assertEquals(step.skillSound, false);
  assertEquals(step.startRange, false);
  state = step.state;
  step = advanceWhiteNightSpineSkill(state, 0.2);
  assertEquals(step.skillSound, true);
  assertEquals(step.startRange, false);
  state = step.state;
  step = advanceWhiteNightSpineSkill(state, 0.3);
  assertEquals(step.skillSound, false);
  assertEquals(step.startRange, false);
  state = step.state;

  // 第 4 秒点亮白圈，白圈按自己的 5 秒时间轴跑完，特技到第 7 秒结束。
  step = advanceWhiteNightSpineSkill(state, 0.2);
  assertEquals(step.startRange, true);
  state = step.state;
  assertEquals(state.rangeSeconds, 0);

  step = advanceWhiteNightSpineSkill(state, 2.8);
  assertEquals(step.endSpecial, false);
  assertClose(step.state.rangeSeconds!, 2.8, 1e-9);
  state = step.state;

  step = advanceWhiteNightSpineSkill(state, 0.5);
  assertEquals(step.endSpecial, true);
  state = step.state;
  assertEquals(state.specialSeconds, undefined);
  assertClose(state.rangeSeconds!, 3.3, 1e-9);
  // 特技的 7 秒都算进 60 秒周期，不会把下一次特技推到动画结束之后。
  assertClose(state.idleSeconds, 6.9, 1e-9);

  // 白圈跑满 5 秒后消失。
  step = advanceWhiteNightSpineSkill(state, 1.8);
  assertEquals(step.state.rangeSeconds, undefined);
  state = step.state;
  assertClose(state.idleSeconds, 8.7, 1e-9);

  step = advanceWhiteNightSpineSkill(state, 50.4);
  assertEquals(step.startSpecial, false);
  state = step.state;
  assertClose(state.idleSeconds, 59.1, 1e-9);

  // 下一个特技正好在第一次特技开始后的第 60 秒触发。
  step = advanceWhiteNightSpineSkill(state, 1.0);
  assertEquals(step.startSpecial, true);
  assertClose(step.state.idleSeconds, 0.1, 1e-9);
});

Deno.test("WhiteNight Spine：白圈缩放与不透明度按 WhiteNightSkill 曲线推进", () => {
  assertEquals(
    whiteNightSpineRangeEffect.positionX,
    -6,
  );
  assertEquals(whiteNightSpineRangeEffect.positionY, 393);
  assertEquals(whiteNightRangeEffectFrame(-0.1), undefined);
  assertEquals(
    whiteNightRangeEffectFrame(whiteNightSpineRangeEffect.durationSeconds),
    undefined,
  );
  const start = whiteNightRangeEffectFrame(0)!;
  assertEquals(start.scale, whiteNightSpineRangeEffect.scaleFrom);
  assertEquals(start.alpha, whiteNightSpineRangeEffect.alphaFrom);
  const middle = whiteNightRangeEffectFrame(2.5)!;
  assertClose(
    middle.scale,
    (whiteNightSpineRangeEffect.scaleFrom + whiteNightSpineRangeEffect.scaleTo) /
      2,
    1e-9,
  );
  assertClose(
    middle.alpha,
    (whiteNightSpineRangeEffect.alphaFrom + whiteNightSpineRangeEffect.alphaTo) /
      2,
    1e-9,
  );
  const near = whiteNightRangeEffectFrame(1)!;
  const far = whiteNightRangeEffectFrame(4)!;
  assert(near.scale < far.scale);
  assert(near.alpha > far.alpha);
});

Deno.test("WhiteNight Spine：画布样式铺满视口", async () => {
  const css = await Deno.readTextFile(
    new URL("../static/fun/lobotomy-corp/lobotomy-corp.css", import.meta.url),
  );
  const rule =
    css.match(/\.lobotomy-corp-white-night-spine\s*\{[^}]*\}/s)?.[0] ?? "";
  assert(/height:\s*100%;/.test(rule));
  assert(/width:\s*100%;/.test(rule));
  assert(/position:\s*absolute;/.test(rule));
  assert(/inset:\s*0;/.test(rule));
  assert(/pointer-events:\s*none;/.test(rule));
});
