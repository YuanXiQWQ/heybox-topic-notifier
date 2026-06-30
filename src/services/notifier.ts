export function createNotifier() {
  return {
    async sendMatch(): Promise<void> {
      await Promise.resolve();
    },

    async sendTest(): Promise<void> {
      await Promise.resolve();
    },
  };
}
