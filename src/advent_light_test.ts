/**
 * @file 白夜使徒转化光效（DeathAngel AdventLight）的原始数据回归测试。
 *
 * 期望值全部抄自《脑叶公司》解包资源，原文件路径与 GUID 写在对应断言上方；
 * 仓库里只保留运行时真正会加载的 Copy.png，不再存放用不到的 Unity 引擎文件。
 */
import { assert, assertEquals, assertStrictEquals } from "./test_helpers.ts";
import { assertThrows } from "@std/assert";
import { Element } from "./test_harness.ts";
import {
  adventLightAssetSources,
  adventLightCanvasCenterOffset,
  adventLightGuids,
  adventLightPixelsPerWorldUnit,
  adventLightQuadPixels,
  adventLightSpriteUrl,
  adventLightSpriteWorldSize,
  apostleAdventEffectAnimator,
  apostleAdventLightClip,
  apostleAdventLightStateAt,
  createDeathAngelAdventLight,
  deathAngelAdventLightCamera,
  deathAngelAdventLightPrefab,
  deathAngelAdventLightSprite,
  sampleAdventLightCurve,
} from "../static/fun/lobotomy-corp/Events/AdventLight.js";

/** 断言数值与期望值的误差在容差内。 */
function assertClose(actual: number, expected: number, tolerance = 1e-6): void {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `期望 ${expected}（容差 ${tolerance}），实际 ${actual}`,
  );
}

/**
 * 读取项目内保存的原始解包资源。
 *
 * @param relativePath `static/fun/lobotomy-corp/` 下的相对路径。
 * @return 文件文本。
 */
function readLobotomyAsset(relativePath: string): string {
  return Deno.readTextFileSync(
    new URL(`../static/fun/lobotomy-corp/${relativePath}`, import.meta.url),
  );
}

/**
 * 原始解包资源里的对应关系（原文件不再随仓库分发，数值留作回归基准）：
 *
 * | 原 Unity 路径 | GUID |
 * | --- | --- |
 * | Resources/prefabs/effect/creature/deathangel/AdventLight.prefab | 79280e2c0e88be941bd15f7ba5735991 |
 * | AnimatorController/ApostleAdventEffectAnim.controller | 18e09714d0ca85c47b13c9b45efe3297 |
 * | AnimationClip/ApostleAdventLight.anim | fc479c01352f30842ae3c8c3c09b88cf |
 * | Resources/texture/particle/Copy.asset（Sprite Copy） | c99b947dc65009e4ab96decbeff05da6 |
 * | Resources/texture/particle/Copy.png | 785d0033e07089d4aad28a478c464677 |
 */
Deno.test("AdventLight：GUID 与运行时贴图一致，且不保留引擎中间文件", () => {
  assertEquals(
    adventLightGuids.prefab,
    "79280e2c0e88be941bd15f7ba5735991",
  );
  assertEquals(
    adventLightGuids.animatorController,
    "18e09714d0ca85c47b13c9b45efe3297",
  );
  assertEquals(
    adventLightGuids.animationClip,
    "fc479c01352f30842ae3c8c3c09b88cf",
  );
  assertEquals(
    adventLightGuids.sprite,
    "c99b947dc65009e4ab96decbeff05da6",
  );
  assertEquals(
    adventLightGuids.spriteTexture,
    "785d0033e07089d4aad28a478c464677",
  );
  // 运行时真正加载的只有这张贴图（Sprite Copy 的贴图）。
  assertEquals(
    adventLightSpriteUrl("/static/fun/lobotomy-corp/Assets"),
    "/static/fun/lobotomy-corp/Assets/Resources/texture/particle/Copy.png",
  );
  assert(readLobotomyAsset(adventLightAssetSources.spriteTexture).length > 0);
  // Unity 引擎侧的中间文件（.anim / .controller / .prefab / .asset / .meta）
  // 运行时与测试都不再需要，不应随仓库分发。
  for (
    const path of [
      adventLightAssetSources.animationClip,
      adventLightAssetSources.animatorController,
      adventLightAssetSources.prefab,
      adventLightAssetSources.sprite,
      `${adventLightAssetSources.spriteTexture}.meta`,
    ]
  ) {
    assertThrows(() => readLobotomyAsset(path));
  }
});

Deno.test("AdventLight：AnimationClip 关键帧与原始 .anim 完全一致", () => {
  // 数值抄自 Assets/AnimationClip/ApostleAdventLight.anim
  // （GUID fc479c01352f30842ae3c8c3c09b88cf），每帧记为
  // [time, value, inSlope, outSlope]。
  const frames = (
    curve: {
      keys: ReadonlyArray<{
        inSlope: number;
        outSlope: number;
        time: number;
        value: number;
      }>;
    },
  ) => curve.keys.map((key) => [key.time, key.value, key.inSlope, key.outSlope]);
  const curves = apostleAdventLightClip.curves;
  // ParticlePretend 的缩放：4.309822 → 1 → 10。
  assertEquals(frames(curves.scale), [
    [0, 4.309822, 0, 3.9428573],
    [1.6333333, 1, -2.0264237, 41.538456],
    [1.85, 10, 41.538456, 0],
  ]);
  assertEquals(frames(curves.colorRed), [
    [0, 0.8455882, 0, -0.16656661],
    [1.6333333, 0.5735294, -0.08328331, -0.083283305],
    [1.85, 0.5735294, 6.05921e-9, 0],
  ]);
  assertEquals(frames(curves.colorGreen), [
    [0, 0.7920743, 0, -0.48494348],
    [1.6333333, 0, -0.242472, -0.24247174],
    [1.85, 0, 1.7642932e-10, 0],
  ]);
  assertEquals(frames(curves.colorBlue), [
    [0, 0.3606185, 0, -0.22078684],
    [1.6333333, 0, -0.11039353, -0.11039342],
    [1.85, 0, -5.3728693e-9, 0],
  ]);
  assertEquals(frames(curves.colorAlpha), [[0, 1, 0, 0], [1.85, 1, 0, 0]]);
  assertEquals(frames(curves.particleActive), [
    [0, 1, 0, Infinity],
    [1.85, 0, 0, 0],
  ]);
  // `Center` 在 AdventLight.prefab 里没有对应对象，只作记录。
  assertEquals(frames(curves.unboundCenterActive), [
    [0, 0, 0, Infinity],
    [1.7666667, 1, 0, 0],
    [1.85, 1, 0, 0],
  ]);
  // m_StopTime 1.85、m_SampleRate 60、m_LoopTime 0、m_Events 空。
  assertEquals(apostleAdventLightClip.stopTime, 1.85);
  assertEquals(apostleAdventLightClip.sampleRate, 60);
  assertStrictEquals(apostleAdventLightClip.loop, false);
  assertEquals([...apostleAdventLightClip.events], []);
});

Deno.test("AdventLight：Animator 状态机与原始 controller 完全一致", () => {
  // 数值抄自 Assets/AnimatorController/ApostleAdventEffectAnim.controller
  // （GUID 18e09714d0ca85c47b13c9b45efe3297）。
  assertEquals(apostleAdventEffectAnimator.name, "ApostleAdventEffectAnim");
  // 参数只有 Trigger `Run`（m_Type 9）。
  assertEquals(
    [...apostleAdventEffectAnimator.parameters],
    [{ name: "Run", type: "Trigger" }],
  );
  assertEquals(
    [...apostleAdventEffectAnimator.states],
    [
      { motion: null, name: "New State" },
      { motion: "ApostleAdventLight", name: "ApostleAdventLight" },
    ],
  );
  // 默认状态是不带动画的空状态（Unity 把「没有 motion」写成 fileID 0）。
  assertEquals(apostleAdventEffectAnimator.defaultState, "New State");
  assertEquals(apostleAdventEffectAnimator.states[0].motion, null);
  // AnyState 收到 Trigger Run：零时长过渡进入 ApostleAdventLight。
  assertEquals(
    {...apostleAdventEffectAnimator.anyStateTransition},
    {
      condition: "Run",
      destination: "ApostleAdventLight",
      hasExitTime: false,
      transitionDuration: 0,
    },
  );
  // 播完按 Exit Time 1、零时长回到空状态。
  assertEquals(
    {...apostleAdventEffectAnimator.exitTransition},
    {
      destination: "New State",
      exitTime: 1,
      hasExitTime: true,
      source: "ApostleAdventLight",
      transitionDuration: 0,
    },
  );
});

Deno.test("AdventLight：prefab 结构与 SpriteRenderer 参数与原始 prefab 一致", () => {
  // 数值抄自 Assets/Resources/prefabs/effect/creature/deathangel/AdventLight.prefab
  // （GUID 79280e2c0e88be941bd15f7ba5735991）：只有 AdventLight 与 ParticlePretend
  // 两个 GameObject。
  assertEquals(deathAngelAdventLightPrefab.name, "AdventLight");
  assertEquals(deathAngelAdventLightPrefab.particle.name, "ParticlePretend");
  assertEquals(deathAngelAdventLightPrefab.particle.sortingOrder, 10);
  assertEquals(
    deathAngelAdventLightPrefab.particle.sortingLayerId,
    -355962239,
  );
  assertEquals(
    {...deathAngelAdventLightPrefab.particle.localPosition},
    { x: 0, y: 0, z: 0 },
  );
  // prefab 里的默认缩放（Run 状态下由 .anim 的 m_LocalScale 覆盖，不参与相乘）。
  assertEquals(
    {...deathAngelAdventLightPrefab.particle.localScale},
    { x: 5.5, y: 5.5, z: 1 },
  );
  // 挂点：使徒动画 prefab 里 AdventLight 相对单位原点 localPosition = (0, 2, 0)。
  assertEquals(
    {...deathAngelAdventLightPrefab.localPosition},
    { x: 0, y: 2, z: 0 },
  );
  // Animator 使用 UnscaledTime（m_UpdateMode: 2）。
  assertEquals(deathAngelAdventLightPrefab.animator.updateMode, "UnscaledTime");
});

Deno.test("AdventLight：Sprite Copy 的几何与贴图和原始资源一致", () => {
  // 数值抄自 Assets/Resources/texture/particle/Copy.asset
  // （GUID c99b947dc65009e4ab96decbeff05da6），贴图是 Copy.png。
  assertEquals(deathAngelAdventLightSprite.name, "Copy");
  assertEquals(
    {...deathAngelAdventLightSprite.rect},
    { height: 247.84775, width: 247.84775, x: 4.0761204, y: 4.0761204 },
  );
  assertEquals(deathAngelAdventLightSprite.pixelsToUnits, 100);
  assertEquals(
    {...deathAngelAdventLightSprite.pivot},
    { x: 0.50000006, y: 0.50000006 },
  );
  assertEquals(
    {...deathAngelAdventLightSprite.texture},
    { height: 256, width: 256 },
  );
  assertEquals(
    deathAngelAdventLightSprite.textureGuid,
    adventLightGuids.spriteTexture,
  );

  // 项目内的 Copy.png 就是这张 Sprite 引用的贴图：读 IHDR 核对尺寸。
  const png = Deno.readFileSync(
    new URL(
      "../static/fun/lobotomy-corp/Assets/Resources/texture/particle/Copy.png",
      import.meta.url,
    ),
  );
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  assertEquals(view.getUint32(16), deathAngelAdventLightSprite.texture.width);
  assertEquals(view.getUint32(20), deathAngelAdventLightSprite.texture.height);
  // Sprite 世界尺寸 = m_Rect.width / m_PixelsToUnits。
  assertClose(adventLightSpriteWorldSize(), 247.84775 / 100, 1e-9);
});

Deno.test("AdventLight：颜色与缩放按 .anim 关键帧取值", () => {
  const clip = apostleAdventLightClip;
  const start = apostleAdventLightStateAt(0);
  assertStrictEquals(start.active, true);
  assertClose(start.scale, 4.309822);
  assertClose(start.color.red, 0.8455882);
  assertClose(start.color.green, 0.7920743);
  assertClose(start.color.blue, 0.3606185);

  // 1.6333333 秒：缩到最小、颜色变成纯红。
  const hold = apostleAdventLightStateAt(1.6333333);
  assertClose(hold.scale, 1);
  assertClose(hold.color.red, 0.5735294);
  assertClose(hold.color.green, 0);
  assertClose(hold.color.blue, 0);
  assertStrictEquals(hold.active, true);
  // 黄 → 红的过渡由 .anim 的 m_Color 曲线给出，不是手写时间轴。
  assert(
    start.color.green > hold.color.green &&
      start.color.blue > hold.color.blue,
    "光效应从偏黄过渡到纯红",
  );

  // 1.85 秒后动画结束：m_IsActive 关闭，退出时间等于 m_StopTime。
  const finished = apostleAdventLightStateAt(clip.stopTime);
  assertStrictEquals(finished.finished, true);
  assertStrictEquals(finished.active, false);
  assertClose(sampleAdventLightCurve(clip.curves.scale, 1.85), 10);
});

/**
 * 这条测试专门锁「先收缩、再放大、最后消失」以及它的**尺寸尺度**。
 *
 * Unity 的动画曲线对 Transform.localScale 是绝对值覆盖，`.anim` 的
 * `m_LocalScale`（4.309822 → 1 → 10）直接就是 ParticlePretend 的缩放，
 * prefab 里记的 5.5 只在动画状态之外有效。所以光斑边长是
 * `Sprite 世界边长 2.4784775 × 曲线值 × 108`：最小帧约 267.7px（比 ClockFrame
 * 约 400px 的内孔更小，因此收缩看得见），起手 1153.8px、爆闪 2676.8px。
 * 一旦有人把 5.5 乘回去（光斑最小也有 1472px，比整个转盘还大），这条测试就会失败。
 */
Deno.test("AdventLight：先收缩、再放大、最后消失且尺寸落在盘心内孔上", () => {
  const keys = apostleAdventLightClip.curves.scale.keys;
  assertEquals(
    keys.map((key) => [key.time, key.value]),
    [[0, 4.309822], [1.6333333, 1], [1.85, 10]],
  );
  // 0 秒的 outSlope 为正：Hermite 段让曲线先涨一点再往下走。
  assert(keys[0].outSlope > 0, "起手应有一个微小的膨胀");
  assert(keys[1].outSlope > 0 && keys[2].inSlope > 0, "末段应持续放大");

  const scaleAt = (time: number) => apostleAdventLightStateAt(time).scale;
  assertClose(scaleAt(0.3), 4.8953, 0.001);
  assert(scaleAt(0.5) < scaleAt(0.3));
  assert(scaleAt(1) < scaleAt(0.5));
  assertClose(scaleAt(1.6333333), 1, 1e-9);
  assert(scaleAt(1.6) > scaleAt(1.6333333));
  // 之后单调放大到 10。
  let previous = scaleAt(1.6333333);
  for (let time = 1.65; time <= 1.85 + 1e-9; time += 0.01) {
    const scale = scaleAt(Math.min(time, apostleAdventLightClip.stopTime));
    assert(scale >= previous - 1e-9, `t=${time.toFixed(2)}s 应继续放大`);
    previous = scale;
  }
  assertClose(previous, 10, 1e-9);

  // 尺寸尺度：最小帧必须小于盘心内孔（约 400px），否则收缩看不出来。
  assertClose(adventLightQuadPixels(1), 267.67557, 0.001);
  assertClose(adventLightQuadPixels(4.309822), 1153.63409, 0.01);
  assertClose(adventLightQuadPixels(10), 2676.7557, 0.01);
  assert(
    adventLightQuadPixels(1) < 400,
    "最小光斑必须小于转盘内孔，否则看不到收缩",
  );
  assert(
    adventLightQuadPixels(4.309822) > 400 &&
      adventLightQuadPixels(10) > 400,
    "起手与爆闪都必须铺满内孔",
  );
  // 把 prefab 的 5.5 乘进来就会得到 1472px（比整个转盘还大）——必须不会发生。
  assert(
    Math.abs(adventLightQuadPixels(1) - 1472.2) > 1,
    "光斑尺寸不得再乘 ParticlePretend 的 prefab 默认缩放",
  );

  // 放大到 10 的那一刻正好是 m_IsActive 关闭处：最后才消失。
  const burst = apostleAdventLightStateAt(1.8499);
  assertStrictEquals(burst.active, true);
  assert(burst.scale > 9.9);
  const end = apostleAdventLightStateAt(1.85);
  assertStrictEquals(end.active, false);
  assertStrictEquals(end.finished, true);
});

Deno.test("AdventLight：页面组件使用原始贴图与 prefab 尺寸", () => {
  const document = { createElement: () => new Element() };
  const assetRoot = "/static/fun/lobotomy-corp/Assets";
  const light = createDeathAngelAdventLight({ assetRoot, document });
  const particle = light.element.children[0];
  assertEquals(particle.className, "lobotomy-corp-advent-light-particle");
  assertEquals(
    particle.styleProperties.get("--lobotomy-corp-advent-light-sprite"),
    `url('${adventLightSpriteUrl(assetRoot)}')`,
  );
  assert(
    particle.styleProperties.get("--lobotomy-corp-advent-light-sprite")!
      .includes("Resources/texture/particle/Copy.png"),
    "光效必须使用 GUID c99b… 反查到的 Copy.png",
  );
  // 尺寸 = Sprite 世界尺寸 × 动画 m_LocalScale × 像素/单位。
  // `.anim` 的 m_LocalScale 是绝对值覆盖 Transform.localScale，prefab 里的 5.5
  // 只在动画状态之外有效，绝不能乘进来。
  assertEquals(
    particle.styleProperties.get("--lobotomy-corp-advent-light-size"),
    `${adventLightQuadPixels(1)}px`,
  );
  assertClose(
    adventLightQuadPixels(1),
    adventLightSpriteWorldSize() * 1 *
      adventLightPixelsPerWorldUnit(deathAngelAdventLightCamera.referenceScale),
    1e-9,
  );
  // 光斑中心比画布中心高 1 个世界单位（AdventLight 挂在单位 +2、镜头抬高 +1）。
  assertEquals(adventLightCanvasCenterOffset(1), { x: 0, y: -108 });
  assertEquals(light.element.styleProperties.get("left"), "960px");
  assertEquals(light.element.styleProperties.get("top"), "432px");

  // prefab 里 AdventLight / ParticlePretend 都是 inactive：Run 之前不显示。
  assertEquals(
    particle.styleProperties.get("--lobotomy-corp-advent-light-visible"),
    "0",
  );
  light.run(1000);
  assertEquals(
    particle.styleProperties.get("--lobotomy-corp-advent-light-visible"),
    "1",
  );
  const channels = /rgb\(([\d.]+) ([\d.]+) ([\d.]+)\)/u.exec(
    particle.styleProperties.get("--lobotomy-corp-advent-light-color")!,
  );
  assert(channels, "颜色应写成 rgb()");
  assertClose(Number(channels![1]), 0.8455882 * 255, 0.001);
  assertClose(Number(channels![2]), 0.7920743 * 255, 0.001);
  assertClose(Number(channels![3]), 0.3606185 * 255, 0.001);
});

Deno.test("AdventLight：每次 Run 都从第 0 帧开始，播完自动复位", () => {
  const document = { createElement: () => new Element() };
  const light = createDeathAngelAdventLight({
    assetRoot: "/static/fun/lobotomy-corp/Assets",
    document,
  });
  const particle = light.element.children[0];
  const scale = () =>
    Number(
      particle.styleProperties.get("--lobotomy-corp-advent-light-scale"),
    );
  const visible = () =>
    particle.styleProperties.get("--lobotomy-corp-advent-light-visible");

  light.run(5000);
  assertClose(scale(), 4.309822);
  // 播放到中途仍然在推进。
  assertEquals(light.render(5900), true);
  const midScale = scale();
  assert(midScale !== 4.309822, "中途应已经离开第 0 帧");
  // 第二名使徒重新 Run：必须回到第 0 帧，而不是沿用上一名的进度。
  light.run(10000);
  assertClose(scale(), 4.309822);
  assertStrictEquals(light.isRunning(), true);
  // 动画播完（m_StopTime 1.85 秒）后复位并隐藏。
  assertEquals(light.render(10000 + 1850), false);
  assertEquals(visible(), "0");
  assertStrictEquals(light.isRunning(), false);
  // 已经结束时再次 render 不会重新点亮。
  assertEquals(light.render(20000), false);
  assertEquals(visible(), "0");
});

Deno.test("AdventLight：不得用 CSS 渐变或自制贴图代替原资源", () => {
  const css = readLobotomyAsset("lobotomy-corp.css");
  const plagueDoctor = readLobotomyAsset("Events/PlagueDoctor.js");
  const adventLight = readLobotomyAsset("Events/AdventLight.js");
  for (
    const [name, source] of [
      ["lobotomy-corp.css", css],
      ["PlagueDoctor.js", plagueDoctor],
      ["AdventLight.js", adventLight],
    ]
  ) {
    assertEquals(
      /(?:radial|linear|conic)-gradient/u.test(source),
      false,
      `${name} 不得用渐变近似 AdventLight`,
    );
  }
  assert(
    css.includes("mask-image: var(--lobotomy-corp-advent-light-sprite)"),
    "AdventLight 应把原始 Copy.png 当作 alpha 蒙版",
  );
  assert(
    !css.includes("lobotomy-corp-plague-doctor-advent-flash"),
    "盘心闪光层应被原始 AdventLight 取代",
  );
});
