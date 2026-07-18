/**
 * @file 本文件负责注册和调度话题轮询定时任务。
 */
import type { AppContext } from "./services/app_context.ts";
import type { PollingSettings } from "./models.ts";

/**
 * 本地环境轮询调度器检查间隔。
 */
const pollSchedulerTickMs = 1000;
/**
 * Deno Deploy Cron 运行频率。
 */
export const deployCronSchedule = "* * * * *";
/**
 * 允许运行 Deno Deploy Cron 的 timeline 集合。
 */
const deployCronAllowedTimelines = new Set(["production", "git-branch/dev"]);

/**
 * 本地定时器注册依赖。
 */
type CronRegistrationOptions = {
  isDenoDeploy?: () => boolean;
  setInterval?: typeof setInterval;
};

/**
 * 创建轮询调度器。
 *
 * @param context 调度器依赖的轮询器和存储。
 * @return 轮询调度器。
 */
export function createPollScheduler(context: Pick<AppContext, "poller" | "storage">) {
  /**
   * 当前正在轮询的用户 ID 集合。
   */
  const pollingUserIds = new Set<string>();
  /**
   * 各用户最近一次调度开始时间。
   */
  const lastPollStartedAtByUserId = new Map<string, number>();

  return {
    /**
     * 执行一次调度检查。
     *
     * @return 本次检查是否触发过轮询。
     */
    async tick(): Promise<boolean> {
      const userIds = await pollableUserIds(context.storage);
      let didPoll = false;

      for (const userId of userIds) {
        didPoll = await tickUser(userId) || didPoll;
      }

      return didPoll;
    },

    /**
     * 执行指定用户的一次调度检查。
     *
     * @param userId 用户 ID。
     * @return 该用户是否执行了轮询。
     */
    tickUser,
  };

  /**
   * 对指定用户执行一次调度检查。
   *
   * @param userId 用户 ID。
   * @return 该用户是否执行了轮询。
   */
  async function tickUser(userId: string): Promise<boolean> {
    if (pollingUserIds.has(userId)) {
      return false;
    }

    const storage = storageForUser(context.storage, userId);
    const settings = await storage.getSettings();
    if (!settings.polling.enabled) {
      lastPollStartedAtByUserId.delete(userId);
      return false;
    }

    const state = await storage.getAppState();
    if (
      !shouldPollFromLastStart(
        lastPollStartedAtByUserId.get(userId),
        state.lastPollAt,
        settings.polling,
      )
    ) {
      return false;
    }

    pollingUserIds.add(userId);
    lastPollStartedAtByUserId.set(userId, Date.now());
    try {
      await context.poller.runOnce(storage);
      return true;
    } catch (error) {
      console.error(`Scheduled poll failed for user ${userId}`, error);
      return false;
    } finally {
      pollingUserIds.delete(userId);
    }
  }
}

/**
 * 获取需要参与轮询的用户 ID 列表。
 *
 * @param storage 应用存储。
 * @return 可轮询用户 ID 列表。
 */
async function pollableUserIds(storage: AppContext["storage"]): Promise<string[]> {
  if ("listAccounts" in storage) {
    return (await storage.listAccounts()).map((account) => account.id);
  }

  return ["default"];
}

/**
 * 获取指定用户作用域的存储。
 *
 * @param storage 应用存储。
 * @param userId 用户 ID。
 * @return 用户作用域存储。
 */
function storageForUser(storage: AppContext["storage"], userId: string) {
  return "forUser" in storage ? storage.forUser(userId) : storage;
}

/**
 * 注册运行环境对应的轮询定时任务。
 *
 * @param context 应用运行时上下文。
 * @param options 定时任务注册选项。
 */
export function registerCrons(context: AppContext, options: CronRegistrationOptions = {}): void {
  const isDeploy = options.isDenoDeploy ?? isDenoDeploy;
  if (isDeploy()) {
    return;
  }

  const registerInterval = options.setInterval ?? setInterval;
  registerInterval(() => {
    void context.scheduler.tick();
  }, pollSchedulerTickMs);
}

/**
 * 判断当前 Deno Deploy timeline 是否允许运行 Cron。
 *
 * @param timeline Deno Deploy timeline。
 * @return 允许运行时返回 true。
 */
export function shouldRunDeployCron(
  timeline: string | undefined,
): boolean {
  return timeline !== undefined && deployCronAllowedTimelines.has(timeline);
}

/**
 * 读取 Deno Deploy timeline。
 *
 * @return timeline 值，读取失败或未配置时返回 undefined。
 */
export function readDenoTimeline(): string | undefined {
  try {
    return Deno.env.get("DENO_TIMELINE") ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * 判断当前是否运行在 Deno Deploy。
 *
 * @return 运行在 Deno Deploy 时返回 true。
 */
function isDenoDeploy(): boolean {
  try {
    if (Deno.env.get("DENO_DEPLOYMENT_ID") || Deno.env.get("DENO_DEPLOY") === "true") {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * 根据最近调度开始时间判断是否应执行轮询。
 *
 * @param lastPollStartedAt 最近调度开始时间戳。
 * @param lastPollAt 最近轮询完成时间。
 * @param polling 轮询间隔设置。
 * @param now 当前时间。
 * @return 应执行轮询时返回 true。
 */
export function shouldPollFromLastStart(
  lastPollStartedAt: number | undefined,
  lastPollAt: string | undefined,
  polling: Pick<PollingSettings, "intervalUnit" | "intervalValue">,
  now: Date = new Date(),
): boolean {
  if (lastPollStartedAt === undefined) {
    return shouldPoll(lastPollAt, polling, now);
  }

  const lastPollTime = new Date(lastPollAt ?? "").getTime();
  const lastPollBaseline = Number.isFinite(lastPollTime) ? lastPollTime : lastPollStartedAt;
  const latestPollBaseline = Math.max(lastPollStartedAt, lastPollBaseline);

  return now.getTime() - latestPollBaseline >= pollingIntervalMs(polling);
}

/**
 * 根据最近轮询完成时间判断是否应执行轮询。
 *
 * @param lastPollAt 最近轮询完成时间。
 * @param polling 轮询间隔设置。
 * @param now 当前时间。
 * @return 应执行轮询时返回 true。
 */
export function shouldPoll(
  lastPollAt: string | undefined,
  polling: Pick<PollingSettings, "intervalUnit" | "intervalValue">,
  now: Date = new Date(),
): boolean {
  if (!lastPollAt) {
    return true;
  }

  const lastPollTime = new Date(lastPollAt).getTime();
  if (!Number.isFinite(lastPollTime)) {
    return true;
  }

  const intervalMs = pollingIntervalMs(polling);
  return now.getTime() - lastPollTime >= intervalMs;
}

/**
 * 计算轮询间隔毫秒数。
 *
 * @param polling 轮询间隔设置。
 * @return 轮询间隔毫秒数。
 */
export function pollingIntervalMs(
  polling: Pick<PollingSettings, "intervalUnit" | "intervalValue">,
): number {
  const intervalValue = Math.max(1, polling.intervalValue);
  switch (polling.intervalUnit) {
    case "second":
      return Math.max(3, intervalValue) * 1000;
    case "hour":
      return intervalValue * 60 * 60 * 1000;
    case "day":
      return intervalValue * 24 * 60 * 60 * 1000;
    case "week":
      return intervalValue * 7 * 24 * 60 * 60 * 1000;
    case "month":
      return intervalValue * 30 * 24 * 60 * 60 * 1000;
    case "minute":
    default:
      return intervalValue * 60 * 1000;
  }
}
