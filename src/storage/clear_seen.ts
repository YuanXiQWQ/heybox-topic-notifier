/**
 * @file 本文件用于清理旧版本遗留的已读帖子记录。
 */
/**
 * Deno KV 存储实例。
 */
const kv = await Deno.openKv();
/**
 * 已删除的遗留记录数量。
 */
let deletedCount = 0;

for await (const entry of kv.list({ prefix: ["seen"] })) {
  await kv.delete(entry.key);
  deletedCount += 1;
}

console.log(`Deleted ${deletedCount} legacy seen records.`);
