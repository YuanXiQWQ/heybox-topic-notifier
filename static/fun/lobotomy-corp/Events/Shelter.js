/**
 * @file 本文件实现《脑叶公司》“3月27日的避难所”彩蛋的随机释放调度。
 */
// @ts-check

/** “3月27日的避难所”的 canonical 编号。 */
export const shelterAbnormalityId = 'T-09-82';

/** 避难所事件的持久化标识。 */
export const shelterEventId = 'shelter-from-the-27th-of-march';

/** 输入避难所编号后，首次释放异想体前的等待时间（毫秒）。 */
export const shelterInitialReleaseDelayMs = 30000;

/** 避难所每次释放异想体之间的间隔（毫秒）。 */
export const shelterReleaseIntervalMs = 5000;

/** 避难所事件的会话持久化键。 */
export const shelterStorageKey = 'warmnest.lobotomy-corp-shelter';

/**
 * 避难所事件依赖的宿主能力。
 *
 * @typedef {object} ShelterEventStorage
 * @property {(key: string) => string|null} getItem 读取存储值。
 * @property {(key: string, value: string) => void} setItem 写入存储值。
 * @property {(key: string) => void} removeItem 删除存储值。
 *
 * @typedef {object} ShelterEventShared
 * @property {() => Record<string, {canBreach?: boolean}>|undefined} abnormalities 读取异想体资料。
 * @property {(timer: number) => void} clearTimer 清除计时器。
 * @property {() => void} ensureCoordinator 确保该事件参与跨游戏互斥。
 * @property {() => boolean} isReload 判断当前页面是否由刷新产生。
 * @property {() => number} now 读取当前时间戳。
 * @property {() => number} random 生成 0（含）到 1（不含）之间的随机数。
 * @property {(canonicalId: string) => unknown} releaseAbnormality 按编号触发异想体出逃流程。
 * @property {(callback: () => void, delay: number) => number} setTimer 创建计时器。
 * @property {string} storageKey 事件持久化键。
 * @property {() => ShelterEventStorage[]} storages 读取可用存储。
 *
 * @typedef {object} ShelterEventController
 * @property {() => boolean} finish 结束事件。
 * @property {() => number|undefined} getNextReleaseAt 读取下一次释放时间。
 * @property {() => number} getReleaseCount 读取本次释放次数。
 * @property {() => boolean} isActive 判断事件是否运行中。
 * @property {() => boolean} restore 从内部导航恢复事件。
 * @property {() => boolean} start 开始事件。
 */

/**
 * 列出可能被避难所释放的异想体编号。
 *
 * 与原作一致，只有能够出逃的异想体参与随机选择；疫医和“别碰我”等
 * 不能出逃的条目不会进入候选列表。
 *
 * @param {Record<string, {canBreach?: boolean}>|undefined} abnormalities 异想体资料。
 * @return {string[]} 按编号排序后的可出逃异想体编号。
 */
export function escapableAbnormalityIds(abnormalities) {
  return Object.entries(abnormalities ?? {})
      .filter(([, abnormality]) => abnormality?.canBreach === true)
      .map(([canonicalId]) => canonicalId)
      .sort();
}

/**
 * 根据 `Math.random()` 风格的数值选择一个候选编号。
 *
 * @param {readonly string[]} canonicalIds 候选异想体编号。
 * @param {number} randomValue 0（含）到 1（不含）之间的随机数。
 * @return {string|undefined} 选中的编号；没有候选时返回 undefined。
 */
export function shelterAbnormalityForRandomValue(
    canonicalIds,
    randomValue,
) {
  if (canonicalIds.length === 0) return undefined;
  const normalized = Number.isFinite(randomValue)
    ? Math.max(0, Math.min(0.9999999999999999, randomValue))
    : 0;
  return canonicalIds[Math.floor(normalized * canonicalIds.length)];
}

/**
 * 创建“3月27日的避难所”事件控制器。
 *
 * @param {ShelterEventShared} shared 宿主提供的最小共享 API。
 * @return {ShelterEventController} 避难所事件 API。
 */
export function createShelterEvent(shared) {
  /** 事件是否正在等待或持续释放异想体。 */
  let active = false;

  /** @type {number|undefined} 当前等待的释放计时器。 */
  let releaseTimer;

  /** @type {number|undefined} 下一次释放异想体的绝对时间戳。 */
  let nextReleaseAt;

  /** 本次事件已经执行过的释放次数。 */
  let releaseCount = 0;

  /**
   * 读取当前时间。
   *
   * @return {number} 当前毫秒时间戳。
   */
  const now = () => typeof shared.now === 'function' ? shared.now() : Date.now();

  /**
   * 读取可用的存储实例。
   *
   * @return {ShelterEventStorage[]} 可用存储。
   */
  const storages = () =>
    Array.isArray(shared.storages?.()) ? shared.storages() : [];

  /** 清除事件的持久化状态。 */
  const clearPersisted = () => {
    storages().forEach((storage) => storage.removeItem(shared.storageKey));
  };

  /** 写入当前等待的绝对截止时间。 */
  const persist = () => {
    if (!active || !Number.isFinite(nextReleaseAt)) {
      clearPersisted();
      return;
    }
    const serialized = JSON.stringify({
      id: shelterEventId,
      nextReleaseAt,
    });
    storages().forEach((storage) =>
      storage.setItem(shared.storageKey, serialized)
    );
  };

  /**
   * 读取有效的持久化状态。
   *
   * @return {{id: string, nextReleaseAt: number}|undefined} 合法存档。
   */
  const persisted = () => {
    const serialized = storages().map((storage) =>
      storage.getItem(shared.storageKey)
    ).find(Boolean);
    if (!serialized) return undefined;
    try {
      const saved = JSON.parse(serialized);
      if (
        saved?.id !== shelterEventId ||
        !Number.isFinite(saved.nextReleaseAt)
      ) {
        clearPersisted();
        return undefined;
      }
      return saved;
    } catch {
      clearPersisted();
      return undefined;
    }
  };

  /** 清除当前释放计时器。 */
  const clearReleaseTimer = () => {
    if (releaseTimer === undefined) return;
    shared.clearTimer(releaseTimer);
    releaseTimer = undefined;
  };

  /**
   * 安排下一次释放；页面切回时按绝对时间补足剩余等待。
   *
   * @param {number} timestamp 下一次释放的绝对时间戳。
   */
  const scheduleReleaseAt = (timestamp) => {
    clearReleaseTimer();
    if (!active) return;
    nextReleaseAt = timestamp;
    persist();
    const delay = Math.max(0, nextReleaseAt - now());
    releaseTimer = shared.setTimer(releaseOneAbnormality, delay);
  };

  /** 随机释放一个可出逃异想体，并安排下一轮。 */
  const releaseOneAbnormality = () => {
    releaseTimer = undefined;
    if (!active) return;
    const canonicalId = shelterAbnormalityForRandomValue(
        escapableAbnormalityIds(shared.abnormalities?.()),
        shared.random(),
    );
    if (canonicalId === undefined) {
      scheduleReleaseAt(now() + shelterReleaseIntervalMs);
      return;
    }
    releaseCount += 1;
    try {
      void shared.releaseAbnormality(canonicalId);
    } catch {
      // 单次释放失败不能中断后续随机释放。
    }
    if (!active) return;
    scheduleReleaseAt(now() + shelterReleaseIntervalMs);
  };

  /**
   * 开始避难所事件。
   *
   * @return {boolean} 新事件成功开始时返回 true；已经运行时返回 false。
   */
  const start = () => {
    if (active) return false;
    active = true;
    releaseCount = 0;
    shared.ensureCoordinator?.();
    scheduleReleaseAt(now() + shelterInitialReleaseDelayMs);
    return true;
  };

  /**
   * 结束避难所事件并清理计时器与持久化状态。
   *
   * @return {boolean} 结束前事件正在运行时返回 true。
   */
  const finish = () => {
    const wasActive = active;
    active = false;
    nextReleaseAt = undefined;
    clearReleaseTimer();
    clearPersisted();
    releaseCount = 0;
    return wasActive;
  };

  /**
   * 从内部页面导航恢复事件；浏览器刷新会终止事件。
   *
   * @return {boolean} 成功恢复时返回 true。
   */
  const restore = () => {
    if (shared.isReload?.()) {
      clearPersisted();
      return false;
    }
    const saved = persisted();
    if (!saved) return false;
    active = true;
    releaseCount = 0;
    shared.ensureCoordinator?.();
    scheduleReleaseAt(saved.nextReleaseAt);
    return true;
  };

  return Object.freeze({
    finish,
    getNextReleaseAt: () => nextReleaseAt,
    getReleaseCount: () => releaseCount,
    isActive: () => active,
    restore,
    start,
  });
}
