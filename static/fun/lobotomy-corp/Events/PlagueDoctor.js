/**
 * @file 提供异想体 O-01-45「疫医」的使徒绑定与转变白夜事件。
 *
 * 交互与演出参数取自《脑叶公司》解包源码：
 * - `WhiteNightSpace.PlagueDoctor` 负责使徒绑定与第 12 名后的转变入口；
 * - `WhiteNightSpace.AdventClockUI` 提供共用的圆盘表盘。绑定走 `SetName` 的
 *   Name Effect（tick → 指针 → 钟声 → 名字淡入，共 6 秒），第 12 名后的转变走
 *   `StartAdventEvent()` 的完整降临（Full Advent），而不是白夜出逃使用的
 *   `StartSimpleAdventEvent()`。
 *
 * 表盘几何全部来自 `Resources/prefabs/uicomponent/AdventClockUI.prefab`：
 * `AddApostle` 下依次是 `Clock`（819×819、距顶 25）、`Shader`（全屏，含
 * `BlackShader` / `ClockShader` / `Lowershader` / `Circle`）与 `ApostleDesc`
 * （1600×180、中心下移 438）。指针 `Point` 位于 Clock 正中心，`Arrow` 以底边
 * 中心为枢轴向上伸出 216，因此它是「根部固定在圆盘中心」的时钟指针。
 */
// @ts-check

import {
  fitWhiteNightSimpleAdventName,
  whiteNightSimpleAdventClockCenterSprite,
  whiteNightSimpleAdventColor,
  whiteNightSimpleAdventNameSlots,
  whiteNightSimpleAdventOriginalColor,
} from './WhiteNightAdvent.js';
import {
  lobotomyCorpCanvasScaleForViewport,
  lobotomyCorpCanvasViewportForUpdate,
  lobotomyCorpReferenceCanvasHeight,
  lobotomyCorpReferenceCanvasWidth,
  lobotomyCorpViewportSize,
} from './CanvasScaler.js';

/** 疫医 canonical 编号。 */
export const plagueDoctorAbnormalityId = 'O-01-45';

/** 疫医第 12 名使徒完成后转变出的白夜编号。 */
export const plagueDoctorWhiteNightId = 'T-03-46';

/** 触发疫医转变所需的使徒数量。 */
export const plagueDoctorApostleCount = 12;

/** 疫医转变白夜时结算的固定危急值，不按部门数换算。 */
export const plagueDoctorTransformationDanger = 98;

/** AdventClockUI 的 Name Effect 时序（毫秒）。 */
export const plagueDoctorBindingTimings = Object.freeze({
  arrowMoveMs: 1000,
  descEnableMs: 2000,
  nameEffectMs: 6000,
  nameRevealMs: 1000,
});

/** AdventClockUI 的完整降临（Full Advent）时序（毫秒）。 */
export const plagueDoctorAdventTimings = Object.freeze({
  adventAnimMs: 4000,
  adventMaxMs: 80000,
  cameraMoveMs: 1000,
});

/** 疫医事件使用的媒体路径。 */
export const plagueDoctorSoundPaths = Object.freeze({
  advent: 'Resources/sounds/creature/deathangel/Lucifer_Advent1.ogg',
  bell: 'Resources/sounds/creature/deathangel/Lucifer_Bell0.ogg',
  tick: 'Resources/sounds/creature/deathangel/Lucifer_Tick1.ogg',
});

/**
 * AdventClockUI 每个名字槽位占用的圆盘角度（Unity Z 轴，逆时针为正）。
 *
 * `SetArrowRotation` 传入的是 Unity 角度，网页用 CSS `rotate`（顺时针为正），
 * 两者方向相反，因此实际使用时经 {@link plagueDoctorCssArrowAngle} 取反。
 */
export const plagueDoctorClockFactor = -30;

/**
 * 计算指针在 CSS 坐标系下的角度。
 *
 * 序号 0 对应 Unity 旋转 0°，即指针垂直向上指向第 12 个格子（`twelveth`），
 * 之后每绑定一名使徒顺时针转过 30°。
 *
 * @param {number} index 已绑定的使徒序号（0 起，允许取到 12 表示转完一圈）。
 * @return {number} CSS `rotate` 角度（度，顺时针为正）。
 */
export function plagueDoctorCssArrowAngle(index) {
  return -index * plagueDoctorClockFactor;
}

/**
 * AdventClockUI.prefab 中 `_arrowTransitionCurve` 的采样点。
 *
 * 曲线带一次过冲（约 0.116）再回落，指针因此不是匀速旋转。
 */
export const plagueDoctorArrowCurve = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([0.033320386, 0.035881706]),
  Object.freeze([0.07744064, 0.023338508]),
  Object.freeze([0.13663547, 0.08322431]),
  Object.freeze([0.20230189, 0.057212427]),
  Object.freeze([0.24993774, 0.116305746]),
  Object.freeze([0.30018848, 0.09094186]),
  Object.freeze([0.9508265, 0.92427397]),
  Object.freeze([1, 1]),
]);

/**
 * AdventClockUI.ApostleDesc 的 Legacy Text Best Fit 参数。
 *
 * 字体取自 prefab 的 `NanumMyeongjo.ttf`，与名字使用的 BMDOHYEON 不同。
 */
export const plagueDoctorDescText = Object.freeze({
  fontFamily: 'LobotomyAdventDesc',
  maxSize: 50,
  minSize: 20,
});

/** Clock Center Sprite（Circle 节点）的原始裁切参数。 */
export const plagueDoctorClockCenterSprite =
  whiteNightSimpleAdventClockCenterSprite;

/**
 * ClockFrame 圆环内孔的实测像素范围（在 508×512 的 ClockFrame 贴图内）。
 *
 * 用于把圆盘中心的 ClockCenter 贴图对齐到圆盘实际空缺的位置与尺寸。
 */
export const plagueDoctorRingHole = Object.freeze({
  height: 252,
  textureHeight: 512,
  textureWidth: 508,
  width: 250,
  x: 129,
  y: 130,
});

/**
 * ClockCenter Sprite 里真正有像素的范围（在 1024×383 图集内，左上角原点）。
 *
 * 裁切区域本身带透明边距，按内容范围对齐才能让贴图正好盖住圆盘空缺。
 */
export const plagueDoctorClockCenterContent = Object.freeze({
  height: 252,
  width: 253,
  x: 383.0761,
  y: 129.0673,
});

/** ClockFrame 按 819×819 逻辑矩形做保持长宽比适配时的缩放。 */
const plagueDoctorFrameFit = Math.min(819 / 508, 819 / 512);

/**
 * 计算圆盘中心 ClockCenter 贴图的落位与 CSS 背景参数。
 *
 * 尺寸取 ClockFrame 的圆环内孔（按同一缩放换算），位置取圆盘中心，这样贴图正好
 * 覆盖圆盘空缺部分；贴图自身的 alpha 直接透出页面，不会形成黑色底。
 *
 * @return {{backgroundPositionX: number, backgroundPositionY: number, backgroundSizeHeight: number, backgroundSizeWidth: number, height: number, width: number}} CSS 背景参数与绘制尺寸。
 */
function clockCenterBackground() {
  const sprite = plagueDoctorClockCenterSprite;
  const scale = plagueDoctorFrameFit;
  const content = plagueDoctorClockCenterContent;
  return {
    backgroundPositionX: -content.x * scale,
    backgroundPositionY: -content.y * scale,
    backgroundSizeHeight: sprite.texture.height * scale,
    backgroundSizeWidth: sprite.texture.width * scale,
    height: plagueDoctorRingHole.height * scale,
    width: plagueDoctorRingHole.width * scale,
  };
}

const plagueDoctorClockCenter = clockCenterBackground();

/**
 * AdventClockUI.prefab 在 1920×1080 逻辑画布上的几何（CSS 左上原点、像素）。
 *
 * 所有数值都由 prefab 的 RectTransform 与 Sprite 裁切换算得到，模块与测试共用，
 * 避免样式与 prefab 脱节。
 */
export const plagueDoctorStageGeometry = Object.freeze({
  /** 指针 Arrow：枢轴为底边中心，相对 Clock 中心的偏移 (1,-15.1)。 */
  arrow: Object.freeze({
    height: 216,
    offsetX: 1,
    offsetY: -15.1,
    width: 60,
  }),
  /** BlackShader（DeathAngelClockDark）：2112×1188，中心相对画布中心上移 30。 */
  blackShader: Object.freeze({
    height: 1188,
    left: (lobotomyCorpReferenceCanvasWidth - 2112) / 2,
    top: (lobotomyCorpReferenceCanvasHeight - 1188) / 2 - 30,
    width: 2112,
  }),
  /**
   * Clock Center（Circle 节点）：ClockCenter 贴图对齐到圆盘中心的空缺。
   *
   * 游戏里它是覆盖圆盘内孔的一层透明贴图，尺寸取 ClockFrame 内孔、位置取盘心；
   * 导出的 prefab 把节点写成 1920×704 的拉伸矩形，直接照搬会明显大于内孔并偏下。
   */
  circle: Object.freeze({
    ...plagueDoctorClockCenter,
    left: (lobotomyCorpReferenceCanvasWidth - 819) / 2 + 819 / 2 -
      plagueDoctorClockCenter.width / 2,
    rotation: 179.51292,
    top: 25 + 819 / 2 - plagueDoctorClockCenter.height / 2,
  }),
  /** Clock：819×819，顶部锚点下移 25。 */
  clock: Object.freeze({
    height: 819,
    left: (lobotomyCorpReferenceCanvasWidth - 819) / 2,
    top: 25,
    width: 819,
  }),
  /** ApostleDesc：1600×180，中心相对画布中心下移 438。 */
  desc: Object.freeze({
    height: 180,
    left: (lobotomyCorpReferenceCanvasWidth - 1600) / 2,
    top: lobotomyCorpReferenceCanvasHeight / 2 + 438 - 180 / 2,
    width: 1600,
  }),
  /** Lowershader：1920×292.8，中心相对画布中心下移 405.6。 */
  lowerShader: Object.freeze({
    height: 292.8,
    left: 0,
    top: lobotomyCorpReferenceCanvasHeight / 2 + 405.6 - 292.8 / 2,
    width: 1920,
  }),
  /** Name 父对象的 anchoredPosition.y（Unity 向上为正）。 */
  nameParentOffsetY: 8.750008,
});

/** 会话内使徒记录的存储键；与白夜的会话键分开，避免互相覆盖。 */
export const plagueDoctorStorageKey = 'warmnest.lobotomy-corp-plague-doctor';

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
 * 将 Unity Color 写成稳定的浏览器 rgb() 文本。
 *
 * @param {{red: number, green: number, blue: number}} color Unity 颜色。
 * @return {string} CSS rgb() 颜色。
 */
function toCssColor(color) {
  return `rgb(${(color.red * 255).toFixed(6)} ${(color.green * 255).toFixed(6)} ${(color.blue * 255).toFixed(6)})`;
}

/**
 * 按 `_arrowTransitionCurve` 的采样点做线性插值。
 *
 * @param {number} rate 区间内的线性时间比例。
 * @return {number} 曲线求值结果。
 */
export function plagueDoctorArrowCurveValue(rate) {
  const normalized = clamp(rate, 0, 1);
  for (let index = 1; index < plagueDoctorArrowCurve.length; index++) {
    const [time, value] = plagueDoctorArrowCurve[index];
    const [previousTime, previousValue] = plagueDoctorArrowCurve[index - 1];
    if (normalized <= time) {
      const span = time - previousTime;
      const progress = span <= 0 ? 1 : (normalized - previousTime) / span;
      return previousValue + (value - previousValue) * progress;
    }
  }
  return 1;
}

/**
 * 将 Unity AnimationCurve 的零切线 Hermite 曲线用于淡入淡出。
 *
 * @param {number} rate 区间内的线性时间比例。
 * @return {number} 零切线 Hermite 插值结果。
 */
function zeroTangentCurve(rate) {
  const normalized = clamp(rate, 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

/**
 * 按 `PlagueDoctor.GetApostleDescRefined` 把台词里的 `#n` 替换为使徒名字。
 *
 * 源码从最高序号往低替换，避免 `#1` 命中 `#10` 的前缀。
 *
 * @param {Record<string, string>|undefined} messages 当前语言文案。
 * @param {number} index1 台词序号（1 起）。
 * @param {string[]} names 已绑定的使徒名字。
 * @return {string} 替换完成的台词；缺文案时回退为空串。
 */
function refineApostleDesc(messages, index1, names) {
  let text = messages?.[`plagueDoctor.apostle.${index1}`] ?? '';
  for (let index = names.length - 1; index >= 0; index--) {
    text = text.split(`#${index + 1}`).join(names[index]);
  }
  return text;
}

/**
 * 创建一张 Sprite 图片。
 *
 * @param {any} document 宿主 document。
 * @param {string} className 图层类名。
 * @param {string} source 图片地址。
 * @return {any} 图层图片。
 */
function createSprite(document, className, source) {
  const image = document.createElement('img');
  image.alt = '';
  image.className = className;
  image.src = source;
  image.setAttribute('aria-hidden', 'true');
  return image;
}

/**
 * 按 prefab 几何设置绝对定位。
 *
 * @param {any} element 目标元素。
 * @param {{left: number, top: number, width: number, height: number}} box 逻辑画布上的像素盒子。
 * @return {void}
 */
function placeBox(element, box) {
  element.style.setProperty('left', `${box.left}px`);
  element.style.setProperty('top', `${box.top}px`);
  element.style.setProperty('width', `${box.width}px`);
  element.style.setProperty('height', `${box.height}px`);
}

/**
 * 创建 AdventClockUI 对应的页面图层。
 *
 * 结构与 prefab 一致：`AddApostle` 下依次是 `Clock`、`Shader`（含 BlackShader /
 * ClockShader / Lowershader / Circle）与 `ApostleDesc`，同级靠后者绘制在上层。
 *
 * @param {object} options 图层配置。
 * @param {string} options.assetRoot 资源根路径。
 * @param {any} options.document 宿主 document。
 * @param {Array<{element: any}>} options.nameNodes 名字节点。
 * @return {any} 图层句柄。
 */
function buildAdventStage(options) {
  const { assetRoot, document } = options;
  const spriteRoot =
    `${assetRoot}/Resources/sprites/creaturesprite/deathangel/clock`;
  const root = document.createElement('section');
  const canvas = document.createElement('div');
  const addApostle = document.createElement('div');
  const clock = document.createElement('div');
  const namesLayer = document.createElement('div');
  const point = document.createElement('div');
  const arrow = createSprite(
    document,
    'lobotomy-corp-plague-doctor-advent-arrow',
    `${spriteRoot}/ClockArrow.png`,
  );
  const shader = document.createElement('div');
  const blackShader = createSprite(
    document,
    'lobotomy-corp-plague-doctor-advent-black-shader',
    // BlackShader 在 prefab 中引用的是 DeathAngelClockDark 这张暗角图。
    `${spriteRoot}/DeathAngelClockDark.png`,
  );
  const clockShader = createSprite(
    document,
    'lobotomy-corp-plague-doctor-advent-clock-shader',
    `${spriteRoot}/ClockShader.png`,
  );
  const lowerShader = createSprite(
    document,
    'lobotomy-corp-plague-doctor-advent-lower-shader',
    `${spriteRoot}/LowerShader.png`,
  );
  const circle = document.createElement('div');
  const desc = document.createElement('div');
  const geometry = plagueDoctorStageGeometry;

  root.className = 'lobotomy-corp-plague-doctor-advent';
  root.id = 'lobotomy-corp-plague-doctor-advent';
  root.setAttribute('aria-hidden', 'true');
  canvas.className = 'lobotomy-corp-plague-doctor-advent-canvas';
  addApostle.className = 'lobotomy-corp-plague-doctor-advent-add-apostle';
  clock.className = 'lobotomy-corp-plague-doctor-advent-clock';
  namesLayer.className = 'lobotomy-corp-plague-doctor-advent-names';
  point.className = 'lobotomy-corp-plague-doctor-advent-point';
  shader.className = 'lobotomy-corp-plague-doctor-advent-shader';
  circle.className = 'lobotomy-corp-plague-doctor-advent-circle';
  desc.className = 'lobotomy-corp-plague-doctor-advent-desc';

  placeBox(clock, geometry.clock);
  placeBox(desc, geometry.desc);
  // Shader 节点自身就是 GlobalShader（preserveAspect=0，铺满 1920×1080）。
  shader.style.setProperty(
    'background-image',
    `url("${spriteRoot}/GlobalShader.png")`,
  );
  namesLayer.style.setProperty(
    '--lobotomy-corp-advent-name-parent-y',
    `${geometry.nameParentOffsetY}px`,
  );
  arrow.style.setProperty(
    '--lobotomy-corp-advent-arrow-offset-x',
    `${geometry.arrow.offsetX}px`,
  );
  arrow.style.setProperty(
    '--lobotomy-corp-advent-arrow-offset-y',
    `${-geometry.arrow.offsetY}px`,
  );
  arrow.style.setProperty(
    '--lobotomy-corp-advent-arrow-width',
    `${geometry.arrow.width}px`,
  );
  arrow.style.setProperty(
    '--lobotomy-corp-advent-arrow-height',
    `${geometry.arrow.height}px`,
  );
  const circleBox = geometry.circle;
  circle.style.setProperty(
    'background-image',
    `url("${spriteRoot}/ClockCenter.png")`,
  );
  circle.style.setProperty(
    'background-size',
    `${circleBox.backgroundSizeWidth}px ${circleBox.backgroundSizeHeight}px`,
  );
  circle.style.setProperty(
    'background-position',
    `${circleBox.backgroundPositionX}px ${circleBox.backgroundPositionY}px`,
  );
  circle.style.setProperty('left', `${circleBox.left}px`);
  circle.style.setProperty('top', `${circleBox.top}px`);
  circle.style.setProperty('width', `${circleBox.width}px`);
  circle.style.setProperty('height', `${circleBox.height}px`);
  circle.style.setProperty('transform', `rotate(${circleBox.rotation}deg)`);

  point.append(arrow);
  clock.append(
    createSprite(
      document,
      'lobotomy-corp-plague-doctor-advent-frame',
      `${spriteRoot}/ClockFrame.png`,
    ),
    point,
    namesLayer,
  );
  // 顺序与 prefab 一致：Clock → Shader（含黑幕与两层 shader）→ Circle → ApostleDesc。
  addApostle.append(clock, shader, circle, desc);
  shader.append(blackShader, clockShader, lowerShader);
  canvas.append(addApostle);
  root.append(canvas);
  options.nameNodes.forEach(({ element }) => namesLayer.append(element));
  document.body.append(root);
  return {
    addApostle,
    arrow,
    blackShader,
    canvas,
    circle,
    clock,
    clockShader,
    desc,
    lowerShader,
    namesLayer,
    point,
    root,
    shader,
  };
}

/**
 * 创建一次疫医表盘演出（绑定或完整降临）。
 *
 * @param {object} options 演出配置。
 * @param {string} options.assetRoot 资源根路径。
 * @param {any} [options.document] 宿主 document。
 * @param {((name: any, fontSize: number) => boolean)|undefined} [options.measureName] 名字文本量度。
 * @param {string[]} options.names 12 个名字槽位的使徒名单。
 * @return {{dispose: () => void, layers: any, now: () => number, refitShaderLayer: () => void, run: (render: (elapsed: number) => boolean) => void, setAdventMode: (advent: boolean) => void, setDesc: (text: string) => void}} 演出控制器。
 */
function createPlagueDoctorClock(options) {
  const host = /** @type {any} */ (globalThis);
  const document = options.document ?? host.document;
  if (!document?.body || !document.createElement) {
    throw new Error('Plague Doctor Advent requires a document body.');
  }
  const assetRoot = options.assetRoot.replace(/\/$/, '');
  const now = () => host.performance?.now?.() ?? Date.now();
  /**
   * 申请一帧动画。
   *
   * @param {(timestamp: number) => void} callback 帧回调。
   * @return {number} 帧句柄。
   */
  const requestFrame = (callback) =>
    host.requestAnimationFrame?.(callback) ??
      setTimeout(() => callback(now()), 16);
  /**
   * 取消一帧动画。
   *
   * @param {number} id 帧句柄。
   * @return {void}
   */
  const cancelFrame = (id) => {
    if (typeof host.cancelAnimationFrame === 'function') {
      host.cancelAnimationFrame(id);
      return;
    }
    clearTimeout(id);
  };
  const viewport = () => lobotomyCorpViewportSize();
  const names = Array.isArray(options.names) ? options.names : [];
  /** @type {Array<{element: any, slot: {index: number, minSize: number}}>} */
  const nameNodes = whiteNightSimpleAdventNameSlots.map((slot) => {
    const name = document.createElement('span');
    const supplied = names[slot.index];
    name.className = 'lobotomy-corp-plague-doctor-advent-name';
    name.dataset.index = String(slot.index);
    name.dataset.minimumFontSize = String(slot.minSize);
    name.textContent = typeof supplied === 'string' ? supplied : '';
    name.style.setProperty(
      '--lobotomy-corp-advent-name-x',
      `${slot.anchoredPosition.x}px`,
    );
    name.style.setProperty(
      '--lobotomy-corp-advent-name-y',
      `${-slot.anchoredPosition.y}px`,
    );
    name.style.setProperty(
      '--lobotomy-corp-advent-name-rotation',
      `${slot.rotation}deg`,
    );
    name.style.setProperty('--lobotomy-corp-advent-name-alpha', '0');
    return { element: name, slot };
  });
  const layers = buildAdventStage({ assetRoot, document, nameNodes });
  /** @type {{height: number, width: number}|undefined} */
  let stableViewport;
  /** @type {number|undefined} */
  let frame;
  let disposed = false;

  /**
   * 让 shader 图层铺满当前 viewport。
   *
   * shader 图层在 1920×1080 逻辑画布内，因此尺寸要按画布缩放换算；它自身以画布
   * 中心居中，而画布又居中于 viewport，所以换算后的图层正好覆盖整个页面。
   *
   * @param {number} viewportWidth 可见 viewport 宽度。
   * @param {number} viewportHeight 可见 viewport 高度。
   * @param {number} canvasScale 当前逻辑画布缩放。
   * @return {void}
   */
  const fitShaderLayer = (viewportWidth, viewportHeight, canvasScale) => {
    const scale = Number.isFinite(canvasScale) && canvasScale > 0
      ? canvasScale
      : 1;
    layers.shader.style.setProperty('width', `${viewportWidth / scale}px`);
    layers.shader.style.setProperty('height', `${viewportHeight / scale}px`);
  };

  /**
   * 更新 1920×1080 逻辑画布的缩放。
   */
  const updateCanvasScale = () => {
    const live = viewport();
    stableViewport = lobotomyCorpCanvasViewportForUpdate(stableViewport, live);
    const base = lobotomyCorpCanvasScaleForViewport(
      stableViewport.width,
      stableViewport.height,
    );
    layers.canvas.style.setProperty(
      '--lobotomy-corp-advent-canvas-scale',
      String(base),
    );
    fitShaderLayer(live.width, live.height, base);
  };
  const fitNames = () =>
    nameNodes.forEach(({ element, slot }) =>
      fitWhiteNightSimpleAdventName(element, slot.minSize, options.measureName)
    );
  const resizeTarget = host.visualViewport ?? host;
  resizeTarget?.addEventListener?.('resize', updateCanvasScale);
  updateCanvasScale();
  fitNames();
  void document.fonts?.ready?.then?.(() => {
    if (!disposed) fitNames();
  });

  const controller = {
    /**
     * 释放演出图层与监听器。
     *
     * @return {void}
     */
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (frame !== undefined) cancelFrame(frame);
      resizeTarget?.removeEventListener?.('resize', updateCanvasScale);
      layers.root.remove();
    },
    /**
     * 按 `AdventClockUI.SetEffect` 切换 `_adventDisabled`（Circle 与指针）与黑幕。
     *
     * @param {boolean} advent 是否处于完整降临阶段。
     * @return {void}
     */
    setAdventMode: (advent) => {
      layers.circle.style.setProperty(
        '--lobotomy-corp-advent-layer-alpha',
        advent ? '0' : '1',
      );
      layers.point.style.setProperty(
        '--lobotomy-corp-advent-layer-alpha',
        advent ? '0' : '1',
      );
      layers.blackShader.style.setProperty(
        '--lobotomy-corp-advent-layer-alpha',
        advent ? '1' : '0',
      );
    },
    /**
     * 把 Desc 文本按 Legacy Text Best Fit（20~50）铺进 1600×180 的矩形。
     *
     * @param {string} text 台词文本。
     * @return {void}
     */
    setDesc: (text) => {
      layers.desc.textContent = text;
      for (
        let size = plagueDoctorDescText.maxSize;
        size >= plagueDoctorDescText.minSize;
        size--
      ) {
        layers.desc.style.setProperty(
          '--lobotomy-corp-advent-desc-font-size',
          `${size}px`,
        );
        const fitsHeight = !(layers.desc.scrollHeight > layers.desc.clientHeight);
        const fitsWidth = !(layers.desc.scrollWidth > layers.desc.clientWidth);
        if (fitsHeight && fitsWidth) return;
      }
      layers.desc.style.setProperty(
        '--lobotomy-corp-advent-desc-font-size',
        `${plagueDoctorDescText.minSize}px`,
      );
    },
    /** 图层句柄。 */
    layers,
    /** @return {void} 重新按当前 viewport 铺满 shader 图层。 */
    refitShaderLayer: () => updateCanvasScale(),
    /**
     * 派发一帧渲染回调。
     *
     * @param {(timestamp: number) => boolean} render 返回 true 时继续下一帧。
     * @return {void}
     */
    run: (render) => {
      const startedAt = now();
      /**
       * 申请下一帧。
       *
       * @return {void}
       */
      const step = () => {
        if (disposed) return;
        if (!render(now() - startedAt)) return;
        frame = requestFrame(step);
      };
      step();
    },
    /** @return {number} 当前时间。 */
    now,
  };
  return controller;
}

/**
 * 播放一名使徒的绑定演出（AdventClockUI.SetName 的 Name Effect）。
 *
 * @param {object} options 演出配置。
 * @param {string} options.assetRoot 资源根路径。
 * @param {string} options.desc 本次台词。
 * @param {any} [options.document] 宿主 document。
 * @param {number} options.index 使徒序号（0 起）。
 * @param {string[]} options.names 已绑定的使徒名单。
 * @param {(soundPath: string) => void} [options.playSound] 音效播放回调。
 * @return {{dispose: () => void, element: any, finished: Promise<void>}} 演出句柄。
 */
export function playPlagueDoctorBinding(options) {
  const clock = createPlagueDoctorClock({
    assetRoot: options.assetRoot,
    document: options.document,
    names: options.names,
  });
  const { layers } = clock;
  layers.root.style.setProperty('--lobotomy-corp-advent-root-alpha', '1');
  layers.clock.style.setProperty('--lobotomy-corp-advent-clock-alpha', '1');
  clock.setAdventMode(false);
  clock.setDesc(options.desc);
  layers.desc.style.setProperty('--lobotomy-corp-advent-desc-alpha', '0');
  const nameNode = layers.namesLayer.children[options.index];
  Array.from(layers.namesLayer.children ?? []).forEach(
    (/** @type {any} */ node, /** @type {number} */ index) => {
      if (index < options.index) {
        node.style.setProperty('--lobotomy-corp-advent-name-alpha', '1');
      }
    },
  );
  const initialAngle = plagueDoctorCssArrowAngle(options.index);
  const goalAngle = plagueDoctorCssArrowAngle(options.index + 1);
  layers.point.style.setProperty(
    '--lobotomy-corp-advent-arrow-angle',
    `${initialAngle}deg`,
  );
  let bellPlayed = false;
  options.playSound?.(plagueDoctorSoundPaths.tick);
  /** @type {() => void} */
  let resolveFinished = () => {};
  /** @type {Promise<void>} */
  const finished = new Promise((resolve) => {
    resolveFinished = () => resolve();
  });
  clock.run((elapsed) => {
    const { arrowMoveMs, descEnableMs, nameEffectMs, nameRevealMs } =
      plagueDoctorBindingTimings;
    layers.desc.style.setProperty(
      '--lobotomy-corp-advent-desc-alpha',
      String(clamp(elapsed / descEnableMs, 0, 1)),
    );
    const arrowRate = clamp((elapsed - descEnableMs) / arrowMoveMs, 0, 1);
    const angle = initialAngle + (goalAngle - initialAngle) *
      plagueDoctorArrowCurveValue(arrowRate);
    layers.point.style.setProperty(
      '--lobotomy-corp-advent-arrow-angle',
      `${angle}deg`,
    );
    if (elapsed >= descEnableMs + arrowMoveMs) {
      if (!bellPlayed) {
        bellPlayed = true;
        options.playSound?.(plagueDoctorSoundPaths.bell);
      }
      nameNode?.style.setProperty(
        '--lobotomy-corp-advent-name-alpha',
        String(
          clamp((elapsed - descEnableMs - arrowMoveMs) / nameRevealMs, 0, 1),
        ),
      );
    }
    if (elapsed < nameEffectMs) return true;
    clock.dispose();
    resolveFinished();
    return false;
  });
  return {
    dispose: () => clock.dispose(),
    element: layers.root,
    finished,
  };
}

/**
 * 播放第 12 名使徒完成后的完整降临（AdventClockUI.StartAdventEvent）。
 *
 * @param {object} options 演出配置。
 * @param {string} options.assetRoot 资源根路径。
 * @param {any} [options.document] 宿主 document。
 * @param {Record<string, string>|undefined} options.messages 当前语言文案。
 * @param {string[]} options.names 12 名使徒名字。
 * @param {(soundPath: string) => void} [options.playSound] 音效播放回调。
 * @param {() => void} [options.onAdventEnd] 逐名演出结束回调。
 * @return {{dispose: () => void, element: any, finished: Promise<void>}} 演出句柄。
 */
export function playPlagueDoctorAdvent(options) {
  const clock = createPlagueDoctorClock({
    assetRoot: options.assetRoot,
    document: options.document,
    names: options.names,
  });
  const { layers } = clock;
  const names = Array.isArray(options.names) ? options.names : [];
  const originalColor = whiteNightSimpleAdventOriginalColor;
  const adventColor = whiteNightSimpleAdventColor;
  const { adventAnimMs, adventMaxMs, cameraMoveMs } = plagueDoctorAdventTimings;
  /** @type {Array<{at: number, index: number, kind: string, startedAt: number}>} */
  const schedule = [];
  let cursor = 0;
  names.forEach((_, index) => {
    schedule.push({ at: cursor, index, kind: 'camera', startedAt: 0 });
    cursor += cameraMoveMs;
    schedule.push({ at: cursor, index, kind: 'anim', startedAt: 0 });
    cursor += adventAnimMs;
  });
  const totalMs = Math.min(cursor, adventMaxMs);
  layers.root.style.setProperty('--lobotomy-corp-advent-root-alpha', '1');
  layers.clock.style.setProperty('--lobotomy-corp-advent-clock-alpha', '1');
  clock.setAdventMode(true);
  // 12 个名字在各自的绑定演出里已经揭示，完整降临只负责逐个变红。
  Array.from(layers.namesLayer.children ?? []).forEach(
    (/** @type {any} */ node) =>
      node.style.setProperty('--lobotomy-corp-advent-name-alpha', '1'),
  );
  let index = 0;
  let finished = false;
  /** @type {() => void} */
  let resolveFinished = () => {};
  /** @type {Promise<void>} */
  const finishedPromise = new Promise((resolve) => {
    resolveFinished = () => resolve();
  });
  clock.run((elapsed) => {
    while (index < schedule.length && schedule[index].at <= elapsed) {
      const step = schedule[index++];
      const nameNode = layers.namesLayer.children[step.index];
      if (step.kind === 'camera') {
        clock.setDesc(
          refineApostleDesc(options.messages, step.index + 1, names),
        );
        layers.desc.style.setProperty(
          '--lobotomy-corp-advent-desc-alpha',
          '0',
        );
        options.playSound?.(plagueDoctorSoundPaths.bell);
      } else {
        nameNode?.style.setProperty(
          '--lobotomy-corp-advent-name-color',
          toCssColor(adventColor),
        );
      }
      step.startedAt = elapsed;
    }
    const current = schedule
      .slice(0, index)
      .reverse()
      .find((item) => item.kind === 'anim');
    if (current) {
      const rate = clamp((elapsed - current.startedAt) / adventAnimMs, 0, 1);
      const colorRate = Math.min(rate * 2, 1);
      const red = originalColor.red +
        (adventColor.red - originalColor.red) * colorRate;
      const green = originalColor.green +
        (adventColor.green - originalColor.green) * colorRate;
      const blue = originalColor.blue +
        (adventColor.blue - originalColor.blue) * colorRate;
      layers.namesLayer.children[current.index]?.style.setProperty(
        '--lobotomy-corp-advent-name-color',
        toCssColor({ blue, green, red }),
      );
      layers.desc.style.setProperty(
        '--lobotomy-corp-advent-desc-alpha',
        String(zeroTangentCurve(rate)),
      );
    }
    if (elapsed < totalMs || finished) return !finished;
    finished = true;
    options.onAdventEnd?.();
    clock.dispose();
    resolveFinished();
    return false;
  });
  return {
    dispose: () => clock.dispose(),
    element: layers.root,
    finished: finishedPromise,
  };
}

/**
 * 创建疫医转变事件。
 *
 * 使徒记录属于当前登录会话：按浏览器会话存储保存，重启 Day 不清除，只有重新
 * 登录（新的会话）才重新计数。
 *
 * @param {object} shared 宿主能力。
 * @param {string} shared.assetRoot 资源根路径。
 * @param {(value: string) => string|undefined} shared.abnormalityName 识别到异想体时返回本地化名称。
 * @param {() => Record<string, string>|undefined} shared.messages 当前语言文案。
 * @param {() => void} shared.onTransformation 转变完成、应进入白夜时的回调。
 * @param {(amount: number) => void} shared.settleDanger 结算固定危急值。
 * @param {(value: string) => void} [shared.applyDisplayName] 转变后把显示名称改写为白夜。
 * @return {object} 疫医事件 API。
 */
export function createPlagueDoctorEvent(shared) {
  /** @type {{apostles: string[], recording: boolean, transformed: boolean}|undefined} */
  let state;
  let busy = false;
  let transforming = false;
  /** @type {{dispose: () => void}|undefined} */
  let activeClock;
  /** @type {any} 完整降临的专属 BGM（对应 BgmManager 的 UniqueBgm）。 */
  let adventBgm;

  /**
   * 读取会话存储。
   *
   * @return {any|undefined} 可用时返回 sessionStorage。
   */
  const storage = () => {
    try {
      return globalThis.sessionStorage ?? undefined;
    } catch {
      return undefined;
    }
  };

  /**
   * 持久化使徒记录。
   *
   * @return {void}
   */
  const persist = () => {
    try {
      storage()?.setItem(plagueDoctorStorageKey, JSON.stringify(state));
    } catch {
      // 存储不可用时事件仍在当前页面内生效。
    }
  };

  /**
   * 读取会话内的使徒记录。
   *
   * @return {void}
   */
  const restore = () => {
    /** @type {any} */
    let saved;
    try {
      const raw = storage()?.getItem(plagueDoctorStorageKey);
      saved = raw ? JSON.parse(raw) : undefined;
    } catch {
      saved = undefined;
    }
    state = {
      apostles: Array.isArray(saved?.apostles)
        ? saved.apostles.filter((/** @type {unknown} */ name) =>
            typeof name === 'string'
          )
            .slice(0, plagueDoctorApostleCount)
        : [],
      recording: saved?.recording === true,
      transformed: saved?.transformed === true,
    };
  };
  restore();

  /** @return {string[]} 已绑定的使徒名字。 */
  const apostleNames = () => [...(state?.apostles ?? [])];
  /** @return {boolean} 是否正在记录使徒。 */
  const isRecording = () => state?.recording === true;
  /** @return {boolean} 本次会话内是否已经完成过一次转变。 */
  const hasTransformed = () => state?.transformed === true;
  /** @return {boolean} 转变演出是否正在进行。 */
  const isTransforming = () => transforming;

  /**
   * 播放一段音效。
   *
   * @param {string} soundPath 相对于 Assets 的音频路径。
   * @return {any|undefined} 已开始播放的音频。
   */
  const playSound = (soundPath) => {
    if (typeof globalThis.Audio !== 'function') return undefined;
    const audio = new Audio(`${shared.assetRoot}/${soundPath}`);
    audio.hidden = true;
    audio.preload = 'auto';
    audio.setAttribute?.('aria-hidden', 'true');
    void audio.play?.().catch(() => {});
    return audio;
  };

  /**
   * 停止完整降临的专属 BGM，对应 `OnEndAdventEffect` 里的 `ClearUniqueBgm()`。
   *
   * @return {void}
   */
  const clearAdventBgm = () => {
    adventBgm?.pause?.();
    if (adventBgm) adventBgm.currentTime = 0;
    adventBgm = undefined;
  };

  /**
   * 走入白夜：结算固定 +98，改写显示名称并通知宿主启动白夜事件。
   *
   * @return {void}
   */
  const completeTransformation = () => {
    busy = false;
    transforming = false;
    activeClock = undefined;
    // 白夜登场前先收掉疫医的过场 BGM，避免与白夜教堂音乐重叠。
    clearAdventBgm();
    if (state) {
      state.transformed = true;
      state.recording = false;
      persist();
    }
    shared.settleDanger?.(plagueDoctorTransformationDanger);
    shared.applyDisplayName?.(plagueDoctorWhiteNightId);
    shared.onTransformation?.();
  };

  /**
   * 启动转变演出：首次走完整降临，已经转变过则直接进入白夜。
   *
   * @return {void}
   */
  const startTransformation = () => {
    if (transforming) return;
    transforming = true;
    busy = true;
    const firstTime = state?.transformed !== true;
    if (
      !firstTime || typeof globalThis.document?.createElement !== 'function'
    ) {
      completeTransformation();
      return;
    }
    const clock = playPlagueDoctorAdvent({
      assetRoot: shared.assetRoot,
      document: globalThis.document,
      messages: shared.messages?.(),
      names: apostleNames(),
      onAdventEnd: completeTransformation,
      playSound,
    });
    activeClock = clock;
    adventBgm = playSound(plagueDoctorSoundPaths.advent);
  };

  /**
   * 绑定一名使徒；第 12 名完成后进入转变。
   *
   * @param {string} value 本次保存的显示名称。
   * @return {void}
   */
  const bindApostle = (value) => {
    const current = state;
    if (!current) return;
    const name = shared.abnormalityName?.(value) ?? value;
    const index = current.apostles.length;
    current.apostles.push(name);
    persist();
    busy = true;
    if (typeof globalThis.document?.createElement === 'function') {
      const clock = playPlagueDoctorBinding({
        assetRoot: shared.assetRoot,
        desc: refineApostleDesc(
          shared.messages?.(),
          index + 1,
          current.apostles,
        ),
        document: globalThis.document,
        index,
        names: current.apostles,
        playSound,
      });
      activeClock = clock;
      void clock.finished.then(() => {
        activeClock = undefined;
        if (current.apostles.length >= plagueDoctorApostleCount) {
          startTransformation();
        } else {
          busy = false;
        }
      });
      return;
    }
    if (current.apostles.length >= plagueDoctorApostleCount) {
      startTransformation();
    } else {
      busy = false;
    }
  };

  /**
   * 认领一次已确认保存的显示名称。
   *
   * @param {string} value 服务器已保存成功的显示名称。
   * @return {boolean} 本次提交由疫医事件接管时返回 true。
   */
  const claim = (value) => {
    if (busy) return true;
    const normalized = String(value).normalize('NFKC').trim()
      .toLocaleLowerCase('en-US');
    if (normalized === plagueDoctorAbnormalityId.toLowerCase()) {
      // 已经完成过一次转变后再次提交疫医：直接进入白夜。
      if (hasTransformed()) {
        startTransformation();
        return true;
      }
      // 第一次提交只是开始记录，这一次不计为使徒。
      if (!isRecording()) {
        if (state) state.recording = true;
        persist();
        return true;
      }
    }
    if (!isRecording()) return false;
    if ((state?.apostles.length ?? 0) >= plagueDoctorApostleCount) {
      startTransformation();
      return true;
    }
    bindApostle(value);
    return true;
  };

  /**
   * 中止进行中的使徒演出；使徒记录本身保留。
   *
   * @return {void}
   */
  const reset = () => {
    activeClock?.dispose?.();
    activeClock = undefined;
    clearAdventBgm();
    busy = false;
    transforming = false;
  };

  return Object.freeze({
    apostleCount: () => state?.apostles.length ?? 0,
    apostleNames,
    claim,
    hasTransformed,
    isRecording,
    isTransforming,
    reset,
    soundPaths: plagueDoctorSoundPaths,
  });
}
