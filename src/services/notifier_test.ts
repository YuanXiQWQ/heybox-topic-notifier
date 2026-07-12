import type { AppSettings, MatchRecord } from "../models.ts";
import { createNotifier } from "./notifier.ts";

const settings: AppSettings = {
  activeKeywordTarget: "common",
  commonKeywordRules: [],
  darkMode: false,
  locale: "zh-CN",
  notificationEmailAddress: "test@example.com",
  notificationProvider: "webhook",
  notificationServerChanSendKey: "SCT-test",
  notificationWebhookService: "custom",
  notificationWebhookUrl: "https://example.com/settings-webhook",
  notificationWxPusherSpt: "SPT-test",
  polling: {
    intervalMinutes: 1,
    postLimit: 20,
    sort: "publishTime",
  },
  themeColor: "#bd7fff",
  topics: [],
};

const record: MatchRecord = {
  id: "12099:p1:help:title",
  keyword: "help",
  location: "title",
  matchedAt: "2026-07-12T00:00:00.000Z",
  post: {
    body: "",
    commentReplies: [],
    comments: [],
    excerpt: "",
    id: "p1",
    publishedAt: "2026-07-12T00:00:00.000Z",
    title: "Need help",
    url: "https://example.com/p1",
  },
};

Deno.test("sendMatch posts a JSON webhook payload", async () => {
  const requests: Request[] = [];
  const notifier = createNotifier({
    fetch: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(new Response(null, { status: 204 }));
    },
    webhookUrl: "https://example.com/webhook",
  });

  const result = await notifier.sendMatch(record, settings);

  assertEquals(result, { provider: "webhook", sent: true });
  assertEquals(requests.length, 1);
  assertEquals(requests[0].url, "https://example.com/settings-webhook");
  assertEquals(requests[0].method, "POST");
  assertEquals(requests[0].headers.get("content-type"), "application/json; charset=utf-8");
  const body = await requests[0].json();
  assertEquals(body.type, "match");
  assertEquals(body.match.keyword, "help");
  assertEquals(body.match.post.url, "https://example.com/p1");
});

Deno.test("disabled provider does not send a request", async () => {
  let calls = 0;
  const notifier = createNotifier({
    fetch: () => {
      calls += 1;
      return Promise.resolve(new Response(null, { status: 204 }));
    },
    webhookUrl: "https://example.com/webhook",
  });

  const result = await notifier.sendTest({ ...settings, notificationProvider: "disabled" });

  assertEquals(result, { provider: "disabled", sent: false });
  assertEquals(calls, 0);
});

Deno.test("server chan webhook receives title and desp fields", async () => {
  const requests: Request[] = [];
  const notifier = createNotifier({
    fetch: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    },
  });

  await notifier.sendMatch(record, {
    ...settings,
    notificationWebhookService: "custom",
    notificationWebhookUrl: "https://sctapi.ftqq.com/SENDKEY.send",
  });

  const body = await requests[0].json();
  assertEquals(body.title, "小黑盒命中：help");
  assertEquals(body.desp.includes("Need help"), true);
  assertEquals(body.desp.includes("https://example.com/p1"), true);
  assertEquals("type" in body, false);
});

Deno.test("server chan service builds the webhook URL from SendKey", async () => {
  const requests: Request[] = [];
  const notifier = createNotifier({
    fetch: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    },
  });

  await notifier.sendMatch(record, {
    ...settings,
    notificationServerChanSendKey: "SCT123",
    notificationWebhookService: "serverChan",
    notificationWebhookUrl: "",
  });

  assertEquals(requests[0].url, "https://sctapi.ftqq.com/SCT123.send");
  const body = await requests[0].json();
  assertEquals(body.title, "小黑盒命中：help");
});

Deno.test("server chan 3 webhook receives title and desp fields", async () => {
  const requests: Request[] = [];
  const notifier = createNotifier({
    fetch: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    },
  });

  await notifier.sendTest({
    ...settings,
    notificationServerChanSendKey: "sctp123token",
    notificationWebhookService: "serverChan",
    notificationWebhookUrl: "",
  });

  assertEquals(requests[0].url, "https://123.push.ft07.com/send/sctp123token.send");
  const body = await requests[0].json();
  assertEquals(body, {
    desp: "Heybox topic notifier test notification.",
    title: "小黑盒话题提醒测试",
  });
});

Deno.test("wxpusher service posts to the simple push API", async () => {
  const requests: Request[] = [];
  const notifier = createNotifier({
    fetch: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(new Response(JSON.stringify({ code: 1000 }), { status: 200 }));
    },
  });

  await notifier.sendMatch(record, {
    ...settings,
    notificationWebhookService: "wxPusher",
    notificationWebhookUrl: "",
    notificationWxPusherSpt: "SPT123",
  });

  assertEquals(
    requests[0].url,
    "https://wxpusher.zjiecode.com/api/send/message/simple-push",
  );
  const body = await requests[0].json();
  assertEquals(body.spt, "SPT123");
  assertEquals(body.contentType, 1);
  assertEquals(body.summary, "小黑盒命中：help");
  assertEquals(body.content.includes("Need help"), true);
  assertEquals(body.content.includes("https://example.com/p1"), true);
});

Deno.test("wxpusher service reports business errors from the API", async () => {
  const notifier = createNotifier({
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify({ code: 1001, msg: "invalid spt" }), { status: 200 }),
      ),
  });

  await assertRejects(
    () =>
      notifier.sendTest({
        ...settings,
        notificationWebhookService: "wxPusher",
        notificationWebhookUrl: "",
        notificationWxPusherSpt: "SPT123",
      }),
    "WxPusher notification failed: invalid spt",
  );
});

Deno.test("webhook provider requires a webhook URL", async () => {
  const notifier = createNotifier({ webhookUrl: "" });

  await assertRejects(
    () => notifier.sendTest({ ...settings, notificationWebhookUrl: "" }),
    "NOTIFIER_WEBHOOK_URL is required for webhook notifications.",
  );
});

Deno.test("server chan service requires a SendKey", async () => {
  const notifier = createNotifier({ webhookUrl: "" });

  await assertRejects(
    () =>
      notifier.sendTest({
        ...settings,
        notificationServerChanSendKey: "",
        notificationWebhookService: "serverChan",
        notificationWebhookUrl: "",
      }),
    "Server酱 SendKey is required for webhook notifications.",
  );
});

Deno.test("wxpusher service requires an SPT", async () => {
  const notifier = createNotifier({ webhookUrl: "" });

  await assertRejects(
    () =>
      notifier.sendTest({
        ...settings,
        notificationWebhookService: "wxPusher",
        notificationWebhookUrl: "",
        notificationWxPusherSpt: "",
      }),
    "WxPusher SPT is required for webhook notifications.",
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

async function assertRejects(fn: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof Error && error.message === message) {
      return;
    }
    throw error;
  }

  throw new Error(`Expected rejection with message: ${message}`);
}
