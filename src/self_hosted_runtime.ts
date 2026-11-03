/** @file 校验自托管配置，并将受控反向代理请求还原为固定 HTTPS 来源。 */
import type { StorageEnvironment } from "./storage/factory.ts";

/** 常驻服务启动时的严格配置，不允许回退至托管 KV。 */
export type SelfHostedConfig = { origin: string; port: number; polling: boolean };

/**
 * 在构造存储前检查自托管入口，错误只指出配置项，不回显环境变量值。
 * @param {StorageEnvironment} environment 环境读取器。
 * @return {SelfHostedConfig} 校验后的固定来源、回环端口及后台开关。
 */
export function selfHostedConfig(environment: StorageEnvironment = Deno.env): SelfHostedConfig {
  if (environment.get("STORAGE_READ_BACKEND") !== "turso") throw new Error("Self-hosted service requires STORAGE_READ_BACKEND=turso.");
  for (const name of ["STORAGE_DUAL_WRITE", "STORAGE_SHADOW_READ", "DENO_KV_SOURCE_URL", "DENO_KV_ACCESS_TOKEN", "DENO_DEPLOYMENT_ID", "DENO_DEPLOY"]) {
    if (environment.get(name)?.trim()) throw new Error(`Self-hosted service does not allow ${name}.`);
  }
  let url: URL;
  try { url = new URL(environment.get("PUBLIC_ORIGIN") ?? ""); }
  catch { throw new Error("PUBLIC_ORIGIN must be an HTTPS origin."); }
  const domainLabels = url.hostname.split(".");
  const domain = domainLabels.length > 1 && domainLabels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) && /[a-z]/i.test(domainLabels.at(-1)!);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.port || !domain || url.hostname.endsWith(".deno.net") || url.hostname.endsWith(".deno.dev")) {
    throw new Error("PUBLIC_ORIGIN must be an independent HTTPS domain without a path or port.");
  }
  const port = Number(environment.get("PORT") ?? "8000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port.");
  const polling = environment.get("VM_POLLING_ENABLED");
  if (polling !== "true" && polling !== "false") throw new Error("VM_POLLING_ENABLED must explicitly be true or false.");
  return { origin: url.origin, port, polling: polling === "true" };
}

/**
 * 仅接收固定域名，经回环代理转发的 HTTP 请求使用配置中的 HTTPS 来源。
 * 来源不取自客户端可伪造的转发头，保持 Secure Cookie、CSRF、原生授权及绝对链接正确。
 * @param {string} origin 已校验的公开来源。
 * @param {(request: Request) => Response | Promise<Response>} fetch 应用处理函数。
 * @return {(request: Request) => Response | Promise<Response>} 自托管请求处理函数。
 */
export function selfHostedHandler(origin: string, fetch: (request: Request) => Response | Promise<Response>) {
  const expected = new URL(origin);
  return (request: Request): Response | Promise<Response> => {
    const url = new URL(request.url);
    if (url.host !== expected.host) return new Response("Misdirected Request", { status: 421 });
    url.protocol = expected.protocol;
    return fetch(new Request(url, request));
  };
}
