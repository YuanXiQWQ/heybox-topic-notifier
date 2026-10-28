# Windows 与 Android 应用

应用共用现有账号、界面、离线队列和全部彩蛋。Windows 使用 Electron；Android 使用系统 WebView 和 AndroidX WebKit，不依赖 Google Play Services。服务器继续执行小黑盒抓取和匹配。

Android 的兼容目标是没有 Google Play／GMS 的设备，不限定品牌或型号。构建会检查完整运行依赖树，发现 Google Play Services 或 Firebase 依赖即失败。厂商推送是可选增强，不是安装、登录、离线管理或系统通知的必要条件。

## 构建

先部署支持 `/api/sync`、`/api/native/notifications` 和 `/auth/native` 的服务端。应用来源固定在 `desktop/config.json` 与 `android/app/build.gradle`；正式构建应使用同一个 HTTPS 站点。

- Windows：进入 `apps/desktop`，运行 `npm ci`、`npm test`、`npm run dist`。开发运行先执行 `npm run prepare:assets`，再 `npm start`。`HEYBOX_PREVIEW_ORIGIN` 只在未打包开发运行中生效，只允许 HTTPS 或 HTTP 回环地址。
- Android：安装 JDK 17、Gradle 8.13、Android SDK 36，运行 `node apps/scripts/prepare-assets.mjs --android`，再运行 `gradle -p apps/android testDebugUnitTest lintDebug assembleDebug`。正式构建设置 `APP_VERSION`、递增的 `APP_VERSION_CODE`，以及 `ANDROID_KEYSTORE`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` 四个签名变量，运行 `assembleRelease`。Windows 下路径过长时可用临时 `subst` 盘符指向仓库和本地工具链，构建后取消映射，不移动项目。
- `app-build.yml` 在推送正式版本标签时自动运行，读取标签版本并固定源码提交，执行检查后并行构建 Windows 和 Android；自动创建或复用 Release 草稿，只有两端都成功且全部附件上传后才公开发行。也支持已有 Release 的发布事件。Windows 默认发布未签名 NSIS 安装包，不需要购买证书或配置 Windows 签名 Secrets；Android 使用本机可自行生成的稳定签名证书。
- `app-check.yml` 在涉及应用、静态资源或原生工作流的 PR 和 `main`、`dev` 推送时自动检查，也可手动运行。不需要发行凭据：Windows 执行主进程测试并构建未签名 NSIS；Android 执行 JVM 测试、Lint 和调试 APK 构建。测试包不上传到 Release。
- 两条工作流都会对安装产物中的全部静态资源逐文件校验 SHA-256，并核对资源清单；缺少或损坏任何彩蛋资源都会阻止成功。可本地执行 `node apps/scripts/verify-assets.mjs <解包后的 static 目录>` 重现检查。

Windows 安装目录页直接显示实际目标目录：浏览选择父目录后自动追加 `heybox-topic-notifier`，选中同名应用目录不会重复追加。手动输入父目录并点击安装时，会先补全输入框并留在目录页，再次确认才开始安装；已有安装记录和自动更新沿用原目录。`desktop/installer.nsh` 使用原生 MUI 目录页；`allowToChangeInstallationDirectory: false` 仅关闭 electron-builder 内置的目录页与安装前追加逻辑，目录选择由自定义钩子提供。

## Release 更新

沿用仓库现有的 `3.8.2` 标签格式，也兼容 `v3.8.2`。正式发布时自动生成并上传以下四个附件，无需手工下载 Actions 产物后转传：

- `heybox-topic-notifier-windows-x64-setup.exe`
- `heybox-topic-notifier-windows-x64-setup.exe.blockmap`
- `heybox-topic-notifier-android-universal.apk`
- `latest.yml`（核对版本、尺寸和摘要后最后上传）

Android `versionCode` 自动使用 `major × 1,000,000 + minor × 1,000 + patch + 1`，例如 `3.8.2 → 3008003`。同版本重跑保持相同编码；major 上限为 2099，minor、patch 上限为 999。正式发布后不要改换编码规则或签名密钥。

首次启用前，在仓库 **Settings → Secrets and variables → Actions** 配置：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Secret | `ANDROID_KEYSTORE_BASE64` | 正式 Android keystore 的 Base64 内容 |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| Secret | `ANDROID_KEY_ALIAS` | 签名密钥别名 |
| Secret | `ANDROID_KEY_PASSWORD` | 签名密钥密码 |
| Variable（可选） | `HONOR_PUSH_APP_ID` | 荣耀推送公开应用 ID；未设置时不初始化厂商通道 |

发行使用当前任务的 `GITHUB_TOKEN`，准备草稿与上传 job 获得 `contents: write`，构建 job 保持只读，无需另存个人访问令牌。Android 签名配置缺失、检查失败或任一平台构建失败都会阻止上传和公开草稿；Android 不降级为调试签名。Windows 没有证书不会阻止构建或发布。

本机可运行 `deno run --allow-env --allow-read --allow-write=apps/signing --allow-run scripts/prepare_app_credentials.ts <JDK keytool 路径>`，一次性生成 Android 发行证书及 VAPID 密钥，重跑复用已有凭据。私密文件位于 Git 忽略的 `apps/signing/`，应另行安全备份。`credentials.json` 保存 keystore 密码、别名和 VAPID；Android key 密码与 keystore 密码相同。上传到 Actions 时将 keystore 文件转为 Base64 配置 `ANDROID_KEYSTORE_BASE64`，密码分别填入两个密码 Secret。本地文件生成不等于 GitHub Secrets 或远程部署已经配置。

新版本标签指向的提交必须包含这套工作流与应用源码。推送 `3.9.2` 或 `v3.9.2` 形式的正式标签后，等待 Actions 完成构建、上传和公开 Release，网页下载和客户端更新即可读取完整附件。草稿不会触发 `published`，预发行不会进入正式更新通道；版本解析也拒绝带 beta 等后缀的标签。工作流通过默认 `GITHUB_TOKEN` 公开草稿不会递归触发发布事件。[GitHub 触发规则](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)

手动触发可为已有标签补发：选择包含最新发布流程的分支，`tag` 填已有标签（例如 `3.9.1`），开启 `upload` 和 `publish`，便会创建草稿、按该标签的源码构建、上传并公开。`upload` 关闭时仅生成 Actions 产物；关闭 `publish` 可以只上传而保留草稿。已有标签不会因为工作流变更自动重放推送事件，无需删除或移动标签。发行脚本使用所选工作流的提交，两个安装包始终使用标签锁定的源码提交。上传中断后优先重跑失败的上传 job，复用原构建产物；同摘要附件会跳过，空的未完成上传会清理后重试，内容不同的同名附件不会覆盖。

如果仓库启用了不可变 Release，标签触发流程会先上传完整附件再公开草稿；也可使用手动工作流执行相同流程。已锁定且附件齐全的发布事件会跳过重复构建，缺失附件则明确失败。GitHub 不允许在不可变 Release 发布后追加附件。[GitHub 不可变发行说明](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)

Windows 通过固定 GitHub 仓库的 HTTPS 更新源和 `electron-updater` 校验下载的 SHA-512 摘要。每次启动均自动检查，版本号后的“检查更新”可手动触发；设备“自动更新”开关默认关闭。关闭时由用户确认下载和安装；开启后后台下载，正常退出时安装，启动时可校验并接续安装已完整下载的包。自动处理期间隐藏更新红点，失败时恢复人工提示；关闭自动更新也会取消未获手动确认的自动安装。不要求 Authenticode 证书；摘要校验验证文件与发行清单一致，不代表受信任的发布者身份认证。未签名安装包可能显示 Windows 安全提示或受设备策略限制。Android 从 GitHub API 读取 APK 的 SHA-256，校验包名、版本号和与已安装应用相同的签名，再交给系统安装器；系统要求的安装授权与确认必须由用户完成。手动更新模式下，下载失败、取消或仍运行旧版本都不会清除项目版本红点。

Android 在前台每六小时自动检查，返回前台时也执行节流检查。下载与通知处理使用独立执行队列；正常下载进度会延长桥接等待，页面重建复用同一更新协调器。已下载文件在进程重启后重新核对完整摘要、尺寸、发行版本及签名，校验通过后可继续安装。

## 通知与登录

Windows 在运行或最小化时补取通知；显式退出后不继续运行。Android 从可见应用启动低优先级常驻前台服务，每轮结束后约十五秒补取通知和工作区计数；前台服务使用 `specialUse` 类型并在清单说明持续通知监听用途。应用没有 Google 或厂商配置也能使用此通道。系统 JobScheduler 的十五分钟周期任务保留为补偿；系统强停、厂商省电及通知权限仍会影响实际运行。可选厂商唤醒只含事件标识，帖子正文经过本站账号和会话校验后获取。

通知展示前会再次核验请求期间的账号变化。Android 一次任务连续处理分页积压，达到工作上限后申请系统续跑；权限关闭或展示失败不会确认尚未展示的事件。JVM 单元测试验证消费规则和安装文件完整性，不能替代系统通知、厂商后台唤醒及安装器实机测试。

Windows 等待系统的通知展示事件后才推进消费游标，失败或超时保留重试。托盘和原生通知跳转、Android 返回及退到后台均等待设置保存；保存失败保留编辑页，通知跳转在保存后复核账号。浏览器通知点击再次核验账号和设备开关，仅聚焦已有目标页面或新开页面，不强制导航正在编辑的标签页。Android 登录请求复用统一桥接；独立认证页的登录分发器会转交其它消息并在结束后恢复。

荣耀推送仅为可选加速通道，不作为通用 Android 交付前置。若选择启用，在荣耀开发者平台为固定包名和正式签名创建应用，将 `HONOR_PUSH_APP_ID` 同时设置在 Android 构建环境和服务端；`HONOR_PUSH_CLIENT_ID`、`HONOR_PUSH_CLIENT_SECRET` 只设置在服务端。SDK 从清单读取公开 App ID，未配置时不初始化。没有厂商通道时使用常驻服务；若系统不允许服务启动，则退回周期任务并提示后台通知可能延迟。

Google 登录使用系统浏览器完成现有认证和 MFA，再通过短时、单次 PKCE 交接进入原生应用。页面和浏览器显示相同配对码。Google 账号的已验证邮箱及用户绑定的密码、邮箱或其它登录方法仍指向同一 userId；不会按相同邮箱擅自合并两个已有账号。

PKCE 交接只在当前权威数据库消费，不复制临时授权状态；数据库切换期间尚未完成的交接需要重新发起。正常登录后的账号会话仍遵循原有持久化与双写规则。

## 离线与数据

首次登录需要联网。设置与已缓存记录操作先加密写入 IndexedDB，再用原始编辑版本同步；在得到明确成功响应前保留队列。不同设置区域独立裁决，相关连接字段成组，较晚编辑获胜。记录删除保留墓碑，后台刷新不会复活删除记录。在线时预取工作区、历史及各自的“全部”视图；断网可管理已缓存记录，未访问且未预取的筛选组合不会伪造结果。内部页面导航、更新和桌面退出会先保存防抖期间及保存过程中新增的设置编辑，等待本地事务；保存失败时保留编辑页。

官方集成参考：[Android 返回导航](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture)、[系统周期任务](https://developer.android.com/reference/android/app/job/JobInfo.Builder#setPeriodic(long))、[可选荣耀 SDK 接入](https://developer.honor.com/cn/docs/11002/guides/intergrate)。系统任务的执行延迟和用户强制停止行为须如实验证，不能将定期补取描述为实时推送。

网页和应用均按账号隔离页面快照；退出后保留加密待同步操作但关闭该账号的离线入口。安全设置、登录、测试通知和抓取服务器数据仍需要联网。安装资源包含整个 `static` 树和原有站点图标，视频与音频支持字节范围读取；不删除或跳过任何彩蛋。离线数据与系统通知仍需经过真实安装包和目标手机验收。

## 本设备设置与统一测试

Windows 全局设置提供关闭窗口时的圆形单选项（默认最小化到任务栏，可改为退出）、开机自启、自动更新及恢复默认窗口大小。任务栏快捷任务和托盘菜单均包含工作区、设置、历史及退出。设备偏好保存在本机，不同步到其他设备；旧安装包未提供对应能力时隐藏新控件。

Windows 点击「重启并更新」会在保存本地编辑后静默升级并重新打开应用，沿用已有安装目录和安装范围，不重复显示安装向导。安装到所有用户时，Windows 仍可能要求管理员授权。

通知卡片底部的测试条按当前页面的应用通知开关与其它通知选择独立发送，等待所有已开启通道完成后反馈；失败详情仍可查看。测试通知不创建业务帖子、不增加工作区数量。该操作需要联网。

Android 图标角标使用工作区未确认帖子的去重数量，账号切换立即清空旧计数，网络失败保留同账号最近值。独立的角标开关不启用新命中提醒；常驻低优先级通知承载角标数量，新命中渠道不累加角标。系统桌面决定数字或圆点的呈现，并受系统角标和通知权限控制。离线确认、恢复和删除记录会立即投影到本机角标，按帖子去重；加密快照支持断网重启。联网后使用服务器工作区重新校准，较早网络响应不会覆盖更新的本机操作。

## 下载中断与缓存

完整下载会验证摘要；Android 还验证尺寸、包名、版本和已安装应用的签名。重新启动时检查残留缓存，安装前再次校验完整包。无有效检查点的孤立文件、截断包和损坏包会清理；通过摘要验证的下载前缀与完整包保留。强制中断中尚未提交的尾部会截去；清理只涉及应用专属更新缓存。

Windows 正常退出前先保存离线编辑，再暂停下载并等待文件和检查点落盘；Android 窗口真正结束时暂停传输，页面重建或退到后台不视为退出。下次启动验证前缀摘要后通过 HTTP Range 继续已确认的下载；Windows 手动下载还会重新匹配官方发行摘要。服务器忽略 Range 时从头下载，范围错误、包摘要变化或前缀损坏时丢弃不适用残片，后续重试完整下载。安装前仍校验完整包；续传不会跳过签名或完整性检查。
