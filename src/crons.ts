import type { AppContext } from "./services/app_context.ts";
import type { PollingSettings } from "./models.ts";

const pollSchedulerTickMs = 1000;
const deployCronSchedule = "* * * * *";

export function createPollScheduler(context: Pick<AppContext, "poller" | "storage">) {
  let isPolling = false;
  let lastPollStartedAt: number | undefined;

  return {
    async tick(): Promise<boolean> {
      if (isPolling) {
        return false;
      }

      const settings = await context.storage.getSettings();
      if (!settings.polling.enabled) {
        lastPollStartedAt = undefined;
        return false;
      }

      const state = await context.storage.getAppState();
      if (!shouldPollFromLastStart(lastPollStartedAt, state.lastPollAt, settings.polling)) {
        return false;
      }

      isPolling = true;
      lastPollStartedAt = Date.now();
      try {
        await context.poller.runOnce();
        return true;
      } catch (error) {
        console.error("Scheduled poll failed", error);
        return false;
      } finally {
        isPolling = false;
      }
    },
  };
}

export function registerCrons(context: AppContext): void {
  if (isDenoDeploy() && typeof Deno.cron === "function") {
    Deno.cron("poll heybox topics", deployCronSchedule, async () => {
      await context.scheduler.tick();
    });
    return;
  }

  setInterval(() => {
    void context.scheduler.tick();
  }, pollSchedulerTickMs);
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
