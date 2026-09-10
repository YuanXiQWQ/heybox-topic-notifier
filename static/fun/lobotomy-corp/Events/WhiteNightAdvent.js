/**
 * @file 白夜后续出逃使用的 Simple Advent 纯展示组件。
 *
 * 数据来自 Resources/prefabs/uicomponent/AdventClockUI.prefab；本模块不读取、
 * 不保存使徒名单，也不接入白夜状态机。
 */

import {
  lobotomyCorpCanvasScaleForViewport,
  lobotomyCorpCanvasViewportForUpdate,
  lobotomyCorpReferenceCanvasHeight,
  lobotomyCorpReferenceCanvasWidth,
  lobotomyCorpViewportSize,
} from "./CanvasScaler.js";

/** AdventClockUI.prefab 的原始画布尺寸。 */
export const whiteNightSimpleAdventCanvas = Object.freeze({
  height: lobotomyCorpReferenceCanvasHeight,
  width: lobotomyCorpReferenceCanvasWidth,
});

/**
 * AdventClockUI.prefab 中 Clock RectTransform 相对 1920×1080 逻辑画布的几何。
 *
 * Clock 在逻辑画布内水平居中、垂直 top = 25、尺寸 819×819；逻辑画布自身又
 * 以 transform-origin: center 居中于 viewport，因此这里把上下边界换算成
 * 「相对画布中心」的偏移，供 Clock fit 与包围盒计算直接使用。
 */
export const whiteNightSimpleAdventClockRect = Object.freeze({
  /** Clock 底边相对画布中心的偏移：top 25 + 819 - 画布半高 540。 */
  bottomFromCanvasCenter: 25 + 819 - lobotomyCorpReferenceCanvasHeight / 2,
  height: 819,
  /** Clock 顶边相对画布中心的偏移：top 25 - 画布半高 540。 */
  topFromCanvasCenter: 25 - lobotomyCorpReferenceCanvasHeight / 2,
  width: 819,
});

/** Name 父对象的 RectTransform；其偏移必须先于每个 Names[] 子项应用。 */
export const whiteNightSimpleAdventNameParentRect = Object.freeze({
  anchorMax: Object.freeze({ x: 0.5, y: 0.5 }),
  anchorMin: Object.freeze({ x: 0.5, y: 0.5 }),
  anchoredPosition: Object.freeze({ x: 0, y: -8.750008 }),
  pivot: Object.freeze({ x: 0.5, y: 0.5 }),
  sizeDelta: Object.freeze({ height: 0, width: 0 }),
});

/** AdventClockUI.Awake() 从 Names[0].color 读取的原始名字颜色。 */
export const whiteNightSimpleAdventOriginalColor = Object.freeze({
  alpha: 1,
  blue: 1,
  green: 1,
  red: 1,
});

/** AdventClockUI.prefab 的 _NameTextAdventColor。 */
export const whiteNightSimpleAdventColor = Object.freeze({
  alpha: 1,
  blue: 0.11978597,
  green: 0,
  red: 0.7058823,
});

/** Names[] Legacy Text 的 BMDOHYEON Best Fit 参数。 */
export const whiteNightSimpleAdventNameText = Object.freeze({
  fontFamily: "LobotomyAdventNames",
  maxSize: 40,
  normalMinSize: 14,
  twelfthMinSize: 12,
});

/** SimpleAdventStart() 的 _advent_adventAnim 时长。 */
export const whiteNightSimpleAdventDurationMs = 4000;

/** Show_21.anim 的 m_StopTime。 */
export const whiteNightSimpleAdventShowDurationMs = 333.33334;

/** Hide_21.anim 的 m_StopTime。 */
export const whiteNightSimpleAdventHideDurationMs = 500;

/** Circle 节点引用的 ClockCenter Sprite 原始裁切参数。 */
export const whiteNightSimpleAdventClockCenterSprite = Object.freeze({
  pivot: Object.freeze({ x: 0.5052102, y: 0.7424417 }),
  rect: Object.freeze({
    height: 257.9327,
    width: 259.85663,
    x: 380.0761,
    y: 0,
  }),
  texture: Object.freeze({ height: 383, width: 1024 }),
});

/** Simple Advent 实际可见的 prefab Sprite，保持父子 sibling 顺序。 */
export const whiteNightSimpleAdventSprites = Object.freeze([
  "ClockFrame.png",
  "GlobalShader.png",
  "ClockShader.png",
  "LowerShader.png",
]);

/** AdventClockUI.Names[] 的明确 index → RectTransform 映射。 */
export const whiteNightSimpleAdventNameSlots = Object.freeze([
  [129.96, 239.4, 29.999994],
  [227.28, 132.72, 60],
  [260.52, -6.72, 90],
  [227.04, -128.4, 121.44615],
  [128.4, -220.8, 154.99998],
  [-12.96, -252, 180],
  [-142.8, -212.4, -150.00002],
  [-229.2, -124.8, -119.99999],
  [-260.4, 1.2, -90],
  [-225.6, 141.6, -60.000023],
  [-132, 241.2, -30.000015],
  [0, 275.4, 0],
].map(([x, y, rotation], index) =>
  Object.freeze({
    anchorMax: Object.freeze({ x: 0.5, y: 0.5 }),
    anchorMin: Object.freeze({ x: 0.5, y: 0.5 }),
    anchoredPosition: Object.freeze({ x, y }),
    index,
    minSize: index === 11
      ? whiteNightSimpleAdventNameText.twelfthMinSize
      : whiteNightSimpleAdventNameText.normalMinSize,
    pivot: Object.freeze({ x: 0.5, y: 0.5 }),
    rotation,
    scale: Object.freeze({ x: 1, y: 1 }),
    sizeDelta: Object.freeze({ height: 48, width: 114 }),
  })
));

let activeSimpleAdvent;

/**
 * 将 Unity Color 写成稳定的浏览器 rgb() 文本。
 *
 * @param {{red: number, green: number, blue: number}} color Unity 颜色。
 * @return {string} CSS rgb() 颜色。
 */
function toCssColor(color) {
  return `rgb(${(color.red * 255).toFixed(6)} ${
    (color.green * 255).toFixed(6)
  } ${(color.blue * 255).toFixed(6)})`;
}

/**
 * 将数值收束到闭区间。
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
 * 复刻 Unity AnimationCurve 两端切线均为零时的 Hermite 插值。
 *
 * Show_21.anim 和 Hide_21.anim 的 alpha keyframes 均使用该曲线。
 *
 * @param {number} rate 区间内的线性时间比例。
 * @return {number} 零切线 Hermite 插值结果。
 */
export function whiteNightSimpleAdventSmoothstep(rate) {
  const normalized = clamp(rate, 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

/**
 * 计算让 Simple Advent Clock 完整落在当前 viewport 内的最大逻辑画布缩放。
 *
 * 逻辑画布以中心为 transform-origin 并居中于 viewport，所以 Clock 的三条真实
 * 边界可以直接由 prefab 几何推出：
 * - 水平：Clock 半宽 × scale ≤ viewportWidth / 2；
 * - 顶部：|topFromCanvasCenter| × scale ≤ viewportHeight / 2；
 * - 底部：bottomFromCanvasCenter × scale ≤ viewportHeight / 2（通常比顶部宽松）。
 *
 * @param {number} width 当前可见 viewport 宽度。
 * @param {number} height 当前可见 viewport 高度。
 * @return {number} 有限且大于零的 Clock fit 上限。
 */
export function whiteNightSimpleAdventClockFitScaleForViewport(width, height) {
  const halfWidth = whiteNightSimpleAdventClockRect.width / 2;
  const fitScale = Math.min(
    width / 2 / halfWidth,
    height / 2 / Math.abs(whiteNightSimpleAdventClockRect.topFromCanvasCenter),
    height / 2 / whiteNightSimpleAdventClockRect.bottomFromCanvasCenter,
  );
  return Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1;
}

/**
 * 计算 Clock 经最终逻辑画布缩放后的 viewport 包围盒。
 *
 * @param {number} width 当前可见 viewport 宽度。
 * @param {number} height 当前可见 viewport 高度。
 * @param {number} [scale] 已应用的逻辑画布缩放；省略时按基础 CanvasScaler 与 Clock fit 上限取小。
 * @return {{bottom: number, left: number, right: number, top: number}} viewport 坐标下的 Clock 包围盒。
 */
export function whiteNightSimpleAdventClockViewportBounds(
  width,
  height,
  scale,
) {
  const appliedScale = Number.isFinite(scale) ? scale : Math.min(
    lobotomyCorpCanvasScaleForViewport(width, height),
    whiteNightSimpleAdventClockFitScaleForViewport(width, height),
  );
  const halfWidth = whiteNightSimpleAdventClockRect.width / 2 * appliedScale;
  return {
    bottom: height / 2 +
      whiteNightSimpleAdventClockRect.bottomFromCanvasCenter * appliedScale,
    left: width / 2 - halfWidth,
    right: width / 2 + halfWidth,
    top: height / 2 +
      whiteNightSimpleAdventClockRect.topFromCanvasCenter * appliedScale,
  };
}

/**
 * 计算网页展示中的全屏背景与 Unity 逻辑 Clock 的独立几何。
 *
 * 本项目的 Simple Advent 演出验收不复刻通用 Animator 可见的 OnShow breathing
 * scale；Clock 在 Show 后始终保持 scale=1。
 *
 * @param {number} width 当前 viewport 宽度。
 * @param {number} height 当前 viewport 高度。
 * @param {(width: number, height: number) => number} [canvasScaleForViewport] 逻辑画布缩放计算器。
 * @return {{background: {height: number, width: number}, clock: {height: number, scale: number, width: number}}} 两套展示坐标系的边界。
 */
export function whiteNightSimpleAdventPresentationForViewport(
  width,
  height,
  canvasScaleForViewport = lobotomyCorpCanvasScaleForViewport,
) {
  // Clock 必须完整可见；该上限只作用于 1920×1080 逻辑画布，Fullscreen Shader 不受影响。
  const scale = Math.min(
    canvasScaleForViewport(width, height),
    whiteNightSimpleAdventClockFitScaleForViewport(width, height),
  );
  return {
    background: { height, width },
    clock: {
      height: whiteNightSimpleAdventClockRect.height * scale,
      scale,
      width: whiteNightSimpleAdventClockRect.width * scale,
    },
  };
}

/**
 * 创建 Prefab 中的 Image 对应节点。
 *
 * @param {Document} document 当前文档。
 * @param {string} className 图层类名。
 * @param {string} source 图片地址。
 * @return {HTMLImageElement} 图层图片。
 */
function createSprite(document, className, source) {
  const image = document.createElement("img");
  image.alt = "";
  image.className = className;
  image.src = source;
  image.setAttribute("aria-hidden", "true");
  return image;
}

/**
 * 使用真实 DOM 尺寸判断当前 Legacy Text 字号是否可放进其 RectTransform。
 *
 * @param {HTMLElement} name 名字 Text 节点。
 * @param {number} fontSize 待测字号。
 * @param {((name: HTMLElement, fontSize: number) => boolean)|undefined} measureName 测试或宿主提供的测量器。
 * @return {boolean} 该字号完全容纳时返回 true。
 */
function fitsName(name, fontSize, measureName) {
  if (measureName) return measureName(name, fontSize);
  name.style.setProperty(
    "--lobotomy-corp-advent-name-font-size",
    `${fontSize}px`,
  );
  const hasHorizontalMetrics = Number.isFinite(name.scrollWidth) &&
    Number.isFinite(name.clientWidth) && name.clientWidth > 0;
  const hasVerticalMetrics = Number.isFinite(name.scrollHeight) &&
    Number.isFinite(name.clientHeight) && name.clientHeight > 0;
  return (!hasHorizontalMetrics || name.scrollWidth <= name.clientWidth) &&
    (!hasVerticalMetrics || name.scrollHeight <= name.clientHeight);
}

/**
 * 按 Unity Legacy Text Best Fit 的整数档位寻找最大可容纳字号。
 *
 * @param {HTMLElement} name 名字 Text 节点。
 * @param {number} minimum 原 prefab 指定的最小字号。
 * @param {((name: HTMLElement, fontSize: number) => boolean)|undefined} measureName 测试或宿主提供的测量器。
 * @return {number} 实际应用的逻辑字号。
 */
export function fitWhiteNightSimpleAdventName(name, minimum, measureName) {
  for (
    let size = whiteNightSimpleAdventNameText.maxSize;
    size >= minimum;
    size--
  ) {
    if (fitsName(name, size, measureName)) {
      name.style.setProperty(
        "--lobotomy-corp-advent-name-font-size",
        `${size}px`,
      );
      return size;
    }
  }
  name.style.setProperty(
    "--lobotomy-corp-advent-name-font-size",
    `${minimum}px`,
  );
  return minimum;
}

/**
 * 创建白夜后续出逃的 Simple Advent 页面。
 *
 * `onAdventEnd` 对应原作 4 秒的 OnEndAdventEffect，`onHidden` 则在 Hide_21
 * 完成且 DOM 已移除后调用；`onComplete` 保留为 onHidden 的兼容别名。
 *
 * @param {{assetRoot: string, canvasScaleForViewport?: (width: number, height: number) => number, canvasViewportForUpdate?: (previous: {height: number, width: number}|undefined, next: {height: number, width: number}) => {height: number, width: number}, cancelFrame?: (id: number) => void, document?: Document, initialElapsedMs?: number, measureName?: (name: HTMLElement, fontSize: number) => boolean, names?: string[], now?: () => number, onAdventEnd?: () => void, onComplete?: () => void, onHidden?: () => void, playBell?: () => void, requestFrame?: (callback: FrameRequestCallback) => number, viewport?: () => {height: number, width: number}} options 展示和媒体钩子。
 * @return {{dispose: () => void, element: HTMLElement, finish: () => void, isAdventEnded: () => boolean, isFinished: () => boolean}} 可取消的展示控制器。
 */
export function createWhiteNightSimpleAdvent(options) {
  const document = options?.document ?? globalThis.document;
  if (!document?.body || !document.createElement) {
    throw new Error("WhiteNight Simple Advent requires a document body.");
  }
  activeSimpleAdvent?.dispose();

  const assetRoot = options.assetRoot.replace(/\/$/, "");
  const now = options.now ??
    (() => globalThis.performance?.now?.() ?? Date.now());
  const requestFrame = options.requestFrame ??
    ((callback) =>
      globalThis.requestAnimationFrame?.(callback) ??
        setTimeout(() => callback(now()), 16));
  const cancelFrame = options.cancelFrame ??
    ((id) => globalThis.cancelAnimationFrame?.(id) ?? clearTimeout(id));
  const viewport = options.viewport ?? (() => lobotomyCorpViewportSize());
  const canvasScaleForViewport = options.canvasScaleForViewport ??
    lobotomyCorpCanvasScaleForViewport;
  const canvasViewportForUpdate = options.canvasViewportForUpdate ??
    lobotomyCorpCanvasViewportForUpdate;
  const root = document.createElement("section");
  const canvas = document.createElement("div");
  const uiRoot = document.createElement("div");
  const addApostle = document.createElement("div");
  const clock = document.createElement("div");
  const namesLayer = document.createElement("div");
  const shader = document.createElement("div");
  const nameNodes = [];
  const names = Array.isArray(options.names) ? options.names : [];
  let animationFrame;
  let adventEnded = false;
  let completed = false;
  let endingStartedAt = 0;
  let stableViewport;
  // 刷新恢复时沿用已播放时长，避免把完整的四秒演出从头再播一次。
  const initialElapsedMs = clamp(
    Number.isFinite(options.initialElapsedMs) ? options.initialElapsedMs : 0,
    0,
    whiteNightSimpleAdventDurationMs,
  );
  const startedAt = now() - initialElapsedMs;

  root.className = "lobotomy-corp-white-night-simple-advent";
  root.id = "lobotomy-corp-white-night-simple-advent";
  root.setAttribute("aria-hidden", "true");
  canvas.className = "lobotomy-corp-white-night-simple-advent-canvas";
  uiRoot.className = "lobotomy-corp-white-night-simple-advent-ui-root";
  addApostle.className = "lobotomy-corp-white-night-simple-advent-add-apostle";
  clock.className = "lobotomy-corp-white-night-simple-advent-clock";
  namesLayer.className = "lobotomy-corp-white-night-simple-advent-names";
  namesLayer.dataset.anchoredPositionY = String(
    whiteNightSimpleAdventNameParentRect.anchoredPosition.y,
  );
  shader.className = "lobotomy-corp-white-night-simple-advent-shader";

  clock.append(
    createSprite(
      document,
      "lobotomy-corp-white-night-simple-advent-frame",
      `${assetRoot}/Resources/sprites/creaturesprite/deathangel/clock/ClockFrame.png`,
    ),
    namesLayer,
  );
  whiteNightSimpleAdventNameSlots.forEach((slot) => {
    const name = document.createElement("span");
    const suppliedName = names[slot.index];
    name.className = "lobotomy-corp-white-night-simple-advent-name";
    name.dataset.index = String(slot.index);
    name.dataset.minimumFontSize = String(slot.minSize);
    name.textContent = typeof suppliedName === "string" ? suppliedName : "";
    name.style.setProperty(
      "--lobotomy-corp-advent-name-x",
      `${slot.anchoredPosition.x}px`,
    );
    name.style.setProperty(
      "--lobotomy-corp-advent-name-y",
      `${slot.anchoredPosition.y}px`,
    );
    name.style.setProperty(
      "--lobotomy-corp-advent-name-rotation",
      `${slot.rotation}deg`,
    );
    namesLayer.append(name);
    nameNodes.push({ element: name, slot });
  });

  shader.append(
    createSprite(
      document,
      "lobotomy-corp-white-night-simple-advent-global-shader",
      `${assetRoot}/Resources/sprites/creaturesprite/deathangel/clock/GlobalShader.png`,
    ),
    createSprite(
      document,
      "lobotomy-corp-white-night-simple-advent-clock-shader",
      `${assetRoot}/Resources/sprites/creaturesprite/deathangel/clock/ClockShader.png`,
    ),
    createSprite(
      document,
      "lobotomy-corp-white-night-simple-advent-lower-shader",
      `${assetRoot}/Resources/sprites/creaturesprite/deathangel/clock/LowerShader.png`,
    ),
  );
  addApostle.append(clock);
  uiRoot.append(addApostle);
  canvas.append(uiRoot);
  // Shader 使用 viewport 坐标系；Clock 仍独占 1920×1080 的 Unity 逻辑坐标系。
  root.append(shader, canvas);
  document.body.append(root);

  /**
   * 更新 Unity 逻辑坐标空间的缩放比例。
   *
   * base scale 仍沿用项目共用 CanvasScaler 与稳定 viewport（忽略仅浏览器 chrome
   * 导致的高度抖动）；但「Clock 必须完整落在当前可见画面内」优先级更高，因此
   * Clock fit 上限使用本次实时 viewport。Fullscreen Shader 不经过这里。
   */
  const updateCanvasScale = () => {
    const liveViewport = viewport();
    stableViewport = canvasViewportForUpdate(stableViewport, liveViewport);
    const baseScale = canvasScaleForViewport(
      stableViewport.width,
      stableViewport.height,
    );
    const clockFitScale = whiteNightSimpleAdventClockFitScaleForViewport(
      liveViewport.width,
      liveViewport.height,
    );
    canvas.style.setProperty(
      "--lobotomy-corp-advent-canvas-scale",
      String(Math.min(baseScale, clockFitScale)),
    );
  };
  /** 以当前字体（或 fallback 字体）重新执行每个 Name 的 Legacy Text Best Fit。 */
  const fitNames = () =>
    nameNodes.forEach(({ element, slot }) =>
      fitWhiteNightSimpleAdventName(element, slot.minSize, options.measureName)
    );
  const resizeTarget = globalThis.visualViewport ?? globalThis;
  resizeTarget?.addEventListener?.("resize", updateCanvasScale);
  updateCanvasScale();
  fitNames();
  void document.fonts?.ready?.then?.(() => {
    if (!completed) fitNames();
  });

  /** 在原作 4 秒逻辑边界启动 Hide_21，并立即通知上层。 */
  const beginAdventEnd = (timestamp) => {
    if (adventEnded) return;
    adventEnded = true;
    endingStartedAt = timestamp;
    options.onAdventEnd?.();
  };

  /**
   * 以 AdventClockUI.Update() 的名字插值及 Show_21 / Hide_21 曲线更新页面。
   *
   * @param {number} timestamp 当前时间戳。
   */
  const render = (timestamp) => {
    if (completed) return;
    const elapsed = clamp(
      timestamp - startedAt,
      0,
      whiteNightSimpleAdventDurationMs,
    );
    const rate = elapsed / whiteNightSimpleAdventDurationMs;
    const colorRate = Math.min(rate * 2, 1);
    const red = whiteNightSimpleAdventOriginalColor.red +
      (whiteNightSimpleAdventColor.red -
          whiteNightSimpleAdventOriginalColor.red) * colorRate;
    const green = whiteNightSimpleAdventOriginalColor.green +
      (whiteNightSimpleAdventColor.green -
          whiteNightSimpleAdventOriginalColor.green) * colorRate;
    const blue = whiteNightSimpleAdventOriginalColor.blue +
      (whiteNightSimpleAdventColor.blue -
          whiteNightSimpleAdventOriginalColor.blue) * colorRate;
    const rootShowRate = whiteNightSimpleAdventSmoothstep(
      elapsed / whiteNightSimpleAdventShowDurationMs,
    );
    const clockShowRate = whiteNightSimpleAdventSmoothstep(
      (elapsed - whiteNightSimpleAdventShowDurationMs / 2) /
        (whiteNightSimpleAdventShowDurationMs / 2),
    );
    const hideRate = adventEnded
      ? 1 - whiteNightSimpleAdventSmoothstep(
        (timestamp - endingStartedAt) / whiteNightSimpleAdventHideDurationMs,
      )
      : 1;
    root.style.setProperty(
      "--lobotomy-corp-advent-root-alpha",
      String(rootShowRate * hideRate),
    );
    clock.style.setProperty(
      "--lobotomy-corp-advent-clock-alpha",
      String(clockShowRate),
    );
    nameNodes.forEach(({ element }) => {
      element.style.setProperty(
        "--lobotomy-corp-advent-name-alpha",
        String(rate),
      );
      element.style.setProperty(
        "--lobotomy-corp-advent-name-color",
        toCssColor({ red, green, blue }),
      );
    });

    if (elapsed >= whiteNightSimpleAdventDurationMs) beginAdventEnd(timestamp);
    if (
      adventEnded &&
      timestamp - endingStartedAt >= whiteNightSimpleAdventHideDurationMs
    ) {
      complete(true);
      return;
    }
    animationFrame = requestFrame(render);
  };

  /**
   * 结束页面并清理唯一的动画请求、缩放监听与 DOM。
   *
   * @param {boolean} notifyHidden 是否调用 visual-hidden 钩子。
   */
  const complete = (notifyHidden) => {
    if (completed) return;
    completed = true;
    if (animationFrame !== undefined) cancelFrame(animationFrame);
    resizeTarget?.removeEventListener?.("resize", updateCanvasScale);
    root.remove();
    if (activeSimpleAdvent?.element === root) activeSimpleAdvent = undefined;
    if (notifyHidden) (options.onHidden ?? options.onComplete)?.();
  };

  const controller = {
    dispose: () => complete(false),
    element: root,
    finish: () => {
      beginAdventEnd(now());
      complete(true);
    },
    isAdventEnded: () => adventEnded,
    isFinished: () => completed,
  };
  activeSimpleAdvent = controller;
  options.playBell?.();
  render(startedAt);
  return controller;
}
