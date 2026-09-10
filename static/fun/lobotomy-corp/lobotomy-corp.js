/**
 * @file 本文件提供修改显示名称时触发的《脑叶公司》Trumpet 警报彩蛋。
 */

import {
  createWhiteNightEvent,
  whiteNightDeathSounds,
} from "./Events/WhiteNight.js";

/** 白夜被镇压后，后台 Trumpet 恢复至正常音量所需时长（毫秒）。 */
const lobotomyCorpSpecialEventMusicFadeInMs = 1000;

/**
 * 《脑叶公司》解包资源的公共访问根路径。
 */
const lobotomyCorpAssetRoot = "/static/fun/lobotomy-corp/Assets";

/** 当前页面已准备的《脑叶公司》专用文本。 */
let lobotomyCorpMessages;

/** 当前页面已准备的通用异想体资料。 */
let lobotomyCorpAbnormalities;

/** 规范化名称到 canonical 异想体编号的查找索引。 */
let lobotomyCorpAbnormalityIndex;

/** 所有维护语言提供的“赎罪”特殊工作别名。 */
let lobotomyCorpConfessionAliases = new Set();

/** 初始化服务端注入的《脑叶公司》当前本地化。 */
function initializeLobotomyCorpData() {
  const serialized = globalThis.document?.getElementById?.(
    "lobotomy-corp-locale-data",
  )?.textContent;
  if (!serialized) {
    throw new Error("《脑叶公司》彩蛋本地化尚未注入页面。");
  }
  lobotomyCorpMessages = JSON.parse(serialized);

  const abnormalitiesSerialized = globalThis.document?.getElementById?.(
    "lobotomy-corp-abnormalities-data",
  )?.textContent;
  lobotomyCorpAbnormalities = abnormalitiesSerialized
    ? JSON.parse(abnormalitiesSerialized)
    : {};
  lobotomyCorpAbnormalityIndex = new Map();
  Object.entries(lobotomyCorpAbnormalities).forEach(([canonicalId, data]) => {
    [canonicalId, ...(Array.isArray(data?.aliases) ? data.aliases : [])]
      .filter((name) => typeof name === "string")
      .forEach((name) =>
        lobotomyCorpAbnormalityIndex.set(
          normalizeLobotomyCorpAbnormalityName(name),
          canonicalId,
        )
      );
  });
  const confessionAliasesSerialized = globalThis.document?.getElementById?.(
    "lobotomy-corp-confession-aliases-data",
  )?.textContent;
  try {
    const aliases = confessionAliasesSerialized
      ? JSON.parse(confessionAliasesSerialized)
      : [];
    lobotomyCorpConfessionAliases = new Set(
      Array.isArray(aliases)
        ? aliases.filter((alias) => typeof alias === "string").map(
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
const lobotomyCorpAlertText = "ALERT ".repeat(85);

/**
 * Unity CanvasScaler 的参考画布宽度。
 */
const lobotomyCorpReferenceCanvasWidth = 1920;

/**
 * Unity CanvasScaler 的参考画布高度。
 */
const lobotomyCorpReferenceCanvasHeight = 1080;

/**
 * 竖屏 CanvasScaler 开始平滑过渡回 Match Width 的 viewport 宽度。
 */
const lobotomyCorpPortraitCanvasBlendStart = 640;

/**
 * 竖屏 CanvasScaler 完成平滑过渡并恢复 Match Width 的 viewport 宽度。
 */
const lobotomyCorpPortraitCanvasBlendEnd = 960;

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
  "Risk_Frame_Inner.png",
  "Risk_Frame_Outter.png",
  "Valve.png",
]);

/**
 * RestartButton 在 Normal 与 Pressed 状态下的 Unity Image.color。
 */
const lobotomyCorpRestartButtonTints = Object.freeze({
  normal: [0, 234, 219],
  pressed: [5, 174, 164],
});

/**
 * 警报口令、等级视觉参数与音频资源路径的对应关系。
 */
const lobotomyCorpAlerts = Object.freeze({
  firsttrumpet: {
    assetDirectory: "first-trumpet",
    emergencyColor: "#fcc93a",
    emergencyTint: [252, 201, 58],
    level: 1,
    riskFile: "Risk_1.png",
    soundPath: "Resources/sounds/bgm/emergency01_mast.ogg",
    trumpetLevel: "First\nTrumpet",
  },
  secondtrumpet: {
    assetDirectory: "second-trumpet",
    emergencyColor: "#fc773a",
    emergencyTint: [252, 119, 58],
    level: 2,
    riskFile: "Risk_2.png",
    soundPath: "Resources/sounds/bgm/emergency02_mast.ogg",
    trumpetLevel: "Second\nTrumpet",
  },
  thirdtrumpet: {
    assetDirectory: "third-trumpet",
    emergencyColor: "#fc3a3a",
    emergencyTint: [252, 58, 58],
    level: 3,
    riskFile: "Risk_3.png",
    soundPath: "Resources/sounds/bgm/emergency03_mast.ogg",
    trumpetLevel: "Third\nTrumpet",
  },
  fourthtrumpet: {
    assetDirectory: "fourth-trumpet",
    emergencyColor: "#00eadb",
    emergencyTint: [0, 234, 219],
    level: 4,
    riskFile: "MiddleArea_4_27.png",
    // Fourth 为项目自定义警报。此布局将近圆形图标移至 Triangle_1 内侧三角形的内心附近。
    riskRect: {
      anchoredX: 122,
      anchoredY: -116,
      height: 110,
      width: 110,
    },
    riskTint: [0, 234, 219],
    soundPath: "Resources/sounds/bgm/emergency04_mast.wav",
    trumpetLevel: "Fourth\nTrumpet",
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
    position: "left-up",
    triangleFile: "Triangle_1.png",
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
    position: "left-down",
    triangleFile: "Triangle_1.png",
  },
  {
    position: "right-up",
    triangleFile: "Triangle_2.png",
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
    position: "right-down",
    triangleFile: "Triangle_1.png",
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
const lobotomyCorpEasterEggGameId = "lobotomy-corp";

/**
 * 当前浏览会话中脑叶公司警报的存储键。
 */
const lobotomyCorpAlertSessionKey = "warmnest.lobotomy-corp-alert";

/** 当前 Day 的最小运行时持久化键。 */
const lobotomyCorpDaySessionKey = "warmnest.lobotomy-corp-day";

/** 当前脑叶公司特殊事件的持久化键。 */
const lobotomyCorpSpecialEventSessionKey =
  "warmnest.lobotomy-corp-special-event";

/** 白夜特殊事件的唯一标识。 */
const lobotomyCorpWhiteNightEventId = "white-night";

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

/** 当前 Day 已贡献危急值的 canonical 异想体编号。 */
let lobotomyCorpBreachedAbnormalitiesThisDay = new Set();

/** 当前 Day 为普通异想体贡献快照的部门数；手动警报 Day 可暂未初始化。 */
let lobotomyCorpDayDepartmentCount;

/** 正向 Danger 贡献后开始衰减前的截止时间戳。 */
let lobotomyCorpDangerDecayGraceDeadline;

/** 白夜冻结期间距离下一次 Danger 衰减尚余的毫秒数。 */
let lobotomyCorpDangerDecayPausedRemainingMs;

/** 当前 Danger 衰减所登记的唯一计时器。 */
let lobotomyCorpDangerDecayTimer;

/** 风险等级对应的默认出逃危急值。 */
const lobotomyCorpDangerByRiskLevel = Object.freeze({
  ALEPH: 75,
  HE: 40,
  TETH: 20,
  WAW: 60,
  ZAYIN: 5,
});

/** 已注册的 canonical 异想体提交观察者。 */
const lobotomyCorpAbnormalitySubmissionListeners = new Set();

/** 风险等级对应的原版 Sprite 文件名。 */
const lobotomyCorpRiskSpriteByLevel = Object.freeze({
  ALEPH: "Risk_Aleph.png",
  HE: "Risk_He.png",
  TETH: "Risk_Teth.png",
  WAW: "Risk_Waw.png",
  ZAYIN: "Risk_Zayin.png",
});

/**
 * 规范化异想体编号与别名：只处理 Unicode、首尾空白和大小写。
 *
 * @param {string} value 待匹配的显示名称。
 * @return {string} 用于 lookup 的键。
 */
function normalizeLobotomyCorpAbnormalityName(value) {
  return String(value).normalize("NFKC").trim().toLocaleLowerCase("en-US");
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
  return abnormality ? { canonicalId, abnormality } : undefined;
}

/**
 * 将网页 locale 映射为异想体资料支持的 locale。
 *
 * @param {string|undefined} locale 页面语言。
 * @return {string} 异想体资料的 locale。
 */
function lobotomyCorpAbnormalityLocale(locale) {
  const aliases = {
    "en-CA": "en-US",
    "en-GB": "en-US",
    "zh-HK": "zh-TW",
    "zh-MO": "zh-TW",
    "zh-SG": "zh-CN",
  };
  const supported = new Set([
    "en-US",
    "zh-CN",
    "zh-TW",
    "ja-JP",
    "ko-KR",
    "ru-RU",
    "es-ES",
    "bg-BG",
    "vi-VN",
  ]);
  const resolved = aliases[locale] ?? locale;
  return supported.has(resolved) ? resolved : "en-US";
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
  return abnormality.names?.[locale] || abnormality.names?.["en-US"] || "";
}

/**
 * 规范化警报口令，忽略大小写、空格和连字符。
 *
 * @param {string} value 待匹配的用户名或显示名称。
 * @return {string} 用于匹配的标准化口令。
 */
function normalizeLobotomyCorpAlertName(value) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(
    /[\s-]+/gu,
    "",
  );
}

/**
 * 查找名称对应的脑叶公司警报。
 *
 * @param {string} value 待匹配的用户名或显示名称。
 * @return {{assetDirectory: string, soundPath: string}|undefined} 匹配的警报配置。
 */
function matchingLobotomyCorpAlert(value) {
  return lobotomyCorpAlerts[normalizeLobotomyCorpAlertName(value)];
}

/**
 * 查找已持久化配置对应的脑叶公司警报。
 *
 * @param {string} assetDirectory 警报资源目录。
 * @return {{assetDirectory: string, soundPath: string}|undefined} 匹配的警报配置。
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
  ["sessionStorage", "localStorage"].forEach((storageName) => {
    try {
      const storage = globalThis[storageName];
      if (
        storage && typeof storage.getItem === "function" &&
        typeof storage.setItem === "function" &&
        typeof storage.removeItem === "function"
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
 * @param {{assetDirectory: string}|undefined} visualAlert 当前 HUD 警报；没有 HUD 时为 undefined。
 * @param {{assetDirectory: string}} musicAlert 当前实际音乐对应的逻辑警报。
 * @param {number} startedAt 警报开始的时间戳。
 * @param {number} position 当前音频播放进度（秒）。
 */
function persistLobotomyCorpAlert(
  visualAlert,
  musicAlert,
  startedAt,
  position,
) {
  const serialized = JSON.stringify({
    musicAssetDirectory: musicAlert.assetDirectory,
    position,
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
 * 持久化当前连续 Day；身份 UI 始终由已保存的显示名称派生，不写入这里。
 */
function persistLobotomyCorpDay() {
  if (lobotomyCorpDangerScore <= 0) {
    clearPersistedLobotomyCorpDay();
    return;
  }
  const serialized = JSON.stringify({
    countedAbnormalityIds: [...lobotomyCorpBreachedAbnormalitiesThisDay],
    ...(lobotomyCorpDangerDecayGraceDeadline === undefined
      ? {}
      : { decayGraceDeadline: lobotomyCorpDangerDecayGraceDeadline }),
    ...(lobotomyCorpDangerDecayPausedRemainingMs === undefined ? {} : {
      decayPausedRemainingMs: lobotomyCorpDangerDecayPausedRemainingMs,
    }),
    ...(lobotomyCorpDayDepartmentCount === undefined
      ? {}
      : { departmentCount: lobotomyCorpDayDepartmentCount }),
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
    const departmentCount = saved?.departmentCount;
    const decayGraceDeadline = saved?.decayGraceDeadline;
    const decayPausedRemainingMs = saved?.decayPausedRemainingMs;
    if (
      typeof score !== "number" || !Number.isFinite(score) || score <= 0 ||
      score > 100 ||
      !Array.isArray(ids) || !ids.every((id) => typeof id === "string") ||
      (departmentCount !== undefined &&
        (!Number.isInteger(departmentCount) || departmentCount < 1 ||
          departmentCount > 11)) ||
      (decayGraceDeadline !== undefined &&
        (!Number.isFinite(decayGraceDeadline) || decayGraceDeadline < 0)) ||
      (decayPausedRemainingMs !== undefined &&
        (!Number.isFinite(decayPausedRemainingMs) ||
          decayPausedRemainingMs < 0)) ||
      (decayGraceDeadline !== undefined &&
        decayPausedRemainingMs !== undefined)
    ) {
      throw new Error("Invalid Lobotomy Corporation Day state.");
    }
    lobotomyCorpDangerScore = score;
    lobotomyCorpBreachedAbnormalitiesThisDay = new Set(ids);
    lobotomyCorpDayDepartmentCount = departmentCount;
    lobotomyCorpDangerDecayGraceDeadline = decayGraceDeadline;
    lobotomyCorpDangerDecayPausedRemainingMs = decayPausedRemainingMs;
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
  lobotomyCorpBreachedAbnormalitiesThisDay.clear();
  lobotomyCorpDayDepartmentCount = undefined;
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
      { isDecay: true },
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
  lobotomyCorpWhiteNightEvent?.finish({ restoreAlert: false });
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
    const navigationEntry = globalThis.performance?.getEntriesByType?.(
      "navigation",
    )[0];
    return navigationEntry?.type === "reload";
  } catch {
    return false;
  }
}

/**
 * 读取待恢复的警报状态。
 *
 * @return {{musicAlert: object, position: number, startedAt: number, visualAlert: object|undefined}|undefined} 待恢复状态。
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
    const visualAlert = typeof visualAssetDirectory === "string"
      ? lobotomyCorpAlertByAssetDirectory(visualAssetDirectory)
      : undefined;
    const musicAlert = typeof musicAssetDirectory === "string"
      ? lobotomyCorpAlertByAssetDirectory(musicAssetDirectory)
      : undefined;
    return musicAlert && typeof saved.startedAt === "number" &&
        Number.isFinite(saved.startedAt) &&
        typeof saved.position === "number" &&
        Number.isFinite(saved.position)
      ? {
        musicAlert,
        position: saved.position,
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
  return startLobotomyCorpAlert(alert, Date.now(), 0, undefined, preparedMedia);
}

/**
 * 在同步用户手势中准备可能会在服务器确认后播放的警报媒体。
 *
 * 此阶段只触碰 Audio，绝不建立 Day、HUD 或持久化业务状态。
 *
 * @param {string} value 待保存的显示名称。
 * @return {{commit: () => Promise<boolean>, dispose: () => void}} 可提交或释放的媒体句柄。
 */
function prepareLobotomyCorpDisplayName(value) {
  const abnormalityMatch = matchingLobotomyCorpAbnormality(value);
  const alert = matchingLobotomyCorpAlert(value) ??
    (abnormalityMatch?.abnormality.canBreach &&
        !lobotomyCorpBreachedAbnormalitiesThisDay.has(
          abnormalityMatch.canonicalId,
        )
      ? lobotomyCorpAlertForDangerScore(
        Math.min(
          100,
          lobotomyCorpDangerScore +
            lobotomyCorpDangerContribution(
              abnormalityMatch.abnormality,
              lobotomyCorpDayDepartmentCount ??
                lobotomyCorpDepartmentCountFromPolling(),
            ),
        ),
      )
      : undefined);
  let audio;
  let state = "prepared";
  const specialAudio = new Map();
  const adoptedAudio = new Set();

  /**
   * 在当前用户手势内预热一段白夜专用音频。
   *
   * @param {string} soundPath 相对于 Assets 的音频路径。
   */
  function prepareSpecialAudio(soundPath) {
    if (typeof globalThis.Audio !== "function") return;
    const prepared = new Audio(`${lobotomyCorpAssetRoot}/${soundPath}`);
    prepared.hidden = true;
    prepared.muted = true;
    prepared.preload = "auto";
    prepared.setAttribute("aria-hidden", "true");
    specialAudio.set(soundPath, prepared);
    void prepared.play().then(() => {
      if (state === "prepared") {
        prepared.pause();
        prepared.currentTime = 0;
      }
    }).catch(() => {});
  }

  if (alert && typeof globalThis.Audio === "function") {
    audio = new Audio(
      `${lobotomyCorpAssetRoot}/${alert.soundPath}`,
    );
    audio.hidden = true;
    audio.muted = true;
    audio.preload = "auto";
    audio.setAttribute("aria-hidden", "true");
    // 该调用仍在 submit click 的同步栈中，保留 Chromium 的 transient activation。
    void audio.play().then(() => {
      if (state === "prepared") {
        audio.pause();
        audio.currentTime = 0;
      }
    }).catch(() => {
      // 某些浏览器不允许预播放；提交后仍会按既有路径尝试播放。
    });
  }
  if (abnormalityMatch?.canonicalId === "T-03-46") {
    prepareSpecialAudio(lobotomyCorpWhiteNightEvent?.soundPaths.bell);
    prepareSpecialAudio(lobotomyCorpWhiteNightEvent?.soundPaths.church);
  } else if (
    lobotomyCorpWhiteNightEvent?.isActive() &&
    lobotomyCorpWhiteNightEvent.matchesConfession(value)
  ) {
    whiteNightDeathSounds.forEach(({ path }) => prepareSpecialAudio(path));
  }
  const preparedMedia = Object.freeze({
    /**
     * 仅在已提交且音频目标匹配时，将媒体所有权转交给正式警报。
     *
     * @param {string} soundPath 正式警报当前需要的音频资源路径。
     * @return {HTMLAudioElement|undefined} 可采用的音频。
     */
    consume: (soundPath) => {
      if (
        state !== "committed" || audio?.src?.endsWith(`/${soundPath}`) !== true
      ) {
        return undefined;
      }
      adoptedAudio.add(audio);
      return audio;
    },
    /**
     * 将已提交的白夜专用媒体转交给事件；资源不匹配时安全回退到新建音频。
     *
     * @param {string} soundPath 需要的白夜音频路径。
     * @return {HTMLAudioElement|undefined} 已预热的音频。
     */
    consumeWhiteNight: (soundPath) => {
      const prepared = specialAudio.get(soundPath);
      if (state !== "committed" || !prepared) return undefined;
      adoptedAudio.add(prepared);
      prepared.muted = false;
      return prepared;
    },
    dispose: () => {
      if (state === "disposed") return;
      state = "disposed";
      [audio, ...specialAudio.values()].forEach((prepared) => {
        if (!prepared || adoptedAudio.has(prepared)) return;
        prepared.pause();
        prepared.removeAttribute?.("src");
        prepared.load?.();
      });
    },
    commit: () => {
      if (state !== "prepared") return Promise.resolve(true);
      state = "committed";
      return commitLobotomyCorpDisplayName(value, preparedMedia);
    },
  });
  return preparedMedia;
}

/**
 * 根据危急值查找应播放的脑叶公司警报。
 *
 * @param {number} dangerScore 当前危急值。
 * @return {{assetDirectory: string, soundPath: string}|undefined} 对应的警报配置；无警报区间时返回 undefined。
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
 * 读取当前脑叶公司彩蛋危急值。
 *
 * @return {number} 当前 0 到 100 的有限危急值。
 */
function getLobotomyCorpDangerScore() {
  return lobotomyCorpDangerScore;
}

/**
 * 结束当前脑叶公司警报。
 *
 * @return {Promise<boolean>} 当前警报结束后返回 true；没有活跃警报时立即返回 true。
 */
function stopLobotomyCorpAlert() {
  lobotomyCorpWhiteNightEvent?.finish({ restoreAlert: false });
  if (!activeLobotomyCorpAlert) {
    clearLobotomyCorpDay();
    globalThis.easterEggCoordinator?.finish(
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
  lobotomyCorpWhiteNightEvent?.finish({ restoreAlert: false });
  return stopLobotomyCorpAlert();
}

/**
 * 设置脑叶公司彩蛋危急值，并激活其所在区间对应的警报。
 *
 * @param {number} dangerScore 新的 0 到 100 有限危急值。
 * @param {object} [preparedMedia] 在用户手势中预先准备的媒体句柄。
 * @param {{isDecay?: boolean, positiveContribution?: boolean, suppressMusic?: boolean}} [options] 危急值来源与初始媒体输出配置。
 * @return {Promise<boolean>} 对应警报结束或无警报状态生效后返回 true。
 */
function setLobotomyCorpDangerScore(dangerScore, preparedMedia, options = {}) {
  if (
    typeof dangerScore !== "number" || !Number.isFinite(dangerScore) ||
    dangerScore < 0 || dangerScore > 100
  ) {
    return Promise.reject(
      new RangeError("Danger Score 必须是 0 到 100 的有限数值。"),
    );
  }

  lobotomyCorpDangerScore = dangerScore;
  if (dangerScore > 0) {
    persistLobotomyCorpDay();
    ensureLobotomyCorpDayCoordinator();
  } else {
    clearLobotomyCorpDay();
  }
  if (!options.isDecay && options.positiveContribution === true) {
    resetLobotomyCorpDangerDecayGrace();
  }
  const alert = lobotomyCorpAlertForDangerScore(dangerScore);
  if (alert) {
    return startLobotomyCorpAlert(
      alert,
      Date.now(),
      0,
      undefined,
      preparedMedia,
      options.suppressMusic === true,
    );
  }
  preparedMedia?.dispose?.();
  if (dangerScore === 0) {
    return stopLobotomyCorpAlert();
  }
  return activeLobotomyCorpAlert
    ? activeLobotomyCorpAlert.replaceVisual(undefined)
    : Promise.resolve(true);
}

/**
 * 根据已保存的显示名称同步所有头像宿主的派生异想体身份 UI。
 *
 * @param {string} displayName 已保存的显示名称。
 */
function syncLobotomyCorpAbnormalityIdentity(displayName) {
  const document = globalThis.document;
  const label = document?.querySelector?.("[data-account-display-name-label]");
  const avatarWrappers = [
    ...(document?.querySelectorAll?.("[data-lobotomy-corp-risk-host]") ?? []),
  ];
  const match = matchingLobotomyCorpAbnormality(displayName);
  if (label) {
    if (label.dataset.lobotomyCorpDefaultLabel === undefined) {
      label.dataset.lobotomyCorpDefaultLabel = label.textContent ?? "";
    }
    label.textContent = match
      ? lobotomyCorpAbnormalityName(match.abnormality)
      : label.dataset.lobotomyCorpDefaultLabel;
  }
  const riskFile = match && lobotomyCorpRiskSpriteByLevel[
    match.abnormality.riskLevel
  ];
  avatarWrappers.forEach((avatarWrapper) => {
    avatarWrapper.querySelector?.(".lobotomy-corp-risk-badge")?.remove?.();
    if (!riskFile || !document?.createElement) return;
    const riskBadge = document.createElement("img");
    riskBadge.alt = "";
    riskBadge.className = "lobotomy-corp-risk-badge";
    riskBadge.setAttribute("aria-hidden", "true");
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
      // 特殊事件观察失败不能阻断已确认的账户保存或通用出逃流程。
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
    globalThis.document?.querySelector?.("[data-polling-interval-value]")
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
  return (lobotomyCorpDangerByRiskLevel[abnormality.riskLevel] ?? 0) /
    departmentCount;
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
  const contribution = lobotomyCorpDangerContribution(
    match.abnormality,
    lobotomyCorpDepartmentCountForDay(),
  );
  if (contribution <= 0) {
    preparedMedia?.dispose?.();
    return Promise.resolve(true);
  }
  lobotomyCorpBreachedAbnormalitiesThisDay.add(match.canonicalId);
  const isWhiteNightSubmission = match.canonicalId === "T-03-46";
  const alertLifecycle = setLobotomyCorpDangerScore(
    Math.min(100, lobotomyCorpDangerScore + contribution),
    preparedMedia,
    {
      positiveContribution: true,
      // 让 Trumpet 从第一次正式播放起就以 0 音量后台运行，避免白夜钟声前爆音。
      suppressMusic: isWhiteNightSubmission,
    },
  );
  if (isWhiteNightSubmission) {
    lobotomyCorpWhiteNightEvent?.start({
      preparedMedia,
      source: "direct-submission",
    });
  }
  return alertLifecycle;
}

/**
 * 在账户保存成功后提交异想体或维持旧手动 Trumpet 行为。
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
    rect.rotation === undefined ? "" : `rotate(${rect.rotation}deg)`,
    rect.scaleY === undefined ? "" : `scaleY(${rect.scaleY})`,
  ].filter(Boolean).join(" ");
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
  return typeof globalThis.Image === "function" ||
    typeof globalThis.document?.fonts?.load === "function";
}

/**
 * 预加载一张浏览器图片，加载失败时仍保持 HUD 可用。
 *
 * @param {string} source 图片地址。
 * @return {Promise<HTMLImageElement|undefined>} 已加载图片；环境不支持或加载失败时返回 undefined。
 */
function loadLobotomyCorpImage(source) {
  if (typeof globalThis.Image !== "function") {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => resolve(undefined), { once: true });
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
    await globalThis.document?.fonts?.load?.("28px LobotomyNorwester");
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
  if (pageLanguage === "ko-KR") {
    return "LobotomyRestartTitleKorean";
  }
  if (pageLanguage === "ru-RU") {
    return "LobotomyRestartTitleRussian";
  }
  return "LobotomyRestartTitle";
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
  const canvas = globalThis.document?.createElement?.("canvas");
  const width = image?.naturalWidth ?? image?.width ?? 0;
  const height = image?.naturalHeight ?? image?.height ?? 0;
  const context = canvas?.getContext?.("2d", { willReadFrequently: true });
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
  return canvas.toDataURL("image/png");
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
        lobotomyCorpCornerDefinitions.map(({ triangleFile }) => triangleFile),
      ),
    ];
    await Promise.all([
      loadLobotomyCorpFont(),
      loadLobotomyCorpTopPanelFont(),
      ...alerts.map(({ riskFile }) =>
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
      ...alerts.filter(({ riskTint }) => Boolean(riskTint)).map(
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
 * @param {{assetDirectory: string}} alert 当前警报配置。
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
 * @param {{assetDirectory: string, riskFile: string}} alert 当前警报配置。
 * @return {string} 用于 img 的图片地址。
 */
function lobotomyCorpRiskSource(alert) {
  return lobotomyCorpTintedRiskSources.get(alert.assetDirectory) ??
    `${lobotomyCorpSpriteRoot}/${alert.riskFile}`;
}

/**
 * 读取指定交互状态的已染色 End_1；预加载失败时回退到原始 Sprite。
 *
 * @param {"normal"|"pressed"} state RestartButton 交互状态。
 * @return {string} 用于按钮状态图片的地址。
 */
function lobotomyCorpRestartButtonSource(state) {
  return lobotomyCorpTintedRestartButtonSources.get(state) ??
    `${lobotomyCorpSpriteRoot}/End_1.png`;
}

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
function lobotomyCorpCanvasScaleForViewport(viewportWidth, viewportHeight) {
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
 * 读取当前实际可见 viewport 的宽高，并在不支持 VisualViewport 时回退。
 *
 * @return {{height: number, width: number}} 可用于 CanvasScaler 的 viewport 尺寸。
 */
function lobotomyCorpViewportSize() {
  const visualViewport = globalThis.visualViewport;
  const documentElement = globalThis.document?.documentElement;
  return {
    height: visualViewport?.height || globalThis.innerHeight ||
      documentElement?.clientHeight || lobotomyCorpReferenceCanvasHeight,
    width: visualViewport?.width || globalThis.innerWidth ||
      documentElement?.clientWidth || lobotomyCorpReferenceCanvasWidth,
  };
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
  const overlay = document.createElement("div");
  const topPanelController = createLobotomyCorpTopPanel();
  overlay.className = "lobotomy-corp-alert-overlay";
  topPanelController.endAlertButton.addEventListener("click", () => {
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
 * 选择本次 HUD 应采用的稳定 viewport。
 *
 * 仅浏览器 chrome 导致的高度变化会保留上次尺寸，防止警报随地址栏伸缩；宽度
 * 或横竖屏方向变化则立即采用新 viewport。
 *
 * @param {{height: number, width: number}|undefined} previousViewport 上次已应用的稳定 viewport。
 * @param {{height: number, width: number}} nextViewport 本次读到的可见 viewport。
 * @return {{height: number, width: number}} 应用于 CanvasScaler 的稳定 viewport。
 */
function lobotomyCorpCanvasViewportForUpdate(previousViewport, nextViewport) {
  if (!previousViewport) return nextViewport;
  const orientationChanged =
    (previousViewport.height > previousViewport.width) !==
      (nextViewport.height > nextViewport.width);
  return previousViewport.width !== nextViewport.width || orientationChanged
    ? nextViewport
    : previousViewport;
}

/**
 * 为 Unity 风格 HUD 与顶部面板写入 CanvasScaler 缩放比例。
 *
 * @param {{height: number, width: number}} viewport 用于本次缩放的稳定 viewport。
 * @param {...Element|undefined} unityRoots 需要同步缩放的 Unity 风格视觉根节点。
 */
function updateLobotomyCorpCanvasScale(viewport, ...unityRoots) {
  const { height, width } = viewport;
  const canvasScale = lobotomyCorpCanvasScaleForViewport(width, height);
  unityRoots.forEach((unityRoot) => {
    unityRoot?.style?.setProperty?.(
      "--lobotomy-corp-unity-canvas-scale",
      String(canvasScale),
    );
  });
}

/**
 * 创建一个复现 Unity Corner / Texture / Risk 或 TrumpetLevel 层级的角落节点。
 *
 * @param {{assetDirectory: string, emergencyColor: string, riskFile: string, riskRect?: object, trumpetLevel: string}} alert 当前警报配置。
 * @param {{alertTextRect?: object, position: string, triangleFile: string}} definition Corner 配置。
 * @return {HTMLElement} 完整 Corner 节点。
 */
function createLobotomyCorpEmergencyCorner(alert, definition) {
  const corner = document.createElement("section");
  const texture = document.createElement("div");
  const triangle = document.createElement("img");
  corner.className = `lobotomy-corp-alert-corner ${definition.position}`;
  texture.className = "lobotomy-corp-alert-texture";
  triangle.alt = "";
  triangle.className = "lobotomy-corp-alert-triangle";
  triangle.src = lobotomyCorpTriangleSource(alert, definition.triangleFile);
  triangle.setAttribute("aria-hidden", "true");
  texture.append(triangle);

  if (definition.position === "right-up") {
    const trumpetLevel = document.createElement("p");
    const trumpetLevelContent = document.createElement("span");
    trumpetLevel.className = "lobotomy-corp-alert-trumpet-level";
    trumpetLevelContent.className = "lobotomy-corp-alert-trumpet-level-content";
    trumpetLevelContent.textContent = alert.trumpetLevel;
    setLobotomyCorpElementStyles(trumpetLevel, { color: alert.emergencyColor });
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
    const factorial = document.createElement("div");
    const risk = document.createElement("img");
    factorial.className = "lobotomy-corp-alert-factorial";
    risk.alt = "";
    risk.className = "lobotomy-corp-alert-risk";
    risk.src = lobotomyCorpRiskSource(alert);
    risk.setAttribute("aria-hidden", "true");
    applyLobotomyCorpRectTransform(factorial, {
      ...lobotomyCorpOriginalRiskRect,
      ...alert.riskRect,
    });
    factorial.append(risk);
    texture.append(factorial);
  }

  corner.append(texture);
  if (definition.alertTextRect) {
    const alertText = document.createElement("p");
    alertText.className = "lobotomy-corp-alert-text";
    alertText.textContent = lobotomyCorpAlertText;
    alertText.setAttribute("aria-hidden", "true");
    setLobotomyCorpElementStyles(alertText, { color: alert.emergencyColor });
    applyLobotomyCorpRectTransform(alertText, definition.alertTextRect);
    corner.append(alertText);
  }
  return corner;
}

/**
 * 创建复现原版“重新开始这一天”布局的顶部结束面板。
 *
 * @return {{activeController: HTMLElement, element: HTMLElement, endAlertButton: HTMLButtonElement}} 顶部面板、动画节点及其可交互结束按钮。
 */
function createLobotomyCorpTopPanel() {
  const topPanel = document.createElement("section");
  const activeController = document.createElement("div");
  const leftValve = document.createElement("img");
  const frameOutter = document.createElement("div");
  const frameInner = document.createElement("img");
  const endAlertButton = document.createElement("button");
  const normalButtonSprite = document.createElement("img");
  const pressedButtonSprite = document.createElement("img");
  const endAlertButtonText = document.createElement("span");
  const rightValve = document.createElement("img");
  const restartDayText = lobotomyCorpTopPanelActionText();

  topPanel.className = "lobotomy-corp-top-panel";
  activeController.className = "lobotomy-corp-top-panel-active-controller";

  leftValve.alt = "";
  leftValve.className = "lobotomy-corp-top-panel-valve left";
  leftValve.src = `${lobotomyCorpSpriteRoot}/Valve.png`;
  leftValve.setAttribute("aria-hidden", "true");

  frameOutter.className = "lobotomy-corp-top-panel-frame-outter";
  frameInner.alt = "";
  frameInner.className = "lobotomy-corp-top-panel-frame-inner";
  frameInner.src = `${lobotomyCorpSpriteRoot}/Risk_Frame_Inner.png`;
  frameInner.setAttribute("aria-hidden", "true");

  endAlertButton.type = "button";
  endAlertButton.className = "lobotomy-corp-top-panel-action-button";
  endAlertButton.setAttribute("aria-label", restartDayText);
  normalButtonSprite.alt = "";
  normalButtonSprite.className =
    "lobotomy-corp-top-panel-action-button-sprite normal";
  normalButtonSprite.src = lobotomyCorpRestartButtonSource("normal");
  normalButtonSprite.setAttribute("aria-hidden", "true");
  pressedButtonSprite.alt = "";
  pressedButtonSprite.className =
    "lobotomy-corp-top-panel-action-button-sprite pressed";
  pressedButtonSprite.src = lobotomyCorpRestartButtonSource("pressed");
  pressedButtonSprite.setAttribute("aria-hidden", "true");
  endAlertButtonText.className = "lobotomy-corp-top-panel-action-button-text";
  endAlertButtonText.textContent = restartDayText;
  endAlertButton.append(
    normalButtonSprite,
    pressedButtonSprite,
    endAlertButtonText,
  );

  rightValve.alt = "";
  rightValve.className = "lobotomy-corp-top-panel-valve right";
  rightValve.src = `${lobotomyCorpSpriteRoot}/Valve.png`;
  rightValve.setAttribute("aria-hidden", "true");

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
 * @param {{level: number}|undefined} visualAlert 当前 HUD 警报。
 * @return {string} 本轮视觉状态对应的按钮文案。
 */
function lobotomyCorpTopPanelActionText(visualAlert) {
  const restartDayText = lobotomyCorpMessages?.restartDay ?? "";
  return visualAlert?.level === 4
    ? lobotomyCorpMessages?.firedManager ?? restartDayText
    : restartDayText;
}

/**
 * 创建或更新脑叶公司警报会话。视觉警报可以切换，音乐只按最高等级升级。
 *
 * @param {{assetDirectory: string, level: number, soundPath: string}} alert 警报配置。
 * @param {number} startedAt 警报最初开始的时间戳。
 * @param {number} resumeAt 恢复播放的音频进度（秒）。
 * @param {{assetDirectory: string, level: number, soundPath: string}} [restoredMusicAlert] 恢复时的逻辑音乐配置。
 * @param {object} [preparedMedia] 在用户手势中预先准备的媒体句柄。
 * @param {boolean} [initiallySuppressed] 是否从首次正式播放起以白夜后台音量运行。
 * @return {Promise<boolean>} 当前视觉 activation 被替换或整个会话结束时返回 true。
 */
function startLobotomyCorpAlert(
  alert,
  startedAt,
  resumeAt,
  restoredMusicAlert,
  preparedMedia,
  initiallySuppressed = false,
) {
  if (activeLobotomyCorpAlert) {
    // WhiteNight.start() 会在本次调用之后才接管 Alert；必须在替换音轨前先压低现有会话，
    // 才能让升级出的 Trumpet 从第一次 play 起就是静音后台媒体。
    if (initiallySuppressed) {
      activeLobotomyCorpAlert.holdMusicForSpecialEvent?.();
    }
    return activeLobotomyCorpAlert.replaceVisual(alert, preparedMedia);
  }
  activeLobotomyCorpRestartPanel?.finish();
  const musicAlert = restoredMusicAlert ?? alert;
  let fallbackPosition = Math.max(0, resumeAt);
  let pendingResumePosition = fallbackPosition > 0
    ? fallbackPosition
    : undefined;
  let audio = preparedMedia?.consume?.(musicAlert.soundPath);
  if (!audio) preparedMedia?.dispose?.();
  let emergencyController;
  let endAlertButton;
  let endAlertButtonText;
  let naturalEndTimer;
  let overlay;
  let panelDisappearTimer;
  let topPanel;
  let topPanelActiveController;
  let stableCanvasViewport;
  let specialEventFadeTimer;
  let specialEventMusicSuppressed = initiallySuppressed;
  let specialEventMusicUnlocked = false;
  const visualViewport = globalThis.visualViewport;
  let closing = false;
  let finished = false;
  let currentActivation;
  const alertContext = {
    audio: undefined,
    finish: () => {},
    musicAlert,
    promise: undefined,
    replaceVisual: () => Promise.resolve(true),
    startedAt,
    visualAlert: alert,
  };

  /**
   * 创建一次视觉 activation 的完成 Promise。
   *
   * @param {object|undefined} visualAlert 本轮要显示的 HUD 警报。
   * @return {{alert: object|undefined, promise: Promise<boolean>, resolve: (value: boolean) => void}} activation 状态。
   */
  function createVisualActivation(visualAlert) {
    let resolveCompletion;
    return {
      alert: visualAlert,
      promise: new Promise((resolve) => {
        resolveCompletion = resolve;
      }),
      resolve: resolveCompletion,
    };
  }

  currentActivation = createVisualActivation(alert);
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
      "animationend",
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
    topPanelActiveController.style.animation = "none";
    // 提交 animation:none，确保浏览器不会沿用已经结束的 Appear 播放时间。
    void topPanelActiveController.offsetWidth;
    topPanel.dataset.lobotomyCorpTopPanelState = "disappearing";
    topPanelActiveController.style.animation = "";
  }

  /**
   * 立即停止整场警报业务活动。
   *
   * @param {{animateExit?: boolean}} options 结束方式配置。
   */
  function finishAlert({
    animateExit = true,
    force = false,
  } = {}) {
    if (closing || finished) {
      return;
    }
    if (!force && lobotomyCorpWhiteNightEvent?.isActive()) {
      // 白夜覆盖期间，曲目结束不能带走 Alert；保持同一实例后台循环。
      keepAlertMusicSuppressed();
      return;
    }
    closing = true;
    detachAudio(true);
    endAlertButton?.removeEventListener("click", finishAlertFromButton);
    if (endAlertButton) {
      endAlertButton.disabled = true;
    }
    globalThis.removeEventListener?.("pagehide", persistPlaybackPosition);
    globalThis.removeEventListener?.(
      "resize",
      updateCanvasScaleFromViewport,
    );
    visualViewport?.removeEventListener?.(
      "resize",
      updateCanvasScaleFromViewport,
    );
    clearPersistedLobotomyCorpAlert();
    clearLobotomyCorpDay();
    if (activeLobotomyCorpAlert === alertContext) {
      activeLobotomyCorpAlert = undefined;
    }
    globalThis.easterEggCoordinator?.finish(
      lobotomyCorpEasterEggGameId,
      coordinatorStop,
    );

    if (animateExit && topPanel && topPanelActiveController) {
      topPanelActiveController.addEventListener(
        "animationend",
        finishAfterPanelAnimation,
        { once: true },
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
   */
  function finishAlertFromAudioEnd() {
    finishAlert();
  }

  /**
   * 响应警报音频加载或播放错误。
   */
  function finishAlertFromAudioError() {
    finishAlert();
  }

  /**
   * 响应自然结束计时器到期。
   */
  function finishAlertFromNaturalEnd() {
    finishAlert();
  }

  /**
   * 响应跨游戏协调器的停止请求，并保持回调引用稳定。
   */
  function finishAlertFromCoordinator() {
    finishAlert({ force: true });
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
   * @param {{level: number}|undefined} visualAlert 当前 HUD 警报。
   */
  function syncTopPanelActionText(visualAlert) {
    const text = lobotomyCorpTopPanelActionText(visualAlert);
    if (endAlertButtonText) {
      endAlertButtonText.textContent = text;
    }
    endAlertButton?.setAttribute("aria-label", text);
  }

  /**
   * 从当前音乐会话的原始开始时间恢复音频进度；非白夜后台会话在曲目结束时清理警报。
   */
  function playAlertAudio() {
    const pendingPosition = normalizedPendingResumePosition();
    if (pendingPosition !== undefined && Number.isFinite(audio.duration)) {
      if (
        pendingResumePosition >= audio.duration &&
        !specialEventMusicSuppressed
      ) {
        finishAlertFromNaturalEnd();
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
    if (specialEventMusicSuppressed) {
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
      audio.addEventListener("playing", confirmPendingResumePosition, {
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
   * 根据曲目的完整时长安排自然结束，兼容页面恢复后的自动播放限制。
   */
  function scheduleNaturalAlertEnd() {
    if (specialEventMusicSuppressed) {
      return;
    }
    if (!Number.isFinite(audio.duration)) {
      return;
    }
    const remainingMilliseconds = Math.max(
      0,
      (audio.duration - currentAudioPosition()) * 1000,
    );
    naturalEndTimer = setTimeout(
      finishAlertFromNaturalEnd,
      remainingMilliseconds,
    );
  }

  /**
   * 记录真实的音频播放进度，供完整页面切换后的警报续播使用。
   */
  function persistPlaybackPosition() {
    persistLobotomyCorpAlert(
      alertContext.visualAlert,
      alertContext.musicAlert,
      alertContext.startedAt,
      currentAudioPosition(),
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
    audio?.removeEventListener("ended", finishAlertFromAudioEnd);
    audio?.removeEventListener("error", finishAlertFromAudioError);
    audio?.removeEventListener("timeupdate", persistPlaybackPosition);
    audio?.removeEventListener("loadedmetadata", playAlertAudio);
    audio?.removeEventListener("loadedmetadata", scheduleNaturalAlertEnd);
    if (naturalEndTimer !== undefined) {
      clearTimeout(naturalEndTimer);
      naturalEndTimer = undefined;
    }
    if (specialEventFadeTimer !== undefined) {
      clearTimeout(specialEventFadeTimer);
      specialEventFadeTimer = undefined;
    }
  }

  /**
   * 令当前 Trumpet 实例继续播放但不可听，并阻止其自然结束 Alert。
   */
  function keepAlertMusicSuppressed() {
    specialEventMusicSuppressed = true;
    if (naturalEndTimer !== undefined) {
      clearTimeout(naturalEndTimer);
      naturalEndTimer = undefined;
    }
    if (!audio) return;
    if (specialEventFadeTimer !== undefined) {
      clearTimeout(specialEventFadeTimer);
      specialEventFadeTimer = undefined;
    }
    audio.loop = true;
    audio.muted = !specialEventMusicUnlocked;
    audio.volume = 0;
    playConfiguredAlertAudio();
  }

  /**
   * 在用户手势中确保静音 Trumpet 已获准播放，为稍后的镇压淡入做准备。
   */
  function prepareAlertMusicForSpecialEventResume() {
    if (closing || finished || !audio) return;
    specialEventMusicUnlocked = true;
    keepAlertMusicSuppressed();
  }

  /**
   * 复用正在后台播放的 Trumpet，在约一秒内恢复正常音量。
   */
  function resumeAlertMusicAfterSpecialEvent() {
    if (closing || finished || !audio || !alertContext.visualAlert) return;
    specialEventMusicSuppressed = false;
    specialEventMusicUnlocked = true;
    audio.loop = false;
    audio.muted = false;
    audio.volume = 0;
    void audio.play?.().catch(() => {
      // 若赎罪手势未能预解锁，仍保留静音会话，避免重建或归零。
    });
    scheduleNaturalAlertEnd();
    const fadeStartedAt = Date.now();
    /** 平滑推进当前 Trumpet 的恢复音量。 */
    const fadeStep = () => {
      if (closing || finished || specialEventMusicSuppressed || !audio) return;
      const progress = Math.min(
        1,
        (Date.now() - fadeStartedAt) / lobotomyCorpSpecialEventMusicFadeInMs,
      );
      audio.volume = progress;
      if (progress < 1) specialEventFadeTimer = setTimeout(fadeStep, 16);
      else specialEventFadeTimer = undefined;
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
    audio.loop = specialEventMusicSuppressed;
    audio.muted = specialEventMusicSuppressed && !specialEventMusicUnlocked;
    audio.volume = specialEventMusicSuppressed ? 0 : 1;
    audio.preload = "auto";
    audio.setAttribute("aria-hidden", "true");
    audio.addEventListener("ended", finishAlertFromAudioEnd);
    audio.addEventListener("error", finishAlertFromAudioError);
    audio.addEventListener("timeupdate", persistPlaybackPosition);
    const metadataReady = audio.readyState >= 1 ||
      Number.isFinite(audio.duration);
    if (metadataReady) {
      scheduleNaturalAlertEnd();
      playAlertAudio();
    } else {
      audio.addEventListener("loadedmetadata", scheduleNaturalAlertEnd, {
        once: true,
      });
      if (pendingResumePosition !== undefined) {
        audio.addEventListener("loadedmetadata", playAlertAudio, {
          once: true,
        });
      } else {
        playAlertAudio();
      }
    }
  }

  /**
   * 在字体和 Sprite 准备完成后挂载指定视觉等级的 Unity 风格层级。
   *
   * @return {Promise<void>} HUD 挂载或被提前关闭后完成。
   */
  async function mountLobotomyCorpAlert(visualAlert, activation) {
    try {
      if (shouldPrepareLobotomyCorpVisualAssets()) {
        await prepareLobotomyCorpVisualAssets();
      }
      if (
        closing || finished || activeLobotomyCorpAlert !== alertContext ||
        currentActivation !== activation
      ) {
        return;
      }
      if (!globalThis.document?.createElement || !globalThis.document.body) {
        activation.resolve(true);
        return;
      }

      overlay = document.createElement("div");
      overlay.className = "lobotomy-corp-alert-overlay";
      overlay.setAttribute("aria-live", "assertive");
      overlay.setAttribute("aria-label", "Lobotomy Corporation alert");
      overlay.dataset.lobotomyCorpAlertStartedAt = String(
        alertContext.startedAt,
      );
      overlay.dataset.lobotomyCorpAlertResumeAt = String(
        currentAudioPosition(),
      );
      if (visualAlert) {
        emergencyController = document.createElement("div");
        const activeControl = document.createElement("div");
        emergencyController.className = "lobotomy-corp-emergency-controller";
        activeControl.className = "lobotomy-corp-alert-active-control";
        lobotomyCorpCornerDefinitions.forEach((definition) => {
          activeControl.append(
            createLobotomyCorpEmergencyCorner(visualAlert, definition),
          );
        });
        emergencyController.append(activeControl);
        overlay.append(emergencyController);
      } else {
        emergencyController = undefined;
      }
      if (!topPanel) {
        const topPanelController = createLobotomyCorpTopPanel();
        topPanel = topPanelController.element;
        topPanelActiveController = topPanelController.activeController;
        endAlertButton = topPanelController.endAlertButton;
        endAlertButtonText = topPanelController.endAlertButtonText;
        endAlertButton.addEventListener("click", finishAlertFromButton);
      } else {
        topPanel.dataset.lobotomyCorpTopPanelReused = "true";
      }
      syncTopPanelActionText(visualAlert);
      overlay.append(topPanel);
      if (!audio) {
        createAlertAudio();
      } else if (audio && !alertContext.audio) {
        configureAlertAudio();
      }
      // 白夜期间仍保留普通 Trumpet 实例，只将其音量压至零。
      if (audio) overlay.append(audio);
      updateCanvasScale(true);
      globalThis.addEventListener?.(
        "resize",
        updateCanvasScaleFromViewport,
      );
      visualViewport?.addEventListener?.(
        "resize",
        updateCanvasScaleFromViewport,
      );
      const previousOverlay = overlay;
      document.body.append(previousOverlay);
      globalThis.addEventListener?.("pagehide", persistPlaybackPosition, {
        once: true,
      });
      persistPlaybackPosition();
    } catch {
      // 视觉资源加载或 DOM 初始化失败时，沿用既有生命周期清理警报状态。
      finishAlert({ animateExit: false });
    }
  }

  /**
   * 更新 HUD，并仅在新的视觉等级突破音乐高水位时升级音乐。
   *
   * @param {object|undefined} nextAlert 新 HUD 配置；undefined 表示隐藏 HUD。
   * @return {Promise<boolean>} 新视觉 activation 的完成 Promise。
   */
  function replaceVisual(nextAlert, nextPreparedMedia) {
    if (
      nextAlert?.assetDirectory === alertContext.visualAlert?.assetDirectory
    ) {
      nextPreparedMedia?.dispose?.();
      return currentActivation.promise;
    }
    currentActivation.resolve(true);
    const previousOverlay = overlay;
    const activation = createVisualActivation(nextAlert);
    currentActivation = activation;
    alertContext.promise = activation.promise;
    alertContext.visualAlert = nextAlert;
    if (nextAlert && nextAlert.level > alertContext.musicAlert.level) {
      alertContext.musicAlert = nextAlert;
      // 等级升级始终替换真实音轨；白夜仅改变新实例的听觉输出，不保留旧等级。
      detachAudio(true);
      audio = nextPreparedMedia?.consume?.(nextAlert.soundPath);
      if (!audio) nextPreparedMedia?.dispose?.();
      alertContext.audio = undefined;
      alertContext.startedAt = Date.now();
      fallbackPosition = 0;
      pendingResumePosition = undefined;
    } else {
      nextPreparedMedia?.dispose?.();
    }
    previousOverlay?.remove();
    persistPlaybackPosition();
    void mountLobotomyCorpAlert(nextAlert, activation);
    return activation.promise;
  }

  const coordinatorStop = lobotomyCorpDangerScore > 0
    ? finishLobotomyCorpDayFromCoordinator
    : finishAlertFromCoordinator;
  alertContext.finish = finishAlertFromCoordinator;
  alertContext.holdMusicForSpecialEvent = () => {
    keepAlertMusicSuppressed();
  };
  alertContext.prepareMusicForSpecialEventResume =
    prepareAlertMusicForSpecialEventResume;
  alertContext.resumeMusicAfterSpecialEvent = resumeAlertMusicAfterSpecialEvent;
  alertContext.replaceVisual = replaceVisual;
  activeLobotomyCorpAlert = alertContext;
  globalThis.easterEggCoordinator?.start(
    lobotomyCorpEasterEggGameId,
    coordinatorStop,
  );
  persistPlaybackPosition();
  void mountLobotomyCorpAlert(alert, currentActivation);
  return currentActivation.promise;
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
  storageKey: lobotomyCorpSpecialEventSessionKey,
  storages: lobotomyCorpAlertStorages,
});

globalThis.lobotomyCorpEasterEgg = Object.freeze({
  activate: activateLobotomyCorpAlert,
  canvasScaleForViewport: lobotomyCorpCanvasScaleForViewport,
  canvasViewportForUpdate: lobotomyCorpCanvasViewportForUpdate,
  commitDisplayName: commitLobotomyCorpDisplayName,
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
  if (restoredLobotomyCorpAlert) {
    void startLobotomyCorpAlert(
      restoredLobotomyCorpAlert.visualAlert ??
        restoredLobotomyCorpAlert.musicAlert,
      restoredLobotomyCorpAlert.startedAt,
      restoredLobotomyCorpAlert.position,
      restoredLobotomyCorpAlert.musicAlert,
      undefined,
      restoredLobotomyCorpSpecialEvent?.id === lobotomyCorpWhiteNightEventId,
    );
    if (!restoredLobotomyCorpAlert.visualAlert) {
      void activeLobotomyCorpAlert?.replaceVisual(undefined);
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
  const serialized = globalThis.document?.getElementById?.(
    "lobotomy-corp-account-identity-data",
  )?.textContent;
  if (serialized) {
    try {
      const displayName = JSON.parse(serialized)?.displayName;
      return typeof displayName === "string" ? displayName : undefined;
    } catch {
      return undefined;
    }
  }
  return globalThis.document?.querySelector?.(
    "[data-account-display-name-input]",
  )?.dataset?.accountDisplayNameOriginal;
}

const persistedDisplayName = persistedLobotomyCorpDisplayName();
if (persistedDisplayName !== undefined) {
  syncLobotomyCorpAbnormalityIdentity(persistedDisplayName);
}
