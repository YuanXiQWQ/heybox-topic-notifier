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
 *
 * 完整降临里每名使徒的转化光效来自原始 `AdventLight.prefab`（见
 * `AdventLight.js`），不是自制渐变：镜头聚焦完成后才触发 `Run`，颜色与缩放
 * 全部取自 `ApostleAdventLight.anim`。
 */
// @ts-check

import {
  adventTextNeedsCjkFont,
  fitWhiteNightSimpleAdventName,
  whiteNightSimpleAdventClockCenterSprite,
  whiteNightSimpleAdventColor,
  whiteNightSimpleAdventNameSlots,
  whiteNightSimpleAdventOriginalColor,
} from './WhiteNightAdvent.js';
import {
  createDeathAngelAdventLight,
  deathAngelAdventLightPrefab,
} from './AdventLight.js';
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

/**
 * 第 12 名使徒是「叛徒」，没有 AdventLight 光效。
 *
 * 原作依据：`WhiteNightSpace.ApostleStaticInfo.GetApostleType(11)` 返回
 * `ApostleType.BETRAYER`；`DeathAngel.GenApostle()` 对该类型不生成使徒单位
 * （只给这名员工挂 `DeathAngelBetrayerBuf`），所以
 * `AdventClockUI.ExecuteNextAdventTarget()` 在镜头移动后因 `AposlteModel == null`
 * 直接 return，`StartAdventAnim()` 里 `TurnOnAdventLight()` 抛出的空引用被
 * `catch (Exception)` 吞掉。这一名只有镜头聚焦、台词与名字变红，没有光效。
 */
export const plagueDoctorBetrayerIndex = 11;

/** 疫医转变白夜时结算的固定危急值，不按部门数换算。 */
export const plagueDoctorTransformationDanger = 98;

/** 网页宿主隔离层的类名（属于网页，不属于《脑叶公司》原作素材）。 */
export const plagueDoctorAdventWorldClassName =
  'lobotomy-corp-plague-doctor-advent-world';

/**
 * 每个宿主 document 的滚动 inline 原值。
 *
 * 按 document 记录（而不是模块级单变量），这样同一个模块服务多个 document 时
 * 不会互相串状态，也保证解锁时只还原自己锁过的那份。
 *
 * @type {WeakMap<object, {body: string|undefined, documentElement: string|undefined}>}
 */
const plagueDoctorHostScrollLocks = new WeakMap();

/**
 * 锁住宿主页面滚动。
 *
 * 全局 `:root { overflow-y: scroll }` 让 `<html>` 成为滚动容器，所以主要锁它，
 * `body` 一并锁上以覆盖浏览器差异。只改 inline `overflow`（真正禁止滚动），
 * 不动 `scrollTop`，也不用 `scrollbar-width` / `::-webkit-scrollbar` 做视觉隐藏；
 * 原有 inline 值先存下来，解锁时精确写回。
 *
 * @param {any} [hostDocument] 宿主 document，省略时取全局 document。
 * @return {void}
 */
export function lockPlagueDoctorHostScroll(hostDocument) {
  const document = hostDocument ?? globalThis.document;
  if (!document || plagueDoctorHostScrollLocks.has(document)) return;
  const rootElement = document?.documentElement;
  const body = document?.body;
  plagueDoctorHostScrollLocks.set(document, {
    body: body?.style?.overflow,
    documentElement: rootElement?.style?.overflow,
  });
  if (rootElement?.style) rootElement.style.overflow = 'hidden';
  if (body?.style) body.style.overflow = 'hidden';
}

/**
 * 还原宿主页面滚动，写回锁之前的 exact inline 值。
 *
 * @param {any} [hostDocument] 宿主 document，省略时取全局 document。
 * @return {void}
 */
export function unlockPlagueDoctorHostScroll(hostDocument) {
  const document = hostDocument ?? globalThis.document;
  const state = document ? plagueDoctorHostScrollLocks.get(document) : undefined;
  if (!document || state === undefined) return;
  plagueDoctorHostScrollLocks.delete(document);
  const rootElement = document?.documentElement;
  const body = document?.body;
  if (rootElement?.style) {
    rootElement.style.overflow = state.documentElement ?? '';
  }
  if (body?.style) body.style.overflow = state.body ?? '';
}

/** AdventClockUI 的 Name Effect 时序（毫秒）。 */
export const plagueDoctorBindingTimings = Object.freeze({
  arrowMoveMs: 1000,
  descEnableMs: 2000,
  nameEffectMs: 6000,
  nameRevealMs: 1000,
});

/** AdventClockUI 的完整降临（Full Advent）时序（毫秒）。 */
export const plagueDoctorAdventTimings = Object.freeze({
  /** `AdventClockUI._advent_adventAnim`：每名使徒的降临动画时长。 */
  adventAnimMs: 4000,
  /** `AdventClockUI._adventMaxTime`：完整降临的兜底上限。 */
  adventMaxMs: 80000,
  /** `AdventClockUI._advent_cameraMove`：镜头聚焦一名使徒所需的时长。 */
  cameraMoveMs: 1000,
  /** `PlagueDoctorAnim.OnStartAdvent()` 的 `_adventEffectTimer`。 */
  plagueDoctorAdventMs: 3000,
});

/**
 * 使徒转化光效的挂点，取自 AdventLight.prefab 与使徒动画 prefab。
 *
 * 光效本身由 `AdventLight.js` 按原始 `.anim` 播放，这里只暴露 prefab 记录，
 * 供测试核对网页使用的挂点与 prefab 一致。
 */
export const plagueDoctorAdventLightPrefab = deathAngelAdventLightPrefab;

/** 疫医事件使用的媒体路径。 */
export const plagueDoctorSoundPaths = Object.freeze({
  advent: 'Resources/sounds/creature/deathangel/Lucifer_Advent1.ogg',
  bell: 'Resources/sounds/creature/deathangel/Lucifer_Bell0.ogg',
  // DeathAngelApostle.Escape() → MakeAdventSound()：每名使徒登场时的合唱。
  choir: 'Resources/sounds/creature/deathangel/Choir1.ogg',
  tick: 'Resources/sounds/creature/deathangel/Lucifer_Tick1.ogg',
  // DeathAngelApostle.Escape() → MakeAdventSound()：随机一首使徒低语（Whisper0~2）。
  whispers: Object.freeze([
    'Resources/sounds/creature/deathangel/Lucifer_Apostle_Whisper0.ogg',
    'Resources/sounds/creature/deathangel/Lucifer_Apostle_Whisper1.ogg',
    'Resources/sounds/creature/deathangel/Lucifer_Apostle_Whisper2.ogg',
  ]),
});

/**
 * AdventClockUI 每个名字槽位占用的圆盘角度（Unity Z 轴，逆时针为正）。
 *
 * `SetArrowRotation` 传入的是 Unity 角度，网页用 CSS `rotate`（顺时针为正），
 * 两者方向相反，因此实际使用时经 {@link plagueDoctorCssArrowAngle} 取反。
 */
export const plagueDoctorClockFactor = -30;

/**
 * 疫医转变开场用的实体视频（世界层，靠圆盘开口露出）。
 *
 * 内容由解包工程里的 `ExportPlagueDoctorAdvent.Run` 直接渲染原作资源得到：
 * `Resources/prefabs/unit/creatureanimator/PlagueDoctorAnim.prefab` 的疫医骨架
 * （`TextAsset/skeleton_15.json` + `TextAsset/skeleton.atlas_31.txt`）按
 * `PlagueDoctorSkeletonAnim.SetState(12)` 的最终形态摆放，并且一直在播 `PlagueDoc`
 * 的 Animator 默认状态 `0_Default_`（翅膀摆动、骨骼位移都来自这段原作动画），
 * 镜头用 `PlagueDoctor.OnClockUIEnd()` 的 `CameraMoveEvent(eye1 - (0.2, 0.9), 4f, 1f)`
 * 取景，眼睛按 `PlagueDoctorAnim.OnStartAdvent()` 的 3 秒计时在 0.2 / 0.6 分两半出现
 * （`_eye1` 精灵夹在骨架 z = −0.17 那一层，所以是分层绘制的）。
 *
 * 第 5 秒是 `PlagueDoctor.OnPlagueDoctorAdventEnd()` 之后的画面：疫医被隐藏、
 * 白夜本体（`DeathAngelAnim.prefab` 的 `WhiteNight` 子物体，默认动画
 * `0_Default_inside`）登场。
 *
 * 视频自带 1 秒镜头移动（全长 5 秒）：网页从演出第 0 毫秒播放，动画相位、两次
 * 睁眼（镜头到位 + 0.6 / 1.8 秒）与白夜换场（镜头到位 + 3 秒）就都与原作一致。
 */
export const plagueDoctorAdventEntityVideo = 'PlagueDoctor_Advent.webm';

/** 镜头聚焦的「显示名称输入框」视图类名（属于网页宿主界面，不是原作素材）。 */
export const plagueDoctorAdventFocusClassName =
  'lobotomy-corp-plague-doctor-advent-focus';

/**
 * 镜头交接的时序（毫秒）：疫医变成白夜的那一瞬间镜头就开始移向使徒。
 *
 * 原作里 `PlagueDoctor.OnPlagueDoctorAdventEnd()` 关掉疫医、打开白夜单位，紧接着
 * `AdventClockUI.ExecuteNextAdventTarget()` 就调
 * `CameraMoveEvent(..., _advent_cameraMove)`；白夜只是「一瞬间」出现，镜头随即离开。
 * 网页把这段交接画成：实体视频在 `handoffMs` 内淡出、聚焦视图在同一段时间里淡入，
 * 文本框里的使徒名字同时完成一次淡入淡出。
 */
export const plagueDoctorAdventFocusTimings = Object.freeze({
  /** 实体视频淡出、聚焦视图淡入的总时长（＝原作镜头移动的 `_advent_cameraMove`）。 */
  handoffMs: 1000,
  /** 使徒轮换时文本框淡出的时长。 */
  textFadeOutMs: 220,
  /** 使徒轮换时文本框淡入的时长。 */
  textFadeInMs: 330,
});

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
  width: 252,
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
 * 圆盘中心贴图的整体不透明度。
 *
 * 贴图自身只有约 0.25~0.35 的 alpha，这里再乘一层，让它和盘外的暗背景亮度接近，
 * 不会在圆盘空缺里显出一块偏黑的小圆。
 */
export const plagueDoctorCenterImageOpacity = 0.5;

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
 * AdventClockUI.prefab 里 Clock（圆盘）的参考边长。
 *
 * 黑幕等「按圆盘取比例」的尺寸都以它为基准换算，避免写死具体窗口下的像素值。
 */
export const plagueDoctorClockReferenceSize = 819;

/**
 * prefab 里 BlackShader（DeathAngelClockDark）的 RectTransform 尺寸。
 *
 * 它与圆盘 819 的比值就是黑幕中间那圈透明空洞相对圆盘的大小；网页按
 * `宽 = 圆盘宽 × 2112 / 819`、`高 = 圆盘宽 × 1188 / 819` 动态算出实际尺寸，
 * 这样空洞在任何窗口下都和圆盘保持同一比例（既不会被压成椭圆，也不会比圆盘还大）。
 */
export const plagueDoctorBlackShaderSize = Object.freeze({
  height: 1188,
  width: 2112,
});

/**
 * 台词槽位（ApostleDesc）相对画布顶部的 top，单位是 1920×1080 画布像素。
 *
 * prefab 里 ApostleDesc 是「相对画布中心下移 438」的 1600×180 矩形，在 16:9 画面下
 * 下边缘离画面底 12；网页画布按「整块构图装进 viewport」缩放后，非 16:9 的窗口会在
 * 上下留黑边，若仍按画布坐标摆，台词就跟着画布往上飘（900×1200 实测离画面底 352px）。
 *
 * 因此这里把台词下边缘钉在**可见画面底部上方 12 画布像素**：16:9 时结果就是 prefab 的
 * 888（画面比例对时完全不变），只有非 16:9 的窗口才会把它往下压回底部黑幕里。
 *
 * @param {object} input 计算输入。
 * @param {number} input.canvasScale 当前逻辑画布缩放。
 * @param {number} input.viewportHeight 可见 viewport 高度。
 * @return {number} 台词槽位相对画布顶部的 top（画布像素）。
 */
export function plagueDoctorDescTopForViewport(input) {
  const scale = Number.isFinite(input.canvasScale) && input.canvasScale > 0
    ? input.canvasScale
    : 1;
  const desc = plagueDoctorStageGeometry.desc;
  /** 台词下边缘离画面底的画布像素数（prefab：1080 - 1068 = 12）。 */
  const bottomMargin =
    lobotomyCorpReferenceCanvasHeight - (desc.top + desc.height);
  // 画布上下居中：画布中心到画面底的距离是 viewportHeight / (2 × scale) 画布像素，
  // 再减去画布中心到台词下边缘的距离（540 - 12 - 180）。
  return input.viewportHeight / (2 * scale) +
    (lobotomyCorpReferenceCanvasHeight / 2 - bottomMargin - desc.height);
}

/**
 * 黑幕（DeathAngelClockDark）在 1920×1080 画布里的摆放：贴图本身，以及画布之外那圈同色延伸。
 *
 * 贴图按 prefab 的 2112×1188、中心相对画布中心上移 30 摆放，尺寸只跟圆盘走
 * （宽 = 圆盘宽 × 2112/819），所以中间那圈正圆开口在任何窗口下都与圆盘同比例。
 *
 * 画布之外的覆盖用四条同色（贴图自身边缘色 rgb(8,1,0)）的延伸带，不用 border：
 * border 与贴图盒子的接缝会留下亚像素空隙，抗锯齿会混到接缝外面的东西上，宿主底面
 * 取页面底色之后那条缝就是一条能看见的浅色横线（700×900 实测 y=222 那行 58,47,48，
 * 上下都是 11,3,3）。延伸带往视口外各多留 margin、往贴图里重叠 overlap，
 * 这样两边的抗锯齿都落在同色里。
 *
 * @param {object} input 计算输入。
 * @param {number} input.canvasScale 当前逻辑画布缩放。
 * @param {number} input.dialWidth 圆盘在画布上的宽度。
 * @param {number} input.viewportHeight 可见 viewport 高度。
 * @param {number} input.viewportWidth 可见 viewport 宽度。
 * @return {{bands: Array<{height: number, left: number, top: number, width: number}>, height: number, width: number}} 贴图尺寸与四条延伸带（按上、下、左、右顺序，画布像素）。
 */
export function plagueDoctorBlackShaderLayout(input) {
  const scale = Number.isFinite(input.canvasScale) && input.canvasScale > 0
    ? input.canvasScale
    : 1;
  const textureScale = input.dialWidth / plagueDoctorClockReferenceSize;
  const width = plagueDoctorBlackShaderSize.width * textureScale;
  const height = plagueDoctorBlackShaderSize.height * textureScale;
  // 画布外的余量（画布像素）：延伸带的边界要落到视口之外。
  const margin = 64;
  // 与贴图的重叠（画布像素）：贴图边缘的抗锯齿要落在同色延伸带里。
  const overlap = 16;
  const viewportWidth = input.viewportWidth / scale;
  const viewportHeight = input.viewportHeight / scale;
  // 贴图中心比画布中心高 30；shader 图层盒子正好是 viewport 换算到画布上的尺寸，
  // 所以它内部坐标就是从 (-margin, -margin) 到 (viewportWidth + margin, viewportHeight + margin)。
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2 - 30;
  const textureLeft = centerX - width / 2;
  const textureTop = centerY - height / 2;
  const textureRight = centerX + width / 2;
  const textureBottom = centerY + height / 2;
  /**
   * 负的尺寸会让元素反向绘制，统一夹到 0。
   *
   * @param {number} value 原始尺寸。
   * @return {number} 不小于 0 的尺寸。
   */
  const clamp = (value) => Math.max(0, value);
  /**
   * 组装一条矩形延伸带。
   *
   * @param {number} left 左边界（画布像素）。
   * @param {number} top 上边界（画布像素）。
   * @param {number} bandWidth 宽度（画布像素）。
   * @param {number} bandHeight 高度（画布像素）。
   * @return {{height: number, left: number, top: number, width: number}} 延伸带盒子。
   */
  const band = (left, top, bandWidth, bandHeight) => ({
    height: clamp(bandHeight),
    left,
    top,
    width: clamp(bandWidth),
  });
  const bands = [
    // 上
    band(
      -margin,
      -margin,
      viewportWidth + margin * 2,
      textureTop + overlap + margin,
    ),
    // 下
    band(
      -margin,
      textureBottom - overlap,
      viewportWidth + margin * 2,
      viewportHeight + margin - (textureBottom - overlap),
    ),
    // 左
    band(
      -margin,
      textureTop + overlap,
      textureLeft + overlap + margin,
      height - overlap * 2,
    ),
    // 右
    band(
      textureRight - overlap,
      textureTop + overlap,
      viewportWidth + margin - (textureRight - overlap),
      height - overlap * 2,
    ),
  ];
  return {
    bands,
    height,
    width,
  };
}

/**
 * AdventClockUI.prefab 在 1920×1080 逻辑画布上的几何（CSS 左上原点、像素）。
 *
 * 所有数值都由 prefab 的 RectTransform 与 Sprite 裁切换算得到，模块与测试共用，
 * 避免样式与 prefab 脱节。
 */
/**
 * 聚焦视图（显示名称输入框）在 1920×1080 画布上的位置与尺寸。
 *
 * 中心对齐圆盘中心（`Clock` 顶部 25 + 819/2），尺寸控制在 `DeathAngelClockDark`
 * 开口里完全可见（开口半径约 264 画布像素）。
 */
export const plagueDoctorAdventFocusBox = Object.freeze({
  height: 84,
  left: lobotomyCorpReferenceCanvasWidth / 2 - 160,
  top: 25 + plagueDoctorClockReferenceSize / 2 - 42,
  width: 320,
});

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
 * @param {boolean} [options.hostWorld] 是否创建网页宿主隔离层。
 * @param {Array<{element: any}>} options.nameNodes 名字节点。
 * @return {any} 图层句柄。
 */
function buildAdventStage(options) {
  const { assetRoot, document } = options;
  const spriteRoot =
    `${assetRoot}/Resources/sprites/creaturesprite/deathangel/clock`;
  // 白夜系视频与贴图分开存放：视频直接放在 deathangel 目录下（与
  // WhiteNight_Escape_Idle.webm / WhiteNight_Confess_Dead.webm 同级）。
  const deathAngelRoot =
    `${assetRoot}/Resources/sprites/creaturesprite/deathangel`;
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
  // BlackShader 在 prefab 中引用的是 DeathAngelClockDark 这张暗角图（2112×1188，比画布大）。
  const blackShader = document.createElement('div');
  blackShader.className = 'lobotomy-corp-plague-doctor-advent-black-shader';
  blackShader.setAttribute('aria-hidden', 'true');
  blackShader.style.setProperty(
    'background-image',
    `url("${spriteRoot}/DeathAngelClockDark.png")`,
  );
  // 画布之外那圈用四条同色延伸带补齐，它们排在贴图下面（详见 layout 函数的说明）。
  const blackShaderBands = [0, 1, 2, 3].map(() => {
    const element = document.createElement('div');
    element.className = 'lobotomy-corp-plague-doctor-advent-black-shader-band';
    element.setAttribute('aria-hidden', 'true');
    return element;
  });
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
  // 宿主隔离层：只有完整降临需要（原作里它后面是游戏世界，网页里得先盖住网站）。
  // 底色由 CSS 取宿主页面底色：DeathAngelClockDark 的盘心开口按设计要露出后面的
  // 世界，铺纯黑会把那块开口也糊成黑圆。
  const world = options.hostWorld === true
    ? document.createElement('div')
    : undefined;
  // 使徒转化光效是独立的 AdventLight 视觉层：原作里它在世界层（Particle
  // 排序层，Order 10），因此网页把它排在表盘 UI 之前，靠圆环内孔露出光斑。
  const adventLight = createDeathAngelAdventLight({ assetRoot, document });
  // 原作里圆盘开口后面是收容单元与疫医实体本身；网页把它预渲染成视频，同样挂在
  // 世界层（表盘 UI 之前），由 DeathAngelClockDark 的开口露出。
  const worldEntity = options.hostWorld === true
    ? document.createElement('video')
    : undefined;
  // 原作镜头接着会移到（本次转变的）使徒身上；网页没有员工，于是把「显示名称」
  // 输入框当作那个被聚焦的对象：它是网页自己的界面，不是原作素材。
  const focus = options.hostWorld === true
    ? document.createElement('div')
    : undefined;
  const focusInput = focus ? document.createElement('input') : undefined;

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
  if (world) {
    world.className = plagueDoctorAdventWorldClassName;
    world.setAttribute('aria-hidden', 'true');
  }
  if (worldEntity) {
    worldEntity.className = 'lobotomy-corp-plague-doctor-advent-world-entity';
    worldEntity.muted = true;
    worldEntity.playsInline = true;
    worldEntity.preload = 'auto';
    worldEntity.setAttribute('aria-hidden', 'true');
    worldEntity.src = `${deathAngelRoot}/${plagueDoctorAdventEntityVideo}`;
    worldEntity.hidden = true;
  }
  if (focus && focusInput) {
    focus.className = plagueDoctorAdventFocusClassName;
    focus.setAttribute('aria-hidden', 'true');
    focusInput.className = 'lobotomy-corp-plague-doctor-advent-focus-input';
    focusInput.readOnly = true;
    focusInput.setAttribute('tabindex', '-1');
    focusInput.setAttribute('aria-hidden', 'true');
    focus.style.setProperty(
      '--lobotomy-corp-advent-focus-alpha',
      '0',
    );
    focusInput.style.setProperty(
      '--lobotomy-corp-advent-focus-text-alpha',
      '0',
    );
    focus.append(focusInput);
  }

  placeBox(clock, geometry.clock);
  placeBox(desc, geometry.desc);
  // 黑幕尺寸由圆盘尺寸算出（prefab 里黑幕 2112×1188 对应圆盘 819），
  // 于是中间那圈透明空洞永远与圆盘同比例：任何窗口下都不会被压扁或放得比圆盘大。
  const blackShaderScale = geometry.clock.width / plagueDoctorClockReferenceSize;
  // 贴图按 prefab 尺寸居中画，尺寸只跟圆盘走（不由 viewport 决定，空洞比例才恒定）；
  // 画布之外那圈延伸带的尺寸在 fitShaderLayer 里按 viewport 给。
  blackShader.style.setProperty(
    'width',
    `${plagueDoctorBlackShaderSize.width * blackShaderScale}px`,
  );
  blackShader.style.setProperty(
    'height',
    `${plagueDoctorBlackShaderSize.height * blackShaderScale}px`,
  );
  blackShader.style.setProperty(
    'background-size',
    `${
      plagueDoctorBlackShaderSize.width * blackShaderScale
    }px ${plagueDoctorBlackShaderSize.height * blackShaderScale}px`,
  );
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
  circle.style.setProperty(
    '--lobotomy-corp-advent-center-opacity',
    String(plagueDoctorCenterImageOpacity),
  );

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
  // 顺序与 prefab 一致：Clock → Shader（含黑幕与两层 shader）→ Circle →
  // ApostleDesc；AdventLight 作为世界层先于整块 UI 绘制。
  if (worldEntity) {
    addApostle.append(worldEntity);
  }
  // 聚焦视图放在宿主隔离层里：它是 viewport-space 的网页界面，且必须位于表盘 UI
  // 之下、网页之上（表盘 UI 的开口正好露出它）。
  if (focus && world) {
    world.append(focus);
  }
  addApostle.append(adventLight.element, clock, shader, circle, desc);
  // 延伸带要压在贴图下面，所以先挂上；Shader 子层顺序仍是黑幕 → ClockShader → LowerShader。
  blackShaderBands.forEach((band) => shader.append(band));
  shader.append(blackShader, clockShader, lowerShader);
  canvas.append(addApostle);
  // world 是 viewport-space 的固定层，必须排在 canvas 之前（也就是整块原作 UI 之下）。
  if (world) {
    root.append(world, canvas);
  } else {
    root.append(canvas);
  }
  options.nameNodes.forEach(({ element }) => namesLayer.append(element));
  document.body.append(root);
  return {
    adventLight,
    addApostle,
    arrow,
    blackShader,
    blackShaderBands,
    canvas,
    circle,
    clock,
    clockShader,
    desc,
    focus,
    focusInput,
    lowerShader,
    namesLayer,
    point,
    root,
    shader,
    world,
    worldEntity,
  };
}

/**
 * 创建一次疫医表盘演出（绑定或完整降临）。
 *
 * @param {object} options 演出配置。
 * @param {string} options.assetRoot 资源根路径。
 * @param {any} [options.document] 宿主 document。
 * @param {boolean} [options.hostWorld] 是否创建网页宿主隔离层（只有完整降临需要）。
 * @param {((name: any, fontSize: number) => boolean)|undefined} [options.measureName] 名字文本量度。
 * @param {string[]} options.names 12 个名字槽位的使徒名单。
 * @return {{dispose: () => void, layers: any, now: () => number, panDistance: () => number, panTargetX: () => number, panTargetY: () => number, refitShaderLayer: () => void, run: (render: (elapsed: number) => boolean) => void, setAdventMode: (advent: boolean) => void, setDesc: (text: string) => void}} 演出控制器。
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
    // 中日文名字整段换系统字体（原版这两支韩文字体缺字形，且一个 Text 只用一支字体）。
    name.dataset.cjk = adventTextNeedsCjkFont(supplied) ? '1' : '';
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
  const layers = buildAdventStage({
    assetRoot,
    document,
    hostWorld: options.hostWorld === true,
    nameNodes,
  });
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
    // 黑幕：贴图保持 prefab 比例居中，画布之外用四条同色延伸带补齐（边界在视口之外），
    // 贴图边缘的抗锯齿落在与它同色的延伸带上，所以接缝处不会再露出底面。
    const blackShaderLayout = plagueDoctorBlackShaderLayout({
      canvasScale: scale,
      dialWidth: plagueDoctorStageGeometry.clock.width,
      viewportHeight,
      viewportWidth,
    });
    for (let index = 0; index < layers.blackShaderBands.length; index++) {
      const element = layers.blackShaderBands[index];
      const box = blackShaderLayout.bands[index];
      // 贴图已经把某个方向盖满时，那一条就不用画。
      const visible = box && box.width > 0 && box.height > 0;
      element.style.setProperty('display', visible ? 'block' : 'none');
      if (!visible) continue;
      element.style.setProperty('left', `${box.left}px`);
      element.style.setProperty('top', `${box.top}px`);
      element.style.setProperty('width', `${box.width}px`);
      element.style.setProperty('height', `${box.height}px`);
    }
  };

  /** 镜头交接时整块画面横向平移的距离（视口宽的一半）。 */
  let panDistance = 0;
  /**
   * 镜头交接的目标位移。
   *
   * 原作的镜头是移向「本次转变的员工」，方向由那名员工在设施里的位置决定；网页没有
   * 员工，被聚焦的是页面上的显示名称输入框，所以目标位移取**这个输入框相对视口中心
   * 的真实偏移**——镜头朝输入框真正所在的方向移动，而不是固定某个方向。
   */
  let panTargetX = 0;
  /** 镜头交接目标位移的纵向分量。 */
  let panTargetY = 0;
  /**
   * 按页面里显示名称输入框的实际位置，更新镜头交接的目标位移。
   *
   * 找不到输入框时退回「向右侧移入」，保证演出仍然完整。
   *
   * @return {void}
   */
  const measurePanTarget = () => {
    const live = viewport();
    const input = document.querySelector?.('[data-account-display-name-input]');
    const rect = input?.getBoundingClientRect?.();
    if (rect && Number.isFinite(rect.left) && rect.width > 0) {
      // 位移量按视口尺寸收窄：原作镜头只走一间房的距离，输入框在页面上可能离
      // 视口中心很远，直接照搬会让这 1 秒的镜头看起来慢得不像话。
      const limitX = live.width / 4;
      const limitY = live.height / 4;
      panTargetX = Math.max(
        -limitX,
        Math.min(limitX, rect.left + rect.width / 2 - live.width / 2),
      );
      panTargetY = Math.max(
        -limitY,
        Math.min(limitY, rect.top + rect.height / 2 - live.height / 2),
      );
      panDistance = Math.max(1, Math.hypot(panTargetX, panTargetY));
      return;
    }
    panTargetX = live.width / 2;
    panTargetY = 0;
    panDistance = live.width / 2;
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
    // 表盘是 1920×1080 的固定构图：只按宽度适配时，超宽屏会把圆盘顶出屏幕、
    // 台词沉到底部之外；这里再取一次“整块构图完整装进 viewport”的上限。
    const fit = Math.min(live.width / 1920, live.height / 1080);
    const scale = Number.isFinite(fit) && fit > 0 ? Math.min(base, fit) : base;
    layers.canvas.style.setProperty(
      '--lobotomy-corp-advent-canvas-scale',
      String(scale),
    );
    // 台词钉在可见画面底部上方 12 画布像素：16:9 时等于 prefab 的 888，比例不对时
    // 也不会跟着画布往上飘。
    layers.desc.style.setProperty(
      'top',
      `${
        plagueDoctorDescTopForViewport({
          canvasScale: scale,
          viewportHeight: live.height,
        })
      }px`,
    );
    fitShaderLayer(live.width, live.height, scale);
    // 聚焦视图跟着画布一起缩放：它按画布尺寸摆放，中心对齐圆盘中心
    // （画布中心上方 105.5 画布像素）。
    if (layers.focus) {
      const box = plagueDoctorAdventFocusBox;
      const centerY = live.height / 2 - 105.5 * scale;
      layers.focus.style.setProperty('left', `${live.width / 2 - box.width * scale / 2}px`);
      layers.focus.style.setProperty('top', `${centerY - box.height * scale / 2}px`);
      layers.focus.style.setProperty('width', `${box.width * scale}px`);
      layers.focus.style.setProperty('height', `${box.height * scale}px`);
      layers.focusInput?.style?.setProperty('font-size', `${30 * scale}px`);
    }
    // 镜头交接的位移：整块画面朝显示名称输入框所在的方向平移，表示镜头从收容
    // 单元移到被聚焦的输入框（白夜本体不会消失，只是被移出画面）。
    measurePanTarget();
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
      // 延伸带属于黑幕：绑定阶段黑幕关掉时它们也必须一起收起，
      // 否则窄屏下画布之外的上下两边会被填成深色。
      for (let index = 0; index < layers.blackShaderBands.length; index++) {
        layers.blackShaderBands[index].style.setProperty(
          '--lobotomy-corp-advent-layer-alpha',
          advent ? '1' : '0',
        );
      }
    },
    /**
     * 把 Desc 文本按 Legacy Text Best Fit（20~50）铺进 1600×180 的矩形。
     *
     * @param {string} text 台词文本。
     * @return {void}
     */
    setDesc: (text) => {
      layers.desc.textContent = text;
      // 台词槽位是 NanumMyeongjo（韩文衬线，实测一个汉字都没有），中日文整段换系统衬线字体。
      layers.desc.dataset.cjk = adventTextNeedsCjkFont(text) ? '1' : '';
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
    /** @return {number} 镜头交接时整块画面横向平移的距离。 */
    panDistance: () => panDistance,
    /** @return {number} 镜头交接目标位移的横向分量。 */
    panTargetX: () => panTargetX,
    /** @return {number} 镜头交接目标位移的纵向分量。 */
    panTargetY: () => panTargetY,
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
 * 按原作调用链排出完整降临（Full Advent）的每一步。
 *
 * 全部时长取自 `WhiteNightSpace` 源码与 `AdventClockUI.prefab`：
 * 1. `PlagueDoctor.OnClockUIEnd()` 在 `StartAdventEvent()` 之后把镜头移向疫医
 *    （`_advent_cameraMove`，1 秒）。
 * 2. `PlagueDoctorAnim.OnStartAdvent()` 播放疫医自身 3 秒 Advent 演出，结束后
 *    `OnPlagueDoctorAdventEnd()` 调 `AdventClockUI.AdventTimerStart()`。
 * 3. 每名使徒：`ExecuteNextAdventTarget()` 用 1 秒把镜头聚焦到该员工，聚焦完成
 *    后 `StartAdventAnim()` 才触发 AdventLight 并开始 4 秒降临计时
 *    （`_advent_adventAnim`）。
 *
 * @param {number} count 使徒数量。
 * @return {{steps: Array<{at: number, index: number, kind: string, startedAt: number}>, totalMs: number}} 各步起始毫秒与总时长。
 */
export function plagueDoctorAdventSchedule(count) {
  const { adventAnimMs, cameraMoveMs, plagueDoctorAdventMs } =
    plagueDoctorAdventTimings;
  const apostleCount = Number.isFinite(count) && count > 0
    ? Math.floor(count)
    : 0;
  /** @type {Array<{at: number, index: number, kind: string, startedAt: number}>} */
  const steps = [{
    at: 0,
    index: -1,
    kind: 'plagueDoctorCamera',
    startedAt: 0,
  }];
  let cursor = cameraMoveMs;
  steps.push({
    at: cursor,
    index: -1,
    kind: 'plagueDoctorAdvent',
    startedAt: 0,
  });
  cursor += plagueDoctorAdventMs;
  for (let index = 0; index < apostleCount; index++) {
    steps.push({ at: cursor, index, kind: 'cameraFocus', startedAt: 0 });
    cursor += cameraMoveMs;
    steps.push({ at: cursor, index, kind: 'adventAnim', startedAt: 0 });
    cursor += adventAnimMs;
  }
  return { steps, totalMs: cursor };
}

/**
 * 播放第 12 名使徒完成后的完整降临（AdventClockUI.StartAdventEvent）。
 *
 * 演出先按 {@link plagueDoctorAdventSchedule} 走原作时序，再按
 * `OnEndAdventEffect` 结束。每名使徒的转化光效由 `AdventLight.js` 播放原始
 * `ApostleAdventLight.anim`，并且只在镜头聚焦完成后触发。
 *
 * @param {object} options 演出配置。
 * @param {string} options.assetRoot 资源根路径。
 * @param {any} [options.document] 宿主 document。
 * @param {string[]} [options.focusTexts] 每名使徒被聚焦时输入框里显示的文本（异想体用编号）。
 * @param {Record<string, string>|undefined} options.messages 当前语言文案。
 * @param {string[]} options.names 12 名使徒名字。
 * @param {(soundPath: string) => void} [options.playSound] 音效播放回调。
 * @param {() => void} [options.onAdventEnd] 逐名演出结束回调。
 * @return {{dispose: () => void, element: any, finished: Promise<void>}} 演出句柄。
 */
export function playPlagueDoctorAdvent(options) {
  const hostDocument = options.document ?? globalThis.document;
  const clock = createPlagueDoctorClock({
    assetRoot: options.assetRoot,
    document: options.document,
    hostWorld: true,
    names: options.names,
  });
  const { layers } = clock;
  const names = Array.isArray(options.names) ? options.names : [];
  const originalColor = whiteNightSimpleAdventOriginalColor;
  const adventColor = whiteNightSimpleAdventColor;
  const { adventAnimMs, adventMaxMs } = plagueDoctorAdventTimings;
  const schedule = plagueDoctorAdventSchedule(names.length);
  const steps = schedule.steps;
  const totalMs = Math.min(schedule.totalMs, adventMaxMs);
  layers.root.style.setProperty('--lobotomy-corp-advent-root-alpha', '1');
  layers.clock.style.setProperty('--lobotomy-corp-advent-clock-alpha', '1');
  clock.setAdventMode(true);
  // 宿主隔离：完整降临期间锁住网页滚动（保存原值，退出时精确恢复）。
  lockPlagueDoctorHostScroll(hostDocument);
  // 演出开始到第一次聚焦完成之间 Desc 是空的：原作里第一句台词要等镜头聚焦到
  // 第一名员工、AdventLight 开始 Run 的同一刻，才由 AdventTimer.Rate 淡入。
  clock.setDesc('');
  layers.desc.style.setProperty('--lobotomy-corp-advent-desc-alpha', '0');
  // 12 个名字在各自的绑定演出里已经揭示，完整降临只负责逐个变红。
  Array.from(layers.namesLayer.children ?? []).forEach(
    (/** @type {any} */ node) =>
      node.style.setProperty('--lobotomy-corp-advent-name-alpha', '1'),
  );
  let index = 0;
  /** @type {{index: number, kind: string, startedAt: number}|undefined} */
  let currentAdvent;
  /**
   * 聚焦视图（显示名称输入框）当前显示的使徒文本与本次淡入淡出的起点。
   *
   * `focusTexts[i]` 由事件层算好：使徒名；如果那次保存的是异想体，则是异想体编号。
   */
  const focusTexts = Array.isArray(options.focusTexts) ? options.focusTexts : [];
  let focusText = '';
  let focusTextStartedAt = -Infinity;
  let focusTextApplied = true;
  const entityHandoffStartAt = plagueDoctorAdventTimings.cameraMoveMs +
    plagueDoctorAdventTimings.plagueDoctorAdventMs;
  const entityHideAt = entityHandoffStartAt +
    plagueDoctorAdventFocusTimings.handoffMs;
  let finished = false;
  /** @type {() => void} */
  let resolveFinished = () => {};
  /** @type {Promise<void>} */
  const finishedPromise = new Promise((resolve) => {
    resolveFinished = () => resolve();
  });
  clock.run((elapsed) => {
    // plagueDoctorCamera / plagueDoctorAdvent 只承担原作前两段的时长：网页没有
    // 疫医所在的设施图层，这两步保持黑幕与过场 BGM，不另造视觉。
    while (index < steps.length && steps[index].at <= elapsed) {
      const step = steps[index++];
      step.startedAt = elapsed;
      if (step.kind === 'cameraFocus') {
        // ExecuteNextAdventTarget()：镜头开始移向这名员工，同时敲钟并换台词。
        // 镜头到位之前不启动 AdventLight，光效保持关闭。
        layers.adventLight.stop();
        // 镜头移动期间没有正在进行的降临动画：清掉 currentAdvent，Desc 的 alpha
        // 才不会被上一名使徒的 4 秒计时继续驱动（否则新台词会先整句亮起、
        // 等光球开始时再被清零，变成「字幕先出现又消失再淡入」）。
        currentAdvent = undefined;
        clock.setDesc(
          refineApostleDesc(options.messages, step.index + 1, names),
        );
        layers.desc.style.setProperty(
          '--lobotomy-corp-advent-desc-alpha',
          '0',
        );
        // ExecuteNextAdventTarget() 先敲钟，再让这名使徒 Escape()；Escape() 里的
        // MakeAdventSound() 会再放一首合唱与一句随机低语，两者是同一刻。
        options.playSound?.(plagueDoctorSoundPaths.bell);
        // 镜头这一刻聚焦到这名使徒：网页没有员工，于是聚焦到网页自己的
        // 「显示名称输入框」，并在钟声响起的同一刻把里面的文字换成这名使徒的
        // 名字（异想体则用编号），做一次淡出→换字→淡入。
        if (layers.focusInput) {
          focusText = focusTexts[step.index] ?? names[step.index] ?? '';
          focusTextStartedAt = elapsed;
          focusTextApplied = false;
        }
        // 第 12 名是叛徒：原作在 Escape() 之前就因 AposlteModel == null 返回，
        // 所以它只有钟声，没有合唱与低语。
        if (step.index !== plagueDoctorBetrayerIndex) {
          options.playSound?.(plagueDoctorSoundPaths.choir);
          const whispers = plagueDoctorSoundPaths.whispers;
          options.playSound?.(
            whispers[Math.floor(Math.random() * whispers.length)],
          );
        }
      } else if (step.kind === 'adventAnim') {
        // StartAdventAnim()：镜头已完成聚焦，此刻才 TurnOnAdventLight()，并开始
        // 4 秒降临计时；每次 Run 都从 `.anim` 第 0 帧重新开始。
        // 第 12 名是叛徒，原作不会为它生成使徒单位，TurnOnAdventLight() 抛出的
        // 空引用被吞掉，因此这一名只有计时与台词，没有 AdventLight。
        currentAdvent = step;
        if (step.index !== plagueDoctorBetrayerIndex) {
          layers.adventLight.run(elapsed);
        }
      } else if (step.kind === 'plagueDoctorCamera') {
        // PlagueDoctor.OnClockUIEnd()：镜头开始移向疫医的同一刻也敲一次钟
        // （`MakeSound("creature/deathangel/Lucifer_Bell0")`）。
        options.playSound?.(plagueDoctorSoundPaths.bell);
        // 同一刻开始播放收容单元里那具疫医实体：视频前 1 秒对应原作的镜头移动，
        // 之后才是 `PlagueDoctorAnim` 的 3 秒睁眼演出。
        const entity = layers.worldEntity;
        if (entity) {
          entity.hidden = false;
          try {
            entity.currentTime = 0;
          } catch {
            // 视频还没拿到 metadata 时设置 currentTime 会抛错，忽略即可。
          }
          const playback = entity.play?.();
          playback?.catch?.(() => {});
        }
      }
    }
    // 疫医变白夜只有一瞬间：`OnPlagueDoctorAdventEnd()` 同时在关疫医、开白夜，
    // 紧接着镜头就开始移向第一名使徒。这里用 `handoffMs` 把实体视频淡出、把聚焦
    // 视图淡入，表示镜头正在离开收容单元、对准被聚焦的对象。
    if (layers.focus) {
      const handoffRate = clamp(
        (elapsed - entityHandoffStartAt) /
          plagueDoctorAdventFocusTimings.handoffMs,
        0,
        1,
      );
      // 镜头移动：白夜本体平移出画面、输入框从另一侧移进来，两者始终不透明。
      layers.focus.style.setProperty(
        '--lobotomy-corp-advent-focus-alpha',
        elapsed >= entityHandoffStartAt ? '1' : '0',
      );
      const targetX = clock.panTargetX?.() ?? 0;
      const targetY = clock.panTargetY?.() ?? 0;
      layers.focus.style.setProperty(
        'transform',
        `translate(${Math.round(targetX * (1 - handoffRate))}px, ${
          Math.round(targetY * (1 - handoffRate))
        }px)`,
      );
      if (layers.worldEntity) {
        layers.worldEntity.style?.setProperty?.(
          'transform',
          `translate(${-Math.round(targetX * handoffRate)}px, ${
            -Math.round(targetY * handoffRate)
          }px)`,
        );
      }
      if (layers.focusInput) {
        const textElapsed = elapsed - focusTextStartedAt;
        const textAlpha = textElapsed <
            plagueDoctorAdventFocusTimings.textFadeOutMs
          ? 1 -
            clamp(
              textElapsed / plagueDoctorAdventFocusTimings.textFadeOutMs,
              0,
              1,
            )
          : clamp(
            (textElapsed - plagueDoctorAdventFocusTimings.textFadeOutMs) /
              plagueDoctorAdventFocusTimings.textFadeInMs,
            0,
            1,
          );
        if (
          !focusTextApplied &&
          textElapsed >= plagueDoctorAdventFocusTimings.textFadeOutMs
        ) {
          focusTextApplied = true;
          layers.focusInput.value = focusText;
        }
        layers.focusInput.style.setProperty(
          '--lobotomy-corp-advent-focus-text-alpha',
          String(textAlpha),
        );
        layers.focusInput.style.color = textAlpha >= 1
          ? ''
          : `color-mix(in srgb, var(--muted) ${
            (textAlpha * 100).toFixed(1)
          }%, transparent)`;
      }
    }
    if (
      layers.worldEntity &&
      !layers.worldEntity.hidden &&
      elapsed >= entityHideAt
    ) {
      layers.worldEntity.pause?.();
      layers.worldEntity.hidden = true;
    }
    // AdventLight 按 ApostleAdventLight.anim 的时间轴推进（UnscaledTime）。
    layers.adventLight.render(elapsed);
    if (currentAdvent) {
      const rate = clamp(
        (elapsed - currentAdvent.startedAt) / adventAnimMs,
        0,
        1,
      );
      const colorRate = Math.min(rate * 2, 1);
      const red = originalColor.red +
        (adventColor.red - originalColor.red) * colorRate;
      const green = originalColor.green +
        (adventColor.green - originalColor.green) * colorRate;
      const blue = originalColor.blue +
        (adventColor.blue - originalColor.blue) * colorRate;
      layers.namesLayer.children[currentAdvent.index]?.style.setProperty(
        '--lobotomy-corp-advent-name-color',
        toCssColor({ blue, green, red }),
      );
      layers.desc.style.setProperty(
        '--lobotomy-corp-advent-desc-alpha',
        // AdventClockUI.Update 里 Desc 的 alpha 直接取 AdventTimer.Rate，
        // 没有额外平滑曲线。
        String(rate),
      );
    }
    if (elapsed < totalMs || finished) return !finished;
    finished = true;
    options.onAdventEnd?.();
    clock.dispose();
    // world 层随 root 一起移除后，才能把网页还回去。
    unlockPlagueDoctorHostScroll(hostDocument);
    resolveFinished();
    return false;
  });
  return {
    dispose: () => {
      clock.dispose();
      unlockPlagueDoctorHostScroll(hostDocument);
    },
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
 * @param {(value: string) => string|undefined} [shared.submittedAbnormalityId] 输入本身是已录入异想体（编号或其别名）时返回 canonical 编号。
 * @param {() => Record<string, string>|undefined} shared.messages 当前语言文案。
 * @param {(info: {firstTime: boolean}) => void} shared.onTransformation 转变完成、应进入白夜时的回调。
 * @param {(amount: number) => void} shared.settleDanger 结算固定危急值。
 * @param {(value: string) => void} [shared.applyDisplayName] 转变后把显示名称改写为白夜。
 * @param {() => string|undefined} [shared.loginSession] 当前登录会话标识；变化表示用户重新登录。
 * @return {object} 疫医事件 API。
 */
export function createPlagueDoctorEvent(shared) {
  /** @type {{apostles: string[], loginSession?: string, recording: boolean, transformed: boolean}|undefined} */
  let state;
  let busy = false;
  let transforming = false;
  /** 本次页面里是否已经结算过疫医转变的固定危急值。 */
  let transformedOnThisPage = false;
  /** @type {{dispose: () => void}|undefined} */
  let activeClock;
  /** @type {any} 完整降临的专属 BGM（对应 BgmManager 的 UniqueBgm）。 */
  let adventBgm;

  /** 转盘演出期间要拦截的页面交互事件。 */
  const blockedInteractionEvents = ['click', 'mousedown', 'pointerdown', 'submit'];
  let blockingInteraction = false;

  /**
   * 在捕获阶段吞掉一次页面交互。
   *
   * @param {any} event 页面事件。
   * @return {void}
   */
  const blockInteraction = (event) => {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
  };

  /**
   * 开始拦截页面交互：转盘转动期间不允许用户继续点击网页。
   *
   * @return {void}
   */
  const startBlockingInteraction = () => {
    const document = globalThis.document;
    if (blockingInteraction || typeof document?.addEventListener !== 'function') {
      return;
    }
    blockingInteraction = true;
    blockedInteractionEvents.forEach((type) =>
      document.addEventListener(type, blockInteraction, true)
    );
  };

  /**
   * 解除页面交互拦截。
   *
   * @return {void}
   */
  const stopBlockingInteraction = () => {
    const document = globalThis.document;
    if (!blockingInteraction) return;
    blockingInteraction = false;
    blockedInteractionEvents.forEach((type) =>
      document.removeEventListener(type, blockInteraction, true)
    );
  };

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
    if (!state) return;
    const loginSession = shared.loginSession?.();
    if (typeof loginSession === 'string' && loginSession.length > 0) {
      state.loginSession = loginSession;
    }
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
    const loginSession = shared.loginSession?.();
    // 每次登录都会生成新的会话标识：标识变化即视为重新登录，已绑定的使徒必须清空。
    const savedSession = typeof saved?.loginSession === 'string'
      ? saved.loginSession
      : undefined;
    const relogged = typeof loginSession === 'string' && loginSession.length > 0 &&
      savedSession !== undefined && savedSession !== loginSession;
    state = {
      apostles: Array.isArray(saved?.apostles)
        ? (relogged
          ? []
          : saved.apostles.filter((/** @type {unknown} */ name) =>
              typeof name === 'string'
            )
            .slice(0, plagueDoctorApostleCount))
        : [],
      recording: saved?.recording === true,
      transformed: relogged ? false : saved?.transformed === true,
    };
    if (relogged) state.recording = false;
    persist();
  };
  restore();

  /** @return {string[]} 已绑定的使徒名字。 */
  const apostleNames = () => [...(state?.apostles ?? [])];
  /**
   * 完整降临聚焦每名使徒时，输入框里要显示的文字。
   *
   * 记录里存的就是那次保存的显示名称，因此聚焦时原样显示，不做任何异想体解析。
   *
   * @return {string[]} 每名使徒对应的文本。
   */
  const apostleFocusTexts = () =>
    [...(state?.apostles ?? [])];
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
   * @param {{firstTime: boolean}} info 本次转变是否为该会话的第一次完整降临。
   * @return {void}
   */
  const completeTransformation = (/** @type {{firstTime: boolean}} */ info) => {
    // 固定危急值在「本次页面里的第一次白夜登场」结算一次：刷新后重新提交疫医编号
    // 仍会补这一次结算，但同一页面里重复提交不会重复叠加。
    const shouldSettleDanger = !transformedOnThisPage;
    transformedOnThisPage = true;
    busy = false;
    transforming = false;
    activeClock = undefined;
    stopBlockingInteraction();
    // 白夜登场前先收掉疫医的过场 BGM，避免与白夜教堂音乐重叠。
    clearAdventBgm();
    if (state) {
      state.transformed = true;
      state.recording = false;
      persist();
    }
    if (shouldSettleDanger) {
      shared.settleDanger?.(plagueDoctorTransformationDanger);
    }
    shared.applyDisplayName?.(plagueDoctorWhiteNightId);
    shared.onTransformation?.(info);
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
      completeTransformation({ firstTime: false });
      return;
    }
    // `StartAdventEvent()` 先起 UniqueBgm，再开黑幕与镜头，所以 BGM 要早于演出脚本。
    adventBgm = playSound(plagueDoctorSoundPaths.advent);
    const clock = playPlagueDoctorAdvent({
      assetRoot: shared.assetRoot,
      document: globalThis.document,
      focusTexts: apostleFocusTexts(),
      messages: shared.messages?.(),
      names: apostleNames(),
      onAdventEnd: () => completeTransformation({ firstTime: true }),
      playSound,
    });
    activeClock = clock;
    startBlockingInteraction();
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
    // 使徒名字就是这次保存的显示名称本身；异想体相关输入已经在 claim 里排除，
    // 名字不再经过异想体解析。
    const name = value;
    const index = current.apostles.length;
    current.apostles.push(name);
    persist();
    busy = true;
    startBlockingInteraction();
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
          stopBlockingInteraction();
        }
      });
      return;
    }
    if (current.apostles.length >= plagueDoctorApostleCount) {
      startTransformation();
    } else {
      busy = false;
      stopBlockingInteraction();
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
    // 异想体编号（及其别名）归各自的异想体彩蛋：记录期间它们一律不计入使徒，也不播
    // 绑定动画，否则该异想体自己的彩蛋会和疫医彩蛋互相抢同一次保存。
    const submittedId = shared.submittedAbnormalityId?.(value);
    if (submittedId) {
      // 疫医自己的编号已经由上面的分支处理；回到这里只说明记录期间又提交了一次，
      // 本事件自行吞掉，不让它落到普通异想体路径去结算危急值。
      return submittedId === plagueDoctorAbnormalityId;
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
    stopBlockingInteraction();
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
