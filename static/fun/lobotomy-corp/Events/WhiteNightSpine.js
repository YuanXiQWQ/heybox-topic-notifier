/**
 * @file 用 Spine 运行时播放白夜骨架的状态动画。
 *
 * 原作的白夜不是逐状态切换的素材，而是一副 Spine 骨架：Animator 只决定当前播放
 * 哪条动画，画面每帧都由骨骼姿势算出，因此「出逃待机 → 镇压」这类切换会从当前
 * 姿势接着播。预渲染视频做不到这一点，所以这里直接加载解包工程里的骨架数据，
 * 用与骨骼同名的动画复刻同一个状态机。
 */

import {
  loadSpineRuntime,
  spineAssetPaths,
  spineModuleRoot,
  spineRuntimePath,
  waitForSpineAssets,
} from './SpineRuntime.js';

/** 白夜骨架数据在 `Assets` 下的相对目录。 */
export const whiteNightSpineAssetDirectory = 'Resources/spinedata/deathangel';

/** Spine WebGL 运行时相对彩蛋模块根路径的位置。 */
export const whiteNightSpineRuntimePath = spineRuntimePath;

/** 骨架 JSON 文件名。 */
export const whiteNightSpineSkeletonFile = 'skeleton_5.json';

/** 骨架 Atlas 文件名。 */
export const whiteNightSpineAtlasFile = 'skeleton.atlas.txt';

/** 与 Unity Animator 状态同名的 Spine 动画。 */
export const whiteNightSpineAnimations = Object.freeze({
  escapeIdle: '0_Default_outsidde',
  escapeSpecial: '1_Default_outsidde_special',
  dead: 'Dead',
});

/** 出逃期间释放特技的间隔（秒），对应 `DeathAngel._escapeFreqRange = MinMax(60, 60)`。 */
export const whiteNightEscapeSkillIntervalSeconds = 60;

/** 特技动画时长（秒），与 `1_Default_outsidde_special` 一致。 */
export const whiteNightEscapeSpecialDurationSeconds = 7;

/** 特技动画里触发音效与白圈的动画事件时间（秒）。 */
export const whiteNightEscapeSpecialEventSeconds = Object.freeze({
  range: 4,
  sound: 3.5,
});

/**
 * 特技第 4 秒点亮的白圈（`DeathAngelAttck → Range`）。
 *
 * 贴图 `Effect_2_512.png` 在 512 像素里画了一道半径约 206 像素、笔画约 14 像素的白色
 * 圆环，所以 512 像素正好映射成 512 骨架单位。位置取自 prefab：`DeathAngelAttck` 在
 * 预制体根下 (0, 2.81)，`Range` 再偏移 (0, 2.62)，而出逃态骨骼位于 (0.06, 1.5)，
 * 因此白圈圆心相对骨骼原点是 (-0.06, 3.93) 世界单位，即 (-6, 393) 骨架单位。
 *
 * 缩放与不透明度取自 `WhiteNightSkill.anim`：5 秒内 (2, 2) → (70, 70)，alpha 1 → 0.1。
 */
export const whiteNightSpineRangeEffect = Object.freeze({
  alphaFrom: 1,
  alphaTo: 0.1,
  durationSeconds: 5,
  positionX: -6,
  positionY: 393,
  scaleFrom: 2,
  scaleTo: 70,
  spriteSize: 512,
});

/** 白圈贴图相对 `Assets` 的路径。 */
export const whiteNightSpineRangeTexture = 'Texture2D/Effect_2_512.png';

/** 取景相对动画包围盒的留白比例，与 Unity 导出脚本的 `ViewportPadding` 一致。 */
export const whiteNightSpineViewportPadding = 1.08;

/**
 * 出逃待机包围盒（骨架单位）。
 *
 * 由骨架数据逐帧采样得到，与 Unity 导出脚本测量的 `Renderer.bounds` 一致（误差 0.04%）。
 * 舞台在异步加载完成前、或 DOM 层特效需要提前换算时都用它。
 */
export const whiteNightSpineIdleBounds = Object.freeze({
  maxX: 789.3035480661171,
  maxY: 1212.6119203841158,
  minX: -847.882151285037,
  minY: -415.9157541129916,
});

/** 取景占视口的比例与像素上限，沿用出逃待机视频的 `contain` 规则。 */
const whiteNightSpineViewportLimit = Object.freeze({
  maxHeight: 980,
  maxWidth: 1380,
  ratio: 0.88,
});

/** 测量动画包围盒时的采样帧率。 */
const whiteNightSpineBoundsSampleRate = 30;

/** 渲染循环允许的最大单帧步进，避免后台标签页恢复时姿势跳变。 */
const whiteNightSpineMaxFrameStepSeconds = 0.1;

/** 已加载动画对应的循环标记；出逃待机循环，特技与镇压各播一次。 */
const whiteNightSpineLoopingAnimations = Object.freeze([
  whiteNightSpineAnimations.escapeIdle,
]);

/**
 * 由 `Assets` 目录推导彩蛋模块根路径。
 *
 * @param {string} assetRoot `Assets` 目录的公开路径。
 * @return {string} 模块根路径。
 */
export const whiteNightSpineModuleRoot = spineModuleRoot;

/**
 * 计算 Spine 资源在彩蛋资源路由下的路径。
 *
 * `AssetManager` 用「目录前缀 + 相对路径」拼 URL，而 3.6 的 `loadTextureAtlas` 又会把
 * 分页贴图拼成「父目录 + '/' + 页名」。相对路径若只给文件名，父目录就是空串，贴图 URL
 * 会出现 `deathangel//skeleton.png` 这种重复斜杠，资源路由会判为非法路径，导致骨架
 * 静默加载失败。这里统一给出带父目录的相对路径。
 *
 * @param {string} moduleRoot 彩蛋模块根路径。
 * @return {{assetDirectory: string, atlasPath: string, pathPrefix: string, skeletonPath: string}} 资源目录、目录前缀与文件相对路径。
 */
export function whiteNightSpineAssetPaths(moduleRoot) {
  return spineAssetPaths(
    whiteNightSpineAssetDirectory,
    whiteNightSpineSkeletonFile,
    whiteNightSpineAtlasFile,
    moduleRoot,
  );
}

/**
 * 计算骨架相机映射。
 *
 * 动画包围盒先按留白比例放大，再等比 contain 进视口，与既有出逃待机视频取景一致；
 * 视口其余区域留给超出包围盒的光效，和原作里相机比角色更大的取景方式相同。
 *
 * @param {number} viewportWidth 视口宽（CSS 像素）。
 * @param {number} viewportHeight 视口高（CSS 像素）。
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} bounds 动画包围盒（骨架世界单位）。
 * @param {number} [padding] 取景留白比例。
 * @return {{centerX: number, centerY: number, pixelsPerUnit: number, spanX: number, spanY: number}|undefined} 相机中心与像素比例；参数无效时返回 undefined。
 */
export function whiteNightSpineViewportLayout(
    viewportWidth,
    viewportHeight,
    bounds,
    padding = whiteNightSpineViewportPadding,
) {
  if (
    ![viewportWidth, viewportHeight, bounds?.minX, bounds?.minY, bounds?.maxX,
      bounds?.maxY].every((value) => Number.isFinite(value))
  ) {
    return undefined;
  }
  const spanX = (bounds.maxX - bounds.minX) * padding;
  const spanY = (bounds.maxY - bounds.minY) * padding;
  if (!(spanX > 0) || !(spanY > 0)) return undefined;
  const {maxHeight, maxWidth, ratio} = whiteNightSpineViewportLimit;
  const pixelsPerUnit = Math.min(
      Math.min(viewportWidth * ratio, maxWidth) / spanX,
      Math.min(viewportHeight * ratio, maxHeight) / spanY,
  );
  if (!(pixelsPerUnit > 0)) return undefined;
  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
    pixelsPerUnit,
    spanX,
    spanY,
  };
}

/**
 * 计算彩蛋页面里 1 个骨架世界单位对应的视口高度百分比。
 *
 * DOM 层的特效（如 Confess 圣光）要和画布上的骨架对齐，就必须用同一套相机映射：
 * 骨架单位换算成世界单位后，再按画布的像素比例折算成 vh。
 *
 * @param {{maxX: number, minX: number, maxY: number, minY: number}} bounds 出逃待机包围盒（骨架单位）。
 * @param {number} viewportWidth 视口宽（CSS 像素）。
 * @param {number} viewportHeight 视口高（CSS 像素）。
 * @return {number|undefined} 1 世界单位对应的 vh 数；参数无效时返回 undefined。
 */
export function whiteNightSpineWorldUnitToVh(
  bounds,
  viewportWidth,
  viewportHeight,
) {
  const layout = whiteNightSpineViewportLayout(
      viewportWidth,
      viewportHeight,
      bounds,
  );
  if (!layout || !(viewportHeight > 0)) return undefined;
  // 1 世界单位 = 100 骨架单位。
  return 100 * layout.pixelsPerUnit * 100 / viewportHeight;
}

/**
 * 计算白圈特效在某一时刻的缩放与不透明度。
 *
 * `WhiteNightSkill.anim` 在起点与终点都取零斜率，这里用 smoothstep 还原同一条缓动。
 *
 * @param {number} elapsedSeconds 白圈点亮后的秒数。
 * @param {object} [effect] 白圈参数。
 * @return {{alpha: number, scale: number}|undefined} 该时刻的 alpha 与缩放；未点亮或已结束时返回 undefined。
 */
export function whiteNightRangeEffectFrame(
  elapsedSeconds,
  effect = whiteNightSpineRangeEffect,
) {
  if (
    !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 ||
    elapsedSeconds >= effect.durationSeconds
  ) {
    return undefined;
  }
  const rate = elapsedSeconds / effect.durationSeconds;
  const eased = rate * rate * (3 - 2 * rate);
  return {
    alpha: effect.alphaFrom + (effect.alphaTo - effect.alphaFrom) * eased,
    scale: effect.scaleFrom + (effect.scaleTo - effect.scaleFrom) * eased,
  };
}

/**
 * 推进出逃技能调度。
 *
 * 原作里 `_escapeSkillTimer` 以 60 秒为周期触发 `EscapeSkill()`，这个计时与特技动画
 * 并行：动画自己长 7 秒，第 3.5 秒的动画事件播放攻击音效，第 4 秒的事件点亮白圈。
 * `idleSeconds` 因此持续累计到下一次特技起点，而不是等动画结束再重新计时。
 *
 * state 只记录时间，具体播放由调用方按返回的标记执行，因此可以在没有 WebGL 的环境里回归。
 *
 * @param {{idleSeconds: number, rangeSeconds: number|undefined, specialSeconds: number|undefined}} state 上一次的调度状态。
 * @param {number} deltaSeconds 本次推进的秒数。
 * @return {{startRange: boolean, startSpecial: boolean, endSpecial: boolean, skillSound: boolean, state: {idleSeconds: number, rangeSeconds: number|undefined, specialSeconds: number|undefined}}} 新状态与本次要执行的动作。
 */
export function advanceWhiteNightSpineSkill(state, deltaSeconds) {
  const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0
      ? deltaSeconds
      : 0;
  const next = {
    idleSeconds: state?.idleSeconds ?? 0,
    rangeSeconds: state?.rangeSeconds,
    specialSeconds: state?.specialSeconds,
  };
  const result = {
    endSpecial: false,
    skillSound: false,
    startRange: false,
    startSpecial: false,
    state: next,
  };
  if (next.rangeSeconds !== undefined) {
    next.rangeSeconds += delta;
    if (next.rangeSeconds >= whiteNightSpineRangeEffect.durationSeconds) {
      next.rangeSeconds = undefined;
    }
  }
  next.idleSeconds += delta;
  if (next.idleSeconds >= whiteNightEscapeSkillIntervalSeconds) {
    next.idleSeconds -= whiteNightEscapeSkillIntervalSeconds;
    next.specialSeconds = 0;
    result.startSpecial = true;
  }
  if (next.specialSeconds === undefined) {
    return result;
  }
  const previous = next.specialSeconds;
  next.specialSeconds += delta;
  if (previous < whiteNightEscapeSpecialEventSeconds.sound &&
      next.specialSeconds >= whiteNightEscapeSpecialEventSeconds.sound) {
    result.skillSound = true;
  }
  if (next.rangeSeconds === undefined &&
      next.specialSeconds >= whiteNightEscapeSpecialEventSeconds.range) {
    next.rangeSeconds = 0;
    result.startRange = true;
  }
  if (next.specialSeconds >= whiteNightEscapeSpecialDurationSeconds) {
    next.specialSeconds = undefined;
    result.endSpecial = true;
  }
  return result;
}

/**
 * 加载 Spine WebGL 运行时。
 *
 * 实现由 {@link ./SpineRuntime.js} 共用；宿主没有 DOM 时返回 undefined，调用方放弃
 * 接管画面。
 */
export const loadWhiteNightSpineRuntime = loadSpineRuntime;

/**
 * 采样一条动画的骨骼包围盒。
 *
 * 与 Unity 导出脚本测量 `Renderer.bounds` 的方式一致：逐帧更新骨架，取所有附件
 * 世界顶点的并集。测量会占用同一个 AnimationState，调用方随后需要自行清空轨道。
 *
 * @param {object} runtime Spine 运行时命名空间。
 * @param {object} animationState 用于采样的动画状态。
 * @param {object} skeleton 用于采样的骨架实例。
 * @param {object} animation 要测量的动画。
 * @return {{minX: number, minY: number, maxX: number, maxY: number}|undefined} 动画包围盒。
 */
export function measureWhiteNightSpineBounds(
  runtime,
  animationState,
  skeleton,
  animation,
) {
  const sampleCount = Math.max(
    2,
    Math.round(animation.duration * whiteNightSpineBoundsSampleRate),
  );
  const step = animation.duration / sampleCount;
  const offset = new runtime.Vector2();
  const size = new runtime.Vector2();
  const temp = new Array(8);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index <= sampleCount; index++) {
    if (index > 0) animationState.update(step);
    animationState.apply(skeleton);
    skeleton.updateWorldTransform();
    skeleton.getBounds(offset, size, temp);
    if (!Number.isFinite(size.x) || !Number.isFinite(size.y)) continue;
    minX = Math.min(minX, offset.x);
    minY = Math.min(minY, offset.y);
    maxX = Math.max(maxX, offset.x + size.x);
    maxY = Math.max(maxY, offset.y + size.y);
  }
  if (!(maxX > minX) || !(maxY > minY)) return undefined;
  return {maxX, maxY, minX, minY};
}

/**
 * 创建白夜 Spine 舞台。
 *
 * 返回 undefined 表示当前宿主不支持 WebGL 或缺少 DOM，调用方应退回预渲染视频；
 * 返回的舞台会异步加载运行时与骨架，`ready` 兑现后才开始出逃待机循环。
 *
 * @param {object} options 舞台配置。
 * @param {Document} [options.document] 当前文档。
 * @param {object} [options.globalObject] 全局对象。
 * @param {string} [options.assetRoot] `Assets` 目录的公开路径。
 * @param {string} [options.moduleRoot] 彩蛋模块根路径。
 * @param {boolean} [options.hidden] 是否先以隐藏状态创建画布。
 * @param {() => void} [options.onSkillSound] 特技第 3.5 秒的音效事件回调。
 * @return {{canvas: object, currentAnimation: string|undefined, viewBounds: {minX: number, minY: number, maxX: number, maxY: number}|undefined, ready: Promise<boolean>, isReady: () => boolean, playEscapeIdle: () => boolean, playEscapeSpecial: () => boolean, playDeath: () => boolean, resize: () => void, dispose: () => void}|undefined} 舞台控制器。
 */
export function createWhiteNightSpineStage(options) {
  const {document, globalObject} = options ?? {};
  if (!document?.createElement || !globalObject) return undefined;
  const hostDocument = document;
  const hostGlobal = globalObject;
  const moduleRoot = options.moduleRoot ?? whiteNightSpineModuleRoot(
      options.assetRoot ?? '',
  );
  const assetsRoot = `${moduleRoot}/Assets`;
  const spinePaths = whiteNightSpineAssetPaths(moduleRoot);
  const runtimeUrl = `${moduleRoot}/${whiteNightSpineRuntimePath}`;
  const canvas = hostDocument.createElement('canvas');
  canvas.className = 'lobotomy-corp-white-night-spine';
  if (options.hidden) canvas.hidden = true;
  canvas.setAttribute?.('aria-hidden', 'true');
  const gl = canvas.getContext?.('webgl', {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
  });
  if (!gl) return undefined;

  let disposed = false;
  let frame = undefined;
  let lastTimestamp = undefined;
  let bounds;
  let layout;
  let runtime;
  let skeleton;
  let skeletonData;
  let animationState;
  let sceneRenderer;
  let assetManager;
  let currentAnimation;
  let rangeTexture;
  let rangeColor;
  let skill = {idleSeconds: 0, rangeSeconds: undefined, specialSeconds: undefined};

  /**
   * 按当前视口尺寸同步画布像素与相机映射。
   */
  const resize = () => {
    const width = Math.max(1, Math.round(
        canvas.clientWidth || hostGlobal.innerWidth || 0,
    ));
    const height = Math.max(1, Math.round(
        canvas.clientHeight || hostGlobal.innerHeight || 0,
    ));
    const ratio = Math.min(2, Math.max(1, hostGlobal.devicePixelRatio ?? 1));
    if (canvas.width !== width * ratio) canvas.width = width * ratio;
    if (canvas.height !== height * ratio) canvas.height = height * ratio;
    if (!sceneRenderer) return;
    sceneRenderer.resize(runtime.webgl.ResizeMode.Expand);
    layout = whiteNightSpineViewportLayout(width, height, bounds);
    if (!layout) return;
    const camera = sceneRenderer.camera;
    camera.position.x = layout.centerX;
    camera.position.y = layout.centerY;
    camera.zoom = 1 / (layout.pixelsPerUnit * ratio);
    camera.update();
  };

  /**
   * 绘制当前骨骼姿势。
   */
  const render = () => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    sceneRenderer.begin();
    // 骨架贴图是预乘 alpha，画布也按预乘 alpha 合成，加算光效才能正确叠加。
    sceneRenderer.drawSkeleton(skeleton, true);
    drawRangeEffect();
    sceneRenderer.end();
  };

  /**
   * 绘制特技白圈。
   *
   * 白圈在原作里是骨骼之外的独立物体，排序在骨架之上、随 Animator 的 `Reset` 触发
   * 播放，所以这里同样叠在骨架之后，并按白圈自己的 5 秒时间轴推进。骨架绘制会把
   * 批处理器的混合模式留在最后一个槽位的设置上，这里显式改回预乘 alpha 的常规混合。
   */
  const drawRangeEffect = () => {
    if (!rangeTexture || skill.rangeSeconds === undefined) return;
    const frame = whiteNightRangeEffectFrame(skill.rangeSeconds);
    if (!frame) return;
    const size = whiteNightSpineRangeEffect.spriteSize * frame.scale;
    // 画布按预乘 alpha 合成，顶点色也必须预乘，否则光圈不会随 alpha 淡出。
    rangeColor.r = frame.alpha;
    rangeColor.g = frame.alpha;
    rangeColor.b = frame.alpha;
    rangeColor.a = frame.alpha;
    sceneRenderer.batcher.setBlendMode(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    sceneRenderer.drawTexture(
        rangeTexture,
        whiteNightSpineRangeEffect.positionX - size / 2,
        whiteNightSpineRangeEffect.positionY - size / 2,
        size,
        size,
        rangeColor,
    );
  };

  /**
   * 推进出逃技能调度：待机满 60 秒释放特技，特技期间按动画事件点亮白圈。
   *
   * @param {number} deltaSeconds 本次推进的秒数。
   */
  const stepSkill = (deltaSeconds) => {
    const step = advanceWhiteNightSpineSkill(skill, deltaSeconds);
    skill = step.state;
    if (step.startSpecial) play(whiteNightSpineAnimations.escapeSpecial);
    if (step.skillSound) options.onSkillSound?.();
    if (step.endSpecial) play(whiteNightSpineAnimations.escapeIdle);
  };

  /**
   * 推进并绘制一帧。
   *
   * @param {number} timestamp 浏览器提供的毫秒时间戳。
   */
  const tick = (timestamp) => {
    if (disposed) return;
    const seconds = timestamp / 1000;
    const step = lastTimestamp === undefined
        ? 0
        : Math.min(
            whiteNightSpineMaxFrameStepSeconds,
            Math.max(0, seconds - lastTimestamp),
        );
    lastTimestamp = seconds;
    stepSkill(step);
    animationState.update(step);
    animationState.apply(skeleton);
    skeleton.updateWorldTransform();
    render();
    scheduleFrame();
  };

  /**
   * 预约下一帧。
   */
  const scheduleFrame = () => {
    if (disposed || frame !== undefined) return;
    if (typeof hostGlobal.requestAnimationFrame === 'function') {
      frame = hostGlobal.requestAnimationFrame((timestamp) => {
        frame = undefined;
        tick(timestamp);
      });
      return;
    }
    frame = hostGlobal.setTimeout?.(() => {
      frame = undefined;
      tick(hostGlobal.performance?.now?.() ?? Date.now());
    }, 16);
  };

  /**
   * 播放一条动画。
   *
   * 原作控制器里白夜这几条转移都是 0 时长，而且各动画第 0 帧是同一姿势；这里同样
   * 先把骨骼复位到 setup pose 再切轨，未参与新动画的通道不会残留上一条动画的值。
   *
   * @param {string} name 动画名。
   * @return {boolean} 动画存在并已切换时返回 true。
   */
  const play = (name) => {
    if (disposed || !animationState || !skeletonData) return false;
    const animation = skeletonData.findAnimation(name);
    if (!animation) return false;
    const loop = whiteNightSpineLoopingAnimations.includes(name);
    skeleton.setToSetupPose();
    animationState.setAnimation(0, name, loop);
    animationState.apply(skeleton);
    skeleton.updateWorldTransform();
    currentAnimation = name;
    if (name === whiteNightSpineAnimations.escapeSpecial &&
        skill.specialSeconds === undefined) {
      // 外部直接播放特技时，事件时间轴同样从头开始。
      skill = {...skill, specialSeconds: 0};
    } else if (name === whiteNightSpineAnimations.dead) {
      // 镇压停掉出逃技能计时，但白圈按自己的 5 秒时间轴跑完。
      skill = {
        idleSeconds: 0,
        rangeSeconds: skill.rangeSeconds,
        specialSeconds: undefined,
      };
    }
    lastTimestamp = undefined;
    render();
    scheduleFrame();
    return true;
  };

  /**
   * 加载运行时与骨架数据，随后开始播放出逃待机。
   *
   * @return {Promise<boolean>} 舞台就绪时兑现 true。
   */
  const start = async () => {
    runtime = await loadWhiteNightSpineRuntime({
      document: hostDocument,
      globalObject: hostGlobal,
      path: runtimeUrl,
    });
    if (!runtime?.webgl || disposed) return false;
    assetManager = new runtime.webgl.AssetManager(gl, spinePaths.pathPrefix);
    assetManager.loadText(spinePaths.skeletonPath);
    assetManager.loadTextureAtlas(spinePaths.atlasPath);
    await waitForSpineAssets(assetManager, hostGlobal, () => disposed);
    if (disposed) return false;
    if (assetManager.hasErrors()) {
      throw new Error(
          `white night spine assets failed to load: ${
              JSON.stringify(assetManager.getErrors())}`,
      );
    }
    // `AssetManager.get` 同样会补目录前缀，这里传与 load 一致的相对路径。
    const atlas = assetManager.get(spinePaths.atlasPath);
    const json = JSON.parse(assetManager.get(spinePaths.skeletonPath));
    skeletonData = new runtime.SkeletonJson(
        new runtime.AtlasAttachmentLoader(atlas),
    ).readSkeletonData(json);
    skeleton = new runtime.Skeleton(skeletonData);
    animationState = new runtime.AnimationState(
        new runtime.AnimationStateData(skeletonData),
    );
    sceneRenderer = new runtime.webgl.SceneRenderer(canvas, gl, false);
    bounds = measureEscapeIdleBounds(runtime, skeletonData);
    rangeTexture = await loadRangeTexture();
    rangeColor = new runtime.Color(1, 1, 1, 0);
    resize();
    if (!play(whiteNightSpineAnimations.escapeIdle)) {
      throw new Error('white night escape idle animation missing');
    }
    return true;
  };

  /**
   * 加载特技白圈贴图。
   *
   * `Effect_2_512.png` 是透明区域仍带颜色的直通 alpha 贴图，而骨架贴图本身就是预乘
   * alpha；这里在上传时把它转成预乘，两条绘制路径才能共用同一套预乘合成。
   *
   * @return {Promise<object|undefined>} 贴图对象；加载失败时返回 undefined。
   */
  const loadRangeTexture = () =>
    new Promise((resolve) => {
      const image = hostDocument.createElement('img');
      image.addEventListener?.('load', () => {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        const texture = new runtime.webgl.GLTexture(gl, image);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        resolve(texture);
      });
      image.addEventListener?.('error', () => {
        // 白圈贴图缺失时特技没有光圈，这里留下控制台痕迹便于排查。
        hostGlobal.console?.warn?.(
            `[WhiteNight] range effect texture failed: ${image.src}`,
        );
        resolve(undefined);
      });
      image.src = `${assetsRoot}/${whiteNightSpineRangeTexture}`;
    });

  /**
   * 测量出逃待机的包围盒，作为所有白夜动画共用的取景。
   *
   * @param {object} spine Spine 运行时命名空间。
   * @param {object} data 骨架数据。
   * @return {{minX: number, minY: number, maxX: number, maxY: number}} 动画包围盒。
   */
  const measureEscapeIdleBounds = (spine, data) => {
    const measurementSkeleton = new spine.Skeleton(data);
    const measurementState = new spine.AnimationState(
        new spine.AnimationStateData(data),
    );
    const animation = data.findAnimation(
        whiteNightSpineAnimations.escapeIdle,
    );
    measurementState.setAnimation(
        0,
        whiteNightSpineAnimations.escapeIdle,
        true,
    );
    const measured = measureWhiteNightSpineBounds(
        spine,
        measurementState,
        measurementSkeleton,
        animation,
    );
    measurementState.clearTracks();
    return measured ?? {
      maxX: data.width / 2,
      maxY: data.height / 2,
      minX: -data.width / 2,
      minY: -data.height / 2,
    };
  };

  const ready = start().then(() => true);

  return {
    canvas,

    /** 当前播放的动画名。 */
    get currentAnimation() {
      return currentAnimation;
    },

    /** 出逃待机包围盒；所有白夜动画共用这一份取景。 */
    get viewBounds() {
      return bounds ? {...bounds} : undefined;
    },

    ready,

    /** @return {boolean} 白夜骨架就绪后返回 true。 */
    isReady: () => Boolean(skeleton),

    /** @return {boolean} 切回出逃待机成功时返回 true。 */
    playEscapeIdle: () => play(whiteNightSpineAnimations.escapeIdle),

    /** @return {boolean} 播放特技成功时返回 true。 */
    playEscapeSpecial: () => play(whiteNightSpineAnimations.escapeSpecial),

    /** @return {boolean} 播放镇压动画成功时返回 true。 */
    playDeath: () => play(whiteNightSpineAnimations.dead),

    resize,

    /**
     * 释放 WebGL 资源并停止渲染循环。
     */
    dispose: () => {
      disposed = true;
      if (frame !== undefined) {
        hostGlobal.cancelAnimationFrame?.(frame);
        hostGlobal.clearTimeout?.(frame);
        frame = undefined;
      }
      sceneRenderer?.dispose?.();
      sceneRenderer = undefined;
      rangeTexture?.dispose?.();
      rangeTexture = undefined;
      assetManager?.dispose?.();
      assetManager = undefined;
      skeleton = undefined;
      skeletonData = undefined;
      animationState = undefined;
      canvas.remove?.();
    },
  };
}
