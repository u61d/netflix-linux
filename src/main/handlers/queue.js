const { ipcMain } = require('electron');

module.exports = function setupQueueHandlers(ctx) {
  ipcMain.handle('get-watch-queue', async () => {
    try {
      return ctx.store.get('watchQueue', []);
    } catch (error) {
      ctx.logger.error('get-watch-queue error:', error);
      return [];
    }
  });

  ipcMain.handle('add-to-queue', async (_event, item) => {
    try {
      const queue = ctx.store.get('watchQueue', []);
      queue.push({
        ...item,
        addedAt: Date.now(),
      });
      ctx.store.set('watchQueue', queue);
      return true;
    } catch (error) {
      ctx.logger.error('add-to-queue error:', error);
      throw error;
    }
  });

  ipcMain.handle('remove-from-queue', async (_event, index) => {
    try {
      const queue = ctx.store.get('watchQueue', []);
      queue.splice(index, 1);
      ctx.store.set('watchQueue', queue);
      return true;
    } catch (error) {
      ctx.logger.error('remove-from-queue error:', error);
      throw error;
    }
  });

  ctx.logger.debug('Queue handlers registered');
};
