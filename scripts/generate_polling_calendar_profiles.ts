/** @file 从固定版本农历库生成选择器支持范围内的历法结构，用于跨历法循环覆盖证明。 */
import { LunarYear } from "../static/vendor/lunar/lunar.js";
import { calendarYears, cycleYear } from "../static/polling-calendar.js";

/** 每种结构只保存一次，避免运行时逐年计算天文历法。 */
const profiles = new Map<string, number[]>();
for (let year = calendarYears.min - 1; year <= calendarYears.max; year++) {
  const months = LunarYear.fromYear(year).getMonths().filter((
    month: { getYear(): number },
  ) => month.getYear() === year);
  const first = new Date(
    (months[0].getFirstJulianDay() - 2440587.5) * 86400000,
  );
  const start = first.getUTCMonth() * 31 + first.getUTCDate() - 1;
  const solarYear = first.getUTCFullYear();
  const leap =
    Number(new Date(Date.UTC(solarYear, 1, 29)).getUTCMonth() === 1) |
    (Number(new Date(Date.UTC(solarYear + 1, 1, 29)).getUTCMonth() === 1) << 1);
  const leapMonth = months.find((month: { getMonth(): number }) =>
    month.getMonth() < 0
  )?.getMonth() || 0;
  const lengths = months.reduce(
    (bits: number, month: { getDayCount(): number }, index: number) =>
      bits | ((month.getDayCount() - 29) << index),
    0,
  );
  const profile = [
    cycleYear(year),
    cycleYear(solarYear),
    start,
    leap,
    -leapMonth,
    lengths,
  ];
  profiles.set(profile.join(","), profile);
}
/** 固定顺序让生成结果可审阅并可重复验证。 */
const values = [...profiles.values()].sort((a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
});
await Deno.writeTextFile(
  new URL("../static/polling-calendar-profiles.js", import.meta.url),
  `/** @file 自动生成的历法结构；运行 scripts/generate_polling_calendar_profiles.ts 更新。\n * 来自 lunar-javascript 1.7.7，覆盖选择器支持的 ${calendarYears.min}—${calendarYears.max} 年。\n * 每项依次为农历干支序号、公历干支序号、年初公历日期槽位、两年公历闰年位、闰月和月长位。 */\n/** 去重后的所有实际历法结构，用于逐日验证循环区间并集。 */\nexport const calendarProfiles = [\n${
    values.map((v) => "  [" + v.join(",") + "],").join("\n")
  }\n];\n`,
);
console.log(`历法结构：${values.length}`);
