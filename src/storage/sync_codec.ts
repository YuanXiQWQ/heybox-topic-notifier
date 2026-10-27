/** @file 压缩包含区域版本的同步快照，避免重复设置占满 KV 单值空间。 */
import type { SettingsSyncSnapshot } from "../sync/settings.ts";

/** 可读取普通快照以接纳未压缩的持久数据。 */
export type StoredSettingsSync = SettingsSyncSnapshot | Uint8Array;

/**
 * 压缩同步版本及其业务投影，事务仍只写入一个版本键。
 * @param {SettingsSyncSnapshot} snapshot 完整快照。
 * @return {Promise<Uint8Array>} GZIP 数据。
 */
export async function encodeSettingsSync(
  snapshot: SettingsSyncSnapshot,
): Promise<Uint8Array> {
  const stream = new Blob([JSON.stringify(snapshot)]).stream().pipeThrough(
    new CompressionStream("gzip"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * 读取压缩或普通快照，格式错误直接报告，避免将损坏数据当成初始设置。
 * @param {StoredSettingsSync} stored 持久数据。
 * @return {Promise<SettingsSyncSnapshot>} 完整快照。
 */
export async function decodeSettingsSync(
  stored: StoredSettingsSync,
): Promise<SettingsSyncSnapshot> {
  if (!(stored instanceof Uint8Array)) return stored;
  const stream = new Blob([new Uint8Array(stored)]).stream().pipeThrough(
    new DecompressionStream("gzip"),
  );
  return await new Response(stream).json();
}
