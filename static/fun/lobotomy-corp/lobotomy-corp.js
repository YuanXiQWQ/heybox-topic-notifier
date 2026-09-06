/**
 * @file 本文件提供修改显示名称时触发的《脑叶公司》Trumpet 警报彩蛋。
 */

/**
 * 警报口令、资源目录与音频文件的对应关系。
 */
const lobotomyCorpAlerts = Object.freeze({
  firsttrumpet: {
    assetDirectory: "first-trumpet",
    soundFile: "first-trumpet.wav",
  },
  secondtrumpet: {
    assetDirectory: "second-trumpet",
    soundFile: "second-trumpet.wav",
  },
  thirdtrumpet: {
    assetDirectory: "third-trumpet",
    soundFile: "third-trumpet.wav",
  },
});

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

  const alertContext = { alert };
  const completion = new Promise((resolve) => {
    const assetRoot = "/static/fun/lobotomy-corp/assets";
    const overlay = document.createElement("div");
    const closeButton = document.createElement("button");
    const audio = new Audio(`${assetRoot}/sounds/${alert.soundFile}`);
    const elapsedSeconds = Math.max(0, resumeAt);
    let finished = false;
    let naturalEndTimer;

    overlay.className = "lobotomy-corp-alert-overlay";
    overlay.setAttribute("aria-live", "assertive");
    overlay.setAttribute("aria-label", "Lobotomy Corporation alert");
    overlay.dataset.lobotomyCorpAlertStartedAt = String(startedAt);
    overlay.dataset.lobotomyCorpAlertResumeAt = String(elapsedSeconds);
    [
      ["top-right", "tr-corner.png"],
      ["bottom-right", "others.png"],
      ["bottom-left", "others.png"],
      ["top-left", "others.png"],
    ].forEach(([position, imageFile]) => {
      const corner = document.createElement("img");
      corner.alt = "";
      corner.className = `lobotomy-corp-alert-corner ${position}`;
      corner.src = `${assetRoot}/images/${alert.assetDirectory}/${imageFile}`;
      overlay.append(corner);
    });
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
    document.body.append(overlay);

    /**
     * 清理警报界面、音频和跨页面恢复状态。
     */
    function finishAlert() {
      if (finished) {
        return;
      }
      finished = true;
      audio.pause();
      audio.removeEventListener("ended", finishAlert);
      audio.removeEventListener("error", finishAlert);
      audio.removeEventListener("timeupdate", persistPlaybackPosition);
      closeButton.removeEventListener("click", finishAlert);
      globalThis.removeEventListener?.("pagehide", persistPlaybackPosition);
      if (naturalEndTimer !== undefined) {
        clearTimeout(naturalEndTimer);
      }
      overlay.remove();
      clearPersistedLobotomyCorpAlert();
      if (activeLobotomyCorpAlert === alertContext) {
        activeLobotomyCorpAlert = undefined;
      }
      globalThis.easterEggCoordinator?.finish(
        lobotomyCorpEasterEggGameId,
        finishAlert,
      );
      resolve(true);
    }
    alertContext.finish = finishAlert;

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
      const currentPosition = Number.isFinite(audio.currentTime)
        ? audio.currentTime
        : elapsedSeconds;
      persistLobotomyCorpAlert(alert, startedAt, currentPosition);
    }

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
    globalThis.easterEggCoordinator?.start(
      lobotomyCorpEasterEggGameId,
      finishAlert,
    );
    if (elapsedSeconds > 0) {
      audio.addEventListener("loadedmetadata", playAlertAudio, { once: true });
    } else {
      playAlertAudio();
    }
  });

  alertContext.promise = completion;
  activeLobotomyCorpAlert = alertContext;
  return completion;
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
