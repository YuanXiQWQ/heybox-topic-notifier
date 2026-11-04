/** @file 验证离线历法模块在普通页面与带 AMD 加载器的页面上独立提供接口。 */
import { assertEquals, assertMatch } from "@std/assert";

Deno.test("lunar ES module exports remain independent of host AMD loaders", async () => {
  const source = await Deno.readTextFile(
    new URL("../../static/vendor/lunar/lunar.js", import.meta.url),
  );
  // 按语法标记识别导出声明，不依赖格式化空格；声明缺失时直接报告断言错误。
  const exportDeclaration = /export\s+const\s*\{\s*Solar\s*,\s*Lunar\s*,\s*LunarYear\s*\}\s*=\s*([\w.]+)\s*;/;
  assertMatch(source, exportDeclaration);
  // 在严格模式宿主中执行相同模块正文，仅将导出语句映射为可观察返回值。
  const load = new Function(
    "define",
    '"use strict";\n' + source.replace(
      exportDeclaration,
      "return $1;",
    ),
  );
  let registrations = 0;
  /** 记录宿主 AMD 注册次数，模块不应把导出交给此加载器。 */
  const define = Object.assign(() => {
    registrations++;
  }, { amd: {} });
  for (const hostDefine of [undefined, define]) {
    const api = load(hostDefine);
    assertEquals(typeof api.Solar.fromYmd, "function");
    assertEquals(typeof api.Lunar.fromYmd, "function");
    assertEquals(typeof api.LunarYear.fromYear, "function");
    assertEquals(api.Solar.fromYmd(2024, 2, 10).getLunar().getDay(), 1);
    assertEquals(api.LunarUtil.hex(15), "0F");
    assertEquals(api.LunarUtil.hex(16), "10");
  }
  assertEquals(registrations, 0);
});
