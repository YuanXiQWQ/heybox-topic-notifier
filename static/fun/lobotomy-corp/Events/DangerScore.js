/**
 * @file 本文件集中定义《脑叶公司》彩蛋的危急值（Danger Score）规则。
 *
 * 彩蛋模块只通过这里的纯函数结算危急值：点数表集中在本文件，调用方传入事件类型、
 * 数量或异想体资料，拿到点数后交给警报生命周期，不再各自维护系数。
 *
 * 点数表（类型 → 一次事件提供的点数）：
 *
 * | 类型     | 点数 |
 * | -------- | ---- |
 * | 员工恐慌 | 2    |
 * | 员工死亡 | 4    |
 * | ZAYIN 级 | 5    |
 * | TETH 级  | 20   |
 * | HE 级    | 40   |
 * | WAW 级   | 60   |
 * | ALEPH 级 | 75   |
 * | 白夜     | 98   |
 *
 * 每个 Day 的危急值上限是 100，任何单笔贡献都由它封顶。
 */
// @ts-check

/** 每个 Day 的危急值上限；任何贡献都由它封顶。 */
export const dangerScoreLimit = 100;

/** 一个满编部门的员工数。 */
export const employeesPerDepartment = 5;

/** 除构筑部外，每个部门可容纳的异想体数量。 */
export const abnormalitiesPerDepartment = 4;

/** 构筑部（第 11 个部门）可容纳的异想体数量。 */
export const abnormalitiesInLastDepartment = 8;

/** 构筑部的部门序号。 */
export const lastDepartmentCount = 11;

/** 白夜 Simple Advent 里模拟死亡的普通使徒数量。 */
export const whiteNightApostleCount = 11;

/** 白夜的 canonical 编号；它在点数表里是特例。 */
export const whiteNightCanonicalId = 'T-03-46';

/** 员工事件的点数。 */
export const employeeDangerPoints = Object.freeze({
  death: 4,
  panic: 2,
});

/**
 * 异想体按风险等级提供的点数。
 *
 * @type {Readonly<Record<string, number>>}
 */
export const abnormalityDangerPoints = Object.freeze({
  ALEPH: 75,
  HE: 40,
  TETH: 20,
  WAW: 60,
  ZAYIN: 5,
});

/** 白夜的固定点数；它不走 ALEPH 的 75。 */
export const whiteNightDangerPoints = 98;

/**
 * 把任意点数封顶到允许范围。
 *
 * @param {number} score 待封顶的点数。
 * @return {number} 0 到上限之间的点数；非有限数按 0 处理。
 */
export function clampDangerScore(score) {
  if (!Number.isFinite(score)) return 0;
  return Math.min(dangerScoreLimit, Math.max(0, score));
}

/**
 * 计算当前已开放部门的员工总数。
 *
 * @param {number} departmentCount 当前已开放的部门数。
 * @return {number} 员工总数；部门数无效时返回 0。
 */
export function employeeCountForDepartments(departmentCount) {
  if (!Number.isFinite(departmentCount) || departmentCount <= 0) return 0;
  return Math.trunc(departmentCount) * employeesPerDepartment;
}

/**
 * 计算员工事件的危急值贡献。
 *
 * 这类贡献按“每名员工”计入，不除以部门数。
 *
 * @param {"death"|"panic"} kind 事件类型。
 * @param {number} count 员工数量。
 * @return {number} 危急值贡献。
 */
export function employeeDangerContribution(kind, count) {
  const points = employeeDangerPoints[kind];
  if (!points || !Number.isFinite(count) || count <= 0) return 0;
  return Math.trunc(count) * points;
}

/**
 * 计算一次普通异想体出逃的危急值贡献。
 *
 * 异想体贡献要除以当前已开放的部门数。
 *
 * @param {string} riskLevel 异想体风险等级。
 * @param {number} departmentCount 当前已开放的部门数。
 * @return {number} 危急值贡献；等级或部门数无效时返回 0。
 */
export function abnormalityEscapeDangerContribution(
    riskLevel,
    departmentCount,
) {
  const points = abnormalityDangerPoints[riskLevel] ?? 0;
  if (points <= 0 || !Number.isFinite(departmentCount) || departmentCount <= 0) {
    return 0;
  }
  return points / departmentCount;
}

/**
 * 统计可出逃异想体的数量与平均危急值基值。
 *
 * 取 `canBreach` 为 true 的条目，按风险等级点数求和；白夜按固定点数 98 计。
 * 数量与基值都从这里现算，数据变动后调用方无需改动。
 *
 * @param {Record<string, {canBreach?: boolean, riskLevel?: string}>|undefined} abnormalities 异想体资料。
 * @return {{averageDanger: number, count: number, totalDanger: number}} 统计结果。
 */
export function escapableAbnormalitySummary(abnormalities) {
  let count = 0;
  let totalDanger = 0;
  Object.entries(abnormalities ?? {}).forEach(([id, data]) => {
    if (data?.canBreach !== true) return;
    count += 1;
    const points = id === whiteNightCanonicalId
      ? whiteNightDangerPoints
      : data.riskLevel
      ? (abnormalityDangerPoints[data.riskLevel] ?? 0)
      : 0;
    totalDanger += points;
  });
  return {
    averageDanger: count > 0 ? totalDanger / count : 0,
    count,
    totalDanger,
  };
}

/**
 * 计算设施当前可容纳的异想体数量。
 *
 * @param {number} departmentCount 当前已开放的部门数。
 * @return {number} 可容纳数量；部门数无效时返回 0。
 */
export function abnormalityCapacity(departmentCount) {
  if (!Number.isFinite(departmentCount) || departmentCount <= 0) return 0;
  const regularDepartments = Math.min(
      departmentCount,
      lastDepartmentCount - 1,
  );
  return regularDepartments * abnormalitiesPerDepartment +
      (departmentCount >= lastDepartmentCount
        ? abnormalitiesInLastDepartment
        : 0);
}

/**
 * 计算“异想体全部出逃”的危急值贡献。
 *
 * 出逃数量取设施容量与可出逃异想体总数中较小者，每只按平均基值计入，最后除以
 * 当前已开放的部门数。结果可能超过上限，由 {@link clampDangerScore} 封顶。
 *
 * @param {Record<string, {canBreach?: boolean, riskLevel?: string}>|undefined} abnormalities 异想体资料。
 * @param {number} departmentCount 当前已开放的部门数。
 * @return {number} 危急值贡献；部门数无效时返回 0。
 */
export function escapeAllDangerContribution(abnormalities, departmentCount) {
  if (!Number.isFinite(departmentCount) || departmentCount <= 0) return 0;
  const summary = escapableAbnormalitySummary(abnormalities);
  const escaping = Math.min(
      abnormalityCapacity(departmentCount),
      summary.count,
  );
  return escaping * summary.averageDanger / departmentCount;
}
