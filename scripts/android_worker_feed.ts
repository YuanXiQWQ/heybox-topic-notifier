import type { PollSort } from "../src/models.ts";
import { parseHeyboxHblogTopicPosts } from "../src/services/heybox_hblog_topic_source.ts";

const config = {
  adb: Deno.env.get("ANDROID_ADB")?.trim() || "adb",
  adbRoot: Deno.env.get("HEYBOX_ADB_ROOT") === "true",
  adbSerial: Deno.env.get("ANDROID_SERIAL")?.trim() ||
    Deno.env.get("ANDROID_ADB_SERIAL")?.trim(),
  apkPath: Deno.env.get("HEYBOX_APK_PATH")?.trim(),
  clearApp: Deno.env.get("HEYBOX_CLEAR_APP") === "true",
  deepLinkUrl: Deno.env.get("HEYBOX_DEEPLINK_URL")?.trim(),
  hblogLogPath: Deno.env.get("HEYBOX_ANDROID_HBLOG_LOG")?.trim() ||
    "/data/user/0/com.max.xiaoheihe/cache/hblog/content/net/log",
  launchActivity: Deno.env.get("HEYBOX_LAUNCH_ACTIVITY")?.trim() ||
    "com.max.xiaoheihe/com.max.xiaoheihe.SplashActivity",
  prelaunchMs: positiveIntegerFromEnv("HEYBOX_ANDROID_PRELAUNCH_MS", 0),
  debugOutputPath: Deno.env.get("WORKER_FEED_DEBUG_OUTPUT")?.trim() ||
    "android-worker-debug.txt",
  navigationScript: Deno.env.get("HEYBOX_ANDROID_NAVIGATION")?.trim(),
  outputPath: Deno.env.get("WORKER_FEED_OUTPUT")?.trim() || "worker-feed.json",
  packageName: Deno.env.get("HEYBOX_PACKAGE")?.trim() || "com.max.xiaoheihe",
  postLimit: positiveIntegerFromEnv("POLL_POST_LIMIT", 20),
  sort: pollSortFromEnv(),
  topicId: requiredEnv("HEYBOX_TOPIC_ID"),
  waitMs: positiveIntegerFromEnv("HEYBOX_ANDROID_WAIT_MS", 45000),
};

try {
  await main();
} catch (error) {
  throw await withAndroidDebug(error);
}

async function main(): Promise<void> {
  await adb(["start-server"]);
  await adb(["wait-for-device"]);
  if (config.adbRoot) {
    await adbOutput(["root"]);
    await adb(["wait-for-device"]);
  }

  if (config.apkPath) {
    await adb(["install", "-r", config.apkPath]);
  }

  if (config.clearApp) {
    await adb(["shell", "pm", "clear", config.packageName]);
  }

  await adb(["shell", "am", "force-stop", config.packageName]);
  await launchHeybox();
  if (config.navigationScript) {
    await runNavigationScript(config.navigationScript);
  }
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
  await writeTextFileCreatingParents(config.outputPath, payload);
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
}

async function launchHeybox(): Promise<void> {
  if (config.deepLinkUrl) {
    if (config.prelaunchMs > 0) {
      await adb(["shell", "am", "start", "-W", "-n", config.launchActivity]);
      await delay(config.prelaunchMs);
    }
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
  const errors: string[] = [];
  for (const args of hblogReadAttempts()) {
    const result = await adbOutput(args);
    if (result.success && result.stdout.trim().length > 0) {
      return result.stdout;
    }
    errors.push(`${config.adb} ${args.join(" ")}: ${result.stderr || "empty stdout"}`);
  }

  throw new Error(`Unable to read Heybox hblog net log:\n${errors.join("\n")}`);
}

async function runNavigationScript(script: string): Promise<void> {
  for (const rawLine of script.split(/[;\r\n]+/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const [command = "", ...args] = line.split(/\s+/);
    switch (command) {
      case "keyevent":
        await repeat(Number(args[1]) || 1, async () => {
          await adb(["shell", "input", "keyevent", requiredArg(command, args, 0)]);
        });
        break;
      case "sleep":
        await delay(Number(requiredArg(command, args, 0)));
        break;
      case "swipe":
        await adb(["shell", "input", "swipe", ...requiredArgs(command, args, 5)]);
        break;
      case "tap":
        await adb(["shell", "input", "tap", ...requiredArgs(command, args, 2)]);
        break;
      case "tap_id":
        await tapUiNode(
          (attrs) => matchesResourceId(attrs["resource-id"], requiredArg(command, args, 0)),
          command,
        );
        break;
      case "tap_text":
        await tapUiNode((attrs) => {
          const text = args.join(" ");
          return attrs.text === text || attrs["content-desc"] === text;
        }, `${command} ${args.join(" ")}`);
        break;
      case "text":
        await adb(["shell", "input", "text", args.join("%s")]);
        break;
      default:
        throw new Error(`Unsupported Android navigation command: ${command}`);
    }
  }
}

async function tapUiNode(
  predicate: (attrs: Record<string, string>) => boolean,
  description: string,
): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const xml = await dumpUiXml();
    const bounds = findNodeBounds(xml, predicate);
    if (bounds) {
      await adb(["shell", "input", "tap", String(bounds.x), String(bounds.y)]);
      return;
    }
    await delay(500);
  }

  throw new Error(`Unable to find Android UI node for ${description}`);
}

async function dumpUiXml(): Promise<string> {
  const remotePath = "/sdcard/heybox-worker-ui.xml";
  await adb(["shell", "uiautomator", "dump", remotePath]);
  const result = await adbOutput(["exec-out", "cat", remotePath]);
  if (!result.success || !result.stdout.trim()) {
    throw new Error(`Unable to read Android UI dump: ${result.stderr || "empty stdout"}`);
  }
  return result.stdout;
}

function findNodeBounds(
  xml: string,
  predicate: (attrs: Record<string, string>) => boolean,
): { x: number; y: number } | undefined {
  for (const match of xml.matchAll(/<node\b[^>]*>/g)) {
    const attrs = nodeAttributes(match[0]);
    if (!predicate(attrs)) {
      continue;
    }

    const bounds = attrs.bounds?.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (bounds) {
      const [, left, top, right, bottom] = bounds.map(Number);
      return {
        x: Math.round((left + right) / 2),
        y: Math.round((top + bottom) / 2),
      };
    }
  }

  return undefined;
}

function nodeAttributes(node: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of node.matchAll(/([^\s=]+)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXmlAttribute(match[2]);
  }
  return attrs;
}

function matchesResourceId(actual: string | undefined, expected: string): boolean {
  if (!actual) {
    return false;
  }
  return actual === expected || actual.endsWith(`:id/${expected}`);
}

function decodeXmlAttribute(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

async function withAndroidDebug(error: unknown): Promise<Error> {
  const message = error instanceof Error ? error.message : String(error);
  const [activity, hblogResult] = await Promise.all([
    frontActivity(),
    bestEffortReadHblog(),
  ]);
  const hblog = hblogResult.success ? hblogResult.stdout : "";
  const debug = [
    `error=${message}`,
    `package=${config.packageName}`,
    `topicId=${config.topicId}`,
    `sort=${config.sort}`,
    `activity=${activity || "unknown"}`,
    `hblogReadable=${hblogResult.success}`,
    `hblogBytes=${hblog.length}`,
    "recentTopicFeeds:",
    ...recentTopicFeedLines(hblog),
  ].join("\n");

  await writeTextFileCreatingParents(config.debugOutputPath, debug + "\n");
  return new Error(`${message}\nAndroid debug written to ${config.debugOutputPath}\n${debug}`);
}

async function bestEffortReadHblog(): Promise<{
  stderr: string;
  stdout: string;
  success: boolean;
}> {
  const errors: string[] = [];
  for (const args of hblogReadAttempts()) {
    const result = await adbOutput(args);
    if (result.success && result.stdout.trim().length > 0) {
      return result;
    }
    errors.push(result.stderr || "empty stdout");
  }

  return {
    stderr: errors.join("\n"),
    stdout: "",
    success: false,
  };
}

function hblogReadAttempts(): string[][] {
  return [
    ["exec-out", "su", "0", "cat", config.hblogLogPath],
    ["shell", "su", "-c", `cat ${shellArg(config.hblogLogPath)}`],
    ["exec-out", "cat", config.hblogLogPath],
    ["exec-out", "run-as", config.packageName, "cat", "cache/hblog/content/net/log"],
  ];
}

async function frontActivity(): Promise<string> {
  const result = await adbOutput(["shell", "dumpsys", "window", "windows"]);
  if (!result.success) {
    return result.stderr;
  }
  const match = result.stdout.match(/mCurrentFocus=.*? ([^}\s]+)}/) ??
    result.stdout.match(/mFocusedApp=.*?ActivityRecord\{[^ ]+ [^ ]+ ([^ ]+)/);
  return match?.[1] ?? "";
}

function recentTopicFeedLines(hblog: string): string[] {
  const lines = hblog.split(/\r?\n/).filter((line) =>
    line.includes("/bbs/app/topic/feeds") || line.includes("topic_id")
  );
  return lines.slice(-12).map((line) => sanitizeAndroidDebugLine(line).slice(0, 1000));
}

function sanitizeAndroidDebugLine(line: string): string {
  const sensitiveQueryKeys = [
    "hkey",
    "nonce",
    "_rnd",
    "imei",
    "device_info",
    "heybox_id",
    "pkey",
    "x_pkey",
    "x_xhh_tokenid",
    "x_heybox_id",
  ].join("|");

  return line
    .replace(
      new RegExp(`([?&](${sensitiveQueryKeys})=)[^&\\s"]+`, "gi"),
      "$1<redacted>",
    )
    .replace(/(Cookie:\s*).+/i, "$1<redacted>")
    .replace(
      new RegExp(`("(?:${sensitiveQueryKeys})"\\s*:\\s*")[^"]+"`, "gi"),
      '$1<redacted>"',
    );
}

async function repeat(count: number, action: () => Promise<void>): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await action();
  }
}

function requiredArg(command: string, args: string[], index: number): string {
  const value = args[index];
  if (!value) {
    throw new Error(`${command} requires argument ${index + 1}`);
  }
  return value;
}

function requiredArgs(command: string, args: string[], count: number): string[] {
  if (args.length < count) {
    throw new Error(`${command} requires ${count} arguments`);
  }
  return args.slice(0, count);
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
  const commandArgs = config.adbSerial ? ["-s", config.adbSerial, ...args] : args;
  const command = new Deno.Command(config.adb, {
    args: commandArgs,
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

async function writeTextFileCreatingParents(path: string, data: string): Promise<void> {
  const parent = parentDirectory(path);
  if (parent) {
    await Deno.mkdir(parent, { recursive: true });
  }
  await Deno.writeTextFile(path, data);
}

function parentDirectory(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index > 0 ? path.slice(0, index) : "";
}

function shellArg(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
