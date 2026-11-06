/** @file 启动独立详情取数出口，仅加载签名与抓取模块，不启动数据库、网页或定时任务。 */
import { createDetailRelayHandler } from "./services/heybox_detail_relay.ts";
import { createHeyboxTopicSource } from "./services/heybox_topic_source.ts";
import { requireHeyboxDeviceId } from "./services/heybox_device_identity.ts";

/** 专用的出口密钥不与账号密钥、通知密钥共享。 */
const token = Deno.env.get("HEYBOX_DETAIL_RELAY_TOKEN") ?? "";
/** 允许显式覆盖签名模式；未配置时沿用数据源的 build1149 默认协议。 */
const signatureMode = Deno.env.get("HEYBOX_SIGNATURE_MODE");
/** 独立出口使用部署级固定设备标识，冷启动和版本升级沿用同一身份。 */
const source = createHeyboxTopicSource({
  deviceId: requireHeyboxDeviceId(Deno.env.get("HEYBOX_DEVICE_ID")),
  signatureMode: signatureMode === "app" || signatureMode === "web" ||
      signatureMode === "app-v1149" || signatureMode === "app-v1149-rnd14"
    ? signatureMode
    : undefined,
});
Deno.serve(createDetailRelayHandler({ token, source }));
