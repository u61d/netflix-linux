const { ipcMain } = require('electron');
const { registerHandle, registerOn } = require('../utils/ipcTrace');
const ValidationService = require('../utils/validation');

module.exports = function setupWatchPartyHandlers(ctx) {
  const validator = new ValidationService();

  registerHandle(ctx, ipcMain, 'watch-party:get-display-name', async () => {
    return ctx.store.get('watchPartyDisplayName', '');
  });

  registerHandle(ctx, ipcMain, 'watch-party:set-display-name', async (_event, name) => {
    const clean = validator.sanitizeString(String(name || '')).slice(0, 24);
    ctx.store.set('watchPartyDisplayName', clean);
    return clean;
  });

  registerHandle(ctx, ipcMain, 'watch-party:get-current-state', async () => {
    const watchParty = ctx.getService('watchParty');
    if (!watchParty) return null;
    return watchParty.getCurrentState();
  });

  registerHandle(ctx, ipcMain, 'watch-party:apply-remote', async (_event, { action, payload }) => {
    const watchParty = ctx.getService('watchParty');
    if (!watchParty) return { applied: false, error: 'Watch party service unavailable' };
    return watchParty.applyRemoteCommand(action, payload);
  });

  registerOn(ctx, ipcMain, 'watch-party:set-active', async (_event, isActive) => {
    const watchParty = ctx.getService('watchParty');
    if (!watchParty) return;
    if (isActive) watchParty.start();
    else watchParty.stop();
  });

  ctx.logger.debug('Watch party handlers registered');
};
