/**
 * @file 终末鸟（黑森林）事件的 CG 与网页流程。
 *
 * 全部数据都从《脑叶公司》解包工程读出，本模块只负责把原作内容原样搬到网页：
 *
 * - CG 画布与图层：`Resources/prefabs/unit/creatureanimator/BossBirdAnim.prefab` 的
 *   `NarrationCanvas`（CanvasScaler 参考分辨率 1600×900、Match Width）；
 * - CG 状态表：同一 prefab 的 `NarrationUI.narrationImages`；
 * - 台词：`ExternalData/xml/Language/<lang>/creatures/BossBird_<lang>.xml` 的
 *   `<etc><param key="…">`，已按语言写进 `Locales/*.json` 的 `blackForest.*`；
 * - 调用链：`CreatureScript/BossBird.cs` 的 `OnBirdEscape` / `OnBirdArrived` /
 *   `OnEggBreakDown` / `OnAfterSuppressed`，以及 `BossBird_stat.txt` 的 sound 表。
 * - 非 16:9 窗口的适配：原作 CG 只按画布宽度换算出屏幕位置，比 16:9 更窄的窗口会让
 *   台词停在森林中央，更宽的窗口会把台词推出画面，所以网页按
 *   `blackForestCgTextLayout` 的规则把 1600×900 构图缩放到窗口内，并把台词钉在画面底部。
 *
 * 网页不模拟战斗与收容单元，只复刻 CG 与「事件对网站本身的影响」。
 */
// @ts-check

import { lobotomyCorpViewportSize } from './CanvasScaler.js';
import { adventTextNeedsCjkFont } from './WhiteNightAdvent.js';

/** 终末鸟事件在持久化状态里的唯一标识。 */
export const blackForestEventId = 'black-forest';

/** 终末鸟事件涉及的四只鸟的 canonical 编号。 */
export const blackForestAbnormalityIds = Object.freeze({
  bigBird: 'O-02-40',
  longBird: 'O-02-62',
  smallBird: 'O-02-56',
  apocalypseBird: 'O-02-63',
});

/** 黑森林故事的默认出场顺序：大鸟 → 审判鸟 → 惩戒鸟。 */
export const blackForestDefaultBirdOrder = Object.freeze([
  'bigBird',
  'longBird',
  'smallBird',
]);

/**
 * 三只鸟在事件里的固定对应关系。
 *
 * `arrival` / `breakdown` 是 `BossBird.GetNarrationKeyByEnum()` 给出的 NarrationState，
 * `egg` 是该鸟对应的蛋（`BossBird_<lang>.xml` 的 `bigBirdEgg / longBirdEgg / smallBirdEgg`）。
 */
export const blackForestBirds = Object.freeze({
  bigBird: Object.freeze({
    arrival: 'bigBirdArrive',
    breakdown: 'bigBirdBreak',
    egg: 'bigEyes',
    id: blackForestAbnormalityIds.bigBird,
  }),
  longBird: Object.freeze({
    arrival: 'longBirdArrive',
    breakdown: 'longBirdBreak',
    egg: 'longArms',
    id: blackForestAbnormalityIds.longBird,
  }),
  smallBird: Object.freeze({
    arrival: 'smallBirdArrive',
    breakdown: 'smallBirdBreak',
    egg: 'smallBeak',
    id: blackForestAbnormalityIds.smallBird,
  }),
});

/**
 * 三颗鸟蛋。
 *
 * 蛋名来自 `BossBird_<lang>.xml` 的 `bigBirdEgg / longBirdEgg / smallBirdEgg`
 * （中文为「大眼 / 长臂 / 小喙」），贴图取自
 * `Resources/sprites/creaturesprite/bossbird/egg/`。
 */
export const blackForestEggs = Object.freeze({
  bigEyes: Object.freeze({
    bird: 'bigBird',
    labelKey: 'blackForest.egg.bigEyes.label',
    sprite: 'Resources/sprites/creaturesprite/bossbird/egg/BigBirdEgg.png',
  }),
  longArms: Object.freeze({
    bird: 'longBird',
    labelKey: 'blackForest.egg.longArms.label',
    sprite: 'Resources/sprites/creaturesprite/bossbird/egg/LongBirdEgg.png',
  }),
  smallBeak: Object.freeze({
    bird: 'smallBird',
    labelKey: 'blackForest.egg.smallBeak.label',
    sprite: 'Resources/sprites/creaturesprite/bossbird/egg/SmallBirdEgg.png',
  }),
});

/** 三颗蛋的固定顺序（与 `blackForestDefaultBirdOrder` 一一对应）。 */
export const blackForestEggOrder = Object.freeze([
  'bigEyes',
  'longArms',
  'smallBeak',
]);

/**
 * `NarrationCanvas` 的原版几何与渐变参数。
 *
 * CanvasScaler：ScaleWithScreenSize、参考分辨率 1600×900、`MatchWidthOrHeight = 0`（Match Width），
 * 因此画布内 1 个单位对应 `viewportWidth / 1600` 个屏幕像素，画布本身铺满整屏。
 * 网页只在非 16:9 的窗口上调整画布缩放与台词锚点，规则与依据见 `blackForestCgTextLayout`。
 */
export const blackForestNarrationCanvas = Object.freeze({
  /** 前 1.5 秒 CG 图层淡入时的起始 alpha（`NarrationUI.FadeInGrad` 的 t = 0）。 */
  fadeInMs: 1500,
  /** `NarrationUI.FadeInGrad` 在 t = 0 的 alpha。 */
  fadeInStartAlpha: 0.47058824,
  /** 最后 1 秒 CG 图层与画布的淡出时长（`NarrationUI.FadeOutTime`）。 */
  fadeOutMs: 1000,
  /** `DisplayImage` 的 prefab 局部缩放只压扁横向。 */
  imageScaleX: 0.95,
  /** 铺满画布的静态图层，按绘制顺序排列。 */
  layers: Object.freeze([
    'Texture2D/Background_0.png',
    'Texture2D/BackGroundFoward.png',
    'Texture2D/FrameUpper.png',
  ]),
  referenceHeight: 900,
  referenceWidth: 1600,
  /** `Text` 节点的 RectTransform：相对画布中心的偏移与尺寸差。 */
  text: Object.freeze({
    anchoredPositionY: -354,
    fontSize: 34,
    /** 字体槽位走 `FontLoadScript(neededType = 3)` 的 ANTIQUE 字体（kr: NanumMyeongjo）。 */
    fontFamily: 'LobotomyAdventDesc',
    sizeDeltaHeight: -744,
    sizeDeltaWidth: -400,
  }),
});

/**
 * 每一句 CG。
 *
 * `durationMs` 来自 `BossBird.cs` 调用 `DisplayNarration` 时传入的显示时长；
 * `image` 来自 prefab 的 `narrationImages`；`messageKey` 对应台词；
 * `soundAtFadeOut` / `soundAtEnd` 是原作在同一时刻播放的音效。
 */
export const blackForestNarrations = Object.freeze({
  bigBirdArrive: Object.freeze({
    durationMs: 4000,
    image: 'Texture2D/BigBirdArrived.png',
    messageKey: 'blackForest.bigBird.arrives',
  }),
  bigBirdBreak: Object.freeze({
    durationMs: 2000,
    image: 'Texture2D/BigBirdDead.png',
    messageKey: 'blackForest.egg.bigEyes.destroyed',
  }),
  bossBirdAppear: Object.freeze({
    durationMs: 2000,
    image: 'Texture2D/BossBirdAppear.png',
    messageKey: 'blackForest.apocalypseBird.appears',
    soundAtFadeOut: 'BossBird_Birth',
  }),
  escape: Object.freeze({
    durationMs: 4000,
    image: 'Texture2D/GatewayAppear.png',
    messageKey: 'blackForest.story.opening',
  }),
  longBirdArrive: Object.freeze({
    durationMs: 4000,
    image: 'Texture2D/LongBirdArrived.png',
    messageKey: 'blackForest.longBird.arrives',
  }),
  longBirdBreak: Object.freeze({
    durationMs: 2000,
    image: 'Texture2D/LongBirdDead.png',
    messageKey: 'blackForest.egg.longArms.destroyed',
  }),
  smallBirdArrive: Object.freeze({
    durationMs: 4000,
    image: 'Texture2D/SmallBirdArrived.png',
    messageKey: 'blackForest.smallBird.arrives',
  }),
  smallBirdBreak: Object.freeze({
    durationMs: 2000,
    image: 'Texture2D/SmallBirdDead.png',
    messageKey: 'blackForest.egg.smallBeak.destroyed',
  }),
  suppressed: Object.freeze({
    durationMs: 6000,
    image: 'Texture2D/BossBirdDead.png',
    messageKey: 'blackForest.apocalypseBird.suppressed',
    soundAtEnd: 'BossBird_Dead',
  }),
});

/**
 * CG 用到的音效。
 *
 * `BossBird_stat.txt` 的 sound 表：`appear = creature/BossBird/BossBird_Birth`、
 * `dead = creature/BossBird/BossBird_Dead`。
 */
export const blackForestSoundPaths = Object.freeze({
  BossBird_Birth: 'Resources/sounds/creature/BossBird/BossBird_Birth.ogg',
  BossBird_Dead: 'Resources/sounds/creature/BossBird/BossBird_Dead.ogg',
});

/**
 * 事件结束时获得的 E.G.O 饰品。
 *
 * `Equipment.txt` 的 `400038`：名字 key `BossBird_Special_name`（中文「破晓」），
 * `sprite = BossBirdWing`、`attachPos = back`。
 */
export const blackForestGift = Object.freeze({
  equipmentId: 400038,
  nameKey: 'BossBird_Special_name',
  sprite: 'Resources/sprites/worker/equipment/attachment/BossBirdWing.png',
});

/**
 * 可以被鸟蛋替换的图标槽位。
 *
 * 只收录「不修改任何内容、不退出登录就能直接看到」的图标：导航栏的三个入口、
 * 工作区与历史页的筛选按钮、设置页外观分区的三个标签图标。
 * 页面侧用 `data-lobotomy-corp-black-forest-slot` 标记这些槽位。
 */
export const blackForestIconSlots = Object.freeze([
  Object.freeze({ id: 'nav.dashboard', page: 'nav' }),
  Object.freeze({ id: 'nav.settings', page: 'nav' }),
  Object.freeze({ id: 'nav.history', page: 'nav' }),
  Object.freeze({ id: 'dashboard.filter', page: 'dashboard' }),
  Object.freeze({ id: 'settings.theme', page: 'settings' }),
  Object.freeze({ id: 'settings.darkMode', page: 'settings' }),
  Object.freeze({ id: 'settings.locale', page: 'settings' }),
  Object.freeze({ id: 'history.filter', page: 'history' }),
]);

/** 页面分区；三颗蛋分别落在其中三个分区，用户必须跨页面寻找。 */
export const blackForestIconPages = Object.freeze([
  'nav',
  'dashboard',
  'settings',
  'history',
]);

/** 终末鸟事件持久化时允许出现的阶段。 */
export const blackForestPhases = Object.freeze([
  'recording',
  'cg',
  'hunt',
  'suppress',
  'done',
]);

/** 会接管页面、并在刷新后继续的阶段。 */
export const blackForestActivePhases = Object.freeze([
  'cg',
  'hunt',
  'suppress',
]);

/**
 * 按出场顺序生成 CG 序列。
 *
 * 原作的 `OnBirdEscape` → 三只鸟各自的 `OnBirdArrived` → `BossBirdAppear` 依次播放，
 * 所以序列固定是「开场 → 三只鸟抵达 → 终末鸟出现」。
 *
 * @param {string[]} birdOrder 三只鸟的出场顺序。
 * @return {string[]} CG 序列（`blackForestNarrations` 的键）。
 */
export function blackForestNarrationSequence(birdOrder) {
  const birds = /** @type {Record<string, {arrival: string}>} */ (
    blackForestBirds
  );
  const arrivals = (Array.isArray(birdOrder) ? birdOrder : [])
    .map((bird) => birds[bird]?.arrival)
    .filter((key) => typeof key === 'string');
  return ['escape', ...arrivals, 'bossBirdAppear'];
}

/**
 * 生成 CG 的时间线。
 *
 * `NarrationUI` 的总时长是「显示时长 + FadeInTime + FadeOutTime」：前 1.5 秒 CG 图层从
 * `fadeInStartAlpha` 淡入到不透明，最后 1 秒淡出；后面还排着下一句时只有 CG 图层淡出、
 * 整块画布保持不透明（台词在下一句开始时整段替换），没有下一句时整块画布一起淡出。
 *
 * @param {string[]} keys CG 序列。
 * @param {Record<string, any>} [narrations] 台词表，测试可替换。
 * @return {Array<{breakdown: Record<string, any>, endMs: number, fadeInEndMs: number, fadeOutStartMs: number, hasNext: boolean, image: string, key: string, messageKey: string, startMs: number}>} CG 时间线。
 */
export function blackForestCgTimeline(
  keys,
  narrations = blackForestNarrations,
) {
  let startMs = 0;
  const list = (Array.isArray(keys) ? keys : []).map((key) => {
    const narration = narrations[key];
    const fadeInEndMs = startMs + blackForestNarrationCanvas.fadeInMs;
    const fadeOutStartMs = fadeInEndMs + (narration?.durationMs ?? 0);
    const endMs = fadeOutStartMs + blackForestNarrationCanvas.fadeOutMs;
    const segment = {
      breakdown: narration ?? {},
      endMs,
      fadeInEndMs,
      fadeOutStartMs,
      hasNext: false,
      image: narration?.image ?? '',
      key,
      messageKey: narration?.messageKey ?? '',
      startMs,
    };
    startMs = endMs;
    return segment;
  });
  list.forEach((segment, index) => {
    segment.hasNext = index < list.length - 1;
  });
  return list;
}

/**
 * 求某个时刻的画面状态。
 *
 * @param {ReturnType<typeof blackForestCgTimeline>} timeline CG 时间线。
 * @param {number} elapsedMs 已播放时长。
 * @return {{canvasAlpha: number, finished: boolean, imageAlpha: number, index: number}} 该时刻的 CG 图层与画布不透明度。
 */
export function blackForestCgFrameAt(timeline, elapsedMs) {
  const { fadeInMs, fadeOutMs, fadeInStartAlpha } = blackForestNarrationCanvas;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const index = timeline.findIndex((segment) => elapsed < segment.endMs);
  if (index < 0) {
    return { canvasAlpha: 0, finished: true, imageAlpha: 0, index: -1 };
  }
  const segment = timeline[index];
  const local = elapsed - segment.startMs;
  const fadeOutStartLocal = segment.fadeOutStartMs - segment.startMs;
  let imageAlpha;
  if (local < fadeInMs) {
    imageAlpha = fadeInStartAlpha +
      (1 - fadeInStartAlpha) * (local / fadeInMs);
  } else if (local < fadeOutStartLocal) {
    imageAlpha = 1;
  } else {
    imageAlpha = 1 - (local - fadeOutStartLocal) / fadeOutMs;
  }
  const canvasAlpha = !segment.hasNext && local >= fadeOutStartLocal
    ? 1 - (local - fadeOutStartLocal) / fadeOutMs
    : 1;
  return {
    canvasAlpha: Math.min(1, Math.max(0, canvasAlpha)),
    finished: false,
    imageAlpha: Math.min(1, Math.max(0, imageAlpha)),
    index,
  };
}

/**
 * 计算台词节点的屏幕几何。
 *
 * `Text` 节点是 `anchoredPosition = (0, -354)`、`sizeDelta = (-400, -744)` 的
 * MiddleCenter 文本框：它在 1600×900 画布上是 1200×156，中心比画布中心低 354，
 * 也就是中心离画布底边 96、下边缘离底边 18 画布单位。
 *
 * 画布缩放取「整块 1600×900 构图完整装进 viewport」的上限（`min(宽比, 高比)`），
 * 16:9 下等于 CanvasScaler 的 Match Width（`viewportWidth / 1600`）；台词中心再钉在
 * 可见画面底边上方 96 画布单位处。这两条让台词在任何窗口比例下都留在画面底部那片
 * 深色区域里：16:9 换算结果与 prefab 完全一致（中心 804、字号 34），比 16:9 更窄的窗口
 * 不会把它留在画面中部，比 16:9 更宽的窗口也不会把它推出画面。
 *
 * @param {number} viewportWidth 视口宽度。
 * @param {number} viewportHeight 视口高度。
 * @return {{centerX: number, centerY: number, fontSize: number, height: number, scale: number, width: number}} 台词节点的屏幕几何。
 */
export function blackForestCgTextLayout(viewportWidth, viewportHeight) {
  const { referenceHeight, referenceWidth, text } = blackForestNarrationCanvas;
  const width = Number.isFinite(viewportWidth) && viewportWidth > 0
    ? viewportWidth
    : referenceWidth;
  const height = Number.isFinite(viewportHeight) && viewportHeight > 0
    ? viewportHeight
    : referenceHeight;
  const scale = Math.min(width / referenceWidth, height / referenceHeight);
  /** 台词矩形在 1600×900 画布上的一半高度（prefab：(900 - 744) / 2）。 */
  const halfHeight = (referenceHeight + text.sizeDeltaHeight) / 2;
  /** 台词矩形下边缘离画布底边的留白（prefab：900 - (450 + 354 + 78)）。 */
  const bottomMargin = referenceHeight -
    (referenceHeight / 2 - text.anchoredPositionY) - halfHeight;
  /** 台词中心离画布底边的画布单位数（prefab：78 + 18）。 */
  const bottomOffset = halfHeight + bottomMargin;
  return {
    centerX: width / 2,
    // Unity 的 y 轴朝上：底边上方 bottomOffset 单位即锚点在画布中心下方 354 单位的位置。
    centerY: height - bottomOffset * scale,
    fontSize: text.fontSize * scale,
    // 台词槽位在 prefab 里是 0~1 锚点的拉伸矩形：画布多高它就多高，只差 sizeDelta。
    height: height + text.sizeDeltaHeight * scale,
    scale,
    width: width + text.sizeDeltaWidth * scale,
  };
}

/**
 * 把三颗蛋随机分配到三个不同页面的图标槽位上。
 *
 * @param {() => number} [random] 返回 [0, 1) 的随机源，测试可注入。
 * @return {Record<string, string>} 图标槽位 → 蛋。
 */
export function blackForestEggAssignment(random = Math.random) {
  /**
   * 洗牌一份只读列表。
   *
   * @param {readonly string[]} values 原始列表。
   * @return {string[]} 打乱后的新列表。
   */
  const shuffled = (values) => {
    const list = [...values];
    for (let index = list.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      const current = list[index];
      list[index] = list[swap];
      list[swap] = current;
    }
    return list;
  };
  const pages = shuffled(blackForestIconPages)
    .slice(0, blackForestEggOrder.length);
  const eggs = shuffled(blackForestEggOrder);
  /** @type {Record<string, string>} */
  const assignment = {};
  pages.forEach((page, index) => {
    const slots = blackForestIconSlots
      .filter((slot) => slot.page === page)
      .map((slot) => slot.id);
    if (slots.length === 0) return;
    const slot = slots[Math.floor(random() * slots.length) % slots.length];
    assignment[slot] = eggs[index];
  });
  return assignment;
}

/**
 * 判断存档是否可以恢复。
 *
 * 字段缺失按兼容处理；字段存在但取值非法时整份存档作废，避免损坏的进度进入运行期。
 *
 * @param {Record<string, any>} saved 已解析的存档。
 * @return {boolean} 所有已存在字段都合法时返回 true。
 */
export function isValidBlackForestState(saved) {
  const birds = Array.isArray(saved?.birds) ? saved.birds : [];
  const order = Array.isArray(saved?.order) ? saved.order : [];
  const found = Array.isArray(saved?.found) ? saved.found : [];
  const eggs = saved?.eggs && typeof saved.eggs === 'object' ? saved.eggs : {};
  return blackForestPhases.includes(saved?.phase) &&
    birds.every((bird) => bird in blackForestBirds) &&
    order.every((bird) => bird in blackForestBirds) &&
    found.every((egg) => egg in blackForestEggs) &&
    Object.entries(eggs).every(([slot, egg]) =>
      blackForestIconSlots.some((entry) => entry.id === slot) &&
      egg in blackForestEggs
    );
}

/**
 * 判断三只鸟里剩下哪一只还没出场。
 *
 * @param {string[]} birds 已经出场的鸟。
 * @return {string} 剩下那只鸟。
 */
function remainingBird(birds) {
  return blackForestDefaultBirdOrder.find((bird) => !birds.includes(bird)) ??
    blackForestDefaultBirdOrder[blackForestDefaultBirdOrder.length - 1];
}

/**
 * 按键取一只鸟的资料。
 *
 * @param {string} key 鸟的键。
 * @return {{arrival: string, breakdown: string, egg: string, id: string}|undefined} 鸟的资料。
 */
function blackForestBirdInfo(key) {
  return /** @type {Record<string, {arrival: string, breakdown: string, egg: string, id: string}>} */ (
    blackForestBirds
  )[key];
}

/**
 * 按键取一颗蛋的资料。
 *
 * @param {string} key 蛋的键。
 * @return {{bird: string, labelKey: string, sprite: string}|undefined} 蛋的资料。
 */
function blackForestEggInfo(key) {
  return /** @type {Record<string, {bird: string, labelKey: string, sprite: string}>} */ (
    blackForestEggs
  )[key];
}

/**
 * 把用户输入的鸟补成完整的三只鸟出场顺序。
 *
 * @param {string[]} birds 用户先后输入的鸟。
 * @return {string[]} 三只鸟的出场顺序。
 */
export function blackForestBirdOrderFor(birds) {
  const order = [...birds];
  while (order.length < blackForestDefaultBirdOrder.length) {
    order.push(remainingBird(order));
  }
  return order.slice(0, blackForestDefaultBirdOrder.length);
}

/**
 * 默认音效播放器。
 *
 * 浏览器可能因为缺少用户手势而拒绝播放，这里静默失败，不影响 CG 时间线。
 *
 * @param {string} source 音频 URL。
 */
function defaultBlackForestSoundPlayer(source) {
  const host = /** @type {any} */ (globalThis);
  if (typeof host.Audio !== 'function') return;
  try {
    const audio = new host.Audio(source);
    audio.hidden = true;
    audio.setAttribute?.('aria-hidden', 'true');
    void audio.play?.()?.catch?.(() => {});
  } catch {
    // 音频被浏览器策略拦截时保持静默。
  }
}

/**
 * 创建 CG 播放器。
 *
 * 逐帧写 CG 图层与画布的不透明度，时间线完全按 `NarrationUI` 的公式推进。
 *
 * @param {any} options 播放器选项。
 * @return {any} CG 播放器。
 */
export function createBlackForestCgPlayer(options) {
  const host = /** @type {any} */ (globalThis);
  const document = options?.document ?? host.document;
  if (!document?.body || !document.createElement) {
    throw new Error('Black Forest CG requires a document body.');
  }
  const assetRoot = String(options.assetRoot ?? '').replace(/\/$/, '');
  const now = options.now ??
    (() => host.performance?.now?.() ?? Date.now());
  const requestFrame = options.requestFrame ??
    ((/** @type {(timestamp: number) => void} */ callback) =>
      host.requestAnimationFrame?.(callback) ??
      setTimeout(() => callback(now()), 16));
  const cancelFrame = options.cancelFrame ??
    ((/** @type {number} */ id) => {
      if (typeof host.cancelAnimationFrame === 'function') {
        host.cancelAnimationFrame(id);
        return;
      }
      clearTimeout(id);
    });
  const viewport = options.viewport ?? (() => lobotomyCorpViewportSize());
  const playSound = options.playSound ?? defaultBlackForestSoundPlayer;
  const messages = options.messages ?? (() => ({}));

  const root = document.createElement('section');
  const background = document.createElement('img');
  const image = document.createElement('img');
  const forward = document.createElement('img');
  const frame = document.createElement('img');
  const text = document.createElement('p');
  root.className = 'lobotomy-corp-black-forest-cg';
  root.setAttribute('aria-hidden', 'true');
  background.className = 'lobotomy-corp-black-forest-cg-background';
  image.className = 'lobotomy-corp-black-forest-cg-image';
  forward.className = 'lobotomy-corp-black-forest-cg-forward';
  frame.className = 'lobotomy-corp-black-forest-cg-frame';
  text.className = 'lobotomy-corp-black-forest-cg-text';
  [background, image, forward, frame].forEach((sprite) => {
    sprite.alt = '';
    sprite.setAttribute('aria-hidden', 'true');
  });
  background.src = `${assetRoot}/${blackForestNarrationCanvas.layers[0]}`;
  forward.src = `${assetRoot}/${blackForestNarrationCanvas.layers[1]}`;
  frame.src = `${assetRoot}/${blackForestNarrationCanvas.layers[2]}`;
  root.append(background, image, forward, text, frame);

  /** @type {ReturnType<typeof blackForestCgTimeline>} */
  let timeline = [];
  /** @type {(() => void)|undefined} */
  let listener;
  /** @type {number|undefined} */
  let frameHandle;
  let startedAt = 0;
  /** @type {Set<string>} */
  const playedSounds = new Set();
  /** @type {(() => void)|undefined} */
  let settle;
  let active = false;
  let lastIndex = -1;

  /** 按当前 viewport 写入台词节点的屏幕几何。 */
  const layout = () => {
    const size = viewport();
    const geometry = blackForestCgTextLayout(size?.width, size?.height);
    text.style.left = `${geometry.centerX}px`;
    text.style.top = `${geometry.centerY}px`;
    text.style.width = `${geometry.width}px`;
    text.style.height = `${geometry.height}px`;
    text.style.fontSize = `${geometry.fontSize}px`;
  };

  /**
   * 把某一句 CG 的台词与图层写进 DOM。
   *
   * @param {{image: string, messageKey: string}} segment 当前片段。
   */
  const presentSegment = (segment) => {
    const label = messages()?.[segment.messageKey] ?? '';
    text.textContent = label;
    text.dataset.cjk = adventTextNeedsCjkFont(label) ? '1' : '';
    image.src = `${assetRoot}/${segment.image}`;
  };

  /**
   * 同一时刻的音效只播放一次。
   *
   * @param {string} key 音效归属标识。
   * @param {string} soundKey `blackForestSoundPaths` 的键。
   */
  const playOnce = (key, soundKey) => {
    if (playedSounds.has(key)) return;
    playedSounds.add(key);
    const soundPath = /** @type {Record<string, string>} */ (
      blackForestSoundPaths
    )[soundKey];
    if (soundPath) playSound(`${assetRoot}/${soundPath}`);
  };

  /**
   * 按已播放时长刷新画面；供测试直接驱动时间线。
   *
   * @param {number} elapsedMs 已播放时长。
   */
  const renderAt = (elapsedMs) => {
    const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    const state = blackForestCgFrameAt(timeline, elapsed);
    if (state.finished) {
      root.style.setProperty('--lobotomy-corp-black-forest-canvas-alpha', '0');
      return;
    }
    if (state.index !== lastIndex) {
      lastIndex = state.index;
      presentSegment(timeline[state.index]);
    }
    root.style.setProperty(
      '--lobotomy-corp-black-forest-image-alpha',
      String(state.imageAlpha),
    );
    root.style.setProperty(
      '--lobotomy-corp-black-forest-canvas-alpha',
      String(state.canvasAlpha),
    );
    const segment = timeline[state.index];
    if (
      segment.breakdown.soundAtFadeOut &&
      elapsed >= segment.fadeOutStartMs
    ) {
      playOnce(`${segment.key}:fade-out`, segment.breakdown.soundAtFadeOut);
    }
    if (segment.breakdown.soundAtEnd && elapsed >= segment.endMs) {
      playOnce(`${segment.key}:end`, segment.breakdown.soundAtEnd);
    }
  };

  /** 把 CG 挂到页面上。 */
  const mount = () => {
    document.body.append(root);
    layout();
    listener = () => layout();
    host.addEventListener?.('resize', listener);
    host.addEventListener?.('orientationchange', listener);
  };

  /** 把 CG 从页面上摘掉。 */
  const unmount = () => {
    if (listener) {
      host.removeEventListener?.('resize', listener);
      host.removeEventListener?.('orientationchange', listener);
      listener = undefined;
    }
    root.remove?.();
  };

  /** 收尾：复位画面并兑现 Promise。 */
  const stop = () => {
    if (!active) return;
    active = false;
    if (frameHandle !== undefined) {
      cancelFrame(frameHandle);
      frameHandle = undefined;
    }
    root.style.setProperty('--lobotomy-corp-black-forest-canvas-alpha', '0');
    unmount();
    const resolve = settle;
    settle = undefined;
    resolve?.();
  };

  /** 逐帧推进 CG，直到整条时间线播完。 */
  const tick = () => {
    if (!active) return;
    const elapsed = now() - startedAt;
    renderAt(elapsed);
    const totalMs = timeline.reduce(
      (total, segment) => total + (segment.endMs - segment.startMs),
      0,
    );
    if (elapsed >= totalMs) {
      stop();
      return;
    }
    frameHandle = requestFrame(tick);
  };

  return Object.freeze({
    /** @return {boolean} CG 播放中返回 true。 */
    isPlaying: () => active,
    /**
     * 播放一段 CG。
     *
     * @param {string[]} keys CG 序列。
     * @return {Promise<void>} 整段 CG 播完时完成。
     */
    play(keys) {
      if (active) return Promise.resolve();
      timeline = blackForestCgTimeline(keys);
      if (timeline.length === 0) return Promise.resolve();
      playedSounds.clear();
      lastIndex = -1;
      active = true;
      startedAt = now();
      mount();
      renderAt(0);
      return new Promise((resolve) => {
        settle = resolve;
        frameHandle = requestFrame(tick);
      });
    },
    renderAt,
    stop,
  });
}

/**
 * 创建终末鸟事件控制器。
 *
 * @param {any} shared lobotomy-corp.js 提供的最小共享 API。
 * @return {any} 终末鸟事件 API。
 */
export function createBlackForestEvent(shared) {
  /** @type {any} */
  let state;
  /** @type {any} */
  let player;
  /** @type {Array<{node: any, original: any}>} */
  let mountedEggs = [];

  /** @return {any} 宿主 document。 */
  const document = () =>
    shared.document?.() ?? /** @type {any} */ (globalThis).document;

  /** 写入可恢复状态。 */
  const persist = () => {
    if (!state) return;
    const serialized = JSON.stringify({
      birds: state.birds,
      eggs: state.eggs,
      found: state.found,
      gift: state.gift === true,
      id: blackForestEventId,
      order: state.order,
      phase: state.phase,
      source: state.source,
    });
    shared.storages?.().forEach(
      (/** @type {any} */ storage) =>
        storage.setItem(shared.storageKey, serialized),
    );
  };

  /** 清除持久化状态。 */
  const clearPersisted = () =>
    shared.storages?.().forEach(
      (/** @type {any} */ storage) =>
        storage.removeItem(shared.storageKey),
    );

  /**
   * 读取存档。
   *
   * @return {any|undefined} 合法存档；损坏或不存在时返回 undefined。
   */
  const persisted = () => {
    const serialized = shared.storages?.().map(
      (/** @type {any} */ storage) => storage.getItem(shared.storageKey),
    ).find(Boolean);
    if (!serialized) return undefined;
    try {
      const saved = JSON.parse(serialized);
      if (saved?.id !== blackForestEventId) return undefined;
      if (!isValidBlackForestState(saved)) {
        clearPersisted();
        return undefined;
      }
      return saved;
    } catch {
      clearPersisted();
      return undefined;
    }
  };

  /** @return {boolean} 事件正在进行（开场 CG / 寻找鸟蛋 / 终末鸟死亡 CG）时返回 true。 */
  const isActive = () =>
    Boolean(state) && blackForestActivePhases.includes(state.phase);

  /** @return {string|undefined} 当前阶段。 */
  const getPhase = () => state?.phase;

  /**
   * 记录一次已确认的异想体提交。
   *
   * 原作把仍处于出逃状态的鸟累积到 `escapedCreatures`，数量达到两只时开始终末鸟事件。
   * 网页没有镇压流程，因此同一 Day 内成功提交的鸟会一直保留；直接输入 `O-02-63`
   * 则随时可以召唤。
   *
   * @param {string} canonicalId 异想体 canonical 编号。
   * @param {any} [preparedMedia] 用户手势中预热的媒体，只有直接召唤时才会用到。
   * @return {boolean} 本次提交触发了终末鸟事件时返回 true。
   */
  const recordSubmission = (canonicalId, preparedMedia) => {
    if (isActive() || typeof canonicalId !== 'string') return false;
    // 其它特殊事件进行期间只保存名称：既不记录鸟，也不开始本事件。
    if (shared.mutexBlocked?.()) return false;
    // 已经结束过的事件可以再次触发；「破晓」是永久奖励，不随新一轮事件消失。
    if (!state || state.phase === 'done') {
      state = {
        birds: [],
        eggs: {},
        found: [],
        gift: state?.gift === true,
        id: blackForestEventId,
        order: [],
        phase: 'recording',
        source: undefined,
      };
    }
    if (state.phase !== 'recording') return false;
    if (canonicalId === blackForestAbnormalityIds.apocalypseBird) {
      return start({
        order: [...blackForestDefaultBirdOrder],
        preparedMedia,
        source: 'direct-submission',
      });
    }
    const bird = Object.keys(blackForestBirds).find((key) =>
      blackForestBirdInfo(key)?.id === canonicalId
    );
    if (!bird || state.birds.includes(bird)) return false;
    state.birds.push(bird);
    persist();
    if (state.birds.length < 2) return false;
    return start({
      order: blackForestBirdOrderFor(state.birds),
      preparedMedia,
      source: 'two-birds',
    });
  };

  /** 重新开始这一天或事件被中断时清空输入记录；已经拿到的「破晓」不受影响。 */
  const resetBirdRecord = () => {
    if (isActive() || state?.phase === 'done') return;
    state = undefined;
    clearPersisted();
  };

  /**
   * 开始终末鸟事件。
   *
   * @param {{order: string[], preparedMedia?: any, source: string}} options 出场顺序、预热媒体与触发来源。
   * @return {boolean} 事件已开始返回 true。
   */
  const start = ({ order, preparedMedia, source }) => {
    if (isActive() || shared.mutexBlocked?.()) return false;
    state = {
      birds: state?.birds ?? [],
      eggs: {},
      found: [],
      // 已经拿到的「破晓」是永久奖励，重新触发事件也不会丢。
      gift: state?.gift === true,
      id: blackForestEventId,
      order: [...order],
      phase: 'cg',
      source,
    };
    persist();
    shared.ensureCoordinator?.();
    shared.mountRestartPanel?.();
    // 事件期间冻结危急值衰减：警报与顶部的「重新开始这一天」必须一直可用。
    shared.pauseDangerDecay?.();
    if (source === 'direct-submission') {
      shared.settleDirectBirdDanger?.(preparedMedia);
    }
    void playCg();
    return true;
  };

  /** @return {any} 当前页面使用的 CG 播放器。 */
  const cgPlayer = () => {
    if (!player) {
      player = createBlackForestCgPlayer({
        assetRoot: shared.assetRoot,
        document: document(),
        messages: () => shared.messages?.() ?? {},
      });
    }
    return player;
  };

  /**
   * 播放一段 CG。
   *
   * @param {string[]} keys CG 序列。
   * @return {Promise<void>} 播放结束时完成。
   */
  const playNarration = (keys) => {
    const controller = cgPlayer();
    return controller ? controller.play(keys) : Promise.resolve();
  };

  /** 播放开场 CG，结束后进入寻找鸟蛋阶段。 */
  const playCg = async () => {
    await playNarration(blackForestNarrationSequence(state?.order ?? []));
    if (!state || state.phase !== 'cg') return;
    state.phase = 'hunt';
    state.eggs = blackForestEggAssignment(shared.random ?? Math.random);
    persist();
    // 原作在终末鸟出现时改写玩家身份；网页沿用既有的显示名称机制。
    shared.applyDisplayName?.(blackForestAbnormalityIds.apocalypseBird);
    mountEggs();
  };

  /**
   * 用鸟蛋替换一个图标槽位。
   *
   * 先量出图标原本的占位尺寸，再把它藏起来、用同尺寸的按钮承载鸟蛋，结束后可以原样还原。
   *
   * @param {any} node 图标槽位节点。
   * @param {string} egg 蛋的键。
   * @return {{node: any, original: any}} 还原所需的信息。
   */
  const mountEgg = (node, egg) => {
    const host = document();
    const bounds = node.getBoundingClientRect?.();
    const info = blackForestEggInfo(egg);
    const label = shared.messages?.()?.[info?.labelKey ?? ''] ?? '';
    // 用 span 承载鸟蛋：导航入口本身就是 button，不能再嵌套一层 button。
    const button = host.createElement('span');
    button.className =
      `lobotomy-corp-black-forest-egg ${node.className ?? ''}`.trim();
    button.dataset.lobotomyCorpBlackForestEgg = egg;
    button.setAttribute('aria-label', label);
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.style.width = bounds?.width > 0 ? `${bounds.width}px` : '1em';
    button.style.height = bounds?.height > 0 ? `${bounds.height}px` : '1em';
    const sprite = host.createElement('img');
    sprite.alt = '';
    sprite.className = 'lobotomy-corp-black-forest-egg-image';
    sprite.setAttribute('aria-hidden', 'true');
    sprite.src = `${shared.assetRoot}/${info?.sprite ?? ''}`;
    button.append(sprite);
    button.addEventListener('click', onEggClick);
    button.addEventListener('keydown', onEggKeyDown);
    // 原图标留在原处、只隐藏占位，结束后按原样恢复。
    node.style.setProperty('display', 'none');
    node.parentElement?.insertBefore(button, node);
    return { node: button, original: node };
  };

  /**
   * 处理一次鸟蛋点击。
   *
   * @param {any} event 点击事件。
   */
  const onEggClick = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const host = event?.currentTarget ?? event?.target;
    const egg = host?.dataset?.lobotomyCorpBlackForestEgg;
    if (typeof egg === 'string') void activateEgg(egg);
  };

  /**
   * 处理鸟蛋上的键盘激活。
   *
   * @param {any} event 键盘事件。
   */
  const onEggKeyDown = (event) => {
    if (event?.key !== 'Enter' && event?.key !== ' ') return;
    onEggClick(event);
  };

  /**
   * 把当前页面上的鸟蛋挂到图标槽位上。
   *
   * 每个槽位由 `data-lobotomy-corp-black-forest-slot` 标记；只处理本页存在的槽位，
   * 因此换页后没被找到的鸟蛋会自己出现在它所属的页面里。
   */
  const mountEggs = () => {
    unmountEggs();
    if (!state || state.phase !== 'hunt') return;
    const host = document();
    if (!host?.querySelector) return;
    Object.entries(state.eggs).forEach(([slot, egg]) => {
      if (state.found.includes(egg)) return;
      const node = host.querySelector(
        `[data-lobotomy-corp-black-forest-slot="${slot}"]`,
      );
      if (!node) return;
      mountedEggs.push(mountEgg(node, egg));
    });
  };

  /** 还原所有被鸟蛋替换掉的图标。 */
  const unmountEggs = () => {
    mountedEggs.forEach(({ node, original }) => {
      original?.style?.removeProperty?.('display');
      node.remove?.();
    });
    mountedEggs = [];
  };

  /**
   * 结算一次鸟蛋点击：播放这只鸟的死亡 CG；三颗蛋都处理完时接着播终末鸟死亡 CG。
   *
   * @param {string} egg 蛋的键。
   * @return {Promise<void>} 本段演出结束时完成。
   */
  const activateEgg = async (egg) => {
    if (!state || state.phase !== 'hunt' || state.found.includes(egg)) return;
    const bird = blackForestBirdInfo(blackForestEggInfo(egg)?.bird ?? '');
    if (!bird) return;
    state.found.push(egg);
    const completed = state.found.length >= blackForestEggOrder.length;
    if (completed) state.phase = 'suppress';
    persist();
    unmountEggs();
    const keys = [bird.breakdown];
    if (completed) keys.push('suppressed');
    await playNarration(keys);
    if (completed) {
      finish({ completed: true });
      return;
    }
    mountEggs();
  };

  /** 按存档把「破晓」图标挂到所有头像框的右后侧。 */
  const syncGift = () => {
    const host = document();
    const wrappers = host?.querySelectorAll?.(
      '[data-lobotomy-corp-risk-host]',
    ) ?? [];
    wrappers.forEach((/** @type {any} */ wrapper) => {
      if (!host?.createElement) return;
      if (wrapper.querySelector?.('.lobotomy-corp-black-forest-gift')) return;
      const gift = host.createElement('img');
      gift.alt = '';
      gift.className = 'lobotomy-corp-black-forest-gift';
      gift.setAttribute('aria-hidden', 'true');
      gift.src = `${shared.assetRoot}/${blackForestGift.sprite}`;
      wrapper.append(gift);
    });
  };

  /**
   * 结束事件并清理事件产生的临时状态。
   *
   * @param {{completed?: boolean, restore?: boolean}} [options] 是否因完成而结束，以及是否恢复页面状态。
   */
  const finish = ({ completed = false, restore = true } = {}) => {
    const current = state;
    state = undefined;
    unmountEggs();
    player?.stop?.();
    player = undefined;
    shared.finishRestartPanel?.();
    if (completed || current?.gift === true) {
      // 「破晓」是事件留下的奖励：事件结束后仍按存档挂在头像框上。
      state = {
        birds: current?.birds ?? [],
        eggs: {},
        found: [],
        gift: true,
        id: blackForestEventId,
        order: [],
        phase: 'done',
        source: current?.source,
      };
      persist();
      syncGift();
    } else {
      clearPersisted();
    }
    if (restore) shared.resumeDangerDecay?.();
  };

  /**
   * 恢复存档。
   *
   * 开场 CG 阶段重播 CG，寻找阶段重新摆蛋，镇压阶段重播终末鸟死亡 CG，记录阶段只恢复输入记录。
   *
   * @return {boolean} 恢复出任何状态时返回 true。
   */
  const restore = () => {
    const saved = persisted();
    if (!saved) {
      syncGift();
      return false;
    }
    if (saved.gift === true) syncGift();
    state = {
      birds: saved.birds ?? [],
      eggs: saved.eggs ?? {},
      found: saved.found ?? [],
      gift: saved.gift === true,
      id: blackForestEventId,
      order: saved.order ?? [],
      phase: saved.phase,
      source: saved.source,
    };
    if (state.phase === 'done') {
      // 只保留「破晓」奖励，不占用任何页面资源。
      return true;
    }
    if (state.phase === 'recording') {
      // 记录阶段只保留「已经输入过哪几只鸟」，不占用任何页面资源。
      return true;
    }
    shared.mountRestartPanel?.();
    shared.pauseDangerDecay?.();
    if (state.phase === 'cg') {
      void playCg();
      return true;
    }
    if (state.phase === 'hunt') {
      mountEggs();
      return true;
    }
    void playNarration(['suppressed']).then(() => finish({ completed: true }));
    return true;
  };

  return Object.freeze({
    activateEgg,
    clearPersisted,
    finish,
    getId: () => state?.id,
    getPhase,
    isActive,
    isRecording: () => state?.phase === 'recording',
    persisted,
    recordSubmission,
    resetBirdRecord,
    restore,
    start,
  });
}
