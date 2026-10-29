/** @file 验证旧 WebView 主题计算、实时切换与现代浏览器的原生颜色路径。 */
import { runInNewContext } from "node:vm";
import { assertEquals } from "@std/assert";

/**
 * 以真实主题脚本验证缺少 color-mix 的环境，不引入浏览器全局补丁。
 * @param {boolean} modern 是否支持原生颜色混合。
 * @return {Promise<object>} 主题输入、输出和属性变更回调。
 */
async function themeHarness(modern = false) {
  const root = { dataset: { colorMode: "light" }, style: {
    setProperty(name: string, value: string) { values.set(name, value); writes++; },
  } };
  let theme = "#BD7FFF", writes = 0;
  const values = new Map<string, string>();
  let change = () => {};
  runInNewContext(await Deno.readTextFile(new URL("../static/theme-compat.js", import.meta.url)), {
    CSS: { supports: () => modern },
    document: { documentElement: root },
    getComputedStyle: () => ({ getPropertyValue(name: string) {
      if (name === "--theme-color") return theme;
      const colors: Record<string, [string, string]> = {
        "--ink": ["#1D232A", "#E7EBEF"],
        "--link-base": ["#0B4F87", "#B9D9FF"],
        "--surface-soft-base": ["#F6F7F8", "#1F252D"],
        "--border": ["#DFE4EA", "#313842"],
        "--muted-strong": ["#405060", "#C4CBD3"],
      };
      return colors[name][root.dataset.colorMode === "dark" ? 1 : 0];
    } }),
    MutationObserver: class {
      constructor(callback: () => void) { change = callback; }
      observe() {}
    },
  });
  return { values, root, change, writes: () => writes,
    setTheme(value: string) { theme = value; change(); } };
}

Deno.test("legacy theme retains opaque controls across custom color and dark mode changes", async () => {
  const fixture = await themeHarness();
  assertEquals(fixture.values.get("--theme-strong"), "rgb(160, 110, 217)");
  assertEquals(fixture.values.get("--bg"), "rgb(243, 241, 248)");
  const writes = fixture.writes();
  fixture.change();
  assertEquals(fixture.writes(), writes);
  fixture.setTheme("#00ff00");
  assertEquals(fixture.values.get("--theme-strong"), "rgb(5, 215, 8)");
  fixture.root.dataset.colorMode = "dark";
  fixture.change();
  assertEquals(fixture.values.get("--theme-strong"), "rgb(42, 251, 43)");
  assertEquals(fixture.values.get("--bg"), "rgb(15, 36, 21)");
  fixture.setTheme("#0f0");
  assertEquals(fixture.values.get("--theme-strong"), "rgb(42, 251, 43)");
});

Deno.test("native color mixing does not receive inline fallback overrides", async () => {
  const fixture = await themeHarness(true);
  assertEquals(fixture.writes(), 0);
  fixture.setTheme("#00ff00");
  assertEquals(fixture.writes(), 0);
});
