import type { AppSettings, MatchRecord } from "../models.ts";
import { createNotifier } from "./notifier.ts";

const settings: AppSettings = {
  activeKeywordTarget: "common",
  commonKeywordRules: [],
  darkMode: false,
  locale: "zh-CN",
  notificationEmailAddress: "test@example.com",
  notificationEmailApiToken: "email-api-token",
  notificationEmailApiUrl: "https://example.com/email-api",
  notificationEmailFrom: "from@example.com",
  notificationEmailService: "smtp",
  notificationProvider: "webhook",
  notificationPushPlusToken: "pushplus-test",
  notificationServerChanSendKey: "SCT-test",
  notificationSmtpHost: "smtp.example.com",
  notificationSmtpPassword: "smtp-password",
  notificationSmtpPort: 465,
  notificationSmtpSecure: true,
  notificationSmtpUsername: "smtp-user",
  notificationWebhookService: "custom",
  notificationWebhookUrl: "https://example.com/settings-webhook",
  notificationWxPusherSpt: "SPT-test",
  polling: {
    enabled: true,
    intervalUnit: "minute",
    intervalValue: 1,
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

const secondRecord: MatchRecord = {
  id: "12099:p2:guide:body",
  keyword: "guide",
  location: "body",
  matchedAt: "2026-07-12T00:01:00.000Z",
  post: {
    body:
      "This body is intentionally long so the notification preview is shorter than the pending table preview.",
    commentReplies: [],
    comments: [],
    excerpt: "",
    id: "p2",
    publishedAt: "2026-07-12T00:00:30.000Z",
    title: "Guide request",
    url: "https://example.com/p2",
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

Deno.test("sendMatches posts one localized markdown summary", async () => {
  const requests: Request[] = [];
  const notifier = createNotifier({
    fetch: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });

  const result = await notifier.sendMatches(
    [record, secondRecord],
    {
      ...settings,
      notificationWebhookService: "custom",
      notificationWebhookUrl: "https://example.com/batch-webhook",
    },
  );

  assertEquals(result, { provider: "webhook", sent: true });
  assertEquals(requests.length, 1);
  const body = await requests[0].json();
  assertEquals(body.type, "matches");
  assertEquals(body.title, "小黑盒话题提醒：轮询命中");
  assertEquals(body.text.includes("[Need help](https://example.com/p1)"), true);
  assertEquals(body.text.includes("标题："), false);
  assertEquals(body.text.includes("内容："), false);
  assertEquals(body.text.includes("发帖时间："), true);
  assertEquals(body.text.includes("命中时间："), false);
  assertEquals(body.text.includes("命中关键词：help"), true);
  assertEquals(body.text.includes("匹配位置：标题"), true);
  assertEquals(body.text.includes("\n\n---\n\n"), true);
  assertEquals(body.text.includes("[访问帖子]"), false);
  assertEquals(body.text.includes("This body is intentionally long"), true);
  assertEquals(body.text.includes("pending table preview."), false);
});

Deno.test("sendMatches summarizes omitted records when the markdown would be too long", async () => {
  const requests: Request[] = [];
  const notifier = createNotifier({
    fetch: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });
  const records = Array.from({ length: 80 }, (_, index) => ({
    ...secondRecord,
    id: `12099:p${index}:guide:body`,
    post: {
      ...secondRecord.post,
      id: `p${index}`,
      title: `Guide request ${index}`,
      url: `https://example.com/p${index}`,
    },
  }));

  await notifier.sendMatches(records, {
    ...settings,
    notificationWebhookService: "custom",
    notificationWebhookUrl: "https://example.com/batch-webhook",
  });

  const body = await requests[0].json();
  assertEquals(body.text.includes("及另外 "), true);
  assertEquals(body.text.length <= 3700, true);
});

Deno.test("email provider sends matching plain text and HTML content", async () => {
  const messages: Array<{
    from: string;
    html: string;
    subject: string;
    text: string;
    to: string;
  }> = [];
  const configs: Array<{
    host: string;
    password: string;
    port: number;
    secure: boolean;
    username: string;
  }> = [];
  const notifier = createNotifier({
    emailSender: (message, config) => {
      messages.push(message);
      configs.push(config);
      return Promise.resolve();
    },
  });

  const result = await notifier.sendMatches([record, secondRecord], {
    ...settings,
    notificationProvider: "email",
  });

  assertEquals(result, { provider: "email", sent: true });
  assertEquals(messages.length, 1);
  assertEquals(configs[0], {
    host: "smtp.example.com",
    password: "smtp-password",
    port: 465,
    secure: true,
    username: "smtp-user",
  });
  assertEquals(messages[0].from, "from@example.com");
  assertEquals(messages[0].to, "test@example.com");
  assertEquals(messages[0].subject, "小黑盒话题提醒：轮询命中");
  assertEquals(messages[0].text.includes("[Need help](https://example.com/p1)"), true);
  assertEquals(messages[0].text.includes("发帖时间："), true);
  assertEquals(messages[0].html.includes('<a href="https://example.com/p1">Need help</a>'), true);
  assertEquals(messages[0].html.includes("<hr>"), true);
  assertEquals(messages[0].html.includes("命中时间"), false);
});

Deno.test("email API provider posts the email payload to the configured API", async () => {
  const requests: Request[] = [];
  const notifier = createNotifier({
    fetch: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });

  const result = await notifier.sendMatches([record], {
    ...settings,
    notificationEmailService: "api",
    notificationProvider: "email",
  });

  assertEquals(result, { provider: "email", sent: true });
  assertEquals(requests.length, 1);
  assertEquals(requests[0].url, "https://example.com/email-api");
  assertEquals(requests[0].method, "POST");
  assertEquals(requests[0].headers.get("authorization"), "Bearer email-api-token");
  const body = await requests[0].json();
  assertEquals(body.from, "from@example.com");
  assertEquals(body.to, "test@example.com");
  assertEquals(body.subject, "小黑盒话题提醒：轮询命中");
  assertEquals(body.text.includes("[Need help](https://example.com/p1)"), true);
  assertEquals(body.html.includes('<a href="https://example.com/p1">Need help</a>'), true);
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

Deno.test("webhook provider reports slow delivery as a timeout", async () => {
  const notifier = createNotifier({
    deliveryTimeoutMs: 1,
    fetch: (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      }),
  });

  await assertRejects(
    () => notifier.sendTest(settings),
    "Custom webhook notification to example.com timed out after 1 ms.",
  );
});

Deno.test("email provider reports slow SMTP delivery as a timeout", async () => {
  const notifier = createNotifier({
    deliveryTimeoutMs: 1,
    emailSender: () => new Promise<void>(() => {}),
  });

  await assertRejects(
    () => notifier.sendTest({ ...settings, notificationProvider: "email" }),
    "Email notification timed out after 1 ms.",
  );
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
  assertEquals(body.title, "小黑盒话题提醒：测试通知");
  assertEquals(body.desp.includes("帖子 "), true);
  assertEquals(
    body.desp.includes("https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/"),
    true,
  );
  assertEquals(body.desp.includes("发帖时间："), true);
  assertEquals(body.desp.includes("命中关键词："), true);
  assertEquals(body.desp.includes("匹配位置："), true);
  assertEquals(body.desp.includes("命中时间："), false);
  assertEquals(body.desp.includes("及另外 "), true);
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

Deno.test("pushplus service posts to the send API", async () => {
  const requests: Request[] = [];
  const notifier = createNotifier({
    fetch: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(new Response(JSON.stringify({ code: 200 }), { status: 200 }));
    },
  });

  await notifier.sendMatch(record, {
    ...settings,
    notificationPushPlusToken: "pushplus-token",
    notificationWebhookService: "pushPlus",
    notificationWebhookUrl: "",
  });

  assertEquals(requests[0].url, "https://www.pushplus.plus/send");
  const body = await requests[0].json();
  assertEquals(body.token, "pushplus-token");
  assertEquals(body.template, "markdown");
  assertEquals(body.title, "小黑盒命中：help");
  assertEquals(body.content.includes("Need help"), true);
  assertEquals(body.content.includes("https://example.com/p1"), true);
});

Deno.test("pushplus service supports a configured send API URL", async () => {
  const requests: Request[] = [];
  const previousUrl = Deno.env.get("NOTIFIER_PUSHPLUS_SEND_URL");
  Deno.env.set("NOTIFIER_PUSHPLUS_SEND_URL", "https://relay.example.com/pushplus");
  try {
    const notifier = createNotifier({
      fetch: (input, init) => {
        requests.push(new Request(input, init));
        return Promise.resolve(new Response(JSON.stringify({ code: 200 }), { status: 200 }));
      },
    });

    await notifier.sendMatch(record, {
      ...settings,
      notificationPushPlusToken: "pushplus-token",
      notificationWebhookService: "pushPlus",
      notificationWebhookUrl: "",
    });
  } finally {
    if (previousUrl === undefined) {
      Deno.env.delete("NOTIFIER_PUSHPLUS_SEND_URL");
    } else {
      Deno.env.set("NOTIFIER_PUSHPLUS_SEND_URL", previousUrl);
    }
  }

  assertEquals(requests[0].url, "https://relay.example.com/pushplus");
});

Deno.test("pushplus service reports business errors from the API", async () => {
  const notifier = createNotifier({
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify({ code: 903, msg: "invalid token" }), { status: 200 }),
      ),
  });

  await assertRejects(
    () =>
      notifier.sendTest({
        ...settings,
        notificationPushPlusToken: "pushplus-token",
        notificationWebhookService: "pushPlus",
        notificationWebhookUrl: "",
      }),
    "PushPlus notification failed: invalid token",
  );
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

Deno.test("pushplus service requires a token", async () => {
  const notifier = createNotifier({ webhookUrl: "" });

  await assertRejects(
    () =>
      notifier.sendTest({
        ...settings,
        notificationPushPlusToken: "",
        notificationWebhookService: "pushPlus",
        notificationWebhookUrl: "",
      }),
    "PushPlus token is required for webhook notifications.",
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

Deno.test("email provider requires SMTP settings", async () => {
  const notifier = createNotifier({
    emailSender: () => Promise.resolve(),
  });

  await assertRejects(
    () =>
      notifier.sendTest({
        ...settings,
        notificationProvider: "email",
        notificationSmtpHost: "",
      }),
    "SMTP host is required for email notifications.",
  );
});

Deno.test("email API provider requires an API URL", async () => {
  const notifier = createNotifier({
    fetch: () => Promise.resolve(new Response(null, { status: 204 })),
  });

  await assertRejects(
    () =>
      notifier.sendTest({
        ...settings,
        notificationEmailApiUrl: "",
        notificationEmailService: "api",
        notificationProvider: "email",
      }),
    "Email API URL is required for email notifications.",
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
