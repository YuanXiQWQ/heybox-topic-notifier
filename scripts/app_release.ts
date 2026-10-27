/** @file 从发行标签统一版本，验证两端安装产物并安全上传到同一个 GitHub Release。 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parse } from "@std/yaml";

/** 更新清单必须在两个安装包和差分文件就绪后上传。 */
export const releaseAssetNames = [
  "heybox-topic-notifier-windows-x64-setup.exe",
  "heybox-topic-notifier-windows-x64-setup.exe.blockmap",
  "heybox-topic-notifier-android-universal.apk",
  "latest.yml",
] as const;
/** 本地构建产物的完整性信息。 */
export type ReleaseAsset = {
  name: string;
  path: string;
  size: number;
  sha256: string;
  sha512: string;
};
/** GitHub 已上传附件的完整性信息。 */
type RemoteAsset = {
  id?: number;
  name: string;
  size: number;
  state: string;
  digest?: string;
};
/** 发行身份及不可变发布状态。 */
type Release = {
  id: number;
  tag_name: string;
  prerelease: boolean;
  immutable?: boolean;
  draft: boolean;
};

/**
 * 沿用三段数字标签，兼容 v 前缀，并生成与构建次数无关的递增 Android 版本号。
 * @param {string} tag 发行标签。
 * @return {{tag: string, version: string, versionCode: number}} 两个平台共享的版本信息。
 */
export function releaseVersion(tag: string) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  if (!match) {
    throw new Error("发行标签必须是 3.8.2 或 v3.8.2 形式的正式版本。");
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (major > 2099 || minor > 999 || patch > 999) {
    throw new Error(
      "版本超出 Android 编码范围：major ≤ 2099，minor、patch ≤ 999。",
    );
  }
  return {
    tag,
    version: `${major}.${minor}.${patch}`,
    versionCode: major * 1000000 + minor * 1000 + patch + 1,
  };
}

/**
 * 校验 Windows 更新清单与实际安装包一致，防止发布其它版本或缺失文件的清单。
 * @param {string} source YAML 更新清单。
 * @param {string} version 发行版本。
 * @param {ReleaseAsset} installer Windows 安装包。
 */
export function verifyUpdateManifest(
  source: string,
  version: string,
  installer: ReleaseAsset,
) {
  const value = parse(source) as {
    version?: string;
    files?: { url: string; sha512: string; size: number }[];
    path?: string;
    sha512?: string;
  };
  const file = value?.files?.[0];
  if (
    value?.version !== version || value.files?.length !== 1 || !file ||
    file.url !== installer.name || file.size !== installer.size ||
    file.sha512 !== installer.sha512 || value.path !== installer.name ||
    value.sha512 !== installer.sha512
  ) {
    throw new Error(
      "latest.yml 与本次 Windows 安装包的版本、文件名或摘要不一致。",
    );
  }
}

/**
 * 流式计算文件摘要，避免一次性读取包含完整彩蛋的大安装包。
 * @param {string} directory 构建产物目录。
 * @param {string} name 约定的附件文件名。
 * @return {Promise<ReleaseAsset>} 文件完整性信息。
 */
async function inspectAsset(
  directory: string,
  name: string,
): Promise<ReleaseAsset> {
  const path = join(directory, name), stat = await Deno.lstat(path);
  if (!stat.isFile || stat.size <= 0 || stat.size > 1024 * 1024 * 1024) {
    throw new Error(`安装附件缺失或尺寸无效：${name}`);
  }
  const sha256 = createHash("sha256"), sha512 = createHash("sha512");
  const file = await Deno.open(path);
  for await (const bytes of file.readable) {
    sha256.update(bytes);
    sha512.update(bytes);
  }
  return {
    name,
    path,
    size: stat.size,
    sha256: sha256.digest("hex"),
    sha512: sha512.digest("base64"),
  };
}

/** GitHub 请求函数可由测试替换，凭据只发往固定官方 API。 */
export type GitHubRequest = (
  path: string,
  init?: RequestInit,
) => Promise<unknown>;
/**
 * 创建限定仓库和官方域名的 HTTPS 客户端，不输出凭据或错误响应正文。
 * @param {string} repository GitHub 仓库。
 * @param {string} token 当前任务令牌。
 * @param {typeof fetch} fetcher 官方 HTTPS 传输，可在测试中替换。
 * @return {GitHubRequest} JSON 请求入口。
 */
export function githubClient(
  repository: string,
  token: string,
  fetcher: typeof fetch = fetch,
): GitHubRequest {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token) {
    throw new Error("GitHub 仓库或任务令牌缺失。");
  }
  return async (path, init = {}) => {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new Error("无效的 GitHub API 路径。");
    }
    const host =
      init.method === "POST" && /^\/releases\/\d+\/assets\?/.test(path)
        ? "uploads.github.com"
        : "api.github.com";
    const response = await fetcher(
      `https://${host}/repos/${repository}${path}`,
      {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(
          init.method === "POST" ? 10 * 60 * 1000 : 30000,
        ),
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          ...init.headers,
          authorization: `Bearer ${token}`,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`GitHub 请求失败（HTTP ${response.status}）。`, {
        cause: response.status,
      });
    }
    return response.status === 204 ? null : response.json();
  };
}

/**
 * 验证发行身份，拒绝向预发行或被重新创建的另一个 Release 上传正式更新。
 * @param {GitHubRequest} request 官方 API。
 * @param {string} tag 目标标签。
 * @param {number | undefined} id 准备阶段记录的发行 ID。
 * @return {Promise<Release>} 当前发行。
 */
export async function readRelease(
  request: GitHubRequest,
  tag: string,
  id?: number,
): Promise<Release> {
  const release = await request(
    id === undefined
      ? `/releases/tags/${encodeURIComponent(tag)}`
      : `/releases/${id}`,
  ) as Release;
  if (
    !Number.isSafeInteger(release.id) || release.id <= 0 ||
    release.tag_name !== tag || release.prerelease !== false ||
    (id !== undefined && release.id !== id)
  ) throw new Error("Release 身份或正式发行状态不匹配。");
  return release;
}

/**
 * 复用目标发行，仅在标签没有 Release 时创建草稿，供完整附件上传后公开。
 * @param {GitHubRequest} request 官方 API。
 * @param {string} tag 已验证的正式版本标签。
 * @param {string} commit 标签对应的构建提交。
 * @param {number | undefined} id 事件指定的发行 ID。
 * @return {Promise<Release>} 已验证的发行或草稿。
 */
export async function ensureRelease(
  request: GitHubRequest,
  tag: string,
  commit: string,
  id?: number,
): Promise<Release> {
  releaseVersion(tag);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("构建提交无效。");
  await verifyTag(request, tag, commit);
  try {
    return await readRelease(request, tag, id);
  } catch (error) {
    if (id !== undefined || !(error instanceof Error) || error.cause !== 404) {
      throw error;
    }
  }
  // 标签接口只保证返回已公开发行；草稿通过有写入权限的发行列表查找。
  for (let page = 1;; page++) {
    if (page > 100) throw new Error("发行列表超出检查上限，拒绝创建重复草稿。");
    const batch = await request(
      `/releases?per_page=100&page=${page}`,
    ) as Release[];
    const existing = batch.find((release) => release.tag_name === tag);
    if (existing) return await readRelease(request, tag, existing.id);
    if (batch.length < 100) break;
  }
  const created = await request("/releases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: commit,
      name: tag,
      draft: true,
      prerelease: false,
      generate_release_notes: true,
    }),
  }) as Release;
  if (!Number.isSafeInteger(created.id) || created.id <= 0) {
    throw new Error("GitHub 未确认草稿创建。");
  }
  return await readRelease(request, tag, created.id);
}

/**
 * 确认标签仍指向经过测试的提交，包括带注释标签。
 * @param {GitHubRequest} request 官方 API。
 * @param {string} tag 发行标签。
 * @param {string} commit 两端构建使用的提交。
 * @return {Promise<void>} 标签校验通过。
 */
async function verifyTag(
  request: GitHubRequest,
  tag: string,
  commit: string,
): Promise<void> {
  const ref = await request(`/git/ref/tags/${encodeURIComponent(tag)}`) as {
    object: { type: string; sha: string };
  };
  let target = ref.object;
  for (let depth = 0; target.type === "tag" && depth < 10; depth++) {
    const annotated = await request(`/git/tags/${target.sha}`) as {
      object: typeof target;
    };
    target = annotated.object;
  }
  if (target.type !== "commit" || target.sha !== commit) {
    throw new Error("发行标签在构建后发生变化，拒绝上传到不同源码的版本。");
  }
}

/**
 * 先核对全部同名附件再上传缺失文件；同摘要重试可跳过，不覆盖已公开文件。
 * @param {object} options 发行身份、完整产物及可注入传输入口。
 * @return {Promise<void>} 所有附件已上传并核对摘要。
 */
export async function uploadRelease(
  options: {
    request: GitHubRequest;
    tag: string;
    commit: string;
    releaseId: number;
    assets: ReleaseAsset[];
    openBody: (asset: ReleaseAsset) => Promise<BodyInit>;
  },
): Promise<void> {
  const { request, tag, commit, releaseId, assets, openBody } = options;
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("构建提交无效。");
  if (
    assets.length !== releaseAssetNames.length ||
    assets.some((asset, index) => asset.name !== releaseAssetNames[index])
  ) throw new Error("必须同时提供两个安装包、差分文件和更新清单。");
  const release = await readRelease(request, tag, releaseId);
  await verifyTag(request, tag, commit);
  const existing = new Map<string, RemoteAsset>();
  for (let page = 1;; page++) {
    if (page > 20) throw new Error("Release 附件数量超出检查上限。");
    const batch = await request(
      `/releases/${release.id}/assets?per_page=100&page=${page}`,
    ) as RemoteAsset[];
    for (const asset of batch) existing.set(asset.name, asset);
    if (batch.length < 100) break;
  }
  for (const local of assets) {
    const remote = existing.get(local.name);
    if (
      remote?.state === "starter" && remote.size === 0 &&
      Number.isSafeInteger(remote.id) && !release.immutable
    ) continue;
    if (
      remote &&
      (remote.state !== "uploaded" || remote.size !== local.size ||
        remote.digest !== `sha256:${local.sha256}`)
    ) {
      throw new Error(
        `同名附件内容不一致，拒绝覆盖：${local.name}。请重跑原上传任务或发布新版本。`,
      );
    }
    if (!remote && release.immutable) {
      throw new Error(
        "Release 已锁定附件；请先对草稿运行手动构建上传，再发布不可变 Release。",
      );
    }
  }
  for (const local of assets) {
    const remoteExisting = existing.get(local.name);
    if (remoteExisting?.state === "starter") {
      await request(`/releases/assets/${remoteExisting.id}`, {
        method: "DELETE",
      });
      existing.delete(local.name);
    }
    if (existing.has(local.name)) continue;
    const remote = await request(
      `/releases/${release.id}/assets?name=${encodeURIComponent(local.name)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(local.size),
        },
        body: await openBody(local),
      },
    ) as RemoteAsset;
    if (
      remote.name !== local.name || remote.state !== "uploaded" ||
      remote.size !== local.size || remote.digest !== `sha256:${local.sha256}`
    ) throw new Error(`GitHub 未确认附件完整性：${local.name}`);
  }
}

/**
 * 上传完整附件后按需公开草稿；任何上传失败都会保留草稿状态。
 * @param {Parameters<typeof uploadRelease>[0]} options 发行身份和构建产物。
 * @param {boolean} publishDraft 是否在完整上传后公开草稿。
 * @return {Promise<void>} 附件上传及请求的公开操作完成。
 */
export async function publishRelease(
  options: Parameters<typeof uploadRelease>[0],
  publishDraft: boolean,
): Promise<void> {
  await uploadRelease(options);
  if (!publishDraft) return;
  const { request, tag, commit, releaseId } = options;
  await verifyTag(request, tag, commit);
  const release = await readRelease(request, tag, releaseId);
  if (!release.draft) return;
  await request(`/releases/${releaseId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft: false }),
  });
  const published = await readRelease(request, tag, releaseId);
  if (published.draft) throw new Error("GitHub 未确认 Release 已公开。");
}

/** 执行 Actions 阶段；测试导入时不读取环境或访问网络。 @return {Promise<void>} 阶段完成。 */
async function main(): Promise<void> {
  const version = releaseVersion(Deno.env.get("RELEASE_TAG") ?? "");
  if (Deno.args[0] === "prepare") {
    const result = await new Deno.Command("git", {
      args: ["rev-parse", "--verify", `refs/tags/${version.tag}^{commit}`],
      stdout: "piped",
      stderr: "piped",
    }).output();
    const commit = new TextDecoder().decode(result.stdout).trim();
    if (!result.success || !/^[a-f0-9]{40}$/.test(commit)) {
      throw new Error("发行标签必须已存在并指向可构建的提交。");
    }
    const upload = Deno.env.get("UPLOAD_RELEASE") === "true";
    let releaseId = "";
    let complete = false;
    if (upload) {
      const request = githubClient(
        Deno.env.get("GITHUB_REPOSITORY") ?? "",
        Deno.env.get("GH_TOKEN") ?? "",
      );
      const expected = Deno.env.get("RELEASE_ID");
      const release = await ensureRelease(
        request,
        version.tag,
        commit,
        expected ? Number(expected) : undefined,
      );
      if (release.immutable) {
        const current = await request(
          `/releases/${release.id}/assets?per_page=100`,
        ) as RemoteAsset[];
        complete = releaseAssetNames.every((name) =>
          current.some((asset) =>
            asset.name === name && asset.state === "uploaded" &&
            asset.size > 0 && /^sha256:[a-f0-9]{64}$/.test(asset.digest ?? "")
          )
        );
        if (!complete) {
          throw new Error(
            "Release 已不可变且缺少完整附件；应先向草稿上传构建结果，再发布。",
          );
        }
        console.log("不可变 Release 已有完整附件，跳过重复构建和上传。");
      }
      releaseId = String(release.id);
    }
    const output =
      `tag=${version.tag}\nversion=${version.version}\nversion_code=${version.versionCode}\ncommit=${commit}\nupload=${upload}\nrelease_id=${releaseId}\ncomplete=${complete}\n`;
    await Deno.writeTextFile(Deno.env.get("GITHUB_OUTPUT")!, output, {
      append: true,
    });
  } else if (["publish", "verify"].includes(Deno.args[0])) {
    const directory = Deno.args[1];
    if (!directory) throw new Error("缺少构建产物目录。");
    const assets = await Promise.all(
      releaseAssetNames.map((name) => inspectAsset(directory, name)),
    );
    verifyUpdateManifest(
      await Deno.readTextFile(join(directory, "latest.yml")),
      version.version,
      assets[0],
    );
    if (Deno.args[0] === "verify") {
      console.log(`已验证 ${assets.length} 个发行附件及 Windows 更新清单。`);
      return;
    }
    await publishRelease({
      request: githubClient(
        Deno.env.get("GITHUB_REPOSITORY") ?? "",
        Deno.env.get("GH_TOKEN") ?? "",
      ),
      tag: version.tag,
      commit: Deno.env.get("RELEASE_COMMIT") ?? "",
      releaseId: Number(Deno.env.get("RELEASE_ID")),
      assets,
      openBody: async (asset) => (await Deno.open(asset.path)).readable,
    }, Deno.env.get("PUBLISH_DRAFT") === "true");
  } else throw new Error("阶段必须是 prepare、verify 或 publish。");
}

if (import.meta.main) await main();
