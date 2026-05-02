const { ipcMain } = require('electron');
const { registerOn } = require('../utils/ipcTrace');

module.exports = function setupPlaybackHandlers(ctx) {
  registerOn(ctx, ipcMain, 'playback:auto-pause', async (_event, reason) => {
    try {
      if (!ctx.store.get('autoPauseOnBlur', false)) return;

      const playbackService = ctx.getService('playback');
      if (playbackService) {
        playbackService.pauseIfPlaying(reason || 'renderer');
      }
    } catch (error) {
      ctx.logger.error('playback:auto-pause error:', error);
    }
  });

  registerOn(ctx, ipcMain, 'playback:auto-resume', async (_event, reason) => {
    try {
      if (!ctx.store.get('autoPauseOnBlur', false)) return;

      const playbackService = ctx.getService('playback');
      if (playbackService) {
        playbackService.resumeIfAutoPaused(reason || 'renderer');
      }
    } catch (error) {
      ctx.logger.error('playback:auto-resume error:', error);
    }
  });

  ctx.logger.debug('Playback handlers registered');
};
