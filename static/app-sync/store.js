/** @file 在 IndexedDB 中按账号加密保存本地快照和可重放操作。 */
(() => {
  /** 本地数据库连接的共享初始化任务。 */
  let database;
  /**
   * 打开持久数据库，页面和 Service Worker 使用同一数据布局。
   * @return {Promise<IDBDatabase>} 数据库连接。
   */
  function open() {
    database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("heybox-app-local", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("state");
        const operations = db.createObjectStore("operations", {
          keyPath: "id",
        });
        operations.createIndex("userId", "userId");
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          database = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Local database upgrade blocked"));
    }).catch((error) => {
      database = undefined;
      throw error;
    });
    return database;
  }
  /**
   * 等待一次数据库请求。
   * @param {IDBRequest} request 请求。
   * @return {Promise<unknown>} 请求结果。
   */
  function requested(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  /**
   * 等待事务提交，不能把单个请求成功当作可靠落盘。
   * @param {IDBTransaction} transaction 数据库事务。
   * @return {Promise<void>} 完整提交结果。
   */
  function committed(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () =>
        reject(transaction.error ?? new Error("Local transaction aborted"));
    });
  }
  /**
   * 读取内部状态，不向其它账号使用同一密钥。
   * @param {string} name 完整内部键。
   * @return {Promise<unknown>} 状态值。
   */
  async function readRaw(name) {
    const db = await open();
    return await requested(
      db.transaction("state").objectStore("state").get(name),
    );
  }
  /**
   * 获取账号独有的不可导出加密密钥；竞争创建时读取事务赢家。
   * @param {string} userId 账号 ID。
   * @return {Promise<CryptoKey>} AES-GCM 密钥。
   */
  async function encryptionKey(userId) {
    const name = `key:${userId}`;
    const existing = await readRaw(name);
    if (existing) return existing;
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const db = await open();
    const tx = db.transaction("state", "readwrite");
    const done = committed(tx);
    tx.objectStore("state").add(key, name);
    try {
      await done;
      return key;
    } catch (error) {
      const winner = await readRaw(name);
      if (winner) return winner;
      throw error;
    }
  }
  /**
   * 加密业务内容，并用账号标识绑定附加认证数据。
   * @param {string} userId 账号 ID。
   * @param {unknown} value JSON 业务内容。
   * @return {Promise<object>} 加密信封。
   */
  async function encrypt(userId, value) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await encryptionKey(userId);
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    );
    return { iv, data };
  }
  /**
   * 用当前账号密钥读取本地业务内容，解密失败不返回空成功。
   * @param {string} userId 账号 ID。
   * @param {{iv: Uint8Array, data: ArrayBuffer}} envelope 加密信封。
   * @return {Promise<unknown>} 解密内容。
   */
  async function decrypt(userId, envelope) {
    const data = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: envelope.iv,
        additionalData: new TextEncoder().encode(userId),
      },
      await encryptionKey(userId),
      envelope.data,
    );
    return JSON.parse(new TextDecoder().decode(data));
  }
  /**
   * 原子追加编辑和对应本地快照，事务失败时两者都不生效。
   * @param {string} userId 账号 ID。
   * @param {{stamp: {operationId: string}}} operation 不可变编辑。
   * @param {string} stateName 快照名称。
   * @param {unknown} state 编辑后的快照。
   * @return {Promise<void>} 可靠落盘结果。
   */
  async function append(userId, operation, stateName, state) {
    const payload = await encrypt(userId, operation);
    const snapshot = await encrypt(userId, state);
    const db = await open();
    const tx = db.transaction(["state", "operations"], "readwrite");
    const done = committed(tx);
    tx.objectStore("operations").add({
      id: `${userId}:${operation.stamp.operationId}`,
      userId,
      payload,
    });
    tx.objectStore("state").put(snapshot, `${userId}:${stateName}`);
    await done;
  }
  /**
   * 读取账号待同步操作，保留最初的编辑版本。
   * @param {string} userId 账号 ID。
   * @return {Promise<object[]>} 待重放操作。
   */
  async function pending(userId) {
    const db = await open();
    const entries = await requested(
      db.transaction("operations").objectStore("operations").index("userId")
        .getAll(userId),
    );
    return await Promise.all(
      entries.map((entry) => decrypt(userId, entry.payload)),
    );
  }
  /**
   * 仅在服务器确认后移除对应操作。
   * @param {string} userId 账号 ID。
   * @param {string} operationId 已确认操作 ID。
   * @return {Promise<void>} 删除事务完成。
   */
  async function acknowledge(userId, operationId) {
    const db = await open();
    const tx = db.transaction("operations", "readwrite");
    const done = committed(tx);
    tx.objectStore("operations").delete(`${userId}:${operationId}`);
    await done;
  }
  /**
   * 读取账号的加密快照。
   * @param {string} userId 账号 ID。
   * @param {string} name 快照名称。
   * @return {Promise<unknown>} 快照或 undefined。
   */
  async function readState(userId, name) {
    const stored = await readRaw(`${userId}:${name}`);
    return stored ? await decrypt(userId, stored) : undefined;
  }
  /**
   * 保存不涉及新增操作的账号快照。
   * @param {string} userId 账号 ID。
   * @param {string} name 快照名称。
   * @param {unknown} state 快照。
   * @return {Promise<void>} 写入事务完成。
   */
  async function writeState(userId, name, state) {
    const payload = await encrypt(userId, state);
    const db = await open();
    const tx = db.transaction("state", "readwrite");
    const done = committed(tx);
    tx.objectStore("state").put(payload, `${userId}:${name}`);
    await done;
  }
  globalThis.AppLocalStore = {
    append,
    pending,
    acknowledge,
    readState,
    writeState,
  };
})();
