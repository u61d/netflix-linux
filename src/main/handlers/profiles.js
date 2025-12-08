const { ipcMain } = require('electron');
const ValidationService = require('../utils/validation');

module.exports = function setupProfilesHandlers(ctx) {
  const validator = new ValidationService();

  ipcMain.handle('get-profiles', async () => {
    try {
      return {
        profiles: ctx.store.get('profiles', {}),
        current: ctx.store.get('currentProfile', 'default'),
      };
    } catch (error) {
      ctx.logger.error('get-profiles error:', error);
      throw error;
    }
  });

  ipcMain.handle('add-profile', async (_event, { id, name, url }) => {
    try {
      const safeId = validator.sanitizeString(id);
      const safeName = validator.sanitizeString(name);
      const safeUrl = validator.sanitizeString(url);

      if (safeUrl && !safeUrl.startsWith('https://www.netflix.com')) {
        throw new Error('Invalid Netflix URL');
      }

      const profiles = ctx.store.get('profiles', {});
      profiles[safeId] = {
        name: safeName,
        url: safeUrl || 'https://www.netflix.com/',
        color: '#e50914',
        partition: `persist:${safeId}`,
      };
      ctx.store.set('profiles', profiles);

      ctx.logger.info(`Added profile: ${safeName}`);
      return true;
    } catch (error) {
      ctx.logger.error('add-profile error:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-profile', async (_event, id) => {
    try {
      const safeId = validator.sanitizeString(id);

      if (safeId === 'default') {
        throw new Error('Cannot delete default profile');
      }

      const profiles = ctx.store.get('profiles', {});
      delete profiles[safeId];
      ctx.store.set('profiles', profiles);

      const current = ctx.store.get('currentProfile');
      if (current === safeId) {
        ctx.store.set('currentProfile', 'default');
      }

      ctx.logger.info(`Deleted profile: ${safeId}`);
      return true;
    } catch (error) {
      ctx.logger.error('delete-profile error:', error);
      throw error;
    }
  });

  ipcMain.handle('switch-profile', async (_event, id) => {
    try {
      const safeId = validator.sanitizeString(id);
      const profiles = ctx.store.get('profiles', {});
      const profile = profiles[safeId];

      if (!profile) {
        throw new Error(
          `Profile "${safeId}" not found. Available profiles: ${Object.keys(profiles).join(', ')}`
        );
      }

      const currentProfile = ctx.store.get('currentProfile', 'default');

      if (currentProfile === safeId) {
        ctx.logger.debug(`Already on profile: ${profile.name}`);
        return true;
      }

      ctx.store.set('currentProfile', safeId);

      const win = ctx.getMainWindow();
      if (win && !win.isDestroyed()) {
        await win.loadURL(profile.url || 'https://www.netflix.com/');

        const session = win.webContents.session;
        await session.clearStorageData({
          storages: ['cookies', 'localstorage'],
        });

        await win.loadURL(profile.url || 'https://www.netflix.com/');
      }

      ctx.logger.info(`Switched to profile: ${profile.name}`);

      const NotificationService = require('../utils/notifications');
      const notifier = new NotificationService(ctx);
      notifier.notify({
        title: 'Profile Switched',
        body: `Now using: ${profile.name}`,
        priority: 'high',
      });

      return true;
    } catch (error) {
      ctx.logger.error('switch-profile error:', error);
      throw error;
    }
  });

  ctx.logger.debug('Profiles handlers registered');
};
