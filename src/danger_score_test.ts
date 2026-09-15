/**
 * @file 本文件验证《脑叶公司》彩蛋集中定义的危急值规则。
 */
import { assertEquals } from "./test_helpers.ts";
import {
  abnormalityCapacity,
  abnormalityDangerPoints,
  abnormalityEscapeDangerContribution,
  clampDangerScore,
  dangerScoreLimit,
  employeeCountForDepartments,
  employeeDangerContribution,
  employeeDangerPoints,
  escapableAbnormalitySummary,
  escapeAllDangerContribution,
  specialEventDangerAbnormalityIds,
  whiteNightApostleCount,
  whiteNightDangerPoints,
} from "../static/fun/lobotomy-corp/Events/DangerScore.js";

/** 页面注入页使用的异想体资料，与运行时来源一致。 */
const abnormalities = JSON.parse(
  Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/Data/Abnormalities.json",
      import.meta.url,
    ),
  ),
) as Record<string, { canBreach?: boolean; riskLevel?: string }>;

Deno.test("danger score keeps the rule table and the hard limit", () => {
  assertEquals(dangerScoreLimit, 100);
  assertEquals(employeeDangerPoints, { death: 4, panic: 2 });
  assertEquals(abnormalityDangerPoints, {
    ALEPH: 75,
    HE: 40,
    TETH: 20,
    WAW: 60,
    ZAYIN: 5,
  });
  assertEquals(whiteNightDangerPoints, 98);
  assertEquals(clampDangerScore(120), 100);
  assertEquals(clampDangerScore(-5), 0);
  assertEquals(clampDangerScore(Number.NaN), 0);
});

Deno.test("danger score counts employees per full department", () => {
  // 一个部门满编 5 人：3 个部门共 15 人。
  assertEquals(employeeCountForDepartments(3), 15);
  assertEquals(employeeDangerContribution("death", 15), 60);
  assertEquals(employeeDangerContribution("panic", 15), 30);
  assertEquals(employeeDangerContribution("death", 0), 0);
  assertEquals(employeeCountForDepartments(0), 0);
  // 白夜 Prelude 沿用同一条员工死亡规则：11 名普通使徒 × 4 = 44。
  assertEquals(
    employeeDangerContribution("death", whiteNightApostleCount),
    44,
  );
});

Deno.test("danger score divides abnormality escapes by open departments", () => {
  assertEquals(abnormalityEscapeDangerContribution("ALEPH", 3), 25);
  assertEquals(abnormalityEscapeDangerContribution("ZAYIN", 5), 1);
  assertEquals(abnormalityEscapeDangerContribution("UNKNOWN", 3), 0);
  assertEquals(abnormalityEscapeDangerContribution("ALEPH", 0), 0);
});

Deno.test("danger score derives escapable values from the abnormality data", () => {
  // 全部出逃均值排除由事件自行结算的三鸟、终末鸟与白夜。
  assertEquals([...specialEventDangerAbnormalityIds], [
    "O-02-40",
    "O-02-56",
    "O-02-62",
    "O-02-63",
    "T-03-46",
  ]);
  // 剩余普通可出逃条目：36 只，总点数 1755。
  const summary = escapableAbnormalitySummary(abnormalities);
  assertEquals(summary.count, 36);
  assertEquals(summary.totalDanger, 1755);
  assertEquals(summary.averageDanger, 1755 / 36);

  // 设施容量：每部门 4 只，构筑部 8 只。
  assertEquals(abnormalityCapacity(3), 12);
  assertEquals(abnormalityCapacity(11), 48);
  assertEquals(abnormalityCapacity(0), 0);

  // 出逃数量取容量与可出逃总数的较小者，再按平均基值除以部门数。
  assertEquals(
    escapeAllDangerContribution(abnormalities, 3),
    12 * (1755 / 36) / 3,
  );
  assertEquals(
    escapeAllDangerContribution(abnormalities, 11),
    36 * (1755 / 36) / 11,
  );
  assertEquals(escapeAllDangerContribution(undefined, 3), 0);
  assertEquals(escapeAllDangerContribution(abnormalities, 0), 0);
});
