/**
 * @file 本文件提供修改显示名称时触发的《脑叶公司》Trumpet 警报彩蛋。
 */

/**
 * 《脑叶公司》解包资源的公共访问根路径。
 */
const lobotomyCorpAssetRoot = "/static/fun/lobotomy-corp/Assets";

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
 * 警报口令、等级视觉参数与音频文件的对应关系。
 */
const lobotomyCorpAlerts = Object.freeze({
  firsttrumpet: {
    assetDirectory: "first-trumpet",
    emergencyColor: "#fcc93a",
    emergencyTint: [252, 201, 58],
    level: 1,
    riskFile: "Risk_1.png",
    soundFile: "first-trumpet.wav",
    trumpetLevel: "First\nTrumpet",
  },
  secondtrumpet: {
    assetDirectory: "second-trumpet",
    emergencyColor: "#fc773a",
    emergencyTint: [252, 119, 58],
    level: 2,
    riskFile: "Risk_2.png",
    soundFile: "second-trumpet.wav",
    trumpetLevel: "Second\nTrumpet",
  },
  thirdtrumpet: {
    assetDirectory: "third-trumpet",
    emergencyColor: "#fc3a3a",
    emergencyTint: [252, 58, 58],
    level: 3,
    riskFile: "Risk_3.png",
    soundFile: "third-trumpet.wav",
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
    soundFile: "fourth-trumpet.wav",
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

/**
 * 当前正在播放的脑叶公司警报及其结束操作。
 */
let activeLobotomyCorpAlert;

/**
 * 当前脑叶公司彩蛋的危急值，始终为 0 到 100 的整数。
 */
let lobotomyCorpDangerScore = 0;

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
 * @return {{assetDirectory: string, soundFile: string}|undefined} 匹配的警报配置。
 */
function matchingLobotomyCorpAlert(value) {
  return lobotomyCorpAlerts[normalizeLobotomyCorpAlertName(value)];
}

/**
 * 查找已持久化配置对应的脑叶公司警报。
 *
 * @param {string} assetDirectory 警报资源目录。
 * @return {{assetDirectory: string, soundFile: string}|undefined} 匹配的警报配置。
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
 * @return {Promise<boolean>} 警报结束时返回 true；未匹配警报时立即返回 true。
 */
function activateLobotomyCorpAlert(value) {
  const alert = matchingLobotomyCorpAlert(value);
  if (!alert) {
    return Promise.resolve(true);
  }
  return startLobotomyCorpAlert(alert, Date.now(), 0);
}

/**
 * 根据危急值查找应播放的脑叶公司警报。
 *
 * @param {number} dangerScore 当前危急值。
 * @return {{assetDirectory: string, soundFile: string}|undefined} 对应的警报配置；无警报区间时返回 undefined。
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
 * @return {number} 当前 0 到 100 的整数危急值。
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
  if (!activeLobotomyCorpAlert) {
    return Promise.resolve(true);
  }
  const completion = activeLobotomyCorpAlert.promise;
  activeLobotomyCorpAlert.finish();
  return completion;
}

/**
 * 设置脑叶公司彩蛋危急值，并激活其所在区间对应的警报。
 *
 * @param {number} dangerScore 新的 0 到 100 整数危急值。
 * @return {Promise<boolean>} 对应警报结束或无警报状态生效后返回 true。
 */
function setLobotomyCorpDangerScore(dangerScore) {
  if (!Number.isInteger(dangerScore) || dangerScore < 0 || dangerScore > 100) {
    return Promise.reject(
      new RangeError("Danger Score 必须是 0 到 100 的整数。"),
    );
  }

  lobotomyCorpDangerScore = dangerScore;
  const alert = lobotomyCorpAlertForDangerScore(dangerScore);
  if (alert) {
    return startLobotomyCorpAlert(alert, Date.now(), 0);
  }
  if (dangerScore === 0) {
    return stopLobotomyCorpAlert();
  }
  return activeLobotomyCorpAlert
    ? activeLobotomyCorpAlert.replaceVisual(undefined)
    : Promise.resolve(true);
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
 * 为 Unity 风格 HUD 与顶部面板写入 CanvasScaler 的 Match Width 缩放比例。
 *
 * @param {...Element|undefined} unityRoots 需要同步缩放的 Unity 风格视觉根节点。
 */
function updateLobotomyCorpCanvasScale(...unityRoots) {
  const viewportWidth = globalThis.innerWidth ||
    globalThis.document?.documentElement?.clientWidth ||
    lobotomyCorpReferenceCanvasWidth;
  unityRoots.forEach((unityRoot) => {
    unityRoot?.style?.setProperty?.(
      "--lobotomy-corp-unity-canvas-scale",
      String(viewportWidth / lobotomyCorpReferenceCanvasWidth),
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
  const dataset = globalThis.document?.documentElement?.dataset;
  const restartDayText = dataset?.lobotomyCorpRestartDay ?? "";
  return visualAlert?.level === 4
    ? dataset?.lobotomyCorpFiredManager ?? restartDayText
    : restartDayText;
}

/**
 * 创建或更新脑叶公司警报会话。视觉警报可以切换，音乐只按最高等级升级。
 *
 * @param {{assetDirectory: string, level: number, soundFile: string}} alert 警报配置。
 * @param {number} startedAt 警报最初开始的时间戳。
 * @param {number} resumeAt 恢复播放的音频进度（秒）。
 * @param {{assetDirectory: string, level: number, soundFile: string}} [restoredMusicAlert] 恢复时的逻辑音乐配置。
 * @return {Promise<boolean>} 当前视觉 activation 被替换或整个会话结束时返回 true。
 */
function startLobotomyCorpAlert(
  alert,
  startedAt,
  resumeAt,
  restoredMusicAlert,
) {
  if (activeLobotomyCorpAlert) {
    return activeLobotomyCorpAlert.replaceVisual(alert);
  }
  const musicAlert = restoredMusicAlert ?? alert;
  let fallbackPosition = Math.max(0, resumeAt);
  let audio;
  let emergencyController;
  let endAlertButton;
  let endAlertButtonText;
  let naturalEndTimer;
  let overlay;
  let panelDisappearTimer;
  let topPanel;
  let topPanelActiveController;
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
  } = {}) {
    if (closing || finished) {
      return;
    }
    closing = true;
    detachAudio(true);
    endAlertButton?.removeEventListener("click", finishAlertFromButton);
    if (endAlertButton) {
      endAlertButton.disabled = true;
    }
    globalThis.removeEventListener?.("pagehide", persistPlaybackPosition);
    globalThis.removeEventListener?.("resize", updateCanvasScale);
    clearPersistedLobotomyCorpAlert();
    if (activeLobotomyCorpAlert === alertContext) {
      activeLobotomyCorpAlert = undefined;
    }
    globalThis.easterEggCoordinator?.finish(
      lobotomyCorpEasterEggGameId,
      finishAlertFromCoordinator,
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
    finishAlert();
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
    finishAlert();
  }

  /**
   * 根据窗口宽度重算 Unity CanvasScaler 的 Match Width 比例。
   */
  function updateCanvasScale() {
    if (overlay) {
      updateLobotomyCorpCanvasScale(
        emergencyController,
        topPanel,
      );
    }
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
   * 从当前音乐会话的原始开始时间恢复音频进度，并在曲目已结束时清理警报。
   */
  function playAlertAudio() {
    const resumePosition = currentAudioPosition();
    let clampedPosition;
    if (resumePosition > 0 && Number.isFinite(audio.duration)) {
      if (resumePosition >= audio.duration) {
        finishAlertFromNaturalEnd();
        return;
      }
      clampedPosition = Math.min(
        resumePosition,
        Math.max(0, audio.duration - 0.001),
      );
      applyResumePosition(clampedPosition);
    }

    /**
     * 将媒体定位到已保存进度。部分 Chromium 页面切换场景会在首次播放时重置预设进度，因此播放后需再次定位。
     */
    function applyResumePosition(position) {
      if (position === undefined) {
        return;
      }
      audio.currentTime = position;
      overlay.dataset.lobotomyCorpAlertSeekedTo = String(audio.currentTime);
    }

    audio.addEventListener(
      "playing",
      () => applyResumePosition(clampedPosition),
      { once: true },
    );
    void audio.play().then(() => applyResumePosition(clampedPosition)).catch(
      () => {
        // 页面切换后的自动播放可能被浏览器限制；自然结束计时仍会按曲目时长关闭警报。
      },
    );
  }

  /**
   * 根据曲目的完整时长安排自然结束，兼容页面恢复后的自动播放限制。
   */
  function scheduleNaturalAlertEnd() {
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
  }

  /**
   * 创建并开始当前逻辑音乐对应的实际 Audio。
   */
  function createAlertAudio() {
    audio = new Audio(
      `${lobotomyCorpAssetRoot}/AudioClip/${alertContext.musicAlert.soundFile}`,
    );
    alertContext.audio = audio;
    audio.hidden = true;
    audio.preload = "auto";
    audio.setAttribute("aria-hidden", "true");
    audio.addEventListener("ended", finishAlertFromAudioEnd);
    audio.addEventListener("error", finishAlertFromAudioError);
    audio.addEventListener("timeupdate", persistPlaybackPosition);
    audio.addEventListener("loadedmetadata", scheduleNaturalAlertEnd, {
      once: true,
    });
    if (fallbackPosition > 0) {
      audio.addEventListener("loadedmetadata", playAlertAudio, { once: true });
    } else {
      playAlertAudio();
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
      }
      overlay.append(audio);
      updateLobotomyCorpCanvasScale(emergencyController, topPanel);
      globalThis.addEventListener?.("resize", updateCanvasScale);
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
  function replaceVisual(nextAlert) {
    if (
      nextAlert?.assetDirectory === alertContext.visualAlert?.assetDirectory
    ) {
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
      detachAudio(true);
      audio = undefined;
      alertContext.audio = undefined;
      alertContext.startedAt = Date.now();
      fallbackPosition = 0;
    }
    previousOverlay?.remove();
    persistPlaybackPosition();
    void mountLobotomyCorpAlert(nextAlert, activation);
    return activation.promise;
  }

  alertContext.finish = finishAlertFromCoordinator;
  alertContext.replaceVisual = replaceVisual;
  activeLobotomyCorpAlert = alertContext;
  globalThis.easterEggCoordinator?.start(
    lobotomyCorpEasterEggGameId,
    finishAlertFromCoordinator,
  );
  persistPlaybackPosition();
  void mountLobotomyCorpAlert(alert, currentActivation);
  return currentActivation.promise;
}

globalThis.lobotomyCorpEasterEgg = Object.freeze({
  activate: activateLobotomyCorpAlert,
  getDangerScore: getLobotomyCorpDangerScore,
  matches: matchesLobotomyCorpAlert,
  setDangerScore: setLobotomyCorpDangerScore,
  submitsWhileActive: true,
});

if (isLobotomyCorpAlertPageReload()) {
  clearPersistedLobotomyCorpAlert();
} else {
  const restoredLobotomyCorpAlert = persistedLobotomyCorpAlert();
  if (restoredLobotomyCorpAlert) {
    void startLobotomyCorpAlert(
      restoredLobotomyCorpAlert.visualAlert ??
        restoredLobotomyCorpAlert.musicAlert,
      restoredLobotomyCorpAlert.startedAt,
      restoredLobotomyCorpAlert.position,
      restoredLobotomyCorpAlert.musicAlert,
    );
    if (!restoredLobotomyCorpAlert.visualAlert) {
      void activeLobotomyCorpAlert?.replaceVisual(undefined);
    }
  }
}
