/** @file 通过官网执行匿名初始化；浏览器只在初始化期间运行，沙箱与 TLS 校验保持开启。 */
import {
  type Browser,
  type BrowserContext,
  chromium,
} from "npm:playwright@1.64.0";
import { buildHkey } from "./heybox_signer.ts";
import {
  guestDetailEndpoint,
  type HeyboxGuestSession,
} from "./heybox_guest_session.ts";

/** 初始化总时限，包含浏览器启动与清理前的页面等待。 */
const initializationTimeoutMs = 45000;
/** 会话最长复用一天，实际过期时间还受 Cookie 有效期限制。 */
const maximumSessionAgeMs = 86400000;
/** 只保留官网详情使用的公开客户端和分页参数。 */
const templateKeys = new Set([
  "_time",
  "app",
  "client_type",
  "hkey",
  "index",
  "is_first",
  "limit",
  "link_id",
  "nonce",
  "os_type",
  "owner_only",
  "page",
  "version",
  "web_version",
  "x_app",
  "x_client_type",
  "x_client_version",
  "x_os_type",
]);

/**
 * 创建不登录账号的官网初始化器，在同一进程内保存匿名设备状态供刷新复用。
 * @return {{initialize: (id: string) => Promise<HeyboxGuestSession>; close: () => Promise<void>}} 初始化与终止接口。
 */
export function createGuestBrowser() {
  let browser: Browser | undefined;
  let storageState:
    | Awaited<ReturnType<BrowserContext["storageState"]>>
    | undefined;
  let closed = false;
  return {
    /**
     * 阻止页面过早请求详情，等待官网 SDK 初始化后提取当前匿名会话到内存。
     * @param {string} id 公开帖标识。
     * @return {Promise<HeyboxGuestSession>} 已验证的匿名会话，浏览器在返回前关闭。
     */
    async initialize(id: string): Promise<HeyboxGuestSession> {
      if (closed || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
        throw new Error("Anonymous initialization unavailable");
      }
      const deadline = Date.now() + initializationTimeoutMs;
      const timer = setTimeout(
        () => void browser?.close(),
        initializationTimeoutMs,
      );
      try {
        browser = await chromium.launch({
          headless: true,
          chromiumSandbox: true,
          timeout: 15000,
        });
        if (closed) throw new Error("Anonymous initialization stopped");
        // 刷新匿名令牌时仍沿用 SDK 本地状态，不创建不断轮换的设备身份。
        const context = await browser.newContext({
          storageState: storageState
            ? {
              ...storageState,
              cookies: storageState.cookies.filter((cookie) =>
                cookie.name !== "x_xhh_tokenid"
              ),
            }
            : undefined,
          serviceWorkers: "block",
        });
        const page = await context.newPage();
        let template: URL | undefined;
        await page.route(`${guestDetailEndpoint}*`, async (route) => {
          const url = new URL(route.request().url());
          if (url.origin + url.pathname === guestDetailEndpoint) {
            template ??= url;
          }
          await route.abort();
        });
        await page.goto(`https://www.xiaoheihe.cn/app/bbs/link/${id}`, {
          waitUntil: "domcontentloaded",
          timeout: Math.max(1, deadline - Date.now()),
        });
        while (Date.now() < deadline && !closed) {
          const cookies = await context.cookies("https://api.xiaoheihe.cn");
          const cookie = cookies.find((value) =>
            value.name === "x_xhh_tokenid" && value.value
          );
          if (cookie && template) {
            if (
              buildHkey(
                template.pathname,
                Number(template.searchParams.get("_time")),
                template.searchParams.get("nonce") ?? "",
              ) !== template.searchParams.get("hkey")
            ) {
              throw new Error("Unsupported official web signature");
            }
            for (const key of [...template.searchParams.keys()]) {
              if (!templateKeys.has(key)) template.searchParams.delete(key);
            }
            storageState = await context.storageState();
            return {
              template: template.toString(),
              cookie: `x_xhh_tokenid=${cookie.value}`,
              userAgent: await page.evaluate(() => navigator.userAgent),
              expiresAt: Math.min(
                Date.now() + maximumSessionAgeMs,
                cookie.expires > 0 ? cookie.expires * 1000 : Infinity,
              ),
            };
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        throw new Error("Anonymous initialization timed out");
      } catch {
        throw new Error("Anonymous initialization failed");
      } finally {
        clearTimeout(timer);
        await browser?.close().catch(() => {});
        browser = undefined;
      }
    },
    /**
     * 终止正在进行的初始化并释放内存中的匿名设备状态。
     * @return {Promise<void>} 浏览器关闭完成。
     */
    async close(): Promise<void> {
      closed = true;
      storageState = undefined;
      await browser?.close().catch(() => {});
    },
  };
}
