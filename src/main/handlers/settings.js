const { ipcMain, dialog, app } = require('electron');
const fs = require('fs');
const ValidationService = require('../utils/validation');
const { registerHandle } = require('../utils/ipcTrace');

module.exports = function setupSettingsHandlers(ctx) {
  const validator = new ValidationService();

  registerHandle(ctx, ipcMain, 'get-settings', async () => {
    try {
      return {
        discordEnabled: ctx.store.get('discordEnabled', true),
        autoCheckUpdates: ctx.store.get('autoCheckUpdates', true),
        updateChannel: ctx.store.get('updateChannel', 'stable'),
        playbackSpeed: ctx.store.get('playbackSpeed', 1.0),
        autoSkipIntro: ctx.store.get('autoSkipIntro', true),
        autoSkipRecap: ctx.store.get('autoSkipRecap', true),
        autoSkipCredits: ctx.store.get('autoSkipCredits', false),
        autoNextEpisode: ctx.store.get('autoNextEpisode', false),
        sessionRestoreEnabled: ctx.store.get('sessionRestoreEnabled', true),
        screenshotsDir: ctx.store.get('screenshotsDir'),
        notificationsEnabled: ctx.store.get('notificationsEnabled', true),
        quietMode: ctx.store.get('quietMode', false),
        borderless: ctx.store.get('borderless', false),
        alwaysOnTop: ctx.store.get('alwaysOnTop', false),
        startMinimized: ctx.store.get('startMinimized', false),
        uiTheme: ctx.store.get('uiTheme', 'netflix-red'),
        compactMode: ctx.store.get('compactMode', false),
        autoPauseOnBlur: ctx.store.get('autoPauseOnBlur', false),
        showDetailedStats: ctx.store.get('showDetailedStats', false),
        networkMetricsEnabled: ctx.store.get('networkMetricsEnabled', true),
        selectorHealthAlerts: ctx.store.get('selectorHealthAlerts', true),
        healthReminder: ctx.store.get('healthReminder', false),
        reminderInterval: ctx.store.get('reminderInterval', 60),
        screenshotSound: ctx.store.get('screenshotSound', false),
        screenshotNotification: ctx.store.get('screenshotNotification', true),
        debugMode: ctx.store.get('debugMode', false),
        sentryEnabled: ctx.store.get('sentryEnabled', false),
        crashSafeMode: ctx.store.get('crashSafeMode', true),
        safeModeActive: ctx.store.get('safeModeActive', false),
        crashCount: ctx.store.get('crashCount', 0),

        subtitleCustomizationEnabled: ctx.store.get('subtitleCustomizationEnabled', false),
        subtitleFontSize: ctx.store.get('subtitleFontSize', 'medium'),
        subtitleFontFamily: ctx.store.get('subtitleFontFamily', 'default'),
        subtitleTextColor: ctx.store.get('subtitleTextColor', '#ffffff'),
        subtitleBackgroundColor: ctx.store.get('subtitleBackgroundColor', '#000000'),
        subtitleBackgroundOpacity: ctx.store.get('subtitleBackgroundOpacity', 75),
        subtitleEdgeStyle: ctx.store.get('subtitleEdgeStyle', 'dropshadow'),
        subtitleVerticalOffset: ctx.store.get('subtitleVerticalOffset', 0),
      };
    } catch (error) {
      ctx.logger.error('get-settings error:', error);
      throw error;
    }
  });

  registerHandle(ctx, ipcMain, 'validate-setting', async (_event, key, value) => {
    return validator.validate(key, value);
  });

  registerHandle(ctx, ipcMain, 'update-settings', async (_event, updates) => {
    try {
      if (!updates || typeof updates !== 'object') {
        throw new Error('Invalid settings object');
      }

      const previousValues = {};

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) continue;

        const validation = validator.validate(key, value);
        if (!validation.valid) {
          throw new Error(`${key}: ${validation.error}`);
        }
      }

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) continue;
        previousValues[key] = ctx.store.get(key);
        const sanitized = typeof value === 'string' ? validator.sanitizeString(value) : value;
        ctx.store.set(key, sanitized);
      }

      const hasChanged = (key) => {
        if (!(key in updates)) return false;
        const incoming =
          typeof updates[key] === 'string' ? validator.sanitizeString(updates[key]) : updates[key];
        return previousValues[key] !== incoming;
      };

      const win = ctx.getMainWindow();
      if (win && hasChanged('alwaysOnTop')) {
        win.setAlwaysOnTop(updates.alwaysOnTop);
      }

      if (hasChanged('uiTheme') || hasChanged('compactMode')) {
        const windowManager = ctx.getManager('window');
        windowManager?.applyAppearanceToAllWindows();
      }

      if (hasChanged('discordEnabled')) {
        const rpcManager = ctx.getManager('rpc');
        if (updates.discordEnabled) {
          rpcManager.start();
        } else {
          rpcManager.stop();
        }
      }

      if (hasChanged('showDetailedStats')) {
        const statsOverlay = ctx.getService('statsOverlay');
        if (updates.showDetailedStats) {
          statsOverlay.start();
        } else {
          statsOverlay.stop();
        }
      }

      if (hasChanged('sentryEnabled')) {
        const sentry = ctx.getManager('sentry');
        if (sentry) {
          sentry.setUserContent(Boolean(updates.sentryEnabled));
        }
      }

      if (hasChanged('debugMode')) {
        ctx.logger.setLevel(updates.debugMode ? 'debug' : 'info');
      }

      if (hasChanged('crashSafeMode') && !updates.crashSafeMode) {
        ctx.store.set('safeModeActive', false);
        ctx.store.set('crashCount', 0);
      }

      if (hasChanged('healthReminder')) {
        const healthReminder = ctx.getService('healthReminder');
        if (updates.healthReminder) {
          healthReminder.start();
        } else {
          healthReminder.stop();
        }
      }

      if (hasChanged('updateChannel') || hasChanged('autoCheckUpdates')) {
        const updateService = ctx.getService('update');
        updateService?.applyChannelSettings();
      }

      const subtitleKeys = [
        'subtitleCustomizationEnabled',
        'subtitleFontSize',
        'subtitleFontFamily',
        'subtitleTextColor',
        'subtitleBackgroundColor',
        'subtitleBackgroundOpacity',
        'subtitleEdgeStyle',
        'subtitleVerticalOffset',
      ];
      if (subtitleKeys.some((key) => hasChanged(key))) {
        const subtitleStyle = ctx.getService('subtitleStyle');
        await subtitleStyle?.apply();
      }

      const changedKeys = Object.keys(updates).filter((key) => hasChanged(key));
      ctx.logger.info(`Settings updated: ${changedKeys.join(', ') || 'no changes'}`);
      return true;
    } catch (error) {
      ctx.logger.error('update-settings error:', error);
      throw error;
    }
  });

  registerHandle(ctx, ipcMain, 'choose-screenshot-dir', async () => {
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

  registerHandle(ctx, ipcMain, 'export-settings', async () => {
    const win = ctx.getMainWindow();
    if (!win) return null;

    try {
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
          autoCheckUpdates: ctx.store.get('autoCheckUpdates'),
          updateChannel: ctx.store.get('updateChannel'),
          playbackSpeed: ctx.store.get('playbackSpeed'),
          autoSkipIntro: ctx.store.get('autoSkipIntro'),
          autoSkipRecap: ctx.store.get('autoSkipRecap'),
          autoSkipCredits: ctx.store.get('autoSkipCredits'),
          autoNextEpisode: ctx.store.get('autoNextEpisode'),
          sessionRestoreEnabled: ctx.store.get('sessionRestoreEnabled'),
          notificationsEnabled: ctx.store.get('notificationsEnabled'),
          quietMode: ctx.store.get('quietMode'),
          borderless: ctx.store.get('borderless'),
          alwaysOnTop: ctx.store.get('alwaysOnTop'),
          startMinimized: ctx.store.get('startMinimized'),
          uiTheme: ctx.store.get('uiTheme'),
          compactMode: ctx.store.get('compactMode'),
          autoPauseOnBlur: ctx.store.get('autoPauseOnBlur'),
          showDetailedStats: ctx.store.get('showDetailedStats'),
          networkMetricsEnabled: ctx.store.get('networkMetricsEnabled'),
          selectorHealthAlerts: ctx.store.get('selectorHealthAlerts'),
          healthReminder: ctx.store.get('healthReminder'),
          reminderInterval: ctx.store.get('reminderInterval'),
          screenshotSound: ctx.store.get('screenshotSound'),
          screenshotNotification: ctx.store.get('screenshotNotification'),
          crashSafeMode: ctx.store.get('crashSafeMode'),
          customKeybinds: ctx.store.get('customKeybinds'),
          subtitleCustomizationEnabled: ctx.store.get('subtitleCustomizationEnabled'),
          subtitleFontSize: ctx.store.get('subtitleFontSize'),
          subtitleFontFamily: ctx.store.get('subtitleFontFamily'),
          subtitleTextColor: ctx.store.get('subtitleTextColor'),
          subtitleBackgroundColor: ctx.store.get('subtitleBackgroundColor'),
          subtitleBackgroundOpacity: ctx.store.get('subtitleBackgroundOpacity'),
          subtitleEdgeStyle: ctx.store.get('subtitleEdgeStyle'),
          subtitleVerticalOffset: ctx.store.get('subtitleVerticalOffset'),
        },
      };

      fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');

      ctx.logger.info('settings exported to:', filePath);
      return filePath;
    } catch (error) {
      ctx.logger.error('export-settings error:', error);
      throw error;
    }
  });

  registerHandle(ctx, ipcMain, 'import-settings', async () => {
    const win = ctx.getMainWindow();
    if (!win) return false;

    try {
      const { filePaths, canceled } = await dialog.showOpenDialog(win, {
        title: 'Import Settings',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      });

      if (canceled || !filePaths || filePaths.length === 0) return false;

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

  registerHandle(ctx, ipcMain, 'check-selector-health', async () => {
    try {
      const autoSkipper = ctx.getService('autoSkipper');
      if (!autoSkipper) throw new Error('AutoSkipper service unavailable');
      return await autoSkipper.runSelectorHealthCheck();
    } catch (error) {
      ctx.logger.error('check-selector-health error:', error);
      throw error;
    }
  });

  registerHandle(ctx, ipcMain, 'export-selector-health', async () => {
    const win = ctx.getMainWindow();
    if (!win) return null;
    try {
      const autoSkipper = ctx.getService('autoSkipper');
      if (!autoSkipper) throw new Error('AutoSkipper service unavailable');
      const diagnostics = await autoSkipper.runSelectorHealthCheck();
      const { filePath, canceled } = await dialog.showSaveDialog(win, {
        title: 'Export Selector Diagnostics',
        defaultPath: `netflix-selectors-${Date.now()}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (canceled || !filePath) return null;
      const payload = {
        exportedAt: new Date().toISOString(),
        appVersion: app.getVersion(),
        selectorsVersion: require('../../config/selectors.json').version,
        diagnostics,
        settings: {
          autoSkipIntro: ctx.store.get('autoSkipIntro'),
          autoSkipRecap: ctx.store.get('autoSkipRecap'),
          autoSkipCredits: ctx.store.get('autoSkipCredits'),
          autoNextEpisode: ctx.store.get('autoNextEpisode'),
        },
      };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
      return filePath;
    } catch (error) {
      ctx.logger.error('export-selector-health error:', error);
      throw error;
    }
  });

  registerHandle(ctx, ipcMain, 'get-update-status', async () => {
    const updateService = ctx.getService('update');
    return updateService?.getUpdateStatus() || null;
  });

  registerHandle(ctx, ipcMain, 'check-updates-now', async () => {
    const updateService = ctx.getService('update');
    if (!updateService) throw new Error('Update service unavailable');
    await updateService.checkForUpdates(true);
    return true;
  });

  registerHandle(ctx, ipcMain, 'list-update-releases', async (_event, force = false) => {
    const updateService = ctx.getService('update');
    if (!updateService) throw new Error('Update service unavailable');
    return await updateService.listRecentReleases(Boolean(force));
  });

  registerHandle(ctx, ipcMain, 'rollback-version', async (_event, tag) => {
    const updateService = ctx.getService('update');
    if (!updateService) throw new Error('Update service unavailable');
    return await updateService.rollbackToVersion(tag);
  });

  registerHandle(ctx, ipcMain, 'restore-session-now', async () => {
    const playbackService = ctx.getService('playback');
    if (!playbackService) throw new Error('Playback service unavailable');
    return await playbackService.restorePreviousSession();
  });

  registerHandle(ctx, ipcMain, 'reapply-subtitle-style', async () => {
    const subtitleStyle = ctx.getService('subtitleStyle');
    if (!subtitleStyle) throw new Error('Subtitle style service unavailable');
    return await subtitleStyle.apply();
  });

  registerHandle(ctx, ipcMain, 'check-subtitle-selectors', async () => {
    const subtitleStyle = ctx.getService('subtitleStyle');
    if (!subtitleStyle) throw new Error('Subtitle style service unavailable');
    return await subtitleStyle.checkSelectorHealth();
  });

  registerHandle(ctx, ipcMain, 'exit-safe-mode', async () => {
    ctx.store.set('safeModeActive', false);
    ctx.store.set('crashCount', 0);
    ctx.store.set('lastRunExitedCleanly', true);
    return true;
  });

  ctx.logger.debug('Settings handlers registered');
};
