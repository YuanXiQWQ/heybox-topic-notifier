/**
 * @file 《脑叶公司》白夜特殊事件状态机。
 *
 * 此模块只拥有白夜的持久化、场景、媒体和限制；Danger、Day、Alert 与账户保存
 * 仍由 lobotomy-corp.js 提供的最小共享 API 管理。
 */

import {
  createWhiteNightSimpleAdvent,
  whiteNightSimpleAdventDurationMs,
} from './WhiteNightAdvent.js';

/**
 * WhiteNight 正式阶段开始后，新阶段 Trumpet 以正常音量完整播放的时长（毫秒）。
 *
 * 第二阶段 BGM 的 100% 可听窗口：结算后先从 0 秒起完整播放该时长，之后才淡出到
 * 后台 ducked hold。该值与 Simple Advent 轮盘的视觉时长
 * （`whiteNightSimpleAdventDurationMs`）相互独立，按听感单独调节。
 */
export const whiteNightStageMusicAudibleMs = 2000;

/** WhiteNight Trumpet 演出阶段：Prelude / 100% 可听窗口 / 后台 ducked hold。 */
export const whiteNightTrumpetPhases = Object.freeze([
  'prelude',
  'audible',
  'held',
]);

/** 白夜专用媒体路径。 */
export const whiteNightSoundPaths = Object.freeze({
  bell: 'Resources/sounds/creature/deathangel/Lucifer_Bell0.ogg',
  church: 'Resources/sounds/creature/deathangel/Lucifer_standbg0.ogg',
});

/** Dead_23.anim 的真实 Animation Event 时间（秒）。 */
export const whiteNightDeathSounds = Object.freeze([
  {
    at: 3.1667,
    path: 'Resources/sounds/creature/whitenight/WhiteNight_Dead1.ogg',
  },
  {
    at: 4.2667,
    path: 'Resources/sounds/creature/whitenight/WhiteNight_Dead2.ogg',
  },
  {
    at: 4.8,
    path: 'Resources/sounds/creature/whitenight/WhiteNight_Dead3.ogg',
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

/**
 * Dead 视频的九宫格切片比例。
 *
 * 前 4.1 秒的白夜本体像素始终位于源画面的 23.2%～74.1% 范围内，因此保留中间
 * 20%～80% 不变，只延展没有本体的外围光效。这样既不会缩放白夜本体，也能让被
 * 586×584 导出画布截断的横、竖光柱继续延伸到 viewport 边缘。
 */
export const whiteNightConfessionViewportSlice = Object.freeze({
  end: 0.8,
  start: 0.2,
});

/**
 * 计算 Dead 视频九宫格映射，保持中心动画比例并把外围光效延展到 viewport。
 *
 * @param {number} viewportWidth viewport 宽度。
 * @param {number} viewportHeight viewport 高度。
 * @param {number} sourceWidth Dead 视频宽度。
 * @param {number} sourceHeight Dead 视频高度。
 * @return {{sourceX: number[], sourceY: number[], targetX: number[], targetY: number[]}|undefined} 九宫格源坐标和目标坐标。
 */
export function whiteNightConfessionViewportLayout(
    viewportWidth,
    viewportHeight,
    sourceWidth,
    sourceHeight,
) {
  if (
    ![viewportWidth, viewportHeight, sourceWidth, sourceHeight]
        .every((value) => Number.isFinite(value) && value > 0)
  ) {
    return undefined;
  }
  const scale = Math.min(
      Math.min(viewportWidth * 0.88, 980) / sourceWidth,
      Math.min(viewportHeight * 0.88, 980) / sourceHeight,
  );
  const logicalWidth = sourceWidth * scale;
  const logicalHeight = sourceHeight * scale;
  const left = (viewportWidth - logicalWidth) / 2;
  const top = (viewportHeight - logicalHeight) / 2;
  const {start, end} = whiteNightConfessionViewportSlice;
  return {
    sourceX: [0, sourceWidth * start, sourceWidth * end, sourceWidth],
    sourceY: [0, sourceHeight * start, sourceHeight * end, sourceHeight],
    targetX: [
      0,
      left + logicalWidth * start,
      left + logicalWidth * end,
      viewportWidth,
    ],
    targetY: [
      0,
      top + logicalHeight * start,
      top + logicalHeight * end,
      viewportHeight,
    ],
  };
}

/**
 * 把 Dead 视频逐帧绘制为 viewport 九宫格。
 *
 * 视频中间 60% 按原比例逐像素绘制；四周只延展源画面已经被裁断的光效末端。
 * Canvas 不可用时返回 undefined，由调用方退回原始居中视频。
 *
 * @param {HTMLVideoElement} video Dead 视频节点。
 * @param {HTMLCanvasElement} canvas 全屏输出画布。
 * @return {{dispose: Function, draw: Function, start: Function}|undefined} 绘制控制器。
 */
export function createWhiteNightConfessionViewportRenderer(video, canvas) {
  const context = canvas.getContext?.('2d', {alpha: true});
  if (!context) return undefined;
  let animationFrame;
  let disposed = false;
  const draw = () => {
    const width = Math.max(0, Math.round(
        canvas.clientWidth || globalThis.innerWidth || 0,
    ));
    const height = Math.max(0, Math.round(
        canvas.clientHeight || globalThis.innerHeight || 0,
    ));
    const layout = whiteNightConfessionViewportLayout(
        width,
        height,
        video.videoWidth,
        video.videoHeight,
    );
    if (!layout || video.readyState < 2) return;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        const sourceX = layout.sourceX[column];
        const sourceY = layout.sourceY[row];
        const sourceWidth = layout.sourceX[column + 1] - sourceX;
        const sourceHeight = layout.sourceY[row + 1] - sourceY;
        const targetX = Math.round(layout.targetX[column]);
        const targetY = Math.round(layout.targetY[row]);
        const targetWidth = Math.round(layout.targetX[column + 1]) - targetX;
        const targetHeight = Math.round(layout.targetY[row + 1]) - targetY;
        context.drawImage(
            video,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            targetX,
            targetY,
            targetWidth,
            targetHeight,
        );
      }
    }
  };
  const start = () => {
    if (disposed || animationFrame !== undefined) return;
    const tick = () => {
      animationFrame = undefined;
      draw();
      if (!video.paused && !video.ended) start();
    };
    animationFrame = globalThis.requestAnimationFrame?.(tick);
  };
  return {
    dispose: () => {
      disposed = true;
      if (animationFrame !== undefined) {
        globalThis.cancelAnimationFrame?.(animationFrame);
        animationFrame = undefined;
      }
    },
    draw,
    start,
  };
}

/** 白夜允许的入口以及各入口是否播放进入钟声和使徒完成演出。 */
const whiteNightEntryBehaviors = Object.freeze({
  'apostles-replay': Object.freeze({
    playEntryBell: true,
    usesSimpleAdventPrelude: true,
  }),
  'direct-submission': Object.freeze({
    usesSimpleAdventPrelude: true,
    playEntryBell: true,
    settlesDirectDanger: true,
  }),
  'plague-doctor-transformation': Object.freeze({
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
  const ray = document.createElement('span');
  ray.className = 'lobotomy-corp-white-night-confess-ray';
  ray.dataset.asset = texture;
  ray.setAttribute('aria-hidden', 'true');
  ray.style.setProperty(
      '--lobotomy-corp-ray-texture',
      `url("${texture}")`,
  );
  ray.style.setProperty(
      '--lobotomy-corp-ray-color',
      `${(color.red / exposure * 100).toFixed(6)}% ${
          (color.green / exposure * 100).toFixed(6)
      }% ${(color.blue / exposure * 100).toFixed(6)}%`,
  );
  ray.style.setProperty(
      '--lobotomy-corp-ray-delay',
      `${index / source.emissionRate}s`,
  );
  ray.style.setProperty(
      '--lobotomy-corp-ray-duration',
      `${source.initial.lifetimeSeconds}s`,
  );
  ray.style.setProperty(
      '--lobotomy-corp-ray-left',
      `calc(50% + ${worldX * worldViewportHeight}vh)`,
  );
  ray.style.setProperty(
      '--lobotomy-corp-ray-top',
      `calc(50% - ${worldY * worldViewportHeight}vh)`,
  );
  ray.style.setProperty(
      '--lobotomy-corp-ray-width',
      `${
          source.initial.sizeX * source.renderer.lengthScale * worldViewportHeight
      }vh`,
  );
  ray.style.setProperty(
      '--lobotomy-corp-ray-height',
      `${source.initial.sizeY * worldViewportHeight}vh`,
  );
  ray.style.setProperty(
      '--lobotomy-corp-ray-travel-y-full',
      `${
          source.initial.speed * source.initial.lifetimeSeconds *
          source.sizeOverLifetime.yFullAt * worldViewportHeight
      }vh`,
  );
  ray.style.setProperty(
      '--lobotomy-corp-ray-travel-x-full',
      `${
          source.initial.speed * source.initial.lifetimeSeconds *
          source.sizeOverLifetime.xFullAt * worldViewportHeight
      }vh`,
  );
  ray.style.setProperty(
      '--lobotomy-corp-ray-travel-end',
      `${
          source.initial.speed * source.initial.lifetimeSeconds *
          worldViewportHeight
      }vh`,
  );
  return ray;
}

/**
 * 宿主在最小共享 API 之外可选提供的白夜扩展能力。
 *
 * 这些能力不参与白夜的持久化与状态机：宿主未提供时白夜按缺省演出继续运行。
 *
 * @typedef {object} WhiteNightHostCapabilities
 * @property {() => string[]} [apostleNames] Simple Advent 12 个名字槽位的使徒名单。
 * @property {(messageKey: string) => string} [blockMessage] 阻挡提示文本。
 * @property {(source: string) => void} [playApostlesCompletion] 使徒完成演出。
 */

/**
 * 判断已解析的白夜存档是否带有可用的进度字段。
 *
 * 字段缺失表示存档来自不产出该阶段的入口或更早版本，按兼容处理；字段存在但取值非法
 * （非有限数、负数或未知阶段）时整份存档作废，避免损坏的进度进入运行期。
 *
 * @param {Record<string, any>} saved 已解析的白夜存档。
 * @return {boolean} 已存在的字段全部合法时返回 true。
 */
function isValidWhiteNightState(saved) {
  return (
      (saved.preludeEndsAt === undefined ||
          (Number.isFinite(saved.preludeEndsAt) && saved.preludeEndsAt >= 0)) &&
      (saved.churchPosition === undefined ||
          (Number.isFinite(saved.churchPosition) && saved.churchPosition >= 0)) &&
      (saved.trumpetPhase === undefined ||
          whiteNightTrumpetPhases.includes(saved.trumpetPhase)) &&
      (saved.trumpetDeadline === undefined ||
          (Number.isFinite(saved.trumpetDeadline) && saved.trumpetDeadline >= 0)) &&
      (saved.trumpetFadeMs === undefined ||
          (Number.isFinite(saved.trumpetFadeMs) && saved.trumpetFadeMs >= 0))
  );
}

/**
 * 创建白夜特殊事件控制器。
 *
 * @param {object} shared lobotomy-corp.js 提供的最小共享 API。
 * @return {object} 白夜事件 API。
 */
export function createWhiteNightEvent(shared) {
  let state;

  /** 宿主可选提供的白夜扩展能力；缺省时白夜只依赖最小共享 API。 */
  const hostCapabilities = /** @type {WhiteNightHostCapabilities} */ (shared);

  /**
   * 判断当前特殊事件是否为白夜。
   *
   * @return {boolean} 白夜正在运行时返回 true。
   */
  const hasEventState = () => state?.id === 'white-night';

  /**
   * 判断白夜是否已经进入会接管网站的正式阶段。
   *
   * Prelude 会持久化事件状态，但不启用赎罪、导航阻断或无限冻结 Danger。
   *
   * @return {boolean} 白夜 active 或 ending 阶段时返回 true。
   */
  const isActive = () =>
      hasEventState() && (state.phase === 'active' || state.phase === 'ending');

  /**
   * 释放一段事件媒体。
   *
   * @param {HTMLMediaElement|undefined} media 要释放的媒体。
   */
  const releaseMedia = (media) => {
    media?.pause?.();
    media?.removeAttribute?.('src');
    media?.load?.();
  };

  /**
   * 写入白夜的可恢复状态，并保留教堂音乐的真实播放进度。
   *
   * Trumpet 演出的阶段状态（phase / 绝对截止时间 / 淡出时长）与 Danger settlement
   * 分开持久化：刷新后既不会重复结算 +44 / +98，也不会重播或跳过阶段 BGM 时间线。
   */
  const persist = () => {
    if (!hasEventState()) return;
    const serialized = JSON.stringify({
      id: 'white-night',
      lockLocation: state.lockLocation,
      pendingNavigationViolation: state.pendingNavigationViolation === true,
      pendingRecoveryBell: state.pendingRecoveryBell === true,
      phase: state.phase,
      ...(state.preludeEndsAt === undefined
          ? {}
          : {preludeEndsAt: state.preludeEndsAt}),
      source: state.source,
      churchPosition: currentChurchPosition(),
      trumpetFadeMs: state.trumpetFadeMs,
      ...(state.trumpetDeadline === undefined
          ? {}
          : {trumpetDeadline: state.trumpetDeadline}),
      trumpetPhase: state.trumpetPhase,
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
   * 存档字段非法时按损坏存档处理：清除持久化并返回 undefined。
   *
   * @return {{id: string, lockLocation?: string, pendingNavigationViolation?: boolean, pendingRecoveryBell?: boolean, phase?: string, preludeEndsAt?: number, source?: string, churchPosition?: number, trumpetDeadline?: number, trumpetFadeMs?: number, trumpetPhase?: string}|undefined} 已保存状态。
   */
  const persisted = () => {
    const serialized = shared.storages().map((storage) =>
        storage.getItem(shared.storageKey)
    ).find(Boolean);
    if (!serialized) return undefined;
    try {
      const saved = JSON.parse(serialized);
      if (saved?.id !== 'white-night') return undefined;
      if (!isValidWhiteNightState(saved)) {
        clearPersisted();
        return undefined;
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
      shared.normalize(value) === 'o-03-03' ||
      shared.confessionAliases().has(shared.normalize(value));

  /**
   * 创建或采用白夜音频，并按需恢复播放进度。
   *
   * @param {string} soundPath 相对于 Assets 的路径。
   * @param {object|undefined} preparedMedia 用户手势预热的媒体。
   * @param {{loop?: boolean, onBlocked?: (() => void)|undefined, onPlayed?: (() => void)|undefined, resumePosition?: number}} [options] 播放选项：是否循环、自动播放被拒绝与播放开始后的处理、需要恢复的播放进度（秒）。
   * @return {HTMLAudioElement|undefined} 已播放的音频。
   */
  const playAudio = (soundPath, preparedMedia, options = {}) => {
    const {loop = false, onBlocked, onPlayed, resumePosition = 0} = options;
    const audio = preparedMedia?.consumeWhiteNight?.(soundPath) ??
        (typeof globalThis.Audio === 'function'
            ? new Audio(`${shared.assetRoot}/${soundPath}`)
            : undefined);
    if (!audio) return undefined;
    audio.hidden = true;
    audio.loop = loop;
    audio.muted = false;
    audio.preload = 'auto';
    const position = Number.isFinite(resumePosition) && resumePosition >= 0
        ? resumePosition
        : 0;
    audio.currentTime = position;
    audio.setAttribute?.('aria-hidden', 'true');
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
   * 在媒体尝试播放前重新定位教堂音乐，避免失败的 autoplay 重置播放位置。
   *
   * @return {number|undefined} 本次实际写入的恢复位置。
   */
  const seekPendingChurchResumePosition = () => {
    if (!state || state.pendingChurchResumePosition === undefined) {
      return undefined;
    }
    const position = normalizedChurchPosition(
        state.pendingChurchResumePosition,
    );
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
   * @param {object|undefined} [preparedMedia] 用户手势预热的媒体。
   * @param {boolean} [recovery] 是否在自动播放被拒绝时保留恢复钟声标记。
   * @return {HTMLAudioElement|undefined} 已创建的钟声音频。
   */
  const playBell = (preparedMedia, recovery = false) => {
    const bell = playAudio(whiteNightSoundPaths.bell, preparedMedia, {
      onBlocked: recovery
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
                  'pointerdown',
                  state.resumeAudioOnInteraction,
                  true,
              );
              globalThis.document?.addEventListener?.(
                  'keydown',
                  state.resumeAudioOnInteraction,
                  true,
              );
              state.audioRecoveryListenerAttached = true;
            }
          }
          : undefined,
    });
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
    bell.addEventListener?.('ended', releaseBell, {once: true});
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
    document.querySelectorAll?.('.lobotomy-corp-white-night-message').forEach((
        node,
    ) => node.remove());
    const overlay = document.createElement('section');
    const filter = document.createElement('img');
    const text = document.createElement('p');
    overlay.className = 'lobotomy-corp-white-night-message';
    filter.className = 'lobotomy-corp-white-night-block-filter';
    filter.src =
        `${shared.assetRoot}/Resources/sprites/creaturesprite/deathangel/clock/GlobalShader.png`;
    filter.alt = '';
    filter.setAttribute('aria-hidden', 'true');
    text.textContent = hostCapabilities.blockMessage?.(messageKey) ??
        shared.messages()?.[messageKey] ?? '';
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
    const button = document?.querySelector?.('[data-account-save-button]');
    if (!button) {
      if (!active) {
        document?.querySelectorAll?.('.lobotomy-corp-confession-work-icon')
            .forEach((node) => node.remove?.());
      }
      return;
    }
    const host = button.parentElement;
    const icon = host?.querySelector?.('.lobotomy-corp-confession-work-icon');
    if (active) {
      button.dataset.lobotomyCorpOriginalAriaLabel ??=
          button.getAttribute('aria-label') ?? '';
      button.dataset.lobotomyCorpOriginalText ??= button.textContent ?? '';
      const label = shared.messages()?.['oneSin.specialWork.confession'] ??
          button.dataset.lobotomyCorpOriginalText;
      button.textContent = label;
      button.setAttribute('aria-label', label);
      if (!icon && host && globalThis.document?.createElement) {
        const image = globalThis.document.createElement('img');
        image.alt = '';
        image.className = 'lobotomy-corp-confession-work-icon';
        image.src = `${shared.assetRoot}/Sprite/Work_Confess.png`;
        image.setAttribute('aria-hidden', 'true');
        host.insertBefore(image, button);
      }
    } else if (button.dataset.lobotomyCorpOriginalAriaLabel !== undefined) {
      button.setAttribute(
          'aria-label',
          button.dataset.lobotomyCorpOriginalAriaLabel,
      );
      button.textContent = button.dataset.lobotomyCorpOriginalText ??
          button.textContent;
      delete button.dataset.lobotomyCorpOriginalAriaLabel;
      delete button.dataset.lobotomyCorpOriginalText;
      icon?.remove?.();
      document?.querySelectorAll?.('.lobotomy-corp-confession-work-icon')
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
   * 读取本次阶段演出使用的 Trumpet 淡出时长。
   *
   * 淡出时长由共享 Alert 层提供（`lobotomyCorpSpecialEventMusicFadeOutMs`），这里
   * 只记录该数值用于刷新恢复；宿主未提供时退化为 0，阶段演出随即进入后台 hold。
   *
   * @return {number} 非负毫秒数。
   */
  const specialEventMusicFadeOutMs = () => {
    const value = shared.specialEventMusicFadeOutMs;
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };

  /**
   * 令共享 Alert 层立即把当前 Trumpet 压入后台 ducked hold（低于正常音量）。
   *
   * @param {object} current 当前事件状态。
   */
  const holdTrumpetForSpecialEvent = (current) => {
    current.trumpetPhase = 'held';
    current.trumpetDeadline = undefined;
    persist();
    shared.holdAlertMusic?.();
  };

  /**
   * 让某个阶段实际结算结果对应的 Trumpet 进入可听窗口。
   *
   * 曲目取自这次结算真实产生的警报（`shared.stageMusicAlert()`）；共享 Alert 层负责
   * 「阶段演出允许相对上一条阶段曲目降级、但不打断更高等级 Direct one-shot」的仲裁。
   *
   * @param {object} current 当前事件状态。
   * @param {{assetDirectory: string, level: number, soundPath: string}|undefined} stageAlert 本阶段结算对应的警报。
   * @param {{audibleMs: number, thenHold: boolean}} options 可听窗口与是否随后淡出到后台 hold。
   */
  const beginStageTrumpetMusic = (current, stageAlert, options) => {
    if (!stageAlert) {
      holdTrumpetForSpecialEvent(current);
      return;
    }
    const audibleMs = Math.max(0, options.audibleMs);
    current.trumpetPhase = 'audible';
    current.trumpetDeadline = Date.now() + audibleMs;
    current.trumpetFadeMs = specialEventMusicFadeOutMs();
    persist();
    shared.setSpecialEventStageAlertMusic?.(stageAlert, {
      audibleMs,
      thenHold: options.thenHold,
    });
  };

  /**
   * 页面恢复时按已保存的阶段时间线重建 Trumpet。
   *
   * 覆盖四种可恢复状态：可听窗口内（只补剩余时长，沿用已恢复的同一实例与进度）、
   * 淡出中途（按保存进度重建 1 → duck 目标音量的起始音量）、已 hold（继续保持 ducked 后台推进）、
   * Prelude（由 Prelude 分支恢复，不走这里）。
   *
   * @param {object} current 当前事件状态。
   * @return {boolean} 已由恢复逻辑接管 Trumpet 时返回 true。
   */
  const restoreTrumpetTimeline = (current) => {
    const savedPhase = current.trumpetPhase;
    if (savedPhase === 'prelude') return false;
    const deadline = current.trumpetDeadline;
    const fadeMs = Number.isFinite(current.trumpetFadeMs)
        ? Math.max(0, current.trumpetFadeMs)
        : specialEventMusicFadeOutMs();
    const stageAlert = shared.stageMusicAlert?.();
    if (savedPhase === 'audible' && Number.isFinite(deadline) && stageAlert) {
      const now = Date.now();
      if (now < deadline) {
        current.trumpetFadeMs = fadeMs;
        persist();
        shared.setSpecialEventStageAlertMusic?.(stageAlert, {
          audibleMs: deadline - now,
          thenHold: true,
        });
        return true;
      }
      const fadeRemaining = deadline + fadeMs - now;
      if (fadeMs > 0 && fadeRemaining > 0) {
        current.trumpetFadeMs = fadeMs;
        persist();
        // 淡出从 1 插值到 duck 目标音量；fadeRemaining / fadeMs 只是剩余比例，
        // 起始音量由共享层的插值公式换算。
        const startVolume = shared.alertMusicFadeOutStartVolume?.(
            fadeRemaining / fadeMs,
        ) ?? Math.max(0, Math.min(1, fadeRemaining / fadeMs));
        shared.fadeAlertMusicToSpecialEventHold?.(fadeRemaining, {
          startVolume,
        });
        return true;
      }
    }
    holdTrumpetForSpecialEvent(current);
    return true;
  };

  /**
   * 按当前入口与已保存阶段应用 WhiteNight 的 Trumpet 演出策略。
   *
   * 规则：
   * - 经过 Simple Advent Prelude 的入口在正式阶段开始时先进入可听窗口，让第二阶段
   *   结算产生的 Trumpet 以正常音量完整播放；
   * - 阶段曲目来自这次结算实际产生的警报；
   * - 不经过 Prelude 的入口（例如 plague-doctor-transformation）直接进入 hold。
   *
   * @param {object} options 入口配置。
   * @param {object} behavior 当前入口的演出策略。
   */
  const applyTrumpetTimeline = (options, behavior) => {
    const current = state;
    if (!current) return;
    if (options.restore === true && restoreTrumpetTimeline(current)) return;
    if (behavior.usesSimpleAdventPrelude !== true) {
      holdTrumpetForSpecialEvent(current);
      return;
    }
    beginStageTrumpetMusic(current, shared.stageMusicAlert?.(), {
      audibleMs: whiteNightStageMusicAudibleMs,
      thenHold: true,
    });
  };

  /**
   * 启动已经进入 active 的白夜场景、音乐和网站限制。
   *
   * @param {object} options 白夜入口配置。
   * @param {object} behavior 当前入口的演出策略。
   * @return {boolean} 场景成功建立时返回 true。
   */
  const activateWhiteNight = (options, behavior) => {
    const document = globalThis.document;
    shared.pauseDangerDecay();
    shared.ensureCoordinator();
    if (!shared.getAlert()) shared.mountRestartPanel();
    // WhiteNight active 不等于立即压低音量：经过 Prelude 的入口要先把阶段 BGM 完整播完。
    applyTrumpetTimeline(options, behavior);

    const violate = (key, bell = true) => {
      if (!isActive()) return;
      if (bell) playBell();
      showBlockMessage(key);
    };
    let navigationMessageIndex = 0;
    const navigationViolation = () => {
      const key = navigationMessageIndex++ % 2 === 0
          ? 'whiteNight.blockNavigation.denyPresence'
          : 'whiteNight.blockNavigation.unknownStory';
      violate(key);
    };
    const blockNavigation = (event) => {
      const target = event.target;
      if (target?.closest?.('.lobotomy-corp-top-panel-action-button')) return;
      if (target?.closest?.('a[href]')) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        navigationViolation();
      }
    };
    const blockRefresh = (event) => {
      if (
          event.key === 'F5' ||
          ((event.ctrlKey || event.metaKey) && event.key?.toLowerCase?.() === 'r')
      ) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        violate('whiteNight.blockTime');
      }
    };
    const pollingValues = new Map();
    document?.querySelectorAll?.(
        '[data-polling-interval-value], [data-polling-interval-unit]',
    ).forEach((input) => pollingValues.set(input, input.value));
    const blockPolling = (event) => {
      const input = event.target?.closest?.(
          '[data-polling-interval-value], [data-polling-interval-unit]',
      );
      if (!input) return;
      if (!pollingValues.has(input)) pollingValues.set(input, input.value);
      input.value = pollingValues.get(input);
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      violate('whiteNight.blockTime');
    };
    const blockFormNavigation = (event) => {
      const form = event.target;
      if (form?.matches?.('[data-account-form]')) return;
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      let isLogout;
      try {
        isLogout = new URL(
            form?.getAttribute?.('action') ?? '',
            globalThis.location?.href ?? 'http://localhost/',
        ).pathname === '/logout';
      } catch {
        isLogout = false;
      }
      if (isLogout) violate('whiteNight.blockExit');
      else navigationViolation();
    };
    const syncConfession = (event) => {
      const input = event.target?.closest?.(
          '[data-account-display-name-input]',
      );
      if (input) syncConfessionButton(matchesConfession(input.value));
    };
    const resetConfession = (event) => {
      if (event.target?.closest?.('[data-account-cancel-button]')) {
        syncConfessionButton(false);
      }
    };
    const handlePopstate = () => {
      navigationViolation();
      const currentLocation = `${globalThis.location?.pathname ?? ''}${
          globalThis.location?.search ?? ''
      }`;
      if (state?.lockLocation && currentLocation !== state.lockLocation) {
        state.pendingNavigationViolation = true;
        persist();
        globalThis.location?.replace?.(state.lockLocation);
      }
    };
    addListener(document, 'click', blockNavigation, true);
    addListener(document, 'submit', blockFormNavigation, true);
    addListener(document, 'keydown', blockRefresh, true);
    addListener(document, 'input', blockPolling, true);
    addListener(document, 'change', blockPolling, true);
    addListener(document, 'input', syncConfession, true);
    addListener(document, 'click', resetConfession, true);
    addListener(globalThis, 'popstate', handlePopstate);

    if (document?.createElement && document.body) {
      const entity = document.createElement('section');
      const video = document.createElement('video');
      entity.className = 'lobotomy-corp-white-night-entity';
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.src =
          `${shared.assetRoot}/Resources/sprites/creaturesprite/deathangel/WhiteNight_Escape_Idle.webm`;
      video.setAttribute('aria-hidden', 'true');
      entity.append(video);
      document.body.append(entity);
      state.entity = entity;
      state.idleVideo = video;
    }
    state.churchAudio = playAudio(
        whiteNightSoundPaths.church,
        options.preparedMedia,
        {
          loop: true,
          onBlocked: () => {
            if (state) state.churchPlaybackPending = true;
          },
          // 播放成功后由 confirmChurchResumePosition 校准并结束恢复流程。
          onPlayed: confirmChurchResumePosition,
          resumePosition: state.churchPosition,
        },
    );
    addListener(state.churchAudio, 'timeupdate', persist);
    addListener(
        state.churchAudio,
        'loadedmetadata',
        seekPendingChurchResumePosition,
    );
    addListener(
        state.churchAudio,
        'playing',
        confirmChurchResumePosition,
    );
    addListener(globalThis, 'pagehide', persist);
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
          'pointerdown',
          current.resumeAudioOnInteraction,
          true,
      );
      document?.removeEventListener?.(
          'keydown',
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
    addListener(document, 'pointerdown', state.resumeAudioOnInteraction, true);
    addListener(document, 'keydown', state.resumeAudioOnInteraction, true);
    state.audioRecoveryListenerAttached = true;

    if (!options.restore && behavior.playApostlesCompletion) {
      hostCapabilities.playApostlesCompletion?.(options.source);
    }
    if (!options.restore && behavior.playEntryBell) {
      playBell(options.preparedMedia);
    }
    options.preparedMedia?.dispose?.();
    const displayNameInput = document?.querySelector?.(
        '[data-account-display-name-input]',
    );
    if (displayNameInput) {
      syncConfessionButton(matchesConfession(displayNameInput.value));
    }
    if (
        options.restore && !options.resumeEnding && shared.isReload() &&
        !options.pendingNavigationViolation
    ) {
      showBlockMessage('whiteNight.blockTime');
      playBell(undefined, true);
    }
    return true;
  };

  /**
   * 启动白夜；direct-submission 先进入四秒 Simple Advent Prelude。
   *
   * @param {{churchPosition?: number, lockLocation?: string, pendingNavigationViolation?: boolean, pendingRecoveryBell?: boolean, preparedMedia?: object, preludeEndsAt?: number, restore?: boolean, resumeEnding?: boolean, skipPrelude?: boolean, source: 'apostles-replay'|'direct-submission'|'plague-doctor-transformation', trumpetDeadline?: number, trumpetFadeMs?: number, trumpetPhase?: string}} options 事件入口配置。
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
    const isPrelude = behavior.usesSimpleAdventPrelude === true &&
        options.skipPrelude !== true;
    const preludeEndsAt = Number.isFinite(options.preludeEndsAt)
        ? options.preludeEndsAt
        : Date.now() + whiteNightSimpleAdventDurationMs;
    state = {
      bellAudios: new Set(),
      id: 'white-night',
      listeners: [],
      lockLocation: options.lockLocation ??
          `${globalThis.location?.pathname ?? '/settings'}${
              globalThis.location?.search ?? ''
          }`,
      phase: isPrelude ? 'prelude' : 'active',
      ...(isPrelude ? {preludeEndsAt} : {}),
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
      // Trumpet 演出时间线；与 Danger settlement 分开持久化。恢复时沿用存档阶段。
      trumpetFadeMs: Number.isFinite(options.trumpetFadeMs)
          ? Math.max(0, options.trumpetFadeMs)
          : specialEventMusicFadeOutMs(),
      ...(Number.isFinite(options.trumpetDeadline)
          ? {trumpetDeadline: options.trumpetDeadline}
          : {}),
      trumpetPhase: typeof options.trumpetPhase === 'string' &&
      whiteNightTrumpetPhases.includes(options.trumpetPhase)
          ? options.trumpetPhase
          : isPrelude
              ? 'prelude'
              : 'held',
    };
    persist();
    if (!isPrelude) return activateWhiteNight(options, behavior);

    /** 在四秒逻辑边界结算第二笔危急值，并在 Hide_21 继续时启动白夜。 */
    const activateFromPrelude = () => {
      const current = state;
      if (!current || current.phase !== 'prelude') return;
      // Simple Advent 轮盘期间 HUD pulse、BGM 与 replay 都照常运行，这里无需改动 Alert 状态；
      // 第二阶段的 Trumpet 由下面的阶段时间线按真实结算结果开始。
      // Day 层的 settlement marker 令刷新、边界帧和过期回调均无法重复结算 +98。
      if (behavior.settlesDirectDanger) {
        shared.settleWhiteNightActive?.();
      }
      current.phase = 'active';
      delete current.preludeEndsAt;
      persist();
      const activeOptions = {
        ...options,
        preparedMedia: current.preparedMedia,
      };
      current.preparedMedia = undefined;
      activateWhiteNight(activeOptions, behavior);
    };
    const remainingMs = preludeEndsAt - Date.now();
    state.preparedMedia = options.preparedMedia;
    // Simple Advent 轮盘只负责视觉与 4 秒 settlement 边界：第一阶段 BGM 由 +44 结算
    // 正常产生的 Danger Alert 播放，HUD pulse 与 Alert lifecycle 全程保持运行，
    // 本模块不暂停 Alert，也不接管这一阶段的音乐。
    if (remainingMs <= 0) {
      activateFromPrelude();
      return true;
    }
    if (globalThis.document?.body && globalThis.document?.createElement) {
      state.advent = createWhiteNightSimpleAdvent({
        assetRoot: shared.assetRoot,
        initialElapsedMs: whiteNightSimpleAdventDurationMs - remainingMs,
        names: shared.apostleNames?.() ?? [],
        onAdventEnd: activateFromPrelude,
        // 刷新恢复只恢复视觉剩余时间，不重复播放进入钟声。
        playBell: options.restore
            ? undefined
            : () => playBell(options.preparedMedia),
      });
    } else {
      // 非 DOM 宿主仍需保持业务时序（例如账户脚本的最小测试环境）。
      state.timers.add(setTimeout(activateFromPrelude, remainingMs));
      if (!options.restore) playBell(options.preparedMedia);
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
    // Restart Day / 协调器中断取消 Advent 而不 finish，避免触发 +98。
    current.advent?.dispose?.();
    current.listeners.forEach(([target, type, listener, options]) =>
        target?.removeEventListener?.(type, listener, options)
    );
    current.entity?.remove?.();
    current.confessionEntity?.remove?.();
    current.particleLayer?.remove?.();
    current.confessionRenderer?.dispose?.();
    releaseMedia(current.churchAudio);
    current.bellAudios?.forEach(releaseMedia);
    current.deathAudios?.forEach(releaseMedia);
    releaseMedia(current.idleVideo);
    releaseMedia(current.confessionVideo);
    current.preparedDeathMedia?.dispose?.();
    globalThis.document?.querySelectorAll?.(
        '.lobotomy-corp-white-night-message',
    ).forEach((node) => node.remove());
    syncConfessionButton(false);
    shared.resumeDangerDecay();
    // Prelude 期间普通 Alert 全程照常运行，这里无需恢复任何播放状态。
    if (
        current.phase !== 'prelude' && restoreAlert && !current.alertMusicResumed
    ) {
      shared.resumeAlertMusic();
    }
    current.resolveConfession?.(confessionCompleted);
  };

  /**
   * 启动由 Confess/SuppressAnimator 与 WhiteNight Suppressed 共同构成的死亡演出。
   *
   * @param {object|undefined} [preparedMedia] 已在用户手势中预热的死亡 SFX。
   * @return {Promise<boolean>} 演出完成时返回 true。
   */
  const confess = (preparedMedia) => {
    if (!isActive() || state.phase === 'ending') {
      preparedMedia?.dispose?.();
      return Promise.resolve(false);
    }
    state.phase = 'ending';
    state.preparedDeathMedia = preparedMedia;
    persist();
    // 赎罪提交本身是用户手势；提前把 ducked 的 Trumpet 置于可播放状态，
    // 5.7 秒后的镇压点只需平滑恢复音量。
    shared.prepareAlertMusicForResume?.();
    syncConfessionButton(false);
    const current = state;
    const document = globalThis.document;
    const completion = new Promise((done) => current.resolveConfession = done);
    const complete = () => {
      if (state !== current) return;
      finish({confessionCompleted: true});
    };
    if (document?.createElement && document.body) {
      const entity = document.createElement('section');
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const particles = document.createElement('div');
      entity.className = 'lobotomy-corp-white-night-confession-entity';
      // WhiteNight_Confess_Dead.webm 的 alpha 已按浏览器合成语义重写为
      // max(覆盖度, 颜色峰值)，使「颜色 × alpha」等于 Unity 渲染结果的原始颜色，
      // additive 十字光柱（effect_line/effect_light）与收尾阶段才不会丢失亮度。
      video.className = 'lobotomy-corp-white-night-confession-video';
      video.autoplay = true;
      video.hidden = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('aria-hidden', 'true');
      canvas.className = 'lobotomy-corp-white-night-confession-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      const renderer = createWhiteNightConfessionViewportRenderer(
          video,
          canvas,
      );
      if (renderer) {
        addListener(video, 'loadeddata', renderer.start);
        addListener(video, 'play', renderer.start);
        addListener(video, 'seeked', renderer.draw);
        addListener(globalThis, 'resize', renderer.draw);
      } else {
        canvas.hidden = true;
        video.className +=
            ' lobotomy-corp-white-night-confession-video-fallback';
      }
      particles.className = 'lobotomy-corp-white-night-confess-particles';
      // ParticleSystem 使用 CFX3_RayStraight ADD.mat；浏览器直接加载其 _MainTex：CFX3_T_RayStraight.png。
      for (let index = 0; index < whiteNightConfessRayCount; index++) {
        particles.append(
            createWhiteNightConfessRay(document, shared.assetRoot, index),
        );
      }
      entity.append(video, canvas, particles);
      document.body.append(entity);
      state.confessionEntity = entity;
      state.confessionVideo = video;
      state.confessionRenderer = renderer;
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
        // display:none 的视频仅作为 Canvas 帧源，部分浏览器不会替它执行 autoplay。
        // 这里显式播放同一素材，不改变 Dead_23 的时间轴。
        const playAttempt = current.confessionVideo.play?.();
        playAttempt?.catch?.(() => {});
      }
      shared.resumeAlertMusic();
      current.alertMusicResumed = true;
      whiteNightDeathSounds.forEach(({at, path}) => {
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
    const location = `${globalThis.location?.pathname ?? ''}${
        globalThis.location?.search ?? ''
    }`;
    if (saved.lockLocation && location && location !== saved.lockLocation) {
      shared.storages().forEach((storage) =>
          storage.setItem(
              shared.storageKey,
              JSON.stringify({...saved, pendingNavigationViolation: true}),
          )
      );
      globalThis.location?.replace?.(saved.lockLocation);
      return true;
    }
    const source = whiteNightEntryBehaviors[saved.source]
        ? saved.source
        : 'direct-submission';
    const resumeEnding = saved.phase === 'ending';
    start({
      churchPosition: saved.churchPosition,
      lockLocation: saved.lockLocation,
      pendingNavigationViolation: saved.pendingNavigationViolation,
      pendingRecoveryBell: saved.pendingRecoveryBell,
      preludeEndsAt: saved.preludeEndsAt,
      restore: true,
      resumeEnding,
      skipPrelude: saved.phase !== 'prelude',
      source,
      // 恢复 Trumpet 演出时间线：可听窗口剩余时间 / 淡出进度 / 后台 hold。
      trumpetDeadline: saved.trumpetDeadline,
      trumpetFadeMs: saved.trumpetFadeMs,
      trumpetPhase: saved.trumpetPhase,
    });
    if (resumeEnding) {
      void confess();
      return true;
    }
    if (saved.pendingNavigationViolation) {
      if (state) state.pendingNavigationViolation = false;
      playBell(undefined, true);
      showBlockMessage('whiteNight.blockNavigation.denyPresence');
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
    hasEventState,
    isActive,
    matchesConfession,
    persisted,
    restore,
    soundPaths: whiteNightSoundPaths,
    start,
  });
}
