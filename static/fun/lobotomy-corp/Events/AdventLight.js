/**
 * @file 白夜使徒转化使用的原始 AdventLight 视觉链。
 *
 * 全部数值都来自《脑叶公司》解包资源中按 GUID 反查到的原始文件，没有任何按
 * 视频观感调整的颜色、时长或过渡：
 *
 * - Prefab：`Assets/Resources/prefabs/effect/creature/deathangel/AdventLight.prefab`
 *   （GUID `79280e2c0e88be941bd15f7ba5735991`）。结构为
 *   `AdventLight └── ParticlePretend`：根节点带 Animator，
 *   `ParticlePretend` 带 SpriteRenderer（localPosition 0、
 *   Sorting Layer `Particle`、Sorting Order 10）。
 * - Animator Controller：`Assets/AnimatorController/ApostleAdventEffectAnim.controller`
 *   （GUID `18e09714d0ca85c47b13c9b45efe3297`）。默认空状态，Trigger `Run`
 *   经零时长过渡进入 `ApostleAdventLight`，动画播完后按 Exit Time 1 回到空状态。
 * - AnimationClip：`Assets/AnimationClip/ApostleAdventLight.anim`
 *   （GUID `fc479c01352f30842ae3c8c3c09b88cf`，m_StopTime 1.85）。
 * - Sprite：`Assets/Resources/texture/particle/Copy.asset`
 *   （GUID `c99b947dc65009e4ab96decbeff05da6`），贴图
 *   `Assets/Resources/texture/particle/Copy.png`
 *   （GUID `785d0033e07089d4aad28a478c464677`，256×256，247.84775² 的有效区）。
 *
 * 使徒单位里的挂点来自
 * `Assets/Resources/prefabs/unit/creatureanimator/apostle/ScytheApostleAnim.prefab`
 * 等使徒动画 prefab：`AdventLight` 相对单位原点 localPosition 为 (0, 2, 0)。
 *
 * 尺寸：Unity 动画曲线对 Transform.localScale 是**绝对值写入**，
 * `ApostleAdventLight.anim` 的 `m_LocalScale` 每帧直接覆盖
 * `ParticlePretend.localScale`（prefab 里记的 5.5 只在动画状态之外有效），
 * 因此光斑边长就是 `Sprite 世界边长 × 动画 m_LocalScale 值 × 每单位像素`。
 */
// @ts-check

import {
  lobotomyCorpReferenceCanvasHeight,
  lobotomyCorpReferenceCanvasWidth,
} from './CanvasScaler.js';

/** 本模块用到的原始资源在项目内的路径（与 Unity 工程层级一一对应）。 */
export const adventLightAssetSources = Object.freeze({
  animationClip: 'Assets/AnimationClip/ApostleAdventLight.anim',
  animatorController:
    'Assets/AnimatorController/ApostleAdventEffectAnim.controller',
  prefab:
    'Assets/Resources/prefabs/effect/creature/deathangel/AdventLight.prefab',
  sprite: 'Assets/Resources/texture/particle/Copy.asset',
  spriteTexture: 'Assets/Resources/texture/particle/Copy.png',
});

/** 原始资源 GUID，用于和项目内保存的解包文件互相校验。 */
export const adventLightGuids = Object.freeze({
  animationClip: 'fc479c01352f30842ae3c8c3c09b88cf',
  animatorController: '18e09714d0ca85c47b13c9b45efe3297',
  prefab: '79280e2c0e88be941bd15f7ba5735991',
  sprite: 'c99b947dc65009e4ab96decbeff05da6',
  spriteTexture: '785d0033e07089d4aad28a478c464677',
});

/**
 * `AdventLight.prefab` 的结构与 SpriteRenderer 参数。
 *
 * `ParticlePretend` 在 prefab 里默认 inactive，动画第 0 帧的 `m_IsActive`
 * 曲线才把它打开，因此网页同样以「不可见」作为初始状态。
 */
export const deathAngelAdventLightPrefab = Object.freeze({
  animator: Object.freeze({
    /** m_UpdateMode: 2 = UnscaledTime，光效不受时间缩放影响。 */
    updateMode: 'UnscaledTime',
  }),
  /**
   * 使徒动画 prefab 中 AdventLight 相对单位原点的 localPosition。
   *
   * 单位自身 localScale 等于该员工所在通道的 currentScale，所以世界偏移是
   * localPosition × currentScale。
   */
  localPosition: Object.freeze({ x: 0, y: 2, z: 0 }),
  name: 'AdventLight',
  particle: Object.freeze({
    localPosition: Object.freeze({ x: 0, y: 0, z: 0 }),
    /**
     * ParticlePretend 在 prefab 里的 Transform.localScale。
     *
     * 这是动画状态之外（空状态 / 未触发 Run）的默认值：`Run` 一旦进入
     * `ApostleAdventLight`，`.anim` 的 `m_LocalScale` 会按绝对值覆盖它，
     * 所以计算光斑尺寸时**不能**把它乘进动画曲线值。
     */
    localScale: Object.freeze({ x: 5.5, y: 5.5, z: 1 }),
    name: 'ParticlePretend',
    sortingLayer: 'Particle',
    sortingLayerId: -355962239,
    sortingOrder: 10,
  }),
});

/** `Copy.asset`（Sprite `Copy`）的几何与贴图信息。 */
export const deathAngelAdventLightSprite = Object.freeze({
  guid: adventLightGuids.sprite,
  name: 'Copy',
  /** Sprite 的 m_Rect：贴图内实际有效区域（Unity 原点在左下角）。 */
  rect: Object.freeze({
    height: 247.84775,
    width: 247.84775,
    x: 4.0761204,
    y: 4.0761204,
  }),
  /** m_PixelsToUnits：100 像素 = 1 世界单位。 */
  pixelsToUnits: 100,
  pivot: Object.freeze({ x: 0.50000006, y: 0.50000006 }),
  texture: Object.freeze({ height: 256, width: 256 }),
  textureGuid: adventLightGuids.spriteTexture,
});

/**
 * `ApostleAdventEffectAnim.controller` 的状态机。
 *
 * 默认状态是不带动画的空状态；`Run` 触发零时长过渡进入 `ApostleAdventLight`，
 * 该状态播完后按 Exit Time 1 回到空状态，因此每次 Run 都从第 0 帧重新开始。
 */
export const apostleAdventEffectAnimator = Object.freeze({
  anyStateTransition: Object.freeze({
    condition: 'Run',
    destination: 'ApostleAdventLight',
    hasExitTime: false,
    transitionDuration: 0,
  }),
  defaultState: 'New State',
  exitTransition: Object.freeze({
    destination: 'New State',
    exitTime: 1,
    hasExitTime: true,
    source: 'ApostleAdventLight',
    transitionDuration: 0,
  }),
  guid: adventLightGuids.animatorController,
  name: 'ApostleAdventEffectAnim',
  parameters: Object.freeze([
    Object.freeze({ name: 'Run', type: 'Trigger' }),
  ]),
  states: Object.freeze([
    Object.freeze({ motion: null, name: 'New State' }),
    Object.freeze({
      motion: 'ApostleAdventLight',
      name: 'ApostleAdventLight',
    }),
  ]),
});

/**
 * `ApostleAdventLight.anim` 的关键帧。
 *
 * 关键帧按 Unity 的序列化原样保存：`inSlope` / `outSlope` 是 Unity 求值用的
 * Hermite 切线，`tangentMode` 只影响编辑器显示，故不参与换算。
 */
export const apostleAdventLightClip = Object.freeze({
  curves: Object.freeze({
    /** m_Color.a：整段保持 1。 */
    colorAlpha: Object.freeze({
      attribute: 'm_Color.a',
      keys: Object.freeze([
        Object.freeze({
          inSlope: 0,
          outSlope: 0,
          time: 0,
          value: 1,
        }),
        Object.freeze({
          inSlope: 0,
          outSlope: 0,
          time: 1.85,
          value: 1,
        }),
      ]),
      path: 'ParticlePretend',
    }),
    /** m_Color.b：0.3606185 → 0。 */
    colorBlue: Object.freeze({
      attribute: 'm_Color.b',
      keys: Object.freeze([
        Object.freeze({
          inSlope: 0,
          outSlope: -0.22078684,
          time: 0,
          value: 0.3606185,
        }),
        Object.freeze({
          inSlope: -0.11039353,
          outSlope: -0.11039342,
          time: 1.6333333,
          value: 0,
        }),
        Object.freeze({
          inSlope: -5.3728693e-9,
          outSlope: 0,
          time: 1.85,
          value: 0,
        }),
      ]),
      path: 'ParticlePretend',
    }),
    /** m_Color.g：0.7920743 → 0。 */
    colorGreen: Object.freeze({
      attribute: 'm_Color.g',
      keys: Object.freeze([
        Object.freeze({
          inSlope: 0,
          outSlope: -0.48494348,
          time: 0,
          value: 0.7920743,
        }),
        Object.freeze({
          inSlope: -0.242472,
          outSlope: -0.24247174,
          time: 1.6333333,
          value: 0,
        }),
        Object.freeze({
          inSlope: 1.7642932e-10,
          outSlope: 0,
          time: 1.85,
          value: 0,
        }),
      ]),
      path: 'ParticlePretend',
    }),
    /** m_Color.r：0.8455882 → 0.5735294。 */
    colorRed: Object.freeze({
      attribute: 'm_Color.r',
      keys: Object.freeze([
        Object.freeze({
          inSlope: 0,
          outSlope: -0.16656661,
          time: 0,
          value: 0.8455882,
        }),
        Object.freeze({
          inSlope: -0.08328331,
          outSlope: -0.083283305,
          time: 1.6333333,
          value: 0.5735294,
        }),
        Object.freeze({
          inSlope: 6.05921e-9,
          outSlope: 0,
          time: 1.85,
          value: 0.5735294,
        }),
      ]),
      path: 'ParticlePretend',
    }),
    /**
     * classID 1 / path `Center` 的 m_IsActive 曲线。
     *
     * `AdventLight.prefab` 没有名为 `Center` 的子节点，这条绑定在运行光效的
     * GameObject 上解析不到对象，因此不参与网页演出；这里保留记录以便核对
     * 原始 `.anim`，不生成任何视觉。
     */
    unboundCenterActive: Object.freeze({
      attribute: 'm_IsActive',
      keys: Object.freeze([
        Object.freeze({
          inSlope: 0,
          outSlope: Infinity,
          time: 0,
          value: 0,
        }),
        Object.freeze({
          inSlope: 0,
          outSlope: 0,
          time: 1.7666667,
          value: 1,
        }),
        Object.freeze({
          inSlope: 0,
          outSlope: 0,
          time: 1.85,
          value: 1,
        }),
      ]),
      path: 'Center',
    }),
    /** ParticlePretend 的 m_IsActive：0 秒打开，1.85 秒关闭。 */
    particleActive: Object.freeze({
      attribute: 'm_IsActive',
      keys: Object.freeze([
        Object.freeze({
          inSlope: 0,
          outSlope: Infinity,
          time: 0,
          value: 1,
        }),
        Object.freeze({
          inSlope: 0,
          outSlope: 0,
          time: 1.85,
          value: 0,
        }),
      ]),
      path: 'ParticlePretend',
    }),
    /**
     * ParticlePretend 的 m_LocalScale（三个轴同值）。
     *
     * 4.309822 →（1.6333333 秒）1 →（1.85 秒）10：先收缩成小光斑，
     * 最后 0.2167 秒迅速扩大并在放大到 10 的瞬间随 m_IsActive 关闭。
     */
    scale: Object.freeze({
      attribute: 'm_LocalScale',
      keys: Object.freeze([
        Object.freeze({
          inSlope: 0,
          outSlope: 3.9428573,
          time: 0,
          value: 4.309822,
        }),
        Object.freeze({
          inSlope: -2.0264237,
          outSlope: 41.538456,
          time: 1.6333333,
          value: 1,
        }),
        Object.freeze({
          inSlope: 41.538456,
          outSlope: 0,
          time: 1.85,
          value: 10,
        }),
      ]),
      path: 'ParticlePretend',
    }),
  }),
  /** m_Events 为空，动画不携带 Animation Event。 */
  events: Object.freeze([]),
  guid: adventLightGuids.animationClip,
  /** m_LoopTime = 0。 */
  loop: false,
  name: 'ApostleAdventLight',
  /** m_SampleRate。 */
  sampleRate: 60,
  /** m_AnimationClipSettings.m_StopTime，也是网页的 Run 时长。 */
  stopTime: 1.85,
});

/**
 * 使徒转化光效在 1920×1080 逻辑画布上的落点与基准尺寸。
 *
 * 镜头把被聚焦的员工放到画面中心偏下 1 × currentScale 个世界单位处
 * （`ExecuteNextAdventTarget` 把镜头终点抬高 `1 * currentScale`），而 AdventLight
 * 挂在单位本地 (0, 2, 0)，所以光斑中心比画面中心高 1 × currentScale 个世界单位，
 * 换算成逻辑像素即为 {@link adventLightCanvasCenterOffset} 的 y 偏移。
 */
export const deathAngelAdventLightCamera = Object.freeze({
  /** `currentViewPosition.y += 1f * currentScale`。 */
  focusOffsetY: 1,
  /** `float ortho = 5f - (1f - currentScale) * 4f`。 */
  orthographicBase: 5,
  orthographicScale: 4,
  /** PassageObjectModel.scaleFactor 的默认值，也是普通房间的取值。 */
  referenceScale: 1,
});

/**
 * 把数值收束到闭区间。
 *
 * @param {number} value 待限制的数值。
 * @param {number} minimum 最小值。
 * @param {number} maximum 最大值。
 * @return {number} 限制后的数值。
 */
function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * 计算聚焦员工时 1 个世界单位对应的逻辑画布像素数。
 *
 * 正交相机的可见高度是 `2 × orthographicSize` 个世界单位，而逻辑画布高
 * 1080 像素，因此 `像素/单位 = 1080 / (2 × ortho)`。
 *
 * @param {number} [currentScale] 员工所在通道的 scaleFactor。
 * @return {number} 每个世界单位占用的逻辑像素数。
 */
export function adventLightPixelsPerWorldUnit(
  currentScale = deathAngelAdventLightCamera.referenceScale,
) {
  const ortho = deathAngelAdventLightCamera.orthographicBase -
    (1 - currentScale) * deathAngelAdventLightCamera.orthographicScale;
  return orthographicPixelsPerUnit(ortho);
}

/**
 * 按正交尺寸换算每世界单位的逻辑像素数。
 *
 * @param {number} orthographicSize 相机的 orthographicSize。
 * @return {number} 每个世界单位占用的逻辑像素数。
 */
function orthographicPixelsPerUnit(orthographicSize) {
  const size = Number.isFinite(orthographicSize) && orthographicSize > 0
    ? orthographicSize
    : deathAngelAdventLightCamera.orthographicBase;
  return lobotomyCorpReferenceCanvasHeight / (2 * size);
}

/**
 * Sprite `Copy` 的世界尺寸（贴图有效区 / PixelsToUnits）。
 *
 * @return {number} Sprite 在世界坐标下的边长。
 */
export function adventLightSpriteWorldSize() {
  return deathAngelAdventLightSprite.rect.width /
    deathAngelAdventLightSprite.pixelsToUnits;
}

/**
 * 计算光斑中心相对画布中心的偏移（CSS 坐标，向上为负）。
 *
 * @param {number} [currentScale] 员工所在通道的 scaleFactor。
 * @return {{x: number, y: number}} 相对 1920×1080 画布中心的逻辑像素偏移。
 */
export function adventLightCanvasCenterOffset(
  currentScale = deathAngelAdventLightCamera.referenceScale,
) {
  const pixelsPerUnit = adventLightPixelsPerWorldUnit(currentScale);
  const worldOffset = deathAngelAdventLightPrefab.localPosition.y -
    deathAngelAdventLightCamera.focusOffsetY;
  return { x: 0, y: -worldOffset * currentScale * pixelsPerUnit };
}

/**
 * 计算 `ParticlePretend` 在动画缩放下的逻辑像素边长。
 *
 * 尺寸 = Sprite 世界边长 × 动画 `m_LocalScale` 值 × 每世界单位像素数。
 *
 * 这个结果与圆盘（AdventClockUI 的 Clock，819 逻辑像素）是固定比例：
 * 动画最小帧 267.7px ≈ 819 × 0.327，起手 1153.6px ≈ 819 × 1.409，
 * 所以光斑在任何窗口下都随圆盘一起缩放，不需要按屏幕单独调。
 *
 * Unity 的 `AnimationClip` 对 Transform.localScale 是**覆盖**语义：曲线每帧把
 * `ParticlePretend.localScale` 写成曲线值，prefab 上的 5.5 只在动画状态之外
 * （空状态）生效，因此这里不能把 5.5 乘进来——否则光斑会被放大 5.5 倍，
 * 变成比整个转盘还大，盘心内孔里就再也看不出先缩后放大的过程。
 *
 * @param {number} animationScale `.anim` 在该时刻的 m_LocalScale 值。
 * @param {number} [currentScale] 员工所在通道的 scaleFactor。
 * @return {number} 该帧光斑的逻辑像素边长。
 */
export function adventLightQuadPixels(
  animationScale,
  currentScale = deathAngelAdventLightCamera.referenceScale,
) {
  return adventLightSpriteWorldSize() *
    Math.max(animationScale, 0) * adventLightPixelsPerWorldUnit(currentScale);
}

/**
 * 采样 Unity AnimationCurve 的 Hermite 插值。
 *
 * Unity 运行时用左右关键帧的值与 outSlope/inSlope 构成三次 Hermite 段，
 * 因此这里直接照抄切线，不做任何平滑或手调。
 *
 * @param {{keys: ReadonlyArray<{inSlope: number, outSlope: number, time: number, value: number}>}} curve `.anim` 曲线。
 * @param {number} time 采样时间（秒）。
 * @return {number} 该时间点的曲线值。
 */
export function sampleAdventLightCurve(curve, time) {
  const keys = curve?.keys ?? [];
  if (keys.length === 0) return 0;
  if (time <= keys[0].time) return keys[0].value;
  const last = keys[keys.length - 1];
  if (time >= last.time) return last.value;
  for (let index = 1; index < keys.length; index++) {
    const next = keys[index];
    if (time > next.time) continue;
    const previous = keys[index - 1];
    const span = next.time - previous.time;
    if (!(span > 0)) return next.value;
    const rate = (time - previous.time) / span;
    const rate2 = rate * rate;
    const rate3 = rate2 * rate;
    // 三次 Hermite 基函数，切线按段长缩放后与 Unity 一致。
    const h00 = 2 * rate3 - 3 * rate2 + 1;
    const h10 = rate3 - 2 * rate2 + rate;
    const h01 = -2 * rate3 + 3 * rate2;
    const h11 = rate3 - rate2;
    return h00 * previous.value + h10 * span * previous.outSlope +
      h01 * next.value + h11 * span * next.inSlope;
  }
  return last.value;
}

/**
 * 采样 `m_IsActive` 这类布尔曲线。
 *
 * Unity 用无限切线表达「保持到下一个关键帧再跳变」，所以这里按阶梯处理，
 * 不对布尔值做插值。
 *
 * @param {{keys: ReadonlyArray<{time: number, value: number}>}} curve `.anim` 的 m_IsActive 曲线。
 * @param {number} time 采样时间（秒）。
 * @return {boolean} 该时间点对象是否激活。
 */
export function sampleAdventLightActiveCurve(curve, time) {
  const keys = curve?.keys ?? [];
  if (keys.length === 0) return false;
  if (time < keys[0].time) return false;
  let value = keys[0].value;
  for (const key of keys) {
    if (key.time > time) break;
    value = key.value;
  }
  return value >= 0.5;
}

/**
 * 取出 `ApostleAdventLight` 在某个时间点的完整表现。
 *
 * 返回值就是 SpriteRenderer 的 Color、Transform 的缩放与 GameObject 的
 * active 状态；时间超出 `m_StopTime` 时按空状态处理（光效关闭）。
 *
 * @param {number} time 距离触发 `Run` 的秒数。
 * @return {{active: boolean, color: {alpha: number, blue: number, green: number, red: number}, finished: boolean, scale: number, time: number}} 该帧表现。
 */
export function apostleAdventLightStateAt(time) {
  const clip = apostleAdventLightClip;
  const seconds = Number.isFinite(time) ? time : 0;
  const clamped = clamp(seconds, 0, clip.stopTime);
  const finished = seconds >= clip.stopTime;
  const active = !finished &&
    sampleAdventLightActiveCurve(clip.curves.particleActive, clamped);
  return {
    active,
    color: {
      alpha: sampleAdventLightCurve(clip.curves.colorAlpha, clamped),
      blue: sampleAdventLightCurve(clip.curves.colorBlue, clamped),
      green: sampleAdventLightCurve(clip.curves.colorGreen, clamped),
      red: sampleAdventLightCurve(clip.curves.colorRed, clamped),
    },
    finished,
    scale: sampleAdventLightCurve(clip.curves.scale, clamped),
    time: clamped,
  };
}

/**
 * 把 Unity Color 写成稳定的浏览器 rgb() 文本。
 *
 * @param {{red: number, green: number, blue: number}} color Unity 颜色。
 * @return {string} CSS rgb() 颜色。
 */
function toCssColor(color) {
  /**
   * 把 0~1 的 Unity 通道值换算成 0~255 的 CSS 通道值。
   *
   * @param {number} value Unity 颜色通道值。
   * @return {number} CSS 通道值。
   */
  const channel = (value) =>
    clamp(Number.isFinite(value) ? value : 0, 0, 1) * 255;
  return `rgb(${channel(color.red).toFixed(6)} ${
    channel(color.green).toFixed(6)
  } ${channel(color.blue).toFixed(6)})`;
}

/**
 * 计算原始 Sprite 贴图在网页里的地址。
 *
 * `assetRoot` 指向项目里的 `Assets` 目录（与其它彩蛋模块一致），而
 * {@link adventLightAssetSources} 记录的是 Unity 工程内的完整路径。
 *
 * @param {string} assetRoot 资源根路径。
 * @return {string} 贴图 URL。
 */
export function adventLightSpriteUrl(assetRoot) {
  const root = String(assetRoot ?? '').replace(/\/$/, '');
  return `${root}${
    adventLightAssetSources.spriteTexture.replace(/^Assets/u, '')
  }`;
}

/**
 * 该模块从宿主全局读取的能力。
 *
 * @typedef {object} AdventLightHost
 * @property {any} [document] 宿主 document。
 */

/**
 * 创建 AdventLight 的页面组件。
 *
 * 结构与 prefab 一致：根节点对应 `AdventLight`，唯一子节点对应
 * `ParticlePretend` 的 SpriteRenderer。贴图直接用原始 `Copy.png`，颜色与缩放
 * 每帧取自 `ApostleAdventLight.anim`；`Run` 每次都会把时间轴归零。
 *
 * @param {object} options 组件配置。
 * @param {string} options.assetRoot 资源根路径。
 * @param {number} [options.currentScale] 员工所在通道的 scaleFactor。
 * @param {any} [options.document] 宿主 document。
 * @return {{element: any, isRunning: () => boolean, render: (atMs: number) => boolean, run: (atMs: number) => void, state: () => ReturnType<typeof apostleAdventLightStateAt>|undefined, stop: () => void}} 组件句柄。
 */
export function createDeathAngelAdventLight(options) {
  const host = /** @type {AdventLightHost} */ (globalThis);
  const document = options?.document ?? host.document;
  if (!document?.createElement) {
    throw new Error('DeathAngel AdventLight requires a document.');
  }
  const assetRoot = String(options?.assetRoot ?? '');
  const currentScale = Number.isFinite(options?.currentScale)
    ? Number(options.currentScale)
    : deathAngelAdventLightCamera.referenceScale;
  const sprite = deathAngelAdventLightSprite;
  const basePixels = adventLightQuadPixels(1, currentScale);
  const texturePixels = basePixels / sprite.rect.width;
  // Unity 的 Sprite 矩形以左下角为原点，CSS 背景/Mask 以左上角为原点。
  const maskTop = sprite.texture.height - sprite.rect.y - sprite.rect.height;

  const element = document.createElement('div');
  const spriteNode = document.createElement('span');
  element.className = 'lobotomy-corp-advent-light';
  spriteNode.className = 'lobotomy-corp-advent-light-particle';
  spriteNode.setAttribute('aria-hidden', 'true');
  const center = adventLightCanvasCenterOffset(currentScale);
  element.style.setProperty(
    'left',
    `${lobotomyCorpReferenceCanvasWidth / 2 + center.x}px`,
  );
  element.style.setProperty(
    'top',
    `${lobotomyCorpReferenceCanvasHeight / 2 + center.y}px`,
  );
  spriteNode.style.setProperty(
    '--lobotomy-corp-advent-light-sprite',
    `url('${adventLightSpriteUrl(assetRoot)}')`,
  );
  spriteNode.style.setProperty(
    '--lobotomy-corp-advent-light-size',
    `${basePixels}px`,
  );
  spriteNode.style.setProperty(
    '--lobotomy-corp-advent-light-mask-size',
    `${sprite.texture.width * texturePixels}px ${
      sprite.texture.height * texturePixels
    }px`,
  );
  spriteNode.style.setProperty(
    '--lobotomy-corp-advent-light-mask-position',
    `${-sprite.rect.x * texturePixels}px ${-maskTop * texturePixels}px`,
  );
  element.append(spriteNode);

  /** @type {number|undefined} 本次 Run 的起始时间。 */
  let runStartedAt;
  /** @type {ReturnType<typeof apostleAdventLightStateAt>|undefined} 最近一次写入的状态。 */
  let lastState;

  /**
   * 写入一帧状态到 DOM。
   *
   * @param {ReturnType<typeof apostleAdventLightStateAt>} state 该帧状态。
   * @return {void}
   */
  const paint = (state) => {
    lastState = state;
    spriteNode.style.setProperty(
      '--lobotomy-corp-advent-light-color',
      toCssColor(state.color),
    );
    spriteNode.style.setProperty(
      '--lobotomy-corp-advent-light-scale',
      String(Math.max(state.scale, 0)),
    );
    spriteNode.style.setProperty(
      '--lobotomy-corp-advent-light-visible',
      state.active ? '1' : '0',
    );
  };
  // Prefab 里 AdventLight 与 ParticlePretend 都是 inactive：未触发 Run 之前
  // 只写入第 0 帧的颜色与缩放，不显示光斑。
  paint(apostleAdventLightStateAt(0));
  spriteNode.style.setProperty('--lobotomy-corp-advent-light-visible', '0');

  return Object.freeze({
    element,
    /** @return {boolean} 当前是否仍在播放 Run 动画。 */
    isRunning: () => runStartedAt !== undefined,
    /**
     * 按 Animator.UpdateMode = UnscaledTime 推进一帧。
     *
     * @param {number} atMs 当前时间戳（毫秒）。
     * @return {boolean} 仍在播放时返回 true。
     */
    render: (atMs) => {
      if (runStartedAt === undefined) return false;
      const state = apostleAdventLightStateAt((atMs - runStartedAt) / 1000);
      paint(state);
      if (!state.finished) return true;
      // 动画播完 → Exit Time 1 回到空状态，下一次 Run 从第 0 帧重新开始。
      runStartedAt = undefined;
      return false;
    },
    /**
     * `DeathAngelApostleAnim.TurnOnAdventLight()`：激活对象并触发 `Run`。
     *
     * @param {number} [atMs] 触发时刻（毫秒），省略时按 0 处理。
     * @return {void}
     */
    run: (atMs = 0) => {
      runStartedAt = atMs;
      paint(apostleAdventLightStateAt(0));
    },
    /** @return {ReturnType<typeof apostleAdventLightStateAt>|undefined} 最近写入的状态。 */
    state: () => lastState,
    /** @return {void} `AdventLight.SetActive(false)`。 */
    stop: () => {
      runStartedAt = undefined;
      spriteNode.style.setProperty(
        '--lobotomy-corp-advent-light-visible',
        '0',
      );
    },
  });
}
