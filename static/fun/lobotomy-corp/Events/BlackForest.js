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
import { createBlackForestEggSpineStage } from './BlackForestEggSpine.js';
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
 * （中文为「大眼 / 长臂 / 小喙」）。`BossBird.MakeBirdObjects` 用
 * `1000351 / 1000352 / 1000353` 创建它们，`CreatureList.txt` 与各自的 `*Egg_stat.txt`
 * 再把每颗蛋接到 `Unit/CreatureAnimator/BigEgg`、`LongEgg`、`SmallEgg` 的 Spine 动画。
 */
export const blackForestEggs = Object.freeze({
  bigEyes: Object.freeze({
    bird: 'bigBird',
    labelKey: 'blackForest.egg.bigEyes.label',
    spine: 'bigEyes',
  }),
  longArms: Object.freeze({
    bird: 'longBird',
    labelKey: 'blackForest.egg.longArms.label',
    spine: 'longArms',
  }),
  smallBeak: Object.freeze({
    bird: 'smallBird',
    labelKey: 'blackForest.egg.smallBeak.label',
    spine: 'smallBeak',
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

/** 各候选页面中的固定图标槽位。 */
const blackForestIconSlotIds = Object.freeze({
  nav: Object.freeze([
    'nav.dashboard',
    'nav.settings',
    'nav.history',
    'nav.accountSettings',
    'nav.logout',
  ]),
  dashboard: Object.freeze(['dashboard.filter']),
  settings: Object.freeze([
    'settings.account.avatar',
    'settings.account.username',
    'settings.account.displayName',
    'settings.post.topic',
    'settings.post.keywords',
    'settings.poll.enabled',
    'settings.poll.interval',
    'settings.poll.postLimit',
    'settings.poll.sort',
    'settings.notification.provider',
    'settings.notification.webhookService',
    'settings.notification.token',
    'settings.notification.spt',
    'settings.notification.sendKey',
    'settings.notification.webhookUrl',
    'settings.notification.emailService',
    'settings.notification.emailAddress',
    'settings.notification.emailFrom',
    'settings.notification.apiUrl',
    'settings.notification.apiToken',
    'settings.notification.smtpHost',
    'settings.notification.smtpPort',
    'settings.notification.ssl',
    'settings.notification.smtpUsername',
    'settings.notification.smtpPassword',
    'settings.auth.email',
    'settings.auth.password',
    'settings.auth.passkey',
    'settings.auth.google',
    'settings.auth.twoFactor',
    'settings.auth.preferredMethod',
    'settings.auth.authenticator',
    'settings.auth.recoveryCode',
    'settings.global.theme',
    'settings.global.darkMode',
    'settings.global.locale',
  ]),
  history: Object.freeze(['history.filter']),
});

/**
 * 可以被鸟蛋替换的固定候选槽位。
 *
 * 分页页码与每页行数只在对应表格存在时由当前页面动态追加。
 */
export const blackForestIconSlots = Object.freeze(
  Object.entries(blackForestIconSlotIds).flatMap(([page, ids]) =>
    ids.map((id) => Object.freeze({ id, page }))
  ),
);

/** 候选页面；鸟蛋可从这些页面汇总出的槽位中随机出现。 */
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
 * 把所有候选页面里的图标槽位统一随机分配，同一页面可以出现多颗蛋。
 *
 * @param {() => number} [random] 返回 [0, 1) 的随机源，测试可注入。
 * @param {readonly {id: string, page: string}[]} [slots] 本次可用的候选槽位。
 * @return {Record<string, string>} 图标槽位 → 蛋。
 */
export function blackForestEggAssignment(
  random = Math.random,
  slots = blackForestIconSlots,
) {
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
  const selectedSlots = shuffled(slots.map((slot) => slot.id))
    .slice(0, blackForestEggOrder.length);
  const eggs = shuffled(blackForestEggOrder);
  /** @type {Record<string, string>} */
  const assignment = {};
  selectedSlots.forEach((slot, index) => {
    assignment[slot] = eggs[index];
  });
  return assignment;
}

/**
 * 把未找到且位于目标页之外的鸟蛋随机迁移到目标页槽位。
 *
 * 已找到的鸟蛋不会重新参与分配；已经位于目标页的未找到鸟蛋也保持原槽位不变，
 * 避免白夜接管页面后无意义地改变用户已经看到的分布。
 *
 * @param {Record<string, string>} eggs 当前槽位到鸟蛋的分配。
 * @param {readonly string[]} found 已找到的鸟蛋。
 * @param {readonly {id: string, page: string}[]} slots 目标页可用的槽位。
 * @param {() => number} [random] 返回 [0, 1) 的随机源，测试可注入。
 * @return {Record<string, string>} 迁移后的槽位分配。
 */
export function relocateUnfoundBlackForestEggs(
  eggs,
  found,
  slots,
  random = Math.random,
) {
  const foundSet = new Set(Array.isArray(found) ? found : []);
  const allowedSlotIds = new Set(slots.map((slot) => slot.id));
  const entries = Object.entries(eggs ?? {});
  const occupiedSlots = new Set(entries.map(([slot]) => slot));
  const candidates = slots
    .map((slot) => slot.id)
    .filter((slot) => !occupiedSlots.has(slot));
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = candidates[index];
    candidates[index] = candidates[swap];
    candidates[swap] = current;
  }
  /** @type {Record<string, string>} */
  const relocated = {};
  entries.forEach(([slot, egg]) => {
    if (foundSet.has(egg) || allowedSlotIds.has(slot)) {
      relocated[slot] = egg;
      return;
    }
    const nextSlot = candidates.pop();
    relocated[nextSlot ?? slot] = egg;
  });
  return relocated;
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
 * @return {{bird: string, labelKey: string, spine: string}|undefined} 蛋的资料。
 */
function blackForestEggInfo(key) {
  return /** @type {Record<string, {bird: string, labelKey: string, spine: string}>} */ (
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
  /** @type {Array<((index: number, key: string) => void)|undefined>} */
  let endCallbacks = [];
  const firedEndCallbacks = new Set();
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
   * 在每段 CG 结束时执行一次回调。
   *
   * @param {number} elapsed 已播放时长。
   */
  const runEndCallbacks = (elapsed) => {
    timeline.forEach((segment, index) => {
      if (elapsed < segment.endMs || firedEndCallbacks.has(index)) return;
      firedEndCallbacks.add(index);
      endCallbacks[index]?.(index, segment.key);
    });
  };

  /**
   * 按已播放时长刷新画面；供测试直接驱动时间线。
   *
   * @param {number} elapsedMs 已播放时长。
   */
  const renderAt = (elapsedMs) => {
    const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    runEndCallbacks(elapsed);
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
     * @param {Array<((index: number, key: string) => void)|undefined>} [callbacks] 每段 CG 结束时的回调。
     * @return {Promise<void>} 整段 CG 播完时完成。
     */
    play(keys, callbacks) {
      if (active) return Promise.resolve();
      timeline = blackForestCgTimeline(keys);
      if (timeline.length === 0) return Promise.resolve();
      playedSounds.clear();
      endCallbacks = Array.isArray(callbacks) ? [...callbacks] : [];
      firedEndCallbacks.clear();
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
  /** @type {Array<{node: any, original: any, overflowHost: any, stage: any, visibilityObserver: any}>} */
  const mountedEggs = [];

  /** @return {any} 宿主 document。 */
  const document = () =>
    shared.document?.() ?? /** @type {any} */ (globalThis).document;

  /**
   * 汇总固定槽位与当前页面实际存在的动态槽位。
   *
   * @return {Array<{id: string, page: string}>} 可参与随机分配的槽位。
   */
  const availableSlots = () => {
    const slots = new Map(
      blackForestIconSlots.map((slot) => [slot.id, slot]),
    );
    const nodes = document()?.querySelectorAll?.(
      '[data-lobotomy-corp-black-forest-slot]',
    ) ?? [];
    Array.from(nodes).forEach((node) => {
      const id = node?.dataset?.lobotomyCorpBlackForestSlot;
      if (typeof id !== 'string' || slots.has(id)) return;
      const page = id.startsWith('history.')
        ? 'history'
        : id.startsWith('dashboard.')
        ? 'dashboard'
        : id.startsWith('settings.')
        ? 'settings'
        : 'nav';
      slots.set(id, {id, page});
    });
    return [...slots.values()];
  };

  /**
   * 读取本次可参与鸟蛋分配的页面。
   *
   * @return {Set<string>|undefined} 限制页面；未限制时返回 undefined。
   */
  const eggSlotPages = () => {
    const pages = shared.eggSlotPages?.();
    return Array.isArray(pages) ? new Set(pages) : undefined;
  };

  /**
   * 汇总当前可用于分配鸟蛋的槽位。
   *
   * @return {Array<{id: string, page: string}>} 过滤后的候选槽位。
   */
  const selectableEggSlots = () => {
    const pages = eggSlotPages();
    return availableSlots().filter((slot) =>
      pages === undefined || pages.has(slot.page)
    );
  };

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
   * @return {boolean} 本次提交触发了终末鸟事件时返回 true。
   */
  const recordSubmission = (canonicalId) => {
    if (isActive() || typeof canonicalId !== 'string') return false;
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
   * @param {{order: string[], source: string}} options 出场顺序与触发来源。
   * @return {boolean} 事件已开始返回 true。
   */
  const start = ({ order, source }) => {
    if (isActive()) return false;
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
    shared.mountRestartButton?.();
    // 事件期间冻结危急值衰减。
    shared.pauseDangerDecay?.();
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
   * @param {Array<((index: number, key: string) => void)|undefined>} [callbacks] 每段 CG 结束时的回调。
   * @return {Promise<void>} 播放结束时完成。
   */
  const playNarration = (keys, callbacks) => {
    const controller = cgPlayer();
    return controller ? controller.play(keys, callbacks) : Promise.resolve();
  };

  /** 播放开场 CG，结束后进入寻找鸟蛋阶段。 */
  const playCg = async () => {
    const order = [...(state?.order ?? [])];
    const source = state?.source;
    const keys = blackForestNarrationSequence(order);
    const forcedBirdId = source === 'two-birds'
      ? blackForestBirdInfo(order.at(-1) ?? '')?.id
      : undefined;
    /** @type {Array<(() => void)|undefined>} */
    const callbacks = keys.map(() => undefined);
    if (forcedBirdId) {
      const escapeIndex = keys.indexOf('escape');
      if (escapeIndex >= 0) {
        callbacks[escapeIndex] = () =>
          shared.settleBlackForestDanger?.([forcedBirdId]);
      }
    }
    if (source === 'direct-submission') {
      // 每只鸟在其抵达 CG 开始前的上一个 CG 结束点结算。
      keys.forEach((_key, index) => {
        const nextArrival = keys[index + 1];
        const birdId = Object.keys(blackForestBirds)
          .map((bird) => blackForestBirdInfo(bird))
          .find((bird) => bird?.arrival === nextArrival)?.id;
        if (birdId) {
          callbacks[index] = () =>
            shared.settleBlackForestDanger?.([birdId]);
        }
      });
    }
    await playNarration(keys, callbacks);
    if (!state || state.phase !== 'cg') return;
    shared.settleBlackForestDanger?.([
      blackForestAbnormalityIds.apocalypseBird,
    ]);
    state.phase = 'hunt';
    state.eggs = blackForestEggAssignment(
      shared.random ?? Math.random,
      selectableEggSlots(),
    );
    persist();
    // 原作在终末鸟出现时改写玩家身份；网页沿用既有的显示名称机制。
    shared.applyDisplayName?.(blackForestAbnormalityIds.apocalypseBird);
    mountEggs();
  };

  /**
   * 把尚未找到的鸟蛋限制到白夜可见页面的槽位。
   *
   * 白夜会锁住当前标签页，因此迁移时保留已找到记录，以及设置页和导航栏的现有分配，
   * 只随机移动其它页面上的未找到鸟蛋。
   *
   * @return {boolean} 当前处于寻找阶段并执行了限制时返回 true。
   */
  const restrictHuntToWhiteNightPages = () => {
    if (!state || state.phase !== 'hunt') return false;
    const visibleSlots = availableSlots().filter((slot) =>
      slot.page === 'settings' || slot.page === 'nav'
    );
    if (visibleSlots.length === 0) return false;
    state.eggs = relocateUnfoundBlackForestEggs(
      state.eggs,
      state.found,
      visibleSlots,
      shared.random ?? Math.random,
    );
    persist();
    mountEggs();
    return true;
  };

  /**
   * 用鸟蛋替换一个图标槽位。
   *
   * 先量出图标原本的占位尺寸，再把它藏起来、用同尺寸的按钮承载 Spine 画布，结束后
   * 可以原样还原。
   *
   * @param {any} node 图标槽位节点。
   * @param {string} egg 蛋的键。
   * @return {{node: any, original: any, overflowHost: any, stage: any, visibilityObserver: any}} 还原所需的信息。
   */
  const mountEgg = (node, egg) => {
    const host = document();
    const bounds = node.getBoundingClientRect?.();
    const overflowHost = node.closest?.('.notification-option-row');
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
    const stage = createBlackForestEggSpineStage({
      assetRoot: shared.assetRoot,
      document: host,
      egg: info?.spine ?? '',
      globalObject: shared.globalObject,
      height: bounds?.height,
      width: bounds?.width,
    });
    if (overflowHost?.dataset) {
      overflowHost.dataset.lobotomyCorpBlackForestOverflow = 'true';
    }
    const visibilityObserver = typeof globalThis.MutationObserver === 'function' &&
        overflowHost
      ? new globalThis.MutationObserver(() => stage?.resize?.())
      : undefined;
    visibilityObserver?.observe(overflowHost, {
      attributeFilter: ['class', 'hidden'],
      attributes: true,
    });
    if (stage?.canvas) button.append(stage.canvas);
    button.addEventListener('click', onEggClick);
    button.addEventListener('keydown', onEggKeyDown);
    // 原图标留在原处、只隐藏占位，结束后按原样恢复。
    node.style.setProperty('display', 'none');
    node.parentElement?.insertBefore(button, node);
    return {
      node: button,
      original: node,
      overflowHost,
      stage,
      visibilityObserver,
    };
  };

  /**
   * 处理一次鸟蛋点击。
   *
   * @param {any} event 点击事件。
   */
  const onEggClick = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
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
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    onEggClick(event);
  };

  /**
   * 还原一个已挂载的鸟蛋节点。
   *
   * @param {{node: any, original: any, overflowHost: any, stage: any, visibilityObserver: any}} mounted 鸟蛋挂载记录。
   */
  const restoreMountedEgg = (mounted) => {
    const index = mountedEggs.indexOf(mounted);
    if (index < 0) return;
    mountedEggs.splice(index, 1);
    mounted.visibilityObserver?.disconnect?.();
    if (mounted.overflowHost?.dataset) {
      delete mounted.overflowHost.dataset.lobotomyCorpBlackForestOverflow;
    }
    mounted.stage?.dispose?.();
    mounted.original?.style?.removeProperty?.('display');
    mounted.node.remove?.();
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
      const mounted = mountEgg(node, egg);
      mountedEggs.push(mounted);
      if (mounted.stage?.ready) {
        void /** @type {Promise<boolean>} */ (mounted.stage.ready).then(
          (ready) => {
            if (!ready) restoreMountedEgg(mounted);
          },
        );
      }
    });
  };

  /** 还原所有被鸟蛋替换掉的图标。 */
  const unmountEggs = () => {
    [...mountedEggs].forEach(restoreMountedEgg);
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
   * 清除头像框上的「破晓」以及对应的奖励存档。
   *
   * 事件进行期间只关闭奖励标记，保留当前事件进度；事件已经完成时，只保存奖励的
   * `done` 存档会一并删除。
   */
  const clearGift = () => {
    const host = document();
    host?.querySelectorAll?.('.lobotomy-corp-black-forest-gift')
      .forEach((/** @type {any} */ gift) => gift.remove?.());
    if (!state) return;
    if (state.phase === 'done') {
      state = undefined;
      clearPersisted();
      return;
    }
    state.gift = false;
    persist();
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
    shared.finishRestartButton?.();
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
    shared.mountRestartButton?.();
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
    clearGift,
    clearPersisted,
    finish,
    getId: () => state?.id,
    getPhase,
    isActive,
    isRecording: () => state?.phase === 'recording',
    persisted,
    recordSubmission,
    restrictHuntToWhiteNightPages,
    resetBirdRecord,
    restore,
    start,
  });
}
