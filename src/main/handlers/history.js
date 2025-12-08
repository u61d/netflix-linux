const { ipcMain } = require('electron');

module.exports = function setupHistoryHandlers(ctx) {
  const historyService = ctx.getService('history');

  ipcMain.handle('get-watch-history', async () => {
    try {
      const history = ctx.store.get('watchHistory', []);
      ctx.logger.debug('Returning watch history:', history.length, 'entries');
      return history;
    } catch (error) {
      ctx.logger.error('get-watch-history error:', error);
      return [];
    }
  });

  ipcMain.handle('clear-watch-history', async () => {
    try {
      ctx.store.set('watchHistory', []);
      ctx.logger.info('Watch history cleared');
      return true;
    } catch (error) {
      ctx.logger.error('clear-watch-history error:', error);
      throw error;
    }
  });

  ipcMain.handle('export-history', async () => {
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

  ipcMain.on('player:update', (_event, payload) => {
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

  ctx.logger.debug('History handlers registered');
};
