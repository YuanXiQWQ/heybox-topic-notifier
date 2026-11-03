# 自托管部署

本项目可在 Linux 虚拟机上使用开源 Deno 运行时、Turso 和 Caddy 运行。`start:vm`
不依赖 Deno Deploy、托管 Deno KV 或 Deno Cron。数据库、虚拟机和 Google Drive
仍分别受各自套餐、磁盘和账号额度限制。

## 环境与入口

1. 安装 Deno、Caddy，建立无登录 shell 的 `heybox` 服务账号，以及
   `/opt/heybox-topic-notifier/releases`、`/var/cache/heybox`、`/var/lib/heybox`。
2. 将 `ops/heybox.env.example` 复制为 `/etc/heybox-topic-notifier/heybox.env`，由 root
   持有并设置为 `600`。填写 Turso 连接，以及 `.env.example` 中需要的认证和通知配置。
   保持已有的加密、TOTP 和 VAPID 密钥稳定。不要将环境文件放进发布包或 Git。
3. `STORAGE_READ_BACKEND` 必须为 `turso`；不要配置双写、影子读取或托管 KV
   来源。`PUBLIC_ORIGIN` 必须是独立域名的 HTTPS 来源。服务只监听回环地址。
4. DNS 指向服务器，仅公开 SSH 和网站需要的端口。参考 `ops/Caddyfile`
   配置 HTTPS 反向代理；内部应用端口不应公开。
5. 将生产及候选 systemd 单元复制到 `/etc/systemd/system/`，执行
   `systemctl daemon-reload`。候选环境使用独立数据库、不同本地端口和
   `/etc/heybox-topic-notifier/candidate.env`，保持 `VM_POLLING_ENABLED=false`。

使用 `git archive` 打包完整提交，计算 SHA-256 后，部署脚本的调用方式为：

```sh
sudo bash ops/deploy.sh candidate FULL_COMMIT_ID /path/to/release.tar.gz SHA256
sudo bash ops/deploy.sh production FULL_COMMIT_ID /path/to/release.tar.gz SHA256
```

脚本会检查归档、准备依赖、切换版本链接并检查 HTTP 健康状态。启动失败时尝试恢复先前版本。
它不会用旧快照覆盖数据库，也不会自动停止另一台服务器的轮询。正式切换前须停止旧调度并等待在途任务结束，
再打开新环境的 `VM_POLLING_ENABLED=true`，避免重复抓取和投递。

原项目从 Deno Deploy 迁到 `heybox.yuanxiqwq.top` 时，可在旧应用的生产和预览环境设置
`HEYBOX_LEGACY_LANDING=true`，并部署含此入口的版本。旧站的常用页面会跳到新站，
旧业务接口返回 503，旧进程不再初始化数据库或注册 Cron。确认旧接口返回
`X-Heybox-Legacy: moved`，并等待在途任务结束后再开启 Oracle 后台。
回退时先停止 Oracle 后台，再从 Deno 环境移除该开关并重新部署完整服务。

## 更换域名与客户端

更换域名之前，让所有设备连接旧服务，保存设置并等待离线修改同步完成。保留旧应用数据，
不要通过卸载清理、清除站点数据或 WebView 数据来处理迁移。无法联网或无法确认同步的设备，
应先保留旧客户端及其本地数据，恢复同步后再升级。

Windows 的服务来源位于 `apps/desktop/config.json`，Android 位于
`apps/android/app/build.gradle`。修改后需重新构建并通过正常更新流程安装。
原生设备偏好保存在设备上；站点 Cookie、IndexedDB、Service Worker 和浏览器权限按来源隔离。
用户需要在新域名重新登录，让已同步的账号数据重新缓存。

同时更新 Google OAuth JavaScript 来源、Turnstile 主机名、Passkey 的 RP ID 和预期来源。
旧域名的 Passkey 无法直接用于新域名，应先确认密码、邮箱或 Google 等备用登录方式，
在新域名登录后重新登记 Passkey。浏览器系统推送需在新来源重新启用，并验证设备实收。

## 加密备份与恢复

`scripts/database_backup.ts` 将数据库快照在内存中压缩、加密；恢复会核对 SQLite 完整性及各表摘要。
生成密钥时，两个目标文件都必须不存在：

```sh
deno run --allow-write scripts/database_backup.ts keys private.pk8 public.spki
```

私钥应离线妥善保存；丢失后无法解密已有备份。服务器只部署公钥：
`/usr/local/share/heybox/backup-public.spki`。数据库凭据放在 root 私有的
`/etc/heybox-topic-notifier/backup.env` 中，仅包含 `TURSO_DATABASE_URL` 和 `TURSO_AUTH_TOKEN`。

自动上传使用官方 rclone 和独立的 `heybox-backup` 服务账号。Google Drive OAuth
选择 `drive.file` 范围，使用自己的 OAuth 客户端；长期运行需避免测试模式下的短期授权。
凭据保存在该账号私有的 `/var/lib/heybox-backup/rclone.conf` 中，远程名称为 `backup`。
不要把 rclone 配置、授权日志或刷新令牌纳入仓库。

将已验证、包含备份脚本的发布目录链接为 `/opt/heybox-topic-notifier/backup`；
该链接独立于应用的 `current`，便于应用回退后继续备份。准备此账号的 Deno 缓存，
将 `ops/backup.sh` 安装到 `/usr/local/lib/heybox/backup.sh`，并安装两个 `heybox-backup`
systemd 单元。先手动运行服务并验证恢复，再启用计划：

```sh
sudo systemctl start heybox-backup.service
sudo systemctl enable --now heybox-backup.timer
sudo systemctl list-timers heybox-backup.timer
sudo systemctl status heybox-backup.service
```

计划每日 UTC 18 点后最多错峰 15 分钟运行。上传后重新下载密文，核对 SHA-256；失败返回非零并保留本地文件。
快照保存在 `backup:heybox-encrypted-backups`，本地密文保存在
`/var/lib/heybox-backup/archives`。脚本不自动删除历史备份，应定期检查任务状态、数据库读量、
本地磁盘及 Drive 剩余空间，按自己的保留策略处理文件。

在持有私钥的可信电脑上下载密文，恢复到一个不存在的新 SQLite 文件：

```sh
export BACKUP_INPUT_FILE=/path/to/encrypted.hnb
deno run --allow-env=BACKUP_INPUT_FILE --allow-read --allow-write \
  scripts/database_backup.ts restore /path/to/private.pk8 /path/to/restored.sqlite
```

恢复后的 SQLite 包含账号和业务数据，应限制文件权限。恢复命令用于核验或另建恢复库，
不会自动覆盖在线数据库；实际恢复前应核对需要保留的最新写入。
