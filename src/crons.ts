import type { AppContext } from "./services/app_context.ts";

export function registerCrons(context: AppContext): void {
  if (!context.config.pollEnabled) {
    return;
  }

  Deno.cron("poll-heybox-topic", "* * * * *", async () => {
    await context.poller.runOnce();
  });
}
