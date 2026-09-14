/**
 * @file 用原作 Spine 骨架播放终末鸟事件的三颗蛋。
 *
 * `BossBird.MakeBirdObjects` 通过 `1000351`、`1000352`、`1000353` 创建三颗蛋，
 * `CreatureList.txt` 与 `BigEgg_stat.txt`、`LongEgg_stat.txt`、`SmallEgg_stat.txt` 再把它们
 * 接到 `Unit/CreatureAnimator/BigEgg`、`LongEgg`、`SmallEgg`。这三个 prefab 的
 * `Spine Mecanim GameObject` 分别使用 `skeleton_Controller_8`、`skeleton2_Controller`、
 * `skeleton2_Controller_0`，默认状态都是循环播放 `1_Full_blood`。
 *
 * `BossEggBase.OnTakeDamage` 低于半血时调用 `BossEggAnim.OnHalf()`，控制器随即进入
 * `Full_blood_to_Half_blood`，再从 `2_Half_blood` 循环；`OnSuppressed` 调用
 * `BossEggAnim.OnDead()`，控制器进入 `Dead`。网页也按同一组骨架动画名和过渡顺序播放。
 */
import {
  loadSpineRuntime,
  spineAssetPaths,
  spineModuleRoot,
  spineRuntimePath,
  waitForSpineAssets,
} from './SpineRuntime.js';

/** 三个动画 prefab 在 `center` 节点上的统一缩放。 */
export const blackForestEggPrefabScale = 0.7;

/** 控制器过渡时使用的混合时长（秒）。 */
export const blackForestEggTransitionSeconds = 0.25;

/**
 * 控制器离开半血过渡状态的时间比例。
 *
 * 三个控制器的 `Full_blood_to_Half_blood → 2_Half_blood` 都使用 `ExitTime = 0.75`。
 */
export const blackForestEggHalfTransitionExitTime = 0.75;

/** 鸟蛋动画包围盒与画布边缘之间保留的可见比例。 */
export const blackForestEggIconScale = 0.95;

/** 鸟蛋画布相对原图标槽位的显示倍数。 */
export const blackForestEggCanvasScale = 1.55;

/** 鸟蛋画布的最小显示边长（CSS 像素）。 */
export const blackForestEggMinimumCanvasSize = 32;

/** 采样 Spine 动画包围盒时每秒使用的帧数。 */
export const blackForestEggBoundsSampleRate = 12;

/**
 * 三颗蛋的原始 Spine 资源与 Animator 动画名。
 *
 * 数值尺寸来自 `skeleton_24.json`、`skeleton2_1.json`、`skeleton2_0.json` 的
 * `skeleton.width/height`；动画名与三条 AnimatorController 的状态 Motion 一一对应。
 */
export const blackForestEggSpineAssets = Object.freeze({
  bigEyes: Object.freeze({
    animations: Object.freeze({
      dead: 'Dead',
      fullBlood: '1_Full_blood',
      halfBlood: '2_Half_blood',
      halfTransition: 'Full_blood_to_Half_blood',
    }),
    assetDirectory: 'Resources/spinedata/bossbird/egg/big',
    atlasFile: 'skeleton.atlas_13.txt',
    skeletonFile: 'skeleton_24.json',
    skeletonHeight: 501.17,
    skeletonWidth: 400,
  }),
  longArms: Object.freeze({
    animations: Object.freeze({
      dead: 'Dead',
      fullBlood: '1_Full_blood',
      halfBlood: '2_Half_blood',
      halfTransition: 'Full_blood_to_Half_blood',
    }),
    assetDirectory: 'Resources/spinedata/bossbird/egg/long',
    atlasFile: 'skeleton2.atlas_1.txt',
    skeletonFile: 'skeleton2_1.json',
    skeletonHeight: 556.78,
    skeletonWidth: 402.52,
  }),
  smallBeak: Object.freeze({
    animations: Object.freeze({
      dead: 'Dead',
      fullBlood: '1_Full_blood',
      halfBlood: '2_Half_blood',
      halfTransition: 'Full_blood_to_Half_blood',
    }),
    assetDirectory: 'Resources/spinedata/bossbird/egg/small',
    atlasFile: 'skeleton2.atlas_0.txt',
    skeletonFile: 'skeleton2_0.json',
    skeletonHeight: 505.88,
    skeletonWidth: 400,
  }),
});

/** 三份骨架中最大的横向尺寸，用于让三颗蛋共用同一比例。 */
export const blackForestEggReferenceWidth = 402.52;

/** 三份骨架中最大的纵向尺寸，用于让三颗蛋共用同一比例。 */
export const blackForestEggReferenceHeight = 556.78;

/**
 * 计算一颗蛋在图标槽位内的取景。
 *
 * 三个 prefab 都以 `0.7` 缩放骨架；网页以四条动画的联合包围盒为中心取景，
 * 不让待机、半血或死亡动画被单独拉伸或裁切。
 *
 * @param {number} width 画布的 CSS 宽度。
 * @param {number} height 画布的 CSS 高度。
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} [bounds] 动画包围盒；缺省时使用静态骨架尺寸。
 * @return {{centerX: number, centerY: number, pixelsPerSkeletonUnit: number}|undefined} 相机映射。
 */
export function blackForestEggSpineLayout(width, height, bounds) {
  if (!(width > 0) || !(height > 0)) return undefined;
  const boundsWidth = bounds
    ? bounds.maxX - bounds.minX
    : blackForestEggReferenceWidth;
  const boundsHeight = bounds
    ? bounds.maxY - bounds.minY
    : blackForestEggReferenceHeight;
  if (!(boundsWidth > 0) || !(boundsHeight > 0)) return undefined;
  const pixelsPerSkeletonUnit = Math.min(
    width / boundsWidth,
    height / boundsHeight,
  ) * blackForestEggIconScale;
  if (!(pixelsPerSkeletonUnit > 0)) return undefined;
  return {
    centerX: bounds ? (bounds.minX + bounds.maxX) / 2 : 0,
    centerY: bounds ? (bounds.minY + bounds.maxY) / 2 : 0,
    pixelsPerSkeletonUnit,
  };
}

/**
 * 计算一颗蛋的 Spine 资源路径。
 *
 * @param {string} egg 蛋的键。
 * @param {string} moduleRoot 彩蛋模块根路径。
 * @return {{assetDirectory: string, atlasPath: string, pathPrefix: string, skeletonPath: string}|undefined} 资源路径。
 */
export function blackForestEggSpinePaths(egg, moduleRoot) {
  const config = blackForestEggSpineAssets[egg];
  if (!config) return undefined;
  return spineAssetPaths(
    config.assetDirectory,
    config.skeletonFile,
    config.atlasFile,
    moduleRoot,
  );
}

/**
 * 采样一组 Spine 动画的联合包围盒。
 *
 * 每帧更新骨架后取所有附件世界顶点的并集；调用方随后需要清空轨道并恢复待机动画。
 *
 * @param {object} runtime Spine 运行时命名空间。
 * @param {object} animationState 用于采样的动画状态。
 * @param {object} skeleton 用于采样的骨架实例。
 * @param {Array<object>} animations 要采样的动画。
 * @return {{minX: number, minY: number, maxX: number, maxY: number}|undefined} 联合包围盒。
 */
export function measureBlackForestEggSpineBounds(
  runtime,
  animationState,
  skeleton,
  animations,
) {
  const offset = new runtime.Vector2();
  const size = new runtime.Vector2();
  const temp = new Array(8);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  animations.forEach((animation) => {
    const sampleCount = Math.max(
      2,
      Math.ceil(animation.duration * blackForestEggBoundsSampleRate),
    );
    const step = animation.duration / sampleCount;
    animationState.setAnimation(0, animation.name, false);
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
    animationState.clearTracks();
  });
  if (!(maxX > minX) || !(maxY > minY)) return undefined;
  return {maxX, maxY, minX, minY};
}

/**
 * 创建一颗蛋的 Spine 舞台。
 *
 * 返回的画布始终放在原图标槽位内；运行时或骨架加载失败时画布保持透明，调用方不会
 * 再用静态图片代替。
 *
 * @param {object} options 舞台配置。
 * @param {string} options.egg 蛋的键。
 * @param {string} options.assetRoot `Assets` 目录的公开路径。
 * @param {Document} [options.document] 当前文档。
 * @param {any} [options.globalObject] 全局对象。
 * @param {number} [options.height] 图标槽位高度。
 * @param {number} [options.width] 图标槽位宽度。
 * @return {any|undefined} 舞台控制器。
 */
export function createBlackForestEggSpineStage(options) {
  const config = blackForestEggSpineAssets[options?.egg];
  const hostDocument = options?.document ??
    /** @type {Document|undefined} */ (globalThis.document);
  if (!config || !hostDocument?.createElement) return undefined;
  const hostGlobal = options.globalObject ?? globalThis;
  const moduleRoot = spineModuleRoot(options.assetRoot ?? '');
  const paths = blackForestEggSpinePaths(options.egg, moduleRoot);
  if (!paths) return undefined;
  const runtimeUrl = `${moduleRoot}/${spineRuntimePath}`;
  const canvas = hostDocument.createElement('canvas');
  canvas.className = 'lobotomy-corp-black-forest-egg-spine';
  canvas.setAttribute?.('aria-hidden', 'true');
  const gl = canvas.getContext?.('webgl', {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
  });

  let disposed = false;
  let frame;
  let halfTransitionElapsed = 0;
  let lastTimestamp;
  let runtime;
  let assetManager;
  let animationState;
  let animationStateData;
  let currentAnimation;
  let eggBounds;
  let sceneRenderer;
  let skeleton;
  let skeletonData;

  /**
   * 释放画布与骨架资源。
   */
  const dispose = () => {
    disposed = true;
    if (frame !== undefined) {
      hostGlobal.cancelAnimationFrame?.(frame);
      hostGlobal.clearTimeout?.(frame);
      frame = undefined;
    }
    sceneRenderer?.dispose?.();
    sceneRenderer = undefined;
    assetManager?.dispose?.();
    assetManager = undefined;
    animationState = undefined;
    animationStateData = undefined;
    skeleton = undefined;
    skeletonData = undefined;
    canvas.remove?.();
  };

  if (!gl) {
    return {
      canvas,
      ready: Promise.resolve(false),
      isReady: () => false,
      currentAnimation: undefined,
      playDead: () => false,
      playFullBlood: () => false,
      playHalfTransition: () => false,
      resize: () => {},
      dispose,
    };
  }

  /**
   * 按图标槽位的 CSS 尺寸同步 WebGL 画布与相机。
   */
  const resize = () => {
    const baseWidth = Math.max(1, options.width || canvas.clientWidth || 1);
    const baseHeight = Math.max(1, options.height || canvas.clientHeight || 1);
    const displayScale = Math.max(
      blackForestEggCanvasScale,
      blackForestEggMinimumCanvasSize / Math.min(baseWidth, baseHeight),
    );
    const width = Math.max(1, Math.round(baseWidth * displayScale));
    const height = Math.max(1, Math.round(baseHeight * displayScale));
    if (canvas.style) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const ratio = Math.min(2, Math.max(1, hostGlobal.devicePixelRatio ?? 1));
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    if (!sceneRenderer || !runtime) return;
    sceneRenderer.resize(runtime.webgl.ResizeMode.Expand);
    const layout = blackForestEggSpineLayout(width, height, eggBounds);
    if (!layout) return;
    const camera = sceneRenderer.camera;
    camera.position.x = layout.centerX;
    camera.position.y = layout.centerY;
    camera.zoom = 1 / (layout.pixelsPerSkeletonUnit * ratio);
    camera.update();
  };

  /**
   * 清空画布并绘制当前骨架姿势。
   */
  const render = () => {
    if (!sceneRenderer || !skeleton) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    sceneRenderer.begin();
    sceneRenderer.drawSkeleton(skeleton, true);
    sceneRenderer.end();
  };

  /**
   * 预约下一帧。
   */
  const scheduleFrame = () => {
    if (disposed || frame !== undefined || !skeleton) return;
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
   * 播放一条骨架动画。
   *
   * @param {string} name 动画名。
   * @param {boolean} loop 是否循环。
   * @return {boolean} 动画存在并已切换时返回 true。
   */
  const play = (name, loop) => {
    const animation = skeletonData?.findAnimation(name);
    if (disposed || !animationState || !animation) return false;
    animationState.setAnimation(0, name, loop);
    animationState.apply(skeleton);
    skeleton.updateWorldTransform();
    currentAnimation = name;
    lastTimestamp = undefined;
    render();
    scheduleFrame();
    return true;
  };

  /** 播放满血待机。 */
  const playFullBlood = () =>
    play(config.animations.fullBlood, true);

  /** 触发半血转换。 */
  const playHalfTransition = () => {
    halfTransitionElapsed = 0;
    return play(config.animations.halfTransition, false);
  };

  /** 播放死亡。 */
  const playDead = () => play(config.animations.dead, false);

  /**
   * 推进并绘制一帧。
   *
   * @param {number} timestamp 浏览器时间戳（毫秒）。
   */
  const tick = (timestamp) => {
    if (disposed || !animationState || !skeleton) return;
    const seconds = timestamp / 1000;
    const step = lastTimestamp === undefined
      ? 0
      : Math.min(0.1, Math.max(0, seconds - lastTimestamp));
    lastTimestamp = seconds;
    animationState.update(step);
    if (currentAnimation === config.animations.halfTransition) {
      const transition = skeletonData?.findAnimation(
        config.animations.halfTransition,
      );
      halfTransitionElapsed += step;
      if (
        transition &&
        halfTransitionElapsed >=
          transition.duration * blackForestEggHalfTransitionExitTime
      ) {
        play(config.animations.halfBlood, true);
      }
    }
    animationState.apply(skeleton);
    skeleton.updateWorldTransform();
    render();
    scheduleFrame();
  };

  /**
   * 加载运行时、Atlas、骨架与贴图，并开始满血待机。
   *
   * @return {Promise<boolean>} 骨架就绪时兑现 true。
   */
  const start = async () => {
    runtime = await loadSpineRuntime({
      document: hostDocument,
      globalObject: hostGlobal,
      path: runtimeUrl,
    });
    if (!runtime?.webgl || disposed) return false;
    assetManager = new runtime.webgl.AssetManager(gl, paths.pathPrefix);
    assetManager.loadText(paths.skeletonPath);
    assetManager.loadTextureAtlas(paths.atlasPath);
    await waitForSpineAssets(assetManager, hostGlobal, () => disposed);
    if (disposed) return false;
    if (assetManager.hasErrors()) {
      throw new Error(
        `black forest egg spine assets failed to load: ${
          JSON.stringify(assetManager.getErrors())
        }`,
      );
    }
    const atlas = assetManager.get(paths.atlasPath);
    const json = JSON.parse(assetManager.get(paths.skeletonPath));
    skeletonData = new runtime.SkeletonJson(
      new runtime.AtlasAttachmentLoader(atlas),
    ).readSkeletonData(json);
    skeleton = new runtime.Skeleton(skeletonData);
    animationStateData = new runtime.AnimationStateData(skeletonData);
    animationStateData.setMix(
      config.animations.fullBlood,
      config.animations.halfTransition,
      blackForestEggTransitionSeconds,
    );
    animationStateData.setMix(
      config.animations.halfTransition,
      config.animations.halfBlood,
      blackForestEggTransitionSeconds,
    );
    animationStateData.setMix(
      config.animations.halfTransition,
      config.animations.dead,
      blackForestEggTransitionSeconds,
    );
    animationStateData.setMix(
      config.animations.halfBlood,
      config.animations.dead,
      blackForestEggTransitionSeconds,
    );
    animationState = new runtime.AnimationState(animationStateData);
    eggBounds = measureBlackForestEggSpineBounds(
      runtime,
      animationState,
      skeleton,
      Object.values(config.animations)
        .map((name) => skeletonData.findAnimation(name))
        .filter(Boolean),
    );
    animationState.clearTracks();
    sceneRenderer = new runtime.webgl.SceneRenderer(canvas, gl, false);
    resize();
    if (!playFullBlood()) {
      throw new Error(
        `black forest egg full blood animation missing: ${
          config.animations.fullBlood
        }`,
      );
    }
    return true;
  };

  const ready = start().catch((error) => {
    hostGlobal.console?.warn?.(
      `[BlackForest] egg spine failed: ${error?.message ?? error}`,
    );
    return false;
  });

  return {
    canvas,
    ready,
    isReady: () => Boolean(skeleton),
    get currentAnimation() {
      return currentAnimation;
    },
    playDead,
    playFullBlood,
    playHalfTransition,
    resize,
    dispose,
  };
}
