# 小黑盒详情请求的离线核对

核对日期：2026-11-06。本文记录官方 APK 的静态证据及代码修正范围，
不代表真实详情获取已稳定，也不代表已经部署。

## 样本和方法

通过 HTTPS 从官方地址下载：
<https://dl.max-c.com/app/heybox/heybox-release.apk>。
清单包名为 `com.max.xiaoheihe`，版本 `1.3.400`，versionCode `1149`。

| 文件 | SHA-256 |
| --- | --- |
| APK | `ba3fff8f75f0580f1f080df58f270eb8b18b7d5779cf5c4f99e2012fb21fac00` |
| arm64-v8a/libailab.so | `49dbf26636129ebb6f38c2677e87cd6984eb4e947e1a7875a75e9710c864727e` |
| arm64-v8a/libnative-lib.so | `5d8699f237ab12582f3d9b22c23c3edb91f9f65bca3ac1211c36e25fdb069489` |
| arm64-v8a/libglesv3_1.so | `5ff6850b0b682418bf62be178acb481119be042a7297c1f3bdf47666dca86344` |

使用 JADX 1.5.3 阅读相关 DEX 类，使用 ELF 重定位、AArch64 反汇编和
Dalvik 指令解码核对受保护的方法。未安装或运行 APK，未调用 native 库，
未进行设备仿真、真实接口重放或令牌初始化。APK、反编译文件和设备数据不进入仓库。
下列偏移仅对应上述哈希，不能直接用于其他 APK。

## 实际请求签名路径

`com.nmmedit.protect.NativeUtil` 负责加载 `ailab`，不是签名算法本身。
`router.serviceimpl.k` 的静态初始化调用 `classes6Init0(0)`，将原生方法
`b(okhttp3.t$a, String)` 注册为 HTTP 请求参数填充器。

`libailab.so` 中可核对的定位信息：

- `classes6Init0` 位于虚拟地址 `0x20168`；第 0 项类是
  `com/max/xiaoheihe/router/serviceimpl/k`，注册的 `b` 入口是 `0x2028c`。
- 包装器引用 `0x14fcc` 开始的 `0x1bc` 个 16 位指令单元，共 888 字节。
  操作码经过重排，必须按 `vmInterpret` 的 `0x46570` 分发表还原，
  不能直接将这段数据当作普通 DEX 指令。
- 字符串数据始于 `0x13670`，偏移表为 `0x14aa4`；类索引表为 `0x14ee0`，
  方法表为 `0x15344`，方法签名索引表为 `0x158f4`，
  常量字符串重映射表为 `0x15bd0`。类和方法名索引与字符串常量索引不能混用。
- 解码得到的方法在字节偏移 `0x376` 返回，边界覆盖全部 888 字节；
  九个分支的目标均落在合法指令边界上。

普通匿名模式（不含有限访客分支）的调用顺序如下：

1. 取秒级时间；通过 `ShaderManager.getChunkFlag`、`getIdxOffset` 取得 nonce。
   `getIdxOffset` 还接收应用 Context 和 `g1.j()` 的返回值。
2. 将请求路径整理为末尾有一个 `/`，随后按同一 nonce 设置时间、路径、
   `Build.MODEL`、Android 系统版本和 App 版本等 ShaderManager 状态。
3. 缺少既有 `heybox_id` 参数时，未登录用户填 `-1`；已登录用户填账号 ID。
4. 在方法相对偏移 `0x1a0` 调用 `NDKTools.encode(context, path, time, nonce)`，
   **没有读取返回值**。随后在 `0x1ae` 调用
   `ShaderManager.getObjType(context, nonce, false)`，并读取返回值。
5. 在 `0x1ee` 取得 `hkey` 参数名，在 `0x1f6` 将上述 ShaderManager 返回值写入请求。
   nonce、设备信息、系统版本、App 版本、build、时区、渠道等也在此方法中填充。
6. `ShaderManager.f()` 为真时，还生成 `_rnd`，其值由版本标识、冒号以及
   `getObjType(context, nonce, true)` 的结果组成。信息流请求另有 `netmode` 参数。

`utils.j1.e(String)`（WebUtils 的 URL 参数构建）也能直接看到对应的签名路径。
`ShaderManager` 加载的是 `libglesv3_1.so`。继续分析后已重建普通 `hkey` 与 nonce，
以显式选择的 `app-v1149` 模式接入；动态 `_rnd` 和完整原生匿名会话尚未实现。

Retrofit 接口 `network.e.G` 声明了 `bbs/app/link/tree`，包含 `link_id`、
`page`、`limit`、`is_first`、`sort_filter`、`owner_only`、`hide_cy`、
`check_commented` 等参数。声明不证明每次调用都传入这些字段，
也不证明某个分页参数导致或解决验证码。

## build1149 普通签名的进一步还原

使用 Ghidra 11.4.2 静态反编译及只读重定位常量解析定位了全部 27 个 JNI 方法。
以下地址仍是 ELF 虚拟地址，不包含 Ghidra 默认添加的 `0x100000` 镜像基址。
分析中只在反编译项目里将两个已由常量表确定的间接跳转标为等价条件跳转，
以恢复 `0x1d1444` 的函数边界；未修改 APK、加载库或执行目标指令。

| 步骤 | 静态定位与结果 |
| --- | --- |
| 注册 | `JNI_OnLoad`：`0x1cbc10`；27 项 JNI 表：`0x210b40` |
| nonce | `getIdxOffset`：`0x1cb320`；使用秒级时间的 `gmtime`，取 UTC `YYYYMMDD` |
| 日期字符池 | `0x1d3adc` → `0x1d1ee8`；从小写、大写、数字组成的 62 字符表按 `(date + 705 + 7*i) % 62` 取 32 项 |
| 随机抽取 | `0x1d24b8`；从上述池中有放回地抽取 32 次，并追加字符串终止符 |
| 普通签名分支 | `getObjType`：`0x1c8f08`；`false` 分支于 `0x1ca7f4` 开始，拼接路径、时间和 DebugInfo |
| HMAC 输入 | `0x1c522c` 拼接路径和时间，`0x1c53e8` 追加管理器 `+0x90` 的 DebugInfo |
| HMAC | `0x1d3d24` → `0x13f83c`；32 字节 key、128 字节块、64 字节输出，内外填充分别为 `0x36`、`0x5c` |
| SHA-512 | 初始化器 `0x1433c4`，`0x39f40` 为标准 SHA-512 的八个初始常量 |
| CRC | `0x1d1444` → `0x1d1cc4` → `0x1ce408` / `0x1cf794`；对完整 64 字节摘要计算 |
| CRC 参数 | `0x467f0`：poly=`0x05ad2511`，init/xorout=`0xffffffff`，refin/refout 均为 true；反转多项式为 `0x88a4b5a0` |
| 输出 | `0x1d12e4` 解出的格式为 `%X`，大写十六进制且不补前导零 |

`0x1d4144` / `0x1d3768` 从 `0x4658c` 的静态字节解出协议字符串；
HMAC 取其前 32 个 **ASCII 字节**，不能再次按 A–P 半字节编码解码。
`setBlendMode` 使用另一份常量和解码路径，不能混作 HMAC key。
逐位真值表核对了 CRC 的混淆布尔式与异或等价，协议字符串解码也穷举核对了
两个输入字节的全部组合。没有用执行 APK/native 函数的结果充当参考值。

DebugInfo 来自 SharedPreferences `debug_info_config` 的 `DebugInfo` 键。
`HeyBoxApplication.j0()` 在接受隐私协议后，将 `utils.k.a0()` 返回的设备 ID
与已登录用户 ID（匿名时 `-1`）直接拼接，再调用 `com.max.hbcache.f.K()` 写入。
`getObjType` 读取同一键。实现据此将请求中的 `imei` 和 `heybox_id` 用于签名；
这份本地标识并不是 `x_xhh_tokenid`。

普通分支的消息为 `path + seconds + deviceId + heyboxId`，路径保留内部斜杠并确保末尾有 `/`。
nonce 在 native 中是请求状态的索引，没有直接拼入上述 HMAC 消息。
设备型号、系统版本等其他状态进入动态 `_rnd` 分支，不应擅自加入普通签名。

动态代码路径也已核对：`SecurityUtil$getRnd$1` 经 `network.b.f5` 请求
`/account/getui/fix`，读取结果中的 `code`、`version`，对 code 做 Base64 解码后
传入 `ShaderManager.setHdrField`。结果缓存在 MMKV `gles30` 中，网络失败时读取缓存。
`getObjType(..., true)` 调用另一条计算路径；本次没有获取或执行服务端代码。

### 实现与离线验证

新增 `heybox_native_signer.ts`，通过 Web Crypto 计算 HMAC-SHA512，独立计算上述 CRC。
`HEYBOX_SIGNATURE_MODE=app-v1149` 可用于主服务或独立详情服务，默认仍为 `app`。
新模式使用 `1.3.400/1149` 和匿名 `heybox_id=-1`，拒绝与其他版本参数混用。
不会自动启用该模式、生成风控令牌或补造 `_rnd`。

八组合成输入的期望值由独立 Python 标准库 `hmac` / `hashlib` 与**正向** CRC 多项式除法生成，
与 TypeScript 的反向 CRC 实现交叉核对，覆盖路径、时间、设备、用户、长消息及短十六进制输出。
例如路径 `/bbs/app/link/tree/`、时间 `1700000000`、设备
`0123456789abcdef0123456789abcdef`、用户 `-1` 得到 `760E264C`；
时间增加一秒得到 `764D85A`，没有补成八位。
这些是静态推导样例，仍不是当前 App 的真实请求样本。

nonce 测试覆盖 UTC 午夜、带时区的等价时间、闰日和有放回抽取。
集成测试注入本地 mock，验证列表与详情的版本、匿名身份和签名一致，
以及显式用户 ID 和版本冲突处理。真实接口接受率、完整正文/评论覆盖率及长期稳定性尚未验证。

可以在不联系小黑盒的条件下复核：

```sh
python3 scripts/heybox_native_reference.py
deno test --allow-env --allow-read src/services/heybox_native_signer_test.ts src/services/heybox_topic_source_test.ts
deno task check
```

第一条命令重算八组输入的中间摘要与结果；第二条检查数学实现和 mock 请求/解析；
第三条运行项目回归。这三条命令都不能替代真实稳定性验收。

真实验收仍需在允许的观测条件下记录：同一匿名身份在不同时间、冷启动及正常刷新后，
多种帖子（长正文、图片/视频、主评论及回复）是否得到完整详情；统计请求总数、完整成功数、
`hkey` / `lack_token` / `show_captcha`、网络错误及冷却后的恢复情况。
HTTP 200、单次成功或只返回标题/摘要都不算完整成功。必须先确认正确的匿名初始化，
才能区分签名、令牌与出口的影响；不能凭本次离线结果宣称签名差异就是验证码根因。
交接中已被自动审批拒绝的代理、Oracle 隧道和原生请求重放不在本次验证范围内，未重做。

## 匿名身份不是随机设备 ID

`utils.p`（DeviceUuidFactory）包含两条独立的数据路径：

- 普通设备 ID 会优先复用共享账号存储或本地缓存，必要时使用有效 Android ID
  或生成后持久化的 UUID 片段。它与匿名风控令牌不是同一个字段。
- `p.f()` 读取缓存键 `sm_device_id`。`router.serviceimpl.k.a(...)` 仅在该值
  非空时将其附加为 `x_xhh_tokenid` Cookie；令牌不以登录为前提。
  账号 `pkey` 由单独分支附加。

`HeyBoxApplication.j.run` 配置并启动 `SmAntiFraud`，注册
`IServerSmidCallback`。成功回调进入 `p.l` → `p.m`；初始化后还安排
约四秒的回退任务，调用 `p.a` → `p.b` → `SmAntiFraud.getDeviceId()` → `p.m`。

`p.m` 对非空且长度小于 1000 的结果写入 `sm_device_id`；空值或更长结果走
`p.g`，通过 `network.e.M7` 向 `rc/box_data/callback` 提交表单字段 `box_data`。
响应处理器读取 `heybox_token`，再写回同一缓存。以上是静态分支，
不表示这些请求在任意出口都会成功，也不应据此伪造 SDK 结果。

这解释了为什么仅有固定 `imei`、更换 UUID、重新编码 Cookie 或重新打开网页，
不能被当作已经重现原生匿名初始化。本次没有向这些服务发送初始化请求。

## 本次代码变更

现有 `app` 模式实现的是旧 `NDKTools.encode` 风格的算法。
其基础字符表原为 `23456789BCDFGHJKMNPQRTVWXY`，与样本不一致。
已修正为 `2345JKMNPQRT6789BCDFGHVWXY`，并明确它不实现当前 ShaderManager。

在 `libnative-lib.so` 中，JNI 注册将 `encode` 指向 `_o00_y2y1`（`0x3c2c`）。
`0x3cd0`、`0x3cd4` 的加载及随后的 `XY` 写入拼出上述 26 字符表，
后面追加大写 nonce。其余步骤可核对为：路径 Base64 作为 HMAC-SHA1 的 key，
时间加 nonce 数字个数形成计数值，动态截断后取五个基数 58 的索引，
再对后四个字符做有限域混合并计算两位校验值。

测试固定值来自独立 Python `base64`、`hmac` 实现和 GF(2^8) 矩阵计算，
没有调用被测 TypeScript 生成期望值，也没有执行 APK 原生函数。
例如合成输入 `/bbs/app/link/tree/`、`1700000000`、32 个 `0`：

- HMAC-SHA1：`79de984ab25a487f7d66d1e5527e0f55f54e0ed8`。
- 字符表索引：`[29, 18, 57, 52, 11]`；前缀：`0D00T`；最终结果：`0D00T98`。
- 混合矩阵各行为 `[17,20,6,3]`、`[3,17,20,6]`、`[6,3,17,20]`、
  `[20,6,3,17]`，有限域多项式为 `0x11b`，结果字节之和模 100。

新增离线覆盖包括详情与列表路径、全数字和无数字 nonce、大小写转换及长 HMAC key。
这些是旧算法静态重建样例，不是当前 App 的请求签名样本。
未将默认版本号改成 `1.3.400/1149` 来冒充当前原生协议。

此外，APK 的 `ApiErrorHelper` 将业务状态 `hkey` 与 `lack_token` 等分开处理。
详情来源现将 `hkey` 单独记录为固定诊断原因，维持一分钟的来源级退避；
缺失令牌同样为一分钟，验证码仍为十五分钟。日志不包含 Cookie、URL、
上游消息或正文。离线回归覆盖错误原因、摘要保留、跨帖子冷却和到期恢复。

## 验证边界和剩余问题

从功能分支提交 `bc3cab9b5d47319d39c6fb53cbb967ab07b4198c` 接续开发。
旧版修正提交的 `deno task check` 的 lint、类型检查和 888 项测试通过；
新增普通原生签名后，完整检查为 893 项测试通过；
`bash ops/deploy_test.sh` 的六项隔离测试通过，没有执行真实部署。

既有真实观测（来自交接，本次未重做）：网页匿名请求在本机成功、Oracle 出口
出现验证码；将网页初始化也放到 Oracle 未稳定解决；真实原生匿名请求经 Oracle
曾成功，删除 `x_xhh_tokenid` 后出现验证码。它们说明身份与出口值得区分，
但不足以将签名差异单独认定为验证码根因。

本次完成了版本、受保护参数填充器、旧签名差异和匿名初始化调用链的静态核对，
并进一步实现了当前 ShaderManager 普通分支的数学签名与日期 nonce。
完整原生会话、动态 `_rnd`、真实网络稳定性验证和部署仍未完成。
离线检查只能证明实现与静态推导一致且回归没有失败，不能关闭完整详情稳定性问题。
不要将旧 `NDKTools.encode` 或新合成样例声称为当前 App 的实测请求。
