/** @file 复用官网匿名会话读取公开详情，令牌仅保存在进程内存中。 */
import { createHeyboxSignatureParams } from "./heybox_signer.ts";

/** 允许发送匿名会话凭据的唯一接口。 */
export const guestDetailEndpoint = "https://api.xiaoheihe.cn/bbs/app/link/tree";
/** 响应体的最大字节数。 */
const responseLimit = 1024 * 1024;
/** 官网初始化产出的会话；不得记录或序列化到日志、环境文件和数据库。 */
export type HeyboxGuestSession = {
  template: string;
  cookie: string;
  userAgent: string;
  expiresAt: number;
};
/** 匿名初始化与 HTTP 传输依赖，供隔离服务和离线测试使用。 */
export type GuestSessionOptions = {
  initialize: (id: string) => Promise<HeyboxGuestSession>;
  fetchFn?: typeof fetch;
  now?: () => number;
};

/**
 * 创建共享匿名会话的详情传输；过期或缺少令牌时才初始化，验证码不更换身份。
 * @param {GuestSessionOptions} options 匿名初始化器、HTTP 客户端及时间来源。
 * @return {(id: string) => Promise<Response>} 仅允许公开帖子标识的详情请求。
 */
export function createGuestDetailFetch(options: GuestSessionOptions) {
  const now = options.now ?? Date.now;
  const fetchFn = options.fetchFn ?? fetch;
  let session: HeyboxGuestSession | undefined;
  let initializing: Promise<HeyboxGuestSession> | undefined;
  let retryAt = 0;
  let queue: Promise<void> = Promise.resolve();

  /**
   * 合并并发初始化，验证目标及会话元数据，错误不携带上游请求信息。
   * @param {string} id 用于打开官网公开帖的标识。
   * @return {Promise<HeyboxGuestSession>} 有效的内存会话。
   */
  async function currentSession(id: string): Promise<HeyboxGuestSession> {
    if (session && session.expiresAt > now()) return session;
    initializing ??= options.initialize(id).then((value) => {
      const url = new URL(value.template);
      if (
        url.origin + url.pathname !== guestDetailEndpoint ||
        url.username || url.password || url.hash ||
        !/^x_xhh_tokenid=[^;\r\n]{1,4096}$/.test(value.cookie) ||
        !value.userAgent || /[\r\n]/.test(value.userAgent) ||
        !Number.isFinite(value.expiresAt) || value.expiresAt <= now()
      ) throw new Error("Invalid anonymous session");
      session = { ...value };
      return session;
    }).finally(() => initializing = undefined);
    return await initializing;
  }

  /**
   * 使用同一匿名身份签名和读取详情，限制响应大小并在异常时退避。
   * @param {string} id 公开帖子标识。
   * @return {Promise<Response>} 可由既有正文解析器处理的响应。
   */
  async function read(id: string): Promise<Response> {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      throw new Error("Invalid post id");
    }
    if (now() < retryAt) throw new Error("Anonymous session cooling down");
    try {
      const active = await currentSession(id);
      const url = new URL(active.template);
      const signature = createHeyboxSignatureParams(
        url.pathname,
        new Date(now()),
      );
      url.searchParams.set("link_id", id);
      url.searchParams.set("_time", String(signature.time));
      url.searchParams.set("nonce", signature.nonce);
      url.searchParams.set("hkey", signature.hkey);
      const response = await fetchFn(url, {
        headers: {
          accept: "application/json, text/plain, */*",
          cookie: active.cookie,
          "user-agent": active.userAgent,
          origin: "https://www.xiaoheihe.cn",
          referer: `https://www.xiaoheihe.cn/app/bbs/link/${id}`,
        },
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        // 单帖不存在不代表匿名身份失效，也不能阻塞其它公开帖。
        if (response.status !== 404 && response.status !== 410) {
          retryAt = Math.max(
            retryAt,
            now() + (response.status === 429 ? 900000 : 60000),
          );
        }
        await response.body?.cancel();
        return new Response(null, { status: response.status });
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Missing detail response");
      const decoder = new TextDecoder();
      let body = "", bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > responseLimit) {
            throw new Error("Detail response too large");
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      } finally {
        await reader.cancel();
      }
      const payload = JSON.parse(body);
      if (payload?.status === "lack_token") {
        session = undefined;
        retryAt = Math.max(retryAt, now() + 60000);
      } else if (
        payload?.status === "show_captcha" ||
        (payload?.status === "failed" && typeof payload?.msg === "string" &&
          payload.msg.includes("频繁"))
      ) {
        retryAt = Math.max(retryAt, now() + 900000);
      }
      return new Response(body, {
        headers: { "content-type": "application/json" },
      });
    } catch {
      retryAt = Math.max(retryAt, now() + 60000);
      throw new Error("Anonymous details unavailable");
    }
  }

  /**
   * 串行使用同一匿名身份，排队请求在发送前重新检查初始化及上游冷却状态。
   * @param {string} id 公开帖标识。
   * @return {Promise<Response>} 有界响应；冷却期间不会发送上游请求。
   */
  return (id: string): Promise<Response> => {
    const request = queue.then(() => read(id));
    queue = request.then(() => {}, () => {});
    return request;
  };
}
