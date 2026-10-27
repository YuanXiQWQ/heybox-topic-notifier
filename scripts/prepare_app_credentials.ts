/** @file 在本机准备可重复使用的 Android 发行签名与 Web Push 密钥，不打印私钥或修改远程配置。 */
// @deno-types="npm:@types/web-push@3.6.4"
import webPush from "web-push";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

/** 本机私有目录，整体由 .gitignore 排除，必须单独备份。 */
const directory = resolve("apps/signing");
/** 凭据只生成一次；重跑复用原文件，不轮换发行身份。 */
const filename = resolve(directory, "credentials.json");
/** Android keystore 的稳定路径。 */
const keystore = resolve(directory, "android-release.jks");
/** Java keytool 由调用者提供，避免修改系统 JAVA_HOME 或 PATH。 */
const keytool = Deno.args[0];
if (!keytool) throw new Error("请提供 JDK keytool 的路径。");
await Deno.mkdir(directory, { recursive: true, mode: 0o700 });

/**
 * 检查文件是否存在，仅把确实不存在视为可创建。
 * @param {string} path 本机路径。
 * @return {Promise<boolean>} 文件是否存在。
 */
async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

if (!await exists(filename)) {
  if (await exists(keystore)) {
    throw new Error("发现已有 keystore，拒绝另建密码或替换发行身份。");
  }
  const push = webPush.generateVAPIDKeys();
  await Deno.writeTextFile(
    filename,
    JSON.stringify(
      {
        ANDROID_KEYSTORE: keystore,
        ANDROID_KEYSTORE_PASSWORD: randomBytes(32).toString("base64url"),
        ANDROID_KEY_ALIAS: "heybox-release",
        WEB_PUSH_PUBLIC_KEY: push.publicKey,
        WEB_PUSH_PRIVATE_KEY: push.privateKey,
        WEB_PUSH_SUBJECT: "https://github.com/YuanXiQWQ/heybox-topic-notifier",
      },
      null,
      2,
    ) + "\n",
    { createNew: true, mode: 0o600 },
  );
}
/** 加密容器密码仅传入子进程环境，不作为命令行参数或日志输出。 */
const credentials = JSON.parse(await Deno.readTextFile(filename));
if (
  credentials.ANDROID_KEYSTORE !== keystore ||
  !/^[A-Za-z0-9_-]{43}$/.test(credentials.ANDROID_KEYSTORE_PASSWORD) ||
  credentials.ANDROID_KEY_ALIAS !== "heybox-release"
) {
  throw new Error("本地签名配置不匹配，拒绝覆盖。");
}
/** 首次生成发行证书，之后使用同一证书验证存储容器。 */
const args = await exists(keystore)
  ? [
    "-list",
    "-keystore",
    keystore,
    "-storepass:env",
    "APP_SIGNING_PASSWORD",
    "-alias",
    credentials.ANDROID_KEY_ALIAS,
  ]
  : [
    "-genkeypair",
    "-keystore",
    keystore,
    "-storetype",
    "JKS",
    "-alias",
    credentials.ANDROID_KEY_ALIAS,
    "-keyalg",
    "RSA",
    "-keysize",
    "3072",
    "-validity",
    "10000",
    "-dname",
    "CN=heybox-topic-notifier",
    "-storepass:env",
    "APP_SIGNING_PASSWORD",
    "-keypass:env",
    "APP_SIGNING_PASSWORD",
  ];
/** 工具诊断保留在进程内，不将可能包含本机路径的输出写入聊天。 */
const result = await new Deno.Command(keytool, {
  args,
  env: { APP_SIGNING_PASSWORD: credentials.ANDROID_KEYSTORE_PASSWORD },
  stdout: "piped",
  stderr: "piped",
}).output();
if (!result.success) {
  throw new Error("keytool 未能生成或验证发行证书；原凭据已保留。");
}
await Deno.writeTextFile(
  resolve(directory, "web-push.env"),
  ["WEB_PUSH_PUBLIC_KEY", "WEB_PUSH_PRIVATE_KEY", "WEB_PUSH_SUBJECT"].map((
    name,
  ) => `${name}=${credentials[name]}`).join("\n") + "\n",
  { mode: 0o600 },
);
console.log(
  "Android 发行签名和 VAPID 密钥已就绪；私钥仅保存于被 Git 忽略的 apps/signing/，请单独备份。",
);
