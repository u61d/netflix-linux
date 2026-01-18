const { ipcMain } = require('electron');

module.exports = function setupPlaybackHandlers(ctx) {
  ipcMain.on('playback:auto-pause', (_event, reason) => {
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

  ipcMain.on('playback:auto-resume', (_event, reason) => {
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
