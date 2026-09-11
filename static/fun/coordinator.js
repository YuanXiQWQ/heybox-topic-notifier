/**
 * @file 本文件协调不同游戏的彩蛋，确保同一时间只有一个游戏的彩蛋处于活动状态。
 */
// @ts-check

/**
 * 当前活动彩蛋所属游戏及其停止操作。
 *
 * @type {{gameId: string, stop: () => void}|undefined}
 */
let activeEasterEgg;

/**
 * 将指定游戏标记为活动彩蛋，并停止其它游戏的彩蛋。
 *
 * 同一游戏内的重复启动不会触发停止操作，其内部切换由该游戏自行管理。
 *
 * @param {string} gameId 游戏彩蛋的唯一标识。
 * @param {() => void} stop 停止本次彩蛋的操作。
 */
function startEasterEgg(gameId, stop) {
  if (activeEasterEgg?.gameId === gameId) {
    return;
  }

  const previousEasterEgg = activeEasterEgg;
  activeEasterEgg = { gameId, stop };
  previousEasterEgg?.stop();
}

/**
 * 结束指定游戏的活动彩蛋。
 *
 * 停止操作也参与身份校验，避免已经被打断的旧彩蛋结束时清除后来启动的彩蛋。
 *
 * @param {string} gameId 游戏彩蛋的唯一标识。
 * @param {() => void} stop 启动彩蛋时登记的停止操作。
 */
function finishEasterEgg(gameId, stop) {
  if (
    activeEasterEgg?.gameId === gameId && activeEasterEgg.stop === stop
  ) {
    activeEasterEgg = undefined;
  }
}

globalThis.easterEggCoordinator = Object.freeze({
  finish: finishEasterEgg,
  start: startEasterEgg,
});
