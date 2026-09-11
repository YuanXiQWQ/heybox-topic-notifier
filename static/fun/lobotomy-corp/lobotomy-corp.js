/**
 * @file 本文件提供修改显示名称时触发的《脑叶公司》Trumpet 警报彩蛋。
 */

import {
  createWhiteNightEvent,
  whiteNightDeathSounds,
} from './Events/WhiteNight.js';
import {
  lobotomyCorpCanvasScaleForViewport,
  lobotomyCorpCanvasViewportForUpdate,
  lobotomyCorpViewportSize,
} from './Events/CanvasScaler.js';
import {
  abnormalityEscapeDangerContribution,
  clampDangerScore,
  employeeCountForDepartments,
  employeeDangerContribution,
  escapableAbnormalitySummary,
  escapeAllDangerContribution,
  whiteNightApostleCount,
  whiteNightDangerPoints,
} from './Events/DangerScore.js';
import {
  createDontTouchMeShutdown,
  dontTouchMeEscapeEffect,
  dontTouchMeKillEffect,
  dontTouchMePanicEffect,
} from './Events/DontTouchMe.js';

/**
 * 白夜被镇压后，后台 Trumpet 从 ducked 音量恢复到正常音量所需时长（毫秒）。
 *
 * 淡出时长（`lobotomyCorpSpecialEventMusicFadeOutMs`）与该值独立配置，
 * 不对应原作 `DeathAngel.UniqueEscape()` 的 `_bgmFadeTime`。
 */
const lobotomyCorpSpecialEventMusicFadeInMs = 2000;

/**
 * 白夜特殊阶段把正在播放的 Trumpet 淡出到后台 ducked hold 所需时长（毫秒）。
 *
 * 依据：原作 WhiteNight 的 `DeathAngel.UniqueEscape()` 用 1 秒的 `_bgmFadeTime`
 * 对特殊事件音乐做淡入 / 淡出，本值沿用该 1 秒；不使用 BgmManager 的
 * fadeTime（那是通用战斗 BGM 的 2 秒淡入淡出，不是白夜特殊事件音乐）。
 */
const lobotomyCorpSpecialEventMusicFadeOutMs = 1000;

/**
 * 白夜 active 期间 Trumpet 保留的正常音量比例。
 *
 * WhiteNight active 时把 Trumpet 压到正常音量的 25%，用于突出白夜 church BGM
 * （Lucifer_standbg0）。淡出终点、held 音量与刷新恢复都读取该常量。
 */
const lobotomyCorpWhiteNightAlertDuckVolume = 0.25;

/**
 * 计算两个音量之间的线性插值结果。
 *
 * 白夜的淡出与淡入都使用同一个公式；它支持任意目标音量，
 * 因此也能表示「淡到 duck 目标音量」这类非零终点的渐变。
 *
 * @param {number} startVolume 起始音量。
 * @param {number} targetVolume 目标音量。
 * @param {number} progress 0～1 的进度。
 * @return {number} 插值后的音量。
 */
function lobotomyCorpInterpolateAlertVolume(
    startVolume,
    targetVolume,
    progress,
) {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return startVolume + (targetVolume - startVolume) * clampedProgress;
}

/**
 * 计算 WhiteNight 淡出中途恢复时的起始音量。
 *
 * 淡出固定从正常音量 1 插值到 duck 目标音量：剩余比例为 1 时输出 1.0，
 * 剩余比例为 0 时输出 duck 目标音量。刷新恢复复用同一公式，避免插值实现分散。
 *
 * @param {number} remainingRatio 剩余淡出比例（1 = 刚开始，0 = 已完成）。
 * @return {number} 该时刻的理论音量。
 */
function lobotomyCorpAlertMusicFadeOutStartVolume(remainingRatio) {
  return lobotomyCorpInterpolateAlertVolume(
      lobotomyCorpWhiteNightAlertDuckVolume,
      1,
      remainingRatio,
  );
}

/**
 * 网页项目为持续危急值警报增加的曲目重播静默间隔（毫秒），并非原作硬编码参数。
 */
const lobotomyCorpDangerAlertReplayGapMs = 5000;

/**
 * 《脑叶公司》解包资源的公共访问根路径。
 */
const lobotomyCorpAssetRoot = '/static/fun/lobotomy-corp/Assets';

/** 当前页面已准备的《脑叶公司》专用文本。 */
let lobotomyCorpMessages;

/** 当前页面已准备的通用异想体资料。 */
let lobotomyCorpAbnormalities;

/** 规范化名称到 canonical 异想体编号的查找索引。 */
let lobotomyCorpAbnormalityIndex;

/** 所有维护语言提供的“赎罪”特殊工作别名。 */
let lobotomyCorpConfessionAliases = new Set();

/**
 * 读取服务端内联注入的 JSON 文本。
 *
 * @param {string} elementId 内联数据元素的 id。
 * @return {string|undefined} 注入的文本；页面缺少该元素或文本为空时返回 undefined。
 */
function lobotomyCorpEmbeddedText(elementId) {
  const text = globalThis.document?.getElementById?.(elementId)?.textContent;
  return typeof text === 'string' && text ? text : undefined;
}

/** 初始化服务端注入的《脑叶公司》当前本地化。 */
function initializeLobotomyCorpData() {
  const serialized = lobotomyCorpEmbeddedText('lobotomy-corp-locale-data');
  if (!serialized) {
    throw new Error('《脑叶公司》彩蛋本地化尚未注入页面。');
  }
  lobotomyCorpMessages = JSON.parse(serialized);

  const abnormalitiesSerialized = lobotomyCorpEmbeddedText(
      'lobotomy-corp-abnormalities-data',
  );
  lobotomyCorpAbnormalities = abnormalitiesSerialized
      ? JSON.parse(abnormalitiesSerialized)
      : {};
  lobotomyCorpAbnormalityIndex = new Map();
  Object.entries(lobotomyCorpAbnormalities).forEach(([canonicalId, data]) => {
    [canonicalId, ...(Array.isArray(data?.aliases) ? data.aliases : [])]
        .filter((name) => typeof name === 'string')
        .forEach((name) =>
            lobotomyCorpAbnormalityIndex.set(
                normalizeLobotomyCorpAbnormalityName(name),
                canonicalId,
            )
        );
  });
  const confessionAliasesSerialized = lobotomyCorpEmbeddedText(
      'lobotomy-corp-confession-aliases-data',
  );
  try {
    const aliases = confessionAliasesSerialized
        ? JSON.parse(confessionAliasesSerialized)
        : [];
    lobotomyCorpConfessionAliases = new Set(
        Array.isArray(aliases)
            ? aliases.filter((alias) => typeof alias === 'string').map(
                normalizeLobotomyCorpAbnormalityName,
            )
            : [],
    );
  } catch {
    lobotomyCorpConfessionAliases = new Set();
  }
}

initializeLobotomyCorpData();

/**
 * 《脑叶公司》最终渲染 Sprite 的公共访问目录。
 */
const lobotomyCorpSpriteRoot = `${lobotomyCorpAssetRoot}/Sprite`;

/**
 * 原版警报框沿三条对角边重复显示的文本。
 */
const lobotomyCorpAlertText = 'ALERT '.repeat(85);

/**
 * Unity Corner RectTransform 的未缩放尺寸。
 */
const lobotomyCorpCornerSize = 446;

/**
 * First / Second / Third Trumpet 的原版 EmergencyImage RectTransform。
 *
 * Fourth Trumpet 为本项目扩展，不使用此原版布局时会通过 alert.riskRect 覆盖位置或尺寸。
 */
const lobotomyCorpOriginalRiskRect = Object.freeze({
  anchorX: 0.5,
  anchorY: 0.5,
  anchoredX: 125,
  anchoredY: -125,
  height: 150,
  pivotX: 0.5,
  pivotY: 0.5,
  rotation: 135,
  width: 150,
});

/**
 * 顶部结束面板所需的原版 Sprite 文件名。
 */
const lobotomyCorpTopPanelSpriteFiles = Object.freeze([
  'Risk_Frame_Inner.png',
  'Risk_Frame_Outter.png',
  'Valve.png',
]);

/**
 * RestartButton 在 Normal 与 Pressed 状态下的 Unity Image.color。
 */
const lobotomyCorpRestartButtonTints = Object.freeze({
  normal: [0, 234, 219],
  pressed: [5, 174, 164],
});

/**
 * 一条警报的等级、视觉与音频配置。
 *
 * 四条 Trumpet 共用同一形状；`riskTint` / `riskRect` 只由项目自定义的 Fourth 覆盖，
 * 其余警报沿用原 prefab 的图标布局与颜色。
 *
 * @typedef {object} LobotomyCorpAlert
 * @property {string} assetDirectory 会话与已染色资源使用的资源目录名。
 * @property {string} emergencyColor 四角 EmergencyText 的颜色。
 * @property {[number, number, number]} emergencyTint 四角图标的 Unity Image.color（0-255）。
 * @property {number} level 1 到 4 的音乐与 HUD 等级。
 * @property {string} riskFile 中心 EmergencyImage 的文件名。
 * @property {{anchoredX: number, anchoredY: number, height: number, width: number}} [riskRect] 自定义图标布局。
 * @property {[number, number, number]} [riskTint] 自定义图标的 Unity Image.color（0-255）。
 * @property {string} soundPath 相对于 Assets 的音频路径。
 * @property {string} trumpetLevel 四角显示的等级文本。
 */

/**
 * 警报口令、等级视觉参数与音频资源路径的对应关系。
 *
 * @type {Readonly<Record<string, LobotomyCorpAlert>>}
 */
const lobotomyCorpAlerts = Object.freeze({
  firsttrumpet: {
    assetDirectory: 'first-trumpet',
    emergencyColor: '#FCC93A',
    emergencyTint: [252, 201, 58],
    level: 1,
    riskFile: 'Risk_1.png',
    soundPath: 'Resources/sounds/bgm/emergency01_mast.ogg',
    trumpetLevel: 'First\nTrumpet',
  },
  secondtrumpet: {
    assetDirectory: 'second-trumpet',
    emergencyColor: '#FC773A',
    emergencyTint: [252, 119, 58],
    level: 2,
    riskFile: 'Risk_2.png',
    soundPath: 'Resources/sounds/bgm/emergency02_mast.ogg',
    trumpetLevel: 'Second\nTrumpet',
  },
  thirdtrumpet: {
    assetDirectory: 'third-trumpet',
    emergencyColor: '#FC3A3A',
    emergencyTint: [252, 58, 58],
    level: 3,
    riskFile: 'Risk_3.png',
    soundPath: 'Resources/sounds/bgm/emergency03_mast.ogg',
    trumpetLevel: 'Third\nTrumpet',
  },
  fourthtrumpet: {
    assetDirectory: 'fourth-trumpet',
    emergencyColor: '#00EADB',
    emergencyTint: [0, 234, 219],
    level: 4,
    riskFile: 'MiddleArea_4_27.png',
    // Fourth 为项目自定义警报。此布局将近圆形图标移至 Triangle_1 内侧三角形的内心附近。
    riskRect: {
      anchoredX: 122,
      anchoredY: -116,
      height: 110,
      width: 110,
    },
    riskTint: [0, 234, 219],
    soundPath: 'Resources/sounds/bgm/emergency04_mast.wav',
    trumpetLevel: 'Fourth\nTrumpet',
  },
});

/**
 * Unity EmergencyController 中四个 Corner 的层级与变换配置。
 */
const lobotomyCorpCornerDefinitions = Object.freeze([
  {
    alertTextRect: {
      anchorX: 0.42600003,
      anchorY: 0.6147265,
      anchoredX: 441.00006,
      anchoredY: 440.99997,
      height: 45,
      pivotX: 0.5,
      pivotY: 0.5,
      rotation: -45,
      width: 2000,
    },
    position: 'left-up',
    triangleFile: 'Triangle_1.png',
  },
  {
    alertTextRect: {
      anchorX: 0.42824218,
      anchorY: 0.39227358,
      anchoredX: -469,
      anchoredY: 468.99997,
      height: 45,
      pivotX: 0.5,
      pivotY: 0.5,
      rotation: -135,
      width: 2000,
    },
    position: 'left-down',
    triangleFile: 'Triangle_1.png',
  },
  {
    position: 'right-up',
    triangleFile: 'Triangle_2.png',
  },
  {
    alertTextRect: {
      anchorX: 0.5922422,
      anchorY: 0.4104843,
      anchoredX: -484,
      anchoredY: -484,
      height: 45,
      pivotX: 0.5,
      pivotY: 0.5,
      rotation: 135,
      width: 2000,
    },
    position: 'right-down',
    triangleFile: 'Triangle_1.png',
  },
]);

/**
 * 已按 Unity Image.color 染色的 Triangle 数据 URL 缓存。
 */
const lobotomyCorpTintedTriangleSources = new Map();

/**
 * 已按 Unity Image.color 染色的 EmergencyImage 数据 URL 缓存。
 */
const lobotomyCorpTintedRiskSources = new Map();

/**
 * 已按 RestartButton 状态逐像素染色的 End_1 数据 URL 缓存。
 */
const lobotomyCorpTintedRestartButtonSources = new Map();

/**
 * 预加载字体、Sprite 与逐像素染色缓存的共享任务。
 */
let lobotomyCorpVisualAssetPreparation;

/**
 * 《脑叶公司》在跨游戏彩蛋协调器中的唯一标识。
 */
const lobotomyCorpEasterEggGameId = 'lobotomy-corp';

/**
 * 当前浏览会话中脑叶公司警报的存储键。
 */
const lobotomyCorpAlertSessionKey = 'warmnest.lobotomy-corp-alert';

/** 当前 Day 的最小运行时持久化键。 */
const lobotomyCorpDaySessionKey = 'warmnest.lobotomy-corp-day';

/** 当前脑叶公司特殊事件的持久化键。 */
const lobotomyCorpSpecialEventSessionKey =
    'warmnest.lobotomy-corp-special-event';

/** 白夜特殊事件的唯一标识。 */
const lobotomyCorpWhiteNightEventId = 'white-night';

/** 模拟 11 名普通使徒对应员工死亡：11 × 4 = 44；第 12 名背叛者不走该死亡流程。 */
const lobotomyCorpWhiteNightPreludeDangerContribution =
    employeeDangerContribution('death', whiteNightApostleCount);

/** 白夜 Simple Advent 逻辑结束时的固定出逃危急值。 */
const lobotomyCorpWhiteNightActiveDangerContribution = whiteNightDangerPoints;

/**
 * 当前正在播放的脑叶公司警报及其结束操作。
 */
let activeLobotomyCorpAlert;

/** 当前独立于四角警报显示的 Restart Day 顶部面板。 */
let activeLobotomyCorpRestartPanel;

/**
 * 当前脑叶公司彩蛋的危急值，始终为 0 到 100 的有限数值。
 */
let lobotomyCorpDangerScore = 0;

/**
 * 本次连续 Danger Emergency 已经达到的最高 **音乐** Trumpet 等级；0 表示当前没有进行中的 Emergency。
 *
 * 语义边界：
 * - 该变量只代表 Danger 循环音乐（music high-water），不代表 HUD 等级；
 * - HUD 等级由当前 Danger Score 的实时阈值决定（见 lobotomyCorpDangerVisualAlert）；
 * - 同一场 Emergency 的循环音乐只升不降，Danger 下降不改变下一轮曲目；
 * - Danger 跌破一级警报阈值（低于 10）时本次 Emergency 结束，该变量清零。
 */
let lobotomyCorpDangerMusicHighWaterLevel = 0;

/** 当前 Day 已贡献危急值的 canonical 异想体编号。 */
let lobotomyCorpBreachedAbnormalitiesThisDay = new Set();

/** 当前 Day 为普通异想体贡献快照的部门数；手动警报 Day 可暂未初始化。 */
let lobotomyCorpDayDepartmentCount;

/** 当前 Day 的白夜危急值结算阶段，防止刷新或演出回调重复加分。 */
let lobotomyCorpWhiteNightDangerSettlementStage;

/** 正向 Danger 贡献后开始衰减前的截止时间戳。 */
let lobotomyCorpDangerDecayGraceDeadline;

/** 白夜冻结期间距离下一次 Danger 衰减尚余的毫秒数。 */
let lobotomyCorpDangerDecayPausedRemainingMs;

/** 当前 Danger 衰减所登记的唯一计时器。 */
let lobotomyCorpDangerDecayTimer;

/** 已注册的 canonical 异想体提交观察者。 */
const lobotomyCorpAbnormalitySubmissionListeners = new Set();

/** 风险等级对应的原版 Sprite 文件名。 */
const lobotomyCorpRiskSpriteByLevel = Object.freeze({
  ALEPH: 'Risk_Aleph.png',
  HE: 'Risk_He.png',
  TETH: 'Risk_Teth.png',
  WAW: 'Risk_Waw.png',
  ZAYIN: 'Risk_Zayin.png',
});

/**
 * 规范化异想体编号与别名：只处理 Unicode、首尾空白和大小写。
 *
 * @param {string} value 待匹配的显示名称。
 * @return {string} 用于 lookup 的键。
 */
function normalizeLobotomyCorpAbnormalityName(value) {
  return String(value).normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

/**
 * 查找显示名称对应的 canonical 异想体资料。
 *
 * @param {string} value 待识别的显示名称。
 * @return {{canonicalId: string, abnormality: object}|undefined} canonical 编号和资料。
 */
function matchingLobotomyCorpAbnormality(value) {
  const canonicalId = lobotomyCorpAbnormalityIndex.get(
      normalizeLobotomyCorpAbnormalityName(value),
  );
  const abnormality = canonicalId && lobotomyCorpAbnormalities[canonicalId];
  return abnormality ? {canonicalId, abnormality} : undefined;
}

/**
 * 将网页 locale 映射为异想体资料支持的 locale。
 *
 * @param {string|undefined} locale 页面语言。
 * @return {string} 异想体资料的 locale。
 */
function lobotomyCorpAbnormalityLocale(locale) {
  const aliases = {
    'en-CA': 'en-US',
    'en-GB': 'en-US',
    'zh-HK': 'zh-TW',
    'zh-MO': 'zh-TW',
    'zh-SG': 'zh-CN',
  };
  const supported = new Set([
    'en-US',
    'zh-CN',
    'zh-TW',
    'ja-JP',
    'ko-KR',
    'ru-RU',
    'es-ES',
    'bg-BG',
    'vi-VN',
  ]);
  const resolved = aliases[locale] ?? locale;
  return supported.has(resolved) ? resolved : 'en-US';
}

/**
 * 获取异想体在当前页面语言下的名称。
 *
 * @param {{names?: Record<string, string>}} abnormality 异想体资料。
 * @return {string} 本地化名称或英语回退。
 */
function lobotomyCorpAbnormalityName(abnormality) {
  const locale = lobotomyCorpAbnormalityLocale(
      globalThis.document?.documentElement?.lang,
  );
  return abnormality.names?.[locale] || abnormality.names?.['en-US'] || '';
}

/**
 * 规范化警报口令，忽略大小写、空格和连字符。
 *
 * @param {string} value 待匹配的用户名或显示名称。
 * @return {string} 用于匹配的标准化口令。
 */
function normalizeLobotomyCorpAlertName(value) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(
      /[\s-]+/gu,
      '',
  );
}

/**
 * 查找名称对应的脑叶公司警报。
 *
 * @param {string} value 待匹配的用户名或显示名称。
 * @return {LobotomyCorpAlert|undefined} 匹配的警报配置。
 */
function matchingLobotomyCorpAlert(value) {
  return lobotomyCorpAlerts[normalizeLobotomyCorpAlertName(value)];
}

/**
 * 查找已持久化配置对应的脑叶公司警报。
 *
 * @param {string} assetDirectory 警报资源目录。
 * @return {LobotomyCorpAlert|undefined} 匹配的警报配置。
 */
function lobotomyCorpAlertByAssetDirectory(assetDirectory) {
  return Object.values(lobotomyCorpAlerts).find((alert) =>
      alert.assetDirectory === assetDirectory
  );
}

/**
 * 读取可用的浏览器存储。会话存储负责当前标签页，localStorage 用于浏览器意外清空会话存储时的跨页兜底。
 *
 * @return {Storage[]} 可用的存储实例。
 */
function lobotomyCorpAlertStorages() {
  const storages = new Set();
  ['sessionStorage', 'localStorage'].forEach((storageName) => {
    try {
      const storage = globalThis[storageName];
      if (
          storage && typeof storage.getItem === 'function' &&
          typeof storage.setItem === 'function' &&
          typeof storage.removeItem === 'function'
      ) {
        storages.add(storage);
      }
    } catch {
      // 隐私模式可能拒绝访问其中一种存储，继续尝试另一种。
    }
  });
  return [...storages];
}

/**
 * 保存正在播放的警报，使页面切换后能够继续恢复。
 *
 * HUD 与音乐分开保存：`visualAssetDirectory` 决定恢复时的四角警报框，
 * `musicAssetDirectory` 决定恢复时的曲目，两者允许属于不同等级。
 *
 * @param {{assetDirectory: string}|undefined} visualAlert 当前 HUD 警报；没有 HUD 时为 undefined。
 * @param {{assetDirectory: string}} musicAlert 当前实际音乐对应的逻辑警报。
 * @param {number} startedAt 警报开始的时间戳。
 * @param {number} position 当前音频播放进度（秒）。
 * @param {'danger'|'direct'} musicSource 当前实际音乐 owner。
 * @param {'normal-playing'|'replay-intermission'|'special-event-held'} [playbackState] 当前特殊音频语义。
 * @param {number|undefined} replayAt Danger 重播间隔结束的绝对时间戳。
 * @param {boolean} [directSession] 当前会话是否由 Direct 指令建立。
 */
function persistLobotomyCorpAlert(
    visualAlert,
    musicAlert,
    startedAt,
    position,
    musicSource,
    playbackState = 'normal-playing',
    replayAt,
    directSession = false,
) {
  const serialized = JSON.stringify({
    directSession,
    musicAssetDirectory: musicAlert.assetDirectory,
    musicSource,
    playbackState,
    position,
    replayAt,
    startedAt,
    visualAssetDirectory: visualAlert?.assetDirectory ?? null,
  });
  lobotomyCorpAlertStorages().forEach((storage) =>
      storage.setItem(lobotomyCorpAlertSessionKey, serialized)
  );
}

/**
 * 清除已结束警报的会话状态。
 */
function clearPersistedLobotomyCorpAlert() {
  lobotomyCorpAlertStorages().forEach((storage) =>
      storage.removeItem(lobotomyCorpAlertSessionKey)
  );
}

/**
 * 持久化当前连续 Day；身份 UI 由已保存的显示名称派生，不写入这里。
 *
 * `dangerMusicHighWaterLevel` 只保存 Danger 循环音乐的高水位；HUD 等级在恢复时
 * 由当前 `dangerScore` 重新计算，不写入存储。
 */
function persistLobotomyCorpDay() {
  if (lobotomyCorpDangerScore <= 0) {
    clearPersistedLobotomyCorpDay();
    return;
  }
  const serialized = JSON.stringify({
    countedAbnormalityIds: [...lobotomyCorpBreachedAbnormalitiesThisDay],
    ...(lobotomyCorpDangerMusicHighWaterLevel > 0
        ? {
          dangerMusicHighWaterLevel: lobotomyCorpDangerMusicHighWaterLevel,
        }
        : {}),
    ...(lobotomyCorpDangerDecayGraceDeadline === undefined
        ? {}
        : {decayGraceDeadline: lobotomyCorpDangerDecayGraceDeadline}),
    ...(lobotomyCorpDangerDecayPausedRemainingMs === undefined ? {} : {
      decayPausedRemainingMs: lobotomyCorpDangerDecayPausedRemainingMs,
    }),
    ...(lobotomyCorpDayDepartmentCount === undefined
        ? {}
        : {departmentCount: lobotomyCorpDayDepartmentCount}),
    ...(lobotomyCorpWhiteNightDangerSettlementStage === undefined ? {} : {
      whiteNightDangerSettlementStage:
      lobotomyCorpWhiteNightDangerSettlementStage,
    }),
    dangerScore: lobotomyCorpDangerScore,
  });
  lobotomyCorpAlertStorages().forEach((storage) =>
      storage.setItem(lobotomyCorpDaySessionKey, serialized)
  );
}

/**
 * 清除已结束 Day 的运行时资料。
 */
function clearPersistedLobotomyCorpDay() {
  lobotomyCorpAlertStorages().forEach((storage) =>
      storage.removeItem(lobotomyCorpDaySessionKey)
  );
}

/**
 * 从内部页面导航保留下来的资料恢复 Day。
 */
function restorePersistedLobotomyCorpDay() {
  const serialized = lobotomyCorpAlertStorages().map((storage) =>
      storage.getItem(lobotomyCorpDaySessionKey)
  ).find((value) => Boolean(value));
  if (!serialized) {
    return;
  }
  try {
    const saved = JSON.parse(serialized);
    const score = saved?.dangerScore;
    const ids = saved?.countedAbnormalityIds;
    // 旧字段 dangerEmergencyLevel 的语义与 dangerMusicHighWaterLevel 相同。
    const dangerMusicHighWaterLevel = saved?.dangerMusicHighWaterLevel ??
        saved?.dangerEmergencyLevel;
    const departmentCount = saved?.departmentCount;
    const decayGraceDeadline = saved?.decayGraceDeadline;
    const decayPausedRemainingMs = saved?.decayPausedRemainingMs;
    const whiteNightDangerSettlementStage = saved
        ?.whiteNightDangerSettlementStage;
    if (
        typeof score !== 'number' || !Number.isFinite(score) || score <= 0 ||
        score > 100 ||
        !Array.isArray(ids) || !ids.every((id) => typeof id === 'string') ||
        (dangerMusicHighWaterLevel !== undefined &&
            (!Number.isInteger(dangerMusicHighWaterLevel) ||
                dangerMusicHighWaterLevel < 1 ||
                dangerMusicHighWaterLevel > 3)) ||
        (departmentCount !== undefined &&
            (!Number.isInteger(departmentCount) || departmentCount < 1 ||
                departmentCount > 11)) ||
        (decayGraceDeadline !== undefined &&
            (!Number.isFinite(decayGraceDeadline) || decayGraceDeadline < 0)) ||
        (decayPausedRemainingMs !== undefined &&
            (!Number.isFinite(decayPausedRemainingMs) ||
                decayPausedRemainingMs < 0)) ||
        (decayGraceDeadline !== undefined &&
            decayPausedRemainingMs !== undefined) ||
        (whiteNightDangerSettlementStage !== undefined &&
            whiteNightDangerSettlementStage !== 'prelude-settled' &&
            whiteNightDangerSettlementStage !== 'active-settled')
    ) {
      clearPersistedLobotomyCorpDay();
      return;
    }
    lobotomyCorpDangerScore = score;
    lobotomyCorpDangerMusicHighWaterLevel = dangerMusicHighWaterLevel ?? 0;
    lobotomyCorpBreachedAbnormalitiesThisDay = new Set(ids);
    lobotomyCorpDayDepartmentCount = departmentCount;
    lobotomyCorpDangerDecayGraceDeadline = decayGraceDeadline;
    lobotomyCorpDangerDecayPausedRemainingMs = decayPausedRemainingMs;
    lobotomyCorpWhiteNightDangerSettlementStage =
        whiteNightDangerSettlementStage;
    // 恢复后 music high-water 至少为当前实时阈值；Danger 较低时不会降低已保存的等级。
    syncLobotomyCorpDangerMusicHighWater(score);
  } catch {
    clearPersistedLobotomyCorpDay();
  }
}

/**
 * 清理 Day 的危急值、去重记录与持久化状态。
 */
function clearLobotomyCorpDay() {
  clearLobotomyCorpDangerDecay();
  lobotomyCorpDangerScore = 0;
  lobotomyCorpDangerMusicHighWaterLevel = 0;
  lobotomyCorpBreachedAbnormalitiesThisDay.clear();
  lobotomyCorpDayDepartmentCount = undefined;
  lobotomyCorpWhiteNightDangerSettlementStage = undefined;
  clearPersistedLobotomyCorpDay();
}

/**
 * 清除唯一的 Danger 衰减计时器和 grace deadline。
 */
function clearLobotomyCorpDangerDecay() {
  if (lobotomyCorpDangerDecayTimer !== undefined) {
    clearTimeout(lobotomyCorpDangerDecayTimer);
    lobotomyCorpDangerDecayTimer = undefined;
  }
  lobotomyCorpDangerDecayGraceDeadline = undefined;
  lobotomyCorpDangerDecayPausedRemainingMs = undefined;
}

/**
 * 让 Danger 以原版规则进入下一次衰减；白夜 active 时保持冻结。
 *
 * @param {number} delay 下一次衰减前的毫秒数。
 */
function scheduleLobotomyCorpDangerDecay(delay) {
  if (lobotomyCorpDangerDecayTimer !== undefined) {
    clearTimeout(lobotomyCorpDangerDecayTimer);
  }
  if (lobotomyCorpDangerScore <= 0 || lobotomyCorpWhiteNightEvent?.isActive()) {
    lobotomyCorpDangerDecayTimer = undefined;
    return;
  }
  lobotomyCorpDangerDecayGraceDeadline = Date.now() + Math.max(0, delay);
  lobotomyCorpDangerDecayPausedRemainingMs = undefined;
  persistLobotomyCorpDay();
  lobotomyCorpDangerDecayTimer = setTimeout(() => {
    lobotomyCorpDangerDecayTimer = undefined;
    if (
        lobotomyCorpWhiteNightEvent?.isActive() || lobotomyCorpDangerScore <= 0
    ) return;
    const remainingGrace = (lobotomyCorpDangerDecayGraceDeadline ?? 0) -
        Date.now();
    if (remainingGrace > 0) {
      scheduleLobotomyCorpDangerDecay(remainingGrace);
      return;
    }
    void setLobotomyCorpDangerScore(
        Math.max(0, lobotomyCorpDangerScore - 1),
        undefined,
        {isDecay: true},
    );
    if (lobotomyCorpDangerScore > 0) scheduleLobotomyCorpDangerDecay(5000);
  }, Math.max(0, delay));
}

/**
 * 记录一次正向 Danger 贡献：原版规则要求重新等待 30 秒。
 */
function resetLobotomyCorpDangerDecayGrace() {
  if (lobotomyCorpWhiteNightEvent?.isActive()) {
    lobotomyCorpDangerDecayGraceDeadline = undefined;
    lobotomyCorpDangerDecayPausedRemainingMs = 30000;
    persistLobotomyCorpDay();
    return;
  }
  lobotomyCorpDangerDecayGraceDeadline = Date.now() + 30000;
  persistLobotomyCorpDay();
  scheduleLobotomyCorpDangerDecay(30000);
}

/**
 * 从持久化 Day 状态继续未完成的 Danger 衰减。
 */
function restoreLobotomyCorpDangerDecay() {
  if (lobotomyCorpDangerScore <= 0 || lobotomyCorpWhiteNightEvent?.isActive()) {
    return;
  }
  if (lobotomyCorpDangerDecayPausedRemainingMs !== undefined) {
    const remaining = lobotomyCorpDangerDecayPausedRemainingMs;
    lobotomyCorpDangerDecayPausedRemainingMs = undefined;
    scheduleLobotomyCorpDangerDecay(remaining);
    return;
  }
  if (lobotomyCorpDangerDecayGraceDeadline === undefined) return;
  scheduleLobotomyCorpDangerDecay(
      Math.max(0, lobotomyCorpDangerDecayGraceDeadline - Date.now()),
  );
}

/** 暂停 Danger 衰减并冻结剩余时间，供 WhiteNight breach 使用。 */
function pauseLobotomyCorpDangerDecay() {
  if (lobotomyCorpDangerDecayPausedRemainingMs !== undefined) return;
  if (lobotomyCorpDangerDecayGraceDeadline !== undefined) {
    lobotomyCorpDangerDecayPausedRemainingMs = Math.max(
        0,
        lobotomyCorpDangerDecayGraceDeadline - Date.now(),
    );
    lobotomyCorpDangerDecayGraceDeadline = undefined;
  }
  if (lobotomyCorpDangerDecayTimer !== undefined) {
    clearTimeout(lobotomyCorpDangerDecayTimer);
    lobotomyCorpDangerDecayTimer = undefined;
  }
  persistLobotomyCorpDay();
}

/**
 * 让没有 HUD 的低危急值 Day 也参与跨游戏互斥。
 */
function ensureLobotomyCorpDayCoordinator() {
  if (lobotomyCorpDangerScore > 0) {
    globalThis.easterEggCoordinator?.start(
        lobotomyCorpEasterEggGameId,
        finishLobotomyCorpDayFromCoordinator,
    );
  }
}

/**
 * 被其它游戏彩蛋中断时结束当前 Day 和可能存在的 HUD。
 */
function finishLobotomyCorpDayFromCoordinator() {
  lobotomyCorpWhiteNightEvent?.finish({restoreAlert: false});
  clearLobotomyCorpDay();
  activeLobotomyCorpAlert?.finish();
}

/**
 * 判断当前文档是否由浏览器刷新产生。
 *
 * @return {boolean} 当前页面由刷新重新加载时返回 true。
 */
function isLobotomyCorpAlertPageReload() {
  try {
    // 导航条目是 PerformanceNavigationTiming，只有它带 type 字段。
    const navigationEntry = /** @type {PerformanceNavigationTiming|undefined} */ (
        globalThis.performance?.getEntriesByType?.('navigation')[0]
    );
    return navigationEntry?.type === 'reload';
  } catch {
    return false;
  }
}

/**
 * 读取待恢复的警报状态。
 *
 * @return {{directSession: boolean, musicAlert: object, musicSource: 'danger'|'direct', playbackState: string, position: number, replayAt: number|undefined, startedAt: number, visualAlert: object|undefined}|undefined} 待恢复状态。
 */
function persistedLobotomyCorpAlert() {
  const serialized = lobotomyCorpAlertStorages().map((storage) =>
      storage.getItem(lobotomyCorpAlertSessionKey)
  ).find((value) => Boolean(value));
  if (!serialized) {
    return undefined;
  }

  try {
    const saved = JSON.parse(serialized);
    const visualAssetDirectory = saved?.visualAssetDirectory ??
        saved?.assetDirectory;
    const musicAssetDirectory = saved?.musicAssetDirectory ??
        saved?.assetDirectory;
    const visualAlert = typeof visualAssetDirectory === 'string'
        ? lobotomyCorpAlertByAssetDirectory(visualAssetDirectory)
        : undefined;
    const musicAlert = typeof musicAssetDirectory === 'string'
        ? lobotomyCorpAlertByAssetDirectory(musicAssetDirectory)
        : undefined;
    // 旧字段 source 的语义同样是音乐 owner。
    const musicSource = saved?.musicSource ?? saved?.source;
    return musicAlert && typeof saved.startedAt === 'number' &&
    Number.isFinite(saved.startedAt) &&
    typeof saved.position === 'number' &&
    Number.isFinite(saved.position)
        ? {
          directSession: typeof saved.directSession === 'boolean'
              ? saved.directSession
              : visualAlert !== undefined,
          musicAlert,
          musicSource: musicSource === 'danger' ? 'danger' : 'direct',
          // 旧值 "ingame-effect-paused" 没有对应的播放语义，一律按普通播放处理。
          playbackState: saved.playbackState === 'ingame-effect-paused'
              ? 'normal-playing'
              : saved.playbackState === 'replay-intermission'
                  ? 'replay-intermission'
                  : saved.playbackState === 'special-event-held'
                      ? 'special-event-held'
                      : 'normal-playing',
          position: saved.position,
          replayAt: typeof saved.replayAt === 'number' &&
          Number.isFinite(saved.replayAt)
              ? saved.replayAt
              : undefined,
          startedAt: saved.startedAt,
          visualAlert,
        }
        : undefined;
  } catch {
    clearPersistedLobotomyCorpAlert();
    return undefined;
  }
}

/**
 * 判断名称是否可以触发脑叶公司警报。
 *
 * @param {string} value 待匹配的用户名或显示名称。
 * @return {boolean} 可以触发警报时返回 true。
 */
function matchesLobotomyCorpAlert(value) {
  return Boolean(matchingLobotomyCorpAlert(value));
}

/**
 * 播放脑叶公司警报，并在音频结束或用户关闭后清理警报界面。
 *
 * @param {string} value 待匹配的用户名或显示名称。
 * @param {object} [preparedMedia] 在用户手势中预先准备的媒体句柄。
 * @return {Promise<boolean>} 警报结束时返回 true；未匹配警报时立即返回 true。
 */
function activateLobotomyCorpAlert(value, preparedMedia) {
  const alert = matchingLobotomyCorpAlert(value);
  if (!alert) {
    preparedMedia?.dispose?.();
    return Promise.resolve(true);
  }
  return activateLobotomyCorpDirectTrumpet(alert, preparedMedia);
}

/**
 * 在同步用户手势中准备可能会在服务器确认后播放的警报媒体。
 *
 * 此阶段只触碰 Audio，不建立 Day、HUD 或持久化业务状态。
 *
 * @param {string} value 待保存的显示名称。
 * @return {{commit: () => Promise<boolean>, dispose: () => void}} 可提交或释放的媒体句柄。
 */
function prepareLobotomyCorpDisplayName(value) {
  const abnormalityMatch = matchingLobotomyCorpAbnormality(value);
  const isWhiteNightSubmission = abnormalityMatch?.canonicalId === 'T-03-46';
  const alert = matchingLobotomyCorpAlert(value) ??
      (abnormalityMatch?.abnormality.canBreach &&
      !lobotomyCorpBreachedAbnormalitiesThisDay.has(
          abnormalityMatch.canonicalId,
      )
          ? lobotomyCorpAlertForDangerScore(
              Math.min(
                  100,
                  lobotomyCorpDangerScore +
                  (isWhiteNightSubmission
                      ? lobotomyCorpWhiteNightPreludeDangerContribution
                      : lobotomyCorpDangerContribution(
                          abnormalityMatch.abnormality,
                          lobotomyCorpDayDepartmentCount ??
                          lobotomyCorpDepartmentCountFromPolling(),
                      )),
              ),
          )
          : undefined);
  let audio;
  let state = 'prepared';
  const specialAudio = new Map();
  const adoptedAudio = new Set();

  /**
   * 在当前用户手势内预热一段白夜专用音频。
   *
   * @param {string} soundPath 相对于 Assets 的音频路径。
   */
  function prepareSpecialAudio(soundPath) {
    if (typeof globalThis.Audio !== 'function') return;
    const prepared = new Audio(`${lobotomyCorpAssetRoot}/${soundPath}`);
    prepared.hidden = true;
    prepared.muted = true;
    prepared.preload = 'auto';
    prepared.setAttribute('aria-hidden', 'true');
    specialAudio.set(soundPath, prepared);
    void prepared.play().then(() => {
      if (state === 'prepared') {
        prepared.pause();
        prepared.currentTime = 0;
      }
    }).catch(() => {
    });
  }

  if (alert && typeof globalThis.Audio === 'function') {
    audio = new Audio(
        `${lobotomyCorpAssetRoot}/${alert.soundPath}`,
    );
    audio.hidden = true;
    audio.muted = true;
    audio.preload = 'auto';
    audio.setAttribute('aria-hidden', 'true');
    // 该调用仍在 submit click 的同步栈中，保留 Chromium 的 transient activation。
    void audio.play().then(() => {
      if (state === 'prepared') {
        audio.pause();
        audio.currentTime = 0;
      }
    }).catch(() => {
      // 某些浏览器不允许预播放；提交后仍会按既有路径尝试播放。
    });
  }
  if (isWhiteNightSubmission) {
    prepareSpecialAudio(lobotomyCorpWhiteNightEvent?.soundPaths.bell);
    prepareSpecialAudio(lobotomyCorpWhiteNightEvent?.soundPaths.church);
    const activeAlert = lobotomyCorpAlertForDangerScore(
        Math.min(
            100,
            lobotomyCorpDangerScore +
            lobotomyCorpWhiteNightPreludeDangerContribution +
            lobotomyCorpWhiteNightActiveDangerContribution,
        ),
    );
    if (activeAlert && activeAlert !== alert) {
      prepareSpecialAudio(activeAlert.soundPath);
    }
  } else if (
      lobotomyCorpWhiteNightEvent?.isActive() &&
      lobotomyCorpWhiteNightEvent.matchesConfession(value)
  ) {
    whiteNightDeathSounds.forEach(({path}) => prepareSpecialAudio(path));
  }
  const preparedMedia = Object.freeze({
    /**
     * 仅在已提交且音频目标匹配时，将媒体所有权转交给正式警报。
     *
     * @param {string} soundPath 正式警报当前需要的音频资源路径。
     * @return {HTMLAudioElement|undefined} 可采用的音频。
     */
    consume: (soundPath) => {
      if (state !== 'committed') return undefined;
      if (audio?.src?.endsWith(`/${soundPath}`) === true) {
        adoptedAudio.add(audio);
        return audio;
      }
      const prepared = specialAudio.get(soundPath);
      if (!prepared) return undefined;
      adoptedAudio.add(prepared);
      prepared.muted = false;
      return prepared;
    },
    /**
     * 将已提交的白夜专用媒体转交给事件；资源不匹配时安全回退到新建音频。
     *
     * @param {string} soundPath 需要的白夜音频路径。
     * @return {HTMLAudioElement|undefined} 已预热的音频。
     */
    consumeWhiteNight: (soundPath) => {
      const prepared = specialAudio.get(soundPath);
      if (state !== 'committed' || !prepared) return undefined;
      adoptedAudio.add(prepared);
      prepared.muted = false;
      return prepared;
    },
    dispose: () => {
      if (state === 'disposed') return;
      state = 'disposed';
      [audio, ...specialAudio.values()].forEach((prepared) => {
        if (!prepared || adoptedAudio.has(prepared)) return;
        prepared.pause();
        prepared.removeAttribute?.('src');
        prepared.load?.();
      });
    },
    commit: () => {
      if (state !== 'prepared') return Promise.resolve(true);
      state = 'committed';
      return commitLobotomyCorpDisplayName(value, preparedMedia);
    },
  });
  return preparedMedia;
}

/**
 * 根据危急值查找应播放的脑叶公司警报。
 *
 * @param {number} dangerScore 当前危急值。
 * @return {LobotomyCorpAlert|undefined} 对应的警报配置；无警报区间时返回 undefined。
 */
function lobotomyCorpAlertForDangerScore(dangerScore) {
  if (dangerScore < 10) {
    return undefined;
  }
  if (dangerScore < 50) {
    return lobotomyCorpAlerts.firsttrumpet;
  }
  if (dangerScore < 80) {
    return lobotomyCorpAlerts.secondtrumpet;
  }
  return lobotomyCorpAlerts.thirdtrumpet;
}

/**
 * 根据警报等级读取配置。
 *
 * @param {number} level 1 到 4 的警报等级。
 * @return {LobotomyCorpAlert|undefined} 对应的警报配置。
 */
function lobotomyCorpAlertForLevel(level) {
  return Object.values(lobotomyCorpAlerts).find((alert) =>
      alert.level === level
  );
}

/**
 * 计算当前 Danger Score 实时对应的等级；低于一级警报阈值时为 0。
 *
 * @param {number} dangerScore 当前危急值。
 * @return {number} 实时阈值等级。
 */
function lobotomyCorpDangerThresholdLevel(dangerScore) {
  return lobotomyCorpAlertForDangerScore(dangerScore)?.level ?? 0;
}

/**
 * 按 high-water 语义刷新本次 Danger Emergency 的 **音乐** 等级：Danger 上升时升级，下降时保持不变。
 *
 * Danger 跌破一级警报阈值（低于 10）时，本次 Emergency 结束并一次性重置 music high-water。
 * 该函数只服务 Danger 循环音乐，不参与 HUD 等级计算。
 *
 * @param {number} dangerScore 当前危急值。
 * @return {number} 更新后的 music high-water 等级；0 表示当前没有 Emergency。
 */
function syncLobotomyCorpDangerMusicHighWater(dangerScore) {
  const thresholdLevel = lobotomyCorpDangerThresholdLevel(dangerScore);
  if (thresholdLevel <= 0) {
    lobotomyCorpDangerMusicHighWaterLevel = 0;
    return 0;
  }
  if (thresholdLevel > lobotomyCorpDangerMusicHighWaterLevel) {
    lobotomyCorpDangerMusicHighWaterLevel = thresholdLevel;
  }
  return lobotomyCorpDangerMusicHighWaterLevel;
}

/**
 * 读取当前 Danger Score 实时对应的 HUD 警报。
 *
 * 这是 HUD 的唯一来源：Danger 上升时升级、下降时降级，低于一级警报阈值时为 undefined。
 * 音乐等级（含 high-water）不参与这里的选择。
 *
 * @return {LobotomyCorpAlert|undefined} 实时 HUD 警报；无警报区间时返回 undefined。
 */
function lobotomyCorpDangerVisualAlert() {
  return lobotomyCorpAlertForDangerScore(lobotomyCorpDangerScore);
}

/**
 * 读取一次 Danger 结算实际对应的警报，供 WhiteNight 入场时间线选择阶段音乐。
 *
 * WhiteNight 的两段入场 BGM 是「阶段驱动」的演出音乐，阶段曲目取自这次结算真实
 * 产生的 Danger 阈值，而不是只升不降的 Danger music high-water：第二阶段结算结果
 * 低于第一阶段时，阶段演出仍能切换到该结果对应的曲目。该函数不修改任何 Danger 状态。
 *
 * @return {LobotomyCorpAlert|undefined} 本次结算对应的警报；低于一级阈值时为 undefined。
 */
function lobotomyCorpDangerSettlementAlert() {
  return lobotomyCorpDangerVisualAlert();
}

/**
 * 读取本次 Danger Emergency 循环音乐应使用的警报配置。
 *
 * 这是 Danger 来源音乐的唯一来源：同一场 Emergency 内只升不降，直到 Danger < 10 才清零。
 * HUD 不读该函数，Direct 接管比较也不读该函数。
 *
 * @return {LobotomyCorpAlert|undefined} music high-water 警报；无 Emergency 时返回 undefined。
 */
function lobotomyCorpDangerMusicAlert() {
  return lobotomyCorpDangerMusicHighWaterLevel > 0
      ? lobotomyCorpAlertForLevel(lobotomyCorpDangerMusicHighWaterLevel)
      : undefined;
}

/**
 * 读取当前脑叶公司彩蛋危急值。
 *
 * @return {number} 当前 0 到 100 的有限危急值。
 */
function getLobotomyCorpDangerScore() {
  return lobotomyCorpDangerScore;
}

/**
 * 读取本次连续 Danger Emergency 已经达到的最高音乐等级。
 *
 * @return {number} 本次 Emergency 的 music high-water 等级；0 表示当前没有 Emergency。
 */
function getLobotomyCorpDangerMusicHighWaterLevel() {
  return lobotomyCorpDangerMusicHighWaterLevel;
}

/**
 * 结束当前脑叶公司警报。
 *
 * @return {Promise<boolean>} 当前警报结束后返回 true；没有活跃警报时立即返回 true。
 */
function stopLobotomyCorpAlert() {
  lobotomyCorpWhiteNightEvent?.finish({restoreAlert: false});
  if (!activeLobotomyCorpAlert) {
    clearLobotomyCorpDay();
    globalThis.easterEggCoordinator?.finish?.(
        lobotomyCorpEasterEggGameId,
        finishLobotomyCorpDayFromCoordinator,
    );
    return Promise.resolve(true);
  }
  const completion = activeLobotomyCorpAlert.promise;
  activeLobotomyCorpAlert.finish();
  return completion;
}

/**
 * 以同一套 special-event-aware 业务流程重启当前 Day。
 *
 * @return {Promise<boolean>} 清理完成后返回 true。
 */
function restartLobotomyCorpDay() {
  lobotomyCorpWhiteNightEvent?.finish({restoreAlert: false});
  return stopLobotomyCorpAlert();
}

/**
 * 处理一次 Direct Trumpet 指令。
 *
 * Direct 只竞争**音乐**控制权：只有严格高于当前实际音乐等级（music owner 的等级，
 * 不是 HUD 等级）时才接管音乐；同级或更低一律不接管，也不会改变 HUD。
 * 所谓「接管」只发生在音乐层，HUD 只由实时 Danger 或 Direct 自己建立的会话决定。
 *
 * @param {LobotomyCorpAlert|undefined} candidate 指令对应的警报配置。
 * @param {object} [preparedMedia] 用户手势中预热的媒体。
 * @return {Promise<boolean>} 本段 Direct 音乐的 activation Promise；未接管时立即返回 true。
 */
function activateLobotomyCorpDirectTrumpet(candidate, preparedMedia) {
  const current = activeLobotomyCorpAlert;
  if (!candidate) {
    preparedMedia?.dispose?.();
    return Promise.resolve(true);
  }
  if (!current) {
    // 没有进行中的会话：Direct 自己建立会话，四角 HUD 与音乐都使用它自己的等级。
    return startLobotomyCorpAlert({
      directSession: true,
      musicAlert: candidate,
      musicSource: 'direct',
      preparedMedia,
      startedAt: Date.now(),
      visualAlert: candidate,
    });
  }
  if (candidate.level <= current.musicLevel()) {
    preparedMedia?.dispose?.();
    return Promise.resolve(true);
  }
  return current.takeOverMusic(candidate, 'direct', preparedMedia);
}

/**
 * 在 Danger Score 变化后同步当前会话：HUD 实时跟随，音乐只在突破 high-water 时接管。
 *
 * 规则：
 * - HUD 始终使用当前 Danger Score 的实时阈值等级；Danger 下降同样立即降级；
 * - 循环音乐使用本次 Emergency 的 music high-water，只有严格高于当前实际音乐等级才换曲；
 * - Danger 跌破 10 时 music high-water 已由调用方清零，Danger 来源音乐随之停止，
 *   正在覆盖的 Direct one-shot 不被打断，仅 HUD 消失。
 *
 * @param {object} [preparedMedia] 用户手势中预热的媒体。
 * @param {{suppressMusic?: boolean}} [options] 特殊事件音乐接管选项；true 表示本次结算只更新 Danger 与
 *   HUD，不接管普通 Danger 音乐，由 WhiteNight 阶段演出自行选择阶段曲目。
 * @return {Promise<boolean>} 新建会话或接管音乐时的 activation Promise；其余情况立即返回 true。
 */
function reconcileLobotomyCorpDangerAlert(preparedMedia, options = {}) {
  const current = activeLobotomyCorpAlert;
  const dangerMusicAlert = lobotomyCorpDangerMusicAlert();
  const suppressMusic = options.suppressMusic === true;
  if (!current) {
    if (!dangerMusicAlert) {
      preparedMedia?.dispose?.();
      return Promise.resolve(true);
    }
    return startLobotomyCorpAlert({
      initiallyDucked: suppressMusic,
      musicAlert: dangerMusicAlert,
      musicSource: 'danger',
      playbackState: suppressMusic ? 'special-event-held' : 'normal-playing',
      preparedMedia,
      startedAt: Date.now(),
      visualAlert: lobotomyCorpDangerVisualAlert(),
    });
  }
  if (!dangerMusicAlert && current.musicSource() === 'danger') {
    // 本次 Danger Emergency 结束，且音乐仍属于 Danger：停止音乐并结束会话。
    preparedMedia?.dispose?.();
    current.finishVisible();
    return Promise.resolve(true);
  }
  let completion = Promise.resolve(true);
  if (
      !suppressMusic && dangerMusicAlert &&
      dangerMusicAlert.level > current.musicLevel()
  ) {
    // 只有真正突破 music high-water 才换曲；HUD 升级但未突破时不动音乐。
    completion = current.takeOverMusic(
        dangerMusicAlert,
        'danger',
        preparedMedia,
    );
  } else {
    preparedMedia?.dispose?.();
  }
  current.syncVisual();
  return completion;
}

/**
 * 设置脑叶公司彩蛋危急值，并分别同步实时 HUD 与 music high-water 循环音乐。
 *
 * 先刷新 music high-water：Danger 上升可以抬高本次 Emergency 的音乐等级，自然下降只改变实时 HUD。
 *
 * @param {number} dangerScore 新的 0 到 100 有限危急值。
 * @param {object} [preparedMedia] 在用户手势中预先准备的媒体句柄。
 * @param {{isDecay?: boolean, positiveContribution?: boolean, suppressMusic?: boolean}} [options] 危急值来源与音乐接管配置；
 *   `suppressMusic` 用于 WhiteNight 阶段结算：只刷新 Danger 与 HUD，音乐交给特殊事件阶段时间线。
 * @return {Promise<boolean>} 对应警报结束或无警报状态生效后返回 true。
 */
function setLobotomyCorpDangerScore(dangerScore, preparedMedia, options = {}) {
  if (
      typeof dangerScore !== 'number' || !Number.isFinite(dangerScore) ||
      dangerScore < 0 || dangerScore > 100
  ) {
    return Promise.reject(
        new RangeError('Danger Score 必须是 0 到 100 的有限数值。'),
    );
  }

  lobotomyCorpDangerScore = dangerScore;
  syncLobotomyCorpDangerMusicHighWater(dangerScore);
  if (dangerScore > 0) {
    persistLobotomyCorpDay();
    ensureLobotomyCorpDayCoordinator();
  } else {
    clearLobotomyCorpDay();
  }
  if (!options.isDecay && options.positiveContribution === true) {
    resetLobotomyCorpDangerDecayGrace();
  }
  return reconcileLobotomyCorpDangerAlert(preparedMedia, {
    suppressMusic: options.suppressMusic === true,
  });
}

/**
 * 根据已保存的显示名称同步所有头像宿主的派生异想体身份 UI。
 *
 * @param {string} displayName 已保存的显示名称。
 */
function syncLobotomyCorpAbnormalityIdentity(displayName) {
  const document = globalThis.document;
  const label = document?.querySelector?.('[data-account-display-name-label]');
  const avatarWrappers = [
    ...(document?.querySelectorAll?.('[data-lobotomy-corp-risk-host]') ?? []),
  ];
  const match = matchingLobotomyCorpAbnormality(displayName);
  if (label) {
    if (label.dataset.lobotomyCorpDefaultLabel === undefined) {
      label.dataset.lobotomyCorpDefaultLabel = label.textContent ?? '';
    }
    label.textContent = match
        ? lobotomyCorpAbnormalityName(match.abnormality)
        : label.dataset.lobotomyCorpDefaultLabel;
  }
  const riskFile = match && lobotomyCorpRiskSpriteByLevel[
      match.abnormality.riskLevel
      ];
  avatarWrappers.forEach((avatarWrapper) => {
    avatarWrapper.querySelector?.('.lobotomy-corp-risk-badge')?.remove?.();
    if (!riskFile || !document?.createElement) return;
    const riskBadge = document.createElement('img');
    riskBadge.alt = '';
    riskBadge.className = 'lobotomy-corp-risk-badge';
    riskBadge.setAttribute('aria-hidden', 'true');
    riskBadge.src = `${lobotomyCorpSpriteRoot}/${riskFile}`;
    avatarWrapper.append(riskBadge);
  });
}

/**
 * 通知所有观察者一次已确认的 canonical 异想体提交。
 *
 * @param {string} canonicalId 异想体 canonical 编号。
 * @param {object} abnormality 异想体静态资料。
 * @param {{displayName: string}} context 本次提交的上下文。
 */
function notifyLobotomyCorpAbnormalitySubmitted(
    canonicalId,
    abnormality,
    context,
) {
  lobotomyCorpAbnormalitySubmissionListeners.forEach((listener) => {
    try {
      listener(canonicalId, abnormality, context);
    } catch {
      // 特殊事件观察失败不影响已确认的账户保存或通用出逃流程。
    }
  });
}

/**
 * 将轮询数值部分映射为本 Day 可用的部门数；单位与轮询开关不参与映射。
 *
 * @return {number} 1 到 11 的稳定整数部门数。
 */
function lobotomyCorpDepartmentCountFromPolling() {
  const value = Number(
      globalThis.document?.querySelector?.('[data-polling-interval-value]')
          ?.value,
  );
  if (!Number.isFinite(value) || value <= 0) return 11;
  return Math.min(11, Math.max(1, Math.trunc(value)));
}

/**
 * 获取当前 Day 的普通异想体部门数；首次贡献时才固定快照。
 *
 * @return {number} 当前 Day 的部门数。
 */
function lobotomyCorpDepartmentCountForDay() {
  if (lobotomyCorpDayDepartmentCount === undefined) {
    lobotomyCorpDayDepartmentCount = lobotomyCorpDepartmentCountFromPolling();
    persistLobotomyCorpDay();
  }
  return lobotomyCorpDayDepartmentCount;
}

/**
 * 计算一次普通异想体出逃对 Danger Score 的最终贡献。
 *
 * @param {object} abnormality 异想体静态资料。
 * @param {number} departmentCount 当前 Day 已快照的部门数。
 * @return {number} 最终贡献。
 */
function lobotomyCorpDangerContribution(abnormality, departmentCount) {
  return abnormalityEscapeDangerContribution(
      abnormality.riskLevel,
      departmentCount,
  );
}

/**
 * 结算白夜 Simple Advent 结束后的第二笔固定危急值。
 *
 * @return {Promise<boolean>} Alert 已按真实危急值更新后的生命周期 Promise。
 */
function settleLobotomyCorpWhiteNightActiveDanger() {
  if (lobotomyCorpWhiteNightDangerSettlementStage === 'active-settled') {
    return Promise.resolve(true);
  }
  lobotomyCorpWhiteNightDangerSettlementStage = 'active-settled';
  // 先持久化阶段标记，避免 4000ms 附近刷新时重复结算 +98。
  persistLobotomyCorpDay();
  return setLobotomyCorpDangerScore(
      Math.min(
          100,
          lobotomyCorpDangerScore + lobotomyCorpWhiteNightActiveDangerContribution,
      ),
      undefined,
      {
        positiveContribution: true,
        // 第二阶段由 WhiteNight 阶段时间线接管音乐：这里只结算 Danger 与实时 HUD，
        // 阶段曲目随后由 shared.setSpecialEventStageAlertMusic 按真实结算结果显式开始。
        suppressMusic: true,
      },
  );
}

/**
 * 处理一次已由服务器确认成功的 canonical 异想体提交。
 *
 * 该入口刻意将身份识别与危急值贡献分层，后续特殊事件可订阅此处而不依赖 canBreach。
 *
 * @param {string} value 服务器已保存成功的显示名称。
 * @param {object} [preparedMedia] 在用户手势中预先准备的媒体句柄。
 * @return {Promise<boolean>} 危急值更新后的警报生命周期 Promise。
 */
function handleLobotomyCorpAbnormalitySubmitted(value, preparedMedia) {
  const match = matchingLobotomyCorpAbnormality(value);
  if (!match) {
    preparedMedia?.dispose?.();
    return Promise.resolve(true);
  }
  notifyLobotomyCorpAbnormalitySubmitted(match.canonicalId, match.abnormality, {
    displayName: value,
  });
  if (!match.abnormality.canBreach) {
    preparedMedia?.dispose?.();
    return Promise.resolve(true);
  }
  if (lobotomyCorpBreachedAbnormalitiesThisDay.has(match.canonicalId)) {
    preparedMedia?.dispose?.();
    return Promise.resolve(true);
  }
  const isWhiteNightSubmission = match.canonicalId === 'T-03-46';
  const contribution = isWhiteNightSubmission
      ? lobotomyCorpWhiteNightPreludeDangerContribution
      : lobotomyCorpDangerContribution(
          match.abnormality,
          lobotomyCorpDepartmentCountForDay(),
      );
  if (contribution <= 0) {
    preparedMedia?.dispose?.();
    return Promise.resolve(true);
  }
  lobotomyCorpBreachedAbnormalitiesThisDay.add(match.canonicalId);
  if (isWhiteNightSubmission) {
    // direct-submission 的第一笔为 Simple Advent 开始时 11 名普通使徒的死亡抽象。
    lobotomyCorpWhiteNightDangerSettlementStage = 'prelude-settled';
  }
  const alertLifecycle = setLobotomyCorpDangerScore(
      clampDangerScore(lobotomyCorpDangerScore + contribution),
      preparedMedia,
      {
        positiveContribution: true,
      },
  );
  if (isWhiteNightSubmission) {
    lobotomyCorpWhiteNightEvent?.start({
      preparedMedia,
      source: 'direct-submission',
    });
  }
  return alertLifecycle;
}

/**
 * 在账户保存成功后提交异想体，或按名称直接触发手动 Trumpet。
 *
 * @param {string} value 服务器确认保存的显示名称。
 * @param {object} [preparedMedia] 在用户手势中预先准备的媒体句柄。
 * @return {Promise<boolean>} 对应彩蛋生命周期 Promise。
 */
function commitLobotomyCorpDisplayName(value, preparedMedia) {
  syncLobotomyCorpAbnormalityIdentity(value);
  if (
      lobotomyCorpWhiteNightEvent?.isActive() &&
      lobotomyCorpWhiteNightEvent.matchesConfession(value)
  ) {
    return lobotomyCorpWhiteNightEvent.confess(preparedMedia);
  }
  return matchingLobotomyCorpAbnormality(value)
      ? handleLobotomyCorpAbnormalitySubmitted(value, preparedMedia)
      : activateLobotomyCorpAlert(value, preparedMedia);
}

/**
 * 向 DOM 元素写入一组内联样式；非浏览器测试环境会安全跳过。
 *
 * @param {Element} element 要设置样式的元素。
 * @param {Record<string, string>} styles CSS 属性和值。
 */
function setLobotomyCorpElementStyles(element, styles) {
  if (!element.style) {
    return;
  }
  Object.entries(styles).forEach(([property, value]) => {
    element.style[property] = value;
  });
}

/**
 * 将本 HUD 使用的 Unity RectTransform 坐标换算为 CSS 左上定位。
 *
 * @param {Element} element 要定位的元素。
 * @param {{anchorX: number, anchorY: number, anchoredX: number, anchoredY: number, height: number, pivotX: number, pivotY: number, rotation?: number, scaleY?: number, width: number}} rect Unity RectTransform 参数。
 * @param {number} parentWidth 父 Rect 的 Unity 宽度。
 * @param {number} parentHeight 父 Rect 的 Unity 高度。
 */
function applyLobotomyCorpRectTransform(
    element,
    rect,
    parentWidth = lobotomyCorpCornerSize,
    parentHeight = lobotomyCorpCornerSize,
) {
  const pivotScreenX = rect.anchorX * parentWidth + rect.anchoredX;
  const pivotScreenY = (1 - rect.anchorY) * parentHeight - rect.anchoredY;
  const transform = [
    rect.rotation === undefined ? '' : `rotate(${rect.rotation}deg)`,
    rect.scaleY === undefined ? '' : `scaleY(${rect.scaleY})`,
  ].filter(Boolean).join(' ');
  setLobotomyCorpElementStyles(element, {
    height: `${rect.height}px`,
    left: `${pivotScreenX - rect.pivotX * rect.width}px`,
    top: `${pivotScreenY - (1 - rect.pivotY) * rect.height}px`,
    transform,
    width: `${rect.width}px`,
  });
}

/**
 * 判断当前环境是否需要在显示 HUD 前异步等待浏览器资源。
 *
 * @return {boolean} 具备字体或图片预加载 API 时返回 true。
 */
function shouldPrepareLobotomyCorpVisualAssets() {
  return typeof globalThis.Image === 'function' ||
      typeof globalThis.document?.fonts?.load === 'function';
}

/**
 * 预加载一张浏览器图片，加载失败时仍保持 HUD 可用。
 *
 * @param {string} source 图片地址。
 * @return {Promise<HTMLImageElement|undefined>} 已加载图片；环境不支持或加载失败时返回 undefined。
 */
function loadLobotomyCorpImage(source) {
  if (typeof globalThis.Image !== 'function') {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image), {once: true});
    image.addEventListener('error', () => resolve(undefined), {once: true});
    image.src = source;
  });
}

/**
 * 预加载 HUD 所用 norwester 字体，避免首次显示时字体跳变。
 *
 * @return {Promise<void>} 字体加载完成或浏览器不支持字体加载 API 后完成。
 */
async function loadLobotomyCorpFont() {
  try {
    await globalThis.document?.fonts?.load?.('28px LobotomyNorwester');
  } catch {
    // 字体服务不可用时仍显示 HUD，由 CSS 回退字体承担可读性。
  }
}

/**
 * 查找当前页面语言对应的原版 Restart TITLE 字体族。
 *
 * @return {string} 应由 FontFaceSet 预加载的 CSS 字体族名称。
 */
function lobotomyCorpRestartTitleFontFamily() {
  const pageLanguage = globalThis.document?.documentElement?.lang;
  if (pageLanguage === 'ko-KR') {
    return 'LobotomyRestartTitleKorean';
  }
  if (pageLanguage === 'ru-RU') {
    return 'LobotomyRestartTitleRussian';
  }
  return 'LobotomyRestartTitle';
}

/**
 * 预加载当前页面语言实际使用的 Restart TITLE 字体，避免掉落时文字发生跳变。
 *
 * @return {Promise<void>} 字体加载完成或浏览器不支持字体加载 API 后完成。
 */
async function loadLobotomyCorpTopPanelFont() {
  try {
    const fontFamily = lobotomyCorpRestartTitleFontFamily();
    await globalThis.document?.fonts?.load?.(`70px ${fontFamily}`);
  } catch {
    // 字体服务不可用时仍显示面板，由 CSS 回退字体承担可读性。
  }
}

/**
 * 使用离屏 Canvas 模拟 Unity UI Image.color 的逐像素乘色。
 *
 * @param {string} source 未染色 Sprite 地址。
 * @param {[number, number, number]} tint Image.color 的 RGB 值。
 * @return {Promise<string>} 已染色的数据 URL；无法处理时返回原始地址。
 */
async function tintLobotomyCorpImage(source, tint) {
  const image = await loadLobotomyCorpImage(source);
  const canvas = globalThis.document?.createElement?.('canvas');
  const width = image?.naturalWidth ?? image?.width ?? 0;
  const height = image?.naturalHeight ?? image?.height ?? 0;
  const context = canvas?.getContext?.('2d', {willReadFrequently: true});
  if (!image || !canvas || !context || width <= 0 || height <= 0) {
    return source;
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, width, height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    imageData.data[index] = imageData.data[index] * tint[0] / 255;
    imageData.data[index + 1] = imageData.data[index + 1] * tint[1] / 255;
    imageData.data[index + 2] = imageData.data[index + 2] * tint[2] / 255;
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * 预加载 HUD 与顶部结束面板的图片和字体，并建立 Triangle、EmergencyImage 与 End_1 染色缓存。
 *
 * @return {Promise<void>} 所有可用视觉资源已完成准备后返回。
 */
function prepareLobotomyCorpVisualAssets() {
  if (lobotomyCorpVisualAssetPreparation) {
    return lobotomyCorpVisualAssetPreparation;
  }

  lobotomyCorpVisualAssetPreparation = (async () => {
    const alerts = Object.values(lobotomyCorpAlerts);
    const triangleFiles = [
      ...new Set(
          lobotomyCorpCornerDefinitions.map(({triangleFile}) => triangleFile),
      ),
    ];
    await Promise.all([
      loadLobotomyCorpFont(),
      loadLobotomyCorpTopPanelFont(),
      ...alerts.map(({riskFile}) =>
          loadLobotomyCorpImage(`${lobotomyCorpSpriteRoot}/${riskFile}`)
      ),
      ...lobotomyCorpTopPanelSpriteFiles.map((spriteFile) =>
          loadLobotomyCorpImage(`${lobotomyCorpSpriteRoot}/${spriteFile}`)
      ),
    ]);
    await Promise.all([
      ...alerts.flatMap((alert) =>
          triangleFiles.map(async (triangleFile) => {
            const source = `${lobotomyCorpSpriteRoot}/${triangleFile}`;
            const tintedSource = await tintLobotomyCorpImage(
                source,
                alert.emergencyTint,
            );
            lobotomyCorpTintedTriangleSources.set(
                `${alert.assetDirectory}:${triangleFile}`,
                tintedSource,
            );
          })
      ),
      ...alerts.filter(({riskTint}) => Boolean(riskTint)).map(
          async (alert) => {
            const source = `${lobotomyCorpSpriteRoot}/${alert.riskFile}`;
            const tintedSource = await tintLobotomyCorpImage(
                source,
                alert.riskTint,
            );
            lobotomyCorpTintedRiskSources.set(alert.assetDirectory, tintedSource);
          },
      ),
      ...Object.entries(lobotomyCorpRestartButtonTints).map(
          async ([state, tint]) => {
            const tintedSource = await tintLobotomyCorpImage(
                `${lobotomyCorpSpriteRoot}/End_1.png`,
                tint,
            );
            lobotomyCorpTintedRestartButtonSources.set(state, tintedSource);
          },
      ),
    ]);
  })();
  return lobotomyCorpVisualAssetPreparation;
}

/**
 * 读取指定警报等级的已染色 Triangle；预加载失败时回退到原始 Sprite。
 *
 * @param {LobotomyCorpAlert} alert 当前警报配置。
 * @param {string} triangleFile Triangle 文件名。
 * @return {string} 用于 img 的图片地址。
 */
function lobotomyCorpTriangleSource(alert, triangleFile) {
  return lobotomyCorpTintedTriangleSources.get(
      `${alert.assetDirectory}:${triangleFile}`,
  ) ?? `${lobotomyCorpSpriteRoot}/${triangleFile}`;
}

/**
 * 读取指定警报等级的 EmergencyImage Sprite；Fourth 使用缓存的 Unity Image.color 乘色图。
 *
 * @param {LobotomyCorpAlert} alert 当前警报配置。
 * @return {string} 用于 img 的图片地址。
 */
function lobotomyCorpRiskSource(alert) {
  return lobotomyCorpTintedRiskSources.get(alert.assetDirectory) ??
      `${lobotomyCorpSpriteRoot}/${alert.riskFile}`;
}

/**
 * 读取指定交互状态的已染色 End_1；预加载失败时回退到原始 Sprite。
 *
 * @param {'normal'|'pressed'} state RestartButton 交互状态。
 * @return {string} 用于按钮状态图片的地址。
 */
function lobotomyCorpRestartButtonSource(state) {
  return lobotomyCorpTintedRestartButtonSources.get(state) ??
      `${lobotomyCorpSpriteRoot}/End_1.png`;
}

/**
 * 在未达到普通 Trumpet 阈值时复用 Restart Day 顶部面板。
 *
 * @return {{finish: () => void}|undefined} 已挂载面板的清理操作。
 */
function mountLobotomyCorpRestartPanel() {
  if (activeLobotomyCorpAlert || activeLobotomyCorpRestartPanel) {
    return activeLobotomyCorpRestartPanel;
  }
  const document = globalThis.document;
  if (!document?.createElement || !document.body) return undefined;
  const overlay = document.createElement('div');
  const topPanelController = createLobotomyCorpTopPanel();
  overlay.className = 'lobotomy-corp-alert-overlay';
  topPanelController.endAlertButton.addEventListener('click', () => {
    void restartLobotomyCorpDay();
  });
  overlay.append(topPanelController.element);
  document.body.append(overlay);
  const panel = {
    finish: () => {
      if (activeLobotomyCorpRestartPanel !== panel) return;
      activeLobotomyCorpRestartPanel = undefined;
      overlay.remove();
    },
  };
  activeLobotomyCorpRestartPanel = panel;
  return panel;
}

/**
 * 为 Unity 风格 HUD 与顶部面板写入 CanvasScaler 缩放比例。
 *
 * @param {{height: number, width: number}} viewport 用于本次缩放的稳定 viewport。
 * @param {...Element|undefined} unityRoots 需要同步缩放的 Unity 风格视觉根节点。
 */
function updateLobotomyCorpCanvasScale(viewport, ...unityRoots) {
  const {height, width} = viewport;
  const canvasScale = lobotomyCorpCanvasScaleForViewport(width, height);
  unityRoots.forEach((unityRoot) => {
    unityRoot?.style?.setProperty?.(
        '--lobotomy-corp-unity-canvas-scale',
        String(canvasScale),
    );
  });
}

/**
 * 创建一个复现 Unity Corner / Texture / Risk 或 TrumpetLevel 层级的角落节点。
 *
 * @param {LobotomyCorpAlert} alert 当前警报配置。
 * @param {{alertTextRect?: object, position: string, triangleFile: string}} definition Corner 配置。
 * @return {HTMLElement} 完整 Corner 节点。
 */
function createLobotomyCorpEmergencyCorner(alert, definition) {
  const corner = document.createElement('section');
  const texture = document.createElement('div');
  const triangle = document.createElement('img');
  corner.className = `lobotomy-corp-alert-corner ${definition.position}`;
  texture.className = 'lobotomy-corp-alert-texture';
  triangle.alt = '';
  triangle.className = 'lobotomy-corp-alert-triangle';
  triangle.src = lobotomyCorpTriangleSource(alert, definition.triangleFile);
  triangle.setAttribute('aria-hidden', 'true');
  texture.append(triangle);

  if (definition.position === 'right-up') {
    const trumpetLevel = document.createElement('p');
    const trumpetLevelContent = document.createElement('span');
    trumpetLevel.className = 'lobotomy-corp-alert-trumpet-level';
    trumpetLevelContent.className = 'lobotomy-corp-alert-trumpet-level-content';
    trumpetLevelContent.textContent = alert.trumpetLevel;
    setLobotomyCorpElementStyles(trumpetLevel, {color: alert.emergencyColor});
    applyLobotomyCorpRectTransform(trumpetLevel, {
      anchorX: 0.5,
      anchorY: 0.5,
      anchoredX: 88,
      anchoredY: -88,
      height: 150,
      pivotX: 0.5,
      pivotY: 0.5,
      rotation: -45,
      scaleY: -1,
      width: 430.2,
    });
    trumpetLevel.append(trumpetLevelContent);
    texture.append(trumpetLevel);
  } else {
    const factorial = document.createElement('div');
    const risk = document.createElement('img');
    factorial.className = 'lobotomy-corp-alert-factorial';
    risk.alt = '';
    risk.className = 'lobotomy-corp-alert-risk';
    risk.src = lobotomyCorpRiskSource(alert);
    risk.setAttribute('aria-hidden', 'true');
    applyLobotomyCorpRectTransform(factorial, {
      ...lobotomyCorpOriginalRiskRect,
      ...alert.riskRect,
    });
    factorial.append(risk);
    texture.append(factorial);
  }

  corner.append(texture);
  if (definition.alertTextRect) {
    const alertText = document.createElement('p');
    alertText.className = 'lobotomy-corp-alert-text';
    alertText.textContent = lobotomyCorpAlertText;
    alertText.setAttribute('aria-hidden', 'true');
    setLobotomyCorpElementStyles(alertText, {color: alert.emergencyColor});
    applyLobotomyCorpRectTransform(alertText, definition.alertTextRect);
    corner.append(alertText);
  }
  return corner;
}

/**
 * 创建复现原版“重新开始这一天”布局的顶部结束面板。
 *
 * @return {{activeController: HTMLElement, element: HTMLElement, endAlertButton: HTMLButtonElement, endAlertButtonText: HTMLElement}} 顶部面板、动画节点及结束按钮的图标与文本节点。
 */
function createLobotomyCorpTopPanel() {
  const topPanel = document.createElement('section');
  const activeController = document.createElement('div');
  const leftValve = document.createElement('img');
  const frameOutter = document.createElement('div');
  const frameInner = document.createElement('img');
  const endAlertButton = document.createElement('button');
  const normalButtonSprite = document.createElement('img');
  const pressedButtonSprite = document.createElement('img');
  const endAlertButtonText = document.createElement('span');
  const rightValve = document.createElement('img');
  const restartDayText = lobotomyCorpTopPanelActionText();

  topPanel.className = 'lobotomy-corp-top-panel';
  activeController.className = 'lobotomy-corp-top-panel-active-controller';

  leftValve.alt = '';
  leftValve.className = 'lobotomy-corp-top-panel-valve left';
  leftValve.src = `${lobotomyCorpSpriteRoot}/Valve.png`;
  leftValve.setAttribute('aria-hidden', 'true');

  frameOutter.className = 'lobotomy-corp-top-panel-frame-outter';
  frameInner.alt = '';
  frameInner.className = 'lobotomy-corp-top-panel-frame-inner';
  frameInner.src = `${lobotomyCorpSpriteRoot}/Risk_Frame_Inner.png`;
  frameInner.setAttribute('aria-hidden', 'true');

  endAlertButton.type = 'button';
  endAlertButton.className = 'lobotomy-corp-top-panel-action-button';
  endAlertButton.setAttribute('aria-label', restartDayText);
  normalButtonSprite.alt = '';
  normalButtonSprite.className =
      'lobotomy-corp-top-panel-action-button-sprite normal';
  normalButtonSprite.src = lobotomyCorpRestartButtonSource('normal');
  normalButtonSprite.setAttribute('aria-hidden', 'true');
  pressedButtonSprite.alt = '';
  pressedButtonSprite.className =
      'lobotomy-corp-top-panel-action-button-sprite pressed';
  pressedButtonSprite.src = lobotomyCorpRestartButtonSource('pressed');
  pressedButtonSprite.setAttribute('aria-hidden', 'true');
  endAlertButtonText.className = 'lobotomy-corp-top-panel-action-button-text';
  endAlertButtonText.textContent = restartDayText;
  endAlertButton.append(
      normalButtonSprite,
      pressedButtonSprite,
      endAlertButtonText,
  );

  rightValve.alt = '';
  rightValve.className = 'lobotomy-corp-top-panel-valve right';
  rightValve.src = `${lobotomyCorpSpriteRoot}/Valve.png`;
  rightValve.setAttribute('aria-hidden', 'true');

  frameOutter.append(frameInner, endAlertButton);
  activeController.append(leftValve, frameOutter, rightValve);
  topPanel.append(activeController);
  return {
    activeController,
    element: topPanel,
    endAlertButton,
    endAlertButtonText,
  };
}

/**
 * 根据当前视觉警报读取顶部 RestartButton 应显示的本地化文本。
 *
 * @param {LobotomyCorpAlert|undefined} [visualAlert] 当前 HUD 警报。
 * @return {string} 当前视觉状态对应的按钮文案。
 */
function lobotomyCorpTopPanelActionText(visualAlert) {
  const restartDayText = lobotomyCorpMessages?.restartDay ?? '';
  return visualAlert?.level === 4
      ? lobotomyCorpMessages?.firedManager ?? restartDayText
      : restartDayText;
}

/**
 * 创建一个脑叶公司 Alert 会话。
 *
 * 会话内的 HUD（visualAlert）与音乐（musicAlert / musicSource）是两个独立 owner：
 * - HUD 由实时 Danger 等级或 Direct 自己建立的会话决定；
 * - 音乐只在「严格高于当前实际音乐等级」时才被接管，接管只换 Audio，不重建 overlay 与顶部面板。
 *
 * @param {object} params 会话参数。
 * @param {boolean} [params.directSession] 本会话是否由 Direct 指令建立；决定无 Danger Emergency 时 HUD 是否显示 Direct 视觉。
 * @param {boolean} [params.initiallyDucked] 是否从首次正式播放起以白夜后台 ducked 音量运行。
 * @param {LobotomyCorpAlert} params.musicAlert 初始音乐警报。
 * @param {'danger'|'direct'} [params.musicSource] 初始音乐 owner。
 * @param {'normal-playing'|'replay-intermission'|'special-event-held'} [params.playbackState] 页面恢复时的精确音频语义。
 * @param {object} [params.preparedMedia] 在用户手势中预先准备的媒体句柄。
 * @param {number} [params.replayAt] 页面恢复时的 Danger 重播间隔结束时间戳。
 * @param {number} [params.resumeAt] 恢复播放的音频进度（秒）。
 * @param {number} params.startedAt 会话最初开始的时间戳。
 * @param {LobotomyCorpAlert|undefined} [params.visualAlert] 初始 HUD 警报；undefined 表示本次会话没有四角警报框。
 * @return {Promise<boolean>} 当前音乐 owner 被接管或整个会话结束时返回 true。
 */
function startLobotomyCorpAlert({
                                  directSession = false,
                                  initiallyDucked = false,
                                  musicAlert: initialMusicAlert,
                                  musicSource = 'direct',
                                  playbackState: initialPlaybackState = initiallyDucked
                                      ? 'special-event-held'
                                      : 'normal-playing',
                                  preparedMedia,
                                  replayAt: initialReplayAt,
                                  resumeAt = 0,
                                  startedAt,
                                  visualAlert: initialVisualAlert,
                                }) {
  /**
   * 会话竞态兜底：已有 active session 时沿用「严格更高才接管音乐」的规则，不重建 DOM。
   *
   * 比较对象是本次新传入的 initialMusicAlert：它是本分支里唯一可用的音乐等级来源，
   * 未定义的引用会直接中断会话建立。
   *
   * @return {Promise<boolean>|undefined} 需要接管或忽略时返回结果；可以继续建立新会话时返回 undefined。
   */
  function takeOverExistingSessionIfRacing() {
    const currentSession = activeLobotomyCorpAlert;
    if (!currentSession) return undefined;
    if (initialMusicAlert.level > currentSession.musicLevel()) {
      return currentSession.takeOverMusic(
          initialMusicAlert,
          musicSource,
          preparedMedia,
      );
    }
    preparedMedia?.dispose?.();
    return Promise.resolve(true);
  }

  const racingSessionResult = takeOverExistingSessionIfRacing();
  if (racingSessionResult !== undefined) {
    return racingSessionResult;
  }
  activeLobotomyCorpRestartPanel?.finish();
  let musicSourceState = musicSource;
  let directSessionState = directSession;
  let visualAlert = initialVisualAlert;
  let fallbackPosition = Math.max(0, resumeAt);
  let pendingResumePosition = fallbackPosition > 0
      ? fallbackPosition
      : undefined;
  let audio = preparedMedia?.consume?.(initialMusicAlert.soundPath);
  if (!audio) preparedMedia?.dispose?.();
  let emergencyController;
  let endAlertButton;
  let endAlertButtonText;
  let directAlertFallbackEndTimer;
  let dangerAlertReplayTimer;
  let replayAt = initialReplayAt;
  let overlay;
  let mounted = false;
  let panelDisappearTimer;
  let topPanel;
  let topPanelActiveController;
  let stableCanvasViewport;
  let specialEventFadeTimer;
  let specialEventStageMusicTimer;
  // 当前音乐实例是否由 WhiteNight 阶段演出建立；决定阶段切换能否相对上一条阶段曲目降级。
  let specialEventStageMusicOwned = false;
  // 白夜 active 期间 Trumpet 以 ducked 音量后台推进的 hold 状态。
  let specialEventMusicDucked = initialPlaybackState === 'special-event-held';
  const visualViewport = globalThis.visualViewport;
  let closing = false;
  let finished = false;
  let currentActivation = createAlertActivation();
  const alertContext = {
    audio: undefined,
    finish: () => {
    },
    finishVisible: () => {
    },
    musicAlert: initialMusicAlert,
    playbackState: initialPlaybackState,
    promise: undefined,
    startedAt,
    syncVisual: () => {
    },
    takeOverMusic: () => Promise.resolve(true),
    // 音乐等级读取当前实际音乐 owner，不读 HUD 等级或 high-water。
    musicLevel: () => alertContext.musicAlert.level,
    musicSource: () => musicSourceState,
    visualAlert,
  };

  /**
   * 创建一次音乐 owner 的完成 Promise；被更高等级音乐接管或整个会话结束时兑现。
   *
   * @return {{promise: Promise<boolean>, resolve: (value: boolean) => void}} activation 状态。
   */
  function createAlertActivation() {
    let resolveCompletion;
    return {
      promise: new Promise((resolve) => {
        resolveCompletion = resolve;
      }),
      resolve: resolveCompletion,
    };
  }

  alertContext.promise = currentActivation.promise;

  /**
   * 在动画完成后最终移除警报 DOM 并完成当前 Promise。
   */
  function teardownAlert() {
    if (finished) {
      return;
    }
    finished = true;
    if (panelDisappearTimer !== undefined) {
      clearTimeout(panelDisappearTimer);
    }
    topPanelActiveController?.removeEventListener(
        'animationend',
        finishAfterPanelAnimation,
    );
    overlay?.remove();
    currentActivation?.resolve(true);
  }

  /**
   * 响应顶部面板反向动画结束事件并执行最终清理。
   */
  function finishAfterPanelAnimation() {
    teardownAlert();
  }

  /**
   * 结束已完成的 Appear 时间轴，并以同一 keyframes 的 reverse 状态启动 Disappear。
   */
  function playTopPanelDisappearAnimation() {
    topPanelActiveController.style.animation = 'none';
    // 提交 animation:none，确保浏览器不会沿用已经结束的 Appear 播放时间。
    void topPanelActiveController.offsetWidth;
    topPanel.dataset.lobotomyCorpTopPanelState = 'disappearing';
    topPanelActiveController.style.animation = '';
  }

  /**
   * 立即停止整场警报业务活动。
   *
   * @param {{animateExit?: boolean, clearDay?: boolean}} options 结束方式配置。
   */
  function finishAlert({
                         animateExit = true,
                         force = false,
                         clearDay = false,
                       } = {}) {
    if (closing || finished) {
      return;
    }
    if (!force && specialEventStageMusicOwned) {
      // WhiteNight 阶段时间线正在演奏当前曲目：普通收起流程直接返回，保持阶段演出不变。
      return;
    }
    if (!force && lobotomyCorpWhiteNightEvent?.isActive()) {
      // 白夜覆盖期间，曲目结束不结束 Alert：保持同一实例以 ducked 音量后台循环。
      holdAlertMusicForSpecialEvent();
      return;
    }
    closing = true;
    detachAudio(true);
    endAlertButton?.removeEventListener('click', finishAlertFromButton);
    if (endAlertButton) {
      endAlertButton.disabled = true;
    }
    globalThis.removeEventListener?.('pagehide', persistPlaybackPosition);
    globalThis.removeEventListener?.(
        'resize',
        updateCanvasScaleFromViewport,
    );
    visualViewport?.removeEventListener?.(
        'resize',
        updateCanvasScaleFromViewport,
    );
    clearPersistedLobotomyCorpAlert();
    if (clearDay) clearLobotomyCorpDay();
    if (activeLobotomyCorpAlert === alertContext) {
      activeLobotomyCorpAlert = undefined;
    }
    if (clearDay || lobotomyCorpDangerScore <= 0) {
      globalThis.easterEggCoordinator?.finish?.(
          lobotomyCorpEasterEggGameId,
          coordinatorStop,
      );
    }

    if (animateExit && topPanel && topPanelActiveController) {
      topPanelActiveController.addEventListener(
          'animationend',
          finishAfterPanelAnimation,
          {once: true},
      );
      playTopPanelDisappearAnimation();
      panelDisappearTimer = setTimeout(teardownAlert, 550);
      return;
    }
    teardownAlert();
  }

  /**
   * 响应顶部 RestartButton 点击，不允许 DOM Event 污染结束方式参数。
   */
  function finishAlertFromButton() {
    void restartLobotomyCorpDay();
  }

  /**
   * 响应警报音频自然播放结束。
   *
   * Danger 来源的曲目只进入重播间隔，保持整场 Emergency；
   * Direct one-shot 结束后恢复底层的 Danger music high-water（若 Emergency 仍然成立）。
   */
  function finishAlertFromAudioEnd() {
    if (specialEventStageMusicOwned) {
      // WhiteNight 阶段曲目由 stage timeline 独占，不参与普通 Danger replay / Direct one-shot。
      return;
    }
    if (musicSourceState === 'danger') {
      enterDangerReplayIntermission();
      return;
    }
    finishDirectAlertMusic();
  }

  /**
   * 响应警报音频加载或播放错误。
   */
  function finishAlertFromAudioError() {
    if (musicSourceState === 'danger') {
      // 音频失败不清除仍成立的 Danger owner，也不做无限快速重试。
      audio?.pause?.();
      alertContext.playbackState = 'replay-intermission';
      replayAt = undefined;
      persistPlaybackPosition();
      return;
    }
    finishDirectAlertMusic();
  }

  /**
   * 响应自然结束计时器到期。
   */
  function finishAlertFromDirectFallbackEnd() {
    finishAlertFromAudioEnd();
  }

  /**
   * 响应跨游戏协调器的停止请求，并保持回调引用稳定。
   */
  function finishAlertFromCoordinator() {
    finishAlert({force: true, clearDay: true});
  }

  /**
   * 根据稳定 viewport 重算 Unity CanvasScaler 比例。
   *
   * @param {boolean} [force] 新建或替换 HUD 根节点时强制写入当前稳定比例。
   */
  function updateCanvasScale(force = false) {
    if (overlay) {
      const nextViewport = lobotomyCorpViewportSize();
      const nextStableViewport = lobotomyCorpCanvasViewportForUpdate(
          stableCanvasViewport,
          nextViewport,
      );
      const viewportChanged = nextStableViewport !== stableCanvasViewport;
      stableCanvasViewport = nextStableViewport;
      if (force || viewportChanged) {
        updateLobotomyCorpCanvasScale(
            stableCanvasViewport,
            emergencyController,
            topPanel,
        );
      }
    }
  }

  /**
   * 响应窗口或 VisualViewport 尺寸变化，并过滤仅浏览器 chrome 导致的高度波动。
   */
  function updateCanvasScaleFromViewport() {
    updateCanvasScale();
  }

  /**
   * 根据当前视觉等级同步可复用 RestartButton 的文字和辅助标签。
   *
   * @param {LobotomyCorpAlert|undefined} visualAlert 当前 HUD 警报。
   */
  function syncTopPanelActionText(visualAlert) {
    const text = lobotomyCorpTopPanelActionText(visualAlert);
    if (endAlertButtonText) {
      endAlertButtonText.textContent = text;
    }
    endAlertButton?.setAttribute('aria-label', text);
  }

  /**
   * 从当前音乐会话的原始开始时间恢复音频进度。
   */
  function playAlertAudio() {
    const pendingPosition = normalizedPendingResumePosition();
    if (pendingPosition !== undefined && Number.isFinite(audio.duration)) {
      if (
          pendingResumePosition >= audio.duration &&
          musicSourceState === 'direct' && !specialEventMusicDucked
      ) {
        finishAlertFromDirectFallbackEnd();
        return;
      }
    }
    playConfiguredAlertAudio();
  }

  /**
   * 归一化尚未确认的完整刷新恢复位置；白夜循环媒体会折返到当前循环内。
   *
   * @return {number|undefined} 可安全应用的待恢复位置。
   */
  function normalizedPendingResumePosition() {
    if (pendingResumePosition === undefined) {
      return undefined;
    }
    if (!Number.isFinite(audio?.duration) || audio.duration <= 0) {
      return pendingResumePosition;
    }
    if (specialEventMusicDucked) {
      return Math.min(
          pendingResumePosition % audio.duration,
          Math.max(0, audio.duration - 0.001),
      );
    }
    return pendingResumePosition;
  }

  /**
   * 将待确认的位置写回媒体实例，并记录实际 seek 值供当前 HUD 调试使用。
   *
   * @return {number|undefined} 本次应用的位置。
   */
  function applyPendingResumePosition() {
    const position = normalizedPendingResumePosition();
    if (position === undefined || !audio) {
      return undefined;
    }
    audio.currentTime = position;
    if (overlay?.dataset) {
      overlay.dataset.lobotomyCorpAlertSeekedTo = String(audio.currentTime);
    }
    return position;
  }

  /**
   * 在播放已经真正成功后再次定位，并结束对持久化位置的保护。
   */
  function confirmPendingResumePosition() {
    const position = applyPendingResumePosition();
    if (position === undefined) {
      return;
    }
    pendingResumePosition = undefined;
    fallbackPosition = position;
  }

  /**
   * 在每次实际 play 前后保护完整刷新恢复位置，兼容 Chromium 重置 currentTime 的行为。
   */
  function playConfiguredAlertAudio() {
    const pendingPosition = applyPendingResumePosition();
    if (pendingPosition !== undefined) {
      audio.addEventListener('playing', confirmPendingResumePosition, {
        once: true,
      });
    }
    void audio.play().then(() => {
      if (pendingPosition !== undefined) {
        confirmPendingResumePosition();
      }
    }).catch(() => {
      // 自动播放被拒绝时保留 pendingResumePosition，等待后续真实交互再次 seek 后重试。
    });
  }

  /**
   * direct one-shot 的 ended 兼容回退；Danger 曲目结束只进入重播间隔。
   */
  function scheduleDirectAlertFallbackEnd() {
    if (
        musicSourceState !== 'direct' || specialEventMusicDucked ||
        specialEventStageMusicOwned
    ) {
      return;
    }
    if (!Number.isFinite(audio.duration)) {
      return;
    }
    const remainingMilliseconds = Math.max(
        0,
        (audio.duration - currentAudioPosition()) * 1000,
    );
    directAlertFallbackEndTimer = setTimeout(
        finishAlertFromDirectFallbackEnd,
        remainingMilliseconds,
    );
  }

  /** 进入 Danger 曲目两遍之间的静默间隔，HUD 与 Danger decay 均继续运行。 */
  function enterDangerReplayIntermission() {
    if (
        closing || finished || musicSourceState !== 'danger' ||
        specialEventMusicDucked || specialEventStageMusicOwned
    ) return;
    audio?.pause?.();
    alertContext.playbackState = 'replay-intermission';
    replayAt = Date.now() + lobotomyCorpDangerAlertReplayGapMs;
    if (dangerAlertReplayTimer !== undefined) {
      clearTimeout(dangerAlertReplayTimer);
    }
    dangerAlertReplayTimer = setTimeout(
        replayDangerAlertAudio,
        lobotomyCorpDangerAlertReplayGapMs,
    );
    persistPlaybackPosition();
  }

  /**
   * 重播本次 Danger Emergency 的 music high-water 曲目。
   *
   * Danger Score 在 replay gap 中自然下降不改变下一轮曲目，HUD 则继续按实时 Danger 更新；
   * 只有 high-water 在 gap 中上升到严格高于当前音乐等级时才立即换曲。
   */
  function replayDangerAlertAudio() {
    dangerAlertReplayTimer = undefined;
    if (
        closing || finished || musicSourceState !== 'danger' ||
        specialEventMusicDucked || specialEventStageMusicOwned
    ) return;
    const dangerMusicAlert = lobotomyCorpDangerMusicAlert();
    if (!dangerMusicAlert) return;
    if (dangerMusicAlert.level > alertContext.musicAlert.level) {
      // gap 期间 high-water 再升高仍需立即接管；下降或持平则继续当前 high-water 曲目。
      void takeOverMusic(dangerMusicAlert, 'danger');
      return;
    }
    replayAt = undefined;
    alertContext.playbackState = 'normal-playing';
    if (audio) audio.currentTime = 0;
    fallbackPosition = 0;
    pendingResumePosition = undefined;
    playConfiguredAlertAudio();
    persistPlaybackPosition();
  }

  /**
   * 记录真实的音频播放进度，供完整页面切换后的警报续播使用。
   *
   * HUD 与音乐分别写入 visualAssetDirectory / musicAssetDirectory，
   * 使恢复时能够保留「HUD First + 音乐 Third」这类合法组合。
   */
  function persistPlaybackPosition() {
    persistLobotomyCorpAlert(
        alertContext.visualAlert,
        alertContext.musicAlert,
        alertContext.startedAt,
        currentAudioPosition(),
        musicSourceState,
        alertContext.playbackState,
        replayAt,
        directSessionState,
    );
  }

  /**
   * 读取实际音频位置，兼容尚未创建 Audio 的异步挂载阶段。
   *
   * @return {number} 当前音乐进度（秒）。
   */
  function currentAudioPosition() {
    const pendingPosition = normalizedPendingResumePosition();
    if (pendingPosition !== undefined) {
      return pendingPosition;
    }
    return Number.isFinite(audio?.currentTime)
        ? audio.currentTime
        : fallbackPosition;
  }

  /**
   * 解绑实际音频的会话监听器，并按需要暂停该音频。
   *
   * @param {boolean} pause 是否停止音频。
   */
  function detachAudio(pause) {
    if (pause) {
      audio?.pause();
    }
    audio?.removeEventListener('ended', finishAlertFromAudioEnd);
    audio?.removeEventListener('error', finishAlertFromAudioError);
    audio?.removeEventListener('timeupdate', persistPlaybackPosition);
    audio?.removeEventListener('loadedmetadata', playAlertAudio);
    audio?.removeEventListener(
        'loadedmetadata',
        scheduleDirectAlertFallbackEnd,
    );
    if (directAlertFallbackEndTimer !== undefined) {
      clearTimeout(directAlertFallbackEndTimer);
      directAlertFallbackEndTimer = undefined;
    }
    if (dangerAlertReplayTimer !== undefined) {
      clearTimeout(dangerAlertReplayTimer);
      dangerAlertReplayTimer = undefined;
    }
    if (specialEventFadeTimer !== undefined) {
      clearTimeout(specialEventFadeTimer);
      specialEventFadeTimer = undefined;
    }
    if (specialEventStageMusicTimer !== undefined) {
      clearTimeout(specialEventStageMusicTimer);
      specialEventStageMusicTimer = undefined;
    }
  }

  /**
   * 让当前 Trumpet 以正常音量继续播放，但不进入普通 Danger replay 时序。
   *
   * 供 WhiteNight 阶段演出采用同一条已恢复的 Audio 时维持满音量可听状态。
   */
  function ensureAlertMusicAudible() {
    if (!audio) return;
    audio.loop = false;
    audio.muted = false;
    audio.volume = 1;
    playConfiguredAlertAudio();
  }

  /**
   * 让当前 Trumpet 实例进入白夜后台的 ducked hold。
   *
   * 同一条 Audio 保持 loop、持续推进 currentTime，并阻止其自然结束 Alert；
   * 音量压到 duck 目标值，只有浏览器 autoplay policy 拒绝时才会暂时无声音。
   */
  function holdAlertMusicForSpecialEvent() {
    specialEventMusicDucked = true;
    specialEventStageMusicOwned = false;
    alertContext.playbackState = 'special-event-held';
    if (directAlertFallbackEndTimer !== undefined) {
      clearTimeout(directAlertFallbackEndTimer);
      directAlertFallbackEndTimer = undefined;
    }
    if (dangerAlertReplayTimer !== undefined) {
      clearTimeout(dangerAlertReplayTimer);
      dangerAlertReplayTimer = undefined;
      replayAt = undefined;
    }
    if (specialEventFadeTimer !== undefined) {
      clearTimeout(specialEventFadeTimer);
      specialEventFadeTimer = undefined;
    }
    if (specialEventStageMusicTimer !== undefined) {
      clearTimeout(specialEventStageMusicTimer);
      specialEventStageMusicTimer = undefined;
    }
    if (!audio) return;
    audio.loop = true;
    audio.muted = false;
    audio.volume = lobotomyCorpWhiteNightAlertDuckVolume;
    playConfiguredAlertAudio();
  }

  /**
   * 以 WhiteNight 入场时间线的阶段语义切换并播放当前阶段的 Trumpet。
   *
   * 阶段演出与普通音乐仲裁的规则不同：
   * - 允许相对 WhiteNight 自己的上一条阶段曲目显式降级（例如 Third → Second 的
   *   假想结算），因此不套用普通 Danger / Direct 的「只升不降」严格升级规则；
   * - 但不会打断更高等级的 Direct / Fourth one-shot，也不修改 Danger music
   *   high-water 与实时 Danger HUD；那些仍属于既有普通仲裁结果；
   * - 曲目从 0 开始（页面恢复时沿用已恢复的同一实例与进度）以正常音量播放
   *   `audibleMs`；`thenHold` 为 true 时随后才淡出到后台 ducked hold。
   *
   * @param {LobotomyCorpAlert} stageAlert 本阶段实际结算结果对应的警报。
   * @param {{audibleMs?: number, thenHold?: boolean}} [options] 阶段演出参数。
   * @return {Promise<boolean>} 阶段曲目的 activation Promise；未接管时立即返回 true。
   */
  function setSpecialEventStageAlertMusic(stageAlert, options = {}) {
    if (closing || finished || !stageAlert) return Promise.resolve(true);
    const currentLevel = alertContext.musicAlert?.level ?? 0;
    if (
        musicSourceState === 'direct' && !specialEventStageMusicOwned &&
        stageAlert.level < currentLevel
    ) {
      // 阶段演出不打断更高等级的 Direct / Fourth one-shot；
      // 更低或同级的 Direct one-shot 让位，保证 WhiteNight 阶段有预期 BGM。
      return Promise.resolve(true);
    }
    const audibleMs = Math.max(
        0,
        Number.isFinite(options.audibleMs) ? options.audibleMs : 0,
    );
    // 页面恢复时沿用同一条已恢复的实例与进度，只补上剩余的可听窗口。
    const adoptCurrentAudio = audio !== undefined &&
        alertContext.musicAlert === stageAlert;
    if (specialEventStageMusicTimer !== undefined) {
      clearTimeout(specialEventStageMusicTimer);
      specialEventStageMusicTimer = undefined;
    }
    if (!adoptCurrentAudio) {
      const previousActivation = currentActivation;
      currentActivation = createAlertActivation();
      alertContext.promise = currentActivation.promise;
      previousActivation.resolve(true);
      const previousAudio = audio;
      detachAudio(true);
      fallbackPosition = 0;
      pendingResumePosition = undefined;
      replayAt = undefined;
      specialEventStageMusicOwned = true;
      specialEventMusicDucked = false;
      // 阶段曲目由 Danger 结算驱动：后续 replayed / 恢复语义按 Danger 音乐处理。
      musicSourceState = 'danger';
      alertContext.musicAlert = stageAlert;
      alertContext.playbackState = 'normal-playing';
      audio = undefined;
      createAlertAudio();
      replaceAlertAudioNode(previousAudio);
    } else {
      specialEventStageMusicOwned = true;
      specialEventMusicDucked = false;
      musicSourceState = 'danger';
      alertContext.musicAlert = stageAlert;
      alertContext.playbackState = 'normal-playing';
      ensureAlertMusicAudible();
    }
    if (options.thenHold === true) {
      specialEventStageMusicTimer = setTimeout(() => {
        specialEventStageMusicTimer = undefined;
        fadeAlertMusicToSpecialEventHold(
            lobotomyCorpSpecialEventMusicFadeOutMs,
        );
      }, audibleMs);
    }
    syncAlertDatasets();
    persistPlaybackPosition();
    return currentActivation.promise;
  }

  /**
   * 把正在播放的 Trumpet 淡出到 WhiteNight 后台 ducked hold。
   *
   * 与 holdAlertMusicForSpecialEvent() 的立即压低不同，这里按插值平滑过渡：
   * - 同一条 Audio 继续播放，currentTime 全程连续推进；
   * - 从当前实际音量平滑降到 duck 目标音量，结束后才真正进入 special-event-held；
   * - 不触发普通 Danger replay，也不触发 Direct one-shot 结束；
   * - Restart Day / 会话结束会连同这个计时器一起清理。
   *
   * @param {number} durationMs 本次淡出剩余时长（毫秒）。
   * @param {{startVolume?: number}} [options] 淡出起始音量；页面恢复到淡出中途时按保存进度重建。
   */
  function fadeAlertMusicToSpecialEventHold(durationMs, options = {}) {
    if (closing || finished || !audio) return;
    const fadeDuration = Math.max(
        0,
        Number.isFinite(durationMs) ? durationMs : 0,
    );
    const requestedVolume = Number.isFinite(options.startVolume)
        ? options.startVolume
        : audio.volume;
    const startVolume = Math.max(0, Math.min(1, requestedVolume));
    const targetVolume = lobotomyCorpWhiteNightAlertDuckVolume;
    specialEventMusicDucked = true;
    alertContext.playbackState = 'special-event-held';
    if (directAlertFallbackEndTimer !== undefined) {
      clearTimeout(directAlertFallbackEndTimer);
      directAlertFallbackEndTimer = undefined;
    }
    if (dangerAlertReplayTimer !== undefined) {
      clearTimeout(dangerAlertReplayTimer);
      dangerAlertReplayTimer = undefined;
      replayAt = undefined;
    }
    if (specialEventFadeTimer !== undefined) {
      clearTimeout(specialEventFadeTimer);
      specialEventFadeTimer = undefined;
    }
    audio.loop = true;
    // 淡出期间这首曲目仍在可听播放：保持 muted=false，只让音量平滑降到 duck 目标音量。
    audio.muted = false;
    audio.volume = startVolume;
    playConfiguredAlertAudio();
    const finishFade = () => {
      specialEventFadeTimer = undefined;
      specialEventStageMusicOwned = false;
      if (audio) audio.volume = targetVolume;
      persistPlaybackPosition();
    };
    if (fadeDuration <= 0) {
      finishFade();
      return;
    }
    const fadeStartedAt = Date.now();
    /** 平滑推进淡出音量；淡出期间同一条 Audio 始终在后台继续推进。 */
    const fadeStep = () => {
      if (closing || finished || !audio || !specialEventMusicDucked) return;
      const progress = Math.min(1, (Date.now() - fadeStartedAt) / fadeDuration);
      audio.volume = lobotomyCorpInterpolateAlertVolume(
          startVolume,
          targetVolume,
          progress,
      );
      if (progress < 1) {
        specialEventFadeTimer = setTimeout(fadeStep, 16);
        return;
      }
      finishFade();
    };
    fadeStep();
    persistPlaybackPosition();
  }

  /**
   * 在用户手势中恢复当前 Trumpet 的播放权限（autoplay unlock）。
   *
   * 职责边界是「恢复播放权限」而不是「设置 duck 目标音量」：specialEventMusicDucked
   * 在淡出 / 淡入进行中同样为 true，此处写 volume 会打断正在进行的渐变。
   * 因此只做 muted=false（白夜特殊生命周期内保持 loop 保护）与重试播放，
   * 音量始终取当前实际值；目标音量由 fadeAlertMusicToSpecialEventHold() 与
   * held 恢复时的初始化逻辑负责。
   */
  function prepareAlertMusicForSpecialEventResume() {
    if (closing || finished || !audio) return;
    audio.muted = false;
    if (specialEventMusicDucked) {
      // 白夜特殊生命周期仍需要 loop 保护，但音量保持当前实际值（可能正处于淡出或淡入中途）。
      audio.loop = true;
    }
    playConfiguredAlertAudio();
  }

  /**
   * 复用正在后台播放的 Trumpet，从当前 ducked 音量平滑恢复到正常音量。
   *
   * 恢复对象是 WhiteNight 阶段时间线最后 hold 住的那一条曲目：
   * 同一条 Audio 从当前进度、当前音量（held 时即 duck 目标音量）淡入到 1.0，起点不归零；
   * 淡入期间继续保持 special hold 的 loop 与 ownership，避免曲目恰好 ended 打断渐变。
   */
  function resumeAlertMusicAfterSpecialEvent() {
    if (closing || finished || !audio || !alertContext.visualAlert) return;
    if (specialEventStageMusicTimer !== undefined) {
      clearTimeout(specialEventStageMusicTimer);
      specialEventStageMusicTimer = undefined;
    }
    const startVolume = Math.max(
        0,
        Math.min(
            1,
            Number.isFinite(audio.volume)
                ? audio.volume
                : lobotomyCorpWhiteNightAlertDuckVolume,
        ),
    );
    // 淡入完成前保持 ducked hold：loop 让 track ended 不会打断 2 秒渐变，
    // specialEventMusicDucked 同时挡住普通 Danger replay 与 Direct fallback。
    // 阶段 ownership 在此结束，普通 Danger lifecycle 仍可正常接管或收起 Alert。
    specialEventStageMusicOwned = false;
    specialEventMusicDucked = true;
    alertContext.playbackState = 'special-event-held';
    audio.loop = true;
    audio.muted = false;
    audio.volume = startVolume;
    playConfiguredAlertAudio();
    persistPlaybackPosition();
    const fadeStartedAt = Date.now();
    /** 平滑推进当前 Trumpet 的恢复音量。 */
    const fadeStep = () => {
      if (closing || finished || !specialEventMusicDucked || !audio) return;
      const progress = Math.min(
          1,
          (Date.now() - fadeStartedAt) / lobotomyCorpSpecialEventMusicFadeInMs,
      );
      audio.volume = lobotomyCorpInterpolateAlertVolume(
          startVolume,
          1,
          progress,
      );
      if (progress < 1) {
        specialEventFadeTimer = setTimeout(fadeStep, 16);
        return;
      }
      // 淡入完成后才退出 special hold，恢复普通 Danger music lifecycle。
      specialEventFadeTimer = undefined;
      specialEventMusicDucked = false;
      alertContext.playbackState = 'normal-playing';
      audio.loop = false;
      audio.volume = 1;
      persistPlaybackPosition();
    };
    fadeStep();
  }

  /**
   * 创建并开始当前逻辑音乐对应的实际 Audio。
   */
  function createAlertAudio() {
    audio = new Audio(
        `${lobotomyCorpAssetRoot}/${alertContext.musicAlert.soundPath}`,
    );
    configureAlertAudio();
  }

  /**
   * 为新建或已准备的 Audio 绑定当前警报会话监听器。
   */
  function configureAlertAudio() {
    alertContext.audio = audio;
    audio.hidden = true;
    // 恢复 special-event-held 时按 ducked hold 语义重建：loop 后台推进、不静音、取 duck 目标音量。
    audio.loop = specialEventMusicDucked;
    audio.muted = false;
    audio.volume = specialEventMusicDucked
        ? lobotomyCorpWhiteNightAlertDuckVolume
        : 1;
    audio.preload = 'auto';
    audio.setAttribute('aria-hidden', 'true');
    audio.addEventListener('ended', finishAlertFromAudioEnd);
    audio.addEventListener('error', finishAlertFromAudioError);
    audio.addEventListener('timeupdate', persistPlaybackPosition);
    if (
        musicSourceState === 'danger' &&
        alertContext.playbackState === 'replay-intermission'
    ) {
      const remaining = Math.max(0, (replayAt ?? Date.now()) - Date.now());
      if (remaining > 0) {
        dangerAlertReplayTimer = setTimeout(replayDangerAlertAudio, remaining);
        persistPlaybackPosition();
        return;
      }
      alertContext.playbackState = 'normal-playing';
      replayAt = undefined;
    }
    const metadataReady = audio.readyState >= 1 ||
        Number.isFinite(audio.duration);
    if (metadataReady) {
      scheduleDirectAlertFallbackEnd();
      playAlertAudio();
    } else {
      audio.addEventListener('loadedmetadata', scheduleDirectAlertFallbackEnd, {
        once: true,
      });
      if (pendingResumePosition !== undefined) {
        audio.addEventListener('loadedmetadata', playAlertAudio, {
          once: true,
        });
      } else {
        playAlertAudio();
      }
    }
  }

  /**
   * 按当前 visual / 顶部面板 / Audio 重新装配 overlay 的子节点。
   *
   * 视觉等级替换只走这里：overlay 与顶部 Restart panel 都被复用，
   * 因此不会重播面板 Appear 动画，也不会重建或触碰 Audio。
   */
  function renderAlertOverlayChildren() {
    if (!overlay) return;
    // 会话内的视觉等级替换会重新挂载子节点；标记复用可让 CSS 跳过面板 Appear 动画。
    if (mounted && topPanel) {
      topPanel.dataset.lobotomyCorpTopPanelReused = 'true';
    }
    const children = [];
    if (visualAlert) {
      const activeControl = document.createElement('div');
      emergencyController = document.createElement('div');
      emergencyController.className = 'lobotomy-corp-emergency-controller';
      activeControl.className = 'lobotomy-corp-alert-active-control';
      lobotomyCorpCornerDefinitions.forEach((definition) => {
        activeControl.append(
            createLobotomyCorpEmergencyCorner(visualAlert, definition),
        );
      });
      emergencyController.append(activeControl);
      children.push(emergencyController);
    } else {
      emergencyController = undefined;
    }
    if (topPanel) children.push(topPanel);
    if (audio) children.push(audio);
    overlay.replaceChildren(...children);
  }

  /**
   * 只更换 overlay 中承载音频的节点，不重建四角 HUD。
   *
   * 阶段演出换曲时使用：新的 Audio 需要进入 overlay，视觉状态没有变化，
   * 因此不重建四角节点，也不重播面板动画。
   *
   * @param {HTMLAudioElement|undefined} previousAudio 被替换的音频。
   */
  function replaceAlertAudioNode(previousAudio) {
    if (!overlay) return;
    const children = [...overlay.children].filter((child) =>
        child !== previousAudio
    );
    if (audio) children.push(audio);
    overlay.replaceChildren(...children);
  }

  /**
   * 把当前 HUD 等级、音乐等级与两个 owner 写入 overlay 数据集，供测试与调试观察。
   */
  function syncAlertDatasets() {
    if (!overlay?.dataset) return;
    overlay.dataset.lobotomyCorpAlertSource = lobotomyCorpDangerVisualAlert()
        ? 'danger'
        : directSessionState && musicSourceState === 'direct'
            ? 'direct'
            : musicSourceState;
    overlay.dataset.lobotomyCorpAlertMusicSource = musicSourceState;
    overlay.dataset.lobotomyCorpAlertVisualLevel = String(
        visualAlert?.level ?? 0,
    );
    overlay.dataset.lobotomyCorpAlertMusicLevel = String(
        alertContext.musicAlert?.level ?? 0,
    );
  }

  /**
   * 计算当前会话应显示的 HUD；只读状态，不触碰 DOM。
   *
   * @return {LobotomyCorpAlert|undefined} 实时 Danger 警报；没有 Danger Emergency 且会话由 Direct 建立时才回落到 Direct 警报。
   */
  function nextVisualAlertForSession() {
    return lobotomyCorpDangerVisualAlert() ??
        (directSessionState ? alertContext.musicAlert : undefined);
  }

  /**
   * 只更新 HUD 业务状态（当前视觉警报与顶部按钮文案），不渲染 DOM。
   *
   * 渲染统一交给调用方，确保「一次状态更新 → 一次视觉 render」。
   *
   * @param {LobotomyCorpAlert|undefined} nextVisualAlert 新的 HUD 警报。
   */
  function applyVisualAlert(nextVisualAlert) {
    visualAlert = nextVisualAlert;
    alertContext.visualAlert = nextVisualAlert;
    syncTopPanelActionText(nextVisualAlert);
  }

  /**
   * 只替换 HUD 视觉：复用 overlay 与顶部 Restart panel，仅重建四角与按钮文案。
   *
   * 该函数不触碰 Audio、replay 计时器或自然结束计时，因此 HUD 升降不会
   * pause / restart 音乐，也不会让 replay gap 重新计时。
   *
   * @param {LobotomyCorpAlert|undefined} nextVisualAlert 新的 HUD 警报；undefined 表示收起四角警报框。
   */
  function replaceVisual(nextVisualAlert) {
    applyVisualAlert(nextVisualAlert);
    renderAlertOverlayChildren();
    updateCanvasScale(true);
    syncAlertDatasets();
    persistPlaybackPosition();
  }

  /**
   * 按「实时 Danger 优先」的规则重算 HUD。
   *
   * Danger Emergency 存在时 HUD 等于实时 Danger 等级，与音乐等级、music high-water 无关；
   * 只有 Direct 自己建立的会话在没有 Danger Emergency 时才显示 Direct 的警报框。
   * Danger Emergency 结束而 Direct one-shot 仍在播放时，HUD 直接消失（不显示 Direct 视觉）。
   */
  function syncVisual() {
    if (closing || finished) return;
    const nextVisualAlert = nextVisualAlertForSession();
    if (nextVisualAlert === visualAlert) {
      syncAlertDatasets();
      return;
    }
    replaceVisual(nextVisualAlert);
  }

  /**
   * 在当前会话内替换音乐 owner：停止旧 Audio 并按新等级从头播放。
   *
   * HUD / overlay / 顶部面板都不重建，因此 Direct 音乐接管不会改变四角警报框。
   *
   * @param {LobotomyCorpAlert} nextMusicAlert 新的音乐警报。
   * @param {'danger'|'direct'} nextMusicSource 新的音乐 owner。
   * @param {object} [nextPreparedMedia] 可采用的预热媒体。
   * @return {Promise<boolean>} 新音乐 owner 的 activation Promise。
   */
  function takeOverMusic(nextMusicAlert, nextMusicSource, nextPreparedMedia) {
    if (closing || finished) {
      nextPreparedMedia?.dispose?.();
      return Promise.resolve(true);
    }
    const previousActivation = currentActivation;
    currentActivation = createAlertActivation();
    alertContext.promise = currentActivation.promise;
    previousActivation.resolve(true);

    detachAudio(true);
    fallbackPosition = 0;
    pendingResumePosition = undefined;
    replayAt = undefined;
    // 普通 Danger / Direct 接管后，WhiteNight 阶段时间线释放当前曲目的所有权。
    specialEventStageMusicOwned = false;
    musicSourceState = nextMusicSource;
    // Danger 接管后本会话由 Danger 驱动：Emergency 结束时 HUD 随之消失。
    if (nextMusicSource === 'danger') directSessionState = false;
    alertContext.musicAlert = nextMusicAlert;
    alertContext.playbackState = specialEventMusicDucked
        ? 'special-event-held'
        : 'normal-playing';
    audio = nextPreparedMedia?.consume?.(nextMusicAlert.soundPath);
    if (audio) {
      configureAlertAudio();
    } else {
      nextPreparedMedia?.dispose?.();
      createAlertAudio();
    }
    // 一次状态更新只渲染一次：先算好新的 HUD owner，再统一重建四角节点与新 Audio。
    // 重建四角后重新写入 CanvasScaler，否则新节点会丢失缩放。
    applyVisualAlert(nextVisualAlertForSession());
    renderAlertOverlayChildren();
    updateCanvasScale(true);
    syncAlertDatasets();
    persistPlaybackPosition();
    return currentActivation.promise;
  }

  /**
   * Direct one-shot 自然结束：恢复底层 Danger music high-water，或结束整个会话。
   *
   * 恢复对象是 music high-water，不是当前实时 HUD 等级；Danger < 10 时不恢复任何 Danger 音乐。
   */
  function finishDirectAlertMusic() {
    if (closing || finished) return;
    const dangerMusicAlert = lobotomyCorpDangerMusicAlert();
    if (!dangerMusicAlert) {
      finishAlert({animateExit: false});
      return;
    }
    void takeOverMusic(dangerMusicAlert, 'danger');
    syncVisual();
  }

  /**
   * 在字体和 Sprite 准备完成后挂载 Unity 风格层级。
   *
   * 资源准备是异步的，期间可能发生音乐接管或 HUD 升降；因此始终按当前会话状态挂载，
   * 避免接管导致整个会话丢失 HUD。
   *
   * @return {Promise<void>} HUD 挂载或被提前关闭后完成。
   */
  async function mountLobotomyCorpAlert() {
    try {
      if (shouldPrepareLobotomyCorpVisualAssets()) {
        await prepareLobotomyCorpVisualAssets();
      }
      if (closing || finished || activeLobotomyCorpAlert !== alertContext) {
        return;
      }
      if (!globalThis.document?.createElement || !globalThis.document.body) {
        currentActivation.resolve(true);
        return;
      }

      overlay = document.createElement('div');
      overlay.className = 'lobotomy-corp-alert-overlay';
      overlay.setAttribute('aria-live', 'assertive');
      overlay.setAttribute('aria-label', 'Lobotomy Corporation alert');
      overlay.dataset.lobotomyCorpAlertStartedAt = String(
          alertContext.startedAt,
      );
      overlay.dataset.lobotomyCorpAlertResumeAt = String(
          currentAudioPosition(),
      );
      const topPanelController = createLobotomyCorpTopPanel();
      topPanel = topPanelController.element;
      topPanelActiveController = topPanelController.activeController;
      endAlertButton = topPanelController.endAlertButton;
      endAlertButtonText = topPanelController.endAlertButtonText;
      endAlertButton.addEventListener('click', finishAlertFromButton);
      syncTopPanelActionText(visualAlert);
      if (!audio) {
        createAlertAudio();
      } else if (!alertContext.audio) {
        // 采用用户手势中预热的 Audio 时，补上本会话的监听器与播放流程。
        configureAlertAudio();
      }
      // 白夜期间仍保留普通 Trumpet 实例，只是把它压到 duck 目标音量作为背景音乐。
      renderAlertOverlayChildren();
      syncAlertDatasets();
      updateCanvasScale(true);
      globalThis.addEventListener?.(
          'resize',
          updateCanvasScaleFromViewport,
      );
      visualViewport?.addEventListener?.(
          'resize',
          updateCanvasScaleFromViewport,
      );
      const previousOverlay = overlay;
      document.body.append(previousOverlay);
      globalThis.addEventListener?.('pagehide', persistPlaybackPosition, {
        once: true,
      });
      mounted = true;
      persistPlaybackPosition();
    } catch {
      // 视觉资源加载或 DOM 初始化失败时，沿用既有生命周期清理警报状态。
      finishAlert({animateExit: false});
    }
  }

  const coordinatorStop = finishLobotomyCorpDayFromCoordinator;
  alertContext.finish = finishAlertFromCoordinator;
  alertContext.finishVisible = () => finishAlert({animateExit: false});
  alertContext.holdMusicForSpecialEvent = () => {
    holdAlertMusicForSpecialEvent();
  };
  alertContext.prepareMusicForSpecialEventResume =
      prepareAlertMusicForSpecialEventResume;
  alertContext.resumeMusicAfterSpecialEvent = resumeAlertMusicAfterSpecialEvent;
  alertContext.setSpecialEventStageMusic = setSpecialEventStageAlertMusic;
  alertContext.fadeMusicToSpecialEventHold = fadeAlertMusicToSpecialEventHold;
  alertContext.syncVisual = syncVisual;
  alertContext.takeOverMusic = takeOverMusic;
  // 提交新会话前再次确认没有会话在本次 start 执行期间（例如采用预热媒体时）被并发建立。
  const commitRaceResult = takeOverExistingSessionIfRacing();
  if (commitRaceResult !== undefined) {
    return commitRaceResult;
  }
  activeLobotomyCorpAlert = alertContext;
  globalThis.easterEggCoordinator?.start(
      lobotomyCorpEasterEggGameId,
      coordinatorStop,
  );
  persistPlaybackPosition();
  void mountLobotomyCorpAlert();
  return currentActivation.promise;
}

/** “别碰我”的 canonical 编号；保存该编号时由假关服彩蛋接管。 */
const lobotomyCorpDontTouchMeId = 'O-05-47';

/**
 * 统计可出逃异想体的数量与平均危急值基值。
 *
 * 规则与点数表都在危急值模块里，这里只把页面已注入的异想体资料递进去。
 *
 * @return {{averageDanger: number, count: number, totalDanger: number}} 统计结果。
 */
function lobotomyCorpEscapableDangerSummary() {
  return escapableAbnormalitySummary(lobotomyCorpAbnormalities);
}

/**
 * 计算“异想体全部出逃”的危急值贡献。
 *
 * @param {number} departmentCount 当前已开放的部门数。
 * @return {number} 危急值贡献。
 */
function lobotomyCorpEscapeAllDangerContribution(departmentCount) {
  return escapeAllDangerContribution(
      lobotomyCorpAbnormalities,
      departmentCount,
  );
}

/**
 * 结算“别碰我”本次点击造成的员工危急值。
 *
 * 一个部门满编 5 人，且这笔贡献不除以部门数。
 *
 * @param {"death"|"panic"} kind 事件类型。
 */
function applyLobotomyCorpDontTouchMeWorkerDanger(kind) {
  const contribution = employeeDangerContribution(
      kind,
      employeeCountForDepartments(lobotomyCorpDepartmentCountForDay()),
  );
  void setLobotomyCorpDangerScore(
      clampDangerScore(lobotomyCorpDangerScore + contribution),
      undefined,
      {positiveContribution: true},
  );
}

/**
 * 结算“异想体全部出逃”的危急值。
 *
 * 出逃数量与平均基值都由危急值模块从异想体资料现算，本函数只负责写入。
 */
function applyLobotomyCorpDontTouchMeEscapeDanger() {
  const contribution = lobotomyCorpEscapeAllDangerContribution(
      lobotomyCorpDepartmentCountForDay(),
  );
  void setLobotomyCorpDangerScore(
      clampDangerScore(lobotomyCorpDangerScore + contribution),
      undefined,
      {positiveContribution: true},
  );
}

/**
 * 把“别碰我”的假关服当作游戏崩溃收尾。
 *
 * 页面跳到 404 时游戏已经“关服”，危急值、警报与持久化的 Day 状态都应随之消失，
 * 否则 404 页面会接着播放未播完的警报音乐。
 */
function crashLobotomyCorpDanger() {
  void stopLobotomyCorpAlert();
  clearLobotomyCorpDay();
}

/**
 * “别碰我”假关服演出。
 *
 * 前 4 次点击只结算各自的危急值；第 5 次点击的假关服在跳转前把危急值与警报一并
 * 当作游戏崩溃收尾。保存一开始就被拦截，用户返回设置页时显示名称仍是修改前的值。
 */
const lobotomyCorpDontTouchMeShutdown = createDontTouchMeShutdown({
  assetRoot: lobotomyCorpAssetRoot,
  onExit: crashLobotomyCorpDanger,
  onEffectPicked: (effectId) => {
    if (effectId === dontTouchMeKillEffect.id) {
      applyLobotomyCorpDontTouchMeWorkerDanger('death');
    } else if (effectId === dontTouchMePanicEffect.id) {
      applyLobotomyCorpDontTouchMeWorkerDanger('panic');
    } else if (effectId === dontTouchMeEscapeEffect.id) {
      applyLobotomyCorpDontTouchMeEscapeDanger();
    }
  },
});

/**
 * 判断待保存的显示名称是否由“别碰我”假关服接管。
 *
 * 特殊事件进行期间沿用“仅保存名称、不激活其它事件”的既有规则。
 *
 * @param {string} value 待保存的显示名称。
 * @return {boolean} 需要拦截保存并播放假关服时返回 true。
 */
function lobotomyCorpBlocksDisplayNameSave(value) {
  if (lobotomyCorpWhiteNightEvent.isActive()) return false;
  return matchingLobotomyCorpAbnormality(value)?.canonicalId ===
      lobotomyCorpDontTouchMeId;
}

/**
 * 保存被拦截后播放“别碰我”本次点击对应的演出。
 *
 * @return {Promise<void>} 演出结束时完成。
 */
function playLobotomyCorpDontTouchMe() {
  const stop = () => lobotomyCorpDontTouchMeShutdown.stop();
  globalThis.easterEggCoordinator?.start(lobotomyCorpEasterEggGameId, stop);
  return lobotomyCorpDontTouchMeShutdown.play().finally(() => {
    globalThis.easterEggCoordinator?.finish?.(
        lobotomyCorpEasterEggGameId,
        stop,
    );
  });
}

// WhiteNight 只通过此窄接口访问通用 Day / Alert 生命周期，避免复制业务状态。
const lobotomyCorpWhiteNightEvent = createWhiteNightEvent({
  assetRoot: lobotomyCorpAssetRoot,
  confessionAliases: () => lobotomyCorpConfessionAliases,
  ensureCoordinator: ensureLobotomyCorpDayCoordinator,
  finishRestartPanel: () => activeLobotomyCorpRestartPanel?.finish(),
  getAlert: () => activeLobotomyCorpAlert,
  holdAlertMusic: () => activeLobotomyCorpAlert?.holdMusicForSpecialEvent?.(),
  isReload: isLobotomyCorpAlertPageReload,
  messages: () => lobotomyCorpMessages,
  mountRestartPanel: mountLobotomyCorpRestartPanel,
  normalize: normalizeLobotomyCorpAbnormalityName,
  pauseDangerDecay: pauseLobotomyCorpDangerDecay,
  resumeAlertMusic: () =>
      activeLobotomyCorpAlert?.resumeMusicAfterSpecialEvent?.(),
  prepareAlertMusicForResume: () =>
      activeLobotomyCorpAlert?.prepareMusicForSpecialEventResume?.(),
  resumeDangerDecay: restoreLobotomyCorpDangerDecay,
  setSpecialEventStageAlertMusic: (alert, options) =>
      activeLobotomyCorpAlert?.setSpecialEventStageMusic?.(alert, options),
  fadeAlertMusicToSpecialEventHold: (durationMs, options) =>
      activeLobotomyCorpAlert?.fadeMusicToSpecialEventHold?.(durationMs, options),
  settleWhiteNightActive: settleLobotomyCorpWhiteNightActiveDanger,
  // 白夜阶段演出复用共享层的淡化公式，刷新淡出中途时按剩余比例重建起始音量。
  alertMusicFadeOutStartVolume: lobotomyCorpAlertMusicFadeOutStartVolume,
  specialEventMusicFadeOutMs: lobotomyCorpSpecialEventMusicFadeOutMs,
  stageMusicAlert: lobotomyCorpDangerSettlementAlert,
  storageKey: lobotomyCorpSpecialEventSessionKey,
  storages: lobotomyCorpAlertStorages,
});

globalThis.lobotomyCorpEasterEgg = Object.freeze({
  activate: activateLobotomyCorpAlert,
  blocksDisplayNameSave: lobotomyCorpBlocksDisplayNameSave,
  canvasScaleForViewport: lobotomyCorpCanvasScaleForViewport,
  canvasViewportForUpdate: lobotomyCorpCanvasViewportForUpdate,
  commitDisplayName: commitLobotomyCorpDisplayName,
  escapeAllDangerContribution: lobotomyCorpEscapeAllDangerContribution,
  escapableDangerSummary: lobotomyCorpEscapableDangerSummary,
  getDangerMusicHighWaterLevel: getLobotomyCorpDangerMusicHighWaterLevel,
  getDangerScore: getLobotomyCorpDangerScore,
  getSpecialEvent: () => lobotomyCorpWhiteNightEvent.getId(),
  getSpecialEventPhase: () => lobotomyCorpWhiteNightEvent.getPhase(),
  handleAbnormalitySubmitted: handleLobotomyCorpAbnormalitySubmitted,
  matches: (value) =>
      matchesLobotomyCorpAlert(value) ||
      Boolean(matchingLobotomyCorpAbnormality(value)) ||
      (lobotomyCorpWhiteNightEvent.isActive() &&
          lobotomyCorpWhiteNightEvent.matchesConfession(value)),
  matchingAbnormality: matchingLobotomyCorpAbnormality,
  onAbnormalitySubmitted: (listener) => {
    lobotomyCorpAbnormalitySubmissionListeners.add(listener);
    return () => lobotomyCorpAbnormalitySubmissionListeners.delete(listener);
  },
  playDontTouchMe: playLobotomyCorpDontTouchMe,
  prepareDisplayName: prepareLobotomyCorpDisplayName,
  restartDay: restartLobotomyCorpDay,
  setDangerScore: setLobotomyCorpDangerScore,
  startWhiteNight: lobotomyCorpWhiteNightEvent.start,
  submitsWhileActive: true,
});

const restoredLobotomyCorpSpecialEvent = lobotomyCorpWhiteNightEvent
    .persisted();
if (isLobotomyCorpAlertPageReload() && !restoredLobotomyCorpSpecialEvent) {
  clearPersistedLobotomyCorpAlert();
  clearPersistedLobotomyCorpDay();
} else {
  restorePersistedLobotomyCorpDay();
  ensureLobotomyCorpDayCoordinator();
  const restoredLobotomyCorpAlert = persistedLobotomyCorpAlert();
  // Danger 来源的会话只有在 music high-water 仍然成立（Danger ≥ 10）时才有意义；
  // Direct one-shot 会话在没有 Danger Emergency 时同样恢复。
  if (
      restoredLobotomyCorpAlert &&
      !(restoredLobotomyCorpAlert.musicSource === 'danger' &&
          lobotomyCorpDangerMusicHighWaterLevel <= 0)
  ) {
    const restoredAlertIsHeld =
        restoredLobotomyCorpAlert.playbackState === 'special-event-held' ||
        (restoredLobotomyCorpAlert.playbackState === 'normal-playing' &&
            restoredLobotomyCorpSpecialEvent?.id ===
            lobotomyCorpWhiteNightEventId &&
            restoredLobotomyCorpSpecialEvent?.phase !== 'prelude');
    void startLobotomyCorpAlert({
      directSession: restoredLobotomyCorpAlert.directSession,
      initiallyDucked: restoredAlertIsHeld,
      musicAlert: restoredLobotomyCorpAlert.musicAlert,
      musicSource: restoredLobotomyCorpAlert.musicSource,
      playbackState: restoredAlertIsHeld
          ? 'special-event-held'
          : restoredLobotomyCorpAlert.playbackState === 'replay-intermission'
              ? 'replay-intermission'
              : 'normal-playing',
      replayAt: restoredLobotomyCorpAlert.replayAt,
      resumeAt: restoredLobotomyCorpAlert.position,
      startedAt: restoredLobotomyCorpAlert.startedAt,
      // 恢复时 HUD 按当前 Danger Score 重新计算；没有 Danger Emergency 时才回落到存档里的视觉。
      visualAlert: lobotomyCorpDangerVisualAlert() ??
          restoredLobotomyCorpAlert.visualAlert,
    });
    if (restoredLobotomyCorpAlert.musicSource === 'danger') {
      // Danger 来源的音乐与本次 Emergency 的 music high-water 对齐：只补升，不降低。
      void reconcileLobotomyCorpDangerAlert();
    }
  }
}
if (restoredLobotomyCorpSpecialEvent?.id === lobotomyCorpWhiteNightEventId) {
  lobotomyCorpWhiteNightEvent.restore();
} else {
  restoreLobotomyCorpDangerDecay();
}

/**
 * 读取服务端渲染的账户显示名称，不依赖只存在于设置页的输入框。
 *
 * @return {string|undefined} 当前已保存显示名称。
 */
function persistedLobotomyCorpDisplayName() {
  const serialized = lobotomyCorpEmbeddedText(
      'lobotomy-corp-account-identity-data',
  );
  if (serialized) {
    try {
      const displayName = JSON.parse(serialized)?.displayName;
      return typeof displayName === 'string' ? displayName : undefined;
    } catch {
      return undefined;
    }
  }
  return globalThis.document?.querySelector?.(
      '[data-account-display-name-input]',
  )?.dataset?.accountDisplayNameOriginal;
}

const persistedDisplayName = persistedLobotomyCorpDisplayName();
if (persistedDisplayName !== undefined) {
  syncLobotomyCorpAbnormalityIdentity(persistedDisplayName);
}
