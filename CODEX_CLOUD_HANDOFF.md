# Codex 云端交接：小黑盒完整详情稳定性修复

交接时间：2026-11-06 03:13 左右，温哥华时间；对应 11:13 UTC。用户要关电脑睡觉，后续由云端自主推进，不要中途向用户提问或请求确认。

## 1. 目标与最重要的现状

项目：`YuanXiQWQ/heybox-topic-notifier`，中文名称“小黑盒话题提醒 / 蔚蓝社区提醒”。

目标是稳定取得小黑盒公开帖的完整详情，恢复完整匹配和通知。用户明确不要只降低告警频率、只靠标题摘要、反复更换出口等临时措施。Oracle 为主；Deno 因额度限制只作备用。保留现有网页、Windows、Android、账号、匹配、通知、离线同步及彩蛋功能。

**尚未修复完成，也未部署本次新代码。** 已找出匿名设备初始化这一重要差异，但带令牌的请求后来仍出现验证码。不能把前几次成功解释成永久解决，不能把单元测试通过冒充实际 Oracle 稳定性通过。

关机前检查：Oracle 正式服务 `active`；本次浏览器探针服务 `inactive`；临时 AppArmor profile 已卸载；没有该诊断路径下残留 Chromium 进程。没有需要用户电脑继续运行的已启动实验。

## 2. 工作约束和授权边界

- 用户最新要求：云端继续工作，不要中途联系他确认。他睡觉无法回应。对可逆、本地、隔离测试自主推进；不要把无人回复当作额外授权。遇到无法取得的环境访问权限，继续完成独立工作，最终明确列出阻碍。
- 仓库规则不在远端：本地 `AGENTS.md` 通过 `.git/info/exclude` 忽略。关键规则已在本文重述；如果云端另有规则，也要读取。
- 从 `dev` 建立 `fix/...` 或 `feat/...` 分支；禁止在 `main` 开发，禁止 `codex/` 前缀。功能分支 → dev → main，main 只接收 dev 合并。
- 用户已明确授权本次候选代码提交、交接文档临时放根目录并推送功能分支。除此之外，默认本地提交，不推送、不发布。历史发布授权针对已有版本，不能自动外推为发布下一个未知版本。此次“云端继续、不问用户”足以继续诊断、实现和验证，不要因此擅自更换生产认证凭据或执行破坏性操作。
- 正式服务按版本标签部署，等待标签检查和客户端构建成功后部署确切提交，不因 main/dev 推送上线。需要发布时按有效授权范围操作；没有有效授权则交付完整、可评审的结果并明确未部署，不用权限问题阻止其它工作。
- 分析、提案、计划、原始实验日志通常只放被忽略的 `临时文件/`，不得提交。本次用户明确例外允许本文件 `CODEX_CLOUD_HANDOFF.md` 临时放根目录并推送，用于云端接手。其它文档规则不变，交接完成后正常提交删除本文件。
- 新增/修改函数写中文 JSDoc，参数和返回值有类型；文件头和全局常量说明职责。注释不写“本轮修复”“旧版本改为”等历史过程。
- 先定位完整影响链路、核对实际版本和部署。报告区分代码、测试、真实环境验证、部署四种状态。保留真实失败，不能关闭告警掩盖问题。
- 优先日志、接口、ADB、测试，不依赖 computer-use。用户电脑关机，不可要求 MuMu 配合或本地浏览器登录。
- 不读取/输出/上传生产密钥、Cookie、私钥。不要从其它应用寻找替代凭据。测试匿名令牌不得导入生产。
- 每次用完临时产物应清理；涉及此前自动审批拒绝的目录不得换方法/删父目录绕过。详见清理章节。

## 3. 仓库与已提交候选代码

本机工作区：`F:\JerryCode\YuanXi-WarmNest\GitHub\Projects\小黑盒话题提醒`。

分支：`fix/heybox-anonymous-web-session`，从干净 dev 建立。

基底 HEAD：`666ee9d75406194aeba6339c9338c554d7750fa2`。

最近基底提交：

- `666ee9d7` Merge branch 'fix/workspace-live-refresh' into dev
- `526e1d01` fix: 修复处理帖子后工作区新命中不自动显示
- `77a1275b` Merge branch 'fix/stable-heybox-device' into dev
- `68d89b38` fix: 固定部署设备标识并阻止冷启动随机轮换
- `883c470f` Merge branch 'fix/oracle-primary-details' into dev

**候选代码已提交，提交为 `3052fe4de5a3cfe77389dc138422207f34722cb0`。本文件与代码一起推送至 `fix/heybox-anonymous-web-session`。云端应直接选择该分支，先读取本文件，然后继续工作，不需要提取或重复应用补丁。** 若从其它分支启动，先获取该远端功能分支并保护当前修改；不要覆盖 dev/main，不要强推。

候选文件：

- 修改 `deno.lock`：加入 Playwright 1.64.0 依赖；仅独立入口加载浏览器，主应用不会因此加载 Playwright。
- 修改 `src/services/heybox_topic_source.ts`：可注入 `fetchDetail(id)`，沿用现有正文/评论/删除状态解析；`lack_token` 冷却一分钟。
- 修改 `src/services/heybox_detail_relay.ts`：显式 `local: true` 仅允许 HTTP `127.0.0.1`，冷启动等待 60 秒；远端仍强制 HTTPS。
- 修改 `src/services/polling_context.ts`：可选 `HEYBOX_GUEST_DETAIL_URL/TOKEN` 作为 Oracle 主详情来源，Deno 原备用链保持。
- 新增 `src/services/heybox_guest_session.ts`：内存会话、并发初始化合并、新鲜 Web 签名、1 MiB 响应上限；令牌失效延迟刷新；验证码保留身份并退避 15 分钟。
- 新增 `src/services/heybox_guest_browser.ts`：官网匿名 SDK 初始化，沙箱/TLS 开启；拦截并取消初始化之前的详情请求；SDK 状态只在同一进程内存保存；浏览器初始化后关闭。
- 新增 `src/guest_details.ts`：独立本机鉴权详情入口，监听 `127.0.0.1:8788`；不接数据库/通知；独立随机服务密钥不等于上游匿名令牌。
- 新增 `src/services/heybox_guest_session_test.ts`：7 项测试覆盖复用、正文链路、Deno 回退、验证码退避、失效刷新、响应限制、回环目标验证。

**代码是候选实现，不是已证明正确的正式方案。实际候选首轮读取仍被验证码拦截。** 继续定位后可以调整或放弃此实现，不要为了交付而直接发布。

已通过：`deno check src/guest_details.ts src/services/polling_context.ts`、相关 35 项测试、全量 `deno task check` 的 **847 项测试**（0 失败）、新模块 lint、`git diff --check`。全量检查不包含浏览器真实环境验收。

待补齐的工程项（在方案验证成立后）：部署/回滚对独立服务的管理、隔离系统用户/资源配置、浏览器依赖安装与固定版本、配置预检、用户部署文档、CI 显式检查新入口。修改方法的现有注释也要同步。

## 4. 正式服务和访问条件

- Oracle IP：`132.145.103.53`，Ubuntu 24.04.4 x86_64，多伦多，约 954 MiB RAM / 2 GiB swap。
- 正式站：`https://heybox.yuanxiqwq.top`，健康端点 `/healthz`。
- 服务：`heybox-topic-notifier`。
- 当前正式版本：**3.13.6**，提交 `a10ef490fcee4e393c2d94ed06f975ba499e11af`，此前实际部署核对通过。
- 程序：`/opt/heybox-topic-notifier/current`。
- 私有配置：`/etc/heybox-topic-notifier/heybox.env`，root 600，**不得 cat、回显或复制到日志**。
- Deno：`/usr/local/bin/deno`，2.9.3。
- Deno 备用独立应用：`good-thrush-4832`；URL `https://good-thrush-4832.yuanxiqwq.deno.net/v1/details`。密钥不在本文。
- 本机 SSH 使用 `ubuntu`，私钥只保存在用户电脑，不随文档上传。**云端不会因本文得到该私钥。** 先检查云端已有授权的项目环境/连接；若没有 SSH 凭据，不要求睡觉的用户传密钥，不声称已验证 Oracle，也不把另一出口成功冒充 Oracle 成功。继续代码、离线测试和可执行的隔离验证准备，把真实环境阻碍记入最终结果。
- 可使用已有只读脚本 `/home/ubuntu/.config/heybox-detail-relay/health.ts`，在私有环境文件由 Deno 读取的情况下输出脱敏健康摘要；调用前检查脚本职责，不能把生产 env 内容输出。已有链路通过 Deno 备用维持通知，并非本轮停服。

现有详情调度：Oracle 优先，Deno 备用；所有账号、两路合计滚动每分钟最多 3 次；失败也计数；短缓存和在途去重；各出口独立冷却，最长 15 分钟；预算排队不能当故障；完整正文不得被失败刷新覆盖。所有这些行为必须保留。

## 5. 已证实的事实，按证据强度排列

### 5.1 真实 App 的同请求因果对照

隔离 MuMu 实例使用匿名真实 App，经 TLS 诊断代理再通过 SSH → Oracle CONNECT 出口访问公开帖。没有登录账号，没有将设备令牌放到生产。

2026-11-06 10:28 UTC 左右，同一个 `/bbs/app/link/tree/v2` 请求（同 URL、签名、nonce、设备参数）约三秒内：

1. App 原始匿名请求：`ok`。
2. 不改变任何字段重放：`ok`。
3. 只移除 Cookie（原始只有 `x_xhh_tokenid`）：`show_captcha`。

因此匿名设备令牌确实是重要因素；不需要登录账号也能取得正文。不能据此证明令牌是唯一因素或可以永久免验证码。

真实 App 使用 SmAntiFraud SDK 生成匿名设备标识，必要时 POST `/rc/box_data/callback` 的 `box_data` 换取 `heybox_token`，Cookie 名称 `x_xhh_tokenid`。真实 App 默认 User-Agent 恰好与项目旧 User-Agent 一致，不能把 UA 单独认定为根因。当前 App build 1112 / 1.3.391、Android 15；项目旧默认 build783 / 1.3.232。只替换版本参数曾返回非法请求。真实 App 当前签名未匹配项目现有 App/Web 算法，不能只更新版本号假装协议正确。

### 5.2 Oracle 官网匿名初始化曾连续成功

公开帖：

- `77af72c7cfe3`：标题“怎么秒了”，正文含“我录制还没开呢”，作者 U_Light，数字 ID 196222214。
- `adea72c544f5`：标题“这里怎么通过？”。
- 另有曾漏报帖 `f06072c4d6b6`：“这个该咋过去[cube_晕]”。`zsbd` 是“字数补丁”，不能因此判为无意义非求助。

在 Oracle 真实隔离 Chromium 中访问 `https://www.xiaoheihe.cn/app/bbs/link/77af72c7cfe3`：

- 首个请求没有设备 Cookie，返回 `show_captcha`。
- 等待官网匿名初始化后，在同一个浏览器内对同一详情 URL 使用 `credentials: include`，返回 `ok`，`result.link.text` 412 字符，含“我录制还没开呢”。
- 官网签名与项目 `buildHkey`（Web）一致，和 `buildAppHkey` 不一致。
- 同一会话、重新生成 `_time/nonce/hkey`，读取 `adea72c544f5`，返回 `ok`，text499 字符，标题正确。
- 另一轮先取得上述首帖成功，再把当前匿名会话只留在同一进程内存中，关闭浏览器，使用 Deno 普通 HTTP 访问第二帖，仍 `ok` / text499。没有导出或保存令牌。

成功探针约 34–36 秒，CPU 7 秒，MemoryMax 384 MiB，峰值达到此限制，无 swap。不能据此承诺这个配额在所有情况下足够。浏览器关闭后候选进程 RSS 约125 MiB。

### 5.3 随后的失败推翻了“已稳定修复”结论

- 正式候选模块采用“拦截网页首个详情 → 发现 Cookie → 关闭浏览器 → Deno HTTP”，首帖仍 `show_captcha`；耗时约17秒，后续帖因冷却未请求。
- 为检查是否由候选代码引起，重跑此前成功的原始探针（不拦截首个详情、等页面20秒、再在浏览器中带 Cookie 请求）：**同样 `show_captcha`**。
- 所以失败不能仅归因于新代码的初始化时序，也不能宣称已证实某个字段导致。每轮新建浏览器身份、上游随时间变化、SDK 完成时点等因素尚未排除。不要无证据下结论，也不要进一步大量新建匿名身份“碰碰运气”。

下一项有价值的对照是同一内存会话、低频跨时间读取；必须记录初始化次数，并明确失败时是否真的发出请求、是否处于冷却，不能把“没请求”报成接口失败。

## 6. 官网机制和实现参考

已阅读的官方静态脚本：

`https://static.max-c.com/static/heybox/webapp/@heybox-spa/website/app/index-D8cQgNXx.js`

官网初始化要点：

- SDK：`https://static.portal101.cn/dist/web/v3.0.0/fp.min.js`。
- `window.SMSdk.getDeviceId()` 返回 B 开头、长度89时直接使用；D 开头则通过 `/rc/box_data/callback` 换令牌。
- 设置 `x_xhh_tokenid` Cookie，域 xiaoheihe.cn；客户端 Cookie 期限336小时**不等于服务端保证有效14天**。
- `window.setXHHTokenID()` 是初始化后的 SDK 刷新函数；避免把它的返回值打印到日志。
- Vue `#app.__vue_app__.config.globalProperties.$hbRequest` 存在，包含 `get/post/$get/$post` 等方法。
- 官方遇 `lack_token` 可刷新 SDK；`show_captcha` 会要求人工验证。没有代答/自动解决验证码。
- 官网详情路径 `/bbs/app/link/tree`，参数名：`_time,app,client_type,hkey,index,is_first,limit,link_id,nonce,os_type,owner_only,page,version,web_version,x_app,x_client_type,x_client_version,x_os_type`。
- 公共参数和 SDK 公开配置可从官网获得；不要硬编码他人 App 的令牌/设备身份，不需要用户账号。

相关官方文档：

- `https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md`
- `https://playwright.dev/docs/browsers`
- `https://developer.android.com/privacy-and-security/security-config`

## 7. Oracle 已有隔离诊断环境

目录：`/home/ubuntu/.cache/heybox-guest-diagnostic`，不是生产目录。

- Playwright 1.64.0；1.65.0 当天发布，被 Deno 默认依赖年龄策略拒绝，因此没有关闭该安全策略。
- 浏览器：`browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`。
- 独立 DENO_DIR：`deno/`。
- 运行库：`deps/usr/lib/x86_64-linux-gnu`，从 Ubuntu 官方 deb 下载后只在临时目录解包，没有安装系统软件包。
- `candidate/src/` 是上面候选代码的隔离副本；`probe.ts` 最后一次是原始短探针。其结果如上，不要误以为它指向正式候选持续测试。
- `browser.apparmor`、`run-probe.sh`、`prepare-libraries.sh` 是临时工具；按后续是否仍使用清理，不留档堆积。

Ubuntu 开启 `apparmor_restrict_unprivileged_userns=1`。最初浏览器因没有可用沙箱启动失败；没有用 `--no-sandbox`。用户后来明确授权仅对此可执行文件临时放开 userns，结束后卸载：

```text
abi <abi/4.0>,
include <tunables/global>
profile codex-heybox-guest-probe /home/ubuntu/.cache/heybox-guest-diagnostic/browsers/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell flags=(unconfined) {
  userns,
}
```

这是对指定程序选择性放开系统限制，不能描述为“完全没改变安全权限”。全局限制、浏览器沙箱和 TLS 校验保持开启。

`run-probe.sh` 先由 root 加载该 profile，然后 `runuser -u ubuntu` 运行 Deno，并仅对子进程传入 DENO_DIR、PLAYWRIGHT_BROWSERS_PATH、LD_LIBRARY_PATH。systemd 的 ExecStopPost 卸载同一 profile，所有浏览器 PID 的 cgroup 曾实际核对都在受限服务内。

此前批准的单次运行限制：384 MiB、CPU30%、最多120秒、TasksMax128、PrivateTmp，浏览器自己设置 `chromiumSandbox:true`。

短探针运行方式参考（必须先确认没有运行中的同名服务，不要直接覆盖正在工作的诊断）：

```sh
sudo systemd-run --wait --pipe --collect \
  --unit=heybox-guest-browser-probe \
  --property=MemoryMax=384M --property=MemorySwapMax=0 \
  --property=CPUQuota=30% --property=RuntimeMaxSec=120 \
  --property=TasksMax=128 --property=PrivateTmp=yes \
  --property='ExecStopPost=/usr/sbin/apparmor_parser --remove --skip-cache /home/ubuntu/.cache/heybox-guest-diagnostic/browser.apparmor' \
  /bin/sh /home/ubuntu/.cache/heybox-guest-diagnostic/run-probe.sh
```

每次结束核对 profile 不存在、浏览器退出、正式服务 active。不要把安装包/缓存准备和生产配置修改混在一个命令里。

## 8. 后续推进建议（按证据调整，不机械照做）

1. 选择远端 fix/heybox-anonymous-web-session 分支，读取已提交的候选代码、当前 dev 和最新并发变更，验证远端实际版本。
2. 若有已配置的 Oracle 访问能力，先检查当前生产状态与隔离环境；没有访问能力则不假装可以远程操作。
3. 重点验证同一匿名会话的连续性、SDK 真正完成与 Cookie 可用的关系。不要一直新建浏览器、新设备或更换出口。若需要保持会话，保存在隔离进程内存，不落盘、不导入生产。
4. 已准备的持续验证设计：同一进程在第0、5、15、25分钟读取上述两帖；初始化次数计数；遇验证码严格按15分钟冷却；无业务数据库/通知；资源仍384MiB/30%CPU；browser单次初始化最多45秒；总进程最长30分钟并卸载临时profile。此前对此追加时限的提问**尚未得到单独回答**，之后用户要求云端自主继续、不问确认。不要把未回答记录伪造成“已明确同意30分钟”；根据当前有效指令/环境审批执行可执行范围，遇安全策略阻止不绕过。
5. 持续对照若通过，再验证真实返回经现有解析器得到完整正文、评论、匹配正确、Deno 不被无谓调用、失败不污染完整记录。若仍失败，继续找差异，不能仅写退避逻辑就称长期修复。
6. 方案成立后补齐独立服务的安装/沙箱权限/资源/健康/安全退出/升级回滚/配置预检、CI 和面向部署者的文档。正式使用需独立系统用户和新匿名会话，不复制测试令牌；绝不依赖用户电脑或 MuMu 长期开着。
7. 测试覆盖冷启动、令牌缺失/过期、上游429/验证码、初始化失败、并发去重、总预算、Deno回退、错误不会输出凭据、独立服务崩溃不会拖死主应用。全量检查通过后再次对照用户原始目标。
8. 仅在有实际证据时报告稳定性改善；有限时长验证不能保证第三方永远不要求验证码。给出真实成功率/延迟/初始化次数/备用用量及限制，不能空口保证。
9. 用户睡觉期间不向用户发确认问题。缺失权限/凭据或有效发布授权时继续其它工作，保留可评审成果，最终明确未完成项和原因，不擅自发布。

## 9. 已结束的 MuMu 工作及清理限制

真实用户 MuMu 实例0未 root、未安装系统证书、未修改信任，网络代理/ADB reverse均恢复。新建隔离实例1已经退出并删除，目录确认不存在。两个本地 mitmproxy 均停止；Oracle `heybox-anonymous-api-diagnostic` 临时代理停止、18765不监听，脚本删除；SSH转发关闭。用户电脑现在可以关机。

以下本地清理被自动审批拒绝，理由仅 `blocked by policy`，没有更多说明。未换工具重试；不要删除父目录绕过：

- `临时文件/heybox-apk-inspect/diagnostic-ca`（仅隔离实例曾信任，实例已经删除；电脑/生产/原模拟器不信任）。
- 同目录 `jadx`、`proxy-venv`、`python-runtime`、`uv-cache` 的递归清理。
- 旧 `临时文件/小黑盒出口对照隧道.ts`、`小黑盒出口对照-自动恢复.ps1`、`小黑盒出口对照-自动恢复.ts`、`小黑盒出口对照-ssh.pid`、`小黑盒出口对照-恢复.pid` 的清理。

已有单文件 APK/DEX/Java源码、原始日志等大部分成功清理。上述残留在已关机的用户电脑，不是云端任务可访问的文件。不要宣称它们都已删除。若最终仍需报告，简短说明自动审批拒绝了指定诊断残留清理，原因只有 blocked by policy。

## 10. 代码提交与临时交接文档清理

候选代码提交：`3052fe4de5a3cfe77389dc138422207f34722cb0`。代码已在分支中，不保留重复补丁。用户本次明确要求把本交接文档临时提交到仓库根目录并上传远端，这是针对本文件的规则例外；其它分析、提案仍只放被忽略的临时目录。云端读取后在后续正常提交中删除本文件，最终用户文档不保留临时交接材料；不要为删除已推送文件而改写远端历史。

## 11. 隔离验证脚本源码

以下为已准备的验证工具，必须按上文的授权边界、资源限制和凭据可用性使用，不是生产入口。恢复文件时调整相对 import 路径；持续验证脚本从仓库的 临时文件/ 执行即可。

### 11.1 同一内存会话持续验证（尚未运行）

```typescript
/** @file 在隔离进程内持续复用同一匿名会话，仅检查已知公开帖，不接业务数据库或通知。 */
import { createGuestBrowser } from "../src/services/heybox_guest_browser.ts";
import { createGuestDetailFetch } from "../src/services/heybox_guest_session.ts";
import { createHeyboxTopicSource } from "../src/services/heybox_topic_source.ts";

/** 全程仅保留在内存的匿名会话。 */
const guest = createGuestBrowser();
/** 匿名初始化次数，不含任何身份或令牌值。 */
let initializations = 0;
/** 最长二十五分钟的四个预定检查时点。 */
const checkpoints = [0, 5, 15, 25];
/** 检查起点，用于保持低频率及记录耗时。 */
const start = Date.now();
/** 只使用用户已经提供的两条公开帖。 */
const posts = [["77af72c7cfe3", "我录制还没开呢"], ["adea72c544f5", "这里怎么通过"]];
/** 实际项目解析器和会话传输，不启用其它出口。 */
const source = createHeyboxTopicSource({ fetchDetail: createGuestDetailFetch({
  initialize: async (id) => {
    initializations++;
    return await guest.initialize(id);
  },
}) });
try {
  for (let index = 0; index < checkpoints.length; index++) {
    const delay = Math.max(0, start + checkpoints[index] * 60000 - Date.now());
    await new Promise((resolve) => setTimeout(resolve, delay));
    const remaining = source.detailRetryAfter?.() ?? 0;
    if (remaining > 0) {
      console.log(JSON.stringify({ event: "guest_soak_deferred", minute: checkpoints[index], cooldownSeconds: remaining, initializations }));
      continue;
    }
    const [id, expected] = posts[index % posts.length];
    const started = Date.now();
    const result = await source.getPostDetails!({ id, title: "", body: "", excerpt: "", comments: [], commentReplies: [], publishedAt: "", url: `https://www.xiaoheihe.cn/app/bbs/link/${id}` });
    console.log(JSON.stringify({ event: "guest_soak_detail", minute: checkpoints[index], complete: result.detailsComplete, expectedText: (result.title + result.body).includes(expected), elapsedMs: Date.now() - started, memoryRssMiB: Math.ceil(Deno.memoryUsage().rss / 1048576), initializations }));
  }
} finally {
  await guest.close();
}

```

### 11.2 原始短探针（曾成功，最后重跑也出现验证码）

在隔离目录同级放置项目纯模块 heybox_signer.ts，或调整 import。原始脚本中的 secondPostResult 只有前一浏览器请求成功才执行，缺失不能解读为第二帖失败。

```typescript
/** @file 在独立无头浏览器中验证官网匿名初始化，只输出状态与长度，不读取生产环境。 */
import { chromium } from "npm:playwright@1.64.0";
import { buildAppHkey, buildHkey, createHeyboxSignatureParams } from "./heybox_signer.ts";

/** 已由用户提供并核对的公开帖子地址。 */
const targetUrl = "https://www.xiaoheihe.cn/app/bbs/link/77af72c7cfe3";
/** 总时限；外部还应通过独立服务限制资源及清理进程组。 */
const timeoutMs = 90000;
/** 当前诊断阶段，用于脱敏错误定位。 */
let stage = "launch";
/** 当前浏览器仅用于此次匿名验证。 */
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
/** 不含令牌值和响应正文的网络结果。 */
const observations: Record<string, unknown>[] = [];
/** 等待异步响应解析完成，避免丢失已收到的结果。 */
const pending = new Set<Promise<void>>();

/**
 * 执行单个匿名网页验证并确保浏览器关闭。
 * @return {Promise<void>} 浏览器清理完成。
 */
async function main(): Promise<void> {
  const expiry = setTimeout(() => {
    stage = "expired";
    void browser?.close();
  }, timeoutMs);
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 20000 });
    const context = await browser.newContext();
    const page = await context.newPage();
    let initialDetailUrl: string | undefined;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname.endsWith(".xiaoheihe.cn") && url.pathname.includes("/bbs/app/link/tree")) {
        initialDetailUrl ??= request.url();
      }
    });
    page.on("response", (response) => {
      const task = inspectResponse(response);
      pending.add(task);
      void task.finally(() => pending.delete(task));
    });
    stage = "navigation";
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    stage = "anonymous_initialization";
    try {
      await page.getByText("我录制还没开呢").first().waitFor({ state: "visible", timeout: 20000 });
    } catch {
      // 网站可能要求交互验证；只记录实际响应，不自动处理验证码。
    }
    await Promise.allSettled([...pending]);
    const cookies = await context.cookies("https://www.xiaoheihe.cn");
    const deviceCookiePresent = cookies.some((cookie) => cookie.name === "x_xhh_tokenid" && cookie.value.length > 0);
    const visibleTextMatches = await page.locator("body").innerText()
      .then((text) => text.includes("我录制还没开呢"), () => false);
    const detailRequests = observations.filter((item) => typeof item.path === "string" && item.path.includes("/bbs/app/link/tree"));
    let initializedRequestResult: Record<string, unknown> | undefined;
    let signatureCompatibility: Record<string, unknown> | undefined;
    let secondPostResult: Record<string, unknown> | undefined;
    if (deviceCookiePresent && initialDetailUrl && !visibleTextMatches && detailRequests.length > 0 && detailRequests.every((item) => item.deviceCookieInRequest === false)) {
      stage = "initialized_request";
      initializedRequestResult = await page.evaluate(async (url) => {
        try {
          const response = await fetch(url, {
            credentials: "include",
            headers: { accept: "application/json, text/plain, */*" },
            signal: AbortSignal.timeout(20000),
          });
          const payload = await response.json();
          const text = typeof payload?.result?.link?.text === "string" ? payload.result.link.text : "";
          return {
            httpStatus: response.status,
            status: ["ok", "failed", "show_captcha", "lack_token"].includes(payload?.status) ? payload.status : "other",
            textChars: text.length,
            matchesExpectedText: text.includes("我录制还没开呢"),
          };
        } catch (error) {
          return { errorType: error instanceof Error ? error.name : "unknown" };
        }
      }, initialDetailUrl);
      await Promise.allSettled([...pending]);
    }
    if (deviceCookiePresent && initialDetailUrl) {
      const source = new URL(initialDetailUrl);
      const time = Number(source.searchParams.get("_time"));
      const nonce = source.searchParams.get("nonce") ?? "";
      const hkey = source.searchParams.get("hkey");
      const appMatches = buildAppHkey(source.pathname, time, nonce) === hkey;
      const webMatches = buildHkey(source.pathname, time, nonce) === hkey;
      signatureCompatibility = { appMatches, webMatches, parameterNames: [...source.searchParams.keys()].sort() };
      if (initializedRequestResult?.status === "ok" && (appMatches || webMatches)) {
        stage = "second_public_post";
        const signature = createHeyboxSignatureParams(source.pathname, new Date(), Math.random, webMatches ? "web" : "app");
        source.searchParams.set("link_id", "adea72c544f5");
        source.searchParams.set("_time", String(signature.time));
        source.searchParams.set("nonce", signature.nonce);
        source.searchParams.set("hkey", signature.hkey);
        const userAgent = await page.evaluate(() => navigator.userAgent);
        const sessionCookies = await context.cookies(source.origin);
        const cookieHeader = sessionCookies.filter((cookie) => cookie.name === "x_xhh_tokenid").map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
        await browser.close();
        browser = undefined;
        secondPostResult = await (async () => {
          const response = await fetch(source, { headers: { accept: "application/json, text/plain, */*", cookie: cookieHeader, "user-agent": userAgent, referer: targetUrl, origin: "https://www.xiaoheihe.cn" }, redirect: "error", signal: AbortSignal.timeout(15000) });
          const payload = await response.json();
          const link = payload?.result?.link;
          return {
            httpStatus: response.status,
            status: ["ok", "failed", "show_captcha", "lack_token"].includes(payload?.status) ? payload.status : "other",
            textChars: typeof link?.text === "string" ? link.text.length : 0,
            titleMatchesExpected: typeof link?.title === "string" && link.title.includes("这里怎么通过"),
          };
        })();
        await Promise.allSettled([...pending]);
      }
    }
    const officialClient = await page.evaluate("(() => { const p = document.querySelector('#app')?.__vue_app__?.config?.globalProperties; const client=p?.$hbRequest; return { present: !!client, methods: client ? Object.keys(client).filter(k=>typeof client[k] === 'function') : [] }; })()").catch(() => ({ present: false }));
    console.log(JSON.stringify({
      event: "anonymous_probe",
      deviceCookiePresent,
      initializedRequestResult,
      signatureCompatibility,
      secondPostResult,
      officialClient,
      visibleTextMatches,
      observations,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      event: "probe_failed", stage,
      errorType: error instanceof Error ? error.name : "unknown",
      launchMessage: stage === "launch" && error instanceof Error ? error.message.slice(0, 3000) : undefined,
      observations,
    }));
    Deno.exitCode = 1;
  } finally {
    clearTimeout(expiry);
    await browser?.close().catch(() => {});
  }
}

/**
 * 摘要目标接口响应，不输出 URL 参数、Cookie 或正文。
 * @param {import("playwright").Response} response 官网触发的网络响应。
 * @return {Promise<void>} 摘要完成。
 */
async function inspectResponse(response: import("npm:playwright@1.64.0").Response): Promise<void> {
  try {
    const url = new URL(response.url());
    if (!url.hostname.endsWith(".xiaoheihe.cn")) return;
    if (!url.pathname.includes("/bbs/app/link/tree") && url.pathname !== "/rc/box_data/callback") return;
    const payload = await response.json();
    const headers = await response.request().allHeaders();
    const statuses = ["ok", "failed", "show_captcha", "lack_token"];
    const link = payload?.result?.link;
    observations.push({
      path: url.pathname,
      httpStatus: response.status(),
      deviceCookieInRequest: /(?:^|;\s*)x_xhh_tokenid=/.test(headers.cookie ?? ""),
      status: statuses.includes(payload?.status) ? payload.status : "other",
      detailObjectPresent: !!link && typeof link === "object",
      textChars: typeof link?.text === "string" ? link.text.length : 0,
    });
  } catch {
    observations.push({ event: "response_unavailable" });
  }
}

await main();

```
