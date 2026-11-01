/** @file 补取前按权威工作区过滤已处理帖子，保留原始分页游标。 */
import { sessionTokenHash } from "../auth/session.ts";
import type { UserStorage } from "../storage/types.ts";

/**
 * 返回仍需提醒的帖子及独立服务通知；过滤项也由批次游标确认。
 * @param {UserStorage} storage 当前账号的存储。
 * @param {string | undefined} after 已消费游标，省略时只初始化。
 * @return {Promise<object>} 已过滤事件、原始末尾游标和后续分页标志。
 */
export async function readActiveNativeNotifications(storage: UserStorage, after?: string) {
  if (!storage.nativeNotifications) throw new Error("Notifications unavailable");
  const batch = await storage.nativeNotifications.read(after);
  const matches = batch.events.filter((event) => event.kind === "match" || (!event.kind && event.path === "/history"));
  if (!matches.length) return { ...batch, hasMore: batch.events.length === 100 };
  const references = storage.listPendingMatchReferences
    ? await storage.listPendingMatchReferences()
    : (await storage.listPendingMatches()).map((record) => ({ id: record.id, postId: record.post.id }));
  const ids = new Set(references.map((record) => record.id));
  // 未携带记录标识的持久事件使用记录摘要与当前工作区匹配。
  const legacyIds = matches.some((event) => !event.kind)
    ? new Set(await Promise.all([...ids].map(sessionTokenHash))) : new Set<string>();
  const active = batch.events.filter((event) => event.kind === "match"
    ? ids.has(event.matchId ?? "")
    : event.kind === "service" || event.path !== "/history" || legacyIds.has(event.id));
  return { events: active, cursor: batch.cursor, hasMore: batch.events.length === 100 };
}
