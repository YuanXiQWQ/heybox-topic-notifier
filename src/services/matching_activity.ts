/** @file 根据话题列表的实际更新速度平滑调整滑动缓存期限。 */
import type { PollingSettings } from "../models.ts";
import type { TopicActivity } from "../storage/matching_types.ts";

/** 一天的毫秒数，用于将不同轮询间隔统一为日更新速率。 */
export const matchingDayMs = 86400000;

/**
 * 更新独立于判定缓存的列表观测，满一天后按小时平滑调整期限。
 * @param {TopicActivity | undefined} previous 之前的观测。
 * @param {string[]} ids 本次实际返回的不同帖子 ID。
 * @param {PollingSettings} polling 轮询窗口与排序设置。
 * @param {number} now 本次成功拉取时间。
 * @return {TopicActivity} 新的统计和一至三十天的滑动期限。
 */
export function observeTopic(
  previous: TopicActivity | undefined,
  ids: string[],
  polling: PollingSettings,
  now: number,
): TopicActivity {
  const signature = JSON.stringify([
    polling.postLimit,
    polling.intervalUnit,
    polling.intervalValue,
    polling.sort,
  ]);
  const unique = [...new Set(ids)].slice(0, 500);
  const unitMs = {
    second: 1000,
    minute: 60000,
    hour: 3600000,
    day: matchingDayMs,
    week: 7 * matchingDayMs,
    month: 30 * matchingDayMs,
  };
  const gapLimit = Math.max(
    3600000,
    polling.intervalValue * unitMs[polling.intervalUnit] * 3,
  );
  if (
    !previous || previous.signature !== signature ||
    now - previous.lastObservedAt > gapLimit
  ) {
    return {
      signature,
      previousIds: unique,
      startedAt: now,
      lastObservedAt: now,
      observedMs: 0,
      newPosts: 0,
      observations: 1,
      checked: 0,
      hits: 0,
      ttlDays: previous?.ttlDays ?? 7,
      ratePerDay: 0,
      lastAdjustedAt: now,
      saturated: false,
    };
  }
  const next = { ...previous };
  const oldIds = new Set(previous.previousIds);
  const fresh = unique.filter((id) => !oldIds.has(id)).length;
  next.observedMs += Math.max(0, now - previous.lastObservedAt);
  next.newPosts += fresh;
  next.observations++;
  next.previousIds = unique;
  next.lastObservedAt = now;
  next.saturated = unique.length >= polling.postLimit &&
    fresh === unique.length;
  if (
    next.observedMs >= matchingDayMs && next.observations >= 3 &&
    now - next.lastAdjustedAt >= 3600000
  ) {
    const rate = next.newPosts * matchingDayMs / next.observedMs;
    next.ratePerDay = previous.ratePerDay
      ? previous.ratePerDay * 0.7 + rate * 0.3
      : rate;
    const window = Math.max(
      1,
      Math.min(polling.postLimit, unique.length || polling.postLimit),
    );
    const hitRatio = next.checked ? next.hits / next.checked : 0;
    const target = Math.min(
      30,
      Math.max(
        polling.sort === "publishTime" ? 1 : 7,
        rate === 0
          ? 30
          : 3 * window / next.ratePerDay * (hitRatio >= 0.9 ? 1.25 : 1),
      ),
    );
    next.ttlDays = Math.min(
      30,
      Math.max(
        1,
        Math.min(
          previous.ttlDays * 1.25,
          Math.max(previous.ttlDays * 0.75, target),
        ),
      ),
    );
    next.lastAdjustedAt = now;
    // 保留约一天的滚动权重，避免早期流量永久主导期限。
    next.newPosts *= 0.9;
    next.observedMs *= 0.9;
    next.checked *= 0.9;
    next.hits *= 0.9;
  }
  return next;
}
