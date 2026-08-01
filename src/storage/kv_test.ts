/**
 * @file 本文件验证 KV 存储的排序、用户隔离、仪表盘快照和删除逻辑。
 */
import type {
  AppSettings,
  AuthenticationEvent,
  AuthIdentity,
  EmailCredential,
  MatchRecord,
  PasskeyCredential,
  PasswordCredential,
  PendingEmailVerification,
  PendingMfaChallenge,
  PendingPasskeyChallenge,
  TotpCredential,
  UserAccount,
  UserSecuritySettings,
} from "../models.ts";
import { createKvStorage, latestMatchByMatchedTime } from "./kv.ts";

Deno.test("latestMatchByMatchedTime prefers the newest match before post time", () => {
  const olderMatchNewerPost = record("older-match-newer-post", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T12:00:00.000Z",
  });
  const newerMatchOlderPost = record("newer-match-older-post", {
    matchedAt: "2026-07-12T11:00:00.000Z",
    publishedAt: "2026-07-12T09:00:00.000Z",
  });

  assertEquals(
    latestMatchByMatchedTime([olderMatchNewerPost, newerMatchOlderPost])?.id,
    "newer-match-older-post",
  );
});

Deno.test("latestMatchByMatchedTime uses post time within the same match batch", () => {
  const olderPost = record("older-post", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T09:00:00.000Z",
  });
  const newerPost = record("newer-post", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T12:00:00.000Z",
  });

  assertEquals(
    latestMatchByMatchedTime([olderPost, newerPost])?.id,
    "newer-post",
  );
});

Deno.test("deleteMatches removes records from match history", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  const match = record("match-id", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T09:00:00.000Z",
  });

  await storage.saveMatch(match);

  assertEquals((await storage.listHistory()).map((item) => item.id), [
    "match-id",
  ]);

  await storage.deleteMatches([match.id]);

  assertEquals(await storage.listHistory(), []);
});

Deno.test("getDashboardSnapshot reads matches once for state and pending rows", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  await storage.saveMatch(record("pending-id", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T09:00:00.000Z",
  }));
  await storage.saveMatch({
    ...record("completed-id", {
      matchedAt: "2026-07-12T11:00:00.000Z",
      publishedAt: "2026-07-12T10:00:00.000Z",
    }),
    completedAt: "2026-07-12T12:00:00.000Z",
  });

  kv.resetStats();

  const snapshot = await storage.getDashboardSnapshot();

  assertEquals(kv.listCalls, 1);
  assertEquals(kv.getCalls, 2);
  assertEquals(snapshot.state.totalMatches, 2);
  assertEquals(snapshot.state.latestMatch?.id, "completed-id");
  assertEquals(snapshot.pendingMatches.map((item) => item.id), ["pending-id"]);
});

Deno.test("getLastPollAt reads only the state key", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  await storage.saveMatch(record("match-id", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T09:00:00.000Z",
  }));
  await storage.setLastPollAt("2026-07-12T12:00:00.000Z");

  kv.resetStats();

  assertEquals(await storage.getLastPollAt(), "2026-07-12T12:00:00.000Z");
  assertEquals(kv.getCalls, 1);
  assertEquals(kv.listCalls, 0);
});

Deno.test("forUser isolates matches by account id", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });

  await storage.forUser("alice").saveMatch(record("same-id", {
    matchedAt: "2026-07-12T10:00:00.000Z",
    publishedAt: "2026-07-12T09:00:00.000Z",
  }));
  await storage.forUser("bob").saveMatch(record("same-id", {
    matchedAt: "2026-07-12T11:00:00.000Z",
    publishedAt: "2026-07-12T10:00:00.000Z",
  }));

  assertEquals(
    (await storage.forUser("alice").listHistory())[0].matchedAt,
    "2026-07-12T10:00:00.000Z",
  );
  assertEquals(
    (await storage.forUser("bob").listHistory())[0].matchedAt,
    "2026-07-12T11:00:00.000Z",
  );
});

Deno.test("createAccount atomically rejects an existing username", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });

  const results = await Promise.all([
    storage.createAccount(account("first-id", "alice")),
    storage.createAccount(account("second-id", "alice")),
  ]);
  const createdAccountId = results[0] ? "first-id" : "second-id";

  assertEquals(results.sort(), [false, true]);
  assertEquals((await storage.listAccounts()).map((item) => item.id), [
    createdAccountId,
  ]);
});

Deno.test("updateAccount atomically moves the username index", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  await storage.createAccount(account("alice-id", "alice"));

  const updated = await storage.updateAccount({
    ...account("alice-id", "yuanxi"),
    passwordHash: "new-hash",
  });

  assertEquals(updated, true);
  assertEquals(await storage.getAccountByUsername("alice"), undefined);
  assertEquals((await storage.getAccountByUsername("yuanxi"))?.id, "alice-id");
  assertEquals(
    (await storage.getAccountById("alice-id"))?.passwordHash,
    "new-hash",
  );
});

Deno.test("updateAccount rejects an existing username without changing the account", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  await storage.createAccount(account("alice-id", "alice"));
  await storage.createAccount(account("bob-id", "bob"));

  const updated = await storage.updateAccount(account("alice-id", "bob"));

  assertEquals(updated, false);
  assertEquals((await storage.getAccountById("alice-id"))?.username, "alice");
  assertEquals((await storage.getAccountByUsername("bob"))?.id, "bob-id");
});

Deno.test("security settings storage reads defaults and saved settings", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  const settings: UserSecuritySettings = {
    preferredSecondFactor: "totp",
    twoFactorEnabled: true,
    userId: "alice-id",
  };

  assertEquals(await storage.getUserSecuritySettings("alice-id"), {
    preferredSecondFactor: undefined,
    twoFactorEnabled: false,
    userId: "alice-id",
  });

  await storage.saveUserSecuritySettings(settings);

  assertEquals(await storage.getUserSecuritySettings("alice-id"), settings);
});

Deno.test("password credential storage reads saved credentials by user id", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  const credential: PasswordCredential = {
    passwordHash: "password-hash",
    passwordIterations: 210_000,
    passwordSalt: "password-salt",
    updatedAt: "2026-07-31T00:00:00.000Z",
    userId: "alice-id",
  };

  await storage.savePasswordCredential(credential);

  assertEquals(await storage.getPasswordCredential("alice-id"), credential);
  assertEquals(await storage.getPasswordCredential("missing-id"), undefined);
});

Deno.test("totp credential storage reads saved credentials by user id", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  const credential: TotpCredential = {
    enabledAt: "2026-08-01T00:00:00.000Z",
    recoveryCodeHashes: ["recovery-code-hash"],
    secretEncrypted: "encrypted-secret",
    userId: "alice-id",
  };

  await storage.saveTotpCredential(credential);

  assertEquals(await storage.getTotpCredential("alice-id"), credential);
  assertEquals(await storage.getTotpCredential("missing-id"), undefined);

  await storage.deleteTotpCredential("alice-id");

  assertEquals(await storage.getTotpCredential("alice-id"), undefined);
});

Deno.test("passkey credential storage lists and deletes credentials by user id", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  const newerCredential: PasskeyCredential = {
    backedUp: true,
    counter: 2,
    createdAt: "2026-08-01T00:05:00.000Z",
    credentialId: "newer-credential",
    label: "Newer device",
    lastUsedAt: "2026-08-01T00:06:00.000Z",
    publicKey: "newer-public-key",
    transports: ["internal", "internal"],
    userId: "alice-id",
  };
  const olderCredential: PasskeyCredential = {
    backedUp: false,
    counter: -1,
    createdAt: "2026-08-01T00:00:00.000Z",
    credentialId: "older-credential",
    label: " Older device ",
    publicKey: "older-public-key",
    transports: ["usb", ""],
    userId: "alice-id",
  };
  const bobCredential: PasskeyCredential = {
    ...newerCredential,
    credentialId: "bob-credential",
    userId: "bob-id",
  };

  await storage.savePasskeyCredential(newerCredential);
  await storage.savePasskeyCredential(olderCredential);
  await storage.savePasskeyCredential(bobCredential);

  assertEquals(
    (await storage.listPasskeyCredentials("alice-id")).map((item) => ({
      counter: item.counter,
      credentialId: item.credentialId,
      label: item.label,
      transports: item.transports,
    })),
    [
      {
        counter: 0,
        credentialId: "older-credential",
        label: "Older device",
        transports: ["usb"],
      },
      {
        counter: 2,
        credentialId: "newer-credential",
        label: "Newer device",
        transports: ["internal"],
      },
    ],
  );
  assertEquals(
    (await storage.getPasskeyCredential("alice-id", "newer-credential"))
      ?.credentialId,
    "newer-credential",
  );
  assertEquals(
    (await storage.getPasskeyCredentialByCredentialId("newer-credential"))
      ?.userId,
    "alice-id",
  );
  assertEquals(
    await storage.getPasskeyCredential("alice-id", "bob-credential"),
    undefined,
  );

  await storage.deletePasskeyCredential("alice-id", "newer-credential");

  assertEquals(
    await storage.getPasskeyCredential("alice-id", "newer-credential"),
    undefined,
  );
  assertEquals(
    await storage.getPasskeyCredentialByCredentialId("newer-credential"),
    undefined,
  );
  assertEquals(
    (await storage.getPasskeyCredential("bob-id", "bob-credential"))
      ?.credentialId,
    "bob-credential",
  );
  assertEquals(
    (await storage.getPasskeyCredentialByCredentialId("bob-credential"))
      ?.userId,
    "bob-id",
  );
});

Deno.test("auth identity storage reads saved Google identities", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  const identity: AuthIdentity = {
    createdAt: "2026-08-01T00:00:00.000Z",
    email: "alice@example.com",
    emailVerified: true,
    provider: "google",
    providerUserId: "google-subject-id",
    userId: "alice-id",
  };

  await storage.saveAuthIdentity(identity);

  assertEquals(
    await storage.getAuthIdentity("google", "google-subject-id"),
    identity,
  );
  assertEquals(
    await storage.getAuthIdentity("google", "missing-subject-id"),
    undefined,
  );
});

Deno.test("authentication event storage reads the latest event by purpose", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  const event: AuthenticationEvent = {
    authenticatedAt: "2026-08-01T00:00:00.000Z",
    method: "passkey",
    purpose: "reauth",
    strength: "strong",
    userId: "alice-id",
  };

  await storage.saveAuthenticationEvent(event);

  assertEquals(
    await storage.getAuthenticationEvent("alice-id", "reauth"),
    event,
  );
  assertEquals(
    await storage.getAuthenticationEvent("alice-id", "primary_login"),
    undefined,
  );
  assertEquals(
    await storage.getAuthenticationEvent("bob-id", "reauth"),
    undefined,
  );
});

Deno.test("pending MFA challenge storage preserves attempts and methods", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  const challenge: PendingMfaChallenge = {
    allowedMethods: ["passkey", "email", "email"],
    attempts: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-08-01T00:10:00.000Z",
    id: "mfa-challenge-id",
    primaryMethod: "password",
    userId: "alice-id",
  };

  await storage.savePendingMfaChallenge(challenge);

  assertEquals(await storage.getPendingMfaChallenge("mfa-challenge-id"), {
    ...challenge,
    allowedMethods: ["email", "passkey"],
  });

  await storage.savePendingMfaChallenge({
    ...challenge,
    allowedMethods: ["email", "passkey"],
    attempts: 1,
  });

  assertEquals(
    (await storage.getPendingMfaChallenge("mfa-challenge-id"))?.attempts,
    1,
  );

  await storage.deletePendingMfaChallenge("mfa-challenge-id");

  assertEquals(
    await storage.getPendingMfaChallenge("mfa-challenge-id"),
    undefined,
  );
});

Deno.test("pending passkey challenge storage preserves attempts and purpose", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  const challenge: PendingPasskeyChallenge = {
    allowedCredentialIds: ["credential-a", "credential-a", ""],
    attempts: -1,
    challenge: "webauthn-challenge",
    createdAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-08-01T00:05:00.000Z",
    id: "passkey-challenge-id",
    purpose: "primary_login",
    userId: "alice-id",
  };

  await storage.savePendingPasskeyChallenge(challenge);

  assertEquals(
    await storage.getPendingPasskeyChallenge("passkey-challenge-id"),
    {
      ...challenge,
      allowedCredentialIds: ["credential-a"],
      attempts: 0,
    },
  );

  await storage.savePendingPasskeyChallenge({
    ...challenge,
    allowedCredentialIds: ["credential-a"],
    attempts: 1,
  });

  assertEquals(
    (await storage.getPendingPasskeyChallenge("passkey-challenge-id"))
      ?.attempts,
    1,
  );

  await storage.deletePendingPasskeyChallenge("passkey-challenge-id");

  assertEquals(
    await storage.getPendingPasskeyChallenge("passkey-challenge-id"),
    undefined,
  );
});

Deno.test("email credential storage normalizes addresses under user scope", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  const credential: EmailCredential = {
    createdAt: "2026-08-01T00:00:00.000Z",
    email: " Alice.Alerts+App@Example.COM ",
    lastVerifiedAt: "2026-08-01T00:05:00.000Z",
    userId: "alice-id",
    verified: true,
  };
  const normalizedCredential: EmailCredential = {
    ...credential,
    email: "alice.alerts+app@example.com",
  };

  await storage.saveEmailCredential(credential);

  assertEquals(
    await storage.getEmailCredential(
      "alice-id",
      "alice.alerts+app@example.com",
    ),
    normalizedCredential,
  );
  assertEquals(
    await storage.getEmailCredential("bob-id", "alice.alerts+app@example.com"),
    undefined,
  );
  assertEquals(await storage.listEmailCredentials("alice-id"), [
    normalizedCredential,
  ]);

  await storage.deleteEmailCredential(
    "alice-id",
    "alice.alerts+app@example.com",
  );

  assertEquals(
    await storage.getEmailCredential(
      "alice-id",
      "alice.alerts+app@example.com",
    ),
    undefined,
  );
});

Deno.test("pending email verification storage preserves attempts and purpose", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });
  const verification: PendingEmailVerification = {
    attempts: 0,
    codeHash: "code-hash",
    createdAt: "2026-08-01T00:00:00.000Z",
    email: "Alice@Example.COM",
    expiresAt: "2026-08-01T00:10:00.000Z",
    id: "email-verification-id",
    purpose: "email_binding",
    userId: "alice-id",
  };
  const normalizedVerification: PendingEmailVerification = {
    ...verification,
    email: "alice@example.com",
  };

  await storage.savePendingEmailVerification(verification);

  assertEquals(
    await storage.getPendingEmailVerification("email-verification-id"),
    normalizedVerification,
  );

  await storage.savePendingEmailVerification({
    ...normalizedVerification,
    attempts: 1,
  });

  assertEquals(
    (await storage.getPendingEmailVerification("email-verification-id"))
      ?.attempts,
    1,
  );

  await storage.deletePendingEmailVerification("email-verification-id");

  assertEquals(
    await storage.getPendingEmailVerification("email-verification-id"),
    undefined,
  );
});

Deno.test("recordRateLimitHit blocks requests after the configured limit", async () => {
  const kv = new MemoryKv();
  const storage = createKvStorage(defaultSettings, {
    openKv: () => Promise.resolve(kv),
  });

  const first = await storage.recordRateLimitHit(
    ["registration", "client"],
    2,
    60_000,
  );
  const second = await storage.recordRateLimitHit(
    ["registration", "client"],
    2,
    60_000,
  );
  const third = await storage.recordRateLimitHit(
    ["registration", "client"],
    2,
    60_000,
  );

  assertEquals(first.allowed, true);
  assertEquals(second.allowed, true);
  assertEquals(third.allowed, false);
  assertEquals(third.count, 3);
  assertEquals(third.limit, 2);
  assertEquals(third.retryAfterSeconds > 0, true);
});

/**
 * 创建测试命中记录。
 *
 * @param id 命中记录和帖子 ID。
 * @param options 命中时间和发布时间。
 * @return 测试命中记录。
 */
function record(
  id: string,
  options: { matchedAt: string; publishedAt: string },
): MatchRecord {
  return {
    id,
    keyword: "keyword",
    location: "title",
    matchedAt: options.matchedAt,
    post: {
      body: "",
      commentReplies: [],
      comments: [],
      excerpt: "",
      id,
      publishedAt: options.publishedAt,
      title: id,
      url: `https://example.com/${id}`,
    },
  };
}

/**
 * KV 存储测试使用的默认应用设置。
 */
const defaultSettings: AppSettings = {
  activeKeywordTarget: "common",
  commonKeywordRules: [],
  darkMode: false,
  locale: "zh-CN",
  notificationEmailAddress: "",
  notificationEmailApiToken: "",
  notificationEmailApiUrl: "",
  notificationEmailFrom: "",
  notificationEmailService: "smtp",
  notificationProvider: "disabled",
  notificationPushPlusToken: "",
  notificationServerChanSendKey: "",
  notificationSmtpHost: "",
  notificationSmtpPassword: "",
  notificationSmtpPort: 465,
  notificationSmtpSecure: true,
  notificationSmtpUsername: "",
  notificationWebhookService: "custom",
  notificationWebhookUrl: "",
  notificationWxPusherSpt: "",
  polling: {
    enabled: true,
    intervalUnit: "minute",
    intervalValue: 1,
    postLimit: 20,
    sort: "replyTime",
  },
  themeColor: "#bd7fff",
  topics: [],
};

/**
 * 测试使用的内存 KV 实现。
 */
class MemoryKv {
  #entries = new Map<
    string,
    { key: Deno.KvKey; value: unknown; versionstamp: string }
  >();
  #version = 0;
  /**
   * get 调用次数。
   */
  getCalls = 0;
  /**
   * list 调用次数。
   */
  listCalls = 0;

  /**
   * 从内存 KV 中读取指定键。
   *
   * @param key KV 键。
   * @return KV 读取结果。
   */
  get<T>(
    key: Deno.KvKey,
  ): Promise<
    { key: Deno.KvKey; value: T | null; versionstamp: string | null }
  > {
    this.getCalls += 1;
    const entry = this.#entries.get(this.#key(key));
    return Promise.resolve({
      key,
      value: entry ? entry.value as T : null,
      versionstamp: entry?.versionstamp ?? null,
    });
  }

  /**
   * 向内存 KV 写入指定键值。
   *
   * @param key KV 键。
   * @param value 待写入值。
   * @param _options 写入选项，当前测试替身不需要使用。
   * @return KV 提交结果。
   */
  set(
    key: Deno.KvKey,
    value: unknown,
    _options?: { expireIn?: number },
  ): Promise<Deno.KvCommitResult> {
    const versionstamp = this.#nextVersionstamp();
    this.#entries.set(this.#key(key), { key, value, versionstamp });
    return Promise.resolve({ ok: true, versionstamp });
  }

  /**
   * 创建内存 KV 的原子操作。
   *
   * @return 内存 KV 原子操作。
   */
  atomic(): MemoryKvAtomicOperation {
    const checks: { key: Deno.KvKey; versionstamp: string | null }[] = [];
    const deletes: Deno.KvKey[] = [];
    const sets: { key: Deno.KvKey; value: unknown }[] = [];
    const operation: MemoryKvAtomicOperation = {
      check: (check: { key: Deno.KvKey; versionstamp: string | null }) => {
        checks.push(check);
        return operation;
      },
      delete: (key: Deno.KvKey) => {
        deletes.push(key);
        return operation;
      },
      set: (
        key: Deno.KvKey,
        value: unknown,
        _options?: { expireIn?: number },
      ) => {
        sets.push({ key, value });
        return operation;
      },
      commit: () => {
        const valid = checks.every((check) => {
          const entry = this.#entries.get(this.#key(check.key));
          return (entry?.versionstamp ?? null) === check.versionstamp;
        });
        if (!valid) {
          return Promise.resolve({ ok: false });
        }

        for (const key of deletes) {
          this.#entries.delete(this.#key(key));
        }

        for (const set of sets) {
          this.#entries.set(this.#key(set.key), {
            key: set.key,
            value: set.value,
            versionstamp: this.#nextVersionstamp(),
          });
        }
        return Promise.resolve({ ok: true });
      },
    };
    return operation;
  }

  /**
   * 从内存 KV 删除指定键。
   *
   * @param key KV 键。
   * @return 删除完成后的 Promise。
   */
  delete(key: Deno.KvKey): Promise<void> {
    this.#entries.delete(this.#key(key));
    return Promise.resolve();
  }

  /**
   * 按前缀列出内存 KV 中的条目。
   *
   * @param selector KV 列表选择器。
   * @return 匹配前缀的 KV 条目迭代器。
   */
  async *list<T>(
    selector: Deno.KvListSelector,
  ): AsyncIterableIterator<Deno.KvEntry<T>> {
    this.listCalls += 1;
    const prefix = "prefix" in selector ? selector.prefix : [];
    for (const entry of this.#entries.values()) {
      if (!this.#startsWith(entry.key, prefix)) {
        continue;
      }

      yield {
        key: entry.key,
        value: entry.value as T,
        versionstamp: entry.versionstamp,
      };
    }
  }

  /**
   * 将 KV 键序列化为内存 Map 键。
   *
   * @param key KV 键。
   * @return 序列化后的键。
   */
  #key(key: Deno.KvKey): string {
    return JSON.stringify(key);
  }

  /**
   * 生成下一个内存 KV 版本戳。
   *
   * @return 新版本戳。
   */
  #nextVersionstamp(): string {
    this.#version += 1;
    return String(this.#version);
  }

  /**
   * 重置调用统计。
   *
   * @return 无返回值。
   */
  resetStats(): void {
    this.getCalls = 0;
    this.listCalls = 0;
  }

  /**
   * 判断 KV 键是否以指定前缀开头。
   *
   * @param key KV 键。
   * @param prefix KV 键前缀。
   * @return 匹配前缀时返回 true。
   */
  #startsWith(key: Deno.KvKey, prefix: Deno.KvKey): boolean {
    return prefix.every((part, index) => key[index] === part);
  }
}

/**
 * 创建测试账号。
 *
 * @param id 账号 ID。
 * @param username 用户名。
 * @return 测试账号。
 */
function account(id: string, username: string): UserAccount {
  return {
    createdAt: "2026-07-17T00:00:00.000Z",
    id,
    passwordHash: "password-hash",
    passwordIterations: 210_000,
    passwordSalt: "password-salt",
    username,
  };
}

/**
 * 内存 KV 的原子操作。
 */
type MemoryKvAtomicOperation = {
  check(
    check: { key: Deno.KvKey; versionstamp: string | null },
  ): MemoryKvAtomicOperation;
  commit(): Promise<{ ok: boolean }>;
  delete(key: Deno.KvKey): MemoryKvAtomicOperation;
  set(
    key: Deno.KvKey,
    value: unknown,
    options?: { expireIn?: number },
  ): MemoryKvAtomicOperation;
};

/**
 * 断言两个值的 JSON 表示相等。
 *
 * @param actual 实际值。
 * @param expected 期望值。
 * @return 断言通过时无返回值。
 */
function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}
