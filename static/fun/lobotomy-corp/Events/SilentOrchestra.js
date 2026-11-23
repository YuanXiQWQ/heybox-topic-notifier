/** @file 沉默乐团的帷幕、乐章标题和独立的单次音轨。 */
// @ts-check

/**
 * @typedef {{consume?: (path: string) => HTMLAudioElement | undefined}} PreparedMedia
 * @typedef {{root: HTMLDivElement, audio: (HTMLAudioElement | undefined)[],
 *   timers: ReturnType<typeof setTimeout>[], visible: boolean, unlisten: () => void}} OrchestraSession
 * @typedef {{assetRoot: string, mountRestartButton: () => void, finishRestartButton: () => void,
 *   ensureCoordinator: () => void, refreshAlertVolume: () => void}} OrchestraHost
 * @typedef {{id: string, sounds: string[], start: (media?: PreparedMedia) => void,
 *   finish: () => void, isActive: () => boolean, bgmGain: () => number}} OrchestraEvent
 */

/** SilentOrchestra_stat.soundTable 的 zero、first、second、third、fourth、finale。 */
const sounds = ['0_clap', '1_mov1', '2_mov2', '3_mov3', '4_mov4', '5_finale']
    .map((key) => 'Resources/sounds/creature/silentorchestra/Sym_movment_' + key + '.ogg');

/** 由六段 Vorbis 音轨末页的 granule position / 44100 得到的秒数，元数据加载前使用。 */
const clipDurations = [6.839093, 23.539206, 16.859161, 13.519138, 26.083991, 34.274989];

/** 角色预制体 UI.typoSprite 的显示顺序。 */
const titles = ['Movement1', 'Movement2', 'Movement3', 'Movement4', 'Finale'];

/** 原作 UI 图片所在的资源目录。 */
const spriteDirectory = 'Resources/sprites/creaturesprite/silentorchestra/';

/** SilentOrchestra.movementTime，索引 0 是首位演奏者的入场时间。 */
const movementTimes = [6, 21, 15, 12, 26, 34];

/** 正常游戏速度下的 Fixed Timestep 与 TimeManager 的 Maximum Allowed Timestep。 */
const fixedStep = Math.fround(0.02);
const maximumDelta = Math.fround(1 / 3);

/** 读取单调时钟，供动画和浏览器媒体解锁共用。
 * @return {number} 当前毫秒数。
 */
function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

/**
 * 建立沉默乐团演出。视觉收幕与音频释放分别由动画事件及媒体结束事件驱动。
 *
 * @param {OrchestraHost} shared 页面资源、重新开始按钮和警报音量接口。
 * @return {OrchestraEvent} 专属出逃登记项。
 */
export function createSilentOrchestraEvent(shared) {
  /** @type {OrchestraSession | undefined} */
  let session;
  let bgmGain = 1;
  let fadeElapsed = 0;
  /** @type {0 | 1 | undefined} BgmManager 当前的淡变方向。 */
  let fadeTarget;
  /** @type {(() => void) | undefined} 当前画面与背景音乐淡变的更新循环。 */
  let stopRendering;

  /** 结束当前场次，清理已经开始播放的所有乐段，包括终章余音。 */
  function finish() {
    const current = session;
    session = undefined;
    stopRendering?.();
    fadeTarget = undefined;
    bgmGain = 1;
    shared.refreshAlertVolume();
    if (!current) return;
    for (const timer of current.timers) clearTimeout(timer);
    current.root.remove();
    globalThis.document.documentElement.classList.remove('lobotomy-orchestra-visible', 'lobotomy-orchestra-active');
    for (const audio of current.audio) {
      if (!audio) continue;
      audio.pause();
      audio.removeAttribute('src');
      audio.load?.();
    }
    current.unlisten();
    shared.finishRestartButton();
  }

  /**
   * 从出逃开场启动一场独立演出。
   *
   * @param {PreparedMedia} [preparedMedia] 手动提交手势内已解锁的媒体。
   */
  function start(preparedMedia) {
    const doc = globalThis.document;
    if (session || !doc?.body) return;
    if (stopRendering) finish();
    const root = doc.createElement('div');
    root.className = 'lobotomy-orchestra';
    root.setAttribute('aria-hidden', 'true');
    /** @type {OrchestraSession} */
    const current = {root, audio: [], timers: [], visible: true, unlisten};
    /** @type {Map<HTMLAudioElement, number>} */
    const blocked = new Map();
    const playing = new Set();
    session = current;

    /**
     * 创建角色预制体中的一张 UI Image。
     *
     * @param {string} name Sprite 名称。
     * @param {string} role 画布中的节点类别。
     * @return {HTMLImageElement} 图片节点。
     */
    function image(name, role) {
      const node = doc.createElement('img');
      node.className = 'lobotomy-orchestra-' + role;
      node.alt = '';
      node.draggable = false;
      const directory = shared.assetRoot + '/' + spriteDirectory;
      node.src = directory + name + '.png';
      node.style.setProperty('--orchestra-sprite', 'url("' + node.src + '")');
      node.style.setProperty('--orchestra-rgb', 'url("' + directory + 'rgb/' + name + '.png")');
      root.append(node);
      return node;
    }

    /** 在手势恢复时按原作时间轴定位浏览器拦截的音轨。 */
    function retry() {
      for (const [audio, since] of blocked) {
        const position = (now() - since) / 1000;
        if (position >= clipDurations[current.audio.indexOf(audio)]) {
          blocked.delete(audio);
          playing.delete(audio);
          finishIfSilent();
          continue;
        }
        audio.currentTime = position;
        play(audio, since);
      }
    }

    /**
     * 播放一次原声，保留受自动播放策略影响的曲段。
     *
     * @param {HTMLAudioElement} audio 当前独立音轨。
     * @param {number} since 曲段在演出时间轴的起点。
     */
    function play(audio, since) {
      blocked.delete(audio);
      void audio.play().catch((error) => {
        if (session !== current || !playing.has(audio)) return;
        if (error?.name === 'NotAllowedError' && now() - since < clipDurations[current.audio.indexOf(audio)] * 1000) {
          blocked.set(audio, since);
          return;
        }
        playing.delete(audio);
        finishIfSilent();
      });
    }

    /**
     * 在动画事件所在帧从头 PlayOnce，保留上一音轨尚未播放完的片尾。
     *
     * @param {number} index 音轨索引。
     */
    function cue(index) {
      const audio = current.audio[index];
      if (!audio || audio.error) return;
      audio.currentTime = 0;
      playing.add(audio);
      play(audio, now());
      // 受策略拦截的曲段过期后移除，保证离开页面前没有悬挂的重试或按钮。
      current.timers.push(setTimeout(() => {
        if (blocked.delete(audio)) {
          playing.delete(audio);
          finishIfSilent();
        }
      }, Math.ceil(clipDurations[index] * 1000)));
    }

    /** 移除本场注册的浏览器媒体解锁监听。 */
    function unlisten() {
      for (const type of ['pointerdown', 'click', 'keydown']) {
        doc.removeEventListener?.(type, retry, true);
      }
    }

    /** 视觉结束后继续保留重启入口，直到播放中的原声音轨全部释放。 */
    function finishIfSilent() {
      if (!current.visible && !playing.size && session === current) {
        session = undefined;
        unlisten();
        doc.documentElement.classList.remove('lobotomy-orchestra-active');
        shared.finishRestartButton();
      }
    }

    for (const path of sounds) {
      const audio = preparedMedia?.consume?.(path) ??
          (typeof Audio === 'function' ? new Audio(shared.assetRoot + '/' + path) : undefined);
      current.audio.push(audio);
      if (!audio) continue;
      audio.preload = 'auto';
      audio.pause();
      audio.muted = false;
      /** 在该原声自然结束或加载失败后释放其播放状态。 */
      const releaseTrack = () => {
        blocked.delete(audio);
        playing.delete(audio);
        finishIfSilent();
      };
      audio.addEventListener('ended', releaseTrack);
      audio.addEventListener('error', releaseTrack);
    }
    for (const type of ['pointerdown', 'click', 'keydown']) {
      doc.addEventListener?.(type, retry, true);
    }

    image('Curtain', 'left');
    image('Curtain', 'right');
    image('CurtainUpperLeft', 'upper-left');
    image('CurtainUpperRight', 'upper-right');
    const headings = titles.map((name) => image(name, 'title'));
    // 将 Overlay 放在受镜头后坐变换的 body 外，避免 fixed 的包含块变为整张设置页。
    doc.documentElement.append(root);
    doc.documentElement.classList.add('lobotomy-orchestra-visible', 'lobotomy-orchestra-active');
    shared.mountRestartButton();
    shared.ensureCoordinator();

    // GameManager 的固定更新、UI.Update 及 Animator 的片段事件分别推进。
    // 指挥与演奏者交接发生在 Animator 评估期间，新激活的控制器从下一帧开始采样。
    let lastFrame = now();
    let fixedRemainder = (lastFrame / 1000) % fixedStep;
    let escapeElapsed = 0;
    let fourthElapsed = 0;
    /** @type {number | undefined} CreatureModel 进入 SUPPRESSED 后的回收计时。 */
    let returnElapsed;
    let movementIndex = -1;
    let inRange = false;
    let finaleStarted = false;
    let activated = false;
    let finaleClip = 0;
    /** @type {'waiting'|'conductor'|'singer'|'finished'} */
    let performer = 'waiting';
    let entryState = true;
    let performerTime = 0;
    /** @type {'appear'|'close'|'open'} */
    let curtainState = 'appear';
    let curtainTime = 0;
    let closing = false;
    let openRequested = false;
    let titlePhase = 0;
    let titleElapsed = 0;
    let rendering = true;
    /** @type {number | undefined} */
    let animationFrame;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let backgroundFrame;
    root.dataset.curtain = curtainState;

    /** 同一条 OnMovementEnd 调用先播放音轨，再激活该乐章的标题图。 */
    function nextMovement() {
      movementIndex++;
      cue(movementIndex + 1);
      titleElapsed = 0;
      titlePhase = 1;
    }

    /**
     * 对应 UI.Update 与 UnscaledTimer。每帧先写入当前透明度，再累计时间并切换状态。
     * @param {number} delta 本次 Update 的非缩放秒数。
     */
    function updateTitle(delta) {
      if (!titlePhase) return;
      const title = headings[movementIndex];
      if (titlePhase === 1) title.style.opacity = String(Math.min(titleElapsed, 1));
      if (titlePhase === 3) title.style.opacity = String(Math.max(0, Math.fround(1 - titleElapsed)));
      titleElapsed = Math.fround(titleElapsed + delta);
      if (titleElapsed < (titlePhase === 2 ? 2 : 1)) return;
      titleElapsed = 0;
      titlePhase++;
      if (titlePhase === 4) {
        titlePhase = 0;
        title.style.opacity = '0';
      }
    }

    /** 在固定更新内推进出逃计时、镜头范围判定以及镇压后的回收计时。 */
    function fixedUpdate() {
      if (!current.visible) {
        if (returnElapsed === undefined) return;
        returnElapsed = Math.fround(returnElapsed + fixedStep);
        if (returnElapsed >= 10) {
          returnElapsed = undefined;
          fadeElapsed = 0;
          fadeTarget = 1;
        }
        return;
      }
      if (performer === 'waiting') {
        escapeElapsed = Math.fround(escapeElapsed + fixedStep);
        if (escapeElapsed >= 6) performer = 'conductor';
      }
      // Teleport 将镜头对准乐团。NONE 的半径为零，第一乐章才进入严格的矩形边界内。
      if (!inRange && movementIndex >= 0) {
        inRange = true;
        fadeElapsed = 0;
        fadeTarget = 0;
      }
      if (movementIndex < 3) return;
      fourthElapsed = Math.fround(fourthElapsed + fixedStep);
      if (!finaleStarted && fourthElapsed > 17) finaleStarted = true;
      else if (finaleStarted && fourthElapsed > 21.5) activated = true;
      if (movementIndex === 3 && fourthElapsed >= movementTimes[4]) nextMovement();
    }

    /**
     * 评估指挥或入场演奏者的控制器。入口达到 exitTime 后将越过边界的片段时间
     * 带入目标状态，过渡混合与目标片段同时播放。末帧事件激活下一位演奏者。
     * @param {number} delta 本帧 Animator 的缩放秒数。
     */
    function updatePerformer(delta) {
      const conductor = performer === 'conductor';
      const speed = conductor ? 1 : Math.fround(1 / Math.fround(movementTimes[movementIndex + 1] / 10));
      const entryLength = conductor ? Math.fround(31 / 60) : 1;
      const clipLength = conductor ? 2 : 10;
      const step = Math.fround(delta * speed);
      const length = entryState ? entryLength : clipLength;
      performerTime = Math.fround(performerTime + Math.fround(step / length));
      if (entryState && performerTime >= Math.fround(0.9)) {
        performerTime = Math.fround((performerTime - Math.fround(0.9)) * entryLength / clipLength);
        entryState = false;
      }
      if (entryState || performerTime < 1) return;
      if (!conductor) nextMovement();
      performer = movementIndex < 3 ? 'singer' : 'finished';
      entryState = true;
      performerTime = 0;
    }

    /**
     * 采样 CurtainAppearAnim 的上幕位移和 CurtainAnim 的侧幕阶跃。
     * @param {number} delta 本帧 Animator 的缩放秒数。
     */
    function updateCurtain(delta) {
      if (openRequested) {
        openRequested = false;
        curtainState = 'open';
        curtainTime = 0;
        root.dataset.curtain = curtainState;
        delta = 0;
      } else if (closing && curtainState === 'open') {
        curtainState = 'close';
        curtainTime = 0;
        root.dataset.curtain = curtainState;
        return;
      }
      if (curtainState === 'open' && curtainTime >= 1) return;
      curtainTime = Math.fround(curtainTime + Math.fround(delta / 3));
      if (curtainState === 'appear') {
        // CurtainAppearAnim 的 Upper.x 流式曲线系数为 (33.333332, -150, 0, 0)，反向采样。
        const t = Math.fround(Math.max(0, Math.fround(1 - curtainTime)) * 3);
        const quadratic = Math.fround(Math.fround(Math.fround(33.333332) * t) - 150);
        const leftX = Math.fround(Math.fround(quadratic * t) * t);
        root.style.setProperty('--orchestra-upper-offset', String(leftX / -450));
        if (curtainTime < 1) return;
        cue(0);
        curtainState = 'close';
        curtainTime = Math.fround(curtainTime - 1);
        root.dataset.curtain = curtainState;
      }
      const clip = curtainState === 'close' ? 1 - curtainTime : curtainTime;
      // CurtainAnim 在本地片段时间 0、1、2、3 秒的四个常量键。
      let scale = 0;
      if (clip < 1 / 3) scale = 1;
      else if (clip < 2 / 3) scale = 0.66;
      else if (clip < 1 || curtainState === 'close') scale = 0.52;
      root.style.setProperty('--orchestra-side-scale', String(scale));
      if (curtainState !== 'close' || curtainTime < 1) return;
      if (!closing) {
        openRequested = true;
        return;
      }
      current.visible = false;
      root.remove();
      doc.documentElement.classList.remove('lobotomy-orchestra-visible');
      // ForcelyReturn 设置 SUPPRESSED；FinishReturn 只在 SUPPRESSED_RETURN 时调用 OnReturn。
      returnElapsed = 0;
      finishIfSilent();
    }

    /** 按游戏的 FixedUpdate、Update、Animator 顺序推进一个显示帧。
     * @param {number} [frameTime] 浏览器呈现该帧的单调时钟时间戳。
     */
    function frame(frameTime) {
      animationFrame = backgroundFrame = undefined;
      if (!rendering) return;
      const timestamp = Math.max(lastFrame, frameTime ?? now());
      const unscaled = Math.fround(Math.max(0, timestamp - lastFrame) / 1000);
      const delta = Math.min(maximumDelta, unscaled);
      lastFrame = timestamp;
      const wasPerforming = performer === 'conductor' || performer === 'singer';
      const wasActivated = activated;
      fixedRemainder += delta;
      while (fixedRemainder >= fixedStep) {
        fixedRemainder -= fixedStep;
        fixedUpdate();
      }
      if (fadeTarget !== undefined) {
        fadeElapsed = Math.fround(fadeElapsed + unscaled);
        const progress = Math.min(1, fadeElapsed / 2);
        bgmGain = fadeTarget === 1 ? progress : Math.fround(1 - progress);
        shared.refreshAlertVolume();
        if (fadeElapsed >= 2) fadeTarget = undefined;
      }
      if (current.visible) {
        updateTitle(unscaled);
        updateCurtain(delta);
      }
      if (current.visible && wasPerforming) updatePerformer(delta);
      if (current.visible && wasActivated && !closing) {
        finaleClip = Math.fround(finaleClip + Math.fround(delta / 8));
        if (finaleClip >= 1) {
          closing = true;
          root.dataset.curtain = 'close';
        }
      }
      if (current.visible || returnElapsed !== undefined || fadeTarget !== undefined) scheduleFrame();
      else stopRendering?.();
    }

    /** 使用显示帧采样，窗口隐藏时按原版 runInBackground 继续更新。 */
    function scheduleFrame() {
      if (!doc.hidden && typeof globalThis.requestAnimationFrame === 'function') {
        animationFrame = requestAnimationFrame(frame);
      } else {
        backgroundFrame = setTimeout(frame, 1000 / 60);
      }
    }
    /** 撤销当前登记的显示帧或后台定时器。 */
    function cancelFrame() {
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
      if (backgroundFrame !== undefined) clearTimeout(backgroundFrame);
      animationFrame = backgroundFrame = undefined;
    }
    /** 切换窗口可见性时，将待执行的帧移交给相应时钟。 */
    function visibilityChanged() {
      cancelFrame();
      scheduleFrame();
    }
    stopRendering = () => {
      rendering = false;
      cancelFrame();
      doc.removeEventListener?.('visibilitychange', visibilityChanged);
      stopRendering = undefined;
    };
    doc.addEventListener?.('visibilitychange', visibilityChanged);
    scheduleFrame();
  }

  return {
    id: 'T-01-31', sounds, start, finish,
    /** @return {boolean} 是否仍有画面或演出音轨。 */
    isActive: () => Boolean(session),
    /** @return {number} 当前场景背景音乐的线性增益。 */
    bgmGain: () => bgmGain,
  };
}
