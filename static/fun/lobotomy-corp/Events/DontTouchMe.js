/**
 * @file 本文件提供《脑叶公司》“别碰我”的点击演出与假关服彩蛋。
 *
 * 演出链路来自 DontTouchMe 的 OnOpenWorkWindow()、OnOpenCollectionWindow() 与
 * ForceExitScene：前 4 次点击在三种演出里等概率取一个，10 秒内累计第 5 次点击改为
 * ExitStart() → ForceExitScene 的假关服。
 *
 * 前 4 次点击的三支分别是：
 * - KillAllWorkerStart()：随机 dead1 / dead2 音效 + touchKill（“all agent die”，
 *   800×450、85 帧）全屏序列，由 StartCustomEffect 拉满屏幕，因此网页同样按视口拉伸。
 * - PanicAllWorker()：panic 音效 + CameraMover.Recoil(1, 3f) 镜头后坐，没有全屏序列。
 * - SetAllQliphothCounter()：moodDown 音效 + touchWarning（“Mood down”，512×288、
 *   101 帧）全屏序列，对应原作里打开详细信息页面时的 WARNING 演出。
 *
 * 原作把“血液 / 抖屏”放在工作窗口、“WARNING”放在详细信息页面，但网页没有这两种
 * 窗口，所有别碰我彩蛋都绑在保存按钮上。网页没有员工，三支点击演出都只播放声音
 * 与画面；假关服同样不写入任何状态。显示名称的焦点由调用方维持，本模块从不改动焦点。
 */
// @ts-check

/** 关服视频相对《脑叶公司》Assets 根目录的路径。 */
export const dontTouchMeShutdownVideoPath =
  'MovieTexture/DontTouchMeGameShutdown.webm';

/** ExitStart() 播放的 shout 音效路径。 */
export const dontTouchMeShoutSoundPath =
  'Resources/sounds/creature/dont_touch_me/touch_shout.ogg';

/** ForceExitScene 的 AudioSource 播放的 touch_off 音效路径。 */
export const dontTouchMeShutdownSoundPath =
  'Resources/sounds/creature/dont_touch_me/touch_off.ogg';

/** DontTouchMe.ExitStart() 的 exitDelay（4 秒）换算出的毫秒数。 */
export const dontTouchMeExitDelayMs = 4000;

/** 假关服所需的连续点击数，对应原作的 isolateClickMax。 */
export const dontTouchMeShutdownClickCount = 5;

/** 连续点击的滑动窗口毫秒数，对应原作 AddExitClickCount() 的 10 秒。 */
export const dontTouchMeClickWindowMs = 10000;

/** “员工死亡”序列：原作把它拉满整个屏幕。 */
export const dontTouchMeKillEffect = Object.freeze({
  extraClassName: 'lobotomy-corp-dont-touch-me-effect-kill',
  id: 'kill',
  soundPaths: Object.freeze([
    'Resources/sounds/creature/dont_touch_me/touch_dead1.ogg',
    'Resources/sounds/creature/dont_touch_me/touch_dead2.ogg',
  ]),
  videoPath: 'Resources/sprites/effect/touchkill.webm',
});

/**
 * 点击演出分支：全体员工恐慌。
 *
 * 这一支没有全屏序列，只有 panic 音效与镜头后坐，因此序列字段留空。
 */
export const dontTouchMePanicEffect = Object.freeze({
  extraClassName: '',
  id: 'panic',
  soundPaths: Object.freeze([]),
  videoPath: '',
});

/** 点击演出分支：异想体全部出逃（WARNING 序列 + moodDown 音效）。 */
export const dontTouchMeEscapeEffect = Object.freeze({
  extraClassName: 'lobotomy-corp-dont-touch-me-effect-escape',
  id: 'escape',
  soundPaths: Object.freeze([
    'Resources/sounds/creature/dont_touch_me/touch_moodDown.ogg',
  ]),
  videoPath: 'Resources/sprites/effect/touchwarning.webm',
});

/**
 * 点击演出的三个分支。
 *
 * 原作把“血液 / 抖屏”放在工作窗口、“WARNING”放在详细信息页面，但网页没有这两种
 * 窗口，所有别碰我彩蛋都绑在保存按钮上，因此每次点击在这三种演出里等概率取一个。
 */
export const dontTouchMeClickEffects = Object.freeze([
  dontTouchMeKillEffect,
  dontTouchMePanicEffect,
  dontTouchMeEscapeEffect,
]);

/** PanicAllWorker() 播放的 panic 音效路径。 */
export const dontTouchMePanicSoundPath =
  'Resources/sounds/creature/dont_touch_me/touch_panic.ogg';

/** PanicAllWorker() 的镜头后坐参数，对应 CameraMover.Recoil(1, 3f)。 */
export const dontTouchMePanicRecoil = Object.freeze({level: 1, maxTime: 3});


/** 关服覆盖层节点类名。 */
export const dontTouchMeOverlayClassName =
  'lobotomy-corp-dont-touch-me-shutdown';

/** 点击演出覆盖层的公共类名。 */
export const dontTouchMeEffectClassName = 'lobotomy-corp-dont-touch-me-effect';

/** 关服视频节点类名；测试按该类名定位视频并派发 ended。 */
export const dontTouchMeVideoClassName =
  'lobotomy-corp-dont-touch-me-shutdown-video';

/** 点击演出视频节点类名。 */
export const dontTouchMeEffectVideoClassName =
  'lobotomy-corp-dont-touch-me-effect-video';

/**
 * Main.unity 中 CameraMover 的镜头后坐参数。
 *
 * scale 与 recoilCount 取自场景里的 CameraMover 组件，defaultOrtho 取自同一组件的
 * DefaultOrtho，timeFactor 是 CameraMover.Recoil(level, maxTime) 里 maxTime * 3f 的系数。
 */
export const dontTouchMeCameraRecoil = Object.freeze({
  defaultOrtho: 8.5,
  recoilCount: 2,
  scale: 3,
  timeFactor: 3,
});

/** RecoilEffect.MakeRecoilArrow 的 8 个方向，按 Unity 世界坐标记。 */
const dontTouchMeRecoilDirections = Object.freeze([
  Object.freeze({x: -1, y: 1}),
  Object.freeze({x: 0, y: 1}),
  Object.freeze({x: 1, y: 1}),
  Object.freeze({x: 1, y: 0}),
  Object.freeze({x: 1, y: -1}),
  Object.freeze({x: 0, y: -1}),
  Object.freeze({x: -1, y: -1}),
  Object.freeze({x: -1, y: 0}),
]);

/**
 * 抖动期间必须保持静止的固定层选择器。
 *
 * 页面整体位移时会连带固定定位的警报 HUD 与“重新开始这一天”面板，这两者属于
 * 视口 UI，不参与镜头后坐，因此需要用反向位移抵消。
 */
const dontTouchMeStaticOverlaySelectors = Object.freeze([
  '.lobotomy-corp-alert-overlay',
]);

/**
 * 查询抖动期间要保持静止的覆盖层。
 *
 * 每次应用位移都重新查询：警报可能是本次点击的危急值刚触发的，节点会稍后挂载。
 *
 * @return {HTMLElement[]} 需要抵消位移的节点。
 */
function dontTouchMeStaticOverlays() {
  const document = globalThis.document;
  /** @type {HTMLElement[]} */
  const overlays = [];
  dontTouchMeStaticOverlaySelectors.forEach((selector) => {
    document?.querySelectorAll?.(selector)?.forEach((element) => {
      overlays.push(/** @type {HTMLElement} */ (element));
    });
  });
  return overlays;
}

/**
 * 计算镜头后坐在屏幕上的位移比例。
 *
 * CameraMover 把 recoil.scale 乘上 CameraOrthographicSize / DefaultOrtho，而正交相机
 * 的可见高度正好是 2 × CameraOrthographicSize，两者相除后正交尺寸被约掉：屏幕上永远
 * 是 scale / (2 × DefaultOrtho) 这个比例，与当前缩放无关。
 *
 * @return {number} 相对视口高度的位移比例。
 */
export function dontTouchMeRecoilAmplitudeRatio() {
  return dontTouchMeCameraRecoil.scale /
      (2 * dontTouchMeCameraRecoil.defaultOrtho);
}

/**
 * 计算 CameraMover.Recoil(level, maxTime) 的方向切换次数。
 *
 * @param {number} level 冲击等级。
 * @param {number} maxTime 持续秒数。
 * @return {number} 方向切换次数。
 */
export function dontTouchMeRecoilArrowCount(level, maxTime) {
  return Math.trunc(
      level * dontTouchMeCameraRecoil.recoilCount * maxTime *
          dontTouchMeCameraRecoil.timeFactor,
  );
}

/**
 * 计算 CameraMover.PlayRecoil 的每步间隔毫秒数。
 *
 * 原作在方向列表末尾再追加一次原始位置，因此队列长度是次数 + 1。
 *
 * @param {number} level 冲击等级。
 * @param {number} maxTime 持续秒数。
 * @return {number} 每步间隔毫秒数。
 */
export function dontTouchMeRecoilStepMs(level, maxTime) {
  return maxTime * 1000 / (dontTouchMeRecoilArrowCount(level, maxTime) + 1);
}

/** 假关服期间在捕获阶段拦截的交互事件。 */
const dontTouchMeBlockedEvents = Object.freeze([
  'click',
  'mousedown',
  'pointerdown',
  'submit',
]);

/** 演出结束后跳转的路径；服务端没有该路由，浏览器会收到标准 404。 */
export const dontTouchMeExitPath = '/error';

/**
 * 播放一段彩蛋音频。
 *
 * 自动播放被浏览器拒绝时静默忽略，演出继续走后续的视觉流程。
 *
 * @param {string} source 音频绝对地址。
 * @return {HTMLAudioElement|undefined} 已开始播放的音频；不可用时返回 undefined。
 */
function playDontTouchMeAudio(source) {
  if (typeof globalThis.Audio !== 'function') return undefined;
  const audio = new globalThis.Audio(source);
  audio.preload = 'auto';
  audio.loop = false;
  try {
    void Promise.resolve(audio.play()).catch(() => {});
  } catch {
    // 自动播放同步抛错时同样只放弃声音，不影响画面演出。
  }
  return audio;
}

/**
 * 播放原作 CameraMover.Recoil(level, maxTime) 的镜头后坐。
 *
 * 依次在 8 个方向里随机取一个与上次不同的方向，每个方向的位移都是同一幅度
 * （对角方向 x、y 同时偏移），间隔按 maxTime / (次数 + 1) 逐步应用，
 * 与 RecoilEffect.MakeRecoilArrow 的去重规则和 CameraMover.PlayRecoil 的播放节奏一致。
 *
 * @param {number} level 冲击等级。
 * @param {number} maxTime 持续秒数。
 * @return {{promise: Promise<void>, stop: () => void}} 后坐结束的 Promise 与立即停止操作。
 */
function startDontTouchMeRecoil(level, maxTime) {
  const body = globalThis.document?.body;
  const viewportHeight = Number(globalThis.innerHeight);
  if (!body?.style || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return {promise: Promise.resolve(), stop: () => {}};
  }
  const amplitude = Math.round(
      dontTouchMeRecoilAmplitudeRatio() * viewportHeight * 1000,
  ) / 1000;
  const stepMs = dontTouchMeRecoilStepMs(level, maxTime);
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  let remaining = dontTouchMeRecoilArrowCount(level, maxTime);
  let previous = -1;
  let finished = false;
  /** @type {(value?: unknown) => void} */
  let settle = () => {};
  const promise = new Promise((resolve) => {
    settle = resolve;
  });
  const stop = () => {
    if (finished) return;
    finished = true;
    if (timer !== undefined) globalThis.clearTimeout?.(timer);
    timer = undefined;
    body.style.transform = '';
    dontTouchMeStaticOverlays().forEach((element) => {
      element.style.transform = '';
    });
    settle();
  };
  const applyNextDirection = () => {
    timer = undefined;
    let index = Math.floor(Math.random() * dontTouchMeRecoilDirections.length);
    let attempts = 0;
    while (index === previous && attempts < 4) {
      index = Math.floor(Math.random() * dontTouchMeRecoilDirections.length);
      attempts++;
    }
    if (index === previous) {
      index = (index + 1) % dontTouchMeRecoilDirections.length;
    }
    previous = index;
    const direction = dontTouchMeRecoilDirections[index];
    // Unity 的 +y 向上、CSS 的 +y 向下，因此纵向位移取反。
    const offsetX = direction.x * amplitude;
    const offsetY = -direction.y * amplitude;
    body.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
    // 警报 HUD 与“重新开始这一天”面板固定在视口上，用反向位移抵消页面抖动。
    dontTouchMeStaticOverlays().forEach((element) => {
      element.style.transform = `translate3d(${-offsetX}px, ${-offsetY}px, 0)`;
    });
    remaining -= 1;
    if (remaining > 0) {
      timer = globalThis.setTimeout?.(applyNextDirection, stepMs);
    } else {
      // PlayRecoil 在最后一次方向之后立即恢复原始位置。
      stop();
    }
  };
  applyNextDirection();
  return {promise, stop};
}

/**
 * 播放“全体员工恐慌”分支：panic 音效 + CameraMover.Recoil(1, 3f)。
 *
 * 原作这一支没有全屏序列，只有声音与镜头后坐。
 *
 * @param {string} assetRoot 彩蛋共享资源根路径。
 * @return {{promise: Promise<void>, stop: () => void}} 演出 Promise 与立即清理操作。
 */
function playDontTouchMePanic(assetRoot) {
  const sound = playDontTouchMeAudio(
      `${assetRoot}/${dontTouchMePanicSoundPath}`,
  );
  const recoil = startDontTouchMeRecoil(
      dontTouchMePanicRecoil.level,
      dontTouchMePanicRecoil.maxTime,
  );
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    recoil.stop();
    try {
      sound?.pause();
    } catch {
      // 暂停失败不影响清理。
    }
  };
  return {promise: recoil.promise.then(stop, stop), stop};
}

/**
 * 在页面顶层播放一段全屏序列。
 *
 * 覆盖层不接收指针事件，因此演出期间用户仍可继续点击保存按钮。
 *
 * @param {{assetRoot: string, blockPageInteraction?: boolean, delayMs?: number, extraClassName: string, leadingSoundPath?: string, navigateTo?: string, onExit?: () => void, recoil?: {level: number, maxTime: number}, soundPaths: readonly string[], videoPath: string}} options 序列参数。
 * @return {{promise: Promise<void>, stop: () => void}} 演出 Promise 与立即清理操作。
 */
function playDontTouchMeSequence(options) {
  const document = globalThis.document;
  const body = document?.body;
  if (!body?.append || typeof document?.createElement !== 'function') {
    return {promise: Promise.resolve(), stop: () => {}};
  }

  /** @type {HTMLElement|undefined} 覆盖层。 */
  let overlay;
  /** @type {HTMLVideoElement|undefined} 序列视频。 */
  let video;
  /** @type {HTMLAudioElement[]} 本次演出创建的音频。 */
  const sounds = [];
  /** @type {ReturnType<typeof setTimeout>|undefined} 延迟启动视频的计时器。 */
  let delayTimer;
  /** @type {ReturnType<typeof setTimeout>|undefined} 视频事件缺失时的兜底计时器。 */
  let fallbackTimer;
  /** @type {((event: Event) => void)|undefined} 假关服期间的交互拦截器。 */
  let blockInteraction;
  /** @type {(() => void)|undefined} 镜头后坐的停止操作。 */
  let stopRecoil;
  let settled = false;
  /** @type {(value?: unknown) => void} */
  let resolvePlayback = () => {};

  const dispose = () => {
    if (delayTimer !== undefined) globalThis.clearTimeout?.(delayTimer);
    if (fallbackTimer !== undefined) globalThis.clearTimeout?.(fallbackTimer);
    delayTimer = undefined;
    fallbackTimer = undefined;
    if (video) {
      video.removeEventListener('ended', finish);
      video.removeEventListener('error', finish);
      video.removeEventListener('loadedmetadata', handleVideoMetadata);
    }
    sounds.forEach((sound) => {
      try {
        sound.pause();
      } catch {
        // 暂停失败不影响节点清理。
      }
    });
    const blocker = blockInteraction;
    if (blocker) {
      dontTouchMeBlockedEvents.forEach((type) =>
        document.removeEventListener?.(type, blocker, true)
      );
      blockInteraction = undefined;
    }
    overlay?.remove();
    stopRecoil?.();
    stopRecoil = undefined;
  };

  function finish() {
    if (settled) return;
    settled = true;
    dispose();
    resolvePlayback();
    // 保存从未发生，用户返回设置页时显示名称仍是修改前的值。
    if (options.navigateTo) {
      // 跳转前先让宿主收尾：网页把这次退出当作游戏崩溃，清空危急值并结束警报。
      options.onExit?.();
      globalThis.location?.assign?.(options.navigateTo);
    }
  }

  /**
   * 按视频时长设置兜底计时器。
   *
   * 元数据缺失时退回固定上限，避免浏览器不解码时永久停留；元数据在播放后
   * 才到达时会按真实时长重置该计时器。
   */
  function handleVideoMetadata() {
    if (fallbackTimer !== undefined) globalThis.clearTimeout?.(fallbackTimer);
    const duration = Number(video?.duration);
    const durationMs = Number.isFinite(duration) && duration > 0
      ? duration * 1000
      : 10000;
    fallbackTimer = globalThis.setTimeout?.(finish, durationMs + 1000);
  }

  /** 结束前摇，改为播放本段序列的画面与音效。 */
  function startSequence() {
    delayTimer = undefined;
    if (settled) return;
    // 原作在切换场景时结束镜头后坐；覆盖层出现后也不再需要位移。
    stopRecoil?.();
    stopRecoil = undefined;
    overlay = document.createElement('div');
    overlay.className = options.extraClassName;
    overlay.classList?.add(dontTouchMeEffectClassName);
    overlay.setAttribute('aria-hidden', 'true');
    video = document.createElement('video');
    video.className = options.navigateTo
      ? dontTouchMeVideoClassName
      : dontTouchMeEffectVideoClassName;
    video.src = `${options.assetRoot}/${options.videoPath}`;
    // 原作的声音都由 AudioSource 单独提供，视频本身只作为画面来源。
    video.muted = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    overlay.append(video);
    body.append(overlay);
    // 原作从候选音效里随机挑一条（例如 dead1 / dead2），这里保持同样的语义。
    const soundPath = options.soundPaths[
      Math.floor(Math.random() * options.soundPaths.length)
    ];
    const sound = soundPath
      ? playDontTouchMeAudio(`${options.assetRoot}/${soundPath}`)
      : undefined;
    if (sound) sounds.push(sound);
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    video.addEventListener('loadedmetadata', handleVideoMetadata);
    handleVideoMetadata();
    try {
      void Promise.resolve(video.play()).catch(() => {});
    } catch {
      // 视频无法播放时仍由兜底计时器结束演出。
    }
  }

  if (options.leadingSoundPath) {
    const leading = playDontTouchMeAudio(
      `${options.assetRoot}/${options.leadingSoundPath}`,
    );
    if (leading) sounds.push(leading);
  }
  if (options.recoil) {
    stopRecoil = startDontTouchMeRecoil(
        options.recoil.level,
        options.recoil.maxTime,
    ).stop;
  }
  if (options.blockPageInteraction) {
    // 假关服一旦开始就不能再让用户操作页面：再点保存会播成 1~4 次点击的演出，
    // 点导航栏则会让整页跳转打断关服。捕获阶段拦截可以同时挡掉提交与跳转。
    /** @param {Event} event 被拦截的交互事件。 */
    const blocker = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation?.();
    };
    blockInteraction = blocker;
    dontTouchMeBlockedEvents.forEach((type) =>
      document.addEventListener?.(type, blocker, true)
    );
  }

  const promise = new Promise((resolve) => {
    resolvePlayback = resolve;
  });
  const delayMs = Number(options.delayMs) || 0;
  if (delayMs > 0 && typeof globalThis.setTimeout === 'function') {
    delayTimer = globalThis.setTimeout(startSequence, delayMs);
  } else {
    startSequence();
  }
  return {promise, stop: dispose};
}

/**
 * 创建“别碰我”点击演出控制器。
 *
 * @param {{assetRoot: string, onEffectPicked?: (effectId: string) => void, onExit?: () => void}} shared 彩蛋共享资源根路径、点击副作用回调与假关服跳转前的收尾回调。
 * @return {{isActive: () => boolean, play: () => Promise<void>, stop: () => void}} 演出控制器。
 */
export function createDontTouchMeShutdown(shared) {
  /** @type {(() => void)|undefined} 当前演出的清理操作；为空表示没有演出在进行。 */
  let dispose;
  /** @type {number[]} 滑动窗口内已记录的点击时刻。 */
  let clickTimes = [];

  /** @return {boolean} 当前是否有演出在进行。 */
  function isActive() {
    return dispose !== undefined;
  }

  /** 立即结束当前演出且不触发跳转。 */
  function stop() {
    const current = dispose;
    dispose = undefined;
    current?.();
  }

  /**
   * 播放“别碰我”本次点击对应的演出。
   *
   * @return {Promise<void>} 本次演出结束时完成。
   */
  function play() {
    stop();
    const now = Date.now();
    clickTimes = clickTimes.filter((time) => now - time < dontTouchMeClickWindowMs);
    clickTimes.push(now);
    const isShutdown = clickTimes.length >= dontTouchMeShutdownClickCount;
    if (isShutdown) clickTimes = [];
    let sequence;
    if (isShutdown) {
      sequence = playDontTouchMeSequence({
        assetRoot: shared.assetRoot,
        blockPageInteraction: true,
        delayMs: dontTouchMeExitDelayMs,
        extraClassName: dontTouchMeOverlayClassName,
        leadingSoundPath: dontTouchMeShoutSoundPath,
        navigateTo: dontTouchMeExitPath,
        onExit: shared.onExit,
        // DontTouchMe.ExitStart() 调用 CameraMover.Recoil(2, 5f)。
        recoil: {level: 2, maxTime: 5},
        soundPaths: [dontTouchMeShutdownSoundPath],
        videoPath: dontTouchMeShutdownVideoPath,
      });
    } else {
      // 网页只有一个保存按钮，因此每次点击在三个分支里等概率取一个。
      const effect = dontTouchMeClickEffects[
        Math.floor(Math.random() * dontTouchMeClickEffects.length)
      ];
      // 副作用必须留在本次点击的同步用户手势里结算，宿主才能照常启动后续警报音频。
      shared.onEffectPicked?.(effect.id);
      sequence = effect.id === dontTouchMePanicEffect.id
        ? playDontTouchMePanic(shared.assetRoot)
        : playDontTouchMeSequence({
          assetRoot: shared.assetRoot,
          extraClassName: effect.extraClassName,
          soundPaths: effect.soundPaths,
          videoPath: effect.videoPath,
        });
    }
    dispose = sequence.stop;
    return sequence.promise.finally(() => {
      if (dispose === sequence.stop) dispose = undefined;
    });
  }

  return {isActive, play, stop};
}
