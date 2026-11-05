# 部署说明

正式站运行在 Oracle Cloud 虚拟机上。Caddy 提供 HTTPS，Deno 常驻进程负责抓帖和通知，Turso 保存账号、会话和业务记录。正式标签触发 GitHub Actions 构建 Windows 安装包和 Android APK。

[systemd](../../ops/heybox-topic-notifier.service) · [Caddy](../../ops/Caddyfile)

## 按版本标签自动部署

`dev` 和 `main` 的推送只运行检查，不部署正式站。推送 `3.13.2` 或 `v3.13.2` 形式的正式版本标签后，GitHub Actions 检查代码、构建两个客户端并公开完整 Release。Oracle 每五分钟检查一次公开发行；只有标签对应提交的发行工作流成功、四个安装及更新附件齐全时，才部署该提交。草稿、预发行、不完整发行和更低版本不会上线。

网页和 APP 在线页面随这次服务端部署更新；Windows 与 Android 的原生程序通过同一标签的安装包更新。尚未升级的客户端仍需保持兼容。

服务器需要 Deno、Git、Python 3、curl、tar 和 flock。先按下文配置现有服务及环境文件，再从已验证的项目目录安装部署工具：

```sh
sudo install -d -m 0755 /usr/local/lib/heybox-deploy
sudo install -m 0644 ops/auto_deploy.ts ops/deploy.sh /usr/local/lib/heybox-deploy/
sudo install -m 0644 ops/heybox-auto-deploy.service ops/heybox-auto-deploy.timer /etc/systemd/system/
sudo install -d -m 0755 /etc/systemd/system/heybox-topic-notifier.service.d
printf '[Service]\nEnvironmentFile=-/opt/heybox-topic-notifier/current/.deploy.env\n' | sudo tee /etc/systemd/system/heybox-topic-notifier.service.d/release.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now heybox-auto-deploy.timer
sudo systemctl start heybox-auto-deploy.service
```

首次启动会部署当前最新的就绪正式版本。此服务只读取公开 GitHub API，不需要 GitHub 写入令牌或向 GitHub 提供服务器 SSH 私钥。部署工具独立安装，应用发行不会自动替换具有管理员权限的部署工具。

部署前验证归档摘要及标签提交、缓存运行依赖；切换后检查服务健康、公开 HTTPS 入口的运行提交、导航页面及静态资源摘要。失败时恢复上一应用目录并检查服务状态，账号数据和配置不回退。最近尝试记录保存在 `/var/lib/heybox-deploy/state.json`；失败或中断的同一次构建不会重复自动部署，排除原因后重新运行该标签的 GitHub 发行工作流即可重试。下载目录和临时归档用完即删除，发行目录保留用于回退。

```sh
systemctl list-timers heybox-auto-deploy.timer
journalctl -u heybox-auto-deploy.service -n 60 --no-pager
curl --fail --silent https://YOUR_DOMAIN/healthz
```

支持应用部署标识的发行，其健康响应 `deploymentId` 应等于标签的完整提交 SHA。较早发行可能仍返回 `local`，此时部署会通过实际运行进程目录和公开页面资源摘要确认版本；当前标签和 SHA 也记录在 `/var/lib/heybox-deploy/state.json`。暂停自动部署使用 `sudo systemctl stop heybox-auto-deploy.timer`；恢复使用 `sudo systemctl start heybox-auto-deploy.timer`。暂停定时器不会中止已经开始的部署。

同版本重发默认不会触发服务器部署。确认新安装包已经公开、标签构建成功后，可明确指定该标签的完整提交号执行一次重部署；此入口仍验证附件、标签和构建结果，不允许降级或重复部署同一提交。先加 `--check` 只检查目标，确认后去掉该参数执行：

```sh
sudo env DENO_DIR=/var/cache/heybox-deploy GIT_TERMINAL_PROMPT=0 /usr/bin/flock -n /run/lock/heybox-auto-deploy.lock /usr/local/bin/deno run --no-prompt --allow-net=api.github.com --allow-read --allow-write --allow-env --allow-run=/usr/bin/git,/usr/bin/bash /usr/local/lib/heybox-deploy/auto_deploy.ts --check --redeploy-sha=<完整提交号>
```

客户端不会把相同版本号识别为新版本，已经安装该版本的用户需要手动下载安装包覆盖安装。

## 运行环境变量

[`ops/heybox.env.example`](../../ops/heybox.env.example) → `/etc/heybox-topic-notifier/heybox.env` (root, `0600`)

```dotenv
STORAGE_READ_BACKEND=turso
TURSO_DATABASE_URL=libsql://YOUR_DATABASE.turso.io
TURSO_AUTH_TOKEN=<TOKEN>
PUBLIC_ORIGIN=https://YOUR_DOMAIN
PORT=8000
VM_POLLING_ENABLED=false
```

候选实例使用独立数据库。旧轮询停止后，在正式实例设置 `VM_POLLING_ENABLED=true`，并重启服务。

- 基础默认值：`APP_LOCALE`、`HEYBOX_TOPIC_ID`、`NOTIFIER_PROVIDER`
- 人机验证：`TURNSTILE_ENABLED`、`TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY`；如需为中国大陆网络启用自动降级，还需配置 `ALTCHA_ENABLED=true` 与至少 32 个字符的 `ALTCHA_HMAC_KEY`。ALTCHA 由本站签发并校验静默工作量证明，不调用第三方验证码服务。
- 轮询调优：`POLL_INTERVAL_MINUTES`、`POLL_POST_LIMIT`、`POLL_SORT`
- 小黑盒请求覆盖：`HEYBOX_SIGNATURE_MODE`、`HEYBOX_DEVICE_ID`、`HEYBOX_COOKIE`、 `HEYBOX_USER_AGENT`
- 通知公共项：`NOTIFIER_DELIVERY_TIMEOUT_SECONDS`
- Webhook 通知：`NOTIFIER_WEBHOOK_SERVICE`、`NOTIFIER_WEBHOOK_URL`、
  `NOTIFIER_PUSHPLUS_TOKEN`、`NOTIFIER_WXPUSHER_SPT`、`NOTIFIER_SERVER_CHAN_SEND_KEY`
- 邮件通知：`NOTIFIER_EMAIL_SERVICE`、`NOTIFIER_EMAIL_ADDRESS`、`NOTIFIER_EMAIL_FROM`、
  `NOTIFIER_EMAIL_API_URL`、`NOTIFIER_EMAIL_API_TOKEN`、`NOTIFIER_SMTP_HOST`、
  `NOTIFIER_SMTP_PORT`、`NOTIFIER_SMTP_SECURE`、`NOTIFIER_SMTP_USERNAME`、 `NOTIFIER_SMTP_PASSWORD`
- 通知中转：`NOTIFIER_PUSHPLUS_SEND_URL`、`NOTIFIER_WXPUSHER_SEND_URL`、
  `NOTIFIER_SERVER_CHAN_SEND_URL`、`NOTIFIER_RELAY_TOKEN`
- 出站安全白名单：`OUTBOUND_ALLOWED_HOSTS`

通知投递会校验自定义 Webhook、Email API 和 SMTP 目标。默认只允许公网 HTTPS URL 和常见 SMTP
端口；如果需要使用自托管中转或固定邮件服务，可以用逗号分隔的 `OUTBOUND_ALLOWED_HOSTS`
明确允许对应主机，例如 `relay.example.com,smtp.example.com`。
设置该变量后，通知出站目标必须命中列表中的主机或 `*.example.com` 形式的通配符。

HTTP 重定向会逐跳校验，且只允许同源跳转；未配置 `OUTBOUND_ALLOWED_HOSTS` 时，还会校验目标主机的 DNS
A/AAAA 解析结果不落入本机、内网、链路本地、元数据服务或保留地址范围。`OUTBOUND_ALLOWED_HOSTS`
是管理员显式信任边界，通配符只应配置在完全控制的域名下。

真实小黑盒话题抓取是当前唯一运行数据源。默认 `HEYBOX_SIGNATURE_MODE=app` 使用已验证的 App API
发布时间列表；`web` 仅保留为诊断回退。新账号默认关闭轮询，
只有账号在设置页开启“启用轮询”后才会实际抓取。

## 独立小黑盒详情出口

配置独立详情出口后，主服务优先从 Oracle 直连读取详情，直连失败或受限时才使用 Deno 备用出口。列表、轮询调度、账号、Turso、AI 匹配和通知继续在主服务运行；Oracle 正常时不消耗 Deno 详情请求额度。

独立服务的入口为 [`src/detail_relay.ts`](../../src/detail_relay.ts)，可使用 `deno task start:detail-relay`，或在独立 Deno Deploy 应用中指定此入口。配置专用 `HEYBOX_DETAIL_RELAY_TOKEN`（至少 32 个字符）和固定的 `HEYBOX_DEVICE_ID`；不要复制主服务的数据库、登录、邮件或通知密钥。该入口不启动 KV、数据库、Cron 或网页服务。发布时固定到已验证的版本提交，避免随开发分支变动。

Oracle 开启正式轮询和 Deno 详情出口启动前，都必须配置 `HEYBOX_DEVICE_ID`。为两路分别一次性生成随机标识，例如使用 `deno eval 'console.log(crypto.randomUUID().replaceAll("-", ""))'`，然后保存到各自的部署环境配置。不要使用用户手机的标识，也不要在启动脚本中反复生成；重启、冷启动、升级和鉴权密钥轮换都应保留原设备标识。标识支持 8–128 位字母、数字、下划线或连字符，缺失或无效时启动检查会报错。升级前先补齐环境配置，避免影响现有服务。固定标识只保持请求身份连续，既不代表登录，也不保证解除验证码。

在主服务的私有环境文件中设置 URL 和相同密钥，可选配置请求预算，然后重启：

```dotenv
HEYBOX_DETAIL_RELAY_URL=https://YOUR_RELAY/v1/details
HEYBOX_DETAIL_RELAY_TOKEN=<独立随机密钥>
HEYBOX_DETAIL_REQUESTS_PER_MINUTE=3
```

URL 和密钥必须同时配置。备用详情请求只发送帖子编号，禁止传入任意目标地址；使用 HTTPS、Bearer 鉴权、请求超时、响应长度限制、短期缓存与在途去重。两路出口分别冷却：Oracle 冷却结束后优先用下一条真实请求探测恢复，成功即继续直连；两路都受限时保留待处理任务并继续故障告警，不反复切换。冷却只是重试策略，不保证届时解除上游限制。`GET /healthz` 只说明出口进程可用，不能证明小黑盒详情可读。必须在主服务实际验证完整详情、匹配及通知，再认定配置完成。

升级删除状态处理时，先部署支持该协议的主服务，再更新独立出口固定的版本提交。仅更新主服务不会更新独立出口。出口仅在小黑盒明确确认内容已删除时返回带帖子编号和 `reason: "deleted"` 的 HTTP 410；主服务将其移出待处理队列并保留已保存记录。普通 HTTP 404、旧出口的 HTTP 422、验证码与网络错误均不能作为删除依据，仍需保留重试。

URL 和密钥必填，`HEYBOX_DETAIL_REQUESTS_PER_MINUTE` 可选（默认 3，范围 1–60）。此预算在主服务中按滚动 60 秒统计，所有账号和两路出口合计共享；Oracle 失败后的 Deno 请求也占一次额度，缓存命中不计数。超出预算的帖子保留到后续轮询，不占用 AI 调用，也不作为来源故障告警；已保存的完整正文不会被不完整刷新覆盖。低请求频率和独立出口都不能保证小黑盒不触发风控，部署后仍须核对真实接口状态。

Oracle 日志中的 `heybox_detail_attempt` 用 `route: oracle/deno` 和 `outcome` 区分每路的成功、删除或失败；失败包含该路重试时间。`heybox_detail_relay_success` 记录备用请求的响应字节数和耗时，`heybox_detail_relay_failed` 表示备用出口失败。结合平台实际 CPU、内存时间、请求数和出站用量检查配额，不能只根据“没有使用 KV”判断免费额度足够。源站限制仍可能影响两路出口，故障期间待处理队列和已有内容判定只作为保护措施。

## 通知中转

自托管进程将新增命中与各通道的投递任务一同写入 Turso。暂时失败的通道独立重试，
服务重启后可继续处理。测试通知用于检查当前通道，不写入工作区。

### 浏览器系统通知

设置中的“应用通知”只控制当前浏览器，与“其它通知”的邮件、Webhook 单选相互独立。
部署必须使用 HTTPS，并配置 `WEB_PUSH_PUBLIC_KEY`、`WEB_PUSH_PRIVATE_KEY` 和
`WEB_PUSH_SUBJECT`（例如 `mailto:admin@example.com`）。在可信终端执行
`deno task notifications:keys` 生成一次密钥对，将私钥保存在部署环境变量中。
未配置时开关不可用，并在通知行显示需要管理员配置的说明；此配置不包含荣耀原生推送接入。
初始化失败或超过十五秒时显示原因和“重试”，配置完成或网络恢复后可直接重试。
初始化和重试只读取状态，点击开启开关才会申请浏览器通知权限并创建订阅。

同一部署保持 VAPID 密钥稳定。轮换后需要重新开启浏览器通知。订阅绑定账号和登录会话，
退出、撤销或会话到期后停止投递；重新登录后按需再次开启。关闭开关后，已排队的消息也不会展示。
浏览器推送服务受理不等于设备已显示；系统权限、浏览器策略及推送服务的网络可达性都会影响接收。
真实后台接收仍需在目标浏览器验证。

### Webhook 中转

如果 Oracle Cloud 不能直接访问 PushPlus、WxPusher 或 Server酱，可以先部署免费的 Cloudflare Worker
中转。仓库中的 `workers/notification-relay.js` 固定提供 `/pushplus`、`/wxpusher` 和 `/serverchan`
三个转发入口，并使用 `Authorization: Bearer <token>` 鉴权；完整步骤见 [worker.md](worker.md)。

`/etc/heybox-topic-notifier/heybox.env`

```env
NOTIFIER_PUSHPLUS_SEND_URL=https://<your-worker>.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://<your-worker>.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://<your-worker>.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=<same-random-secret>
```

## 验证

```sh
systemctl is-active heybox-topic-notifier.service
curl --fail --silent --show-error -H "Host: YOUR_DOMAIN" http://127.0.0.1:8000/healthz
```
