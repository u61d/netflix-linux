const { autoUpdater } = require('electron-updater');
const { app, dialog } = require('electron');
const https = require('https');

class UpdateService {
  constructor(ctx) {
    this.ctx = ctx;
    this.checking = false;
    this.releasesCache = { at: 0, data: [] };
    this.lastMetadataWarnAt = 0;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    this.applyChannelSettings();

    this.setupListeners();
  }

  applyChannelSettings() {
    const channel = this.ctx.store.get('updateChannel', 'stable');
    autoUpdater.channel = channel === 'beta' ? 'beta' : 'latest';
    autoUpdater.allowPrerelease = channel === 'beta';
    this.ctx.logger.info(`Update channel configured: ${channel}`);
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
      if (this.isMissingUpdateMetadataError(err)) {
        this.warnMissingMetadata('event');
        return;
      }

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
    this.applyChannelSettings();

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      if (this.isMissingUpdateMetadataError(error)) {
        this.warnMissingMetadata('check');
        if (manual) {
          const NotificationService = require('../utils/notifications');
          const notifier = new NotificationService(this.ctx);
          notifier.notify({
            title: 'Updater Metadata Missing',
            body: 'Release is missing latest/beta Linux YAML files',
            priority: 'high',
          });
        }
        return;
      }

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

  isMissingUpdateMetadataError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return (
      message.includes('latest-linux.yml') ||
      message.includes('beta-linux.yml') ||
      message.includes('latest.yml')
    );
  }

  warnMissingMetadata(source = 'unknown') {
    const now = Date.now();
    if (now - this.lastMetadataWarnAt < 15000) return;
    this.lastMetadataWarnAt = now;

    this.ctx.logger.warn(
      `Updater metadata missing (${source}): expected latest-linux.yml or beta-linux.yml in release assets.`
    );
    this.ctx.logger.warn(
      'Auto-updates are disabled until release metadata files are uploaded with the build.'
    );
  }

  getUpdateStatus() {
    return {
      currentVersion: app.getVersion(),
      channel: this.ctx.store.get('updateChannel', 'stable'),
      autoCheck: this.ctx.store.get('autoCheckUpdates', true),
      checking: this.checking,
    };
  }

  async listRecentReleases(force = false) {
    const now = Date.now();
    if (
      !force &&
      now - this.releasesCache.at < 5 * 60 * 1000 &&
      this.releasesCache.data.length > 0
    ) {
      return this.releasesCache.data;
    }

    const releases = await new Promise((resolve, reject) => {
      const request = https.get(
        'https://api.github.com/repos/u61d/netflix-linux/releases?per_page=10',
        {
          headers: {
            'User-Agent': 'netflix-linux-updater',
            Accept: 'application/vnd.github+json',
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              return reject(new Error(`GitHub API returned ${res.statusCode}`));
            }
            try {
              const parsed = JSON.parse(body);
              if (!Array.isArray(parsed)) {
                return reject(new Error('Invalid releases response'));
              }
              const normalized = parsed.map((item) => ({
                tag: item.tag_name,
                name: item.name,
                prerelease: Boolean(item.prerelease),
                publishedAt: item.published_at,
                url: item.html_url,
              }));
              const channel = this.ctx.store.get('updateChannel', 'stable');
              resolve(
                channel === 'beta' ? normalized : normalized.filter((item) => !item.prerelease)
              );
            } catch (error) {
              reject(error);
            }
          });
        }
      );
      request.on('error', reject);
      request.setTimeout(8000, () => {
        request.destroy(new Error('Release request timeout'));
      });
    });

    this.releasesCache = { at: now, data: releases };
    return releases;
  }

  async rollbackToVersion(tag) {
    if (!tag || typeof tag !== 'string') {
      throw new Error('Invalid rollback target');
    }

    const normalizedTag = tag.startsWith('v') ? tag : `v${tag}`;
    const { shell } = require('electron');
    const target = `https://github.com/u61d/netflix-linux/releases/tag/${normalizedTag}`;
    await shell.openExternal(target);

    const NotificationService = require('../utils/notifications');
    const notifier = new NotificationService(this.ctx);
    notifier.notify({
      title: 'Rollback',
      body: `Open release page for ${normalizedTag}`,
      priority: 'high',
    });
    return target;
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
    if (!this.ctx.store.get('autoCheckUpdates', true)) {
      this.ctx.logger.info('Startup update check disabled by settings');
      return;
    }
    setTimeout(() => {
      this.checkForUpdates(false);
    }, 30000);
  }
}

module.exports = UpdateService;
