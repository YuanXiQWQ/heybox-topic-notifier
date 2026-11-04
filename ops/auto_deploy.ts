/** @file 只部署已通过发行构建的正式版本标签，独立于分支推送且不需要 GitHub 写入凭据。 */
import { createHash } from "node:crypto";

/** 自动部署只读取本项目的公开发行与构建结果。 */
const repository = "YuanXiQWQ/heybox-topic-notifier";
/** 与发行工作流约定的完整附件集合。 */
const assetNames = [
  "heybox-topic-notifier-windows-x64-setup.exe",
  "heybox-topic-notifier-windows-x64-setup.exe.blockmap",
  "heybox-topic-notifier-android-universal.apk",
  "latest.yml",
];
/** 正式版本身份。 */
type Version = { tag: string; version: string; order: number };
/** GitHub 公开发行所需字段。 */
export type Release = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: { name: string; size: number; state: string }[];
};
/** 构建结果必须来自同一标签提交的发行工作流。 */
export type Run = {
  id: number;
  run_attempt: number;
  event: string;
  head_branch: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
};
/** 部署意图在切换前持久化，异常中断也不会反复安装同一构建。 */
export type State = {
  current?: Version & { sha: string };
  attempted?: string;
  result?: "deploying" | "failed" | "deployed";
};
/** 已通过检查的不可变部署目标。 */
export type Target = Version & { sha: string; attempt: string };
/** 可替换的只读 GitHub JSON 接口，测试不访问网络。 */
type ReadApi = (path: string) => Promise<unknown>;

/**
 * 识别与安装包版本编码相同的三段数字正式标签。
 * @param {string} tag 标签名。
 * @return {Version | undefined} 正式版本及可比较顺序。
 */
export function parseVersion(tag: string): Version | undefined {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  if (!match) return;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (major > 2099 || minor > 999 || patch > 999) return;
  return {
    tag,
    version: `${major}.${minor}.${patch}`,
    order: major * 1000000 + minor * 1000 + patch,
  };
}

/**
 * 只选择最新正式发行；最新版本尚未就绪时不部署更旧的候选。
 * @param {Release[]} releases 公开发行列表。
 * @return {Release | undefined} 版本号最大的正式发行。
 */
export function latestRelease(releases: Release[]): Release | undefined {
  return releases.filter((release) =>
    !release.draft && !release.prerelease &&
    release.published_at && parseVersion(release.tag_name)
  )
    .sort((a, b) =>
      parseVersion(b.tag_name)!.order - parseVersion(a.tag_name)!.order
    )[0];
}

/**
 * 解引用轻量或附注标签，不把 Release 的分支名当作构建提交。
 * @param {ReadApi} read GitHub 读取接口。
 * @param {string} tag 已验证的正式标签。
 * @return {Promise<string>} 标签对应的完整提交摘要。
 */
export async function tagCommit(read: ReadApi, tag: string): Promise<string> {
  let value = await read(`/git/ref/tags/${tag}`) as {
    object: { type: string; sha: string };
  };
  for (let depth = 0; depth < 5; depth++) {
    const object = value.object;
    if (!/^[a-f0-9]{40}$/.test(object.sha)) {
      throw new Error("标签提交摘要无效。");
    }
    if (object.type === "commit") return object.sha;
    if (object.type !== "tag") break;
    value = await read(`/git/tags/${object.sha}`) as typeof value;
  }
  throw new Error("标签没有解析到有效提交。");
}

/**
 * 验证附件、标签和最近一次标签构建，屏蔽分支构建、旧版本及重复失败。
 * @param {ReadApi} read GitHub 读取接口。
 * @param {State} state 已部署与最近尝试状态。
 * @param {string | undefined} redeploySha 明确授权同版本重发时指定的完整提交号。
 * @return {Promise<Target | undefined>} 可部署目标；没有就绪的新版本时为空。
 */
export async function deploymentTarget(
  read: ReadApi,
  state: State,
  redeploySha?: string,
): Promise<Target | undefined> {
  if (redeploySha !== undefined && !/^[a-f0-9]{40}$/.test(redeploySha)) {
    throw new Error("同版本重部署必须指定完整提交号。");
  }
  const release = latestRelease(
    await read("/releases?per_page=100") as Release[],
  );
  if (!release) return;
  const version = parseVersion(release.tag_name)!;
  if (state.current && version.order < state.current.order) return;
  if (state.current && version.order === state.current.order && !redeploySha) {
    return;
  }
  if (
    !assetNames.every((name) =>
      release.assets.some((asset) =>
        asset.name === name && asset.state === "uploaded" && asset.size > 0
      )
    )
  ) return;
  const sha = await tagCommit(read, version.tag);
  if (redeploySha && sha !== redeploySha) {
    throw new Error("正式标签与明确授权的重部署提交不匹配。");
  }
  if (state.current?.order === version.order && state.current.sha === sha) {
    return;
  }
  const { workflow_runs } = await read(
    `/actions/workflows/app-build.yml/runs?head_sha=${sha}&event=push&per_page=100`,
  ) as { workflow_runs: Run[] };
  const run = workflow_runs.filter((item) =>
    item.event === "push" &&
    item.head_branch === version.tag && item.head_sha === sha
  )
    .sort((a, b) => b.id - a.id || b.run_attempt - a.run_attempt)[0];
  if (!run || run.status !== "completed" || run.conclusion !== "success") {
    return;
  }
  const attempt = `${version.tag}:${sha}:${run.id}:${run.run_attempt}`;
  if (state.attempted === attempt) return;
  return { ...version, sha, attempt };
}

/**
 * 从固定公开仓库读取元数据，网络与限流错误均阻止部署。
 * @param {string} path 仓库 API 路径。
 * @return {Promise<unknown>} GitHub JSON 响应。
 */
async function readApi(path: string): Promise<unknown> {
  const response = await fetch(
    `https://api.github.com/repos/${repository}${path}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "heybox-oracle-deploy",
      },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok) throw new Error(`GitHub 读取失败：HTTP ${response.status}`);
  return response.json();
}

/**
 * 执行固定工具，参数独立传递，失败时终止部署。
 * @param {string} command 工具绝对路径。
 * @param {string[]} args 参数数组。
 * @return {Promise<string>} 标准输出。
 */
async function command(command: string, args: string[]): Promise<string> {
  const result = await new Deno.Command(command, {
    args,
    stdout: "piped",
    stderr: "inherit",
  }).output();
  if (!result.success) throw new Error(`${command} 执行失败：${result.code}`);
  return new TextDecoder().decode(result.stdout).trim();
}

/**
 * 原子记录部署意图与结果，避免重启后将同一失败版本再次自动上线。
 * @param {string} path 状态文件绝对路径。
 * @param {State} state 当前部署状态。
 */
async function saveState(path: string, state: State): Promise<void> {
  await Deno.writeTextFile(`${path}.next`, JSON.stringify(state) + "\n", {
    mode: 0o600,
  });
  await Deno.rename(`${path}.next`, path);
}

/**
 * 下载确切标签提交并生成校验归档，交由有健康检查和回退保护的脚本部署。
 * @param {Target} target 已确认的正式发行。
 * @param {string} temporary 本次专用临时目录。
 */
async function deploy(target: Target, temporary: string): Promise<void> {
  await command("/usr/bin/git", ["init", "--quiet", temporary]);
  await command("/usr/bin/git", [
    "-C",
    temporary,
    "fetch",
    "--quiet",
    "--depth=1",
    `https://github.com/${repository}.git`,
    `refs/tags/${target.tag}`,
  ]);
  const sha = await command("/usr/bin/git", [
    "-C",
    temporary,
    "rev-parse",
    "FETCH_HEAD^{commit}",
  ]);
  if (sha !== target.sha || await tagCommit(readApi, target.tag) !== sha) {
    throw new Error("标签在检查后发生变化，取消部署。");
  }
  const archive = `${temporary}/release.tar.gz`;
  await command("/usr/bin/git", [
    "-C",
    temporary,
    "archive",
    "--format=tar.gz",
    `--output=${archive}`,
    sha,
  ]);
  const hash = createHash("sha256");
  const file = await Deno.open(archive);
  for await (const chunk of file.readable) hash.update(chunk);
  const script = new URL("./deploy.sh", import.meta.url).pathname;
  console.log(
    await command("/usr/bin/bash", [
      script,
      "production",
      sha,
      archive,
      hash.digest("hex"),
      target.version,
    ]),
  );
}

/** 检查正式发行或明确指定提交的同版本重发，持久化结果并清理下载与归档。 */
async function main(): Promise<void> {
  if (
    Deno.args.some((value) =>
      value !== "--check" && !/^--redeploy-sha=[a-f0-9]{40}$/.test(value)
    ) ||
    Deno.args.filter((value) => value.startsWith("--redeploy-sha=")).length > 1
  ) {
    throw new Error("仅支持 --check 和 --redeploy-sha=<完整提交号>。");
  }
  const redeploySha = Deno.args.find((value) =>
    value.startsWith("--redeploy-sha=")
  )?.slice("--redeploy-sha=".length);
  const path = "/var/lib/heybox-deploy/state.json";
  let state: State = {};
  try {
    state = JSON.parse(await Deno.readTextFile(path));
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  const target = await deploymentTarget(readApi, state, redeploySha);
  if (!target) {
    console.log("没有已通过发行构建的新正式标签。");
    return;
  }
  console.log(`就绪：${target.tag} ${target.sha}`);
  if (Deno.args.includes("--check")) return;
  await Deno.mkdir("/var/lib/heybox-deploy", { recursive: true, mode: 0o700 });
  const temporary = await Deno.makeTempDir({ prefix: "heybox-deploy-" });
  try {
    // 在任何生产切换前记录意图，进程中断也需要新的成功构建才能自动重试。
    state = { ...state, attempted: target.attempt, result: "deploying" };
    await saveState(path, state);
    await deploy(target, temporary);
    state = { current: target, attempted: target.attempt, result: "deployed" };
    await saveState(path, state);
    console.log(`部署完成：${target.tag} ${target.sha}`);
  } catch (error) {
    await saveState(path, { ...state, result: "failed" });
    throw error;
  } finally {
    await Deno.remove(temporary, { recursive: true });
  }
}

if (import.meta.main) await main();
