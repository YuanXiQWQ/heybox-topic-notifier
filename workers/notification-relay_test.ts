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
    (input, init) => {
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
    (input, init) => {
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

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}
