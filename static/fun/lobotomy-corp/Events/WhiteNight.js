/**
 * @file 《脑叶公司》白夜特殊事件状态机。
 *
 * 此模块只拥有白夜的持久化、场景、媒体和限制；Danger、Day、Alert 与账户保存
 * 仍由 lobotomy-corp.js 提供的最小共享 API 管理。
 */

/** 白夜专用媒体路径。 */
export const whiteNightSoundPaths = Object.freeze({
  bell: "Resources/sounds/creature/deathangel/Lucifer_Bell0.ogg",
  church: "Resources/sounds/creature/deathangel/Lucifer_standbg0.ogg",
});

/** Dead_23.anim 的真实 Animation Event 时间（秒）。 */
export const whiteNightDeathSounds = Object.freeze([
  {
    at: 3.1667,
    path: "Resources/sounds/creature/whitenight/WhiteNight_Dead1.ogg",
  },
  {
    at: 4.2667,
    path: "Resources/sounds/creature/whitenight/WhiteNight_Dead2.ogg",
  },
  {
    at: 4.8,
    path: "Resources/sounds/creature/whitenight/WhiteNight_Dead3.ogg",
  },
]);

/** Confess 每 0.3 秒造成 666 P 伤害，12000 HP 白夜在第 19 次伤害后镇压。 */
export const whiteNightConfessionSuppressionDelayMs = 5700;

/** DeathAngelAnim.prefab 中 Confess ParticleSystem 的原始序列化参数。 */
export const whiteNightConfessParticleSystem = Object.freeze({
  transform: Object.freeze({
    positionX: 5.8399997,
    positionY: 17.959997,
    rotationZ: 19.816715,
  }),
  initial: Object.freeze({
    lifetimeSeconds: 5,
    speed: 1,
    sizeX: 4.13,
    sizeY: 1.5,
    color: Object.freeze({
      red: 0.60294116,
      green: 0.57994866,
      blue: 0.39457178,
      alpha: 0.559,
    }),
  }),
  shape: Object.freeze({
    scaleX: 4.5,
    scaleY: 1,
    scaleZ: 1,
  }),
  emissionRate: 4,
  sizeOverLifetime: Object.freeze({
    xFullAt: 0.49319458,
    yFullAt: 0.25509644,
  }),
  colorOverLifetime: Object.freeze({
    alphaHoldUntil: 44140 / 65535,
    finalAlpha: 0.20784314,
  }),
  renderer: Object.freeze({
    lengthScale: 10,
    pivotY: 4.63,
  }),
  camera: Object.freeze({
    orthographicSize: 8.5,
  }),
});

/** 5.7 秒镇压阶段内按 4/s 发射的浏览器粒子数量。 */
const whiteNightConfessRayCount = Math.ceil(
  whiteNightConfessionSuppressionDelayMs / 1000 *
    whiteNightConfessParticleSystem.emissionRate,
);

/** Dead_23 最晚音效事件及其原始音频尾音全部播放完成所需时长。 */
export const whiteNightDeathSequenceDurationMs = 8830;

/** 白夜允许的入口以及各入口是否播放进入钟声和使徒完成演出。 */
const whiteNightEntryBehaviors = Object.freeze({
  "apostles-replay": Object.freeze({
    playApostlesCompletion: true,
    playEntryBell: true,
  }),
  "direct-submission": Object.freeze({
    playApostlesCompletion: false,
    playEntryBell: true,
  }),
  "plague-doctor-transformation": Object.freeze({
    playApostlesCompletion: false,
    playEntryBell: false,
  }),
});

/**
 * 按 Unity Box Shape 与 Transform 投影创建一枚 Confess 粒子。
 *
 * @param {Document} document 当前文档。
 * @param {string} assetRoot 《脑叶公司》资源根路径。
 * @param {number} index 粒子发射序号。
 * @return {HTMLElement} 对应一枚 Stretched Billboard 的浏览器节点。
 */
function createWhiteNightConfessRay(document, assetRoot, index) {
  const source = whiteNightConfessParticleSystem;
  const color = source.initial.color;
  const exposure = Math.max(color.red, color.green, color.blue);
  const localX = (Math.random() - 0.5) * source.shape.scaleX;
  const localZ = (Math.random() - 0.5) * source.shape.scaleZ;
  const radians = source.transform.rotationZ * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const worldViewportHeight = 100 / (source.camera.orthographicSize * 2);
  // Transform X=90° 后 Shape 的 Y 轴进入景深；画面坐标只保留 X/Z。
  const worldX = source.transform.positionX + cosine * localX - sine * localZ;
  const worldY = source.transform.positionY - sine * localX - cosine * localZ;
  const texture = `${assetRoot}/Texture2D/CFX3_T_RayStraight.png`;
  const ray = document.createElement("span");
  ray.className = "lobotomy-corp-white-night-confess-ray";
  ray.dataset.asset = texture;
  ray.setAttribute("aria-hidden", "true");
  ray.style.setProperty(
    "--lobotomy-corp-ray-texture",
    `url("${texture}")`,
  );
  ray.style.setProperty(
    "--lobotomy-corp-ray-color",
    `${(color.red / exposure * 100).toFixed(6)}% ${
      (color.green / exposure * 100).toFixed(6)
    }% ${(color.blue / exposure * 100).toFixed(6)}%`,
  );
  ray.style.setProperty(
    "--lobotomy-corp-ray-delay",
    `${index / source.emissionRate}s`,
  );
  ray.style.setProperty(
    "--lobotomy-corp-ray-duration",
    `${source.initial.lifetimeSeconds}s`,
  );
  ray.style.setProperty(
    "--lobotomy-corp-ray-left",
    `calc(50% + ${worldX * worldViewportHeight}vh)`,
  );
  ray.style.setProperty(
    "--lobotomy-corp-ray-top",
    `calc(50% - ${worldY * worldViewportHeight}vh)`,
  );
  ray.style.setProperty(
    "--lobotomy-corp-ray-width",
    `${source.initial.sizeX * source.renderer.lengthScale * worldViewportHeight}vh`,
  );
  ray.style.setProperty(
    "--lobotomy-corp-ray-height",
    `${source.initial.sizeY * worldViewportHeight}vh`,
  );
  ray.style.setProperty(
    "--lobotomy-corp-ray-travel-y-full",
    `${source.initial.speed * source.initial.lifetimeSeconds *
      source.sizeOverLifetime.yFullAt * worldViewportHeight}vh`,
  );
  ray.style.setProperty(
    "--lobotomy-corp-ray-travel-x-full",
    `${source.initial.speed * source.initial.lifetimeSeconds *
      source.sizeOverLifetime.xFullAt * worldViewportHeight}vh`,
  );
  ray.style.setProperty(
    "--lobotomy-corp-ray-travel-end",
    `${source.initial.speed * source.initial.lifetimeSeconds *
      worldViewportHeight}vh`,
  );
  return ray;
}

/**
 * 创建白夜特殊事件控制器。
 *
 * @param {object} shared lobotomy-corp.js 提供的最小共享 API。
 * @return {object} 白夜事件 API。
 */
export function createWhiteNightEvent(shared) {
  let state;

  /**
   * 判断当前特殊事件是否为白夜。
   *
   * @return {boolean} 白夜正在运行时返回 true。
   */
  const isActive = () => state?.id === "white-night";

  /**
   * 释放一段事件媒体。
   *
   * @param {HTMLMediaElement|undefined} media 要释放的媒体。
   */
  const releaseMedia = (media) => {
    media?.pause?.();
    media?.removeAttribute?.("src");
    media?.load?.();
  };

  /**
   * 写入白夜的可恢复状态，并保留教堂音乐的真实播放进度。
   */
  const persist = () => {
    if (!isActive()) return;
    const serialized = JSON.stringify({
      id: "white-night",
      lockLocation: state.lockLocation,
      pendingNavigationViolation: state.pendingNavigationViolation === true,
      pendingRecoveryBell: state.pendingRecoveryBell === true,
      phase: state.phase,
      source: state.source,
      churchPosition: currentChurchPosition(),
    });
    shared.storages().forEach((storage) =>
      storage.setItem(shared.storageKey, serialized)
    );
  };

  /** 清除白夜持久化状态。 */
  const clearPersisted = () =>
    shared.storages().forEach((storage) =>
      storage.removeItem(shared.storageKey)
    );

  /**
   * 读取可恢复的白夜状态。
   *
   * @return {{id: string, lockLocation?: string, pendingNavigationViolation?: boolean, pendingRecoveryBell?: boolean, phase?: string, source?: string, churchPosition?: number}|undefined} 已保存状态。
   */
  const persisted = () => {
    const serialized = shared.storages().map((storage) =>
      storage.getItem(shared.storageKey)
    ).find(Boolean);
    if (!serialized) return undefined;
    try {
      const saved = JSON.parse(serialized);
      if (saved?.id !== "white-night") return undefined;
      if (
        saved.churchPosition !== undefined &&
        (!Number.isFinite(saved.churchPosition) || saved.churchPosition < 0)
      ) {
        throw new Error("Invalid WhiteNight church position.");
      }
      return saved;
    } catch {
      clearPersisted();
      return undefined;
    }
  };

  /**
   * 判断输入是否为赎罪。
   *
   * @param {string} value 待匹配输入。
   * @return {boolean} 是赎罪入口时返回 true。
   */
  const matchesConfession = (value) =>
    shared.normalize(value) === "o-03-03" ||
    shared.confessionAliases().has(shared.normalize(value));

  /**
   * 创建或采用白夜音频，并在需要时从已保存的进度继续播放。
   *
   * @param {string} soundPath 相对于 Assets 的路径。
   * @param {object|undefined} preparedMedia 用户手势预热的媒体。
   * @param {boolean} loop 是否循环。
   * @param {Function|undefined} onBlocked 自动播放被拒绝时的处理。
   * @param {number} [resumePosition] 需要恢复的播放进度（秒）。
   * @param {Function|undefined} onPlayed 媒体成功播放并完成首次定位后的处理。
   * @return {HTMLAudioElement|undefined} 已播放的音频。
   */
  const playAudio = (
    soundPath,
    preparedMedia,
    loop = false,
    onBlocked,
    resumePosition = 0,
    onPlayed,
  ) => {
    const audio = preparedMedia?.consumeWhiteNight?.(soundPath) ??
      (typeof globalThis.Audio === "function"
        ? new Audio(`${shared.assetRoot}/${soundPath}`)
        : undefined);
    if (!audio) return undefined;
    audio.hidden = true;
    audio.loop = loop;
    audio.muted = false;
    audio.preload = "auto";
    const position = Number.isFinite(resumePosition) && resumePosition >= 0
      ? resumePosition
      : 0;
    audio.currentTime = position;
    audio.setAttribute?.("aria-hidden", "true");
    void audio.play?.().then(() => {
      // Chromium 有时会在首次 play 后覆盖预先写入的 currentTime。
      if (position > 0) audio.currentTime = position;
      onPlayed?.();
    }).catch(() => onBlocked?.());
    return audio;
  };

  /**
   * 将教堂恢复位置限制在当前可播放范围内。
   *
   * @param {number} position 待恢复的持久化进度（秒）。
   * @return {number} 当前媒体可接受的进度（秒）。
   */
  const normalizedChurchPosition = (position) => {
    const fallback = Number.isFinite(position) && position >= 0 ? position : 0;
    const duration = state?.churchAudio?.duration;
    if (!Number.isFinite(duration) || duration <= 0) return fallback;
    return Math.min(
      fallback % duration,
      Math.max(0, duration - 0.001),
    );
  };

  /**
   * 在媒体尝试播放前重新定位教堂音乐，避免被此前失败的 autoplay 重置。
   *
   * @return {number|undefined} 本次实际写入的恢复位置。
   */
  const seekPendingChurchResumePosition = () => {
    if (!state || state.pendingChurchResumePosition === undefined) {
      return undefined;
    }
    const position = normalizedChurchPosition(state.pendingChurchResumePosition);
    state.churchPosition = position;
    if (state.churchAudio) state.churchAudio.currentTime = position;
    return position;
  };

  /**
   * 确认教堂音乐已经从保存位置成功恢复，此后才允许真实 timeupdate 更新持久化进度。
   */
  const confirmChurchResumePosition = () => {
    if (!state || state.pendingChurchResumePosition === undefined) return;
    seekPendingChurchResumePosition();
    state.pendingChurchResumePosition = undefined;
    persist();
  };

  /**
   * 读取教堂音乐当前真实播放进度；恢复尚未完成时始终以保存位置为准。
   *
   * @return {number} 有效的播放进度（秒）。
   */
  const currentChurchPosition = () => {
    if (state?.pendingChurchResumePosition !== undefined) {
      return normalizedChurchPosition(state.pendingChurchResumePosition);
    }
    const position = state?.churchAudio?.currentTime;
    return Number.isFinite(position) && position >= 0
      ? position
      : state?.churchPosition ?? 0;
  };

  /**
   * 播放一次钟声并在结束后释放。
   *
   * @param {object|undefined} preparedMedia 用户手势预热的媒体。
   * @param {boolean} recovery 是否在自动播放被拒绝时保留恢复钟声标记。
   * @return {HTMLAudioElement|undefined} 已创建的钟声音频。
   */
  const playBell = (preparedMedia, recovery = false) => {
    const bell = playAudio(
      whiteNightSoundPaths.bell,
      preparedMedia,
      false,
      recovery
        ? () => {
          if (!state) return;
          state.pendingRecoveryBell = true;
          persist();
          // 若交互中的 Bell 仍被策略拒绝，重新挂回解锁监听，直到这声 Bell 成功播放。
          if (
            state.resumeAudioOnInteraction &&
            !state.audioRecoveryListenerAttached
          ) {
            globalThis.document?.addEventListener?.(
              "pointerdown",
              state.resumeAudioOnInteraction,
              true,
            );
            globalThis.document?.addEventListener?.(
              "keydown",
              state.resumeAudioOnInteraction,
              true,
            );
            state.audioRecoveryListenerAttached = true;
          }
        }
        : undefined,
    );
    if (!bell) {
      if (recovery && state) {
        state.pendingRecoveryBell = true;
        persist();
      }
      return undefined;
    }
    state?.bellAudios.add(bell);
    const releaseBell = () => {
      state?.bellAudios.delete(bell);
      releaseMedia(bell);
    };
    bell.addEventListener?.("ended", releaseBell, { once: true });
    if (recovery && state) {
      state.pendingRecoveryBell = false;
      persist();
    }
    return bell;
  };

  /**
   * 以 DeathAngelBlock.prefab 的真实 CanvasGroup 参数显示阻挡提示。
   *
   * @param {string} messageKey 当前 locale 文本键。
   */
  const showBlockMessage = (messageKey) => {
    const document = globalThis.document;
    if (!document?.createElement || !document.body) return;
    document.querySelectorAll?.(".lobotomy-corp-white-night-message").forEach((
      node,
    ) => node.remove());
    const overlay = document.createElement("section");
    const filter = document.createElement("img");
    const text = document.createElement("p");
    overlay.className = "lobotomy-corp-white-night-message";
    filter.className = "lobotomy-corp-white-night-block-filter";
    filter.src =
      `${shared.assetRoot}/Resources/sprites/creaturesprite/deathangel/clock/GlobalShader.png`;
    filter.alt = "";
    filter.setAttribute("aria-hidden", "true");
    text.textContent = shared.blockMessage?.(messageKey) ??
      shared.messages()?.[messageKey] ?? "";
    overlay.append(filter, text);
    document.body.append(overlay);
    const timer = setTimeout(() => overlay.remove(), 1500);
    state?.timers.add(timer);
  };

  /**
   * 同步赎罪保存按钮的显示状态。
   *
   * @param {boolean} active 是否显示赎罪工作。
   */
  const syncConfessionButton = (active) => {
    const document = globalThis.document;
    const button = document?.querySelector?.("[data-account-save-button]");
    if (!button) {
      if (!active) {
        document?.querySelectorAll?.(".lobotomy-corp-confession-work-icon")
          .forEach((node) => node.remove?.());
      }
      return;
    }
    const host = button.parentElement;
    const icon = host?.querySelector?.(".lobotomy-corp-confession-work-icon");
    if (active) {
      button.dataset.lobotomyCorpOriginalAriaLabel ??=
        button.getAttribute("aria-label") ?? "";
      button.dataset.lobotomyCorpOriginalText ??= button.textContent ?? "";
      const label = shared.messages()?.["oneSin.specialWork.confession"] ??
        button.dataset.lobotomyCorpOriginalText;
      button.textContent = label;
      button.setAttribute("aria-label", label);
      if (!icon && host && globalThis.document?.createElement) {
        const image = globalThis.document.createElement("img");
        image.alt = "";
        image.className = "lobotomy-corp-confession-work-icon";
        image.src = `${shared.assetRoot}/Sprite/Work_Confess.png`;
        image.setAttribute("aria-hidden", "true");
        host.insertBefore(image, button);
      }
    } else if (button.dataset.lobotomyCorpOriginalAriaLabel !== undefined) {
      button.setAttribute(
        "aria-label",
        button.dataset.lobotomyCorpOriginalAriaLabel,
      );
      button.textContent = button.dataset.lobotomyCorpOriginalText ??
        button.textContent;
      delete button.dataset.lobotomyCorpOriginalAriaLabel;
      delete button.dataset.lobotomyCorpOriginalText;
      icon?.remove?.();
      document?.querySelectorAll?.(".lobotomy-corp-confession-work-icon")
        .forEach((node) => {
          if (node !== icon) node.remove?.();
        });
    }
  };

  /**
   * 增加可统一撤销的监听器。
   *
   * @param {object} target 事件目标。
   * @param {string} type 事件类型。
   * @param {Function} listener 监听器。
   * @param {object|boolean} options 监听选项。
   */
  const addListener = (target, type, listener, options = false) => {
    target?.addEventListener?.(type, listener, options);
    state.listeners.push([target, type, listener, options]);
  };

  /**
   * 启动白夜并接管 Alert 音乐。
   *
   * @param {{churchPosition?: number, lockLocation?: string, pendingNavigationViolation?: boolean, pendingRecoveryBell?: boolean, preparedMedia?: object, restore?: boolean, resumeEnding?: boolean, source: "apostles-replay"|"direct-submission"|"plague-doctor-transformation"}} options 事件入口配置。
   * @return {boolean} 新事件启动时返回 true。
   */
  const start = (options) => {
    if (state) {
      options?.preparedMedia?.dispose?.();
      return false;
    }
    const behavior = whiteNightEntryBehaviors[options?.source];
    if (!behavior) {
      options?.preparedMedia?.dispose?.();
      return false;
    }
    const document = globalThis.document;
    state = {
      bellAudios: new Set(),
      id: "white-night",
      listeners: [],
      lockLocation: options.lockLocation ??
        `${globalThis.location?.pathname ?? "/settings"}${
          globalThis.location?.search ?? ""
        }`,
      phase: "active",
      churchPosition: Number.isFinite(options.churchPosition) &&
          options.churchPosition >= 0
        ? options.churchPosition
        : 0,
      pendingChurchResumePosition: options.restore === true &&
          Number.isFinite(options.churchPosition) && options.churchPosition >= 0
        ? options.churchPosition
        : undefined,
      pendingRecoveryBell: options.pendingRecoveryBell === true,
      source: options.source,
      timers: new Set(),
    };
    persist();
    shared.pauseDangerDecay();
    shared.ensureCoordinator();
    if (!shared.getAlert()) shared.mountRestartPanel();
    shared.holdAlertMusic();

    const violate = (key, bell = true) => {
      if (!isActive()) return;
      if (bell) playBell();
      showBlockMessage(key);
    };
    let navigationMessageIndex = 0;
    const navigationViolation = () => {
      const key = navigationMessageIndex++ % 2 === 0
        ? "whiteNight.blockNavigation.denyPresence"
        : "whiteNight.blockNavigation.unknownStory";
      violate(key);
    };
    const blockNavigation = (event) => {
      const target = event.target;
      if (target?.closest?.(".lobotomy-corp-top-panel-action-button")) return;
      if (target?.closest?.("a[href]")) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        navigationViolation();
      }
    };
    const blockRefresh = (event) => {
      if (
        event.key === "F5" ||
        ((event.ctrlKey || event.metaKey) && event.key?.toLowerCase?.() === "r")
      ) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        violate("whiteNight.blockTime");
      }
    };
    const pollingValues = new Map();
    document?.querySelectorAll?.(
      "[data-polling-interval-value], [data-polling-interval-unit]",
    ).forEach((input) => pollingValues.set(input, input.value));
    const blockPolling = (event) => {
      const input = event.target?.closest?.(
        "[data-polling-interval-value], [data-polling-interval-unit]",
      );
      if (!input) return;
      if (!pollingValues.has(input)) pollingValues.set(input, input.value);
      input.value = pollingValues.get(input);
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      violate("whiteNight.blockTime");
    };
    const blockFormNavigation = (event) => {
      const form = event.target;
      if (form?.matches?.("[data-account-form]")) return;
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      let isLogout = false;
      try {
        isLogout = new URL(
          form?.getAttribute?.("action") ?? "",
          globalThis.location?.href ?? "http://localhost/",
        ).pathname === "/logout";
      } catch {
        isLogout = false;
      }
      if (isLogout) violate("whiteNight.blockExit");
      else navigationViolation();
    };
    const syncConfession = (event) => {
      const input = event.target?.closest?.(
        "[data-account-display-name-input]",
      );
      if (input) syncConfessionButton(matchesConfession(input.value));
    };
    const resetConfession = (event) => {
      if (event.target?.closest?.("[data-account-cancel-button]")) {
        syncConfessionButton(false);
      }
    };
    const handlePopstate = () => {
      navigationViolation();
      const currentLocation = `${globalThis.location?.pathname ?? ""}${
        globalThis.location?.search ?? ""
      }`;
      if (state?.lockLocation && currentLocation !== state.lockLocation) {
        state.pendingNavigationViolation = true;
        persist();
        globalThis.location?.replace?.(state.lockLocation);
      }
    };
    addListener(document, "click", blockNavigation, true);
    addListener(document, "submit", blockFormNavigation, true);
    addListener(document, "keydown", blockRefresh, true);
    addListener(document, "input", blockPolling, true);
    addListener(document, "change", blockPolling, true);
    addListener(document, "input", syncConfession, true);
    addListener(document, "click", resetConfession, true);
    addListener(globalThis, "popstate", handlePopstate);

    if (document?.createElement && document.body) {
      const entity = document.createElement("section");
      const video = document.createElement("video");
      entity.className = "lobotomy-corp-white-night-entity";
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.src =
        `${shared.assetRoot}/Resources/sprites/creaturesprite/deathangel/WhiteNight_Escape_Idle.webm`;
      video.setAttribute("aria-hidden", "true");
      entity.append(video);
      document.body.append(entity);
      state.entity = entity;
      state.idleVideo = video;
    }
    state.churchAudio = playAudio(
      whiteNightSoundPaths.church,
      options.preparedMedia,
      true,
      () => {
        if (state) state.churchPlaybackPending = true;
      },
      state.churchPosition,
      confirmChurchResumePosition,
    );
    addListener(state.churchAudio, "timeupdate", persist);
    addListener(
      state.churchAudio,
      "loadedmetadata",
      seekPendingChurchResumePosition,
    );
    addListener(
      state.churchAudio,
      "playing",
      confirmChurchResumePosition,
    );
    addListener(globalThis, "pagehide", persist);
    state.resumeAudioOnInteraction = async () => {
      const current = state;
      if (!current) return;
      try {
        shared.prepareAlertMusicForResume?.();
        seekPendingChurchResumePosition();
        await current.churchAudio?.play?.();
        confirmChurchResumePosition();
        current.churchPlaybackPending = false;
      } catch {
        current.churchPlaybackPending = true;
        return;
      }
      document?.removeEventListener?.(
        "pointerdown",
        current.resumeAudioOnInteraction,
        true,
      );
      document?.removeEventListener?.(
        "keydown",
        current.resumeAudioOnInteraction,
        true,
      );
      current.audioRecoveryListenerAttached = false;
      if (current.pendingRecoveryBell) {
        current.pendingRecoveryBell = false;
        persist();
        playBell(undefined, true);
      }
    };
    addListener(document, "pointerdown", state.resumeAudioOnInteraction, true);
    addListener(document, "keydown", state.resumeAudioOnInteraction, true);
    state.audioRecoveryListenerAttached = true;

    const shouldPlayApostlesCompletion = behavior.playApostlesCompletion ||
      (options.source === "direct-submission" &&
        shared.hasTwelveApostles?.() === true);
    if (!options.restore && shouldPlayApostlesCompletion) {
      shared.playApostlesCompletion?.(options.source);
    }
    if (!options.restore && behavior.playEntryBell) {
      playBell(options.preparedMedia);
    }
    options.preparedMedia?.dispose?.();
    const displayNameInput = document?.querySelector?.(
      "[data-account-display-name-input]",
    );
    if (displayNameInput) {
      syncConfessionButton(matchesConfession(displayNameInput.value));
    }
    if (
      options.restore && !options.resumeEnding && shared.isReload() &&
      !options.pendingNavigationViolation
    ) {
      showBlockMessage("whiteNight.blockTime");
      playBell(undefined, true);
    }
    return true;
  };

  /**
   * 结束白夜并清除全部资源、监听器和持久化。
   *
   * @param {{confessionCompleted?: boolean, restoreAlert?: boolean}} options 清理来源及是否恢复普通 Trumpet 音乐。
   */
  const finish = ({
    confessionCompleted = false,
    restoreAlert = true,
  } = {}) => {
    const current = state;
    if (!current) return;
    state = undefined;
    clearPersisted();
    shared.finishRestartPanel();
    current.timers.forEach(clearTimeout);
    current.listeners.forEach(([target, type, listener, options]) =>
      target?.removeEventListener?.(type, listener, options)
    );
    current.entity?.remove?.();
    current.confessionEntity?.remove?.();
    current.particleLayer?.remove?.();
    releaseMedia(current.churchAudio);
    current.bellAudios?.forEach(releaseMedia);
    current.deathAudios?.forEach(releaseMedia);
    releaseMedia(current.idleVideo);
    releaseMedia(current.confessionVideo);
    current.preparedDeathMedia?.dispose?.();
    globalThis.document?.querySelectorAll?.(
      ".lobotomy-corp-white-night-message",
    ).forEach((node) => node.remove());
    syncConfessionButton(false);
    shared.resumeDangerDecay();
    if (restoreAlert && !current.alertMusicResumed) shared.resumeAlertMusic();
    current.resolveConfession?.(confessionCompleted);
  };

  /**
   * 启动由 Confess/SuppressAnimator 与 WhiteNight Suppressed 共同构成的死亡演出。
   *
   * @param {object|undefined} preparedMedia 已在用户手势中预热的死亡 SFX。
   * @return {Promise<boolean>} 演出完成时返回 true。
   */
  const confess = (preparedMedia) => {
    if (!isActive() || state.phase === "ending") {
      preparedMedia?.dispose?.();
      return Promise.resolve(false);
    }
    state.phase = "ending";
    state.preparedDeathMedia = preparedMedia;
    persist();
    // 赎罪提交本身是用户手势；提前把静音的 Trumpet 置于可播放状态，
    // 5.7 秒后的镇压点只需平滑恢复音量。
    shared.prepareAlertMusicForResume?.();
    syncConfessionButton(false);
    const current = state;
    const document = globalThis.document;
    const completion = new Promise((done) => current.resolveConfession = done);
    const complete = () => {
      if (state !== current) return;
      finish({ confessionCompleted: true });
    };
    if (document?.createElement && document.body) {
      const entity = document.createElement("section");
      const video = document.createElement("video");
      const particles = document.createElement("div");
      entity.className = "lobotomy-corp-white-night-confession-entity";
      video.className = "lobotomy-corp-white-night-confession-video";
      video.autoplay = true;
      video.hidden = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("aria-hidden", "true");
      particles.className = "lobotomy-corp-white-night-confess-particles";
      // ParticleSystem 使用 CFX3_RayStraight ADD.mat；浏览器直接加载其 _MainTex：CFX3_T_RayStraight.png。
      for (let index = 0; index < whiteNightConfessRayCount; index++) {
        particles.append(
          createWhiteNightConfessRay(document, shared.assetRoot, index),
        );
      }
      entity.append(video, particles);
      document.body.append(entity);
      state.confessionEntity = entity;
      state.confessionVideo = video;
      state.particleLayer = particles;
    }
    const suppressionTimer = setTimeout(() => {
      if (state !== current) return;
      releaseMedia(current.churchAudio);
      current.churchAudio = undefined;
      current.entity?.remove?.();
      current.entity = undefined;
      releaseMedia(current.idleVideo);
      current.idleVideo = undefined;
      if (current.confessionVideo) {
        current.confessionVideo.hidden = false;
        current.confessionVideo.src =
          `${shared.assetRoot}/Resources/sprites/creaturesprite/deathangel/WhiteNight_Confess_Dead.webm`;
      }
      shared.resumeAlertMusic();
      current.alertMusicResumed = true;
      whiteNightDeathSounds.forEach(({ at, path }) => {
        const timer = setTimeout(() => {
          if (state !== current) return;
          const audio = playAudio(path, preparedMedia);
          if (audio) (current.deathAudios ??= []).push(audio);
        }, Math.round(at * 1000));
        current.timers.add(timer);
      });
      const fallback = setTimeout(complete, whiteNightDeathSequenceDurationMs);
      current.timers.add(fallback);
    }, whiteNightConfessionSuppressionDelayMs);
    current.timers.add(suppressionTimer);
    return completion;
  };

  /**
   * 恢复已保存的白夜；错误页面位置会被强制带回锁定位置。
   */
  const restore = () => {
    const saved = persisted();
    if (!saved) return false;
    const location = `${globalThis.location?.pathname ?? ""}${
      globalThis.location?.search ?? ""
    }`;
    if (saved.lockLocation && location && location !== saved.lockLocation) {
      shared.storages().forEach((storage) =>
        storage.setItem(
          shared.storageKey,
          JSON.stringify({ ...saved, pendingNavigationViolation: true }),
        )
      );
      globalThis.location?.replace?.(saved.lockLocation);
      return true;
    }
    const source = whiteNightEntryBehaviors[saved.source]
      ? saved.source
      : "direct-submission";
    const resumeEnding = saved.phase === "ending";
    start({
      churchPosition: saved.churchPosition,
      lockLocation: saved.lockLocation,
      pendingNavigationViolation: saved.pendingNavigationViolation,
      pendingRecoveryBell: saved.pendingRecoveryBell,
      restore: true,
      resumeEnding,
      source,
    });
    if (resumeEnding) {
      void confess();
      return true;
    }
    if (saved.pendingNavigationViolation) {
      if (state) state.pendingNavigationViolation = false;
      playBell(undefined, true);
      showBlockMessage("whiteNight.blockNavigation.denyPresence");
      persist();
    }
    return true;
  };

  return Object.freeze({
    clearPersisted,
    confess,
    finish,
    getId: () => state?.id,
    getPhase: () => state?.phase,
    getSource: () => state?.source,
    isActive,
    matchesConfession,
    persisted,
    restore,
    soundPaths: whiteNightSoundPaths,
    start,
  });
}
