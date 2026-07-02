import type { PollSort } from "../src/models.ts";
import { parseHeyboxHblogTopicPosts } from "../src/services/heybox_hblog_topic_source.ts";

const config = {
  adb: Deno.env.get("ANDROID_ADB")?.trim() || "adb",
  apkPath: Deno.env.get("HEYBOX_APK_PATH")?.trim(),
  clearApp: Deno.env.get("HEYBOX_CLEAR_APP") === "true",
  deepLinkUrl: Deno.env.get("HEYBOX_DEEPLINK_URL")?.trim(),
  hblogLogPath: Deno.env.get("HEYBOX_ANDROID_HBLOG_LOG")?.trim() ||
    "/data/user/0/com.max.xiaoheihe/cache/hblog/content/net/log",
  launchActivity: Deno.env.get("HEYBOX_LAUNCH_ACTIVITY")?.trim() ||
    "com.max.xiaoheihe/.SplashActivity",
  outputPath: Deno.env.get("WORKER_FEED_OUTPUT")?.trim() || "worker-feed.json",
  packageName: Deno.env.get("HEYBOX_PACKAGE")?.trim() || "com.max.xiaoheihe",
  postLimit: positiveIntegerFromEnv("POLL_POST_LIMIT", 20),
  sort: pollSortFromEnv(),
  topicId: requiredEnv("HEYBOX_TOPIC_ID"),
  waitMs: positiveIntegerFromEnv("HEYBOX_ANDROID_WAIT_MS", 45000),
};

await adb(["start-server"]);
await adb(["wait-for-device"]);
await adbOutput(["root"]);
await adb(["wait-for-device"]);

if (config.apkPath) {
  await adb(["install", "-r", config.apkPath]);
}

if (config.clearApp) {
  await adb(["shell", "pm", "clear", config.packageName]);
}

await adb(["shell", "am", "force-stop", config.packageName]);
await launchHeybox();
await delay(config.waitMs);

const hblog = await readHblog();
const posts = parseHeyboxHblogTopicPosts(hblog, config.topicId, config.sort).slice(
  0,
  config.postLimit,
);

if (posts.length === 0) {
  throw new Error("Android worker feed produced no posts");
}

const payload = JSON.stringify({ posts }, null, 2) + "\n";
await Deno.writeTextFile(config.outputPath, payload);
console.log(
  JSON.stringify(
    {
      firstPost: {
        id: posts[0].id,
        publishedAt: posts[0].publishedAt,
        title: posts[0].title,
      },
      outputPath: config.outputPath,
      postCount: posts.length,
      sort: config.sort,
      topicId: config.topicId,
    },
    null,
    2,
  ),
);

async function launchHeybox(): Promise<void> {
  if (config.deepLinkUrl) {
    await adb([
      "shell",
      "am",
      "start",
      "-W",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      config.deepLinkUrl,
    ]);
    return;
  }

  await adb(["shell", "am", "start", "-W", "-n", config.launchActivity]);
}

async function readHblog(): Promise<string> {
  const attempts = [
    ["exec-out", "su", "0", "cat", config.hblogLogPath],
    ["exec-out", "cat", config.hblogLogPath],
    ["exec-out", "run-as", config.packageName, "cat", "cache/hblog/content/net/log"],
  ];

  const errors: string[] = [];
  for (const args of attempts) {
    const result = await adbOutput(args);
    if (result.success && result.stdout.trim().length > 0) {
      return result.stdout;
    }
    errors.push(`${config.adb} ${args.join(" ")}: ${result.stderr || "empty stdout"}`);
  }

  throw new Error(`Unable to read Heybox hblog net log:\n${errors.join("\n")}`);
}

async function adb(args: string[]): Promise<void> {
  const result = await adbOutput(args);
  if (!result.success) {
    throw new Error(`${config.adb} ${args.join(" ")} failed: ${result.stderr}`);
  }
}

async function adbOutput(args: string[]): Promise<{
  stderr: string;
  stdout: string;
  success: boolean;
}> {
  const command = new Deno.Command(config.adb, {
    args,
    stderr: "piped",
    stdout: "piped",
  });
  const output = await command.output();
  const decoder = new TextDecoder();
  return {
    stderr: decoder.decode(output.stderr).trim(),
    stdout: decoder.decode(output.stdout),
    success: output.success,
  };
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function pollSortFromEnv(): PollSort {
  const value = Deno.env.get("POLL_SORT");
  if (value === "publishTime" || value === "smart" || value === "replyTime") {
    return value;
  }
  return "publishTime";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
