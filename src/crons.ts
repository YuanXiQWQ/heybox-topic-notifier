/**
 * @file 本文件负责注册和调度话题轮询定时任务。
 */
import { resolvePolling } from "../static/polling-schedule-core.js";
import type { AppContext } from "./services/app_context.ts";
import type { PollingSettings } from "./models.ts";
import type { PollScheduleEntry, Storage } from "./storage/types.ts";
import type { createPoller } from "./services/poller.ts";

/** 调度器依赖的存储与轮询执行能力。 */
type SchedulerContext = {
  storage: Storage;
  poller: Pick<ReturnType<typeof createPoller>, "runOnce">;
};

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
 * @param {SchedulerContext} context 调度器依赖的轮询器和存储。
 * @return {object} 轮询调度器。
 */
export function createPollScheduler(
  context: SchedulerContext,
) {
  /**
   * 当前正在轮询的用户 ID 集合。
   */
  const pollingUserIds = new Set<string>();
  /**
   * 各用户最近一次调度开始时间。
   */
  const lastPollStartedAtByUserId = new Map<string, number>();
  /** 已开始的轮询所属时段，避免跨边界完成的旧轮询吞掉新时段。 */
  const lastPollKeyByUserId = new Map<string, string>();
  let scheduling = false;
  let stopping = false;
  /** 等待后台及接口发起的调度任务全部结束的关闭回调。 */
  const idleWaiters = new Set<() => void>();

  return {
    /**
     * 执行一次调度检查。
     *
     * @return {Promise<boolean>} 本次检查是否触发过轮询。
     */
    async tick(): Promise<boolean> {
      if (stopping || scheduling) return false;
      scheduling = true;
      try {
        const schedule = await context.storage.listPollSchedule?.();
        let didPoll = false;
        if (schedule) {
          for (const entry of schedule) {
            didPoll = await tickUser(entry.userId, entry) || didPoll;
          }
        } else {
          for (const userId of await pollableUserIds(context.storage)) {
            didPoll = await tickUser(userId) || didPoll;
          }
        }
        return didPoll;
      } finally {
        scheduling = false;
        notifyIdle();
      }
    },

    /**
     * 执行指定用户的一次调度检查。
     *
     * @param {string} userId 用户 ID。
     * @return {Promise<boolean>} 该用户是否执行了轮询。
     */
    tickUser,
    /**
     * 禁止新调度并等待正在执行的任务落盘，供受控重启使用。
     * @return {Promise<void>} 所有本调度器任务结束后的 Promise。
     */
    stop(): Promise<void> {
      stopping = true;
      return !scheduling && pollingUserIds.size === 0
        ? Promise.resolve()
        : new Promise((resolve) => {
          idleWaiters.add(resolve);
        });
    },
  };

  /** 所有调度任务结束时唤醒等待关闭的调用方。 */
  function notifyIdle(): void {
    if (scheduling || pollingUserIds.size) return;
    for (const resolve of idleWaiters) resolve();
    idleWaiters.clear();
  }

  /**
   * 按当前时段检查指定用户，跳过暂停时段，进入轮询时段时立即调度，未覆盖时间使用默认参数。
   *
   * @param {string} userId 用户 ID。
   * @param {PollScheduleEntry | undefined} snapshot 同一次调度已读取的账号快照。
   * @return {Promise<boolean>} 该用户是否执行了轮询。
   */
  async function tickUser(
    userId: string,
    snapshot?: PollScheduleEntry,
  ): Promise<boolean> {
    if (stopping || pollingUserIds.has(userId)) {
      return false;
    }

    pollingUserIds.add(userId);
    try {
      const storage = storageForUser(context.storage, userId);
      const settings = snapshot?.settings ?? await storage.getSettings();
      if (!settings.polling.enabled) {
        lastPollStartedAtByUserId.delete(userId);
        lastPollKeyByUserId.delete(userId);
        return false;
      }

      const lastPollAt = snapshot
        ? snapshot.lastPollAt
        : await storage.getLastPollAt();
      const now = new Date();
      const effective = resolvePolling(settings.polling, now);
      if (!(effective.polling as PollingSettings).enabled) {
        lastPollKeyByUserId.set(userId, effective.key);
        return false;
      }
      const previous = Math.max(
        lastPollStartedAtByUserId.get(userId) ?? 0,
        Date.parse(lastPollAt ?? "") || 0,
      );
      const previousKey = lastPollKeyByUserId.get(userId) ??
        (previous > 0
          ? resolvePolling(settings.polling, new Date(previous)).key
          : undefined);
      const entered = previousKey !== undefined &&
        effective.key !== previousKey;
      if (
        !entered && !shouldPollFromLastStart(
          lastPollStartedAtByUserId.get(userId),
          lastPollAt,
          effective.polling as PollingSettings,
          now,
        )
      ) {
        return false;
      }

      lastPollStartedAtByUserId.set(userId, now.getTime());
      lastPollKeyByUserId.set(userId, effective.key);
      await context.poller.runOnce(
        storage,
        effective.polling === settings.polling
          ? settings
          : { ...settings, polling: effective.polling as PollingSettings },
      );
      return true;
    } catch (error) {
      console.error(`Scheduled poll failed for user ${userId}`, error);
      return false;
    } finally {
      pollingUserIds.delete(userId);
      notifyIdle();
    }
  }
}

/**
 * 获取需要参与轮询的用户 ID 列表。
 *
 * @param storage 应用存储。
 * @return 可轮询用户 ID 列表。
 */
async function pollableUserIds(
  storage: AppContext["storage"],
): Promise<string[]> {
  if ("listAccounts" in storage) {
    return (await storage.listAccounts()).map((account) => account.id);
  }

  return ["default"];
}

/**
 * 获取指定用户作用域的存储。
 *
 * @param storage 应用存储。
 * @param {string} userId 用户 ID。
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
 * @return {() => void} 停止定时检查的清理函数。
 */
export function registerCrons(
  context: AppContext,
  options: CronRegistrationOptions = {},
): () => void {
  const isDeploy = options.isDenoDeploy ?? isDenoDeploy;
  if (isDeploy()) {
    return () => {};
  }

  const registerInterval = options.setInterval ?? setInterval;
  const timer = registerInterval(() => {
    void context.scheduler.tick().catch((error) =>
      console.error("Poll schedule refresh failed", error)
    );
  }, pollSchedulerTickMs);
  return () => clearInterval(timer);
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
    if (
      Deno.env.get("DENO_DEPLOYMENT_ID") ||
      Deno.env.get("DENO_DEPLOY") === "true"
    ) {
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
  polling: Pick<
    PollingSettings,
    "intervalStartedAt" | "intervalUnit" | "intervalValue"
  >,
  now: Date = new Date(),
): boolean {
  const latestPollBaseline = latestValidTimestamp(
    lastPollStartedAt,
    Date.parse(lastPollAt ?? ""),
    Date.parse(polling.intervalStartedAt ?? ""),
  );

  return latestPollBaseline === undefined ||
    now.getTime() - latestPollBaseline >= pollingIntervalMs(polling);
}

/**
 * 从候选时间戳中获取最新的合法值。
 *
 * @param values 候选毫秒时间戳。
 * @return 最新合法时间戳，不存在时返回 undefined。
 */
function latestValidTimestamp(
  ...values: Array<number | undefined>
): number | undefined {
  const timestamps = values.filter((value): value is number =>
    typeof value === "number" && Number.isFinite(value)
  );
  return timestamps.length > 0 ? Math.max(...timestamps) : undefined;
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
