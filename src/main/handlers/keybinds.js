const { ipcMain } = require('electron');
const { DEFAULT_KEYBINDS } = require('../../config/defaults');
const ValidationService = require('../utils/validation');

module.exports = function setupKeybindsHandlers(ctx) {
  const validator = new ValidationService();

  ipcMain.handle('get-keybinds', async () => {
    try {
      const custom = ctx.store.get('customKeybinds', {});
      const merged = { ...DEFAULT_KEYBINDS, ...custom };
      ctx.logger.debug('Returning keybinds:', Object.keys(merged).length);
      return merged;
    } catch (error) {
      ctx.logger.error('get-keybinds error:', error);
      return DEFAULT_KEYBINDS;
    }
  });

  ipcMain.handle('save-keybinds', async (_event, keybinds) => {
    try {
      if (!keybinds || typeof keybinds !== 'object') {
        throw new Error('Invalid keybinds object');
      }

      const custom = {};
      for (const [action, accelerator] of Object.entries(keybinds)) {
        if (accelerator) {
          custom[action] = validator.sanitizeString(accelerator);
        }
      }

      ctx.store.set('customKeybinds', custom);
      ctx.logger.info('Keybinds saved successfully');
      return true;
    } catch (error) {
      ctx.logger.error('save-keybinds error:', error);
      throw error;
    }
  });

  ipcMain.handle('reset-keybinds', async () => {
    try {
      ctx.store.set('customKeybinds', {});
      ctx.logger.info('Keybinds reset to defaults');
      return true;
    } catch (error) {
      ctx.logger.error('reset-keybinds error:', error);
      throw error;
    }
  });

  ctx.logger.debug('Keybinds handlers registered');
};
