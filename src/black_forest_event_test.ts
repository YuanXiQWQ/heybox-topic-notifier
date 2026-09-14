/**
 * @file 终末鸟（黑森林）事件的原作参数与网页流程回归测试。
 */
import {
  assert,
  assertEquals,
  assertStrictEquals,
  findAllByClass,
  requireByClass,
} from "./test_helpers.ts";
import { Element, StorageMock } from "./test_harness.ts";
import {
  blackForestEggPrefabScale,
  blackForestEggSpineAssets,
  blackForestEggSpineLayout,
  blackForestEggTransitionSeconds,
} from "../static/fun/lobotomy-corp/Events/BlackForestEggSpine.js";
import {
  blackForestActivePhases,
  blackForestBirdOrderFor,
  blackForestBirds,
  blackForestCgFrameAt,
  blackForestCgTextLayout,
  blackForestCgTimeline,
  blackForestDefaultBirdOrder,
  blackForestEggAssignment,
  blackForestEggOrder,
  blackForestEggs,
  blackForestEventId,
  blackForestGift,
  blackForestIconSlots,
  blackForestNarrationCanvas,
  blackForestNarrationSequence,
  blackForestNarrations,
  blackForestSoundPaths,
  createBlackForestCgPlayer,
  createBlackForestEvent,
  isValidBlackForestState,
} from "../static/fun/lobotomy-corp/Events/BlackForest.js";

/** 提取 CSS 中一个明确类选择器的规则体。 */
function cssRule(css: string, className: string): string {
  return css.match(new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`, "s"))?.[1] ??
    "";
}

/** 读取脑叶公司样式表。 */
function lobotomyCorpCss(): string {
  return Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/lobotomy-corp.css",
      import.meta.url,
    ),
  );
}

/**
 * 创建可检查层级的 CG 最小 DOM。
 *
 * @return {{body: Element, document: object}} 测试文档。
 */
function createCgDocument() {
  const body = new Element();
  return {
    body,
    document: {
      body,
      createElement: () => new Element(),
    },
  };
}

/** 各 NarrationState 使用的 CG 图与显示时长必须与 prefab / BossBird.cs 一致。 */
Deno.test("Black Forest CG uses the prefab narration images and durations", () => {
  assertEquals(
    { ...blackForestNarrations.escape },
    {
      durationMs: 4000,
      image: "Texture2D/GatewayAppear.png",
      messageKey: "blackForest.story.opening",
    },
  );
  // prefab 的 narrationImages：ESCAPE / 三只鸟抵达 / 终末鸟出现 / 三个蛋碎 / 镇压。
  assertEquals(blackForestNarrations.bigBirdArrive.image, "Texture2D/BigBirdArrived.png");
  assertEquals(blackForestNarrations.longBirdArrive.image, "Texture2D/LongBirdArrived.png");
  assertEquals(blackForestNarrations.smallBirdArrive.image, "Texture2D/SmallBirdArrived.png");
  assertEquals(blackForestNarrations.bossBirdAppear.image, "Texture2D/BossBirdAppear.png");
  assertEquals(blackForestNarrations.bigBirdBreak.image, "Texture2D/BigBirdDead.png");
  assertEquals(blackForestNarrations.longBirdBreak.image, "Texture2D/LongBirdDead.png");
  assertEquals(blackForestNarrations.smallBirdBreak.image, "Texture2D/SmallBirdDead.png");
  assertEquals(blackForestNarrations.suppressed.image, "Texture2D/BossBirdDead.png");
  assertEquals(blackForestNarrations.bossBirdAppear.durationMs, 2000);
  assertEquals(blackForestNarrations.suppressed.durationMs, 6000);
  // NarrationCanvas 的三张静态图层与 DisplayImage 的横向压扁。
  assertEquals([...blackForestNarrationCanvas.layers], [
    "Texture2D/Background_0.png",
    "Texture2D/BackGroundFoward.png",
    "Texture2D/FrameUpper.png",
  ]);
  assertEquals(blackForestNarrationCanvas.imageScaleX, 0.95);
  assertEquals(blackForestNarrationCanvas.referenceWidth, 1600);
  assertEquals(blackForestNarrationCanvas.referenceHeight, 900);
  assertEquals(blackForestNarrationCanvas.fadeInMs, 1500);
  assertEquals(blackForestNarrationCanvas.fadeOutMs, 1000);
  assertEquals(blackForestNarrationCanvas.fadeInStartAlpha, 0.47058824);
  // 音效来自 BossBird_stat.txt：appear = BossBird_Birth、dead = BossBird_Dead。
  assertEquals(
    blackForestSoundPaths.BossBird_Birth,
    "Resources/sounds/creature/BossBird/BossBird_Birth.ogg",
  );
  assertEquals(
    blackForestSoundPaths.BossBird_Dead,
    "Resources/sounds/creature/BossBird/BossBird_Dead.ogg",
  );
  // 事件奖励：Equipment.txt 的 400038（破晓）使用 BossBirdWing 贴图。
  assertEquals(blackForestGift.equipmentId, 400038);
  assertEquals(blackForestGift.nameKey, "BossBird_Special_name");
  assertEquals(blackForestGift.sprite, "Resources/sprites/worker/equipment/attachment/BossBirdWing.png");
});

/** 三只鸟、三颗蛋与编号的对应关系必须是原作的那套。 */
Deno.test("Black Forest birds and eggs keep their original pairing", () => {
  assertEquals([...blackForestDefaultBirdOrder], [
    "bigBird",
    "longBird",
    "smallBird",
  ]);
  assertEquals(blackForestBirds.bigBird.id, "O-02-40");
  assertEquals(blackForestBirds.longBird.id, "O-02-62");
  assertEquals(blackForestBirds.smallBird.id, "O-02-56");
  // 大鸟 = 大眼、高鸟（审判鸟）= 长臂、小鸟（惩戒鸟）= 小喙。
  assertEquals(blackForestEggs.bigEyes.bird, "bigBird");
  assertEquals(blackForestEggs.longArms.bird, "longBird");
  assertEquals(blackForestEggs.smallBeak.bird, "smallBird");
  assertEquals(blackForestEggs.bigEyes.spine, "bigEyes");
  assertEquals(blackForestEggs.longArms.spine, "longArms");
  assertEquals(blackForestEggs.smallBeak.spine, "smallBeak");
  assertEquals([...blackForestEggOrder], ["bigEyes", "longArms", "smallBeak"]);
  assertEquals([...blackForestActivePhases], ["cg", "hunt", "suppress"]);
  assertEquals(blackForestEventId, "black-forest");
});

/** 三颗蛋必须使用原作 Spine 骨架、原始 Atlas 与同一套 Animator 状态名。 */
Deno.test("Black Forest egg visuals use the original Spine animation chain", () => {
  assertEquals(blackForestEggPrefabScale, 0.7);
  assertEquals(blackForestEggTransitionSeconds, 0.25);
  assertEquals(
    { ...blackForestEggSpineAssets.bigEyes.animations },
    {
      dead: "Dead",
      fullBlood: "1_Full_blood",
      halfBlood: "2_Half_blood",
      halfTransition: "Full_blood_to_Half_blood",
    },
  );
  assertEquals(
    {
      assetDirectory: blackForestEggSpineAssets.bigEyes.assetDirectory,
      atlasFile: blackForestEggSpineAssets.bigEyes.atlasFile,
      skeletonFile: blackForestEggSpineAssets.bigEyes.skeletonFile,
    },
    {
      assetDirectory: "Resources/spinedata/bossbird/egg/big",
      atlasFile: "skeleton.atlas_13.txt",
      skeletonFile: "skeleton_24.json",
    },
  );
  assertEquals(
    {
      assetDirectory: blackForestEggSpineAssets.longArms.assetDirectory,
      atlasFile: blackForestEggSpineAssets.longArms.atlasFile,
      skeletonFile: blackForestEggSpineAssets.longArms.skeletonFile,
    },
    {
      assetDirectory: "Resources/spinedata/bossbird/egg/long",
      atlasFile: "skeleton2.atlas_1.txt",
      skeletonFile: "skeleton2_1.json",
    },
  );
  assertEquals(
    {
      assetDirectory: blackForestEggSpineAssets.smallBeak.assetDirectory,
      atlasFile: blackForestEggSpineAssets.smallBeak.atlasFile,
      skeletonFile: blackForestEggSpineAssets.smallBeak.skeletonFile,
    },
    {
      assetDirectory: "Resources/spinedata/bossbird/egg/small",
      atlasFile: "skeleton2.atlas_0.txt",
      skeletonFile: "skeleton2_0.json",
    },
  );
  const layout = blackForestEggSpineLayout(24, 24);
  assert(layout !== undefined);
  assert(layout.pixelsPerSkeletonUnit > 0);
});

/** 输入的两只鸟决定出场顺序，第三只是没输入的那只。 */
Deno.test("Black Forest plays the birds in the submitted order", () => {
  assertEquals(blackForestBirdOrderFor(["smallBird", "bigBird"]), [
    "smallBird",
    "bigBird",
    "longBird",
  ]);
  assertEquals(blackForestBirdOrderFor(["longBird", "smallBird"]), [
    "longBird",
    "smallBird",
    "bigBird",
  ]);
  assertEquals(
    blackForestNarrationSequence(blackForestBirdOrderFor(["smallBird", "bigBird"])),
    [
      "escape",
      "smallBirdArrive",
      "bigBirdArrive",
      "longBirdArrive",
      "bossBirdAppear",
    ],
  );
  // 直接召唤用黑森林故事的默认顺序：大鸟 → 审判鸟 → 惩戒鸟。
  assertEquals(
    blackForestNarrationSequence([...blackForestDefaultBirdOrder]),
    [
      "escape",
      "bigBirdArrive",
      "longBirdArrive",
      "smallBirdArrive",
      "bossBirdAppear",
    ],
  );
});

/** NarrationUI 的总时长与淡入淡出窗口。 */
Deno.test("Black Forest CG timeline follows the NarrationUI fade windows", () => {
  const timeline = blackForestCgTimeline(
    blackForestNarrationSequence([...blackForestDefaultBirdOrder]),
  );
  // 开场与三只鸟抵达各 4 + 1.5 + 1 秒；终末鸟出现 2 + 1.5 + 1 秒。
  assertEquals(timeline.map((segment) => segment.endMs - segment.startMs), [
    6500,
    6500,
    6500,
    6500,
    4500,
  ]);
  assertEquals(timeline[0].startMs, 0);
  assertEquals(timeline[1].startMs, 6500);
  assertEquals(timeline[4].endMs, 6500 * 4 + 4500);
  assertEquals(timeline[4].hasNext, false);
  assertEquals(timeline[0].hasNext, true);
  assertEquals(timeline[0].image, "Texture2D/GatewayAppear.png");
  // 终末鸟出现的音效在淡出开始的那一刻播放（FadeOutSound → MakeSound("appear")）。
  assertEquals(timeline[4].fadeOutStartMs - timeline[4].startMs, 3500);
  assertEquals(timeline[4].breakdown.soundAtFadeOut, "BossBird_Birth");
  assertEquals(timeline[4].breakdown.soundAtEnd, undefined);
  // 镇压音效在演出结束时播放（OnAfterSuppressed → MakeSound("dead")）。
  const suppression = blackForestCgTimeline(["suppressed"])[0];
  assertEquals(suppression.endMs, 8500);
  assertEquals(suppression.breakdown.soundAtEnd, "BossBird_Dead");
});

/** 淡入淡出的每一帧数值。 */
Deno.test("Black Forest CG frame alpha follows FadeInGrad / FadeOutGrad", () => {
  const timeline = blackForestCgTimeline(["escape", "bossBirdAppear"]);
  // 第 0 帧：FadeInGrad 的 t = 0（0.47058824）。
  const start = blackForestCgFrameAt(timeline, 0);
  assertEquals(start.imageAlpha, 0.47058824);
  assertEquals(start.canvasAlpha, 1);
  // 淡入中点。
  const half = blackForestCgFrameAt(timeline, 750);
  assertEquals(
    Math.round(half.imageAlpha * 1000),
    Math.round((0.47058824 + (1 - 0.47058824) / 2) * 1000),
  );
  // 显示段完全不透明。
  assertEquals(blackForestCgFrameAt(timeline, 3000).imageAlpha, 1);
  // 后面还排着下一句时，CG 图淡出、整块画布保持不透明。
  const queuedFadeOut = blackForestCgFrameAt(timeline, 6500 - 500);
  assertEquals(queuedFadeOut.canvasAlpha, 1);
  assertEquals(Math.round(queuedFadeOut.imageAlpha * 100), 50);
  // 最后一句没有后继：画布与 CG 图一起淡出，并在结尾结束。
  const finalFadeOut = blackForestCgFrameAt(timeline, 11000 - 500);
  assertEquals(Math.round(finalFadeOut.canvasAlpha * 100), 50);
  assertEquals(Math.round(finalFadeOut.imageAlpha * 100), 50);
  assertEquals(blackForestCgFrameAt(timeline, 11000).finished, true);
  assertEquals(blackForestCgFrameAt(timeline, 11000).canvasAlpha, 0);
  assertEquals(blackForestCgFrameAt(timeline, 99999).index, -1);
});

/** 台词节点的屏幕几何：16:9 与 prefab 一致，其余比例缩到窗口内并钉在画面底部。 */
Deno.test("Black Forest CG text layout matches the 1600x900 canvas", () => {
  const reference = blackForestCgTextLayout(1600, 900);
  assertEquals(reference.scale, 1);
  assertEquals(reference.centerX, 800);
  // prefab：450 + 354，也就是离画面底边 96 画布单位。
  assertEquals(reference.centerY, 450 + 354);
  assertEquals(reference.width, 1200);
  assertEquals(reference.height, 156);
  assertEquals(reference.fontSize, 34);
  // 16:9 的其它分辨率与 Match Width 完全等价。
  const wide = blackForestCgTextLayout(1920, 1080);
  assertEquals(wide.scale, 1920 / 1600);
  assertEquals(wide.centerX, 960);
  assertEquals(wide.centerY, 540 + 354 * 1.2);
  assertEquals(wide.width, 1200 * 1.2);
  assertEquals(Math.round(wide.height * 100) / 100, 187.2);
  assertEquals(wide.fontSize, 34 * 1.2);
});

/** 非 16:9 的窗口：台词始终留在画面底部那片深色区域里。 */
Deno.test("Black Forest CG text layout adapts to every viewport ratio", () => {
  // 超宽屏：只按宽度换算会把台词推到画面之外（3440×1440 时中心 1841 > 1440），
  // 这里改成按高度换算，画面比例与 16:9 完全同构。
  const ultrawide = blackForestCgTextLayout(2560, 1080);
  assertEquals(ultrawide.scale, 1080 / 900);
  assertEquals(ultrawide.centerY, 1080 - 96 * 1.2);
  assertEquals(ultrawide.fontSize, 34 * 1.2);
  assertEquals(ultrawide.width, 2560 - 400 * 1.2);
  const ultrawideTall = blackForestCgTextLayout(3440, 1440);
  assertEquals(ultrawideTall.centerY, 1440 - 96 * (1440 / 900));
  // 比 16:9 更窄的窗口（长窗口）：只按宽度换算会把台词留在森林中央（中心 897，
  // 离画面底 336），这里钉回画面底部，落在森林下缘的黑色区域里。
  const tall = blackForestCgTextLayout(1269, 1233);
  assertEquals(tall.scale, 1269 / 1600);
  assertEquals(tall.centerY, 1233 - 96 * (1269 / 1600));
  assertEquals(tall.fontSize, 34 * (1269 / 1600));
  assertEquals(tall.width, 1269 - 400 * (1269 / 1600));
  assertEquals(tall.height, 1233 - 744 * (1269 / 1600));
  // 竖屏手机：仍然按宽度缩放，台词保持在画面底部。
  const portrait = blackForestCgTextLayout(400, 900);
  assertEquals(portrait.scale, 0.25);
  assertEquals(portrait.fontSize, 8.5);
  assertEquals(portrait.centerY, 900 - 24);
  assertEquals(portrait.width, 300);
  // 任务栏/地址栏压扁窗口时也不会跑偏。
  const short = blackForestCgTextLayout(1600, 400);
  assertEquals(short.scale, 400 / 900);
  assertEquals(short.centerY, 400 - 96 * (400 / 900));
});

/** 任意窗口比例下，台词都完整落在可见画面内。 */
Deno.test("Black Forest CG text layout keeps the line inside the viewport", () => {
  const widths = [320, 390, 480, 640, 768, 900, 1024, 1280, 1440, 1600, 1920, 2560, 3440];
  const heights = [320, 480, 640, 720, 900, 1024, 1080, 1233, 1440, 1600];
  widths.forEach((width) => {
    heights.forEach((height) => {
      const geometry = blackForestCgTextLayout(width, height);
      const label = `${width}×${height}`;
      // CSS 的 line-height 是 1.2，用它当单行文字的实际高度。
      const lineHeight = geometry.fontSize * 1.2;
      assert(geometry.scale > 0, `${label} 缩放必须大于零`);
      assert(geometry.centerX === width / 2, `${label} 水平居中`);
      assert(
        geometry.width <= width,
        `${label} 台词槽位不能超出画面宽度`,
      );
      assert(
        geometry.centerY - lineHeight >= 0,
        `${label} 台词上边缘必须在画面内`,
      );
      assert(
        geometry.centerY + lineHeight <= height,
        `${label} 台词下边缘必须在画面内`,
      );
      // 16:9 与 Match Width 的原作换算完全一致。
      if (width * 900 === height * 1600) {
        assertEquals(
          geometry.centerY,
          height / 2 + 354 * (width / 1600),
          `${label} 必须等于 prefab 的位置`,
        );
      }
    });
  });
});

/** 三颗蛋必须落在三个不同页面的图标槽位上。 */
Deno.test("Black Forest spreads the three eggs over three pages", () => {
  const assignment = blackForestEggAssignment(() => 0);
  const slots = Object.keys(assignment);
  assertEquals(slots.length, 3);
  const pages = slots.map((slot) =>
    blackForestIconSlots.find((entry) => entry.id === slot)?.page
  );
  assertEquals(new Set(pages).size, 3);
  assertEquals(new Set(Object.values(assignment)).size, 3);
  Object.values(assignment).forEach((egg) => {
    assert(egg in blackForestEggs, `${egg} 应是三颗蛋之一`);
  });
  // 随机源不会产出非法槽位。
  for (let seed = 0; seed < 25; seed += 1) {
    let state = seed * 9301 + 49297;
    const random = () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };
    const sample = blackForestEggAssignment(random);
    assertEquals(Object.keys(sample).length, 3);
    Object.keys(sample).forEach((slot) => {
      assert(
        blackForestIconSlots.some((entry) => entry.id === slot),
        `${slot} 必须是已知槽位`,
      );
    });
  }
});

/** 存档校验：合法存档可恢复，损坏存档作废。 */
Deno.test("Black Forest validates persisted state", () => {
  assertEquals(
    isValidBlackForestState({
      birds: ["smallBird"],
      eggs: { "nav.history": "smallBeak" },
      found: ["bigEyes"],
      phase: "hunt",
    }),
    true,
  );
  assertEquals(isValidBlackForestState({ phase: "unknown" }), false);
  assertEquals(isValidBlackForestState({ phase: "hunt", birds: ["bird"] }), false);
  assertEquals(
    isValidBlackForestState({ phase: "hunt", eggs: { nope: "bigEyes" } }),
    false,
  );
  assertEquals(
    isValidBlackForestState({ phase: "hunt", eggs: { "nav.history": "nope" } }),
    false,
  );
});

/** CG 播放器按 prefab 的层级与不透明度写 DOM。 */
Deno.test("Black Forest CG player renders the five narration layers", () => {
  const harness = createCgDocument();
  const sounds: string[] = [];
  const completed: string[] = [];
  const player = createBlackForestCgPlayer({
    assetRoot: "/static/fun/lobotomy-corp/Assets",
    cancelFrame: () => {},
    document: harness.document,
    messages: () => ({
      "blackForest.apocalypseBird.appears": "是那个怪物！",
      "blackForest.story.opening": "Once upon a time",
    }),
    now: () => 0,
    playSound: (source: string) => sounds.push(source),
    requestFrame: () => 0,
    viewport: () => ({ height: 900, width: 1600 }),
  });
  void player.play(["escape", "bossBirdAppear"], [
    (_index: number, key: string) => completed.push(key),
    (_index: number, key: string) => completed.push(key),
  ]);
  const root = requireByClass(harness.body, "lobotomy-corp-black-forest-cg");
  // 绘制顺序：Background_1 → DisplayImage → BackGroundFoward → Text → FrameUpper。
  assertEquals(
    root.children.map((child) => child.className),
    [
      "lobotomy-corp-black-forest-cg-background",
      "lobotomy-corp-black-forest-cg-image",
      "lobotomy-corp-black-forest-cg-forward",
      "lobotomy-corp-black-forest-cg-text",
      "lobotomy-corp-black-forest-cg-frame",
    ],
  );
  const background = root.children[0];
  const image = root.children[1];
  const forward = root.children[2];
  const text = root.children[3];
  const frame = root.children[4];
  assertEquals(
    background.src,
    "/static/fun/lobotomy-corp/Assets/Texture2D/Background_0.png",
  );
  assertEquals(
    forward.src,
    "/static/fun/lobotomy-corp/Assets/Texture2D/BackGroundFoward.png",
  );
  assertEquals(
    frame.src,
    "/static/fun/lobotomy-corp/Assets/Texture2D/FrameUpper.png",
  );
  assertEquals(
    image.src,
    "/static/fun/lobotomy-corp/Assets/Texture2D/GatewayAppear.png",
  );
  assertEquals(text.textContent, "Once upon a time");
  // 拉丁文本不换字体，中日文整段换成系统衬线。
  assertEquals(text.dataset.cjk, "");
  // 台词节点的几何按 1600×900 画布换算。
  assertEquals(text.style.left, "800px");
  assertEquals(text.style.top, `${450 + 354}px`);
  assertEquals(text.style.width, "1200px");
  assertEquals(text.style.height, "156px");
  assertEquals(text.style.fontSize, "34px");
  // 第 0 帧只用 FadeInGrad 的起始 alpha。
  assertEquals(
    root.styleProperties.get("--lobotomy-corp-black-forest-image-alpha"),
    "0.47058824",
  );
  assertEquals(
    root.styleProperties.get("--lobotomy-corp-black-forest-canvas-alpha"),
    "1",
  );
  assertEquals(sounds, []);
  assertEquals(completed, []);
  // 换到下一句：台词替换成中日文并整段换字体。
  player.renderAt(6500);
  assertEquals(completed, ["escape"]);
  assertEquals(text.textContent, "是那个怪物！");
  assertEquals(text.dataset.cjk, "1");
  assertEquals(
    image.src,
    "/static/fun/lobotomy-corp/Assets/Texture2D/BossBirdAppear.png",
  );
  // 终末鸟出现的音效在淡出开始时只播一次。
  player.renderAt(6500 + 3500);
  player.renderAt(6500 + 3600);
  assertEquals(sounds, [
    "/static/fun/lobotomy-corp/Assets/Resources/sounds/creature/BossBird/BossBird_Birth.ogg",
  ]);
  player.renderAt(11000);
  assertEquals(completed, ["escape", "bossBirdAppear"]);
  player.stop();
  assertEquals(harness.body.children.length, 0);
});

/** 窄窗口打开或窗口尺寸变化时，台词槽位会按新视口重新换算。 */
Deno.test("Black Forest CG player relayouts the line for narrow viewports", () => {
  const harness = createCgDocument();
  let viewport = { height: 900, width: 1600 };
  const player = createBlackForestCgPlayer({
    assetRoot: "/static/fun/lobotomy-corp/Assets",
    cancelFrame: () => {},
    document: harness.document,
    messages: () => ({}),
    now: () => 0,
    playSound: () => {},
    requestFrame: () => 0,
    viewport: () => viewport,
  });
  void player.play(["escape"]);
  const root = requireByClass(harness.body, "lobotomy-corp-black-forest-cg");
  const text = requireByClass(root, "lobotomy-corp-black-forest-cg-text");
  // 16:9 时就是 prefab 的 804。
  assertEquals(text.style.top, "804px");
  // 换成长窗口：台词钉回画面底部，槽位宽度与字号一起按宽度缩小。
  viewport = { height: 1233, width: 1269 };
  globalThis.dispatchEvent(new Event("resize"));
  const geometry = blackForestCgTextLayout(1269, 1233);
  assertEquals(text.style.left, `${geometry.centerX}px`);
  assertEquals(text.style.top, `${geometry.centerY}px`);
  assertEquals(text.style.width, `${geometry.width}px`);
  assertEquals(text.style.height, `${geometry.height}px`);
  assertEquals(text.style.fontSize, `${geometry.fontSize}px`);
  // 台词中心留在画面底部上方 96 画布单位处（1269 / 1600 缩放）。
  assertEquals(geometry.centerY, 1233 - 96 * (1269 / 1600));
  player.stop();
});

/**
 * 记录 click 监听器、可被测试直接点击的节点替身。
 *
 * 模块把鸟蛋的点击挂在节点自身，测试需要按真实事件字段（currentTarget）回调。
 */
class ClickableElement extends Element {
  /** 该节点上的 click 监听器。 */
  clickListeners: ((event: Event) => void)[] = [];

  /**
   * @param {string} name 事件名。
   * @param {(event: Event) => void} listener 监听器。
   * @override
   */
  override addEventListener(
    name: string,
    listener: (event: Event) => void,
  ): void {
    if (name === "click") this.clickListeners.push(listener);
    super.addEventListener(name, listener);
  }

  /** 触发一次带 currentTarget 的点击。 */
  click(): void {
    this.clickListeners.forEach((listener) =>
      listener({
        currentTarget: this,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as unknown as Event)
    );
  }
}

/**
 * 创建终末鸟事件控制器的最小宿主。
 *
 * @param {object} [options] 附加的共享 API 覆盖。
 * @return {any} 测试宿主。
 */
function createBlackForestHarness(options = {}) {
  const body = new Element();
  const storage = new StorageMock();
  const applied: string[] = [];
  const danger: unknown[] = [];
  const events: string[] = [];
  // 每个槽位放一个独立的元素，模拟「本页存在的图标」。
  blackForestIconSlots.forEach((slot) => {
    const node = new ClickableElement();
    node.className = "ui-icon";
    node.selectors.add(
      `[data-lobotomy-corp-black-forest-slot="${slot.id}"]`,
    );
    body.append(node);
  });
  const shared = {
    applyDisplayName: (value: string) => applied.push(value),
    assetRoot: "/static/fun/lobotomy-corp/Assets",
    document: () => ({
      body,
      createElement: () => new ClickableElement(),
      querySelector: (selector: string) => body.querySelector(selector),
      querySelectorAll: (selector: string) => body.querySelectorAll(selector),
    }),
    ensureCoordinator: () => events.push("ensure"),
    finishRestartButton: () => events.push("finish-restart-button"),
    messages: () => ({
      "blackForest.egg.bigEyes.label": "大眼",
      "blackForest.egg.longArms.label": "长臂",
      "blackForest.egg.smallBeak.label": "小喙",
    }),
    mountRestartButton: () => events.push("mount-restart-button"),
    mutexBlocked: () => false,
    pauseDangerDecay: () => events.push("pause"),
    resumeDangerDecay: () => events.push("resume"),
    settleBlackForestDanger: (canonicalIds: string[]) =>
      danger.push([...canonicalIds]),
    storageKey: "test.black-forest",
    storages: () => [storage],
    ...options,
  };
  return { applied, body, danger, events, shared, storage };
}

/** 两鸟相会：记录要跨页保留，第二只鸟触发 CG。 */
Deno.test("Black Forest starts after two birds", () => {
  const harness = createBlackForestHarness();
  const event = createBlackForestEvent(harness.shared);
  assertStrictEquals(event.recordSubmission("O-02-56"), false);
  assertEquals(event.getPhase(), "recording");
  // 第一只鸟的输入记录要立刻落盘，用户中途换页也不会丢。
  assert(harness.storage.getItem("test.black-forest")?.includes("smallBird"));
  assertStrictEquals(event.recordSubmission("O-02-62"), true);
  assertEquals(event.getPhase(), "cg");
  // 出场顺序 = 输入顺序 + 剩下那只。
  assert(
    JSON.parse(harness.storage.getItem("test.black-forest") ?? "{}").order
      .join(",") === "smallBird,longBird,bigBird",
  );
  assertEquals(harness.events.includes("mount-restart-button"), true);
  assertEquals(harness.events.includes("pause"), true);
  // 事件激活期间不再记录新的鸟。
  assertStrictEquals(event.recordSubmission("O-02-40"), false);
  event.finish();
});

/** 警报是否可见不能决定第一只鸟是否仍处于出逃状态。 */
Deno.test("Black Forest keeps the first escaped bird without a visible alarm", () => {
  const harness = createBlackForestHarness();
  const event = createBlackForestEvent(harness.shared);
  assertStrictEquals(event.recordSubmission("O-02-56"), false);
  assertStrictEquals(event.recordSubmission("O-02-62"), true);
  assertEquals(event.getPhase(), "cg");
  assertEquals(
    JSON.parse(harness.storage.getItem("test.black-forest") ?? "{}").birds,
    ["smallBird", "longBird"],
  );
  event.finish();
});

/** 直接输入 O-02-63：不需要警报，危急值由后续 CG 时间线逐笔结算。 */
Deno.test("Black Forest direct summon needs no alarm and settles bird danger", () => {
  const harness = createBlackForestHarness();
  const event = createBlackForestEvent(harness.shared);
  assertStrictEquals(event.recordSubmission("O-02-63"), true);
  assertEquals(event.getPhase(), "cg");
  assertEquals(harness.danger.length, 0);
  assertEquals(
    JSON.parse(harness.storage.getItem("test.black-forest") ?? "{}").order,
    ["bigBird", "longBird", "smallBird"],
  );
  event.finish();
});

/** 特殊事件互斥：白夜进行期间只保存名称。 */
Deno.test("Black Forest refuses to start while another special event runs", () => {
  const harness = createBlackForestHarness({ mutexBlocked: () => true });
  const event = createBlackForestEvent(harness.shared);
  assertStrictEquals(event.recordSubmission("O-02-63"), false);
  assertStrictEquals(event.recordSubmission("O-02-56"), false);
  assertStrictEquals(event.getPhase(), undefined);
});

/** 寻找鸟蛋：点击蛋播死亡 CG，三颗点完挂上「破晓」。 */
Deno.test("Black Forest hunts the eggs and ends with the EGO gift", () => {
  const harness = createBlackForestHarness();
  const event = createBlackForestEvent(harness.shared);
  event.recordSubmission("O-02-56");
  event.recordSubmission("O-02-62");
  // 跳过开场 CG：直接把存档改成寻找阶段并恢复。
  const saved = JSON.parse(harness.storage.getItem("test.black-forest") ?? "{}");
  harness.storage.setItem(
    "test.black-forest",
    JSON.stringify({
      ...saved,
      eggs: { "nav.history": "bigEyes", "nav.dashboard": "longArms", "nav.settings": "smallBeak" },
      phase: "hunt",
    }),
  );
  const restored = createBlackForestEvent(harness.shared);
  restored.restore();
  assertEquals(restored.getPhase(), "hunt");
  const eggs = findAllByClass(harness.body, "lobotomy-corp-black-forest-egg");
  assertEquals(eggs.length, 3);
  eggs.forEach((egg) => {
    assertEquals(egg.children.length, 1);
    assertEquals(
      egg.children[0].className,
      "lobotomy-corp-black-forest-egg-spine",
    );
  });
  // 逐个点掉：每次点击都会把原图标放回去。
  for (const egg of [...eggs]) {
    (egg as ClickableElement).click();
  }
  assertEquals(restored.getPhase(), "suppress");
  assertEquals(findAllByClass(harness.body, "lobotomy-corp-black-forest-egg").length, 0);
  // 演出结束后（测试里直接调用 finish）挂上「破晓」，并把奖励写进存档。
  restored.finish({ completed: true });
  const finished = JSON.parse(harness.storage.getItem("test.black-forest") ?? "{}");
  assertEquals(finished.phase, "done");
  assertEquals(finished.gift, true);
  assertEquals(findAllByClass(harness.body, "lobotomy-corp-black-forest-gift").length, 0);
});

/** 重新开始这一天要还原所有被改过的图标，并保留已经拿到的「破晓」。 */
Deno.test("Black Forest restores icons and keeps the gift", () => {
  const harness = createBlackForestHarness();
  harness.storage.setItem(
    "test.black-forest",
    JSON.stringify({
      birds: [],
      eggs: { "nav.history": "bigEyes" },
      found: [],
      gift: true,
      id: "black-forest",
      order: [],
      phase: "hunt",
    }),
  );
  const restored = createBlackForestEvent(harness.shared);
  restored.restore();
  assertEquals(
    findAllByClass(harness.body, "lobotomy-corp-black-forest-egg").length,
    1,
  );
  restored.finish();
  assertEquals(
    findAllByClass(harness.body, "lobotomy-corp-black-forest-egg").length,
    0,
  );
  assertEquals(restored.isActive(), false);
  // 完成后再次输入鸟，事件可以重新开始，奖励标记保持为 true。
  assertStrictEquals(restored.recordSubmission("O-02-63"), true);
  assertEquals(restored.getPhase(), "cg");
  restored.finish();
  assertEquals(
    JSON.parse(harness.storage.getItem("test.black-forest") ?? "{}").gift,
    true,
  );
});

/** 样式表要按 prefab 的层级与几何实现 CG，并给出鸟蛋与「破晓」的样式。 */
Deno.test("Black Forest styles follow the prefab layers and gift slot", () => {
  const css = lobotomyCorpCss();
  const overlay = cssRule(css, "lobotomy-corp-black-forest-cg");
  assert(overlay.includes("inset: 0"));
  assert(overlay.includes("position: fixed"));
  assert(
    overlay.includes(
      "opacity: var(--lobotomy-corp-black-forest-canvas-alpha)",
    ),
  );
  const image = cssRule(css, "lobotomy-corp-black-forest-cg-image");
  assert(image.includes("scaleX(0.95)"));
  assert(
    image.includes(
      "opacity: var(--lobotomy-corp-black-forest-image-alpha)",
    ),
  );
  const text = cssRule(css, "lobotomy-corp-black-forest-cg-text");
  assert(text.includes("LobotomyAdventDesc"));
  assert(text.includes("white-space: pre-line"));
  assert(
    css.includes('.lobotomy-corp-black-forest-cg-text[data-cjk="1"]'),
  );
  const gift = cssRule(css, "account-avatar-risk-wrapper .lobotomy-corp-black-forest-gift");
  assert(gift.includes("position: absolute"));
  assert(gift.includes("right: -38%"));
  assert(gift.includes("bottom: -14%"));
  assert(gift.includes("z-index: 0"));
  const avatar = cssRule(css, "account-avatar-risk-wrapper > .account-avatar");
  assert(avatar.includes("z-index: 1"));
  assert(css.includes(".lobotomy-corp-black-forest-egg-spine"));
  assert(!css.includes(".lobotomy-corp-black-forest-egg-image"));
});

/** 台词文本必须与游戏本地化一致（中文 12 条 narration）。 */
Deno.test("Black Forest locale text matches the game narration", () => {
  for (
    const file of [
      "en-US",
      "es-ES",
      "ja-JP",
      "ko-KR",
      "ru-RU",
      "vi-VN",
      "zh-CN",
      "zh-TW",
    ]
  ) {
    const locale = JSON.parse(
      Deno.readTextFileSync(
        new URL(
          `../static/fun/lobotomy-corp/Locales/${file}.json`,
          import.meta.url,
        ),
      ),
    );
    Object.values(blackForestNarrations).forEach((narration) => {
      assert(
        typeof locale[narration.messageKey] === "string" &&
          locale[narration.messageKey].length > 0,
        `${file} 缺少 ${narration.messageKey}`,
      );
    });
    Object.values(blackForestEggs).forEach((egg) => {
      assert(
        typeof locale[egg.labelKey] === "string" && locale[egg.labelKey].length > 0,
        `${file} 缺少 ${egg.labelKey}`,
      );
    });
  }
  const chinese = JSON.parse(
    Deno.readTextFileSync(
      new URL(
        "../static/fun/lobotomy-corp/Locales/zh-CN.json",
        import.meta.url,
      ),
    ),
  );
  assertEquals(
    chinese["blackForest.story.opening"],
    "很久很久以前，在一片温暖又繁茂的森林里住着三只快乐的鸟儿。",
  );
  assertEquals(chinese["blackForest.egg.bigEyes.label"], "大眼");
  assertEquals(chinese["blackForest.egg.longArms.label"], "长臂");
  assertEquals(chinese["blackForest.egg.smallBeak.label"], "小喙");
});
