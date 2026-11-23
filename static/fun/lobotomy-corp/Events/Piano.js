/** @file 月光女神的演奏轮次、原作换曲与收琴音效。 */
// @ts-check

/** 月光女神的收容编号。 */
export const pianoId = 'D-01-105';
/** Piano_stat.soundTable 中工作、出逃和计数归零／镇压共用的音效。 */
export const pianoSounds = ['Moon_Piano', 'Moon_Piano_Escape', 'Moon_Dead'].map(
  (name) => 'Resources/sounds/creature/piano/' + name + '.ogg',
);
/** 当前标签页或应用窗口的演奏轮次。 */
const sessionKey = 'warmnest.lobotomy-corp-piano';
/** 原作 ActivateQliphothCounter 启动的出逃时限。 */
const escapeMs = 95000;
/** 原作收琴的单位音量衰减时长。 */
const fadeMs = 1500;
/** Moon_Piano.ogg 的实际时长，用于跨页时定位一次性工作曲。 */
const workMs = 59690;

/**
 * @typedef {{consume?:(path:string)=>HTMLAudioElement|undefined}} PianoMedia
 * @typedef {'idle'|'work'|'escape'} PianoPhase
 * @typedef {{work:(media?:PianoMedia)=>void, escape:(media?:PianoMedia)=>void,
 *   finish:()=>void, restore:()=>void, phase:()=>PianoPhase,
 *   playingWork:()=>boolean, isActive:()=>boolean}} PianoEvent
 */

/**
 * 管理独立于其它异想体的钢琴声部，跨页时沿用同一窗口的轮次。
 * @param {{assetRoot:string, changed:()=>void}} host 资源与公共重启入口。
 * @return {PianoEvent} 手动工作、出逃、恢复与清理接口。
 */
export function createPianoEvent(host) {
  /** @type {PianoPhase} */
  let phase = 'idle';
  let since = 0;
  /** @type {Map<string, HTMLAudioElement>} */
  const tracks = new Map();
  /** @type {Set<HTMLAudioElement>} */
  const blocked = new Set();
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  /** @type {HTMLAudioElement|undefined} 收琴后仍可自然播完的短音效。 */
  let tail;

  /** 记录本窗口的轮次及当前阶段起点。 */
  function persist() {
    try {
      if (phase === 'idle') globalThis.sessionStorage?.removeItem(sessionKey);
      else {globalThis.sessionStorage?.setItem(
          sessionKey,
          JSON.stringify({ phase, since }),
        );}
    } catch { /* 存储不可用时继续使用当前页面内存。 */ }
  }
  /** @param {HTMLAudioElement} audio 需要停止并释放的媒体。 */
  function release(audio) {
    blocked.delete(audio);
    audio.pause();
    audio.removeAttribute('src');
    audio.load?.();
  }
  /** 释放当前页面持有的声音和调度。 */
  function detach() {
    clearTimeout(timer);
    if (tail) release(tail);
    tail = undefined;
    for (const audio of tracks.values()) release(audio);
    tracks.clear();
    blocked.clear();
  }
  /** 清理演奏进度，让下一次手动输入从第一乐章开始。 */
  function finish() {
    detach();
    phase = 'idle';
    persist();
    host.changed();
  }
  /** @param {HTMLAudioElement} audio 需要实际播放的音轨。 */
  function play(audio) {
    blocked.delete(audio);
    void audio.play().catch((error) => {
      if (
        error?.name === 'NotAllowedError' &&
        [...tracks.values()].includes(audio)
      ) blocked.add(audio);
    });
  }
  /** 用户手势允许播放后继续当前阶段。 */
  function retry() {
    for (const audio of [...blocked]) play(audio);
  }
  /** @param {PianoMedia} [media] 用户手势预热的音轨。 */
  function prepare(media) {
    for (const path of pianoSounds) {
      if (tracks.has(path) || typeof Audio !== 'function') continue;
      if (phase === 'escape' && path === pianoSounds[0]) continue;
      const audio = media?.consume?.(path) ??
        new Audio(host.assetRoot + '/' + path);
      audio.pause();
      audio.muted = false;
      tracks.set(path, audio);
    }
  }
  /**
   * 播放一次普通工作曲。
   * @param {PianoMedia} [media] 预热句柄。
   * @param {number} [offset] 跨页恢复的秒数。
   */
  function work(media, offset = 0) {
    if (phase === 'work') detach();
    phase = 'work';
    since = Date.now() - offset * 1000;
    persist();
    prepare(media);
    const audio = tracks.get(pianoSounds[0]);
    if (!audio) return finish();
    audio.currentTime = offset;
    audio.loop = false;
    /** 只响应当前工作音轨的终止通知。 */
    const endCurrentWork = () => {
      if (phase === 'work' && tracks.get(pianoSounds[0]) === audio) finish();
    };
    audio.addEventListener('ended', endCurrentWork, { once: true });
    audio.addEventListener('error', endCurrentWork, { once: true });
    play(audio);
    host.changed();
  }
  /** @param {HTMLAudioElement} audio 原作计数归零与镇压共用的一次性声音。 */
  function accent(audio) {
    audio.currentTime = 0;
    play(audio);
  }
  /**
   * 从出逃开始计时 95 秒，镇压时收琴并线性淡出。
   * @param {PianoMedia} [media] 预热句柄。
   * @param {number} [elapsed] 恢复时已经过去的毫秒数。
   */
  function escape(media, elapsed = 0) {
    if (phase === 'escape') return;
    phase = 'escape';
    since = Date.now() - elapsed;
    persist();
    prepare(media);
    const [normal, movement, effect] = pianoSounds.map((path) =>
      tracks.get(path)
    );
    if (normal) {
      tracks.delete(pianoSounds[0]);
      release(normal);
    }
    if (movement) {
      movement.loop = true;
      movement.currentTime = elapsed / 1000;
      movement.volume = Math.min(1, (escapeMs + fadeMs - elapsed) / fadeMs);
      play(movement);
    }
    if (effect && elapsed === 0) accent(effect);
    /** 以实际经过时间推进收琴音量，后台计时器延迟时仍按时结束。 */
    function fade() {
      const remaining = escapeMs + fadeMs - (Date.now() - since);
      if (remaining <= 0) {
        if (effect) {
          tracks.delete(pianoSounds[2]);
          if (tail) release(tail);
          tail = effect;
          effect.addEventListener('ended', () => {
            if (tail === effect) {
              release(effect);
              tail = undefined;
            }
          }, { once: true });
        }
        if (movement) release(movement);
        tracks.clear();
        phase = 'idle';
        persist();
        host.changed();
        return;
      }
      if (movement) movement.volume = Math.min(1, remaining / fadeMs);
      timer = setTimeout(fade, Math.min(20, remaining));
    }
    timer = setTimeout(() => {
      if (effect && elapsed <= escapeMs) accent(effect);
      fade();
    }, Math.max(0, escapeMs - elapsed));
    host.changed();
  }
  /** 恢复当前窗口尚在演奏的乐章，过期进度和旧的曲终等待状态均清空。 */
  function restore() {
    let saved;
    try {
      saved = JSON.parse(
        globalThis.sessionStorage?.getItem(sessionKey) ?? 'null',
      );
    } catch {
      return;
    }
    if (!saved || !Number.isFinite(saved.since)) return;
    const elapsed = Math.max(0, Date.now() - saved.since);
    if (saved.phase === 'work' && elapsed < workMs) {
      work(undefined, elapsed / 1000);
    } else if (saved.phase === 'escape' && elapsed < escapeMs + fadeMs) {
      escape(undefined, elapsed);
    } else finish();
  }
  for (const event of ['click', 'keydown']) {
    globalThis.document?.addEventListener?.(event, retry, true);
  }
  globalThis.addEventListener?.('pagehide', () => {
    detach();
    phase = 'idle';
  });
  globalThis.addEventListener?.('pageshow', (event) => {
    if (event.persisted) restore();
  });
  return {
    work,
    escape,
    finish,
    restore,
    /** @return {PianoPhase} 当前窗口的演奏阶段。 */
    phase: () => phase,
    /** @return {boolean} 第一乐章已开始并仍在播放。 */
    playingWork: () => {
      const audio = tracks.get(pianoSounds[0]);
      return phase === 'work' && audio?.paused === false && !audio.ended;
    },
    /** @return {boolean} 是否需要保留公共重启入口。 */
    isActive: () => phase === 'work' || phase === 'escape',
  };
}
