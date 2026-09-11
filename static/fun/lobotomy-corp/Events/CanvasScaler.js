/**
 * @file 《脑叶公司》网页彩蛋共用的 Unity CanvasScaler 纯函数。
 */
// @ts-check

/** Unity CanvasScaler 的参考画布宽度。 */
export const lobotomyCorpReferenceCanvasWidth = 1920;

/** Unity CanvasScaler 的参考画布高度。 */
export const lobotomyCorpReferenceCanvasHeight = 1080;

/** 竖屏 CanvasScaler 开始平滑过渡回 Match Width 的 viewport 宽度。 */
export const lobotomyCorpPortraitCanvasBlendStart = 640;

/** 竖屏 CanvasScaler 完成平滑过渡并恢复 Match Width 的 viewport 宽度。 */
export const lobotomyCorpPortraitCanvasBlendEnd = 960;

/**
 * 计算指定 viewport 对应的 Unity CanvasScaler 缩放比例。
 *
 * 桌面和横屏维持原版 Match Width；竖屏会在手机的宽、高混合比例与宽屏的
 * Match Width 之间平滑过渡，避免临界宽度发生尺寸跳变。
 *
 * @param {number} viewportWidth 当前可见 viewport 宽度。
 * @param {number} viewportHeight 当前可见 viewport 高度。
 * @return {number} 有限且大于零的 Canvas 缩放比例。
 */
export function lobotomyCorpCanvasScaleForViewport(
    viewportWidth,
    viewportHeight,
) {
  const widthScale = viewportWidth / lobotomyCorpReferenceCanvasWidth;
  const heightScale = viewportHeight / lobotomyCorpReferenceCanvasHeight;
  const portraitScale = Math.sqrt(widthScale * heightScale);
  const portraitBlendProgress = Math.min(
      1,
      Math.max(
          0,
          (viewportWidth - lobotomyCorpPortraitCanvasBlendStart) /
          (lobotomyCorpPortraitCanvasBlendEnd -
              lobotomyCorpPortraitCanvasBlendStart),
      ),
  );
  const smoothProgress = portraitBlendProgress * portraitBlendProgress *
      (3 - 2 * portraitBlendProgress);
  const portraitCanvasScale = portraitScale +
      (widthScale - portraitScale) * smoothProgress;
  const canvasScale = viewportHeight > viewportWidth
      ? portraitCanvasScale
      : widthScale;
  return Number.isFinite(canvasScale) && canvasScale > 0 ? canvasScale : 1;
}

/**
 * 提供 viewport 信息的宿主对象。
 *
 * 结构类型而非 `Window`：测试会传入只带所需字段的最小替身。
 *
 * @typedef {object} LobotomyCorpViewportHost
 * @property {{height?: number, width?: number}|null} [visualViewport] 浏览器 VisualViewport。
 * @property {number} [innerHeight] 窗口内高。
 * @property {number} [innerWidth] 窗口内宽。
 * @property {{documentElement?: {clientHeight?: number, clientWidth?: number}|null}|null} [document] 宿主 document。
 */

/**
 * 读取当前实际可见 viewport 的宽高，并在不支持 VisualViewport 时回退。
 *
 * @param {LobotomyCorpViewportHost} [browser] 提供 viewport 的浏览器对象。
 * @return {{height: number, width: number}} 可用于 CanvasScaler 的 viewport 尺寸。
 */
export function lobotomyCorpViewportSize(
    browser = /** @type {LobotomyCorpViewportHost} */ (globalThis),
) {
  const visualViewport = browser.visualViewport;
  const documentElement = browser.document?.documentElement;
  return {
    height: visualViewport?.height || browser.innerHeight ||
        documentElement?.clientHeight || lobotomyCorpReferenceCanvasHeight,
    width: visualViewport?.width || browser.innerWidth ||
        documentElement?.clientWidth || lobotomyCorpReferenceCanvasWidth,
  };
}

/**
 * 选择本次 HUD 应采用的稳定 viewport。
 *
 * 仅浏览器 chrome 导致的高度变化会保留上次尺寸，防止警报随地址栏伸缩；宽度
 * 或横竖屏方向变化则立即采用新 viewport。
 *
 * @param {{height: number, width: number}|undefined} previousViewport 上次已应用的稳定 viewport。
 * @param {{height: number, width: number}} nextViewport 本次读到的可见 viewport。
 * @return {{height: number, width: number}} 应用于 CanvasScaler 的稳定 viewport。
 */
export function lobotomyCorpCanvasViewportForUpdate(
    previousViewport,
    nextViewport,
) {
  if (!previousViewport) return nextViewport;
  const orientationChanged =
      (previousViewport.height > previousViewport.width) !==
      (nextViewport.height > nextViewport.width);
  return previousViewport.width !== nextViewport.width || orientationChanged
      ? nextViewport
      : previousViewport;
}
