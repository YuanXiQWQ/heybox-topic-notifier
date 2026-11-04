/** @file 启动独立详情取数出口，仅加载签名与抓取模块，不启动数据库、网页或定时任务。 */
import { createDetailRelayHandler } from "./services/heybox_detail_relay.ts";
import { createHeyboxTopicSource } from "./services/heybox_topic_source.ts";

/** 专用的出口密钥不与账号密钥、通知密钥共享。 */
const token = Deno.env.get("HEYBOX_DETAIL_RELAY_TOKEN") ?? "";
/** 独立出口按原小黑盒接口参数取数，验证码状态由数据源统一冷却。 */
const source = createHeyboxTopicSource();
Deno.serve(createDetailRelayHandler({ token, source }));
