/** @file 旧托管域名的公开导航入口，业务写入返回维护状态。 */
/** 迁移后接管账号、数据和后台任务的公开来源。 */
const origin = "https://heybox.yuanxiqwq.top";
/** 可以在新站直接打开的页面路径。 */
const pages = new Set(["/", "/settings", "/history", "/login", "/about"]);

/**
 * 引导网页访问新来源，仅转移公开页面路径，避免传递认证参数或重放写入。
 * @param {Request} request 发往旧站的请求。
 * @return {Response} 页面跳转或旧业务接口的维护响应。
 */
export function legacyLanding(request: Request): Response {
  const path = new URL(request.url).pathname;
  const headers = {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-heybox-legacy": "moved",
  };
  if (
    (request.method === "GET" || request.method === "HEAD") && pages.has(path)
  ) {
    return new Response(null, {
      status: 302,
      headers: { ...headers, location: origin + path },
    });
  }
  return new Response("Service moved to https://heybox.yuanxiqwq.top", {
    status: 503,
    headers,
  });
}
