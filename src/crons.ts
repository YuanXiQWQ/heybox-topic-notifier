import type { AppContext } from "./services/app_context.ts";

export function registerCrons(context: AppContext): void {
  if (!context.config.pollEnabled) {
    return;
  }

  Deno.cron("poll-heybox-topic", "* * * * *", async () => {
    const settings = await context.storage.getSettings();
    const state = await context.storage.getAppState();
    if (!shouldPoll(state.lastPollAt, settings.polling.intervalMinutes)) {
      return;
    }

    await context.poller.runOnce();
  });
}

export function shouldPoll(
  lastPollAt: string | undefined,
  intervalMinutes: number,
  now: Date = new Date(),
): boolean {
  if (!lastPollAt) {
    return true;
  }

  const lastPollTime = new Date(lastPollAt).getTime();
  if (!Number.isFinite(lastPollTime)) {
    return true;
  }

  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
  return now.getTime() - lastPollTime >= intervalMs;
}
