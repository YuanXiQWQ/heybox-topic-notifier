/** @file 定义可跨设备重放的编辑版本及确定性比较规则。 */

/** 编辑发生时固定的版本；重试和重新联网不改变任何字段。 */
export type EditStamp = {
  editedAt: number;
  counter: number;
  deviceId: string;
  operationId: string;
};
/** 兼容未记录版本的既有数据，其版本低于任何正常编辑。 */
export const baselineStamp: EditStamp = {
  editedAt: 0,
  counter: 0,
  deviceId: "baseline",
  operationId: "baseline",
};
/** 允许客户端时钟相对服务端的最大未来偏差。 */
export const maximumFutureSkewMs = 5 * 60 * 1000;
/** 当前服务进程的稳定标识，区分多实例同毫秒编辑。 */
const serverDeviceId = `server-${crypto.randomUUID()}`;
/** 当前进程最后生成的版本，保证同毫秒和时钟回退时的本机编辑顺序。 */
let previousServerEdit: EditStamp | undefined;

/**
 * 按编辑时间排序，同毫秒按本机逻辑序号及稳定标识解决平局。
 * @param {EditStamp} left 左侧版本。
 * @param {EditStamp} right 右侧版本。
 * @return {number} 正数表示左侧更新，零表示同一版本。
 */
export function compareEdits(left: EditStamp, right: EditStamp): number {
  for (
    const key of ["editedAt", "counter", "deviceId", "operationId"] as const
  ) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }
  return 0;
}

/**
 * 验证外部编辑版本；拒绝异常未来时间，不把上传时间替换为编辑时间。
 * @param {unknown} value 外部版本。
 * @param {number} now 服务端当前毫秒时间。
 * @return {EditStamp} 经过验证的不可变编辑标识。
 */
export function parseEditStamp(value: unknown, now = Date.now()): EditStamp {
  if (!value || typeof value !== "object") {
    throw new TypeError("Invalid edit stamp");
  }
  const stamp = value as EditStamp;
  if (
    !Number.isSafeInteger(stamp.editedAt) || stamp.editedAt <= 0 ||
    stamp.editedAt > now + maximumFutureSkewMs ||
    !Number.isSafeInteger(stamp.counter) || stamp.counter < 0 ||
    ![stamp.deviceId, stamp.operationId].every((id) =>
      typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id)
    )
  ) {
    throw new TypeError("Invalid edit stamp");
  }
  return {
    editedAt: stamp.editedAt,
    counter: stamp.counter,
    deviceId: stamp.deviceId,
    operationId: stamp.operationId,
  };
}

/**
 * 为没有客户端编辑版本的在线调用生成服务端版本。
 * @return {EditStamp} 当前在线操作的版本。
 */
export function serverEditStamp(): EditStamp {
  previousServerEdit = nextEditStamp(
    previousServerEdit,
    Date.now(),
    serverDeviceId,
  );
  return previousServerEdit;
}

/**
 * 在编辑发生时生成本机单调版本，调用方应与待同步操作一起持久化。
 * @param {EditStamp | undefined} previous 本机上一次编辑。
 * @param {number} now 已校准的当前毫秒时间。
 * @param {string} deviceId 持久设备标识。
 * @return {EditStamp} 新编辑版本。
 */
export function nextEditStamp(
  previous: EditStamp | undefined,
  now: number,
  deviceId: string,
): EditStamp {
  const editedAt = Math.max(now, previous?.editedAt ?? 0);
  return {
    editedAt,
    counter: editedAt === previous?.editedAt ? previous.counter + 1 : 0,
    deviceId,
    operationId: crypto.randomUUID(),
  };
}
