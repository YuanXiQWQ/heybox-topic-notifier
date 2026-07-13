const kv = await Deno.openKv();
let deletedCount = 0;

for await (const entry of kv.list({ prefix: ["seen"] })) {
  await kv.delete(entry.key);
  deletedCount += 1;
}

console.log(`Deleted ${deletedCount} legacy seen records.`);
