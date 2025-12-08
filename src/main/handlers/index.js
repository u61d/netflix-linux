const settingsHandlers = require('./settings');
const historyHandlers = require('./history');
const profilesHandlers = require('./profiles');
const keybindsHandlers = require('./keybinds');
const queueHandlers = require('./queue');

function setupIpcHandlers(ctx) {
  settingsHandlers(ctx);
  historyHandlers(ctx);
  profilesHandlers(ctx);
  keybindsHandlers(ctx);
  queueHandlers(ctx);

  ctx.logger.info('All IPC handlers registered');
}

module.exports = { setupIpcHandlers };
