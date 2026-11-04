/** @file 验证设备偏好与设置导航的委托点击只处理 DOM 元素，并保留正常链接行为。 */
import { runInNewContext } from "node:vm";
import { assertEquals } from "@std/assert";

Deno.test("native navigation platform is set before appearance reads page elements", async () => {
  const source = await Deno.readTextFile(
    new URL("../../static/device-preferences.js", import.meta.url),
  );
  for (const platform of ["windows", "android", undefined]) {
    const dataset: Record<string, string> = {};
    runInNewContext(source, {
      appNative: platform === "windows" ? {} : undefined,
      HeyboxNative: platform === "android" ? {} : undefined,
      document: {
        cookie: "",
        documentElement: { dataset, style: { setProperty() {} } },
        querySelector() {
          assertEquals(dataset.applicationPlatform, platform);
          return null;
        },
        addEventListener() {},
      },
      addEventListener() {},
    });
    assertEquals(dataset.applicationPlatform, platform);
  }
});

for (const file of ["device-preferences.js", "settings-navigation.js"]) {
  Deno.test(`${file} ignores non-element targets and handles links`, async () => {
    const source = await Deno.readTextFile(
      new URL(`../../static/${file}`, import.meta.url),
    );
    const listeners = new Map<string, (event: object) => void>();
    let savedPosition = "";
    /** 模拟可被委托选择器命中的页面链接。 */
    class Link {
      href = "https://example.com/settings?locale=ja-JP";
      target = "_self";
      /** @return {Link} 当前匹配链接。 */
      closest() {
        return this;
      }
    }
    // 浏览器替身成员由动态载入的脚本访问。
    // noinspection JSUnusedGlobalSymbols
    const document = {
      cookie: "",
      body: { dataset: {} },
      documentElement: { dataset: {}, style: { setProperty() {} } },
      querySelector: () => null,
      addEventListener: (name: string, listener: (event: object) => void) =>
        listeners.set(name, listener),
    };
    runInNewContext(source, {
      document,
      Element: Link,
      URL,
      location: new URL("https://example.com/settings"),
      addEventListener() {},
      scrollX: 12,
      scrollY: 34,
      sessionStorage: {
        setItem: (_key: string, value: string) => savedPosition = value,
      },
    });
    const click = listeners.get("click")!;
    for (const target of [null, {}, document]) click({ target, button: 0 });
    assertEquals(document.cookie, "");
    assertEquals(savedPosition, "");
    click({ target: new Link(), button: 0 });
    if (file === "device-preferences.js") {
      assertEquals(
        document.cookie.startsWith("heybox-device-locale=ja-JP;"),
        true,
      );
    } else assertEquals(JSON.parse(savedPosition), { x: 12, y: 34 });
  });
}
