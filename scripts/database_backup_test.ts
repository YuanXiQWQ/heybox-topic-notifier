/** @file 通过真实 SQLite 验证密文完整性、二进制数据、恢复触发器与逐表摘要。 */
import { DatabaseSync } from "node:sqlite";
import type { Client } from "@libsql/client/web";
import { assertEquals } from "../src/test_helpers.ts";
import { MemorySqlClient } from "../src/storage/sqlite_test_helpers.ts";
import { decryptSnapshot, encryptSnapshot, readSnapshot, restoreInDatabase } from "./database_backup.ts";

Deno.test("encrypted database backup restores rows, blobs and triggers and rejects corruption", async () => {
  const source = new MemorySqlClient();
  const restored = new DatabaseSync(":memory:");
  try {
    await source.execute("CREATE TABLE documents (id INTEGER PRIMARY KEY, content TEXT, bytes BLOB)");
    await source.execute("CREATE TABLE totals (value INTEGER NOT NULL)");
    await source.execute("INSERT INTO totals VALUES (0)");
    await source.execute("CREATE TRIGGER document_count AFTER INSERT ON documents BEGIN UPDATE totals SET value=value+1; END");
    await source.execute({ sql: "INSERT INTO documents VALUES (?, ?, ?)", args: [1, "private-content", new Uint8Array([0, 255, 17])] });
    const client = { transaction: () => Promise.resolve({ execute: source.execute.bind(source), commit: () => Promise.resolve(), close: () => {} }) } as unknown as Client;
    const snapshot = await readSnapshot(client);
    const keys = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
    const encrypted = await encryptSnapshot(snapshot, keys.publicKey);
    assertEquals(encrypted.includes("private-content"), false);
    const decoded = await decryptSnapshot(encrypted, keys.privateKey);
    assertEquals(await restoreInDatabase(decoded, restored), { tables: 2, rows: 2 });
    assertEquals(restored.prepare("SELECT content FROM documents").get()?.content, "private-content");
    assertEquals(Array.from(restored.prepare("SELECT bytes FROM documents").get()?.bytes as Uint8Array), [0, 255, 17]);
    restored.exec("INSERT INTO documents (id) VALUES (2)");
    assertEquals(restored.prepare("SELECT value FROM totals").get()?.value, 2);
    const corrupted = JSON.parse(encrypted);
    corrupted.ciphertext = (corrupted.ciphertext[0] === "A" ? "B" : "A") + corrupted.ciphertext.slice(1);
    let rejected = false;
    try { await decryptSnapshot(JSON.stringify(corrupted), keys.privateKey); } catch { rejected = true; }
    assertEquals(rejected, true);
    const damaged = structuredClone(decoded);
    damaged.tables[0].rows[0][1] = "wrong-content";
    const invalidRestore = new DatabaseSync(":memory:");
    try {
      rejected = false;
      try { await restoreInDatabase(damaged, invalidRestore); } catch { rejected = true; }
      assertEquals(rejected, true);
    } finally { invalidRestore.close(); }
  } finally { source.close(); restored.close(); }
});
