# Windows 与 Android 应用

应用共用现有账号、界面、离线队列和全部彩蛋。Windows 使用 Electron；Android 使用系统 WebView 和 AndroidX WebKit，不依赖 Google Play Services。服务器继续执行小黑盒抓取和匹配。

## 构建

先部署支持 `/api/sync`、`/api/native/notifications` 和 `/auth/native` 的服务端。应用来源固定在 `desktop/config.json` 与 `android/app/build.gradle`；正式构建应使用同一个 HTTPS 站点。

- Windows：进入 `apps/desktop`，运行 `npm ci`、`npm test`、`npm run dist`。开发运行先执行 `npm run prepare:assets`，再 `npm start`。`HEYBOX_PREVIEW_ORIGIN` 只在未打包开发运行中生效，只允许 HTTPS 或 HTTP 回环地址。
- Android：安装 JDK 17、Gradle 8.13、Android SDK 36，运行 `node apps/scripts/prepare-assets.mjs --android`，再运行 `gradle -p apps/android testDebugUnitTest lintDebug assembleDebug`。正式构建设置 `APP_VERSION`、递增的 `APP_VERSION_CODE`，以及 `ANDROID_KEYSTORE`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` 四个签名变量，运行 `assembleRelease`。Windows 下路径过长时可用临时 `subst` 盘符指向仓库和本地工具链，构建后取消映射，不移动项目。
- `app-build.yml` 在正式 Release 发布时自动运行，读取标签版本并固定源码提交，执行检查后并行构建 Windows 和 Android；只有两端都成功才上传附件。Windows 正式安装包必须配置 Authenticode 签名和发布者名称；Android 必须持续使用同一签名证书。
- `app-check.yml` 在涉及应用、静态资源或原生工作流的 PR 和 `main`、`dev` 推送时自动检查，也可手动运行。不需要发行凭据：Windows 执行主进程测试并构建未签名 NSIS；Android 执行 JVM 测试、Lint 和调试 APK 构建。测试包不上传到 Release。
- 两条工作流都会对安装产物中的全部静态资源逐文件校验 SHA-256，并核对资源清单；缺少或损坏任何彩蛋资源都会阻止成功。可本地执行 `node apps/scripts/verify-assets.mjs <解包后的 static 目录>` 重现检查。

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
| Secret | `WINDOWS_CSC_LINK` | electron-builder 支持的 Windows 签名证书配置 |
| Secret | `WINDOWS_CSC_KEY_PASSWORD` | Windows 证书密码 |
| Variable | `WINDOWS_PUBLISHER_NAME` | 证书中的发布者名称 |
| Secret | `ANDROID_KEYSTORE_BASE64` | 正式 Android keystore 的 Base64 内容 |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| Secret | `ANDROID_KEY_ALIAS` | 签名密钥别名 |
| Secret | `ANDROID_KEY_PASSWORD` | 签名密钥密码 |
| Variable（可选） | `HONOR_PUSH_APP_ID` | 荣耀推送公开应用 ID；未设置时不初始化厂商通道 |

上传使用当前任务的 `GITHUB_TOKEN`，仅上传 job 获得 `contents: write`，无需另存个人访问令牌。配置缺失、检查失败或任一平台构建失败都会阻止上传；正式流程不会降级为调试签名。

标签指向的提交必须包含这套工作流与应用源码。发布正式 Release 后等待 Actions 成功，网页下载和客户端更新才具备完整附件；草稿不会触发 `published`，预发行不会进入正式更新通道。使用默认 `GITHUB_TOKEN` 在其它工作流中创建 Release 不会触发这条发布事件，此时应显式调用本工作流的 `workflow_dispatch`，传入 `tag` 和 `upload: true`。[GitHub 触发规则](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)

手动触发仍可用于排错：`tag` 填已有标签，`upload` 关闭时仅生成 Actions 产物，开启时上传到该标签已有的草稿或正式 Release。上传中断后优先重跑失败的上传 job，复用原构建产物；同摘要附件会跳过，空的未完成上传会清理后重试，内容不同的同名附件不会覆盖。

如果仓库启用了不可变 Release，必须先创建草稿，通过手动工作流上传完整附件再发布；已锁定且附件齐全的发布事件会跳过重复构建，缺失附件则明确失败。GitHub 不允许在不可变 Release 发布后追加附件。[GitHub 不可变发行说明](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)

Windows 通过 `electron-updater` 校验下载摘要与签名，用户确认后下载，重启或退出时安装。Android 从 GitHub API 读取 APK 的 SHA-256，校验包名、版本号和与已安装应用相同的签名，再交给系统安装器；系统要求的安装授权与确认必须由用户完成。下载失败、取消或仍运行旧版本都不会清除项目版本红点。

Android 在前台每六小时自动检查，返回前台时也执行节流检查。下载与通知处理使用独立执行队列；正常下载进度会延长桥接等待，页面重建复用同一更新协调器。已下载文件在进程重启后重新核对完整摘要、尺寸、发行版本及签名，校验通过后可继续安装。

## 通知与登录

Windows 在托盘驻留时补取通知；显式退出后不继续运行。Android 已接入系统通知权限、前台补取、荣耀 SDK、账号设备登记和厂商唤醒；消息由系统 JobScheduler 调度补取，网络失败保留重试。厂商消息只含事件标识，帖子正文经过本站账号和会话校验后获取。

通知展示前会再次核验请求期间的账号变化。Android 一次任务连续处理分页积压，达到工作上限后申请系统续跑；权限关闭或展示失败不会确认尚未展示的事件。JVM 单元测试验证消费规则和安装文件完整性，不能替代系统通知、厂商后台唤醒及安装器实机测试。

Windows 等待系统的通知展示事件后才推进消费游标，失败或超时保留重试。托盘和原生通知跳转、Android 返回及退到后台均等待设置保存；保存失败保留编辑页，通知跳转在保存后复核账号。浏览器通知点击再次核验账号和设备开关，仅聚焦已有目标页面或新开页面，不强制导航正在编辑的标签页。Android 登录请求复用统一桥接；独立认证页的登录分发器会转交其它消息并在结束后恢复。

荣耀配置目前尚未提供，**不能据此承诺进程结束或锁屏后的可靠投递**。在荣耀开发者平台为固定包名和正式签名创建应用，将 `HONOR_PUSH_APP_ID` 同时设置在 Android 构建环境和服务端；`HONOR_PUSH_CLIENT_ID`、`HONOR_PUSH_CLIENT_SECRET` 只设置在服务端。SDK 从清单中的字符串资源读取公开 App ID，不把服务端密钥打入 APK。未配置时不初始化 SDK，界面会提示仅在应用打开时接收。正式启用仍须 HONOR 60 锁屏、重启、网络切换和账号切换实测。

Google 登录使用系统浏览器完成现有认证和 MFA，再通过短时、单次 PKCE 交接进入原生应用。页面和浏览器显示相同配对码。Google 账号的已验证邮箱及用户绑定的密码、邮箱或其它登录方法仍指向同一 userId；不会按相同邮箱擅自合并两个已有账号。

PKCE 交接只在当前权威数据库消费，不复制临时授权状态；数据库切换期间尚未完成的交接需要重新发起。正常登录后的账号会话仍遵循原有持久化与双写规则。

## 离线与数据

首次登录需要联网。设置与已缓存记录操作先加密写入 IndexedDB，再用原始编辑版本同步；在得到明确成功响应前保留队列。不同设置区域独立裁决，相关连接字段成组，较晚编辑获胜。记录删除保留墓碑，后台刷新不会复活删除记录。在线时预取工作区、历史及各自的“全部”视图；断网可管理已缓存记录，未访问且未预取的筛选组合不会伪造结果。内部页面导航、更新和桌面退出会先保存防抖期间及保存过程中新增的设置编辑，等待本地事务；保存失败时保留编辑页。

官方集成参考：[Android 返回导航](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture)、[荣耀 SDK 接入](https://developer.honor.com/cn/docs/11002/guides/intergrate)、[荣耀服务端投递](https://developer.honor.com/cn/docs/11002/guides/cloud-base-api)。荣耀配置未提供前，后台推送验收保持未完成状态。

网页和应用均按账号隔离页面快照；退出后保留加密待同步操作但关闭该账号的离线入口。安全设置、登录、测试通知和抓取服务器数据仍需要联网。安装资源包含整个 `static` 树和原有站点图标，视频与音频支持字节范围读取；不删除或跳过任何彩蛋。离线数据与系统通知仍需经过真实安装包和目标手机验收。
