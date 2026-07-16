import type { AppContext } from "./services/app_context.ts";
import type { PollingSettings } from "./models.ts";

const pollSchedulerTickMs = 1000;
const deployCronSchedule = "* * * * *";
const deployCronAllowedTimelines = new Set(["production", "git-branch/dev"]);

export function createPollScheduler(context: Pick<AppContext, "poller" | "storage">) {
  const pollingUserIds = new Set<string>();
  const lastPollStartedAtByUserId = new Map<string, number>();

  return {
    async tick(): Promise<boolean> {
      const userIds = await pollableUserIds(context.storage);
      let didPoll = false;

      for (const userId of userIds) {
        didPoll = await tickUser(userId) || didPoll;
      }

      return didPoll;
    },
  };

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

async function pollableUserIds(storage: AppContext["storage"]): Promise<string[]> {
  if ("listAccounts" in storage) {
    return (await storage.listAccounts()).map((account) => account.id);
  }

  return ["default"];
}

function storageForUser(storage: AppContext["storage"], userId: string) {
  return "forUser" in storage ? storage.forUser(userId) : storage;
}

export function registerCrons(context: AppContext): void {
  if (isDenoDeploy() && typeof Deno.cron === "function") {
    Deno.cron("poll heybox topics", deployCronSchedule, async () => {
      if (!shouldRunDeployCron(readDenoTimeline())) {
        return;
      }

      await context.scheduler.tick();
    });
    return;
  }

  setInterval(() => {
    void context.scheduler.tick();
  }, pollSchedulerTickMs);
}

export function shouldRunDeployCron(timeline: string | undefined): boolean {
  return timeline !== undefined && deployCronAllowedTimelines.has(timeline);
}

function readDenoTimeline(): string | undefined {
  try {
    return Deno.env.get("DENO_TIMELINE") ?? undefined;
  } catch {
    return undefined;
  }
}

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
