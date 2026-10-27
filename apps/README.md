# Windows 与 Android 应用

应用共用现有账号、界面、离线队列和全部彩蛋。Windows 使用 Electron；Android 使用系统 WebView 和 AndroidX WebKit，不依赖 Google Play Services。服务器继续执行小黑盒抓取和匹配。

## 构建

先部署支持 `/api/sync`、`/api/native/notifications` 和 `/auth/native` 的服务端。应用来源固定在 `desktop/config.json` 与 `android/app/build.gradle`；正式构建应使用同一个 HTTPS 站点。

- Windows：进入 `apps/desktop`，运行 `npm ci`、`npm test`、`npm run dist`。开发运行先执行 `npm run prepare:assets`，再 `npm start`。`HEYBOX_PREVIEW_ORIGIN` 只在未打包开发运行中生效，只允许 HTTPS 或 HTTP 回环地址。
- Android：安装 JDK 17、Gradle 8.13、Android SDK 36，运行 `node apps/scripts/prepare-assets.mjs --android`，再运行 `gradle -p apps/android testDebugUnitTest lintDebug assembleDebug`。正式构建设置 `APP_VERSION`、递增的 `APP_VERSION_CODE`，以及 `ANDROID_KEYSTORE`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` 四个签名变量，运行 `assembleRelease`。Windows 下路径过长时可用临时 `subst` 盘符指向仓库和本地工具链，构建后取消映射，不移动项目。
- `app-build.yml` 只手动运行并保存构建产物，不自动发布 Release。Windows 正式安装包必须配置 Authenticode 签名和发布者名称；Android 必须持续使用同一签名证书。

## Release 更新

发行标签使用 `v0.1.0` 形式。将 Windows 安装包、对应 `.blockmap`、`latest.yml` 和 `heybox-topic-notifier-android-universal.apk` 一起放入同一个正式 Release。完整上传后再发布，避免目录先出现而附件仍缺失。

Windows 通过 `electron-updater` 校验下载摘要与签名，用户确认后下载，重启或退出时安装。Android 从 GitHub API 读取 APK 的 SHA-256，校验包名、版本号和与已安装应用相同的签名，再交给系统安装器；系统要求的安装授权与确认必须由用户完成。下载失败、取消或仍运行旧版本都不会清除项目版本红点。

Android 在前台每六小时自动检查，返回前台时也执行节流检查。下载与通知处理使用独立执行队列；正常下载进度会延长桥接等待，页面重建复用同一更新协调器。已下载文件在进程重启后重新核对完整摘要、尺寸、发行版本及签名，校验通过后可继续安装。

## 通知与登录

Windows 在托盘驻留时补取通知；显式退出后不继续运行。Android 已接入系统通知权限、前台补取、荣耀 SDK、账号设备登记和厂商唤醒；消息由系统 JobScheduler 调度补取，网络失败保留重试。厂商消息只含事件标识，帖子正文经过本站账号和会话校验后获取。

通知展示前会再次核验请求期间的账号变化。Android 一次任务连续处理分页积压，达到工作上限后申请系统续跑；权限关闭或展示失败不会确认尚未展示的事件。JVM 单元测试验证消费规则和安装文件完整性，不能替代系统通知、厂商后台唤醒及安装器实机测试。

荣耀配置目前尚未提供，**不能据此承诺进程结束或锁屏后的可靠投递**。在荣耀开发者平台为固定包名和正式签名创建应用，将 `HONOR_PUSH_APP_ID` 同时设置在 Android 构建环境和服务端；`HONOR_PUSH_CLIENT_ID`、`HONOR_PUSH_CLIENT_SECRET` 只设置在服务端。SDK 从清单中的字符串资源读取公开 App ID，不把服务端密钥打入 APK。未配置时不初始化 SDK，界面会提示仅在应用打开时接收。正式启用仍须 HONOR 60 锁屏、重启、网络切换和账号切换实测。

Google 登录使用系统浏览器完成现有认证和 MFA，再通过短时、单次 PKCE 交接进入原生应用。页面和浏览器显示相同配对码。Google 账号的已验证邮箱及用户绑定的密码、邮箱或其它登录方法仍指向同一 userId；不会按相同邮箱擅自合并两个已有账号。

PKCE 交接只在当前权威数据库消费，不复制临时授权状态；数据库切换期间尚未完成的交接需要重新发起。正常登录后的账号会话仍遵循原有持久化与双写规则。

## 离线与数据

首次登录需要联网。设置与已缓存记录操作先加密写入 IndexedDB，再用原始编辑版本同步；在得到明确成功响应前保留队列。不同设置区域独立裁决，相关连接字段成组，较晚编辑获胜。记录删除保留墓碑，后台刷新不会复活删除记录。在线时预取工作区、历史及各自的“全部”视图；断网可管理已缓存记录，未访问且未预取的筛选组合不会伪造结果。内部页面导航、更新和桌面退出会先保存防抖期间及保存过程中新增的设置编辑，等待本地事务；保存失败时保留编辑页。

官方集成参考：[Android 返回导航](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture)、[荣耀 SDK 接入](https://developer.honor.com/cn/docs/11002/guides/intergrate)、[荣耀服务端投递](https://developer.honor.com/cn/docs/11002/guides/cloud-base-api)。荣耀配置未提供前，后台推送验收保持未完成状态。

网页和应用均按账号隔离页面快照；退出后保留加密待同步操作但关闭该账号的离线入口。安全设置、登录、测试通知和抓取服务器数据仍需要联网。安装资源包含整个 `static` 树和原有站点图标，视频与音频支持字节范围读取；不删除或跳过任何彩蛋。离线数据与系统通知仍需经过真实安装包和目标手机验收。
