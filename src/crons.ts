import type { AppContext } from "./services/app_context.ts";
import type { PollingSettings } from "./models.ts";

const pollSchedulerTickMs = 1000;

export function registerCrons(context: AppContext): void {
  let isPolling = false;
  let lastPollStartedAt: number | undefined;

  const tick = async () => {
    if (isPolling) {
      return;
    }

    const settings = await context.storage.getSettings();
    if (!settings.polling.enabled) {
      lastPollStartedAt = undefined;
      return;
    }

    const state = await context.storage.getAppState();
    if (!shouldPollFromLastStart(lastPollStartedAt, state.lastPollAt, settings.polling)) {
      return;
    }

    isPolling = true;
    lastPollStartedAt = Date.now();
    try {
      await context.poller.runOnce();
    } finally {
      isPolling = false;
    }
  };

  setInterval(() => {
    void tick();
  }, pollSchedulerTickMs);
}

function shouldPollFromLastStart(
  lastPollStartedAt: number | undefined,
  lastPollAt: string | undefined,
  polling: Pick<PollingSettings, "intervalUnit" | "intervalValue">,
): boolean {
  if (lastPollStartedAt === undefined) {
    return shouldPoll(lastPollAt, polling);
  }

  return Date.now() - lastPollStartedAt >= pollingIntervalMs(polling);
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
