const upstreamUrlByPath = {
  "/pushplus": "https://www.pushplus.plus/send",
  "/wxpusher": "https://wxpusher.zjiecode.com/api/send/message/simple-push",
};

export default {
  async fetch(request, env) {
    return await handleRelayRequest(request, env);
  },
};

export async function handleRelayRequest(request, env, upstreamFetch = fetch) {
  const url = new URL(request.url);
  if (url.pathname === "/healthz") {
    return jsonResponse({ status: "ok" });
  }

  const upstreamUrl = upstreamUrlByPath[url.pathname];
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

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
    status,
  });
}

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
