/**
 * @file 加载官方 Spine WebGL 运行时，供各个骨架舞台共用。
 *
 * 原作里的异想体不是逐状态切换的素材，而是一副 Spine 骨架：Animator 只决定当前
 * 播放哪条动画，画面每帧都由骨骼姿势算出。这里加载与游戏同版本的官方运行时，
 * 舞台再用解包工程里的骨架数据复刻同一条动画调用链。
 */

/**
 * 动态加载的 Spine 3.6 WebGL 命名空间。
 * @typedef {typeof import('../vendor/spine-webgl-3.6.d.ts')} SpineRuntime
 */

/** Spine WebGL 运行时相对彩蛋模块根路径的位置。 */
export const spineRuntimePath = 'vendor/spine-webgl-3.6.53.js';

/** 按全局对象缓存的运行时加载过程，避免重复注入脚本。 */
const spineRuntimeLoads = new WeakMap();

/**
 * 由 `Assets` 目录推导彩蛋模块根路径。
 *
 * @param {string} assetRoot `Assets` 目录的公开路径。
 * @return {string} 模块根路径。
 */
export function spineModuleRoot(assetRoot) {
  return String(assetRoot ?? '').replace(/\/Assets\/?$/, '');
}

/**
 * 加载 Spine WebGL 运行时。
 *
 * 运行时是官方的全局脚本构建，加载后挂在全局对象的 `spine` 上；重复调用共用同一次
 * 注入。宿主没有 DOM 时直接返回 undefined，调用方放弃接管画面。
 *
 * @param {object} options 加载配置。
 * @param {Document} [options.document] 当前文档。
 * @param {object} [options.globalObject] 全局对象。
 * @param {string} [options.path] 运行时脚本的公开路径。
 * @return {Promise<SpineRuntime|undefined>} 运行时命名空间。
 */
export function loadSpineRuntime({document, globalObject, path}) {
  if (globalObject?.spine?.webgl) {
    return Promise.resolve(globalObject.spine);
  }
  if (!document?.createElement || !globalObject || !path) {
    return Promise.resolve(undefined);
  }
  let loads = spineRuntimeLoads.get(globalObject);
  if (!loads) {
    loads = new Map();
    spineRuntimeLoads.set(globalObject, loads);
  }
  const cached = loads.get(path);
  if (cached) return cached;
  const pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = path;
    script.async = true;
    script.addEventListener?.('load', () => {
      const runtime = globalObject.spine;
      if (runtime?.webgl) resolve(runtime);
      else reject(new Error('spine runtime namespace missing'));
    });
    script.addEventListener?.('error', () => {
      reject(new Error(`spine runtime failed to load: ${path}`));
    });
    (document.head ?? document.body)?.append?.(script);
  });
  loads.set(path, pending);
  return pending;
}

/**
 * 等待 AssetManager 结算所有排队资源。
 *
 * @param {import('../vendor/spine-webgl-3.6.d.ts').AssetManager} assetManager 已排队的资源管理器。
 * @param {object} globalObject 全局对象（提供定时器）。
 * @param {() => boolean} isDisposed 判断调用方是否已经释放。
 * @return {Promise<void>} 加载结束时兑现。
 */
export function waitForSpineAssets(assetManager, globalObject, isDisposed) {
  return new Promise((resolve) => {
    const check = () => {
      if (isDisposed() || assetManager.isLoadingComplete()) resolve();
      else globalObject.setTimeout?.(check, 16);
    };
    check();
  });
}

/**
 * 计算骨架资源在彩蛋资源路由下的路径。
 *
 * `AssetManager` 用「目录前缀 + 相对路径」拼 URL，而 3.6 的 `loadTextureAtlas` 又会把
 * 分页贴图拼成「父目录 + '/' + 页名」。相对路径若只给文件名，父目录就是空串，贴图 URL
 * 会出现 `目录名//skeleton.png` 这种重复斜杠，资源路由会判为非法路径，导致骨架静默
 * 加载失败。这里统一给出带父目录的相对路径。
 *
 * @param {string} assetDirectory 骨架数据相对 `Assets` 的目录。
 * @param {string} skeletonFile 骨架 JSON 文件名。
 * @param {string} atlasFile 骨架 Atlas 文件名。
 * @param {string} moduleRoot 彩蛋模块根路径。
 * @return {{assetDirectory: string, atlasPath: string, pathPrefix: string, skeletonPath: string}} 资源目录、目录前缀与文件相对路径。
 */
export function spineAssetPaths(
    assetDirectory,
    skeletonFile,
    atlasFile,
    moduleRoot,
) {
  const separator = assetDirectory.lastIndexOf('/');
  const parentDirectory = assetDirectory.slice(0, separator + 1);
  const leafDirectory = assetDirectory.slice(separator + 1);
  return {
    // 相对彩蛋模块根路径（无结尾斜杠），供测试与资源路由使用。
    assetDirectory: `Assets/${parentDirectory}${leafDirectory}`,
    atlasPath: `${leafDirectory}/${atlasFile}`,
    pathPrefix: `${moduleRoot}/Assets/${parentDirectory}`,
    skeletonPath: `${leafDirectory}/${skeletonFile}`,
  };
}

/**
 * 逐帧采样当前轨道的附件世界边界，保留调用方指定的采样密度。
 * @template {{x: number, y: number}} Point
 * @template {{updateWorldTransform(): void, getBounds(offset: Point, size: Point, temp: number[]): void}} Skeleton
 * @param {{Vector2: new () => Point}} runtime Spine 运行时。
 * @param {{update(delta: number): void, apply(skeleton: Skeleton): unknown}} animationState 当前动画轨道。
 * @param {Skeleton} skeleton 当前骨架。
 * @param {number} duration 动画时长（秒）。
 * @param {number} sampleCount 采样间隔数量。
 * @return {{minX:number,minY:number,maxX:number,maxY:number}} 采样边界；没有有限样本时保留无穷边界。
 */
export function sampleSpineAnimationBounds(runtime, animationState, skeleton, duration, sampleCount) {
  const offset = new runtime.Vector2(), size = new runtime.Vector2(), temp = new Array(8);
  const step = duration / sampleCount;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let index = 0; index <= sampleCount; index++) {
    if (index > 0) animationState.update(step);
    animationState.apply(skeleton);
    skeleton.updateWorldTransform();
    // 两个向量由同一个 Point 构造器创建；IDE 会将泛型约束中的 Point 识别为另一类型。
    // noinspection JSCheckFunctionSignatures
    skeleton.getBounds(offset, size, temp);
    if (!Number.isFinite(size.x) || !Number.isFinite(size.y)) continue;
    minX = Math.min(minX, offset.x);
    minY = Math.min(minY, offset.y);
    maxX = Math.max(maxX, offset.x + size.x);
    maxY = Math.max(maxY, offset.y + size.y);
  }
  return {minX, minY, maxX, maxY};
}

/**
 * 优先预约浏览器动画帧，缺少帧接口时使用同一宿主的定时器与时钟。
 * @param {{requestAnimationFrame?: (callback: (timestamp: number) => void) => number, setTimeout?: (callback: () => void, delay: number) => number, performance?: {now: () => number}}} host 舞台宿主。
 * @param {(timestamp: number) => void} callback 帧回调。
 * @return {number|undefined} 可由宿主取消的帧或定时器句柄。
 */
export function requestSpineFrame(host, callback) {
  if (typeof host.requestAnimationFrame === 'function') return host.requestAnimationFrame(callback);
  return host.setTimeout?.(() => callback(host.performance?.now?.() ?? Date.now()), 16);
}
