const { autoUpdater } = require('electron-updater');
const { app, dialog } = require('electron');

class UpdateService {
  constructor(ctx) {
    this.ctx = ctx;
    this.checking = false;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    this.setupListeners();
  }

  setupListeners() {
    autoUpdater.on('checking-for-update', () => {
      this.ctx.logger.info('Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      this.ctx.logger.info('Update available:', info.version);
      this.promptUpdate(info);
    });

    autoUpdater.on('update-not-available', (info) => {
      this.ctx.logger.info('No updates available:', info.version);

      if (this.checking) {
        const NotificationService = require('../utils/notifications');
        const notifier = new NotificationService(this.ctx);
        notifier.notify({
          title: 'No Updates',
          body: 'You are running the latest version',
          priority: 'high',
        });
      }
    });

    autoUpdater.on('error', (err) => {
      this.ctx.logger.error('Update error:', err);

      if (this.checking) {
        const NotificationService = require('../utils/notifications');
        const notifier = new NotificationService(this.ctx);
        notifier.notify({
          title: 'Update Check Failed',
          body: 'Could not check for updates',
          priority: 'high',
        });
      }
    });

    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.round(progress.percent);
      this.ctx.logger.debug(`Download progress: ${percent}%`);

      const win = this.ctx.getMainWindow();
      if (win) {
        win.setProgressBar(progress.percent / 100);
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.ctx.logger.info('Update downloaded:', info.version);

      const win = this.ctx.getMainWindow();
      if (win) {
        win.setProgressBar(-1);
      }

      this.promptInstall(info);
    });
  }

  async checkForUpdates(manual = false) {
    this.checking = manual;

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.ctx.logger.error('Check for updates failed:', error);

      if (manual) {
        const NotificationService = require('../utils/notifications');
        const notifier = new NotificationService(this.ctx);
        notifier.notify({
          title: 'Update Check Failed',
          body: error.message,
          priority: 'high',
        });
      }
    } finally {
      this.checking = false;
    }
  }

  promptUpdate(info) {
    const win = this.ctx.getMainWindow();
    if (!win) return;

    const response = dialog.showMessageBoxSync(win, {
      type: 'info',
      title: 'Update Available',
      message: `Netflix for Linux v${info.version} is available`,
      detail: `You are currently running v${app.getVersion()}.\n\nWould you like to download the update now?`,
      buttons: ['Download', 'Later', 'Release Notes'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      this.downloadUpdate();
    } else if (response === 2) {
      const { shell } = require('electron');
      shell.openExternal(`https://github.com/u61d/netflix-linux/releases/tag/v${info.version}`);
    }
  }

  async downloadUpdate() {
    const NotificationService = require('../utils/notifications');
    const notifier = new NotificationService(this.ctx);

    notifier.notify({
      title: 'Downloading Update',
      body: 'Update is downloading in the background...',
      priority: 'high',
    });

    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.ctx.logger.error('Download update failed:', error);

      notifier.notify({
        title: 'Download Failed',
        body: error.message,
        priority: 'high',
      });
    }
  }

  promptInstall(info) {
    const win = this.ctx.getMainWindow();
    if (!win) return;

    const response = dialog.showMessageBoxSync(win, {
      type: 'info',
      title: 'Update Ready',
      message: `Netflix for Linux v${info.version} has been downloaded`,
      detail:
        'The update will be installed when you restart the application.\n\nWould you like to restart now?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  }

  scheduleStartupCheck() {
    setTimeout(() => {
      this.checkForUpdates(false);
    }, 30000);
  }
}

module.exports = UpdateService;
