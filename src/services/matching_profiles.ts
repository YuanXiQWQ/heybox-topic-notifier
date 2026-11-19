/** @file 按稳定配置标识关联话题，让模型、提示词与高级限制随配置生效。 */
import type { AppSettings } from "../models.ts";
import {
  type MatchingSettings,
  normalizeMatchingSettings,
} from "./matching_settings.ts";

/** 默认配置使用账号的 matching 字段，兼容单配置客户端。 */
export type MatchingProfile = {
  id: string;
  name: string;
  options?: MatchingSettings;
};

/**
 * 返回有序的配置列表，为只有账号匹配设置的数据补上默认入口。
 * @param {AppSettings} app 账号设置。
 * @return {MatchingProfile[]} 具有默认入口的列表。
 */
export function matchingProfiles(app: AppSettings): MatchingProfile[] {
  const profiles = app.matchingProfiles ?? [];
  return profiles.some((p) => p.id === "default")
    ? profiles
    : [{ id: "default", name: "" }, ...profiles];
}

/**
 * 读取指定配置，找不到关联时使用默认配置。
 * @param {AppSettings} app 账号设置。
 * @param {string} id 配置标识。
 * @return {MatchingSettings} 话题实际使用的设置。
 */
export function matchingForProfile(
  app: AppSettings,
  id?: string,
): MatchingSettings {
  const options = id && id !== "default"
    ? app.matchingProfiles?.find((p) => p.id === id)?.options
    : undefined;
  return normalizeMatchingSettings({ ...app.matching, ...options });
}
