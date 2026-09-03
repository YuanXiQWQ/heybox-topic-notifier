/**
 * @file 本文件提供 Cloudflare Turnstile 人机验证配置和服务端校验能力。
 */

/**
 * Cloudflare Turnstile 默认服务端校验地址。
 */
const defaultTurnstileVerifyUrl =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Turnstile 前端组件提交响应 token 的字段名。
 */
export const turnstileResponseFieldName = "cf-turnstile-response";

/**
 * Turnstile 配置。
 */
export type TurnstileConfig = {
  enabled: boolean;
  secretKey: string;
  siteKey: string;
  verifyUrl?: string;
};

/**
 * 读取环境变量的函数。
 */
export type EnvReader = (name: string) => string | undefined;

/**
 * Turnstile 校验使用的 fetch 函数。
 */
export type TurnstileFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Turnstile 校验选项。
 */
export type TurnstileVerifyOptions = {
  fetcher?: TurnstileFetch;
  remoteIp?: string;
};

/**
 * Turnstile 校验结果。
 */
export type TurnstileVerificationResult =
  | {
    skipped?: boolean;
    success: true;
  }
  | {
    errorCodes: string[];
    success: false;
  };

/**
 * 从环境变量读取 Turnstile 配置。
 *
 * @param readEnv 环境变量读取函数。
 * @return Turnstile 配置。
 */
export function turnstileConfigFromEnv(
  readEnv: EnvReader = (name) => Deno.env.get(name),
): TurnstileConfig {
  return {
    enabled: readEnv("TURNSTILE_ENABLED") === "true",
    secretKey: readEnv("TURNSTILE_SECRET_KEY") ?? "",
    siteKey: readEnv("TURNSTILE_SITE_KEY") ?? "",
  };
}

/**
 * 校验 Cloudflare Turnstile 响应 token。
 *
 * @param token 前端提交的 Turnstile 响应 token。
 * @param config Turnstile 配置。
 * @param options 校验选项。
 * @return Turnstile 校验结果。
 */
export async function verifyTurnstileToken(
  token: string | undefined,
  config: TurnstileConfig,
  options: TurnstileVerifyOptions = {},
): Promise<TurnstileVerificationResult> {
  if (!config.enabled) {
    return { skipped: true, success: true };
  }

  if (!config.secretKey || !config.siteKey) {
    return { errorCodes: ["missing-config"], success: false };
  }

  const responseToken = token?.trim();
  if (!responseToken) {
    return { errorCodes: ["missing-input-response"], success: false };
  }

  const body = new URLSearchParams({
    response: responseToken,
    secret: config.secretKey,
  });
  if (options.remoteIp) {
    body.set("remoteip", options.remoteIp);
  }

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(
    config.verifyUrl ?? defaultTurnstileVerifyUrl,
    {
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    },
  );
  if (!response.ok) {
    return { errorCodes: ["siteverify-http-error"], success: false };
  }

  const payload = await response.json().catch(() => undefined);
  if (!isTurnstileSiteverifyResponse(payload)) {
    return { errorCodes: ["invalid-siteverify-response"], success: false };
  }

  if (payload.success) {
    return { success: true };
  }

  return {
    errorCodes: normalizeTurnstileErrorCodes(payload["error-codes"]),
    success: false,
  };
}

/**
 * 判断对象是否为 Turnstile siteverify 响应。
 *
 * @param value 待判断值。
 * @return 值为 siteverify 响应时返回 true。
 */
function isTurnstileSiteverifyResponse(value: unknown): value is {
  "error-codes"?: unknown;
  success: boolean;
} {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as { success?: unknown }).success === "boolean";
}

/**
 * 规范化 Turnstile 错误码。
 *
 * @param value siteverify 响应中的错误码字段。
 * @return 错误码列表。
 */
function normalizeTurnstileErrorCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return ["unknown-error"];
  }

  const codes = value.filter((code): code is string =>
    typeof code === "string"
  );
  return codes.length > 0 ? codes : ["unknown-error"];
}
