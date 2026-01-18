const settingsHandlers = require('./settings');
const historyHandlers = require('./history');
const profilesHandlers = require('./profiles');
const keybindsHandlers = require('./keybinds');
const queueHandlers = require('./queue');
const playbackHandlers = require('./playback');

function setupIpcHandlers(ctx) {
  settingsHandlers(ctx);
  historyHandlers(ctx);
  profilesHandlers(ctx);
  keybindsHandlers(ctx);
  queueHandlers(ctx);
  playbackHandlers(ctx);

  ctx.logger.info('All IPC handlers registered');
}

module.exports = { setupIpcHandlers };
