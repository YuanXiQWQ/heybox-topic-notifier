/**
 * @file 本文件用于验证多语言文案合并和兜底逻辑。
 */
import { getMessages, mergeMessages } from "./index.ts";
import type { Messages } from "./types.ts";

/**
 * 验证英文文案缺失字段时会回退到简体中文文案。
 */
Deno.test("English messages fall back to Simplified Chinese for missing keys", () => {
  const zhCN = getMessages("zh-CN");
  const partialEnglish: Partial<Messages> = {
    appName: "Test App",
  };
  const merged = mergeMessages(partialEnglish);

  if (merged.appName !== "Test App") {
    throw new Error(`Expected override appName, got ${merged.appName}`);
  }

  if (merged.settingsTitle !== zhCN.settingsTitle) {
    throw new Error(`Expected fallback settingsTitle, got ${merged.settingsTitle}`);
  }
});
