import type { AppSettings, MatchRecord } from "../models.ts";

type NotifyKind = "match" | "test";

type NotificationPayload = {
  type: NotifyKind;
  text: string;
  match?: {
    id: string;
    keyword: string;
    location: string;
    matchedAt: string;
    post: {
      id: string;
      publishedAt: string;
      title: string;
      url: string;
    };
  };
};

export type NotifyResult = {
  provider: AppSettings["notificationProvider"];
  sent: boolean;
};

export type NotifierOptions = {
  fetch?: typeof fetch;
  webhookUrl?: string;
};

const pushPlusSendUrl = "https://www.pushplus.plus/send/";
const wxPusherSimplePushUrl = "https://wxpusher.zjiecode.com/api/send/message/simple-push";

export class NotificationConfigError extends Error {}

export class NotificationDeliveryError extends Error {}

export function createNotifier(options: NotifierOptions = {}) {
  const fetcher = options.fetch ?? fetch;
  const webhookUrl = options.webhookUrl ?? Deno.env.get("NOTIFIER_WEBHOOK_URL") ?? "";

  return {
    async sendMatch(record: MatchRecord, settings: AppSettings): Promise<NotifyResult> {
      return await send({
        payload: matchPayload(record),
        provider: settings.notificationProvider,
        pushPlusToken: settings.notificationPushPlusToken,
        serverChanSendKey: settings.notificationServerChanSendKey,
        webhookService: settings.notificationWebhookService,
        webhookUrl: settings.notificationWebhookUrl,
        wxPusherSpt: settings.notificationWxPusherSpt,
      });
    },

    async sendTest(settings: AppSettings): Promise<NotifyResult> {
      return await send({
        payload: {
          text: "Heybox topic notifier test notification.",
          type: "test",
        },
        provider: settings.notificationProvider,
        pushPlusToken: settings.notificationPushPlusToken,
        serverChanSendKey: settings.notificationServerChanSendKey,
        webhookService: settings.notificationWebhookService,
        webhookUrl: settings.notificationWebhookUrl,
        wxPusherSpt: settings.notificationWxPusherSpt,
      });
    },
  };

  async function send(options: {
    payload: NotificationPayload;
    provider: AppSettings["notificationProvider"];
    pushPlusToken: string;
    serverChanSendKey: string;
    webhookService: AppSettings["notificationWebhookService"];
    webhookUrl: string;
    wxPusherSpt: string;
  }): Promise<NotifyResult> {
    if (options.provider === "disabled") {
      return { provider: options.provider, sent: false };
    }

    if (options.provider === "email") {
      throw new NotificationConfigError("Email notifications are not implemented yet.");
    }

    if (options.webhookService === "pushPlus" && !options.pushPlusToken.trim()) {
      throw new NotificationConfigError(
        "PushPlus token is required for webhook notifications.",
      );
    }

    if (options.webhookService === "wxPusher" && !options.wxPusherSpt.trim()) {
      throw new NotificationConfigError(
        "WxPusher SPT is required for webhook notifications.",
      );
    }

    const targetWebhookUrl = targetUrlForWebhook({
      fallbackWebhookUrl: webhookUrl,
      serverChanSendKey: options.serverChanSendKey,
      webhookService: options.webhookService,
      webhookUrl: options.webhookUrl,
    });
    if (!targetWebhookUrl) {
      throw new NotificationConfigError(
        options.webhookService === "serverChan"
          ? "Server酱 SendKey is required for webhook notifications."
          : "NOTIFIER_WEBHOOK_URL is required for webhook notifications.",
      );
    }

    const response = await fetcher(targetWebhookUrl, {
      body: JSON.stringify(bodyForWebhook({
        payload: options.payload,
        pushPlusToken: options.pushPlusToken,
        service: options.webhookService,
        url: targetWebhookUrl,
        wxPusherSpt: options.wxPusherSpt,
      })),
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      method: "POST",
    });

    const responseBody = await response.text().catch(() => "");
    if (!response.ok) {
      throw new NotificationDeliveryError(
        `Webhook notification failed with HTTP ${response.status}${
          responseBody ? `: ${responseBody}` : ""
        }`,
      );
    }

    assertWebhookAccepted(options.webhookService, responseBody);

    return { provider: options.provider, sent: true };
  }
}

function targetUrlForWebhook(options: {
  fallbackWebhookUrl: string;
  serverChanSendKey: string;
  webhookService: AppSettings["notificationWebhookService"];
  webhookUrl: string;
}): string {
  if (options.webhookService === "pushPlus") {
    return pushPlusSendUrl;
  }

  if (options.webhookService === "wxPusher") {
    return wxPusherSimplePushUrl;
  }

  if (options.webhookService === "serverChan") {
    return serverChanUrlFromSendKey(options.serverChanSendKey);
  }

  return options.webhookUrl.trim() || options.fallbackWebhookUrl.trim();
}

function serverChanUrlFromSendKey(value: string): string {
  const sendKey = value.trim();
  if (!sendKey) {
    return "";
  }

  if (sendKey.startsWith("http://") || sendKey.startsWith("https://")) {
    return sendKey;
  }

  const serverChan3Uid = sendKey.match(/^sctp(\d+)t/i)?.[1];
  if (serverChan3Uid) {
    return `https://${serverChan3Uid}.push.ft07.com/send/${sendKey}.send`;
  }

  return `https://sctapi.ftqq.com/${sendKey}.send`;
}

function matchPayload(record: MatchRecord): NotificationPayload {
  return {
    match: {
      id: record.id,
      keyword: record.keyword,
      location: record.location,
      matchedAt: record.matchedAt,
      post: {
        id: record.post.id,
        publishedAt: record.post.publishedAt,
        title: record.post.title,
        url: record.post.url,
      },
    },
    text: `New Heybox match: ${record.keyword} in ${record.location} - ${record.post.title}`,
    type: "match",
  };
}

function bodyForWebhook(options: {
  payload: NotificationPayload;
  pushPlusToken: string;
  service: AppSettings["notificationWebhookService"];
  url: string;
  wxPusherSpt: string;
}): unknown {
  if (options.service === "pushPlus") {
    return {
      content: notificationDescription(options.payload),
      template: "markdown",
      title: notificationTitle(options.payload),
      token: options.pushPlusToken.trim(),
    };
  }

  if (options.service === "wxPusher") {
    return {
      content: notificationDescription(options.payload),
      contentType: 1,
      spt: options.wxPusherSpt.trim(),
      summary: notificationTitle(options.payload),
    };
  }

  if (options.service === "serverChan" || isServerChanUrl(options.url)) {
    return {
      desp: notificationDescription(options.payload),
      title: notificationTitle(options.payload),
    };
  }

  return options.payload;
}

function isServerChanUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "sctapi.ftqq.com" || hostname.endsWith(".push.ft07.com");
  } catch {
    return false;
  }
}

function assertWebhookAccepted(
  service: AppSettings["notificationWebhookService"],
  responseBody: string,
): void {
  if (service !== "wxPusher") {
    if (service !== "pushPlus") {
      return;
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseBody);
  } catch {
    throw new NotificationDeliveryError(
      `${serviceLabel(service)} notification failed with an invalid response: ${responseBody}`,
    );
  }

  const expectedCode = service === "wxPusher" ? 1000 : 200;
  if (isRecord(payload) && Number(payload.code) === expectedCode) {
    return;
  }

  const message = isRecord(payload) && typeof payload.msg !== "undefined"
    ? String(payload.msg)
    : responseBody;
  throw new NotificationDeliveryError(`${serviceLabel(service)} notification failed: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function serviceLabel(service: AppSettings["notificationWebhookService"]): string {
  return service === "pushPlus" ? "PushPlus" : "WxPusher";
}

function notificationTitle(payload: NotificationPayload): string {
  if (payload.type === "test") {
    return "小黑盒话题提醒测试";
  }

  return `小黑盒命中：${payload.match?.keyword ?? "关键词"}`;
}

function notificationDescription(payload: NotificationPayload): string {
  if (!payload.match) {
    return payload.text;
  }

  return [
    `标题：${payload.match.post.title}`,
    `关键词：${payload.match.keyword}`,
    `位置：${payload.match.location}`,
    `时间：${payload.match.matchedAt}`,
    "",
    `[打开帖子](${payload.match.post.url})`,
  ].join("\n");
}
