const { ipcMain, dialog } = require('electron');
const ValidationService = require('../utils/validation');

module.exports = function setupSettingsHandlers(ctx) {
  const validator = new ValidationService();

  ipcMain.handle('get-settings', async () => {
    try {
      return {
        discordEnabled: ctx.store.get('discordEnabled', true),
        playbackSpeed: ctx.store.get('playbackSpeed', 1.0),
        autoSkipIntro: ctx.store.get('autoSkipIntro', true),
        autoSkipRecap: ctx.store.get('autoSkipRecap', true),
        autoSkipCredits: ctx.store.get('autoSkipCredits', false),
        autoNextEpisode: ctx.store.get('autoNextEpisode', false),
        screenshotsDir: ctx.store.get('screenshotsDir'),
        notificationsEnabled: ctx.store.get('notificationsEnabled', true),
        quietMode: ctx.store.get('quietMode', false),
        borderless: ctx.store.get('borderless', false),
        alwaysOnTop: ctx.store.get('alwaysOnTop', false),
        startMinimized: ctx.store.get('startMinimized', false),
        autoPauseOnBlur: ctx.store.get('autoPauseOnBlur', false),
        showDetailedStats: ctx.store.get('showDetailedStats', false),
        healthReminder: ctx.store.get('healthReminder', false),
        reminderInterval: ctx.store.get('reminderInterval', 60),
        screenshotSound: ctx.store.get('screenshotSound', false),
        screenshotNotification: ctx.store.get('screenshotNotification', true),
        debugMode: ctx.store.get('debugMode', false),
        sentryEnabled: ctx.store.get('sentryEnabled', false),
      };
    } catch (error) {
      ctx.logger.error('get-settings error:', error);
      throw error;
    }
  });

  ipcMain.handle('validate-setting', async (_event, key, value) => {
    return validator.validate(key, value);
  });

  ipcMain.handle('update-settings', async (_event, updates) => {
    try {
      if (!updates || typeof updates !== 'object') {
        throw new Error('Invalid settings object');
      }

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) continue;

        const validation = validator.validate(key, value);
        if (!validation.valid) {
          throw new Error(`${key}: ${validation.error}`);
        }
      }

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) continue;
        const sanitized = typeof value === 'string' ? validator.sanitizeString(value) : value;
        ctx.store.set(key, sanitized);
      }

      const win = ctx.getMainWindow();
      if (win && 'alwaysOnTop' in updates) {
        win.setAlwaysOnTop(updates.alwaysOnTop);
      }

      if ('discordEnabled' in updates) {
        const rpcManager = ctx.getManager('rpc');
        if (updates.discordEnabled) {
          rpcManager.start();
        } else {
          rpcManager.stop();
        }
      }

      if ('showDetailedStats' in updates) {
        const statsOverlay = ctx.getService('statsOverlay');
        if (updates.showDetailedStats) {
          statsOverlay.start();
        } else {
          statsOverlay.stop();
        }
      }

      if ('sentryEnabled' in updates) {
        const sentry = ctx.getManager('sentry');
        if (sentry) {
          sentry.setUserContent(Boolean(updates.sentryEnabled));
        }
      }

      if ('healthReminder' in updates) {
        const healthReminder = ctx.getService('healthReminder');
        if (updates.healthReminder) {
          healthReminder.start();
        } else {
          healthReminder.stop();
        }
      }

      ctx.logger.info('Settings updated:', Object.keys(updates).join(', '));
      return true;
    } catch (error) {
      ctx.logger.error('update-settings error:', error);
      throw error;
    }
  });

  ipcMain.handle('choose-screenshot-dir', async () => {
    const win = ctx.getMainWindow();
    if (!win) return null;

    try {
      const result = await dialog.showOpenDialog(win, {
        title: 'Select screenshots folder',
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: ctx.store.get('screenshotsDir'),
      });
      if (result.canceled || !result.filePaths?.length) return null;

      const dir = result.filePaths[0];
      ctx.store.set('screenshotsDir', dir);
      return dir;
    } catch (error) {
      ctx.logger.error('choose-screenshot-dir error:', error);
      throw error;
    }
  });

  ipcMain.handle('export-settings', async () => {
    const win = ctx.getMainWindow();
    if (!win) return null;

    try {
      const { dialog } = require('electron');
      const { filePath, canceled } = await dialog.showSaveDialog(win, {
        title: 'Export Settings',
        defaultPath: 'netflix-settings.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });

      if (canceled || !filePath) return null;

      const settings = {
        version: 1,
        exported: new Date().toISOString(),
        settings: {
          discordEnabled: ctx.store.get('discordEnabled'),
          playbackSpeed: ctx.store.get('playbackSpeed'),
          autoSkipIntro: ctx.store.get('autoSkipIntro'),
          autoSkipCredits: ctx.store.get('autoSkipCredits'),
          autoNextEpisode: ctx.store.get('autoNextEpisode'),
          notificationsEnabled: ctx.store.get('notificationsEnabled'),
          quietMode: ctx.store.get('quietMode'),
          borderless: ctx.store.get('borderless'),
          alwaysOnTop: ctx.store.get('alwaysOnTop'),
          startMinimized: ctx.store.get('startMinimized'),
          autoPauseOnBlur: ctx.store.get('autoPauseOnBlur'),
          showDetailedStats: ctx.store.get('showDetailedStats'),
          healthReminder: ctx.store.get('healthReminder'),
          reminderInterval: ctx.store.get('reminderInterval'),
          screenshotSound: ctx.store.get('screenshotSound'),
          screenshotNotification: ctx.store.get('screenshotNotification'),
          customKeybinds: ctx.store.get('customKeybinds'),
        },
      };

      const fs = require('fs');
      fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');

      ctx.logger.info('settings exported to:', filePath);
      return filePath;
    } catch (error) {
      ctx.logger.error('export-settings error:', error);
      throw error;
    }
  });

  ipcMain.handle('import-settings', async () => {
    const win = ctx.getMainWindow();
    if (!win) return false;

    try {
      const { dialog } = require('electron');
      const { filePaths, canceled } = await dialog.showOpenDialog(win, {
        title: 'Import Settings',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      });

      if (canceled || !filePaths || filePaths.length === 0) return false;

      const fs = require('fs');
      const data = fs.readFileSync(filePaths[0], 'utf8');
      const imported = JSON.parse(data);

      if (!imported.version || !imported.settings) {
        throw new Error('Invalid settings file');
      }

      for (const [key, value] of Object.entries(imported.settings)) {
        if (value !== undefined) {
          ctx.store.set(key, value);
        }
      }

      ctx.logger.info('Settings imported from:', filePaths[0]);

      const NotificationService = require('../utils/notifications');
      const notifier = new NotificationService(ctx);
      notifier.notify({
        title: 'Settings Imported',
        body: 'Restart to apply all changes',
        priority: 'high',
      });

      return true;
    } catch (error) {
      ctx.logger.error('import-settings error:', error);
      throw error;
    }
  });

  ctx.logger.debug('Settings handlers registered');
};
