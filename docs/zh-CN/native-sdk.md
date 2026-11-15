# 服务器独立详情服务

`src/sdk_details.ts` 在 Linux 服务器上运行官方 ARM64 原生 SDK，通过 Java/unidbg
提供其所需的 JNI 接口。它不需要常驻 Android 系统、本地电脑、ADB、SSH
反向隧道或个人小黑盒账号。主服务继续负责列表、匹配、数据库和通知，详情服务只监听
`127.0.0.1:8788`。

## 安装

需要 Linux x86_64、Java 21、Deno 2 和 Maven。构建时固定代码提交，运行目录使用
`/opt/heybox-sdk-details/releases/<commit>`，`current`
指向该目录。此独立服务的升级不替换网站正式发行版本。

1. 在该提交的源码目录执行
   `mvn -B -f tools/native-sdk/pom.xml compile dependency:copy-dependencies -DoutputDirectory=target/lib`。保留
   `target/classes`、`target/lib` 和 `public-cert.txt`。
2. 从合法取得的官方小黑盒 **1.3.400/build1149** APK 提取
   `lib/arm64-v8a/libsmsdk.so`，安装到
   `/opt/heybox-sdk-details/libsmsdk.so`。SHA-256 必须为
   `294fdbaeea83a95c2de92fb608f82228c8041149ce539152a261d85433d4136c`，运行器拒绝其它文件。原生库、APK、依赖构建产物和私密状态不纳入本仓库。
3. 创建系统账号 `heybox-sdk`，将 `/var/lib/heybox-sdk-details` 和
   `/var/cache/heybox-sdk-details` 交给该账号，权限 `0700`。源码和运行库由 root
   持有，运行账号只读。
4. 创建 root 持有的 `0600` 环境文件
   `/etc/heybox-topic-notifier/native-details.env`，设置独立的
   `HEYBOX_GUEST_DETAIL_TOKEN`（至少 32 字符）。主服务使用相同密钥及
   `HEYBOX_GUEST_DETAIL_URL=http://127.0.0.1:8788/v1/details`，通过其 systemd
   `EnvironmentFile` 加载。不要将密钥写入命令行、Git、日志或聊天。
5. 安装 `ops/heybox-sdk-details.service`。使用 unit
   中的同一账号、路径和环境，先执行一次
   `deno cache src/sdk_details.ts`，再以相同运行权限执行
   `src/sdk_details.ts --initialize`。初始化是显式的一次性操作；已有身份时该命令拒绝覆盖。
6. 执行
   `systemctl daemon-reload`、`systemctl enable --now heybox-sdk-details.service`。详情来源在首次请求时注册
   SDK，后续直接复用持久令牌。

unit 将内存限制为 320 MiB、CPU 限制为 75%。JVM 只在注册或续期时启动，最大堆 128
MiB，单次采集限时 20 秒。需为主应用和操作系统保留额外内存。无图形桌面要求。

## 身份、冷却与恢复

`identity.json` 保存固定绑定、SDK
会话、缓存令牌及注册冷却，使用完整性摘要、原子替换和独占锁。`detail-retry.json`
独立保存详情请求冷却。目录应与账号数据一样保护；备份或迁移必须停服务并完整保留两者，不得仅复制令牌或重建身份来跳过冷却。

普通重启复用现有身份，不按任意缓存时长换发令牌。上游明确返回 `lack_token`
后，在冷却结束时用同一绑定和 SDK 会话重新注册。验证码、限流不触发身份更换或 SDK
刷新；请求中途退出也保留预写的冷却。身份缺失、损坏或锁被占用时停止运行，不能自动创建替代身份。

需要人工主动刷新时，先停止服务，在相同账号及 unit 环境下运行
`src/sdk_details.ts --refresh`，然后重启服务。该入口仍遵守持久冷却，并保留现有身份。主动刷新成功不能等同于已经验证自然过期。

检查 `systemctl status heybox-sdk-details` 和
`journalctl -u heybox-sdk-details`。日志只记录状态，不应包含 SDK
标识、原生报文或服务密钥。验收应经主服务的实际详情链路确认
`detailsComplete`、正文、首屏评论及回复；列表正常、进程存活或 SDK
注册成功都不能单独证明完整详情可用。

## 本地验证

`deno task check` 包含故障恢复单元测试和磁盘身份集成测试。Java 部分使用 Maven
构建；真实原生注册与取数需要上述官方库和服务器环境。离线测试使用合成身份，不访问上游。
