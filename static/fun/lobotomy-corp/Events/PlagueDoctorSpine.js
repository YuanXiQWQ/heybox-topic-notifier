/**
 * @file 用 Spine 运行时播放疫医在收容单元里转变成白夜的那段「睁眼」演出。
 *
 * 原作里这段画面始终是同一副骨架在播动画，镜头也是真的相机，所以这里直接加载解包
 * 工程里的骨骼数据实时渲染，而不是逐帧预渲染成视频。演出涉及的事实全部来自解包源码
 * 与预制体：
 *
 * - `WhiteNightSpace.PlagueDoctor.OnClockUIEnd()`：`GenDeathAngel()` 之后
 *   `AnimScript.transform.parent.gameObject.SetActive(true)`（Animator 复位，
 *   `0_Default_` 从头播），随后 `CameraMover.CameraMoveEvent(_eye1.transform.position -
 *   (0.2, 0.9), 4f, 1f)` 并敲钟。
 * - `WhiteNightSpace.PlagueDoctorAnim.OnStartAdvent()`：镜头到位后起 3 秒
 *   `UnscaledTimer`；`Update()` 里 `Rate >= 0.2` 打开 `_eye1`、`Rate >= 0.6` 打开
 *   `_eye2`；计时结束调 `PlagueDoctor.OnPlagueDoctorAdventEnd()`。
 * - `WhiteNightSpace.PlagueDoctor.OnPlagueDoctorAdventEnd()`：关掉疫医、打开
 *   `_angel.Unit`（`DeathAngelAnim.prefab` 的 `WhiteNight` 子物体，默认动画
 *   `0_Default_inside`）——镜头此时还停在收容单元，白夜只是「一瞬间」出现。
 * - `WhiteNightSpace.PlagueDoctorSkeletonAnim.SetState(12)`：开 WING_1~4、RING、
 *   ANGEL，关 HAT、COAT、HEAD_BEAK，并把 changeData 里的翅膀 slot 染成白色。
 */

import {
  loadSpineRuntime,
  spineAssetPaths,
  spineModuleRoot,
  spineRuntimePath,
  waitForSpineAssets,
} from './SpineRuntime.js';
import {
  whiteNightSpineAssetDirectory,
  whiteNightSpineAtlasFile,
  whiteNightSpineSkeletonFile,
} from './WhiteNightSpine.js';

/** 疫医骨架数据在 `Assets` 下的相对目录。 */
export const plagueDoctorSpineAssetDirectory =
  'Resources/spinedata/plaguedoctor';

/** 骨架 JSON 文件名（`TextAsset/skeleton_15.json`）。 */
export const plagueDoctorSpineSkeletonFile = 'skeleton_15.json';

/** 骨架 Atlas 文件名（`TextAsset/skeleton.atlas_31.txt`）。 */
export const plagueDoctorSpineAtlasFile = 'skeleton.atlas.txt';

/** 骨架 Atlas 的分页贴图文件名，顺序与 Atlas 里的页名一致。 */
export const plagueDoctorSpinePageFiles = Object.freeze([
  'skeleton.png',
  'skeleton2.png',
]);

/**
 * 疫医一直在播的动画名。
 *
 * `PlagueDoctorAnim.prefab` 里 `PlagueDoc` 的 Animator 用
 * `AnimatorController/skeleton_Controller_2.controller`，默认状态 `0_Default_`
 * （`m_Motion` 指向 `AnimationClip/0_Default_.anim`，spine-unity 按名字映射回骨骼里
 * 的同名动画）。
 */
export const plagueDoctorSpineAnimation = '0_Default_';

/**
 * 换场后播放的白夜动画名。
 *
 * `DeathAngelAnim.prefab` 里 `WhiteNight` 子物体的 Animator 用
 * `AnimatorController/skeleton_Controller_3.controller`，默认状态 `0_Default_inside`。
 */
export const plagueDoctorAdventWhiteNightAnimation = '0_Default_inside';

/** Spine WebGL 运行时相对彩蛋模块根路径的位置。 */
export const plagueDoctorSpineRuntimePath = spineRuntimePath;

/**
 * 疫医实体的骨骼缩放。
 *
 * `PlagueDoctorAnim.prefab` 里 `PlagueDoc` 的 localScale 为 0.9；`SkeletonDataAsset`
 * 的 scale 与 `ExportPlagueDoctorAdvent` 的 `pdScale` 一致，为 0.01（该值由参考录像
 * 校准）。两者相乘即骨架世界单位到镜头单位的换算。
 */
export const plagueDoctorSpineRig = Object.freeze({
  positionX: 0,
  positionY: -0.5,
  scale: 0.9,
  skeletonScale: 0.01,
});

/**
 * 白夜本体的骨骼缩放。
 *
 * `DeathAngelAnim.prefab` 里承载 Spine 渲染器的 `WhiteNight` 子物体局部位置
 * (0.06, -0.59)、局部缩放 0.85，骨骼数据的 scale 同样是 0.01。
 */
export const plagueDoctorAdventWhiteNightRig = Object.freeze({
  positionX: 0.06,
  positionY: -0.59,
  scale: 0.85,
  skeletonScale: 0.01,
});

/**
 * 疫医演出的镜头。
 *
 * `CameraMover.CameraMoveEvent(position, 4f, 1f)`：正交尺寸 4、移动 1 秒，目标是
 * `_eye1.transform.position - (0.2, 0.9)`。演出画面按游戏画布 1920×1080 输出，
 * 因此竖直方向 2×4 世界单位对应 1080 像素。
 */
export const plagueDoctorAdventCamera = Object.freeze({
  orthographicSize: 4,
  focusOffsetX: -0.2,
  focusOffsetY: -0.9,
  referenceWidth: 1920,
  referenceHeight: 1080,
});

/**
 * 睁眼演出的时序（秒）。
 *
 * 镜头移动的 1 秒里 `_adventEffectTimer` 还没开始，所以两个阈值都相对镜头到位之后的
 * 3 秒计时：`PlagueDoctorAnim.Update()` 在 `Rate >= 0.2` 打开 `_eye1`、
 * `Rate >= 0.6` 打开 `_eye2`；计时结束时 `OnPlagueDoctorAdventEnd()` 把疫医换成白夜。
 */
export const plagueDoctorAdventEyeTimings = Object.freeze({
  cameraMoveSeconds: 1,
  adventSeconds: 3,
  firstEyeRate: 0.2,
  secondEyeRate: 0.6,
});

/** 白夜本体登场的时刻（秒）：镜头到位后满 3 秒。 */
export const plagueDoctorAdventWhiteNightSeconds =
  plagueDoctorAdventEyeTimings.cameraMoveSeconds +
  plagueDoctorAdventEyeTimings.adventSeconds;

/**
 * `SetState(12)` 之后不再绘制的 slot。
 *
 * `PlagueDoctorAnim.prefab` 的 `PlagueDoctorSkeletonAnim.activateParts` 里
 * HAT（`23_Hat`、`10_HatShadow`）、COAT（`19_Coat`、`9_CoatShadow`、`21_Fur`）、
 * HEAD_BEAK（`22_HeadBeak`）在 `SetState(12)` 的最后两步被 `SetState(false)` 关掉；
 * 每个部件渲染器覆盖的 slot 取自骨架里相邻的同名 slot（`Coat_back`/`Coat`、
 * `Hat_back`/`Hat_shadow`/`Hat`、`head`/`eye2`/`beak`/`eye1`）与 `changeData` 的
 * `slotList`。
 */
export const plagueDoctorSpineHiddenSlots = Object.freeze([
  'Coat',
  'Coat_back',
  'Fur',
  'Hat',
  'Hat_back',
  'Hat_shadow',
  'head',
  'eye2',
  'beak',
  'eye1',
]);

/**
 * 最终形态里染成白色的 slot。
 *
 * `SetState(12)` 在第 7 步对 `changeData` 里全部 WING 区域的 slotList 调
 * `ExecuteData`，`InitData()` 把 `alterColor` 设为 `Color.white`，因此这些 slot 的
 * attachment 颜色被写成白色。
 */
export const plagueDoctorSpineWingSlots = Object.freeze([
  'Wing_back_1',
  'Wing_back_2',
  'Wing_back_3',
  'Wing_back_4',
  'Wing_front_1',
  'Wing_front_2',
  'Wing_front_3',
  'Wing_front_4',
  'Wing_default_back_2',
  'Wing_default_back_3',
  'Wing_default_back_4',
  'Wing_default_back_f_1',
  'Wing_default_front_0_1',
  'Wing_default_front_0_2',
  'Wing_default_front_0_3',
  'Wing_default_front_0_4',
  'Wing_default_front_1_1',
  'Wing_default_front_1_2',
  'Wing_default_front_1_3',
]);

/**
 * 眼睛相关的 slot。
 *
 * - `Baby_eye_open`（slot 19）由部件 `16_Angel_EyeHalf1` 渲染，该部件在 prefab 里
 *   `m_IsActive: 0` 且不在任何 `activateParts` 列表里，原作永远不会打开它：睁眼的
 *   第一半用的是 `_eye1` 那个独立精灵。
 * - `Baby_eye_open_2`（slot 20）由 `_eye2`（`17_Angel_EyeHalf2`）渲染，`Rate >= 0.6`
 *   时 `SetActive(true)`。
 * - `Baby_eye_closed`（slot 21）属于 ANGEL 部件，`SetState(12)` 之后一直绘制。
 * - `_eye1` 精灵挂在 z = -0.17 的跟骨骼上，与部件 17 同层，因此夹在 slot 19 与 20
 *   之间绘制。
 */
export const plagueDoctorSpineEyeSlots = Object.freeze({
  firstHalf: 'Baby_eye_open',
  secondHalf: 'Baby_eye_open_2',
  closed: 'Baby_eye_closed',
  spriteSplitIndex: 20,
});

/**
 * `_eye1` 那个独立精灵。
 *
 * 它是 `PlagueDoctorAnim.prefab` 里 `16_Angel_EyeHalf1Follower` 的 `New Sprite`
 * 子物体：`BoneFollower` 跟踪 `bone136`、跟随骨骼旋转；精灵贴图是
 * `Sprite/Baby_eye_open.asset`，它引用 Atlas 第 2 页 `skeleton2.png`（`m_Rect` 与
 * `m_Pivot` 见下），子物体局部位置与旋转取自 prefab 的 Transform。
 */
export const plagueDoctorSpineEyeSprite = Object.freeze({
  boneName: 'bone136',
  // Atlas 里的页名就是文件名本身（含扩展名），`TextureAtlasPage.name` 也照抄这一行。
  pageName: 'skeleton2.png',
  rectX: 105.02675,
  rectY: 469.0761,
  rectWidth: 65.89713,
  rectHeight: 28.887594,
  pixelsToUnits: 100,
  pivotX: 0.47002426,
  pivotY: 0.5512363,
  localX: -0.009,
  localY: 0.077,
  localAngle: -62.746834,
});

/** 渲染循环允许的最大单帧步进，避免后台标签页恢复时演出跳帧。 */
const plagueDoctorSpineMaxFrameStepSeconds = 0.1;

/**
 * 计算骨架资源在彩蛋资源路由下的路径。
 *
 * 两个骨架共用同一个 `AssetManager`（前缀只到 `Assets/`），因此这里的相对路径必须
 * 带上 `spinedata/<骨架>` 一级，分页贴图才会被拼到各自的目录下。
 *
 * @param {string} moduleRoot 彩蛋模块根路径。
 * @return {{assetDirectory: string, atlasPath: string, pathPrefix: string, skeletonPath: string}} 资源目录、目录前缀与文件相对路径。
 */
export function plagueDoctorSpineAssetPaths(moduleRoot) {
  const paths = spineAssetPaths(
    plagueDoctorSpineAssetDirectory,
    plagueDoctorSpineSkeletonFile,
    plagueDoctorSpineAtlasFile,
    moduleRoot,
  );
  const relativeDirectory = paths.assetDirectory.replace(/^Assets\//u, '');
  return {
    assetDirectory: paths.assetDirectory,
    atlasPath: `${relativeDirectory}/${plagueDoctorSpineAtlasFile}`,
    pathPrefix: `${moduleRoot}/Assets/`,
    skeletonPath: `${relativeDirectory}/${plagueDoctorSpineSkeletonFile}`,
  };
}

/**
 * 计算白夜骨架相对同一个 `AssetManager` 前缀的路径。
 *
 * @param {string} moduleRoot 彩蛋模块根路径。
 * @return {{atlasPath: string, skeletonPath: string}} 白夜骨架的相对路径。
 */
export function plagueDoctorAdventWhiteNightAssetPaths(moduleRoot) {
  const paths = spineAssetPaths(
    whiteNightSpineAssetDirectory,
    whiteNightSpineSkeletonFile,
    whiteNightSpineAtlasFile,
    moduleRoot,
  );
  const relativeDirectory = paths.assetDirectory.replace(/^Assets\//u, '');
  return {
    atlasPath: `${relativeDirectory}/${whiteNightSpineAtlasFile}`,
    skeletonPath: `${relativeDirectory}/${whiteNightSpineSkeletonFile}`,
  };
}

/**
 * 计算 `_adventEffectTimer` 的进度。
 *
 * @param {number} elapsedSeconds 演出开始后的秒数。
 * @param {object} [timings] 时序参数。
 * @return {number} 0~1 的进度；镜头还没到位时为 0。
 */
export function plagueDoctorAdventEyeRate(
  elapsedSeconds,
  timings = plagueDoctorAdventEyeTimings,
) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  const rate = (elapsedSeconds - timings.cameraMoveSeconds) / timings.adventSeconds;
  return Math.min(1, Math.max(0, rate));
}

/**
 * 计算某一时刻两半眼睛是否已经出现。
 *
 * @param {number} elapsedSeconds 演出开始后的秒数。
 * @param {object} [timings] 时序参数。
 * @return {{firstHalf: boolean, rate: number, secondHalf: boolean}} 该时刻的睁眼状态。
 */
export function plagueDoctorAdventEyeState(
  elapsedSeconds,
  timings = plagueDoctorAdventEyeTimings,
) {
  const rate = plagueDoctorAdventEyeRate(elapsedSeconds, timings);
  return {
    firstHalf: rate >= timings.firstEyeRate,
    rate,
    secondHalf: rate >= timings.secondEyeRate,
  };
}

/**
 * 计算镜头目标位置。
 *
 * `OnClockUIEnd()` 里 `position = _eye1.transform.position` 再减去 (0.2, 0.9)；
 * `_eye1` 由 `BoneFollower` 跟踪 `bone136`，所以这里传入骨骼的世界坐标。
 *
 * @param {number} boneX `bone136` 的世界 X（镜头单位）。
 * @param {number} boneY `bone136` 的世界 Y（镜头单位）。
 * @param {object} [camera] 镜头参数。
 * @return {{x: number, y: number}} 镜头目标位置。
 */
export function plagueDoctorAdventCameraTarget(
  boneX,
  boneY,
  camera = plagueDoctorAdventCamera,
) {
  return {
    x: boneX + camera.focusOffsetX,
    y: boneY + camera.focusOffsetY,
  };
}

/**
 * 计算 `_eye1` 精灵的摆放。
 *
 * `BoneFollower` 把跟骨骼的位置与旋转写到精灵的父物体上（`skeletonTransformIsParent`
 * 为真时用局部坐标），精灵本身再带一个局部位置与旋转，因此最终位置是「骨骼世界位置 +
 * 按骨骼世界旋转过的局部偏移」，角度是「骨骼世界旋转 + 局部旋转」。
 *
 * @param {number} boneX `bone136` 的世界 X（镜头单位）。
 * @param {number} boneY `bone136` 的世界 Y（镜头单位）。
 * @param {number} boneRotation `bone136` 的世界旋转（角度）。
 * @param {object} [sprite] 精灵参数。
 * @param {number} [rigScale] 骨架根缩放（与骨骼世界坐标同一套换算）。
 * @return {{angle: number, height: number, pivotX: number, pivotY: number, width: number, x: number, y: number}} 精灵四边形的尺寸、轴心与轴心所在位置。
 */
export function plagueDoctorAdventEyeSpritePlacement(
  boneX,
  boneY,
  boneRotation,
  sprite = plagueDoctorSpineEyeSprite,
  rigScale = plagueDoctorSpineRig.scale,
) {
  const width = sprite.rectWidth / sprite.pixelsToUnits * rigScale;
  const height = sprite.rectHeight / sprite.pixelsToUnits * rigScale;
  const radians = boneRotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const localX = sprite.localX * rigScale;
  const localY = sprite.localY * rigScale;
  return {
    angle: boneRotation + sprite.localAngle,
    height,
    pivotX: sprite.pivotX * width,
    pivotY: sprite.pivotY * height,
    width,
    x: boneX + cosine * localX - sine * localY,
    y: boneY + sine * localX + cosine * localY,
  };
}

/**
 * 计算 `_eye1` 精灵在 Atlas 页面里的 UV。
 *
 * 3.6 的 `TextureAtlas` 直接按 `xy / 页尺寸` 取 v，而 `GLTexture` 上传时不做垂直翻转，
 * 也就是说 v 从页面顶部向下增长。Unity 的 sprite `m_Rect.y` 是自下而上，要先换成页面
 * 里自上而下的位置再算 UV；换成不换算的直接取用后，眼睛区域的色差会从 3.0 涨到 5.1。
 *
 * @param {number} pageWidth 页面宽度（像素）。
 * @param {number} pageHeight 页面高度（像素）。
 * @param {object} [sprite] 精灵参数。
 * @return {{u1: number, u2: number, vBottom: number, vTop: number}|undefined} 四边形四角的 UV；参数无效时返回 undefined。
 */
export function plagueDoctorAdventEyeSpriteUv(
  pageWidth,
  pageHeight,
  sprite = plagueDoctorSpineEyeSprite,
) {
  if (
    ![pageWidth, pageHeight, sprite.rectX, sprite.rectY, sprite.rectWidth,
      sprite.rectHeight].every((value) => Number.isFinite(value)) ||
    !(pageWidth > 0) || !(pageHeight > 0)
  ) {
    return undefined;
  }
  const top = pageHeight - sprite.rectY - sprite.rectHeight;
  return {
    u1: sprite.rectX / pageWidth,
    u2: (sprite.rectX + sprite.rectWidth) / pageWidth,
    vBottom: (top + sprite.rectHeight) / pageHeight,
    vTop: top / pageHeight,
  };
}

/**
 * 创建疫医转变演出的 Spine 舞台。
 *
 * 返回 undefined 表示宿主不支持 WebGL 或缺少 DOM；返回的舞台会异步加载运行时与两副
 * 骨架，`ready` 兑现后才会真正开始演出。
 *
 * @param {object} options 舞台配置。
 * @param {Document} [options.document] 当前文档。
 * @param {object} [options.globalObject] 全局对象。
 * @param {string} [options.assetRoot] `Assets` 目录的公开路径。
 * @param {string} [options.moduleRoot] 彩蛋模块根路径。
 * @return {{canvas: object, currentAnimation: string|undefined, ready: Promise<boolean>, isReady: () => boolean, play: () => boolean, resize: () => void, stop: () => void, dispose: () => void}|undefined} 舞台控制器。
 */
export function createPlagueDoctorSpineStage(options) {
  const {document, globalObject} = options ?? {};
  if (!document?.createElement || !globalObject) return undefined;
  const hostDocument = document;
  const hostGlobal = globalObject;
  const moduleRoot = options.moduleRoot ?? spineModuleRoot(
    options.assetRoot ?? '',
  );
  const plagueDoctorPaths = plagueDoctorSpineAssetPaths(moduleRoot);
  const whiteNightPaths = plagueDoctorAdventWhiteNightAssetPaths(moduleRoot);
  const runtimeUrl = `${moduleRoot}/${plagueDoctorSpineRuntimePath}`;
  const canvas = hostDocument.createElement('canvas');
  canvas.className = 'lobotomy-corp-plague-doctor-advent-spine';
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
  let elapsedSeconds = 0;
  /**
   * `play()` 的调用时刻（秒，宿主时间基准）。
   *
   * 骨架要等运行时、骨架 JSON、Atlas 与分页贴图都加载完才能画，而网页在第一个钟声
   * 响起时就调 `play()`——那时通常还没就绪。这里记下请求时刻，就绪后按「已经过去的
   * 时间」接着演，演出相位仍与网页的时钟对齐。
   */
  let playRequestedAt;
  let runtime;
  let assetManager;
  let sceneRenderer;
  let currentAnimation;
  let plagueDoctor;
  let whiteNight;
  let whiteNightStarted = false;
  let cameraTarget;
  let eyeTexture;

  /** @return {number} 宿主时间（秒）。 */
  const hostSeconds = () =>
    (hostGlobal.performance?.now?.() ?? Date.now()) / 1000;

  /**
   * 按画布尺寸同步像素与相机映射。
   *
   * 原作镜头是正交尺寸 4 的 16:9 画面，竖直方向 2×4 世界单位对应整幅画布高度，
   * 横向范围随画布比例展开。
   */
  const resize = () => {
    const width = Math.max(1, Math.round(
        canvas.clientWidth || plagueDoctorAdventCamera.referenceWidth,
    ));
    const height = Math.max(1, Math.round(
        canvas.clientHeight || plagueDoctorAdventCamera.referenceHeight,
    ));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (!sceneRenderer) return;
    sceneRenderer.resize(runtime.webgl.ResizeMode.Expand);
    sceneRenderer.camera.zoom =
      2 * plagueDoctorAdventCamera.orthographicSize / height;
    if (cameraTarget) {
      sceneRenderer.camera.position.x = cameraTarget.x;
      sceneRenderer.camera.position.y = cameraTarget.y;
    }
    sceneRenderer.camera.update();
  };

  /**
   * 绘制一帧画面。
   */
  const render = () => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!sceneRenderer || !plagueDoctor) return;
    sceneRenderer.begin();
    if (!whiteNightStarted) {
      // `_eye1` 精灵夹在 slot 19 与 20 之间，因此骨架分两段画。
      sceneRenderer.drawSkeleton(
          plagueDoctor.skeleton,
          true,
          0,
          plagueDoctorSpineEyeSlots.spriteSplitIndex,
      );
      drawEyeSprite();
      sceneRenderer.drawSkeleton(
          plagueDoctor.skeleton,
          true,
          plagueDoctorSpineEyeSlots.spriteSplitIndex,
          -1,
      );
    } else if (whiteNight) {
      sceneRenderer.drawSkeleton(whiteNight.skeleton, true);
    }
    sceneRenderer.end();
  };

  /**
   * 绘制 `_eye1` 精灵。
   *
   * 精灵在 prefab 里是带旋转的四边形，而运行时的 `drawTextureRotated` 会把整张贴图按
   * 它自己的 UV 约定贴上去，无法只取页面里的一块矩形，所以这里按 `_eye1` 的轴心、角度
   * 与 UV 自己拼四边形。贴图就是骨架所在的 Atlas 页面，混合方式也与骨架一致。
   */
  const drawEyeSprite = () => {
    if (!eyeTexture || !plagueDoctor.eyeVisible || !plagueDoctor.eyeUv) return;
    const placement = plagueDoctor.eyePlacement;
    if (!placement) return;
    const quad = plagueDoctor.eyeQuad;
    const uv = plagueDoctor.eyeUv;
    const radians = placement.angle * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const corners = [
      [-placement.pivotX, -placement.pivotY, uv.u1, uv.vBottom],
      [placement.width - placement.pivotX, -placement.pivotY, uv.u2, uv.vBottom],
      [placement.width - placement.pivotX, placement.height - placement.pivotY,
        uv.u2, uv.vTop],
      [-placement.pivotX, placement.height - placement.pivotY, uv.u1, uv.vTop],
    ];
    for (let index = 0; index < corners.length; index++) {
      const [localX, localY, u, v] = corners[index];
      const offset = index * 8;
      quad[offset] = placement.x + cosine * localX - sine * localY;
      quad[offset + 1] = placement.y + sine * localX + cosine * localY;
      quad[offset + 2] = 1;
      quad[offset + 3] = 1;
      quad[offset + 4] = 1;
      quad[offset + 5] = 1;
      quad[offset + 6] = u;
      quad[offset + 7] = v;
    }
    // 与骨架共用同一张页面贴图，混合方式也保持同一套（预乘 alpha），
    // 这样精灵与骨架在画布上的合成语义一致。
    sceneRenderer.batcher.setBlendMode(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    sceneRenderer.batcher.draw(
        eyeTexture,
        quad,
        sceneRenderer.QUAD_TRIANGLES,
    );
  };

  /**
   * 按 `SetState(12)` 的结果摆放骨架。
   *
   * 动画的 slot 轨道每帧都会写回附件，所以形态覆盖必须放在推进之后、绘制之前。
   *
   * @param {object} skeleton 疫医骨架。
   * @param {number} elapsed 演出开始后的秒数。
   */
  const applyPose = (skeleton, elapsed) => {
    for (const name of plagueDoctorSpineHiddenSlots) {
      const slot = skeleton.findSlot(name);
      if (slot) slot.setAttachment(null);
    }
    for (const name of plagueDoctorSpineWingSlots) {
      const slot = skeleton.findSlot(name);
      const attachment = slot?.getAttachment?.();
      attachment?.color?.set(1, 1, 1, 1);
    }
    const eyes = plagueDoctorAdventEyeState(elapsed);
    // 部件 16 在原作里从不激活，睁眼的第一半由精灵负责。
    const firstHalf = skeleton.findSlot(plagueDoctorSpineEyeSlots.firstHalf);
    firstHalf?.setAttachment(null);
    const secondHalf = skeleton.findSlot(plagueDoctorSpineEyeSlots.secondHalf);
    if (secondHalf) {
      secondHalf.setAttachment(
          eyes.secondHalf
            ? skeleton.getAttachment(
                secondHalf.data.index,
                plagueDoctorSpineEyeSlots.secondHalf,
            )
            : null,
      );
    }
    plagueDoctor.eyeVisible = eyes.firstHalf;
    plagueDoctor.eyePlacement = plagueDoctor.eyeVisible
      ? plagueDoctorAdventEyeSpritePlacement(
          plagueDoctor.bone.worldX,
          plagueDoctor.bone.worldY,
          // `BoneFollower.followBoneRotation` 取的是骨骼的**世界**旋转，不是局部旋转；
          // bone136 挂在有旋转的父骨骼下，用局部旋转会让精灵整整歪 90°。
          plagueDoctor.bone.getWorldRotationX(),
      )
      : undefined;
  };

  /**
   * 切换到白夜本体。
   *
   * `OnPlagueDoctorAdventEnd()` 关掉疫医、打开白夜单位；白夜单位此前被
   * `SetActive(false)`，启用时 Animator 复位，`0_Default_inside` 从第 0 帧开始。
   */
  const startWhiteNight = () => {
    whiteNightStarted = true;
    if (!whiteNight) return;
    whiteNight.animationState.setAnimation(
        0,
        plagueDoctorAdventWhiteNightAnimation,
        true,
    );
    whiteNight.animationState.apply(whiteNight.skeleton);
    whiteNight.skeleton.updateWorldTransform();
    currentAnimation = plagueDoctorAdventWhiteNightAnimation;
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
          plagueDoctorSpineMaxFrameStepSeconds,
          Math.max(0, seconds - lastTimestamp),
        );
    lastTimestamp = seconds;
    elapsedSeconds += step;
    if (!whiteNightStarted &&
        elapsedSeconds >= plagueDoctorAdventWhiteNightSeconds) {
      // 换场那一帧白夜刚从 SetActive(true) 醒来，动画时间是 0，不再往前推。
      startWhiteNight();
    } else if (whiteNightStarted) {
      whiteNight?.animationState.update(step);
      if (whiteNight) {
        whiteNight.animationState.apply(whiteNight.skeleton);
        whiteNight.skeleton.updateWorldTransform();
      }
    } else if (plagueDoctor) {
      plagueDoctor.animationState.update(step);
      plagueDoctor.animationState.apply(plagueDoctor.skeleton);
      plagueDoctor.skeleton.updateWorldTransform();
      applyPose(plagueDoctor.skeleton, elapsedSeconds);
    }
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
   * 建好一副骨架的渲染状态。
   *
   * `SkeletonDataAsset` 的 scale 走的是 spine-unity 的 data scale（`SkeletonJson` 在
   * 读取时把骨骼位移与附件尺寸一起乘上去），3.6 的 `SkeletonJson.scale` 就是同一件事；
   * 预制体的局部缩放也一起折进去，画出来的尺寸才与游戏一致。
   *
   * @param {object} spine Spine 运行时命名空间。
   * @param {string} skeletonJson 骨架 JSON 文本。
   * @param {object} atlas 骨架 Atlas。
   * @param {object} rig 骨骼根的局部变换与缩放。
   * @param {string} animation 初始动画名。
   * @return {{animationState: object, bone: object|undefined, skeleton: object}} 骨架渲染状态。
   */
  const createSkeleton = (spine, skeletonJson, atlas, rig, animation) => {
    const json = new spine.SkeletonJson(
        new spine.AtlasAttachmentLoader(atlas),
    );
    json.scale = rig.skeletonScale * rig.scale;
    const skeletonData = json.readSkeletonData(skeletonJson);
    const skeleton = new spine.Skeleton(skeletonData);
    // `Skeleton.x/y` 会加在根骨骼的世界坐标上，等价于预制体 `PlagueDoc` 的局部位置。
    skeleton.x = rig.positionX;
    skeleton.y = rig.positionY;
    const animationState = new spine.AnimationState(
        new spine.AnimationStateData(skeletonData),
    );
    animationState.setAnimation(0, animation, true);
    animationState.apply(skeleton);
    skeleton.updateWorldTransform();
    return {
      animationState,
      bone: skeleton.findBone(plagueDoctorSpineEyeSprite.boneName) ?? undefined,
      skeleton,
    };
  };

  /**
   * 加载运行时与两副骨架，随后等待 `play()`。
   *
   * @return {Promise<boolean>} 舞台就绪时兑现 true。
   */
  const start = async () => {
    runtime = await loadSpineRuntime({
      document: hostDocument,
      globalObject: hostGlobal,
      path: runtimeUrl,
    });
    if (!runtime?.webgl || disposed) return false;
    assetManager = new runtime.webgl.AssetManager(
        gl,
        plagueDoctorPaths.pathPrefix,
    );
    assetManager.loadText(plagueDoctorPaths.skeletonPath);
    assetManager.loadTextureAtlas(plagueDoctorPaths.atlasPath);
    assetManager.loadText(whiteNightPaths.skeletonPath);
    assetManager.loadTextureAtlas(whiteNightPaths.atlasPath);
    await waitForSpineAssets(assetManager, hostGlobal, () => disposed);
    if (disposed) return false;
    if (assetManager.hasErrors()) {
      throw new Error(
          `plague doctor spine assets failed to load: ${
              JSON.stringify(assetManager.getErrors())}`,
      );
    }
    // `AssetManager.get` 同样会补目录前缀，这里传与 load 一致的相对路径。
    const plagueDoctorAtlas = assetManager.get(plagueDoctorPaths.atlasPath);
    plagueDoctor = createSkeleton(
        runtime,
        JSON.parse(assetManager.get(plagueDoctorPaths.skeletonPath)),
        plagueDoctorAtlas,
        plagueDoctorSpineRig,
        plagueDoctorSpineAnimation,
    );
    if (!plagueDoctor.bone) {
      throw new Error(
          `plague doctor spine bone missing: ${
              plagueDoctorSpineEyeSprite.boneName}`,
      );
    }
    // 镜头目标在 `OnClockUIEnd()` 里取一次，之后不再跟随骨骼。
    cameraTarget = plagueDoctorAdventCameraTarget(
        plagueDoctor.bone.worldX,
        plagueDoctor.bone.worldY,
    );
    const whiteNightAtlas = assetManager.get(whiteNightPaths.atlasPath);
    whiteNight = createSkeleton(
        runtime,
        JSON.parse(assetManager.get(whiteNightPaths.skeletonPath)),
        whiteNightAtlas,
        plagueDoctorAdventWhiteNightRig,
        plagueDoctorAdventWhiteNightAnimation,
    );
    sceneRenderer = new runtime.webgl.SceneRenderer(canvas, gl, false);
    const eyePage = plagueDoctorAtlas.pages.find?.(
        (page) => page.name === plagueDoctorSpineEyeSprite.pageName,
    );
    if (!eyePage) {
      throw new Error(
          `plague doctor spine page missing: ${
              plagueDoctorSpineEyeSprite.pageName}`,
      );
    }
    eyeTexture = loadEyeTexture(eyePage);
    plagueDoctor.eyeQuad = new Float32Array(32);
    plagueDoctor.eyeVisible = false;
    plagueDoctor.eyeUv = plagueDoctorAdventEyeSpriteUv(
        eyePage.width,
        eyePage.height,
    );
    currentAnimation = plagueDoctorSpineAnimation;
    applyPose(plagueDoctor.skeleton, 0);
    resize();
    // 网页在骨架就绪前就调过 `play()`：按已经过去的时间接着演，不丢画面。
    if (playRequestedAt !== undefined) {
      beginPlayback(hostSeconds() - playRequestedAt);
    }
    return true;
  };

  /**
   * 取 `_eye1` 精灵所在的 Atlas 页面贴图。
   *
   * 精灵与骨架共用同一张页面，`_eye1` 只是页面里的一个矩形，所以直接复用运行时已经
   * 上传好的贴图。
   *
   * @param {object} page `_eye1` 所在的 Atlas 页面。
   * @return {object|undefined} 页面贴图。
   */
  const loadEyeTexture = (page) => {
    if (!page?.texture) {
      hostGlobal.console?.warn?.(
          `[PlagueDoctor] eye sprite page missing: ${
              plagueDoctorSpineEyeSprite.pageName}`,
      );
      return undefined;
    }
    return page.texture;
  };

  /**
   * 开始（或重开）演出。
   *
   * @param {number} offsetSeconds 已经过去的秒数；骨架就绪前就调用过 `play()` 时不为 0。
   * @return {void}
   */
  const beginPlayback = (offsetSeconds) => {
    // 画布可能在异步加载期间才拿到布局尺寸，开演前再同步一次。
    resize();
    elapsedSeconds = Math.max(0, offsetSeconds);
    whiteNightStarted = false;
    lastTimestamp = undefined;
    plagueDoctor.animationState.setAnimation(
        0,
        plagueDoctorSpineAnimation,
        true,
    );
    plagueDoctor.animationState.apply(plagueDoctor.skeleton);
    plagueDoctor.skeleton.updateWorldTransform();
    applyPose(plagueDoctor.skeleton, elapsedSeconds);
    currentAnimation = plagueDoctorSpineAnimation;
    // 加载慢到已经过了换场时刻时，直接进白夜那一半演出。
    if (elapsedSeconds >= plagueDoctorAdventWhiteNightSeconds) {
      startWhiteNight();
    }
    render();
    scheduleFrame();
  };

  const ready = start().then(() => true);

  return {
    canvas,

    /** 当前播放的动画名。 */
    get currentAnimation() {
      return currentAnimation;
    },

    ready,

    /** @return {boolean} 两副骨架都就绪后返回 true。 */
    isReady: () => Boolean(plagueDoctor && whiteNight),

    /**
     * 从头开始演出。
     *
     * 骨架还没就绪时同样记下请求：`ready` 兑现后按「已经过去的时间」接着演，
     * 因此网页在第一个钟声响起时就调用也不会丢画面。
     *
     * @return {boolean} 骨架就绪并已开始播放时返回 true。
     */
    play: () => {
      if (disposed) return false;
      playRequestedAt = hostSeconds();
      if (!plagueDoctor) return false;
      beginPlayback(0);
      return true;
    },

    resize,

    /** 停止渲染循环并清空画布。 */
    stop: () => {
      if (frame !== undefined) {
        hostGlobal.cancelAnimationFrame?.(frame);
        hostGlobal.clearTimeout?.(frame);
        frame = undefined;
      }
      lastTimestamp = undefined;
      playRequestedAt = undefined;
      if (sceneRenderer) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    },

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
      assetManager?.dispose?.();
      assetManager = undefined;
      plagueDoctor = undefined;
      whiteNight = undefined;
      eyeTexture = undefined;
      canvas.remove?.();
    },
  };
}
