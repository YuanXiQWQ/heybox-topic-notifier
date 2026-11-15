/** @file 保存原匿名身份的官方验证挑战，校验短期回执并限制一次性使用。 */
import { join } from "node:path";

/** 官方挑战绑定原帖子；标识用于拒绝已被新挑战替代的回执。 */
export type SdkCaptchaChallenge = {
  id: string;
  appId: string;
  postId: string;
  createdAt: number;
  attemptedAt: number;
};
/** 只在内存和私有管道传递的官方验证回执。 */
export type SdkCaptchaReceipt = {
  challengeId: string;
  ticket: string;
  randstr: string;
  receivedAt: number;
};
/** 调用方必须在整个生命周期持有 SDK 身份的独占锁。 */
export type SdkCaptchaStore = {
  read: () => SdkCaptchaChallenge | null;
  save: (value: SdkCaptchaChallenge | null) => Promise<void>;
};

/**
 * 校验挑战的固定字段，避免把上游任意内容当作导航或执行参数。
 * @param {unknown} value 待恢复的挑战。
 * @return {SdkCaptchaChallenge | null} 规范挑战或已清除状态。
 */
export function requireSdkCaptcha(value: unknown): SdkCaptchaChallenge | null {
  if (value === null) return null;
  const v = value as SdkCaptchaChallenge;
  if (
    !v || typeof v.id !== "string" || !/^[a-f0-9-]{36}$/.test(v.id) ||
    typeof v.appId !== "string" || !/^\d{4,20}$/.test(v.appId) ||
    typeof v.postId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(v.postId) ||
    !Number.isSafeInteger(v.createdAt) || v.createdAt < 0 ||
    !Number.isSafeInteger(v.attemptedAt) || v.attemptedAt < 0 ||
    Object.keys(v).some((key) =>
      !["id", "appId", "postId", "createdAt", "attemptedAt"].includes(key)
    )
  ) {
    throw new Error("Invalid SDK verification challenge");
  }
  return {
    id: v.id,
    appId: v.appId,
    postId: v.postId,
    createdAt: v.createdAt,
    attemptedAt: v.attemptedAt,
  };
}

/**
 * 只接受当前挑战的真实短期回执，拒绝容灾票据、重放和未来时间。
 * @param {unknown} value 从私有输入接收的回执。
 * @param {SdkCaptchaChallenge | null} challenge 当前持久挑战。
 * @param {number} now 当前毫秒时间。
 * @return {SdkCaptchaReceipt} 已校验回执；不会写入状态文件或日志。
 */
export function requireSdkCaptchaReceipt(
  value: unknown,
  challenge: SdkCaptchaChallenge | null,
  now: number,
): SdkCaptchaReceipt {
  const v = value as SdkCaptchaReceipt;
  if (
    !challenge || !v || v.challengeId !== challenge.id ||
    typeof v.ticket !== "string" || v.ticket.startsWith("trerror_") ||
    !/^[A-Za-z0-9_*=+\/-]{32,4096}$/.test(v.ticket) ||
    typeof v.randstr !== "string" ||
    !/^[A-Za-z0-9_@*=+\/-]{1,512}$/.test(v.randstr) ||
    !Number.isSafeInteger(v.receivedAt) || v.receivedAt < challenge.createdAt ||
    v.receivedAt <= challenge.attemptedAt || v.receivedAt > now ||
    now - v.receivedAt > 240000 ||
    Object.keys(v).some((key) =>
      !["challengeId", "ticket", "randstr", "receivedAt"].includes(key)
    )
  ) {
    throw new Error("Invalid SDK verification receipt");
  }
  return {
    challengeId: v.challengeId,
    ticket: v.ticket,
    randstr: v.randstr,
    receivedAt: v.receivedAt,
  };
}

/**
 * 原子保存不含回执的挑战；身份锁防止其它进程同时替换或确认。
 * @param {string} directory 已由身份存储核验的私有目录。
 * @param {string} bindingId 固定匿名绑定。
 * @return {Promise<SdkCaptchaStore>} 当前挑战与持久化入口。
 */
export async function openSdkCaptcha(
  directory: string,
  bindingId: string,
): Promise<SdkCaptchaStore> {
  if (!/^[a-f0-9]{16}$/.test(bindingId)) throw new Error("Invalid SDK binding");
  const path = join(directory, "captcha.json");
  let current: SdkCaptchaChallenge | null = null;
  try {
    const info = await Deno.lstat(path);
    if (!info.isFile || info.isSymlink || info.size > 2048) throw new Error();
    const stored = JSON.parse(await Deno.readTextFile(path));
    if (
      stored.version !== 1 || stored.bindingId !== bindingId ||
      Object.keys(stored).some((key) =>
        !["version", "bindingId", "challenge"].includes(key)
      )
    ) throw new Error();
    current = requireSdkCaptcha(stored.challenge);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw new Error("SDK verification state unavailable");
    }
  }
  return {
    read: () => structuredClone(current),
    /**
     * 同步文件并原子替换，成功后才更新内存状态。
     * @param {SdkCaptchaChallenge | null} value 待保存挑战或清除标记。
     * @return {Promise<void>} 状态已持久化。
     */
    async save(value: SdkCaptchaChallenge | null): Promise<void> {
      const challenge = requireSdkCaptcha(value);
      const temporary = join(directory, `.captcha-${crypto.randomUUID()}.tmp`);
      try {
        const file = await Deno.open(temporary, {
          createNew: true,
          write: true,
          mode: 0o600,
        });
        try {
          const bytes = new TextEncoder().encode(
            JSON.stringify({ version: 1, bindingId, challenge }) + "\n",
          );
          let offset = 0;
          while (offset < bytes.length) {
            const count = await file.write(bytes.subarray(offset));
            if (!count) throw new Error("SDK verification write stalled");
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
        current = challenge;
      } catch (error) {
        try {
          await Deno.remove(temporary);
        } catch { /* 保留原始写入错误；私有目录中的残留不参与状态恢复。 */ }
        throw error;
      }
    },
  };
}
