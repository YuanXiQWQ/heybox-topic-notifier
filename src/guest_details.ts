/** @file 本机匿名详情服务，不加载账号数据库、通知配置或用户登录凭据。 */
import { createGuestBrowser } from "./services/heybox_guest_browser.ts";
import { createGuestDetailFetch } from "./services/heybox_guest_session.ts";
import { createHeyboxTopicSource } from "./services/heybox_topic_source.ts";
import { createDetailRelayHandler } from "./services/heybox_detail_relay.ts";

/** 本机服务只接受独立鉴权密钥，启动时禁止输出环境变量。 */
const token = Deno.env.get("HEYBOX_GUEST_DETAIL_TOKEN") ?? "";
/** 匿名 SDK 的进程内生命周期。 */
const guest = createGuestBrowser();
/** 复用既有正文、图片说明、评论和删除状态解析。 */
const source = createHeyboxTopicSource({
  fetchDetail: createGuestDetailFetch({ initialize: guest.initialize }),
});
/** 固定回环入口；公网不能直接调用浏览器或任意 URL。 */
const server = Deno.serve(
  { hostname: "127.0.0.1", port: 8788 },
  createDetailRelayHandler({ token, source }),
);

/**
 * 退出时关闭匿名浏览器和 HTTP 服务，等待正在处理的请求结束。
 * @return {Promise<void>} 服务关闭完成。
 */
async function shutdown(): Promise<void> {
  await guest.close();
  await server.shutdown();
}
Deno.addSignalListener("SIGTERM", () => void shutdown());
Deno.addSignalListener("SIGINT", () => void shutdown());
