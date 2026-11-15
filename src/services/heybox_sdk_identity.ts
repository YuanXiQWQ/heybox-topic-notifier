/** @file 持久保存服务端匿名 SDK 身份，使用独占锁和原子写入防止重启轮换身份。 */
import { join } from "node:path";

/** 服务端固定绑定、SDK 缓存及注册失败冷却；内容不得写入日志。 */
export type SdkIdentity = {
  version: 1;
  bindingId: string;
  sessionId: string;
  registeredId: string;
  registeredAt: number;
  refreshRequired: boolean;
  retryAt: number;
};

/** 带独占锁的身份存储，更新完成后才允许使用新状态。 */
export type SdkIdentityStore = {
  read: () => SdkIdentity;
  save: (state: SdkIdentity) => Promise<void>;
  close: () => void;
};

/**
 * 创建一次性的匿名绑定，只能由显式初始化入口调用。
 * @param {number} now 当前毫秒时间。
 * @return {SdkIdentity} 尚未注册的固定身份。
 */
export function createSdkIdentity(now = Date.now()): SdkIdentity {
  return {
    version: 1,
    bindingId: crypto.randomUUID().replaceAll("-", "").slice(0, 16),
    sessionId: `${now}-${
      String(crypto.getRandomValues(new Uint32Array(1))[0] % 100000).padStart(
        5,
        "0",
      )
    }`,
    registeredId: "",
    registeredAt: 0,
    refreshRequired: true,
    retryAt: 0,
  };
}

/**
 * 校验持久身份并返回固定字段顺序，拒绝部分写入或未知版本。
 * @param {unknown} value 待校验的状态。
 * @return {SdkIdentity} 独立的规范状态。
 */
export function requireSdkIdentity(value: unknown): SdkIdentity {
  const v = value as Partial<SdkIdentity> | null;
  if (
    !v || v.version !== 1 || typeof v.bindingId !== "string" ||
    !/^[a-f0-9]{16}$/.test(v.bindingId) || typeof v.sessionId !== "string" ||
    !/^\d{13}-\d{5}$/.test(v.sessionId) || typeof v.registeredId !== "string" ||
    (v.registeredId !== "" && !/^[A-Za-z0-9+/=_-]{88}$/.test(v.registeredId)) ||
    !Number.isSafeInteger(v.registeredAt) || v.registeredAt! < 0 ||
    !Number.isSafeInteger(v.retryAt) || v.retryAt! < 0 ||
    typeof v.refreshRequired !== "boolean" ||
    Object.keys(v).some((key) =>
      ![
        "version",
        "bindingId",
        "sessionId",
        "registeredId",
        "registeredAt",
        "refreshRequired",
        "retryAt",
      ].includes(key)
    )
  ) throw new Error("Invalid SDK identity");
  return {
    version: 1,
    bindingId: v.bindingId,
    sessionId: v.sessionId,
    registeredId: v.registeredId,
    registeredAt: v.registeredAt!,
    refreshRequired: v.refreshRequired,
    retryAt: v.retryAt!,
  };
}

/**
 * 对规范状态计算完整性摘要，不将身份内容暴露到诊断信息。
 * @param {SdkIdentity} state 已校验状态。
 * @return {Promise<string>} 小写 SHA-256 摘要。
 */
async function checksum(state: SdkIdentity): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(state)),
      ),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0")).join("");
}

/**
 * 打开私有身份目录，普通启动在身份缺失时停止，显式 seed 仅允许首次创建。
 * @param {string} directory 运行账号独占的私有目录。
 * @param {SdkIdentity} [seed] 显式初始化或迁移提供的固定身份。
 * @return {Promise<SdkIdentityStore>} 持久存储及关闭入口。
 */
export async function openSdkIdentity(
  directory: string,
  seed?: SdkIdentity,
): Promise<SdkIdentityStore> {
  if (seed) await Deno.mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await Deno.lstat(directory);
  if (
    !info.isDirectory || info.isSymlink ||
    (Deno.build.os !== "windows" &&
      ((info.mode! & 0o077) !== 0 || info.uid !== Deno.uid()))
  ) {
    throw new Error("SDK state directory must be private");
  }
  const path = join(directory, "identity.json");
  const lock = await Deno.open(join(directory, "identity.lock"), {
    read: true,
    write: true,
    create: true,
    mode: 0o600,
  });
  let state: SdkIdentity;
  let closed = false;
  try {
    if (!await lock.tryLock(true)) {
      throw new Error("SDK identity is already in use");
    }

    /**
     * 同步临时文件再原子替换；同一存储实例禁止改变匿名绑定和 SDK 会话。
     * @param {SdkIdentity} next 待保存状态。
     * @return {Promise<void>} 状态已经持久化。
     */
    const save = async (next: SdkIdentity): Promise<void> => {
      const value = requireSdkIdentity(next);
      if (
        closed ||
        (state &&
          (value.bindingId !== state.bindingId ||
            value.sessionId !== state.sessionId))
      ) {
        throw new Error("SDK identity binding cannot change");
      }
      const temporary = join(directory, `.identity-${crypto.randomUUID()}.tmp`);
      try {
        const file = await Deno.open(temporary, {
          write: true,
          createNew: true,
          mode: 0o600,
        });
        try {
          const bytes = new TextEncoder().encode(
            JSON.stringify({ state: value, checksum: await checksum(value) }) +
              "\n",
          );
          let offset = 0;
          while (offset < bytes.length) {
            const count = await file.write(bytes.subarray(offset));
            if (!count) throw new Error("SDK identity write stalled");
            offset += count;
          }
          await file.sync();
        } finally {
          file.close();
        }
        await Deno.rename(temporary, path);
        if (Deno.build.os !== "windows") {
          const folder = await Deno.open(directory, { read: true });
          try {
            await folder.sync();
          } finally {
            folder.close();
          }
        }
        state = value;
      } catch (error) {
        try {
          await Deno.remove(temporary);
        } catch (e) {
          if (!(e instanceof Deno.errors.NotFound)) {
            throw new Error("SDK identity transaction cleanup unavailable");
          }
        }
        throw error;
      }
    };

    try {
      const stat = await Deno.lstat(path);
      if (
        seed || !stat.isFile || stat.isSymlink || stat.size > 4096 ||
        (Deno.build.os !== "windows" && (stat.mode! & 0o077) !== 0)
      ) {
        throw new Error("SDK identity file cannot be replaced");
      }
      const envelope = JSON.parse(await Deno.readTextFile(path));
      state = requireSdkIdentity(envelope.state);
      if (
        Object.keys(envelope).some((key) =>
          !["state", "checksum"].includes(key)
        ) ||
        envelope.checksum !== await checksum(state)
      ) throw new Error("Invalid SDK identity checksum");
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound) || !seed) throw e;
      await save(seed);
    }
    return {
      /** @return {SdkIdentity} 当前身份的独立副本，不能直接改写持久状态。 */
      read: () => structuredClone(state),
      save,
      /** 释放独占锁；正常退出保留固定身份及冷却。 */
      close: () => {
        if (!closed) {
          closed = true;
          lock.close();
        }
      },
    };
  } catch {
    lock.close();
    throw new Error("SDK identity state unavailable");
  }
}
