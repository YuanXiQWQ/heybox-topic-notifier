/** @file 验证系统默认、设备隔离、离线恢复以及账号同步边界。 */
import { runInNewContext } from "node:vm";
import { assertEquals, assertThrows } from "@std/assert";
import { localeFromRequest } from "./locales/locale.ts";
import { devicePreferenceCookie } from "./device_preferences.ts";
import { defaultAppSettingsFromEnv } from "./services/default_settings.ts";
import {
  initialSettingsSnapshot,
  mergeSettings,
  projectSettings,
  settingsEdits,
} from "./sync/settings.ts";

/**
 * 创建独立设备的 Cookie、系统明暗和页面事件环境。
 * @param {Map<string, string>} cookies 当前设备持久状态。
 * @param {boolean} dark 系统深色模式。
 * @param {boolean} legacy 是否模拟旧版媒体查询监听接口。
 * @param {Record<string, unknown>} bridges 本地队列能力替身。
 * @return {object} 页面偏好接口与可观测状态。
 */
function device(
  cookies = new Map<string, string>(),
  dark = true,
  legacy = false,
  bridges: Record<string, unknown> = {},
) {
  const listeners = new Map<string, () => void>();
  const documentListeners = new Map<string, (event?: object) => void>();
  const inputs = {
    dark: { checked: false },
    color: { value: "" },
    locale: { value: "" },
  };
  const root = {
    lang: "zh-CN",
    dataset: { colorMode: "light" },
    style: { setProperty() {} },
  };
  let writes = 0;
  let rejectWrites = false;
  const document = {
    documentElement: root,
    get cookie() {
      return [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
    },
    set cookie(value: string) {
      writes++;
      if (rejectWrites) return;
      const [key, text] = value.split(";")[0].split("=");
      cookies.set(key, text);
    },
    querySelector(selector: string) {
      return selector.includes("dark-mode")
        ? inputs.dark
        : selector.includes("theme-color")
        ? inputs.color
        : inputs.locale;
    },
    addEventListener(name: string, listener: (event?: object) => void) {
      documentListeners.set(name, listener);
    },
  };
  const media = {
    matches: dark,
    ...(legacy
      ? {
        addListener: (listener: () => void) => listeners.set("theme", listener),
      }
      : {
        addEventListener: (_name: string, listener: () => void) =>
          listeners.set("theme", listener),
      }),
  };
  const navigation: string[] = [];
  const navigator = { onLine: true };
  const api = runInNewContext(
    Deno.readTextFileSync(
      new URL("../static/device-preferences.js", import.meta.url),
    ) + "\napplicationAppearance",
    {
      document,
      navigator,
      URL,
      location: {
        protocol: "https:",
        href: "https://example.com/settings?locale=zh-CN",
        replace: (url: string) => navigation.push(url),
      },
      matchMedia: () => media,
      addEventListener: (name: string, listener: () => void) =>
        listeners.set(name, listener),
      ...bridges,
    },
  );
  return {
    api,
    media,
    inputs,
    root,
    cookies,
    listeners,
    documentListeners,
    navigator,
    navigation,
    writes: () => writes,
    blockWrites: () => {
      rejectWrites = true;
    },
  };
}

Deno.test("system appearance follows changes without saving and manual overrides stay on one device", () => {
  const phone = device();
  assertEquals(phone.root.dataset.colorMode, "dark");
  assertEquals(phone.inputs.dark.checked, true);
  phone.media.matches = false;
  phone.listeners.get("theme")!();
  assertEquals(phone.root.dataset.colorMode, "light");
  assertEquals(phone.writes(), 0);
  phone.api.save("darkMode", false);
  phone.api.save("themeColor", "#123abc");
  phone.media.matches = true;
  phone.listeners.get("theme")!();
  assertEquals(phone.root.dataset.colorMode, "light");
  assertEquals(phone.cookies.size, 2);
  const restarted = device(phone.cookies);
  assertEquals(restarted.root.dataset.colorMode, "light");
  assertEquals(restarted.inputs.color.value, "#123abc");
  assertEquals(restarted.writes(), 0);
  const desktop = device();
  assertEquals(desktop.root.dataset.colorMode, "dark");
  assertEquals(desktop.inputs.color.value, "#bd7fff");
  assertEquals(desktop.cookies.size, 0);
});

Deno.test("legacy WebView follows system notifications and respects explicit light mode", () => {
  const phone = device(new Map(), false, true);
  phone.documentListeners.get("application-native-state")!({
    detail: { systemDarkMode: true },
  });
  assertEquals(phone.root.dataset.colorMode, "dark");
  assertEquals(phone.writes(), 0);
  phone.api.save("darkMode", false);
  phone.documentListeners.get("application-native-state")!({
    detail: { systemDarkMode: true },
  });
  assertEquals(phone.root.dataset.colorMode, "light");
  phone.blockWrites();
  assertThrows(() => phone.api.save("darkMode", true));
  assertEquals(phone.root.dataset.colorMode, "light");
});

Deno.test("offline manual language persists locally and requests the new page when online", async () => {
  const phone = device();
  phone.navigator.onLine = false;
  phone.api.save("locale", "ja-JP");
  await phone.api.refreshLanguage();
  assertEquals(phone.navigation, []);
  assertEquals(device(phone.cookies).inputs.locale.value, "ja-JP");
  phone.navigator.onLine = true;
  await phone.api.refreshLanguage();
  assertEquals(phone.navigation, ["https://example.com/settings"]);
  assertEquals(device().cookies.size, 0);
});

Deno.test("language refresh waits for pending settings and retries after synchronization", async () => {
  let pending = [{ kind: "settings" }];
  let flushes = 0;
  const phone = device(new Map(), true, false, {
    applicationSync: {
      userId: "test-user",
      prepareForExit: () => Promise.resolve(),
      flush: () => {
        flushes++;
        return Promise.resolve();
      },
    },
    AppLocalStore: { pending: () => Promise.resolve(pending) },
  });
  phone.api.save("locale", "ja-JP");
  await phone.api.refreshLanguage();
  assertEquals(flushes, 1);
  assertEquals(phone.navigation, []);
  pending = [];
  phone.documentListeners.get("application-sync-complete")!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(phone.navigation, ["https://example.com/settings"]);
});

Deno.test("request language follows each device and invalid preferences fall back safely", () => {
  const request = (language: string, cookie = "") =>
    new Request("https://example.com/", {
      headers: { "accept-language": language, cookie },
    });
  assertEquals(localeFromRequest(request("ja-JP")), "ja-JP");
  assertEquals(localeFromRequest(request("en-GB")), "en-GB");
  assertEquals(
    localeFromRequest(request("ja-JP", "heybox-device-locale=ar-SA")),
    "ar-SA",
  );
  assertEquals(
    localeFromRequest(request("ko-KR", "heybox-device-locale=%XX")),
    "ko-KR",
  );
  assertEquals(
    devicePreferenceCookie("otherheybox-device-darkMode=true", "darkMode"),
    undefined,
  );
});

Deno.test("new and legacy appearance edits never participate in account sync", () => {
  const initial = defaultAppSettingsFromEnv();
  const stamp = {
    editedAt: 1000,
    counter: 0,
    deviceId: "phone",
    operationId: "edit",
  };
  assertEquals(
    settingsEdits(initial, {
      ...initial,
      darkMode: true,
      locale: "ja-JP",
      themeColor: "#123abc",
    }, stamp),
    [],
  );
  const snapshot = initialSettingsSnapshot(initial);
  snapshot.regions["setting/darkMode"] = { value: true, stamp };
  assertEquals(projectSettings(snapshot).darkMode, initial.darkMode);
  const result = mergeSettings(snapshot, [
    { region: "setting/locale", value: "ja-JP", stamp },
    { region: "setting/themeColor", value: "#123abc", stamp },
    {
      region: "setting/notificationEmailAddress",
      value: "new@example.com",
      stamp,
    },
  ]);
  assertEquals(result.applied, ["setting/notificationEmailAddress"]);
  assertEquals(result.snapshot.settings.locale, initial.locale);
  assertEquals(result.snapshot.settings.themeColor, initial.themeColor);
  assertEquals(
    result.snapshot.settings.notificationEmailAddress,
    "new@example.com",
  );
});
