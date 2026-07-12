import type { AppSettings, MatchRecord } from "../models.ts";
import { getMessages } from "../locales/index.ts";
import { truncateText } from "../views/text.ts";
import { formatHeyboxRelativeTime } from "../views/time.ts";

type NotifyKind = "match" | "matches" | "test";

type NotificationPayload = {
  html?: string;
  title?: string;
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
  matches?: MatchRecord[];
};

export type NotifyResult = {
  provider: AppSettings["notificationProvider"];
  sent: boolean;
};

export type NotifierOptions = {
  emailSender?: EmailSender;
  fetch?: typeof fetch;
  webhookUrl?: string;
};

type EmailMessage = {
  from: string;
  html: string;
  subject: string;
  text: string;
  to: string;
};

type SmtpConfig = {
  host: string;
  password: string;
  port: number;
  secure: boolean;
  username: string;
};

type EmailSender = (message: EmailMessage, config: SmtpConfig) => Promise<void>;

const pushPlusSendUrl = "https://www.pushplus.plus/send/";
const wxPusherSimplePushUrl = "https://wxpusher.zjiecode.com/api/send/message/simple-push";
const notificationContentLimit = 3600;
const notificationContentPreviewLength = 60;
const notificationTitlePreviewLength = 80;
const markdownHardBreak = "  \n";
const markdownSeparator = "\n\n---\n\n";

export class NotificationConfigError extends Error {}

export class NotificationDeliveryError extends Error {}

export function createNotifier(options: NotifierOptions = {}) {
  const emailSender = options.emailSender ?? sendSmtpEmail;
  const fetcher = options.fetch ?? fetch;
  const webhookUrl = options.webhookUrl ?? Deno.env.get("NOTIFIER_WEBHOOK_URL") ?? "";

  return {
    async sendMatch(record: MatchRecord, settings: AppSettings): Promise<NotifyResult> {
      return await send({
        payload: matchPayload(record),
        provider: settings.notificationProvider,
        emailAddress: settings.notificationEmailAddress,
        emailApiToken: settings.notificationEmailApiToken,
        emailApiUrl: settings.notificationEmailApiUrl,
        emailFrom: settings.notificationEmailFrom,
        emailService: settings.notificationEmailService,
        pushPlusToken: settings.notificationPushPlusToken,
        serverChanSendKey: settings.notificationServerChanSendKey,
        smtpHost: settings.notificationSmtpHost,
        smtpPassword: settings.notificationSmtpPassword,
        smtpPort: settings.notificationSmtpPort,
        smtpSecure: settings.notificationSmtpSecure,
        smtpUsername: settings.notificationSmtpUsername,
        webhookService: settings.notificationWebhookService,
        webhookUrl: settings.notificationWebhookUrl,
        wxPusherSpt: settings.notificationWxPusherSpt,
      });
    },

    async sendMatches(records: MatchRecord[], settings: AppSettings): Promise<NotifyResult> {
      if (records.length === 0) {
        return { provider: settings.notificationProvider, sent: false };
      }

      return await send({
        payload: matchesPayload(records, settings),
        provider: settings.notificationProvider,
        emailAddress: settings.notificationEmailAddress,
        emailApiToken: settings.notificationEmailApiToken,
        emailApiUrl: settings.notificationEmailApiUrl,
        emailFrom: settings.notificationEmailFrom,
        emailService: settings.notificationEmailService,
        pushPlusToken: settings.notificationPushPlusToken,
        serverChanSendKey: settings.notificationServerChanSendKey,
        smtpHost: settings.notificationSmtpHost,
        smtpPassword: settings.notificationSmtpPassword,
        smtpPort: settings.notificationSmtpPort,
        smtpSecure: settings.notificationSmtpSecure,
        smtpUsername: settings.notificationSmtpUsername,
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
        emailAddress: settings.notificationEmailAddress,
        emailApiToken: settings.notificationEmailApiToken,
        emailApiUrl: settings.notificationEmailApiUrl,
        emailFrom: settings.notificationEmailFrom,
        emailService: settings.notificationEmailService,
        pushPlusToken: settings.notificationPushPlusToken,
        serverChanSendKey: settings.notificationServerChanSendKey,
        smtpHost: settings.notificationSmtpHost,
        smtpPassword: settings.notificationSmtpPassword,
        smtpPort: settings.notificationSmtpPort,
        smtpSecure: settings.notificationSmtpSecure,
        smtpUsername: settings.notificationSmtpUsername,
        webhookService: settings.notificationWebhookService,
        webhookUrl: settings.notificationWebhookUrl,
        wxPusherSpt: settings.notificationWxPusherSpt,
      });
    },
  };

  async function send(options: {
    emailAddress: string;
    emailApiToken: string;
    emailApiUrl: string;
    emailFrom: string;
    emailService: AppSettings["notificationEmailService"];
    payload: NotificationPayload;
    provider: AppSettings["notificationProvider"];
    pushPlusToken: string;
    serverChanSendKey: string;
    smtpHost: string;
    smtpPassword: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUsername: string;
    webhookService: AppSettings["notificationWebhookService"];
    webhookUrl: string;
    wxPusherSpt: string;
  }): Promise<NotifyResult> {
    if (options.provider === "disabled") {
      return { provider: options.provider, sent: false };
    }

    if (options.provider === "email") {
      await sendEmailNotification(options);
      return { provider: options.provider, sent: true };
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

  async function sendEmailNotification(options: {
    emailAddress: string;
    emailApiToken: string;
    emailApiUrl: string;
    emailFrom: string;
    emailService: AppSettings["notificationEmailService"];
    payload: NotificationPayload;
    smtpHost: string;
    smtpPassword: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUsername: string;
  }): Promise<void> {
    const to = options.emailAddress.trim();
    const from = options.emailFrom.trim() || options.smtpUsername.trim();
    if (!to) {
      throw new NotificationConfigError("Email address is required for email notifications.");
    }
    if (!from) {
      throw new NotificationConfigError("From address is required for email notifications.");
    }

    const message = {
      from,
      html: notificationHtml(options.payload),
      subject: notificationTitle(options.payload),
      text: notificationDescription(options.payload),
      to,
    };

    if (options.emailService === "api") {
      await sendEmailApiNotification(message, options.emailApiUrl, options.emailApiToken);
      return;
    }

    await emailSender({
      ...message,
    }, smtpConfigForEmailService(options));
  }

  async function sendEmailApiNotification(
    message: EmailMessage,
    apiUrl: string,
    apiToken: string,
  ): Promise<void> {
    const url = apiUrl.trim();
    if (!url) {
      throw new NotificationConfigError("Email API URL is required for email notifications.");
    }

    const headers: HeadersInit = {
      "content-type": "application/json; charset=utf-8",
    };
    if (apiToken.trim()) {
      headers.authorization = `Bearer ${apiToken.trim()}`;
    }

    const response = await fetcher(url, {
      body: JSON.stringify(message),
      headers,
      method: "POST",
    });
    const responseBody = await response.text().catch(() => "");
    if (!response.ok) {
      throw new NotificationDeliveryError(
        `Email API notification failed with HTTP ${response.status}${
          responseBody ? `: ${responseBody}` : ""
        }`,
      );
    }
  }
}

function smtpConfigForEmailService(options: {
  smtpHost: string;
  smtpPassword: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
}): SmtpConfig {
  const host = options.smtpHost.trim();
  if (!host) {
    throw new NotificationConfigError("SMTP host is required for email notifications.");
  }

  return {
    host,
    password: options.smtpPassword,
    port: options.smtpPort,
    secure: options.smtpSecure,
    username: options.smtpUsername.trim(),
  };
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

function matchesPayload(records: MatchRecord[], settings: AppSettings): NotificationPayload {
  const now = new Date();
  const text = matchesDescription(records, settings, now);
  return {
    html: matchesHtml(records, settings, text, now),
    matches: records,
    text,
    title: getMessages(settings.locale).notificationBatchTitle,
    type: "matches",
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
  if (payload.title) {
    return payload.title;
  }

  if (payload.type === "test") {
    return "小黑盒话题提醒测试";
  }

  return `小黑盒命中：${payload.match?.keyword ?? "关键词"}`;
}

function notificationDescription(payload: NotificationPayload): string {
  if (payload.type === "matches") {
    return payload.text;
  }

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

function notificationHtml(payload: NotificationPayload): string {
  if (payload.html) {
    return payload.html;
  }

  const body = notificationDescription(payload);
  return `<p>${escapeHtml(body).replaceAll("\n", "<br>")}</p>`;
}

function matchesHtml(
  records: MatchRecord[],
  settings: AppSettings,
  text: string,
  now: Date,
): string {
  const messages = getMessages(settings.locale);
  const omittedCount = omittedMatchCount(text, messages.notificationMoreMatches);
  const items = records.slice(0, countRenderedMatches(text));
  const renderedItems = items.map((record) => {
    const title = truncateText(record.post.title, notificationTitlePreviewLength);
    const content = truncateText(
      record.post.excerpt || record.post.body || "-",
      notificationContentPreviewLength,
    );
    const line = matchMetadataLine(record, settings, now);

    return `<section><p><a href="${escapeAttribute(record.post.url)}">${
      escapeHtml(title)
    }</a></p><p>${escapeHtml(content)}</p><p>${escapeHtml(line)}</p></section>`;
  });

  return [
    ...renderedItems,
    omittedCount > 0
      ? `<hr><p>${escapeHtml(moreMatchesText(messages.notificationMoreMatches, omittedCount))}</p>`
      : "",
  ].filter(Boolean).join("<hr>");
}

function matchesDescription(
  records: MatchRecord[],
  settings: AppSettings,
  now = new Date(),
): string {
  const messages = getMessages(settings.locale);
  const renderedItems: string[] = [];

  for (const record of records) {
    const item = matchMarkdown(record, settings, now);
    const omittedCount = records.length - renderedItems.length - 1;
    const nextBody = [...renderedItems, item].join(markdownSeparator);
    const nextWithOmitted = omittedCount > 0
      ? `${nextBody}${markdownSeparator}${
        moreMatchesText(messages.notificationMoreMatches, omittedCount)
      }`
      : nextBody;

    if (renderedItems.length > 0 && nextWithOmitted.length > notificationContentLimit) {
      break;
    }

    renderedItems.push(item);
  }

  const omittedCount = records.length - renderedItems.length;
  const body = renderedItems.join(markdownSeparator);
  return omittedCount > 0
    ? `${body}${markdownSeparator}${
      moreMatchesText(messages.notificationMoreMatches, omittedCount)
    }`
    : body;
}

function matchMarkdown(record: MatchRecord, settings: AppSettings, now: Date): string {
  const content = truncateText(
    record.post.excerpt || record.post.body || "-",
    notificationContentPreviewLength,
  );
  const title = truncateText(record.post.title, notificationTitlePreviewLength);

  return [
    `[${escapeMarkdownLinkText(title)}](${record.post.url})`,
    content,
    matchMetadataLine(record, settings, now),
  ].join(markdownHardBreak);
}

function matchMetadataLine(record: MatchRecord, settings: AppSettings, now: Date): string {
  const messages = getMessages(settings.locale);
  return `${messages.publishedAt}：${
    formatHeyboxRelativeTime(record.post.publishedAt, now, settings.locale)
  }，${messages.matchedKeyword}：${record.keyword}，${messages.matchLocationHeader}：${
    matchLocationLabel(record.location, messages)
  }`;
}

function escapeMarkdownLinkText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function matchLocationLabel(
  location: MatchRecord["location"],
  messages: ReturnType<typeof getMessages>,
): string {
  switch (location) {
    case "title":
      return messages.matchTitle;
    case "body":
      return messages.matchBody;
    case "comments":
      return messages.matchComments;
    case "replies":
      return messages.matchReplies;
  }
}

function moreMatchesText(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

function countRenderedMatches(text: string): number {
  const sections = text.split(markdownSeparator);
  const omittedPattern = /^(?:及另外 \d+ 条帖子|and \d+ more posts)$/;
  return sections.filter((section) => section.trim() && !omittedPattern.test(section.trim()))
    .length;
}

function omittedMatchCount(text: string, template: string): number {
  const pattern = escapeRegExp(template).replace("\\{count\\}", "(\\d+)");
  const match = text.match(new RegExp(pattern));
  return match ? Number(match[1]) : 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

async function sendSmtpEmail(message: EmailMessage, config: SmtpConfig): Promise<void> {
  let connection: Deno.Conn | Deno.TlsConn | undefined;
  try {
    connection = config.secure
      ? await Deno.connectTls({ hostname: config.host, port: config.port })
      : await Deno.connect({ hostname: config.host, port: config.port });
    const smtp = createSmtpSession(connection);

    await smtp.expect([220]);
    await smtp.command(`EHLO localhost`, [250]);

    if (config.username || config.password) {
      await smtp.command("AUTH LOGIN", [334]);
      await smtp.command(base64(config.username), [334]);
      await smtp.command(base64(config.password), [235]);
    }

    await smtp.command(`MAIL FROM:<${envelopeAddress(message.from)}>`, [250]);
    await smtp.command(`RCPT TO:<${envelopeAddress(message.to)}>`, [250, 251]);
    await smtp.command("DATA", [354]);
    await smtp.data(mimeMessage(message));
    await smtp.expect([250]);
    await smtp.command("QUIT", [221]);
  } catch (error) {
    if (error instanceof NotificationDeliveryError) {
      throw error;
    }
    throw new NotificationDeliveryError(
      `Email notification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    connection?.close();
  }
}

function createSmtpSession(connection: Deno.Conn | Deno.TlsConn) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  async function readLine(): Promise<string> {
    while (!buffer.includes("\n")) {
      const chunk = new Uint8Array(1024);
      const size = await connection.read(chunk);
      if (size === null) {
        throw new NotificationDeliveryError("SMTP connection closed unexpectedly.");
      }
      buffer += decoder.decode(chunk.subarray(0, size), { stream: true });
    }

    const index = buffer.indexOf("\n");
    const line = buffer.slice(0, index).replace(/\r$/, "");
    buffer = buffer.slice(index + 1);
    return line;
  }

  async function response(): Promise<{ code: number; text: string }> {
    const lines: string[] = [];
    let code = 0;

    while (true) {
      const line = await readLine();
      lines.push(line);
      code = Number(line.slice(0, 3));
      if (line[3] !== "-") {
        return { code, text: lines.join("\n") };
      }
    }
  }

  async function expect(expected: number[]): Promise<void> {
    const result = await response();
    if (!expected.includes(result.code)) {
      throw new NotificationDeliveryError(`SMTP command failed: ${result.text}`);
    }
  }

  async function data(value: string): Promise<void> {
    await connection.write(encoder.encode(`${dotStuff(value)}\r\n.\r\n`));
  }

  async function command(value: string, expected: number[]): Promise<void> {
    await connection.write(encoder.encode(`${value}\r\n`));
    await expect(expected);
  }

  return { command, data, expect };
}

function mimeMessage(message: EmailMessage): string {
  const boundary = `heybox-${crypto.randomUUID()}`;
  return [
    `From: ${headerValue(message.from)}`,
    `To: ${headerValue(message.to)}`,
    `Subject: ${encodedHeader(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    "Content-Transfer-Encoding: 8bit",
    "",
    message.text,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    "Content-Transfer-Encoding: 8bit",
    "",
    message.html,
    `--${boundary}--`,
  ].join("\r\n");
}

function envelopeAddress(value: string): string {
  const trimmed = value.trim();
  const bracketMatch = trimmed.match(/<([^<>]+)>$/);
  return (bracketMatch?.[1] ?? trimmed).replaceAll(/[\r\n<>]/g, "");
}

function headerValue(value: string): string {
  return value.replaceAll(/[\r\n]+/g, " ").trim();
}

function encodedHeader(value: string): string {
  return `=?UTF-8?B?${base64(value)}?=`;
}

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function dotStuff(value: string): string {
  return value.replace(/(^|\r?\n)\./g, "$1..");
}
