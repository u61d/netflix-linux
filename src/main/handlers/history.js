const { ipcMain } = require('electron');
const { registerHandle, registerOn } = require('../utils/ipcTrace');

module.exports = function setupHistoryHandlers(ctx) {
  const historyService = ctx.getService('history');

  registerHandle(ctx, ipcMain, 'get-watch-history', async () => {
    try {
      const history = ctx.store.get('watchHistory', []);
      ctx.logger.debug('Returning watch history:', history.length, 'entries');
      return history;
    } catch (error) {
      ctx.logger.error('get-watch-history error:', error);
      return [];
    }
  });

  registerHandle(ctx, ipcMain, 'clear-watch-history', async () => {
    try {
      ctx.store.set('watchHistory', []);
      ctx.logger.info('Watch history cleared');
      return true;
    } catch (error) {
      ctx.logger.error('clear-watch-history error:', error);
      throw error;
    }
  });

  registerHandle(ctx, ipcMain, 'export-history', async () => {
    try {
      if (historyService) {
        await historyService.export();
      }
      return true;
    } catch (error) {
      ctx.logger.error('export-history error:', error);
      throw error;
    }
  });

  registerOn(ctx, ipcMain, 'player:update', async (_event, payload) => {
    try {
      const rpcManager = ctx.getManager('rpc');
      if (rpcManager) {
        rpcManager.updateFromPlayer(payload);
      }

      if (historyService) {
        historyService.trackSession(payload);
      }

      const playbackService = ctx.getService('playback');
      if (playbackService) {
        playbackService.autoApplySpeed(payload);
      }
    } catch (error) {
      ctx.logger.error('player:update error:', error);
    }
  });

  registerOn(ctx, ipcMain, 'history:ready', async (event) => {
    ctx.logger.debug('History window ready');
    try {
      const history = ctx.store.get('watchHistory', []);
      event.sender.send('history:data', history);
    } catch (error) {
      ctx.logger.error('history:ready error:', error);
    }
  });

  registerOn(ctx, ipcMain, 'history:request', async (event) => {
    try {
      const history = ctx.store.get('watchHistory', []);
      event.sender.send('history:data', history);
    } catch (error) {
      ctx.logger.error('history:request error:', error);
    }
  });

  ctx.logger.debug('History handlers registered');
};
