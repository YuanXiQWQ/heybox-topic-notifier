/** @file 提供账号隔离的角标快照，并跳过未变化的工作区记录读取。 */
import type { UserStorage } from "../storage/types.ts";

/** 完整快照用于离线投影，未变化响应仅确认已保存的同账号基线。 */
export type NativeBadgeSnapshot =
  | { userId: string; version: string; unchanged: true }
  | { userId: string; count: number; records: Array<{ id: string; postId: string }>; version?: string };

/**
 * 读取角标基线，先读取版本以便并发写入能在后续检查中被发现。
 * @param {UserStorage} storage 已认证账号的存储。
 * @param {string} userId 已认证账号标识。
 * @param {string | undefined} previousVersion 客户端基线版本；省略时保留完整响应。
 * @return {Promise<NativeBadgeSnapshot>} 完整基线或未变化标识。
 */
export async function readNativeBadge(
  storage: UserStorage,
  userId: string,
  previousVersion?: string,
): Promise<NativeBadgeSnapshot> {
  const version = previousVersion !== undefined
    ? await storage.getDashboardVersion?.()
    : undefined;
  if (version && previousVersion === version) return { userId, version, unchanged: true };
  const records = storage.listPendingMatchReferences
    ? await storage.listPendingMatchReferences()
    : (await storage.listPendingMatches()).map((record) => ({ id: record.id, postId: record.post.id }));
  return {
    userId,
    count: new Set(records.map((record) => record.postId)).size,
    records,
    ...(version ? { version } : {}),
  };
}
