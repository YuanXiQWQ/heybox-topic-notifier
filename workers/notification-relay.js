/**
 * @file 本文件实现通知中继 Cloudflare Worker，将受保护请求转发到固定上游服务。
 */
/**
 * 固定路径对应的通知服务上游地址。
 *
 * @type {Record<string, string>}
 */
const upstreamUrlByPath = {
  "/pushplus": "https://www.pushplus.plus/send",
  "/wxpusher": "https://wxpusher.zjiecode.com/api/send/message/simple-push",
};

// noinspection JSUnusedGlobalSymbols
export default {
  /**
   * 处理 Cloudflare Worker fetch 事件。
   *
   * @param {Request} request 入站请求。
   * @param {Object} env Worker 环境变量。
   * @return {Promise<Response>} 中继响应。
   */
  async fetch(request, env) {
    return await handleRelayRequest(request, env);
  },
};

/**
 * 处理通知中继请求。
 *
 * @param {Request} request 入站请求。
 * @param {Object} env Worker 环境变量。
 * @param {Function} upstreamFetch 上游请求函数。
 * @return {Promise<Response>} 中继响应。
 */
export async function handleRelayRequest(request, env, upstreamFetch = fetch) {
  const url = new URL(request.url);
  if (url.pathname === "/healthz") {
    return jsonResponse({ status: "ok" });
  }

  const upstreamUrl = upstreamUrlForRequest(url.pathname, request);
  if (!upstreamUrl) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, {
      allow: "POST",
    });
  }

  const relayToken = typeof env?.RELAY_TOKEN === "string" ? env.RELAY_TOKEN.trim() : "";
  if (!relayToken) {
    return jsonResponse({ error: "relay_token_not_configured" }, 500);
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!constantTimeEqual(authorization, `Bearer ${relayToken}`)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  if (upstreamUrl instanceof Response) {
    return upstreamUrl;
  }

  const upstreamResponse = await upstreamFetch(upstreamUrl, {
    body: await request.text(),
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
    method: "POST",
  });

  const headers = new Headers();
  const contentType = upstreamResponse.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  return new Response(upstreamResponse.body, {
    headers,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
  });
}

/**
 * 根据请求路径解析上游地址。
 *
 * @param {string} pathname 请求路径。
 * @param {Request} request 入站请求。
 * @return {string|Response} 上游地址，或无法转发时的错误响应。
 */
function upstreamUrlForRequest(pathname, request) {
  if (pathname === "/serverchan") {
    return serverChanUpstreamUrl(request.headers.get("x-serverchan-send-key") ?? "");
  }

  return upstreamUrlByPath[pathname] ?? "";
}

/**
 * 根据 Server 酱 SendKey 生成上游地址。
 *
 * @param {string} value 原始 SendKey。
 * @return {string|Response} Server 酱上游地址，或 SendKey 无效时的错误响应。
 */
function serverChanUpstreamUrl(value) {
  const sendKey = value.trim();
  if (!sendKey) {
    return jsonResponse({ error: "serverchan_send_key_required" }, 400);
  }

  if (!isSafeServerChanSendKey(sendKey)) {
    return jsonResponse({ error: "invalid_serverchan_send_key" }, 400);
  }

  const serverChan3Uid = sendKey.match(/^sctp(\d+)t/i)?.[1];
  const upstreamUrl = serverChan3Uid
    ? `https://${serverChan3Uid}.push.ft07.com/send/${sendKey}.send`
    : `https://sctapi.ftqq.com/${sendKey}.send`;

  return allowedServerChanUpstream(upstreamUrl)
    ? upstreamUrl
    : jsonResponse({ error: "invalid_serverchan_send_key" }, 400);
}

/**
 * 判断 Server 酱 SendKey 是否只包含安全字符。
 *
 * @param {string} value 待校验的 SendKey。
 * @return {boolean} SendKey 安全时返回 true。
 */
function isSafeServerChanSendKey(value) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return false;
  }

  return /^[A-Za-z0-9_-]+$/.test(value);
}

/**
 * 判断 Server 酱上游地址是否在允许的主机范围内。
 *
 * @param {string} value 待校验的上游地址。
 * @return {boolean} 上游地址允许时返回 true。
 */
function allowedServerChanUpstream(value) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "sctapi.ftqq.com" || /^\d+\.push\.ft07\.com$/.test(hostname);
  } catch {
    return false;
  }
}

/**
 * 创建 JSON 响应。
 *
 * @param {Object} body 响应体对象。
 * @param {number} status HTTP 状态码。
 * @param {Record<string, string>} headers 额外响应头。
 * @return {Response} JSON 响应。
 */
function jsonResponse(body, status = 200, headers = {}) {
  const responseHeaders = new Headers({
    "content-type": "application/json; charset=utf-8",
  });
  for (const [name, value] of Object.entries(headers)) {
    responseHeaders.set(name, value);
  }

  return new Response(JSON.stringify(body), {
    headers: responseHeaders,
    status,
  });
}

/**
 * 以固定时间比较两个字符串，降低令牌比较的时序泄漏风险。
 *
 * @param {string} left 左侧字符串。
 * @param {string} right 右侧字符串。
 * @return {boolean} 两个字符串相等时返回 true。
 */
function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}
