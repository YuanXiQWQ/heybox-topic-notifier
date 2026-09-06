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
 * 警报口令、等级视觉参数与音频文件的对应关系。
 */
const lobotomyCorpAlerts = Object.freeze({
  firsttrumpet: {
    assetDirectory: "first-trumpet",
    emergencyColor: "#fcc93a",
    emergencyTint: [252, 201, 58],
    riskFile: "Risk_1.png",
    soundFile: "first-trumpet.wav",
    trumpetLevel: "First\nTrumpet",
  },
  secondtrumpet: {
    assetDirectory: "second-trumpet",
    emergencyColor: "#fc773a",
    emergencyTint: [252, 119, 58],
    riskFile: "Risk_2.png",
    soundFile: "second-trumpet.wav",
    trumpetLevel: "Second\nTrumpet",
  },
  thirdtrumpet: {
    assetDirectory: "third-trumpet",
    emergencyColor: "#fc3a3a",
    emergencyTint: [252, 58, 58],
    riskFile: "Risk_3.png",
    soundFile: "third-trumpet.wav",
    trumpetLevel: "Third\nTrumpet",
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
 * 预加载字体、Risk 和 Triangle 染色缓存的共享任务。
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
 * @param {{assetDirectory: string}} alert 警报配置。
 * @param {number} startedAt 警报开始的时间戳。
 * @param {number} position 当前音频播放进度（秒）。
 */
function persistLobotomyCorpAlert(alert, startedAt, position) {
  const serialized = JSON.stringify({
    assetDirectory: alert.assetDirectory,
    position,
    startedAt,
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
 * @return {{alert: {assetDirectory: string, position: number, startedAt: number}|undefined} 待恢复状态。
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
    const alert = typeof saved?.assetDirectory === "string"
      ? lobotomyCorpAlertByAssetDirectory(saved.assetDirectory)
      : undefined;
    return alert && typeof saved.startedAt === "number" &&
        Number.isFinite(saved.startedAt) &&
        typeof saved.position === "number" &&
        Number.isFinite(saved.position)
      ? { alert, position: saved.position, startedAt: saved.startedAt }
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
  return alert
    ? startLobotomyCorpAlert(alert, Date.now(), 0)
    : stopLobotomyCorpAlert();
}

/**
 * 判断新警报是否应取代当前警报。
 *
 * @param {{assetDirectory: string}} nextAlert 请求播放的警报配置。
 * @return {boolean} 新警报与当前警报不同且应切换时返回 true。
 */
function shouldReplaceActiveLobotomyCorpAlert(nextAlert) {
  return Boolean(
    activeLobotomyCorpAlert &&
      nextAlert.assetDirectory !== activeLobotomyCorpAlert.alert.assetDirectory,
  );
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
 * 使用离屏 Canvas 模拟 Unity UI Image.color 的逐像素乘色。
 *
 * @param {string} source 未染色 Triangle Sprite 地址。
 * @param {[number, number, number]} tint EmergencyColor 的 RGB 值。
 * @return {Promise<string>} 已染色的数据 URL；无法处理时返回原始地址。
 */
async function tintLobotomyCorpTriangle(source, tint) {
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
 * 预加载 HUD 图片和字体，并一次性建立六张已染色 Triangle 的缓存。
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
      ...alerts.map(({ riskFile }) =>
        loadLobotomyCorpImage(`${lobotomyCorpSpriteRoot}/${riskFile}`)
      ),
    ]);
    await Promise.all(
      alerts.flatMap((alert) =>
        triangleFiles.map(async (triangleFile) => {
          const source = `${lobotomyCorpSpriteRoot}/${triangleFile}`;
          const tintedSource = await tintLobotomyCorpTriangle(
            source,
            alert.emergencyTint,
          );
          lobotomyCorpTintedTriangleSources.set(
            `${alert.assetDirectory}:${triangleFile}`,
            tintedSource,
          );
        })
      ),
    );
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
 * 为整个 Unity HUD 写入 CanvasScaler 的 Match Width 缩放比例。
 *
 * @param {Element} emergencyController 游戏 HUD 的视觉根节点。
 */
function updateLobotomyCorpCanvasScale(emergencyController) {
  const viewportWidth = globalThis.innerWidth ||
    globalThis.document?.documentElement?.clientWidth ||
    lobotomyCorpReferenceCanvasWidth;
  emergencyController.style?.setProperty?.(
    "--lobotomy-corp-unity-canvas-scale",
    String(viewportWidth / lobotomyCorpReferenceCanvasWidth),
  );
}

/**
 * 创建一个复现 Unity Corner / Texture / Risk 或 TrumpetLevel 层级的角落节点。
 *
 * @param {{assetDirectory: string, emergencyColor: string, riskFile: string, trumpetLevel: string}} alert 当前警报配置。
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
    trumpetLevel.className = "lobotomy-corp-alert-trumpet-level";
    trumpetLevel.textContent = alert.trumpetLevel;
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
    texture.append(trumpetLevel);
  } else {
    const factorial = document.createElement("div");
    const risk = document.createElement("img");
    factorial.className = "lobotomy-corp-alert-factorial";
    risk.alt = "";
    risk.className = "lobotomy-corp-alert-risk";
    risk.src = `${lobotomyCorpSpriteRoot}/${alert.riskFile}`;
    risk.setAttribute("aria-hidden", "true");
    applyLobotomyCorpRectTransform(factorial, {
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
 * 创建或恢复脑叶公司警报，并使音频从对应的播放进度继续。
 *
 * @param {{assetDirectory: string, soundFile: string}} alert 警报配置。
 * @param {number} startedAt 警报最初开始的时间戳。
 * @param {number} resumeAt 恢复播放的音频进度（秒）。
 * @return {Promise<boolean>} 警报结束时返回 true。
 */
function startLobotomyCorpAlert(alert, startedAt, resumeAt) {
  if (activeLobotomyCorpAlert) {
    if (!shouldReplaceActiveLobotomyCorpAlert(alert)) {
      return activeLobotomyCorpAlert.promise;
    }
    activeLobotomyCorpAlert.finish();
  }

  persistLobotomyCorpAlert(alert, startedAt, resumeAt);

  const elapsedSeconds = Math.max(0, resumeAt);
  let audio;
  let closeButton;
  let naturalEndTimer;
  let overlay;
  let finished = false;
  let resolveCompletion;
  const alertContext = {
    alert,
    finish: () => {},
    promise: new Promise((resolve) => {
      resolveCompletion = resolve;
    }),
  };

  /**
   * 清理警报界面、音频和跨页面恢复状态。
   */
  function finishAlert() {
    if (finished) {
      return;
    }
    finished = true;
    audio?.pause();
    audio?.removeEventListener("ended", finishAlert);
    audio?.removeEventListener("error", finishAlert);
    audio?.removeEventListener("timeupdate", persistPlaybackPosition);
    closeButton?.removeEventListener("click", finishAlert);
    globalThis.removeEventListener?.("pagehide", persistPlaybackPosition);
    globalThis.removeEventListener?.("resize", updateCanvasScale);
    if (naturalEndTimer !== undefined) {
      clearTimeout(naturalEndTimer);
    }
    overlay?.remove();
    clearPersistedLobotomyCorpAlert();
    if (activeLobotomyCorpAlert === alertContext) {
      activeLobotomyCorpAlert = undefined;
    }
    globalThis.easterEggCoordinator?.finish(
      lobotomyCorpEasterEggGameId,
      finishAlert,
    );
    resolveCompletion(true);
  }

  /**
   * 根据窗口宽度重算 Unity CanvasScaler 的 Match Width 比例。
   */
  function updateCanvasScale() {
    if (overlay) {
      updateLobotomyCorpCanvasScale(
        overlay.children[0],
      );
    }
  }

  /**
   * 从警报的原始开始时间恢复音频进度，并在曲目已结束时清理警报。
   */
  function playAlertAudio() {
    let resumePosition;
    if (elapsedSeconds > 0 && Number.isFinite(audio.duration)) {
      if (elapsedSeconds >= audio.duration) {
        finishAlert();
        return;
      }
      resumePosition = Math.min(
        elapsedSeconds,
        Math.max(0, audio.duration - 0.001),
      );
      applyResumePosition();
    }

    /**
     * 将媒体定位到已保存进度。部分 Chromium 页面切换场景会在首次播放时重置预设进度，因此播放后需再次定位。
     */
    function applyResumePosition() {
      if (resumePosition === undefined) {
        return;
      }
      audio.currentTime = resumePosition;
      overlay.dataset.lobotomyCorpAlertSeekedTo = String(audio.currentTime);
    }

    audio.addEventListener("playing", applyResumePosition, { once: true });
    void audio.play().then(applyResumePosition).catch(() => {
      // 页面切换后的自动播放可能被浏览器限制；自然结束计时仍会按曲目时长关闭警报。
    });
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
      (audio.duration - elapsedSeconds) * 1000,
    );
    naturalEndTimer = setTimeout(finishAlert, remainingMilliseconds);
  }

  /**
   * 记录真实的音频播放进度，供完整页面切换后的警报续播使用。
   */
  function persistPlaybackPosition() {
    const currentPosition = Number.isFinite(audio?.currentTime)
      ? audio.currentTime
      : elapsedSeconds;
    persistLobotomyCorpAlert(alert, startedAt, currentPosition);
  }

  /**
   * 在字体和 Sprite 准备完成后挂载 Unity 风格的 EmergencyController 层级。
   *
   * @return {Promise<void>} HUD 挂载或被提前关闭后完成。
   */
  async function mountLobotomyCorpAlert() {
    try {
      if (shouldPrepareLobotomyCorpVisualAssets()) {
        await prepareLobotomyCorpVisualAssets();
      }
      if (finished || activeLobotomyCorpAlert !== alertContext) {
        return;
      }

      overlay = document.createElement("div");
      const emergencyController = document.createElement("div");
      const activeControl = document.createElement("div");
      closeButton = document.createElement("button");
      audio = new Audio(
        `${lobotomyCorpAssetRoot}/AudioClip/${alert.soundFile}`,
      );

      overlay.className = "lobotomy-corp-alert-overlay";
      overlay.setAttribute("aria-live", "assertive");
      overlay.setAttribute("aria-label", "Lobotomy Corporation alert");
      overlay.dataset.lobotomyCorpAlertStartedAt = String(startedAt);
      overlay.dataset.lobotomyCorpAlertResumeAt = String(elapsedSeconds);
      emergencyController.className = "lobotomy-corp-emergency-controller";
      activeControl.className = "lobotomy-corp-alert-active-control";
      lobotomyCorpCornerDefinitions.forEach((definition) => {
        activeControl.append(
          createLobotomyCorpEmergencyCorner(alert, definition),
        );
      });
      emergencyController.append(activeControl);
      overlay.append(emergencyController);

      closeButton.type = "button";
      closeButton.className = "lobotomy-corp-alert-close";
      closeButton.textContent = "关闭警报";
      closeButton.setAttribute("aria-label", "关闭脑叶公司警报");
      overlay.append(closeButton);
      // 保持为隐藏 DOM 媒体节点，便于跨页恢复时核验真实播放进度。
      audio.hidden = true;
      audio.preload = "auto";
      audio.setAttribute("aria-hidden", "true");
      overlay.append(audio);
      updateLobotomyCorpCanvasScale(emergencyController);
      globalThis.addEventListener?.("resize", updateCanvasScale);
      document.body.append(overlay);

      audio.addEventListener("ended", finishAlert);
      audio.addEventListener("error", finishAlert);
      audio.addEventListener("timeupdate", persistPlaybackPosition);
      audio.addEventListener("loadedmetadata", scheduleNaturalAlertEnd, {
        once: true,
      });
      globalThis.addEventListener?.("pagehide", persistPlaybackPosition, {
        once: true,
      });
      closeButton.addEventListener("click", finishAlert);
      if (elapsedSeconds > 0) {
        audio.addEventListener("loadedmetadata", playAlertAudio, {
          once: true,
        });
      } else {
        playAlertAudio();
      }
    } catch {
      // 视觉资源加载或 DOM 初始化失败时，沿用既有生命周期清理警报状态。
      finishAlert();
    }
  }

  alertContext.finish = finishAlert;
  activeLobotomyCorpAlert = alertContext;
  globalThis.easterEggCoordinator?.start(
    lobotomyCorpEasterEggGameId,
    finishAlert,
  );
  void mountLobotomyCorpAlert();
  return alertContext.promise;
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
      restoredLobotomyCorpAlert.alert,
      restoredLobotomyCorpAlert.startedAt,
      restoredLobotomyCorpAlert.position,
    );
  }
}
