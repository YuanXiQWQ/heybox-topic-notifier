/** @file 在独立出口读取小黑盒详情，限定请求目标并去重；不持有账号数据库或通知凭据。 */
import type { TopicPost } from "../models.ts";
import type { TopicSource } from "./topic_source.ts";

/** 仅接受帖子标识，禁止把中继变成任意 URL 代理。 */
const postIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;
/** 单条详情的传输上限，避免异常响应耗尽内存。 */
const maxResponseBytes = 1024 * 1024;
/** 短期详情缓存合并同轮匹配、记录保存和不同账号的重复访问。 */
const cacheMs = 120000;
/** 进程内缓存上限；缓存失效不影响 Oracle 上的业务记录。 */
const maxCacheEntries = 128;

/** 详情客户端的固定出口与独立鉴权配置。 */
export type DetailRelayConfig = {
  url: string;
  token: string;
  requestsPerMinute?: number;
  fetchFn?: typeof fetch;
  now?: () => number;
};

/**
 * 读取有长度上限的正文；超限时取消传输。
 * @param {ReadableStream<Uint8Array> | null} body 请求或响应正文。
 * @param {number} limit 最大字节数。
 * @return {Promise<string>} UTF-8 正文。
 */
async function readLimited(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<string> {
  if (!body) throw new Error("Missing body");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "", size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return text + decoder.decode();
      size += chunk.value.length;
      if (size > limit) throw new Error("Body limit exceeded");
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
}

/**
 * 校验详情响应与请求帖子一致，且只包含可展示的字符串字段。
 * @param {unknown} value 中继 JSON。
 * @param {string} id 请求的帖子标识。
 * @return {boolean} 是否为完整、有效的详情。
 */
function validPost(value: unknown, id: string): value is TopicPost {
  if (!value || typeof value !== "object") return false;
  const p = value as TopicPost;
  return p.id === id && p.detailsComplete === true &&
    [p.title, p.body, p.excerpt, p.publishedAt].every((v) =>
      typeof v === "string"
    ) &&
    [p.comments, p.commentReplies].every((v) =>
      Array.isArray(v) && v.every((t) => typeof t === "string")
    );
}

/**
 * 创建有界缓存和在途去重层，完整内容和明确删除状态短期复用，临时故障不缓存。
 * @param {(id: string) => Promise<TopicPost>} fetchPost 实际详情请求。
 * @param {() => number} now 当前时间。
 * @return {(id: string) => Promise<TopicPost>} 按帖子去重的读取函数。
 */
function cachedDetails(
  fetchPost: (id: string) => Promise<TopicPost>,
  now: () => number,
) {
  const cached = new Map<string, { expires: number; post: TopicPost }>();
  const pending = new Map<string, Promise<TopicPost>>();
  /**
   * 读取缓存或复用同一帖的在途请求。
   * @param {string} id 帖子标识。
   * @return {Promise<TopicPost>} 独立拷贝的详情。
   */
  return (id: string): Promise<TopicPost> => {
    const hit = cached.get(id);
    if (hit && hit.expires > now()) {
      return Promise.resolve(structuredClone(hit.post));
    }
    cached.delete(id);
    let request = pending.get(id);
    if (!request) {
      if (pending.size >= 8) {
        return Promise.reject(new Error("Detail relay busy"));
      }
      request = fetchPost(id).then((post) => {
        if (post.detailsComplete || post.detailUnavailable === "deleted") {
          if (
            new TextEncoder().encode(JSON.stringify(post)).length >
              maxResponseBytes
          ) throw new Error("Detail limit exceeded");
          cached.set(id, {
            expires: now() + cacheMs,
            post: structuredClone(post),
          });
          while (cached.size > maxCacheEntries) {
            cached.delete(cached.keys().next().value!);
          }
        }
        return post;
      }).finally(() => pending.delete(id));
      pending.set(id, request);
    }
    return request.then((post) => structuredClone(post));
  };
}

/**
 * 保留原列表来源，将详情访问交给固定的 HTTPS 出口。
 * @param {TopicSource} source 话题列表来源。
 * @param {DetailRelayConfig} config 独立出口与请求依赖。
 * @return {TopicSource} 共享详情缓存的数据源。
 */
export function withDetailRelay(
  source: TopicSource,
  config: DetailRelayConfig,
): TopicSource {
  const endpoint = new URL(config.url);
  if (
    endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
    endpoint.search || endpoint.hash || config.token.length < 32
  ) {
    throw new Error("Invalid detail relay configuration");
  }
  const fetchFn = config.fetchFn ?? fetch;
  const now = config.now ?? Date.now;
  const requestLimit = config.requestsPerMinute;
  if (
    requestLimit !== undefined &&
    (!Number.isInteger(requestLimit) || requestLimit < 1 || requestLimit > 60)
  ) throw new Error("Invalid detail relay request budget");
  /** 全部账号共享滚动窗口；缓存命中不占用真实出口请求预算。 */
  const requestTimes: number[] = [];
  let retryAt = 0;
  let failures = 0;
  const read = cachedDetails(async (id) => {
    if (now() < retryAt) throw new Error("Detail relay cooling down");
    const started = now();
    if (requestLimit !== undefined) {
      while (requestTimes.length && requestTimes[0] <= started - 60000) {
        requestTimes.shift();
      }
      if (requestTimes.length >= requestLimit) {
        return {
          id,
          title: "",
          body: "",
          excerpt: "",
          comments: [],
          commentReplies: [],
          publishedAt: "",
          url: "",
          detailsComplete: false,
          detailDeferredUntil: requestTimes[0] + 60000,
        };
      }
      requestTimes.push(started);
    }
    try {
      const response = await fetchFn(endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        if (response.status === 410) {
          const payload = JSON.parse(await readLimited(response.body, 1024));
          if (payload.id !== id || payload.reason !== "deleted") {
            throw new Error("Invalid deleted detail response");
          }
          return {
            id,
            title: "",
            body: "",
            excerpt: "",
            comments: [],
            commentReplies: [],
            publishedAt: "",
            url: "",
            detailsComplete: false,
            detailUnavailable: "deleted",
          };
        }
        if (response.status === 422) {
          await response.body?.cancel();
          return {
            id,
            title: "",
            body: "",
            excerpt: "",
            comments: [],
            commentReplies: [],
            publishedAt: "",
            url: "",
            detailsComplete: false,
          };
        }
        const seconds = Number(response.headers.get("retry-after"));
        retryAt = now() +
          (response.status === 401 || response.status === 403 ||
              response.status === 429
            ? 900000
            : Math.min(
              900,
              Math.max(60, Number.isFinite(seconds) ? seconds : 60),
            ) * 1000);
        await response.body?.cancel();
        console.warn(
          JSON.stringify({
            event: "heybox_detail_relay_failed",
            status: response.status,
          }),
        );
        throw new Error("Detail relay unavailable");
      }
      const text = await readLimited(response.body, maxResponseBytes);
      const post: unknown = JSON.parse(text);
      if (!validPost(post, id)) {
        throw new Error("Invalid detail relay response");
      }
      console.info(
        JSON.stringify({
          event: "heybox_detail_relay_success",
          bytes: new TextEncoder().encode(text).length,
          elapsedMs: now() - started,
        }),
      );
      failures = 0;
      return post;
    } catch {
      failures = Math.min(failures + 1, 5);
      retryAt = Math.max(
        retryAt,
        now() + Math.min(900000, 60000 * 2 ** (failures - 1)),
      );
      console.warn(
        JSON.stringify({
          event: "heybox_detail_relay_cooldown",
          retryAt: new Date(retryAt).toISOString(),
        }),
      );
      throw new Error("Detail relay unavailable");
    }
  }, now);
  return {
    /**
     * 沿用主服务的话题列表访问与排序。
     * @param {string} id 话题标识。
     * @param {import("./topic_source.ts").TopicListOptions} options 列表选项。
     * @return {Promise<TopicPost[]>} 列表帖子。
     */
    listLatestPosts: (id, options) => source.listLatestPosts(id, options),
    /**
     * 补充完整详情；预算耗尽时返回排队时间，出口失败时保留原帖并标记未完成。
     * @param {TopicPost} post 列表帖子。
     * @return {Promise<TopicPost>} 完整详情或待重试的列表帖子。
     */
    async getPostDetails(post: TopicPost): Promise<TopicPost> {
      const original = { ...post };
      delete original.detailDeferredUntil;
      delete original.detailUnavailable;
      try {
        if (!postIdPattern.test(post.id)) throw new Error("Invalid post id");
        const detail = await read(post.id);
        if (!detail.detailsComplete) {
          return {
            ...original,
            detailsComplete: false,
            ...(detail.detailUnavailable === "deleted"
              ? { detailUnavailable: "deleted" as const }
              : {}),
            ...(detail.detailDeferredUntil
              ? { detailDeferredUntil: detail.detailDeferredUntil }
              : {}),
          };
        }
        delete detail.detailDeferredUntil;
        return {
          ...original,
          ...detail,
          url: post.url,
          title: detail.title || post.title,
        };
      } catch {
        return { ...original, detailsComplete: false };
      }
    },
  };
}

/**
 * 创建仅接受固定帖子查询的鉴权中继；不接受任意目标地址或上游 Cookie。
 * @param {{token: string; source: TopicSource; now?: () => number}} options 独立密钥、上游来源和时钟。
 * @return {(request: Request) => Promise<Response>} HTTP 请求处理函数。
 */
export function createDetailRelayHandler(
  options: { token: string; source: TopicSource; now?: () => number },
) {
  if (options.token.length < 32) {
    throw new Error("Detail relay token must contain at least 32 characters");
  }
  const encoder = new TextEncoder();
  const expected = crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`Bearer ${options.token}`),
  );
  const read = cachedDetails(async (id) => {
    const post: TopicPost = {
      id,
      title: "",
      body: "",
      excerpt: "",
      comments: [],
      commentReplies: [],
      publishedAt: "",
      url: `https://www.xiaoheihe.cn/app/bbs/link/${id}`,
    };
    return await options.source.getPostDetails!(post);
  }, options.now ?? Date.now);
  /**
   * 在读取请求正文及访问上游前验证固定路由与独立密钥。
   * @param {Request} request HTTP 请求。
   * @return {Promise<Response>} 完整详情或不含凭据的失败状态。
   */
  return async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/healthz") {
      return Response.json({ ok: true });
    }
    if (request.method !== "POST" || path !== "/v1/details") {
      return new Response("Not found", { status: 404 });
    }
    const authorization = request.headers.get("authorization") ?? "";
    if (authorization.length > 512) {
      return new Response("Unauthorized", { status: 401 });
    }
    const actual = new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(authorization)),
    );
    const wanted = new Uint8Array(await expected);
    let difference = 0;
    for (let index = 0; index < wanted.length; index++) {
      difference |= actual[index] ^ wanted[index];
    }
    if (difference !== 0) return new Response("Unauthorized", { status: 401 });
    let id: string;
    try {
      const payload = JSON.parse(await readLimited(request.body, 1024));
      if (
        typeof payload.id !== "string" || !postIdPattern.test(payload.id) ||
        Object.keys(payload).some((k) => k !== "id")
      ) throw new Error("Invalid request");
      id = payload.id;
    } catch {
      return new Response("Invalid request", { status: 400 });
    }
    try {
      const post = await read(id);
      if (post.id === id && post.detailUnavailable === "deleted") {
        return Response.json({ id, reason: "deleted" }, {
          status: 410,
          headers: { "cache-control": "no-store" },
        });
      }
      if (!validPost(post, id)) {
        const retryAfter = options.source.detailRetryAfter?.() ?? 0;
        return new Response("Upstream details unavailable", {
          status: retryAfter > 0 ? 503 : 422,
          headers: retryAfter > 0
            ? { "retry-after": String(Math.min(900, Math.ceil(retryAfter))) }
            : {},
        });
      }
      const body = JSON.stringify(post);
      if (encoder.encode(body).length > maxResponseBytes) {
        return new Response("Response too large", { status: 502 });
      }
      return new Response(body, {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });
    } catch {
      return new Response("Upstream unavailable", { status: 503 });
    }
  };
}
