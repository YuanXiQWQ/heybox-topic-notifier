/** @file 使用可自行续期的服务端 SDK 缓存读取完整详情，并持久保留所有限制状态。 */
import type { TopicPost } from "../models.ts";
import type { SdkIdentityStore } from "./heybox_sdk_identity.ts";
import { createHeyboxTopicSource } from "./heybox_topic_source.ts";
import {
  requireSdkCaptchaReceipt,
  type SdkCaptchaReceipt,
  type SdkCaptchaStore,
} from "./heybox_sdk_captcha.ts";

/** 独占的详情冷却文件接口。 */
export type SdkDetailCheckpoint = {
  retryAt: number;
  persist: (retryAt: number) => Promise<void>;
};
/** 服务端详情来源依赖，与本地模拟器和观察时间无关。 */
export type SdkDetailsOptions = {
  identity: SdkIdentityStore;
  checkpoint: SdkDetailCheckpoint;
  captcha?: SdkCaptchaStore;
  refresh: () => Promise<void>;
  fetchFn?: typeof fetch;
  now?: () => number;
};
/** 进程中断时覆盖上游十五分钟限制及在途请求期限。 */
const interruptedCooldownMs = 930000;
/** 限制匿名 SDK 的等待队列，避免上游故障时堆积。 */
const maximumPendingRequests = 8;

/**
 * 创建单一固定身份的串行详情来源，明确令牌拒绝后才请求同身份刷新。
 * @param {SdkDetailsOptions} options 持久身份、冷却检查点和刷新入口。
 * @return {object} 完整详情读取与共享冷却查询。
 */
export function createHostedSdkDetails(options: SdkDetailsOptions) {
  const now = options.now ?? Date.now;
  const bindingId = options.identity.read().bindingId;
  let retryAt = options.checkpoint.retryAt;
  let persistenceFailed = false;
  let pending = 0;
  let queue: Promise<void> = Promise.resolve();

  /**
   * 同步持久化冷却，写入失败则停止本进程所有上游请求。
   * @param {number} value 最早允许请求时间。
   * @return {Promise<void>} 冷却已经落盘。
   */
  async function persist(value: number): Promise<void> {
    try {
      await options.checkpoint.persist(value);
    } catch {
      persistenceFailed = true;
      throw new Error("SDK checkpoint unavailable");
    }
  }

  /**
   * 返回可重试的未完成详情，保留列表内容但不能把摘要当作完整正文。
   * @param {TopicPost} post 原列表帖子。
   * @return {TopicPost} 带未完成标记的副本。
   */
  function unavailable(post: TopicPost): TopicPost {
    const result = { ...post, detailsComplete: false };
    delete result.detailUnavailable;
    delete result.detailDeferredUntil;
    return result;
  }

  /**
   * 使用固定状态取数，官方回执仅确认原挑战，不刷新或替换匿名身份。
   * @param {TopicPost} post 待补全帖子。
   * @param {SdkCaptchaReceipt} [receipt] 当前挑战的官方回执，省略时遵守普通详情冷却。
   * @return {Promise<TopicPost>} 完整详情或可重试的未完成标记。
   */
  async function read(
    post: TopicPost,
    receipt?: SdkCaptchaReceipt,
  ): Promise<TopicPost> {
    if (
      persistenceFailed ||
      now() < options.identity.read().retryAt || (!receipt && now() < retryAt)
    ) return unavailable(post);
    try {
      if (receipt) {
        const challenge = options.captcha?.read() ?? null;
        requireSdkCaptchaReceipt(receipt, challenge, now());
        const state = options.identity.read();
        if (
          !challenge || challenge.postId !== post.id || state.refreshRequired ||
          !state.registeredId
        ) return unavailable(post);
        await saveCaptcha({ ...challenge, attemptedAt: receipt.receivedAt });
      }
      await persist(Math.max(retryAt, now() + interruptedCooldownMs));
      let state = options.identity.read();
      if (state.refreshRequired || !state.registeredId) {
        await options.refresh();
        state = options.identity.read();
      }
      if (
        state.bindingId !== bindingId || state.refreshRequired ||
        !state.registeredId
      ) throw new Error();
      let restriction = "";
      let challengeCaptured = false;
      const source = createHeyboxTopicSource({
        deviceId: bindingId,
        cookie: `x_xhh_tokenid=B${state.registeredId}`,
        deviceInfo: "unidbg",
        osVersion: "6.0",
        dw: "0",
        appVersion: "1.3.400",
        appBuild: "1149",
        channel: "heybox",
        signatureMode: "app-v1149-rnd14",
        now: () => new Date(now()),
        onDetailRestricted: (reason) => restriction = reason,
        onDetailCaptcha: async ({ appId, postId }) => {
          await saveCaptcha({
            id: crypto.randomUUID(),
            appId,
            postId,
            createdAt: now(),
            attemptedAt: 0,
          });
          challengeCaptured = true;
          console.warn(JSON.stringify({ event: "sdk_captcha_required" }));
        },
        fetchFn: (input, init) => {
          const url = new URL(String(input));
          if (receipt) {
            if (
              url.origin !== "https://api.xiaoheihe.cn" ||
              url.pathname !== "/bbs/app/link/tree"
            ) throw new Error("Invalid verification target");
            url.searchParams.set("captcha_type", "confirm");
            url.searchParams.set("ticket", receipt.ticket);
            url.searchParams.set("randstr", receipt.randstr);
          }
          return (options.fetchFn ?? fetch)(url, {
            ...init,
            redirect: "error",
          });
        },
      });
      const result = await source.getPostDetails!(post);
      const success = result.detailsComplete === true ||
        result.detailUnavailable === "deleted";
      if (
        success ||
        (restriction && (restriction !== "show_captcha" || !challengeCaptured))
      ) {
        await saveCaptcha(null);
      }
      retryAt = receipt && success ? now() : Math.max(
        retryAt,
        now() + source.detailRetryAfter!() * 1000,
        receipt ? now() + 60000 : 0,
      );
      if (restriction === "lack_token") {
        await options.identity.save({ ...state, refreshRequired: true });
      }
      await persist(retryAt);
      return result;
    } catch {
      retryAt = Math.max(
        retryAt,
        options.identity.read().retryAt,
        now() + 60000,
      );
      if (!persistenceFailed) {
        try {
          await persist(retryAt);
        } catch { /* 写入失败已停止后续访问。 */ }
      }
      return unavailable(post);
    }
  }

  /**
   * 持久化挑战失败时停止本进程请求，避免丢失恢复所需的原请求绑定。
   * @param {import("./heybox_sdk_captcha.ts").SdkCaptchaChallenge | null} value 当前挑战或清除标记。
   * @return {Promise<void>} 挑战已保存。
   */
  async function saveCaptcha(
    value: import("./heybox_sdk_captcha.ts").SdkCaptchaChallenge | null,
  ): Promise<void> {
    try {
      if (value === null && !options.captcha?.read()) return;
      await options.captcha?.save(value);
    } catch {
      persistenceFailed = true;
      throw new Error("SDK verification state unavailable");
    }
  }

  return {
    /**
     * 在同一串行队列中确认当前挑战，过期、替换或重复的回执不会访问上游。
     * @param {unknown} value 通过私有输入传入的官方回执。
     * @return {Promise<TopicPost>} 原帖的完整详情或保留限制的失败结果。
     */
    confirmCaptcha(value: unknown): Promise<TopicPost> {
      const request = queue.then(() => {
        const challenge = options.captcha?.read() ?? null;
        const receipt = requireSdkCaptchaReceipt(value, challenge, now());
        return read({
          id: challenge!.postId,
          title: "",
          body: "",
          excerpt: "",
          comments: [],
          commentReplies: [],
          publishedAt: "",
          url: "",
        }, receipt);
      });
      queue = request.then(() => {}, () => {});
      return request;
    },
    /**
     * 合并到固定身份的串行队列，超出上限时不访问上游。
     * @param {TopicPost} post 原列表帖子。
     * @return {Promise<TopicPost>} 已校验的完整详情或未完成结果。
     */
    getPostDetails(post: TopicPost): Promise<TopicPost> {
      if (
        !/^[a-zA-Z0-9_-]{1,128}$/.test(post.id) ||
        pending >= maximumPendingRequests
      ) return Promise.resolve(unavailable(post));
      pending++;
      const snapshot = structuredClone(post);
      const request = queue.then(() => read(snapshot)).finally(() => pending--);
      queue = request.then(() => {}, () => {});
      return request;
    },
    /**
     * 返回持久限制的剩余秒数，SDK 换发令牌不能使详情提前重试。
     * @return {number} 共享冷却秒数。
     */
    detailRetryAfter(): number {
      return persistenceFailed ? 900 : Math.max(
        0,
        Math.ceil(
          (Math.max(retryAt, options.identity.read().retryAt) - now()) / 1000,
        ),
      );
    },
  };
}
