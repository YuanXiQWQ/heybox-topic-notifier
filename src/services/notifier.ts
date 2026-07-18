/**
 * @file 本文件负责构建并发送 Webhook、邮件和测试通知。
 */
import type { AppSettings, MatchRecord } from "../models.ts";
import { getMessages } from "../locales/index.ts";
import { truncateText } from "../views/text.ts";
import { formatHeyboxRelativeTime } from "../views/time.ts";

/**
 * 通知载荷类型。
 */
type NotifyKind = "match" | "matches";

/**
 * 通知投递时使用的统一载荷结构。
 */
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

/**
 * 通知请求类型。
 */
export type NotificationRequest =
  | {
    type: "match";
    record: MatchRecord;
  }
  | {
    type: "matches";
    records: MatchRecord[];
  }
  | {
    type: "test";
  };

/**
 * 通知发送结果。
 */
export type NotifyResult = {
  provider: AppSettings["notificationProvider"];
  sent: boolean;
};

/**
 * 通知器创建选项。
 */
export type NotifierOptions = {
  deliveryLogger?: DeliveryLogger;
  deliveryTimeoutMs?: number;
  emailSender?: EmailSender;
  fetch?: typeof fetch;
  webhookUrl?: string;
};

/**
 * 通知投递日志记录。
 */
export type DeliveryLogEntry = {
  deploymentId: string | null;
  elapsedMs: number;
  errorMessage: string | null;
  errorName: string | null;
  hostname: string;
  method: string;
  responseHeadersReceived: boolean;
  service: string;
  signalAborted: boolean;
  startedAt: string;
  status: number | null;
};

/**
 * 通知投递日志记录器。
 */
export type DeliveryLogger = (entry: DeliveryLogEntry) => void;

/**
 * 邮件消息结构。
 */
type EmailMessage = {
  from: string;
  html: string;
  subject: string;
  text: string;
  to: string;
};

/**
 * SMTP 连接配置。
 */
type SmtpConfig = {
  host: string;
  password: string;
  port: number;
  secure: boolean;
  username: string;
};

/**
 * 邮件发送函数类型。
 */
type EmailSender = (message: EmailMessage, config: SmtpConfig) => Promise<void>;

/**
 * PushPlus 默认发送地址。
 */
const pushPlusSendUrl = "https://www.pushplus.plus/send";
/**
 * WxPusher 默认简易发送地址。
 */
const wxPusherSimplePushUrl = "https://wxpusher.zjiecode.com/api/send/message/simple-push";
/**
 * 通知正文最大长度。
 */
const notificationContentLimit = 3600;
/**
 * 通知正文预览长度。
 */
const notificationContentPreviewLength = 60;
/**
 * 通知标题预览长度。
 */
const notificationTitlePreviewLength = 80;
/**
 * 默认通知投递超时时间。
 */
const defaultNotificationDeliveryTimeoutMs = 30_000;
/**
 * 测试通知生成记录数量的保护上限。
 */
const testNotificationOverflowGuard = 300;
/**
 * 测试通知中使用的示例帖子链接。
 */
const testNotificationUrl = "https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/";
/**
 * 测试通知可随机使用的命中位置。
 */
const testMatchLocations: MatchRecord["location"][] = ["title", "body", "comments", "replies"];
/**
 * Markdown 硬换行标记。
 */
const markdownHardBreak = "  \n";
/**
 * Markdown 多条命中之间的分隔符。
 */
const markdownSeparator = "\n\n---\n\n";

/**
 * 通知配置错误。
 */
export class NotificationConfigError extends Error {
}

/**
 * 通知投递错误。
 */
export class NotificationDeliveryError extends Error {
  /**
   * 创建通知投递错误。
   *
   * @param message 错误消息。
   * @param upstreamStatus 上游通知服务返回的 HTTP 状态码。
   */
  constructor(message: string, readonly upstreamStatus?: number) {
    super(message);
    this.name = "NotificationDeliveryError";
  }
}

/**
 * 创建通知器。
 *
 * @param options 通知器创建选项。
 * @return 包含各类通知发送方法的通知器对象。
 */
export function createNotifier(options: NotifierOptions = {}) {
  const deliveryTimeoutMs = normalizeDeliveryTimeoutMs(
    options.deliveryTimeoutMs ?? deliveryTimeoutMsFromEnv(),
  );
  const emailSender = options.emailSender ?? sendSmtpEmail;
  const fetcher = options.fetch ?? fetch;
  const deliveryLogger = options.deliveryLogger ?? logDelivery;
  const pushPlusUrl = normalizeEndpointUrl(Deno.env.get("NOTIFIER_PUSHPLUS_SEND_URL")) ??
    pushPlusSendUrl;
  const wxPusherUrl = normalizeEndpointUrl(Deno.env.get("NOTIFIER_WXPUSHER_SEND_URL")) ??
    wxPusherSimplePushUrl;
  const serverChanUrl = normalizeEndpointUrl(Deno.env.get("NOTIFIER_SERVER_CHAN_SEND_URL"));
  const relayToken = Deno.env.get("NOTIFIER_RELAY_TOKEN")?.trim() ?? "";
  const webhookUrl = options.webhookUrl ?? Deno.env.get("NOTIFIER_WEBHOOK_URL") ?? "";

  return {
    /**
     * 发送单条命中通知。
     *
     * @param record 命中记录。
     * @param settings 应用设置。
     * @return 通知发送结果。
     */
    async sendMatch(record: MatchRecord, settings: AppSettings): Promise<NotifyResult> {
      return await sendNotification({ record, type: "match" }, settings);
    },

    /**
     * 发送批量命中通知。
     *
     * @param records 命中记录列表。
     * @param settings 应用设置。
     * @return 通知发送结果。
     */
    async sendMatches(records: MatchRecord[], settings: AppSettings): Promise<NotifyResult> {
      return await sendNotification({ records, type: "matches" }, settings);
    },

    /**
     * 发送测试通知。
     *
     * @param settings 应用设置。
     * @return 通知发送结果。
     */
    async sendTest(settings: AppSettings): Promise<NotifyResult> {
      return await sendNotification({ type: "test" }, settings);
    },

    /**
     * 根据通知请求发送通知。
     *
     * @param notification 通知请求。
     * @param settings 应用设置。
     * @return 通知发送结果。
     */
    async sendNotification(
      notification: NotificationRequest,
      settings: AppSettings,
    ): Promise<NotifyResult> {
      return await sendNotification(notification, settings);
    },
  };

  /**
   * 将通知请求转换为载荷并执行投递。
   *
   * @param notification 通知请求。
   * @param settings 应用设置。
   * @return 通知发送结果。
   */
  async function sendNotification(
    notification: NotificationRequest,
    settings: AppSettings,
  ): Promise<NotifyResult> {
    const payload = payloadForNotification(notification, settings);
    if (!payload) {
      return { provider: settings.notificationProvider, sent: false };
    }

    return await sendPayload(deliveryOptions(settings, payload));
  }

  /**
   * 将应用设置和通知载荷转换为投递选项。
   *
   * @param settings 应用设置。
   * @param payload 通知载荷。
   * @return 通知投递选项。
   */
  function deliveryOptions(
    settings: AppSettings,
    payload: NotificationPayload,
  ): {
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
  } {
    return {
      payload,
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
    };
  }

  /**
   * 根据通知渠道发送载荷。
   *
   * @param options 通知投递选项。
   * @return 通知发送结果。
   */
  async function sendPayload(options: ReturnType<typeof deliveryOptions>): Promise<NotifyResult> {
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

    if (options.webhookService === "serverChan" && !options.serverChanSendKey.trim()) {
      throw new NotificationConfigError(
        "Server酱 SendKey is required for webhook notifications.",
      );
    }

    const targetWebhookUrl = targetUrlForWebhook({
      pushPlusUrl,
      fallbackWebhookUrl: webhookUrl,
      serverChanSendKey: options.serverChanSendKey,
      serverChanUrl,
      webhookService: options.webhookService,
      webhookUrl: options.webhookUrl,
      wxPusherUrl,
    });
    if (!targetWebhookUrl) {
      throw new NotificationConfigError(
        options.webhookService === "serverChan"
          ? "Server酱 SendKey is required for webhook notifications."
          : "NOTIFIER_WEBHOOK_URL is required for webhook notifications.",
      );
    }

    const redactedSecrets = webhookRedactedSecrets({
      relayToken,
      serverChanSendKey: options.serverChanSendKey,
      service: options.webhookService,
    });
    let response: Response;
    try {
      response = await fetchWithDeliveryTimeout(fetcher, targetWebhookUrl, {
        body: JSON.stringify(bodyForWebhook({
          payload: options.payload,
          pushPlusToken: options.pushPlusToken,
          service: options.webhookService,
          url: targetWebhookUrl,
          wxPusherSpt: options.wxPusherSpt,
        })),
        headers: headersForWebhook({
          relayToken,
          serverChanSendKey: options.serverChanSendKey,
          serverChanUrl,
          service: options.webhookService,
          targetWebhookUrl,
        }),
        method: "POST",
      }, {
        label: webhookDeliveryLabel(options.webhookService, targetWebhookUrl),
        logger: deliveryLogger,
        redactedSecrets,
        service: webhookServiceLabel(options.webhookService),
        timeoutMs: deliveryTimeoutMs,
      });
    } catch (error) {
      throw redactNotificationDeliveryError(error, redactedSecrets);
    }

    const responseBody = await response.text().catch(() => "");
    if (!response.ok) {
      const safeResponseBody = redactSecrets(responseBody, redactedSecrets);
      throw new NotificationDeliveryError(
        `Webhook notification failed with HTTP ${response.status}${
          safeResponseBody ? `: ${safeResponseBody}` : ""
        }`,
        response.status,
      );
    }

    assertWebhookAccepted(options.webhookService, responseBody, redactedSecrets);

    return { provider: options.provider, sent: true };
  }

  /**
   * 发送邮件通知。
   *
   * @param options 邮件通知投递选项。
   * @return 邮件发送完成后的 Promise。
   */
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

    await withDeliveryTimeout(
      emailSender({
        ...message,
      }, smtpConfigForEmailService(options)),
      {
        label: "Email notification",
        timeoutMs: deliveryTimeoutMs,
      },
    );
  }

  /**
   * 通过邮件 API 发送邮件通知。
   *
   * @param message 邮件消息。
   * @param apiUrl 邮件 API 地址。
   * @param apiToken 邮件 API 令牌。
   * @return 邮件 API 投递完成后的 Promise。
   */
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

    const response = await fetchWithDeliveryTimeout(fetcher, url, {
      body: JSON.stringify(message),
      headers,
      method: "POST",
    }, {
      label: "Email API notification",
      logger: deliveryLogger,
      redactedSecrets: [apiToken],
      service: "Email API",
      timeoutMs: deliveryTimeoutMs,
    });
    const responseBody = await response.text().catch(() => "");
    if (!response.ok) {
      throw new NotificationDeliveryError(
        `Email API notification failed with HTTP ${response.status}${
          responseBody ? `: ${responseBody}` : ""
        }`,
        response.status,
      );
    }
  }
}

/**
 * 规范化通知投递超时时间。
 *
 * @param value 待规范化的超时时间。
 * @return 可用的超时时间毫秒数。
 */
function normalizeDeliveryTimeoutMs(value: number | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : defaultNotificationDeliveryTimeoutMs;
}

/**
 * 从环境变量读取通知投递超时时间。
 *
 * @return 超时时间毫秒数，未配置或不合法时返回 undefined。
 */
function deliveryTimeoutMsFromEnv(): number | undefined {
  const seconds = Number(Deno.env.get("NOTIFIER_DELIVERY_TIMEOUT_SECONDS"));
  return Number.isInteger(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

/**
 * 规范化通知端点 URL。
 *
 * @param value 待规范化的 URL 字符串。
 * @return 合法的 HTTP(S) URL，无法规范化时返回 undefined。
 */
function normalizeEndpointUrl(value: string | undefined): string | undefined {
  const url = value?.trim();
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 带超时和日志记录地执行 fetch 投递。
 *
 * @param fetcher fetch 实现。
 * @param input 请求地址或请求对象。
 * @param init 请求初始化参数。
 * @param options 投递超时、日志和脱敏选项。
 * @return fetch 响应。
 */
async function fetchWithDeliveryTimeout(
  fetcher: typeof fetch,
  input: string | URL | Request,
  init: RequestInit,
  options: {
    label: string;
    logger?: DeliveryLogger;
    redactedSecrets?: string[];
    service?: string;
    timeoutMs: number;
  },
): Promise<Response> {
  const controller = new AbortController();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const hostname = hostnameForRequest(input);
  const method = methodForRequest(input, init);
  const logger = options.logger ?? logDelivery;
  const service = options.service ?? options.label;
  const redactedSecrets = options.redactedSecrets ?? [];
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs);

  try {
    const response = await fetcher(input, { ...init, signal: controller.signal });
    logger({
      deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID") ?? null,
      elapsedMs: Date.now() - startedAtMs,
      errorMessage: null,
      errorName: null,
      hostname,
      method,
      responseHeadersReceived: true,
      service,
      signalAborted: controller.signal.aborted,
      startedAt,
      status: response.status,
    });
    return response;
  } catch (error) {
    const safeErrorMessage = redactSecrets(
      error instanceof Error ? error.message : String(error),
      redactedSecrets,
    );
    logger({
      deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID") ?? null,
      elapsedMs: Date.now() - startedAtMs,
      errorMessage: safeErrorMessage,
      errorName: error instanceof Error ? error.name : null,
      hostname,
      method,
      responseHeadersReceived: false,
      service,
      signalAborted: controller.signal.aborted,
      startedAt,
      status: null,
    });
    if (controller.signal.aborted) {
      throw new NotificationDeliveryError(
        `${options.label} timed out after ${options.timeoutMs} ms.`,
      );
    }

    throw new NotificationDeliveryError(
      `${options.label} failed: ${safeErrorMessage}`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 从请求输入中提取主机名。
 *
 * @param input 请求地址或请求对象。
 * @return 主机名，无法解析时返回 unknown host。
 */
function hostnameForRequest(input: string | URL | Request): string {
  try {
    return new URL(input instanceof Request ? input.url : String(input)).hostname;
  } catch {
    return "unknown host";
  }
}

/**
 * 从请求输入和初始化参数中提取 HTTP 方法。
 *
 * @param input 请求地址或请求对象。
 * @param init 请求初始化参数。
 * @return 大写的 HTTP 方法。
 */
function methodForRequest(input: string | URL | Request, init: RequestInit): string {
  return String(init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

/**
 * 输出通知投递日志。
 *
 * @param entry 通知投递日志记录。
 * @return 无返回值。
 */
function logDelivery(entry: DeliveryLogEntry): void {
  console.info(JSON.stringify({ event: "notification_delivery", ...entry }));
}

/**
 * 为任意异步投递操作增加超时控制。
 *
 * @param operation 待执行的异步操作。
 * @param options 超时配置。
 * @return 异步操作的结果。
 */
async function withDeliveryTimeout<T>(
  operation: Promise<T>,
  options: { label: string; timeoutMs: number },
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new NotificationDeliveryError(
          `${options.label} timed out after ${options.timeoutMs} ms.`,
        ),
      );
    }, options.timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } catch (error) {
    if (error instanceof NotificationDeliveryError) {
      throw error;
    }

    throw new NotificationDeliveryError(
      `${options.label} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 从邮件通知选项中构建 SMTP 配置。
 *
 * @param options 邮件通知配置。
 * @return SMTP 连接配置。
 */
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

/**
 * 根据 Webhook 服务类型解析最终投递地址。
 *
 * @param options Webhook 地址和服务配置。
 * @return 最终投递 URL。
 */
function targetUrlForWebhook(options: {
  fallbackWebhookUrl: string;
  pushPlusUrl: string;
  serverChanSendKey: string;
  serverChanUrl?: string;
  webhookService: AppSettings["notificationWebhookService"];
  webhookUrl: string;
  wxPusherUrl: string;
}): string {
  if (options.webhookService === "pushPlus") {
    return options.pushPlusUrl;
  }

  if (options.webhookService === "wxPusher") {
    return options.wxPusherUrl;
  }

  if (options.webhookService === "serverChan") {
    if (options.serverChanUrl) {
      return options.serverChanUrl;
    }

    return serverChanUrlFromSendKey(options.serverChanSendKey);
  }

  return options.webhookUrl.trim() || options.fallbackWebhookUrl.trim();
}

/**
 * 构建 Webhook 请求头。
 *
 * @param options Webhook 服务和中继配置。
 * @return Webhook 请求头。
 */
function headersForWebhook(options: {
  relayToken: string;
  serverChanSendKey: string;
  serverChanUrl?: string;
  service: AppSettings["notificationWebhookService"];
  targetWebhookUrl: string;
}): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
  };
  const token = relayTokenForWebhook(options);
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  if (usesServerChanRelayUrl(options)) {
    headers["x-serverchan-send-key"] = options.serverChanSendKey.trim();
  }

  return headers;
}

/**
 * 根据 Webhook 地址判断并返回所需的中继令牌。
 *
 * @param options Webhook 服务和中继配置。
 * @return 中继令牌，不需要中继时返回 undefined。
 */
function relayTokenForWebhook(options: {
  relayToken: string;
  serverChanUrl?: string;
  service: AppSettings["notificationWebhookService"];
  targetWebhookUrl: string;
}): string | undefined {
  if (!usesRelayWebhookUrl(options)) {
    return undefined;
  }

  if (!options.relayToken) {
    throw new NotificationConfigError(relayTokenConfigErrorMessage(options.service));
  }

  return options.relayToken;
}

/**
 * 判断当前 Webhook 是否使用自定义中继地址。
 *
 * @param options Webhook 服务和地址配置。
 * @return 使用中继地址时返回 true。
 */
function usesRelayWebhookUrl(options: {
  serverChanUrl?: string;
  service: AppSettings["notificationWebhookService"];
  targetWebhookUrl: string;
}): boolean {
  if (options.service === "pushPlus") {
    return options.targetWebhookUrl !== pushPlusSendUrl;
  }

  if (options.service === "wxPusher") {
    return options.targetWebhookUrl !== wxPusherSimplePushUrl;
  }

  if (options.service === "serverChan") {
    return usesServerChanRelayUrl(options);
  }

  return false;
}

/**
 * 判断 ServerChan 是否使用自定义中继地址。
 *
 * @param options ServerChan 地址配置。
 * @return 使用 ServerChan 中继地址时返回 true。
 */
function usesServerChanRelayUrl(options: {
  serverChanUrl?: string;
  service: AppSettings["notificationWebhookService"];
  targetWebhookUrl: string;
}): boolean {
  return options.service === "serverChan" && Boolean(options.serverChanUrl) &&
    options.targetWebhookUrl === options.serverChanUrl;
}

/**
 * 生成缺失中继令牌时的配置错误信息。
 *
 * @param service Webhook 服务类型。
 * @return 配置错误信息。
 */
function relayTokenConfigErrorMessage(service: AppSettings["notificationWebhookService"]): string {
  switch (service) {
    case "pushPlus":
      return "NOTIFIER_RELAY_TOKEN is required when using NOTIFIER_PUSHPLUS_SEND_URL.";
    case "wxPusher":
      return "NOTIFIER_RELAY_TOKEN is required when using NOTIFIER_WXPUSHER_SEND_URL.";
    case "serverChan":
      return "NOTIFIER_RELAY_TOKEN is required when using NOTIFIER_SERVER_CHAN_SEND_URL.";
    case "custom":
      return "NOTIFIER_RELAY_TOKEN is required for relay notifications.";
  }
}

/**
 * 对通知投递错误信息执行脱敏。
 *
 * @param error 原始错误。
 * @param redactedSecrets 需要脱敏的敏感值列表。
 * @return 脱敏后的错误。
 */
function redactNotificationDeliveryError(error: unknown, redactedSecrets: string[]): unknown {
  if (error instanceof NotificationDeliveryError) {
    return new NotificationDeliveryError(
      redactSecrets(error.message, redactedSecrets),
      error.upstreamStatus,
    );
  }

  return error;
}

/**
 * 从字符串中隐藏单个敏感值。
 *
 * @param value 原始字符串。
 * @param secret 需要隐藏的敏感值。
 * @return 脱敏后的字符串。
 */
function redactSecret(value: string, secret: string): string {
  if (!secret) {
    return value;
  }

  return value.replaceAll(secret, "[已隐藏]");
}

/**
 * 从字符串中隐藏多个敏感值。
 *
 * @param value 原始字符串。
 * @param secrets 需要隐藏的敏感值列表。
 * @return 脱敏后的字符串。
 */
function redactSecrets(value: string, secrets: string[]): string {
  return secrets.reduce((current, secret) => redactSecret(current, secret), value);
}

/**
 * 收集 Webhook 投递日志和错误中需要脱敏的敏感值。
 *
 * @param options Webhook 服务和密钥配置。
 * @return 需要脱敏的敏感值列表。
 */
function webhookRedactedSecrets(options: {
  relayToken: string;
  serverChanSendKey: string;
  service: AppSettings["notificationWebhookService"];
}): string[] {
  return [
    options.relayToken,
    options.service === "serverChan" ? options.serverChanSendKey.trim() : "",
  ].filter(Boolean);
}

/**
 * 生成 Webhook 投递日志标签。
 *
 * @param service Webhook 服务类型。
 * @param url 投递地址。
 * @return 投递日志标签。
 */
function webhookDeliveryLabel(
  service: AppSettings["notificationWebhookService"],
  url: string,
): string {
  let hostname = "unknown host";
  try {
    hostname = new URL(url).hostname;
  } catch {
    // URL 格式错误时保留原始投递错误。
  }

  return `${webhookServiceLabel(service)} webhook notification to ${hostname}`;
}

/**
 * 获取 Webhook 服务展示名称。
 *
 * @param service Webhook 服务类型。
 * @return 服务展示名称。
 */
function webhookServiceLabel(service: AppSettings["notificationWebhookService"]): string {
  switch (service) {
    case "pushPlus":
      return "PushPlus";
    case "wxPusher":
      return "WxPusher";
    case "serverChan":
      return "ServerChan";
    case "custom":
      return "Custom";
  }
}

/**
 * 根据 ServerChan SendKey 构建发送地址。
 *
 * @param value ServerChan SendKey 或完整 URL。
 * @return ServerChan 发送地址。
 */
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

/**
 * 将单条命中记录转换为通知载荷。
 *
 * @param record 命中记录。
 * @return 单条命中通知载荷。
 */
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

/**
 * 根据通知请求创建通知载荷。
 *
 * @param notification 通知请求。
 * @param settings 应用设置。
 * @return 通知载荷；无内容可发送时返回 undefined。
 */
function payloadForNotification(
  notification: NotificationRequest,
  settings: AppSettings,
): NotificationPayload | undefined {
  switch (notification.type) {
    case "match":
      return matchPayload(notification.record);
    case "matches":
      return notification.records.length > 0
        ? matchesPayload(notification.records, settings)
        : undefined;
    case "test":
      return testMatchesPayload(settings);
  }
}

/**
 * 将多条命中记录转换为批量通知载荷。
 *
 * @param records 命中记录列表。
 * @param settings 应用设置。
 * @param title 通知标题。
 * @return 批量通知载荷。
 */
function matchesPayload(
  records: MatchRecord[],
  settings: AppSettings,
  title = getMessages(settings.locale).notificationBatchTitle,
): NotificationPayload {
  const now = new Date();
  const text = matchesDescription(records, settings, now);
  return {
    html: matchesHtml(records, settings, text, now),
    matches: records,
    text,
    title,
    type: "matches",
  };
}

/**
 * 创建测试通知载荷。
 *
 * @param settings 应用设置。
 * @return 测试通知载荷。
 */
function testMatchesPayload(settings: AppSettings): NotificationPayload {
  const messages = getMessages(settings.locale);
  return matchesPayload(
    testMatchRecords(settings),
    settings,
    messages.notificationTestTitle,
  );
}

/**
 * 创建测试通知使用的命中记录列表。
 *
 * @param settings 应用设置。
 * @return 测试命中记录列表。
 */
function testMatchRecords(settings: AppSettings): MatchRecord[] {
  const records: MatchRecord[] = [];

  while (records.length < testNotificationOverflowGuard) {
    records.push(createRandomTestMatchRecord(settings, records.length + 1));
    const text = matchesDescription(records, settings);
    const messages = getMessages(settings.locale);
    if (omittedMatchCount(text, messages.notificationMoreMatches) > 0) {
      break;
    }
  }

  const extraRecordCount = randomInt(1, 20);
  for (let index = 0; index < extraRecordCount; index += 1) {
    records.push(createRandomTestMatchRecord(settings, records.length + 1));
  }

  return records;
}

/**
 * 创建一条随机测试命中记录。
 *
 * @param settings 应用设置。
 * @param number 测试记录序号。
 * @param variant 测试记录用途。
 * @return 随机测试命中记录。
 */
export function createRandomTestMatchRecord(
  settings: AppSettings,
  number = 1,
  variant: "notification" | "simulation" = "notification",
): MatchRecord {
  const messages = getMessages(settings.locale);
  const now = Date.now();
  const seed = String(randomInt(100, 999));
  const location = testMatchLocations[randomInt(0, testMatchLocations.length - 1)];
  const publishedAt = new Date(now - randomInt(1, 360) * 60_000).toISOString();
  const uniqueId = `${now}:${number}:${seed}:${location}`;
  const excerpt = variant === "simulation"
    ? templateText(messages.notificationSimulatedPostContent, { seed })
    : templateText(messages.notificationTestPostContent, {
      index: String(number),
      seed,
    });
  const title = variant === "simulation"
    ? templateText(messages.notificationSimulatedPostTitle, { seed })
    : templateText(messages.notificationTestPostTitle, {
      index: String(number),
      seed,
    });

  return {
    id: `test:${uniqueId}`,
    keyword: templateText(messages.notificationTestKeyword, { seed }),
    location,
    matchedAt: new Date().toISOString(),
    post: {
      body: "",
      commentReplies: [],
      comments: [],
      excerpt,
      id: `test-${number}`,
      publishedAt,
      title,
      url: testNotificationUrl,
    },
  };
}

/**
 * 根据 Webhook 服务类型构建请求体。
 *
 * @param options Webhook 载荷和服务配置。
 * @return Webhook 请求体。
 */
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

/**
 * 判断 URL 是否为 ServerChan 官方发送地址。
 *
 * @param value 待判断 URL。
 * @return 是 ServerChan 地址时返回 true。
 */
function isServerChanUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "sctapi.ftqq.com" || hostname.endsWith(".push.ft07.com");
  } catch {
    return false;
  }
}

/**
 * 校验第三方 Webhook 服务是否接受通知。
 *
 * @param service Webhook 服务类型。
 * @param responseBody Webhook 响应正文。
 * @param redactedSecrets 需要脱敏的敏感值列表。
 * @return 校验通过时无返回值。
 * @throws 第三方服务返回失败或非法响应时抛出错误。
 */
function assertWebhookAccepted(
  service: AppSettings["notificationWebhookService"],
  responseBody: string,
  redactedSecrets: string[] = [],
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
      `${serviceLabel(service)} notification failed with an invalid response: ${
        redactSecrets(responseBody, redactedSecrets)
      }`,
    );
  }

  const expectedCode = service === "wxPusher" ? 1000 : 200;
  if (isRecord(payload) && Number(payload.code) === expectedCode) {
    return;
  }

  const message = isRecord(payload) && typeof payload.msg !== "undefined"
    ? String(payload.msg)
    : responseBody;
  throw new NotificationDeliveryError(
    `${serviceLabel(service)} notification failed: ${redactSecrets(message, redactedSecrets)}`,
  );
}

/**
 * 判断未知值是否为对象记录。
 *
 * @param value 待判断值。
 * @return 是非空对象时返回 true。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 获取第三方通知服务的错误展示名称。
 *
 * @param service Webhook 服务类型。
 * @return 错误展示名称。
 */
function serviceLabel(service: AppSettings["notificationWebhookService"]): string {
  return service === "pushPlus" ? "PushPlus" : "WxPusher";
}

/**
 * 生成通知标题。
 *
 * @param payload 通知载荷。
 * @return 通知标题。
 */
function notificationTitle(payload: NotificationPayload): string {
  if (payload.title) {
    return payload.title;
  }

  return `小黑盒命中：${payload.match?.keyword ?? "关键词"}`;
}

/**
 * 生成通知 Markdown 文本。
 *
 * @param payload 通知载荷。
 * @return 通知文本。
 */
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

/**
 * 生成通知 HTML 内容。
 *
 * @param payload 通知载荷。
 * @return 通知 HTML。
 */
function notificationHtml(payload: NotificationPayload): string {
  if (payload.html) {
    return payload.html;
  }

  const body = notificationDescription(payload);
  return `<p>${escapeHtml(body).replaceAll("\n", "<br>")}</p>`;
}

/**
 * 生成批量命中通知的 HTML 内容。
 *
 * @param records 命中记录列表。
 * @param settings 应用设置。
 * @param text 已生成的 Markdown 文本。
 * @param now 当前时间。
 * @return 批量通知 HTML。
 */
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

/**
 * 生成批量命中通知的 Markdown 文本。
 *
 * @param records 命中记录列表。
 * @param settings 应用设置。
 * @param now 当前时间。
 * @return 批量通知 Markdown 文本。
 */
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

/**
 * 生成单条命中记录的 Markdown 片段。
 *
 * @param record 命中记录。
 * @param settings 应用设置。
 * @param now 当前时间。
 * @return 单条命中 Markdown 片段。
 */
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

/**
 * 生成命中记录的元信息文本行。
 *
 * @param record 命中记录。
 * @param settings 应用设置。
 * @param now 当前时间。
 * @return 元信息文本行。
 */
function matchMetadataLine(record: MatchRecord, settings: AppSettings, now: Date): string {
  const messages = getMessages(settings.locale);
  return `${messages.publishedAt}：${
    formatHeyboxRelativeTime(record.post.publishedAt, now, settings.locale)
  }，${messages.matchedKeyword}：${record.keyword}，${messages.matchLocationHeader}：${
    matchLocationLabel(record.location, messages)
  }`;
}

/**
 * 转义 Markdown 链接文本。
 *
 * @param value 原始链接文本。
 * @return 转义后的链接文本。
 */
function escapeMarkdownLinkText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

/**
 * 获取命中位置的本地化展示文本。
 *
 * @param location 命中位置。
 * @param messages 当前语言文案。
 * @return 命中位置展示文本。
 */
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

/**
 * 填充更多命中记录提示文本。
 *
 * @param template 提示文本模板。
 * @param count 被省略的命中数量。
 * @return 填充后的提示文本。
 */
function moreMatchesText(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

/**
 * 使用键值替换简单文本模板。
 *
 * @param template 文本模板。
 * @param values 替换变量映射。
 * @return 替换后的文本。
 */
function templateText(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );
}

/**
 * 统计通知文本中实际渲染的命中数量。
 *
 * @param text 通知 Markdown 文本。
 * @return 已渲染命中数量。
 */
function countRenderedMatches(text: string): number {
  const sections = text.split(markdownSeparator);
  const omittedPattern = /^(?:及另外 \d+ 条帖子|and \d+ more posts)$/;
  return sections.filter((section) => section.trim() && !omittedPattern.test(section.trim()))
    .length;
}

/**
 * 从通知文本中提取被省略的命中数量。
 *
 * @param text 通知 Markdown 文本。
 * @param template 更多命中提示模板。
 * @return 被省略的命中数量。
 */
function omittedMatchCount(text: string, template: string): number {
  const pattern = escapeRegExp(template).replace("\\{count\\}", "(\\d+)");
  const match = text.match(new RegExp(pattern));
  return match ? Number(match[1]) : 0;
}

/**
 * 转义正则表达式特殊字符。
 *
 * @param value 原始字符串。
 * @return 可安全放入正则表达式的字符串。
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 生成闭区间随机整数。
 *
 * @param min 最小值。
 * @param max 最大值。
 * @return 随机整数。
 */
function randomInt(min: number, max: number): number {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

/**
 * 转义 HTML 文本。
 *
 * @param value 原始文本。
 * @return 转义后的 HTML 文本。
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 转义 HTML 属性值。
 *
 * @param value 原始属性值。
 * @return 转义后的属性值。
 */
function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

/**
 * 通过 SMTP 协议发送邮件。
 *
 * @param message 邮件消息。
 * @param config SMTP 连接配置。
 * @return 邮件发送完成后的 Promise。
 */
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

/**
 * 创建 SMTP 会话读写封装。
 *
 * @param connection SMTP 网络连接。
 * @return SMTP 会话操作方法。
 */
function createSmtpSession(connection: Deno.Conn | Deno.TlsConn) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  /**
   * 从 SMTP 连接中读取一行响应。
   *
   * @return 响应行文本。
   */
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

  /**
   * 读取完整 SMTP 响应。
   *
   * @return SMTP 响应码和响应文本。
   */
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

  /**
   * 读取响应并校验响应码。
   *
   * @param expected 允许的响应码列表。
   * @return 校验通过时无返回值。
   */
  async function expect(expected: number[]): Promise<void> {
    const result = await response();
    if (!expected.includes(result.code)) {
      throw new NotificationDeliveryError(`SMTP command failed: ${result.text}`);
    }
  }

  /**
   * 写入 SMTP DATA 数据段。
   *
   * @param value 邮件原始内容。
   * @return 写入完成后的 Promise。
   */
  async function data(value: string): Promise<void> {
    await connection.write(encoder.encode(`${dotStuff(value)}\r\n.\r\n`));
  }

  /**
   * 发送 SMTP 命令并校验响应码。
   *
   * @param value SMTP 命令文本。
   * @param expected 允许的响应码列表。
   * @return 命令完成后的 Promise。
   */
  async function command(value: string, expected: number[]): Promise<void> {
    await connection.write(encoder.encode(`${value}\r\n`));
    await expect(expected);
  }

  return { command, data, expect };
}

/**
 * 构建 multipart 邮件 MIME 内容。
 *
 * @param message 邮件消息。
 * @return MIME 原始文本。
 */
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

/**
 * 从邮件地址中提取 SMTP 信封地址。
 *
 * @param value 原始邮件地址。
 * @return 清理后的信封地址。
 */
function envelopeAddress(value: string): string {
  const trimmed = value.trim();
  const bracketMatch = trimmed.match(/<([^<>]+)>$/);
  return (bracketMatch?.[1] ?? trimmed).replaceAll(/[\r\n<>]/g, "");
}

/**
 * 清理邮件头字段值。
 *
 * @param value 原始邮件头字段值。
 * @return 清理后的字段值。
 */
function headerValue(value: string): string {
  return value.replaceAll(/[\r\n]+/g, " ").trim();
}

/**
 * 编码邮件头字段值。
 *
 * @param value 原始字段值。
 * @return MIME 编码后的字段值。
 */
function encodedHeader(value: string): string {
  return `=?UTF-8?B?${base64(value)}?=`;
}

/**
 * 将字符串编码为 Base64。
 *
 * @param value 原始字符串。
 * @return Base64 编码结果。
 */
function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * 对 SMTP DATA 内容执行点转义。
 *
 * @param value 原始 DATA 内容。
 * @return 点转义后的内容。
 */
function dotStuff(value: string): string {
  return value.replace(/(^|\r?\n)\./g, "$1..");
}
