# 通知中转 Worker

`notification-relay.js` 是给 Cloudflare Workers 使用的轻量中转，只提供：

- `POST /pushplus` -> `https://www.pushplus.plus/send`
- `POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- `GET /healthz` 健康检查

它不会接受任意目标 URL，因此不能被当成开放代理使用。

## 部署步骤

1. 在 Cloudflare Workers 创建一个免费 Worker。
2. 将 `workers/notification-relay.js` 的内容粘贴到 Worker 编辑器，或用 Wrangler 部署该脚本。
3. 在 Worker 的变量/密钥中添加 `RELAY_TOKEN`，值使用一段随机长密钥。
4. 部署后访问 `https://<your-worker>.workers.dev/healthz`，确认返回 `{"status":"ok"}`。
5. 在 Deno Deploy 配置：

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

项目侧只有在 PushPlus/WxPusher 发送地址被改成非官方地址时，才会发送：

```http
Authorization: Bearer <NOTIFIER_RELAY_TOKEN>
```

## 控制台测试

可以先在 Worker 控制台或本地 curl 测试鉴权是否生效：

```bash
curl -i "https://<your-worker>.workers.dev/pushplus" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"token":"<pushplus-token>","title":"relay test","content":"hello","template":"markdown"}'
```

WxPusher 测试：

```bash
curl -i "https://<your-worker>.workers.dev/wxpusher" \
  -H "Authorization: Bearer <same-random-secret>" \
  -H "Content-Type: application/json" \
  --data '{"spt":"<wxpusher-spt>","summary":"relay test","content":"hello","contentType":1}'
```
