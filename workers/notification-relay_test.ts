/**
 * @file 本文件验证通知中继 Worker 的转发、鉴权和错误处理行为。
 */
import { handleRelayRequest } from "./notification-relay.js";

Deno.test("notification relay forwards pushplus requests with fixed upstream URL", async () => {
  const requests: Request[] = [];
  const response = await handleRelayRequest(
    new Request("https://relay.example.com/pushplus", {
      body: JSON.stringify({ title: "hello" }),
      headers: {
        authorization: "Bearer relay-secret",
        "content-type": "application/json; charset=utf-8",
      },
      method: "POST",
    }),
    { RELAY_TOKEN: "relay-secret" },
    (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return Promise.resolve(
        new Response(JSON.stringify({ code: 200 }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    },
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { code: 200 });
  assertEquals(requests.length, 1);
  assertEquals(requests[0].url, "https://www.pushplus.plus/send");
  assertEquals(requests[0].method, "POST");
  assertEquals(requests[0].headers.get("authorization"), null);
  assertEquals(await requests[0].json(), { title: "hello" });
});

Deno.test("notification relay forwards wxpusher requests with fixed upstream URL", async () => {
  const requests: Request[] = [];
  const response = await handleRelayRequest(
    new Request("https://relay.example.com/wxpusher", {
      body: JSON.stringify({ content: "hello" }),
      headers: {
        authorization: "Bearer relay-secret",
        "content-type": "application/json; charset=utf-8",
      },
      method: "POST",
    }),
    { RELAY_TOKEN: "relay-secret" },
    (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return Promise.resolve(
        new Response(JSON.stringify({ code: 1000 }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    },
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { code: 1000 });
  assertEquals(requests[0].url, "https://wxpusher.zjiecode.com/api/send/message/simple-push");
  assertEquals(requests[0].headers.get("content-type"), "application/json; charset=utf-8");
});

Deno.test("notification relay forwards server chan requests to sctapi", async () => {
  const requests: Request[] = [];
  const response = await handleRelayRequest(
    new Request("https://relay.example.com/serverchan", {
      body: JSON.stringify({ desp: "hello", title: "relay test" }),
      headers: {
        authorization: "Bearer relay-secret",
        "content-type": "application/json; charset=utf-8",
        "x-serverchan-send-key": "SCT123",
      },
      method: "POST",
    }),
    { RELAY_TOKEN: "relay-secret" },
    (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return Promise.resolve(
        new Response(JSON.stringify({ code: 0 }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    },
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { code: 0 });
  assertEquals(requests.length, 1);
  assertEquals(requests[0].url, "https://sctapi.ftqq.com/SCT123.send");
  assertEquals(requests[0].method, "POST");
  assertEquals(requests[0].headers.get("authorization"), null);
  assertEquals(requests[0].headers.get("x-serverchan-send-key"), null);
  assertEquals(requests[0].headers.get("content-type"), "application/json; charset=utf-8");
  assertEquals(await requests[0].json(), { desp: "hello", title: "relay test" });
});

Deno.test("notification relay forwards server chan 3 requests to uid host", async () => {
  const requests: Request[] = [];
  const response = await handleRelayRequest(
    new Request("https://relay.example.com/serverchan", {
      body: JSON.stringify({ desp: "hello", title: "relay test" }),
      headers: {
        authorization: "Bearer relay-secret",
        "x-serverchan-send-key": "sctp123tTOKEN",
      },
      method: "POST",
    }),
    { RELAY_TOKEN: "relay-secret" },
    (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  );

  assertEquals(response.status, 204);
  assertEquals(requests[0].url, "https://123.push.ft07.com/send/sctp123tTOKEN.send");
});

Deno.test("notification relay rejects missing server chan send key", async () => {
  let calls = 0;
  const response = await handleRelayRequest(
    new Request("https://relay.example.com/serverchan", {
      body: "{}",
      headers: { authorization: "Bearer relay-secret" },
      method: "POST",
    }),
    { RELAY_TOKEN: "relay-secret" },
    () => {
      calls += 1;
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "serverchan_send_key_required" });
  assertEquals(calls, 0);
});

Deno.test("notification relay rejects unsafe server chan send keys", async () => {
  const unsafeSendKeys = [
    "https://sctapi.ftqq.com/SCT123.send",
    "SCT/123",
    "SCT\\123",
    "SCT 123",
    "SCT?123",
    "SCT#123",
    "SCT@123",
  ];

  for (const sendKey of unsafeSendKeys) {
    const response = await handleRelayRequest(
      new Request("https://relay.example.com/serverchan", {
        body: "{}",
        headers: {
          authorization: "Bearer relay-secret",
          "x-serverchan-send-key": sendKey,
        },
        method: "POST",
      }),
      { RELAY_TOKEN: "relay-secret" },
      () => Promise.resolve(new Response(null, { status: 204 })),
    );

    assertEquals(response.status, 400);
    assertEquals(await response.json(), { error: "invalid_serverchan_send_key" });
  }
});

Deno.test("notification relay rejects missing authorization before forwarding", async () => {
  let calls = 0;
  const response = await handleRelayRequest(
    new Request("https://relay.example.com/pushplus", {
      body: "{}",
      method: "POST",
    }),
    { RELAY_TOKEN: "relay-secret" },
    () => {
      calls += 1;
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  );

  assertEquals(response.status, 401);
  assertEquals(calls, 0);
});

Deno.test("notification relay rejects unknown paths", async () => {
  const response = await handleRelayRequest(
    new Request("https://relay.example.com/https://example.com", {
      body: "{}",
      headers: { authorization: "Bearer relay-secret" },
      method: "POST",
    }),
    { RELAY_TOKEN: "relay-secret" },
    () => Promise.resolve(new Response(null, { status: 204 })),
  );

  assertEquals(response.status, 404);
});

Deno.test("notification relay exposes a health check", async () => {
  const response = await handleRelayRequest(
    new Request("https://relay.example.com/healthz"),
    { RELAY_TOKEN: "relay-secret" },
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { status: "ok" });
});

/**
 * 断言两个值的 JSON 表示完全一致。
 *
 * @param {unknown} actual 实际值。
 * @param {unknown} expected 期望值。
 */
function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}
