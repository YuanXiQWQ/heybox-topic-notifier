/** @file 通过固定 Android 实例的正常匿名 SDK 会话读取详情，保持身份和冷却状态。 */
import type { TopicPost } from "../models.ts";
import { createHeyboxTopicSource } from "./heybox_topic_source.ts";

/** 官方 App 已完成初始化的只读快照；仅在内存和受保护的进程管道内传递。 */
export type HeyboxNativeSession = {
  deviceId: string;
  token: string;
  model: string;
  osVersion: string;
  dw: string;
  appVersion: "1.3.400";
  appBuild: "1149";
  channel: "heybox";
  /** 缓存最近一次实际观察时间，不表示 SDK 标识的签发或过期时间。 */
  observedAt: number;
};

/** 外部初始化器必须复用同一专用设备；验证码不得触发清缓存或更换设备。 */
export type NativeSessionOptions = {
  readSession: (signal: AbortSignal) => Promise<unknown>;
  /** 从持久设备绑定读取；重启服务不能重新选择其它设备。 */
  expectedDeviceId: string;
  fetchFn?: typeof fetch;
  now?: () => number;
  /** 初始化器的读取时限；到期后中止本次读取并进入退避。 */
  sessionReadTimeoutMs?: number;
  /** 同一设备独占状态文件中恢复的冷却期限；不保存 SDK 标识。 */
  initialRetryAt?: number;
  /** 请求前预留中断保护，收到完整结果后再落盘实际冷却；写入失败停止取数。 */
  persistRetryAt?: (retryAt: number) => Promise<void>;
  /** 仅报告明确令牌拒绝或完整详情成功，供发布器正常刷新同一设备的 SDK。 */
  onSessionStatus?: (
    status: "accepted" | "rejected",
    retryAt: number,
    observedAt: number,
  ) => void;
};

/** 仅使用十分钟以内实际观察到的 App 缓存，不把断开的设备无限视为可用。 */
const observationMaxAgeMs = 10 * 60 * 1000;
/** 设备观察器与出口主机之间允许有限时钟偏差。 */
const observationClockSkewMs = 30000;
/** 初始化或传输失败的最低退避，和上游验证码的更长冷却取较晚时间。 */
const unavailableCooldownMs = 60000;
/** 限制同一设备等待中的详情请求，防止设备离线时无界积压。 */
const maxPendingRequests = 8;
/** 覆盖上游十五分钟冷却和请求在途时限，保护响应落盘前的进程中断。 */
const interruptedRequestCooldownMs = 930000;

/**
 * 校验正常 App 输出的匿名会话，拒绝离线 D 标识、身份轮换和过期观察。
 * @param {unknown} value 初始化器的只读快照。
 * @param {string} expectedDeviceId 已持久绑定的设备编号。
 * @param {number} now 当前时间戳。
 * @return {HeyboxNativeSession} 仅含所需字段的独立内存快照。
 */
export function requireNativeSession(
  value: unknown,
  expectedDeviceId: string,
  now: number,
): HeyboxNativeSession {
  const v = value as Partial<HeyboxNativeSession> | null;
  if (
    !/^[a-f0-9]{16}$/.test(expectedDeviceId) ||
    !v || typeof v !== "object" ||
    v.deviceId !== expectedDeviceId ||
    typeof v.token !== "string" || !/^B[A-Za-z0-9+/=_-]{88}$/.test(v.token) ||
    typeof v.model !== "string" || !/^[\w .-]{1,64}$/.test(v.model) ||
    typeof v.osVersion !== "string" || !/^\d+(?:\.\d+)*$/.test(v.osVersion) ||
    typeof v.dw !== "string" || !/^\d{2,4}$/.test(v.dw) ||
    v.appVersion !== "1.3.400" || v.appBuild !== "1149" ||
    v.channel !== "heybox" || typeof v.observedAt !== "number" ||
    !Number.isFinite(v.observedAt) ||
    v.observedAt > now + observationClockSkewMs ||
    now - v.observedAt >= observationMaxAgeMs
  ) throw new Error("Native anonymous session unavailable");
  return {
    deviceId: expectedDeviceId,
    token: v.token,
    model: v.model,
    osVersion: v.osVersion,
    dw: v.dw,
    appVersion: v.appVersion,
    appBuild: v.appBuild,
    channel: v.channel,
    observedAt: v.observedAt,
  };
}

/**
 * 创建串行详情来源；每次取数先读取 SDK 快照，令牌更新不会重置冷却。
 * @param {NativeSessionOptions} options 固定设备、正常 SDK 初始化器和传输依赖。
 * @return {object} 可组合到列表来源的详情方法和剩余冷却时间。
 */
export function createNativeSessionDetails(options: NativeSessionOptions) {
  if (!/^[a-f0-9]{16}$/.test(options.expectedDeviceId)) {
    throw new Error("Configure a persistent native device binding");
  }
  const now = options.now ?? Date.now;
  const timeoutMs = options.sessionReadTimeoutMs ?? 10000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) {
    throw new Error("Invalid native session read timeout");
  }
  let retryAt = options.initialRetryAt ?? 0;
  if (!Number.isSafeInteger(retryAt) || retryAt < 0) {
    throw new Error("Invalid native retry checkpoint");
  }
  let persistenceFailed = false;
  let queue: Promise<void> = Promise.resolve();
  let pending = 0;

  /**
   * 等待冷却检查点持久化；写入异常后本进程不再请求上游。
   * @param {number} value 待保存的冷却时间戳。
   * @return {Promise<void>} 检查点已确认写入。
   */
  async function persist(value: number): Promise<void> {
    try {
      await options.persistRetryAt?.(value);
    } catch {
      persistenceFailed = true;
      retryAt = Math.max(retryAt, now() + interruptedRequestCooldownMs);
      throw new Error("Native retry checkpoint unavailable");
    }
  }

  /**
   * 有界读取设备快照；初始化器应响应中止信号停止 ADB 或其它子进程。
   * @return {Promise<unknown>} 初始化器实际观察到的状态。
   */
  async function readSnapshot(): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => options.readSession(controller.signal)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("Native session read timed out"));
          }, timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 保留列表信息并标明详情未取得，不输出初始化器异常中的设备或令牌。
   * @param {TopicPost} post 原列表帖子。
   * @return {TopicPost} 未完成的详情记录。
   */
  function unavailable(post: TopicPost): TopicPost {
    const result = { ...post, detailsComplete: false };
    delete result.detailUnavailable;
    delete result.detailDeferredUntil;
    return result;
  }

  /**
   * 在共享冷却之外读取同一设备的当前 SDK 标识，并使用既有完整正文解析器。
   * @param {TopicPost} post 原列表帖子。
   * @return {Promise<TopicPost>} 完整详情或明确未完成的原记录。
   */
  async function read(post: TopicPost): Promise<TopicPost> {
    if (persistenceFailed || now() < retryAt) return unavailable(post);
    try {
      const session = requireNativeSession(
        await readSnapshot(),
        options.expectedDeviceId,
        now(),
      );
      let tokenRejected = false;
      const source = createHeyboxTopicSource({
        deviceId: session.deviceId,
        cookie: `x_xhh_tokenid=${session.token}`,
        deviceInfo: session.model,
        osVersion: session.osVersion,
        dw: session.dw,
        appVersion: session.appVersion,
        appBuild: session.appBuild,
        channel: session.channel,
        signatureMode: "app-v1149-rnd14",
        onDetailRestricted: (reason) => tokenRejected = reason === "lack_token",
        now: () => new Date(now()),
        /**
         * 将匿名身份限定发送给官方详情接口，禁止重定向转发 Cookie。
         * @param {RequestInfo | URL} input 已签名的公开帖子请求。
         * @param {RequestInit} init 请求选项。
         * @return {Promise<Response>} 供既有解析器校验的响应。
         */
        fetchFn: (input, init) =>
          (options.fetchFn ?? fetch)(input, {
            ...init,
            redirect: "error",
          }),
      });
      await persist(now() + interruptedRequestCooldownMs);
      const result = await source.getPostDetails!(post);
      retryAt = Math.max(retryAt, now() + source.detailRetryAfter!() * 1000);
      await persist(retryAt);
      if (tokenRejected || result.detailsComplete) {
        options.onSessionStatus?.(
          tokenRejected ? "rejected" : "accepted",
          retryAt,
          session.observedAt,
        );
      }
      return result;
    } catch {
      retryAt = Math.max(retryAt, now() + unavailableCooldownMs);
      if (!persistenceFailed) {
        try {
          await persist(retryAt);
        } catch {
          // 持久化故障已锁住本进程的上游访问，不能因错误处理再次开放。
        }
      }
      return unavailable(post);
    }
  }

  return {
    /**
     * 排队使用固定匿名设备，后续请求发送前重新检查上游冷却。
     * @param {TopicPost} post 原列表帖子。
     * @return {Promise<TopicPost>} 已校验的完整详情或未完成记录。
     */
    getPostDetails(post: TopicPost): Promise<TopicPost> {
      if (
        !/^[a-zA-Z0-9_-]{1,128}$/.test(post.id) || pending >= maxPendingRequests
      ) {
        return Promise.resolve(unavailable(post));
      }
      pending++;
      const snapshot = structuredClone(post);
      const request = queue.then(() => read(snapshot)).finally(() => pending--);
      queue = request.then(() => {}, () => {});
      return request;
    },
    /**
     * 返回共享冷却，SDK 自行更新标识不能使该时间提前。
     * @return {number} 剩余冷却秒数。
     */
    detailRetryAfter(): number {
      return Math.max(0, Math.ceil((retryAt - now()) / 1000));
    },
  };
}
