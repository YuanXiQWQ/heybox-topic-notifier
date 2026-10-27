/** @file 在本机生成浏览器推送 VAPID 密钥，不联网也不修改部署配置。 */
// @deno-types="npm:@types/web-push@3.6.4"
import webPush from "web-push";

/** 仅供当前部署保存的随机密钥对，私钥不得提交到版本库。 */
const keys = webPush.generateVAPIDKeys();
console.log(`WEB_PUSH_PUBLIC_KEY=${keys.publicKey}`);
console.log(`WEB_PUSH_PRIVATE_KEY=${keys.privateKey}`);
console.error("请将密钥保存到部署环境变量，勿将私钥提交到仓库或发送到聊天中。");
