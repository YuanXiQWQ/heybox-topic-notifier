/** @file 低频验证真实匿名详情；只输出状态和内容长度，不加载登录凭据或触发通知。 */
import { requireHeyboxDeviceId } from "../src/services/heybox_device_identity.ts";
import { createHeyboxTopicSource } from "../src/services/heybox_topic_source.ts";

/**
 * 读取唯一的命令行选项，拒绝重复配置。
 * @param {string} name 选项名称，不包含前导横线。
 * @return {string | undefined} 等号后的选项值。
 */
function option(name: string): string | undefined {
  const entries = Deno.args.filter((arg) => arg.startsWith(`--${name}=`));
  if (entries.length > 1) throw new Error(`Duplicate option: ${name}`);
  return entries[0]?.slice(name.length + 3);
}

const identityFile = option("identity-file");
const reportFile = option("report-file");
const mode = option("mode") ?? "default";
const ids = Deno.args.filter((arg) => !arg.startsWith("--"));
if (
  !Deno.args.includes("--live") || !identityFile || !reportFile ||
  identityFile === reportFile ||
  !["default", "app", "app-v1149"].includes(mode) ||
  ids.length === 0 || ids.length > 12 ||
  ids.some((id) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) ||
  Deno.args.some((arg) =>
    arg.startsWith("--") && arg !== "--live" &&
    !/^--(identity-file|report-file|mode)=/.test(arg)
  )
) {
  throw new Error(
    "Usage: --live --identity-file=PATH --report-file=NEW_PATH " +
      "[--mode=default|app-v1149|app] POST_ID [POST_ID ...] (maximum 12)",
  );
}
const deviceId = requireHeyboxDeviceId(await Deno.readTextFile(identityFile));
// 不覆盖既有文件，尤其不能因路径别名误覆盖固定设备标识。
await Deno.writeTextFile(reportFile, "", { createNew: true, mode: 0o600 });
const attempts: Record<string, unknown>[] = [];
const results: Record<string, unknown>[] = [];
const startedAtUtc = new Date().toISOString();
let lastRequestAt = 0;
let stopped = false;

/**
 * 每次请求后保存脱敏报告，失败或验证码不能被计为完整成功。
 * @return {Promise<void>} 报告写入完成。
 */
async function saveReport(): Promise<void> {
  await Deno.writeTextFile(
    reportFile!,
    JSON.stringify(
      {
        startedAtUtc,
        observedAtUtc: new Date().toISOString(),
        mode,
        credentialsUsed: false,
        requestedPosts: ids.length,
        intervalSeconds: 30,
        attempts,
        results,
        complete: results.filter((result) => result.complete === true).length,
        captcha: attempts.filter((attempt) => attempt.status === "show_captcha")
          .length,
        // 单次运行不能证明长期稳定，也不代表其他出口的结果。
        stabilityVerified: false,
      },
      null,
      2,
    ) + "\n",
  );
}

const source = createHeyboxTopicSource({
  deviceId,
  signatureMode: mode === "default" ? undefined : mode as "app" | "app-v1149",
  /** 验证固定详情路径；记录业务状态但不记录完整 URL、正文、身份或上游消息。 */
  fetchFn: async (input, init) => {
    const url = new URL(String(input));
    if (
      stopped || url.origin !== "https://api.xiaoheihe.cn" ||
      url.pathname !== "/bbs/app/link/tree" ||
      new Headers(init?.headers).has("cookie")
    ) throw new Error("Unexpected verification request");
    lastRequestAt = Date.now();
    const attempt: Record<string, unknown> = {
      atUtc: new Date().toISOString(),
      postId: url.searchParams.get("link_id"),
      version: url.searchParams.get("version"),
      build: url.searchParams.get("build"),
    };
    attempts.push(attempt);
    try {
      const response = await fetch(input, { ...init, redirect: "error" });
      attempt.httpStatus = response.status;
      const payload = await response.clone().json();
      attempt.status = ["ok", "hkey", "lack_token", "show_captcha", "failed"]
          .includes(payload?.status)
        ? payload.status
        : "other";
      stopped = !response.ok || payload?.status !== "ok";
      return response;
    } catch (error) {
      attempt.error = error instanceof Error ? error.name : "unknown";
      stopped = true;
      throw new Error("Verification request failed");
    } finally {
      await saveReport();
    }
  },
});

for (const id of ids) {
  if (stopped) break;
  // 等待发生在数据源创建十秒请求超时信号之前。
  const waitMs = 30_000 - (Date.now() - lastRequestAt);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  const post = await source.getPostDetails!({
    id,
    url: `https://www.xiaoheihe.cn/app/bbs/link/${id}`,
    title: "",
    body: "",
    excerpt: "",
    comments: [],
    commentReplies: [],
    publishedAt: "",
  });
  const result = {
    postId: id,
    complete: post.detailsComplete === true,
    bodyCharacters: post.body.length,
    comments: post.comments.length,
    replies: post.commentReplies.length,
    unavailable: post.detailUnavailable ?? null,
    retryAfterSeconds: source.detailRetryAfter?.() ?? 0,
  };
  results.push(result);
  await saveReport();
  console.log(JSON.stringify({ attempt: attempts.at(-1), result }));
  if (!result.complete || result.retryAfterSeconds) stopped = true;
}
if (results.length !== ids.length || results.some((r) => r.complete !== true)) {
  Deno.exitCode = 1;
}
