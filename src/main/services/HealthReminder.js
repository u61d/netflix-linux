class HealthReminder {
  constructor(ctx) {
    this.ctx = ctx;
    this.interval = null;
    this.watchStartTime = null;
    this.totalWatchTime = 0;
    this.lastCheckTime = null;
    this.isPaused = false;
  }

  start() {
    if (!this.ctx.store.get('healthReminder') || this.interval) return;

    this.watchStartTime = Date.now();
    this.lastCheckTime = Date.now();
    this.totalWatchTime = 0;
    this.isPaused = false;

    const intervalMinutes = this.ctx.store.get('reminderInterval', 60);

    this.interval = setInterval(() => {
      this.check();
    }, 60000);

    this.ctx.logger.info(`Health reminder started: ${intervalMinutes}min intervals`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.watchStartTime = null;
      this.totalWatchTime = 0;
      this.ctx.logger.info('Health reminder stopped');
    }
  }

  async check() {
    const playbackService = this.ctx.getService('playback');
    if (!playbackService) return;

    const state = await playbackService.getState();

    if (!state) return;

    const now = Date.now();

    if (state.playing && !this.isPaused) {
      const elapsed = now - this.lastCheckTime;
      this.totalWatchTime += elapsed;
      this.isPaused = false;
    } else {
      this.isPaused = true;
    }

    this.lastCheckTime = now;

    const totalMinutes = Math.floor(this.totalWatchTime / 1000 / 60);
    const intervalMinutes = this.ctx.store.get('reminderInterval', 60);

    if (totalMinutes > 0 && totalMinutes % intervalMinutes === 0) {
      const NotificationService = require('../utils/notifications');
      const notifier = new NotificationService(this.ctx);
      notifier.notify({
        title: 'Health Reminder',
        body: `You've been watching for ${totalMinutes} minutes. Time for a break!`,
        silent: false,
        priority: 'high',
      });

      this.ctx.logger.info(`Health reminder: ${totalMinutes}m watched`);
    }
  }

  reset() {
    this.watchStartTime = Date.now();
    this.lastCheckTime = Date.now();
    this.totalWatchTime = 0;
    this.isPaused = false;
  }

  cleanup() {
    this.stop();
  }
}

module.exports = HealthReminder;
