/**
 * @file 读取官方 GitHub Release 中实际存在的应用安装包并提供受限下载目录。
 */
import { projectRepository, projectRepositoryUrl } from "../project.ts";

/** 支持直接安装的发行附件名称及对应平台。 */
export const installerAssets = {
  "heybox-topic-notifier-windows-x86_64-setup.exe": "Windows · x64",
  "heybox-topic-notifier-windows-aarch64-setup.exe": "Windows · ARM64",
  "heybox-topic-notifier-android-arm64.apk": "Android · ARM64",
  "heybox-topic-notifier-android-universal.apk": "Android",
} as const;
/** GitHub 最新正式发行版接口。 */
const releaseApiUrl =
  `https://api.github.com/repos/${projectRepository}/releases/latest`;
/** 发行目录的服务端缓存时长，避免每位访客重复请求 GitHub。 */
const catalogCacheMs = 5 * 60 * 1000;
/** 上游不可用时短暂缓存错误，避免突发重试。 */
const failureCacheMs = 30 * 1000;

/** 一个已发布且可直接下载的安装包。 */
export type InstallerDownload = {
  name: string;
  platform: string;
  url: string;
  size: number;
};
/** 对外返回的发行目录；无发行包与上游故障分别表示。 */
export type ReleaseCatalog = {
  status: "available" | "empty" | "unavailable";
  version?: string;
  downloads: InstallerDownload[];
};

/**
 * 验证并提取发行附件，仅接受固定仓库中约定名称的直接下载链接。
 *
 * @param {unknown} value GitHub 返回的发行 JSON。
 * @return {ReleaseCatalog} 可安全展示的安装包目录。
 */
export function parseReleaseCatalog(value: unknown): ReleaseCatalog {
  if (!value || typeof value !== "object") throw new Error("Invalid release");
  const release = value as Record<string, unknown>;
  if (
    release.draft !== false || release.prerelease !== false ||
    typeof release.tag_name !== "string" || !Array.isArray(release.assets)
  ) {
    throw new Error("Invalid stable release");
  }
  const downloads: InstallerDownload[] = [];
  for (const asset of release.assets) {
    if (!asset || typeof asset !== "object") continue;
    const { name, browser_download_url: url, size, state } = asset;
    if (
      typeof name !== "string" || !Object.hasOwn(installerAssets, name) ||
      typeof url !== "string" || state !== "uploaded" ||
      !Number.isSafeInteger(size) || size <= 0
    ) continue;
    const expected = `${projectRepositoryUrl}/releases/download/${
      encodeURIComponent(release.tag_name)
    }/${name}`;
    if (url !== expected) continue;
    if (downloads.some((entry) => entry.name === name)) continue;
    downloads.push({
      name,
      platform: installerAssets[name as keyof typeof installerAssets],
      url,
      size,
    });
  }
  return {
    status: downloads.length ? "available" : "empty",
    version: release.tag_name.slice(0, 80),
    downloads,
  };
}

/**
 * 创建带缓存和并发合并的发行目录读取器，不需要 GitHub 访问令牌。
 *
 * @param {typeof fetch} fetcher 上游请求实现。
 * @param {() => number} now 当前时间来源。
 * @return {() => Promise<ReleaseCatalog>} 获取安装包目录的函数。
 */
export function createReleaseCatalogReader(
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): () => Promise<ReleaseCatalog> {
  let cached: ReleaseCatalog | undefined;
  let expiresAt = 0;
  let pending: Promise<ReleaseCatalog> | undefined;

  /**
   * 获取并验证 GitHub 发行目录，将故障与尚无安装包的情况分开。
   *
   * @return {Promise<ReleaseCatalog>} 发行目录。
   */
  async function read(): Promise<ReleaseCatalog> {
    try {
      const response = await fetcher(releaseApiUrl, {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "heybox-topic-notifier",
          "x-github-api-version": "2022-11-28",
        },
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (response.status === 404) {
        await response.body?.cancel();
        return { status: "empty", downloads: [] };
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Release unavailable");
      }
      return parseReleaseCatalog(await response.json());
    } catch {
      return { status: "unavailable", downloads: [] };
    }
  }

  /**
   * 合并同时到达的读取请求并缓存结果。
   *
   * @return {Promise<ReleaseCatalog>} 当前有效的发行目录。
   */
  return async function getCatalog(): Promise<ReleaseCatalog> {
    if (cached && now() < expiresAt) return structuredClone(cached);
    pending ??= read().then((catalog) => {
      cached = catalog;
      expiresAt = now() +
        (catalog.status === "unavailable" ? failureCacheMs : catalogCacheMs);
      return catalog;
    }).finally(() => {
      pending = undefined;
    });
    return structuredClone(await pending);
  };
}
