/**
 * @file 提供网页与客户端共享的项目标识和版本来源。
 */

/** 项目的固定 GitHub 仓库，下载地址只允许来自此仓库。 */
export const projectRepository = "YuanXiQWQ/heybox-topic-notifier";
/** 项目仓库主页。 */
export const projectRepositoryUrl = `https://github.com/${projectRepository}`;
/** 未经发行构建注入版本号时使用的开发版本标记。 */
export const developmentVersion = "dev";

/**
 * 读取部署构建注入的版本号，不把最新发行版本误当成当前部署版本。
 *
 * @param {string | undefined} value 构建环境中的 APP_VERSION。
 * @return {string} 当前部署版本或开发标记。
 */
export function projectVersion(value?: string): string {
  const version = value?.trim();
  return version && /^[0-9A-Za-z.+_-]{1,80}$/.test(version)
    ? version
    : developmentVersion;
}
