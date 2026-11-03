/** @file 将一致的 Turso 快照加密导出，并在全新 SQLite 文件中验证恢复内容。 */
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { Client } from "@libsql/client/web";

/** 保留 SQLite 整数和二进制类型，避免 JSON 转换改变业务数据。 */
type Cell = string | number | null | { type: "bigint" | "blob"; value: string };
/** 单表数据、列序与独立内容摘要。 */
type BackupTable = {
  name: string;
  columns: string[];
  rows: Cell[][];
  digest: string;
};
/** 完整用户 schema 与同一事务快照中的表内容。 */
export type DatabaseSnapshot = {
  version: 1;
  createdAt: string;
  schema: { type: string; sql: string }[];
  tables: BackupTable[];
};
/** 只包含密文及解密所需的公开参数，不携带数据库凭据或私钥。 */
type EncryptedBackup = {
  format: "heybox-backup-v1";
  algorithm: "RSA-OAEP-SHA256+AES-256-GCM+gzip";
  key: string;
  iv: string;
  ciphertext: string;
};

/**
 * 在只读事务中导出表结构和全部数据，不调用业务存储的自动 schema 升级。
 * @param {Client} client 已配置连接的 libSQL 客户端。
 * @return {Promise<DatabaseSnapshot>} 一致的业务快照。
 */
export async function readSnapshot(client: Client): Promise<DatabaseSnapshot> {
  const transaction = await client.transaction("read");
  try {
    const schema = await transaction.execute(
      "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name",
    );
    const tables: BackupTable[] = [];
    for (const entry of schema.rows.filter((row) => row.type === "table")) {
      const name = String(entry.name);
      const result = await transaction.execute(
        `SELECT * FROM ${identifier(name)}`,
      );
      const rows = result.rows.map((row) =>
        result.columns.map((column) => encodeCell(row[column]))
      );
      tables.push({
        name,
        columns: result.columns,
        rows,
        digest: await rowDigest(rows),
      });
    }
    await transaction.commit();
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      schema: schema.rows.map((row) => ({
        type: String(row.type),
        sql: String(row.sql),
      })),
      tables,
    };
  } finally {
    transaction.close();
  }
}

/**
 * 每次使用独立 AES 密钥加密压缩后的快照，仅公钥可部署到备份服务器。
 * @param {DatabaseSnapshot} snapshot 一致快照。
 * @param {CryptoKey} publicKey RSA-OAEP 公钥。
 * @return {Promise<string>} 可直接写入文件的密文封装。
 */
export async function encryptSnapshot(
  snapshot: DatabaseSnapshot,
  publicKey: CryptoKey,
): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const compressed = new Uint8Array(
    await new Response(
      new Blob([JSON.stringify(snapshot)]).stream().pipeThrough(
        new CompressionStream("gzip"),
      ),
    ).arrayBuffer(),
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    compressed,
  );
  const wrapped = await crypto.subtle.encrypt(
    "RSA-OAEP",
    publicKey,
    await crypto.subtle.exportKey("raw", key),
  );
  const envelope: EncryptedBackup = {
    format: "heybox-backup-v1",
    algorithm: "RSA-OAEP-SHA256+AES-256-GCM+gzip",
    key: base64(new Uint8Array(wrapped)),
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}

/**
 * 验证密文完整性并解密到内存；私钥始终由备份接收方保管。
 * @param {string} content 密文封装。
 * @param {CryptoKey} privateKey RSA-OAEP 私钥。
 * @return {Promise<DatabaseSnapshot>} 已认证的原始快照。
 */
export async function decryptSnapshot(
  content: string,
  privateKey: CryptoKey,
): Promise<DatabaseSnapshot> {
  const envelope = JSON.parse(content) as EncryptedBackup;
  if (
    envelope.format !== "heybox-backup-v1" ||
    envelope.algorithm !== "RSA-OAEP-SHA256+AES-256-GCM+gzip"
  ) throw new Error("Unsupported backup format.");
  const raw = await crypto.subtle.decrypt(
    "RSA-OAEP",
    privateKey,
    unbase64(envelope.key),
  );
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "decrypt",
  ]);
  const compressed = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unbase64(envelope.iv) },
    key,
    unbase64(envelope.ciphertext),
  );
  const snapshot = JSON.parse(
    await new Response(
      new Blob([compressed]).stream().pipeThrough(
        new DecompressionStream("gzip"),
      ),
    ).text(),
  ) as DatabaseSnapshot;
  if (snapshot.version !== 1) throw new Error("Unsupported snapshot version.");
  return snapshot;
}

/**
 * 在新建文件中恢复全部表、索引与触发器，并逐表比较摘要与 SQLite 完整性。
 * @param {DatabaseSnapshot} snapshot 已解密的可信快照。
 * @param {string} destination 不存在的本地 SQLite 文件路径。
 * @return {Promise<{tables: number, rows: number}>} 恢复并核验的表和行数。
 */
export async function restoreSnapshot(
  snapshot: DatabaseSnapshot,
  destination: string,
) {
  const file = await Deno.open(destination, {
    createNew: true,
    write: true,
    mode: 0o600,
  });
  file.close();
  const database = new DatabaseSync(destination);
  try {
    return await restoreInDatabase(snapshot, database);
  } finally {
    database.close();
  }
}

/**
 * 在空数据库连接中恢复并核对快照，支持内存恢复演练。
 * @param {DatabaseSnapshot} snapshot 已认证的快照。
 * @param {DatabaseSync} database 空 SQLite 数据库。
 * @return {Promise<{tables: number, rows: number}>} 核验后的表与行数。
 */
export async function restoreInDatabase(
  snapshot: DatabaseSnapshot,
  database: DatabaseSync,
) {
  try {
    database.exec("BEGIN IMMEDIATE");
    for (
      const entry of snapshot.schema.filter((entry) => entry.type === "table")
    ) database.exec(entry.sql);
    for (const table of snapshot.tables) {
      const statement = database.prepare(
        `INSERT INTO ${identifier(table.name)} (${
          table.columns.map(identifier).join(",")
        }) VALUES (${table.columns.map(() => "?").join(",")})`,
      );
      for (const row of table.rows) statement.run(...row.map(decodeCell));
    }
    for (
      const entry of snapshot.schema.filter((entry) => entry.type !== "table")
    ) database.exec(entry.sql);
    database.exec("COMMIT");
    if (
      database.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok"
    ) throw new Error("SQLite integrity check failed.");
    for (const table of snapshot.tables) {
      const statement = database.prepare(
        `SELECT * FROM ${identifier(table.name)}`,
      );
      statement.setReadBigInts(true);
      const rows = statement.all().map((row) =>
        table.columns.map((column) => encodeCell(row[column]))
      );
      if (await rowDigest(rows) !== table.digest) {
        throw new Error("Restored content does not match backup.");
      }
    }
    return {
      tables: snapshot.tables.length,
      rows: snapshot.tables.reduce(
        (total, table) => total + table.rows.length,
        0,
      ),
    };
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch { /* 已完成事务的核验失败不执行补写。 */ }
    throw error;
  }
}

/** @param {string} name SQL 标识符。 @return {string} 转义后的标识符。 */
function identifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
/** @param {unknown} value SQLite 单元格。 @return {Cell} 无损 JSON 表示。 */
function encodeCell(value: unknown): Cell {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "bigint") {
    return { type: "bigint", value: value.toString() };
  }
  if (value instanceof ArrayBuffer) {
    return { type: "blob", value: base64(new Uint8Array(value)) };
  }
  if (value instanceof Uint8Array) {
    return { type: "blob", value: base64(value) };
  }
  throw new Error("Unsupported SQLite value.");
}
/** @param {Cell} value 编码的单元格。 @return {SQLInputValue} SQLite 参数。 */
function decodeCell(value: Cell): SQLInputValue {
  return value && typeof value === "object"
    ? value.type === "bigint" ? BigInt(value.value) : unbase64(value.value)
    : value;
}
/** @param {Cell[][]} rows 表中所有行。 @return {Promise<string>} 不依赖行序的 SHA-256 摘要。 */
async function rowDigest(rows: Cell[][]): Promise<string> {
  const normalized = rows.map((row) =>
    JSON.stringify(
      row.map((cell) =>
        typeof cell === "number" && Number.isInteger(cell)
          ? { type: "bigint", value: String(cell) }
          : cell
      ),
    )
  ).sort().join("\n");
  return base64(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(normalized),
      ),
    ),
  );
}
/** @param {Uint8Array} value 二进制数据。 @return {string} Base64 文本。 */
function base64(value: Uint8Array): string {
  let text = "";
  for (let offset = 0; offset < value.length; offset += 8192) {
    text += String.fromCharCode(...value.subarray(offset, offset + 8192));
  }
  return btoa(text);
}
/** @param {string} value Base64 文本。 @return {Uint8Array<ArrayBuffer>} 二进制数据。 */
function unbase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

/** 根据显式子命令生成密钥、导出密文或恢复到新文件；日志不包含配置值或业务数据。 */
async function main(): Promise<void> {
  const [mode, keyFile, output] = Deno.args;
  if (!mode || !keyFile || !output) {
    throw new Error(
      "Usage: database_backup.ts keys|export|restore KEY_FILE OUTPUT",
    );
  }
  if (mode === "keys") {
    const keys = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 3072,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"],
    );
    await Deno.writeFile(
      keyFile,
      new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey)),
      { createNew: true, mode: 0o600 },
    );
    await Deno.writeFile(
      output,
      new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey)),
      { createNew: true, mode: 0o644 },
    );
    console.log(
      "Backup key pair created. Keep the private key outside the server and backup folder.",
    );
  } else if (mode === "export") {
    const publicKey = await crypto.subtle.importKey(
      "spki",
      await Deno.readFile(keyFile),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"],
    );
    const { createClient } = await import("@libsql/client/web");
    const url = Deno.env.get("TURSO_DATABASE_URL"),
      authToken = Deno.env.get("TURSO_AUTH_TOKEN");
    if (!url || !authToken) {
      throw new Error("Database configuration is incomplete.");
    }
    const client = createClient({ url, authToken, intMode: "bigint" });
    try {
      const snapshot = await readSnapshot(client);
      await Deno.writeTextFile(
        output,
        await encryptSnapshot(snapshot, publicKey),
        { createNew: true, mode: 0o600 },
      );
      console.log(
        JSON.stringify({
          encrypted: true,
          tables: snapshot.tables.length,
          rows: snapshot.tables.reduce(
            (total, table) => total + table.rows.length,
            0,
          ),
        }),
      );
    } finally {
      client.close();
    }
  } else if (mode === "restore") {
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      await Deno.readFile(keyFile),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"],
    );
    const encryptedFile = Deno.env.get("BACKUP_INPUT_FILE");
    if (!encryptedFile) throw new Error("BACKUP_INPUT_FILE is required.");
    console.log(
      JSON.stringify({
        restored: true,
        ...await restoreSnapshot(
          await decryptSnapshot(
            await Deno.readTextFile(encryptedFile),
            privateKey,
          ),
          output,
        ),
      }),
    );
  } else throw new Error("Unknown backup command.");
}

if (import.meta.main) {
  try {
    await main();
  } catch {
    console.error(
      "Database backup operation failed. Check permissions, inputs and database access; existing files were not overwritten.",
    );
    Deno.exitCode = 1;
  }
}
