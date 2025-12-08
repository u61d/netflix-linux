const { app, globalShortcut } = require('electron');
const { DEFAULT_KEYBINDS } = require('../../config/defaults');

class KeybindManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.registered = new Map();
    this.conflicts = new Map();
  }

  register() {
    if (this.registered.size > 0) return;

    const keybinds = this.getKeybinds();
    const actions = this.getActions();

    for (const [action, accelerator] of Object.entries(keybinds)) {
      if (!accelerator) continue;

      const handler = actions[action];
      if (!handler) {
        this.ctx.logger.warn(`No handler found for action: ${action}`);
        continue;
      }

      const success = this.registerKeybind(accelerator, handler, action);

      if (!success) {
        this.conflicts.set(action, accelerator);
        this.ctx.logger.warn(`Keybind conflict: ${action} (${accelerator})`);
      }
    }

    this.registerMediaKeys();

    this.registerWindowShortcuts();

    this.ctx.logger.info(`Registered ${this.registered.size} global shortcuts`);

    if (this.conflicts.size > 0) {
      this.ctx.logger.warn(`${this.conflicts.size} keybinds failed due to conflicts`);
    }
  }

  registerKeybind(accelerator, callback, label) {
    try {
      const success = globalShortcut.register(accelerator, callback);

      if (success) {
        this.registered.set(accelerator, { callback, label });
        return true;
      }

      return false;
    } catch (error) {
      this.ctx.logger.error(`Failed to register ${label}:`, error.message);
      return false;
    }
  }

  registerMediaKeys() {
    const playbackService = this.ctx.getService('playback');
    if (!playbackService) return;

    const mediaKeys = [
      { key: 'MediaPlayPause', action: () => playbackService.togglePlayPause() },
      { key: 'MediaStop', action: () => playbackService.togglePlayPause() },
      { key: 'MediaNextTrack', action: () => playbackService.seek(10) },
      { key: 'MediaPreviousTrack', action: () => playbackService.seek(-10) },
    ];

    for (const { key, action } of mediaKeys) {
      try {
        globalShortcut.register(key, action);
        this.ctx.logger.debug(`Registered media key: ${key}`);
      } catch {
        // media key registration may fail if keys are alr bound by system
      }
    }
  }

  registerWindowShortcuts() {
    const mainWindow = this.ctx.getMainWindow();
    if (!mainWindow) return;

    const windowManager = this.ctx.getManager('window');

    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (!input.control && !input.meta) return;

      const key = input.key.toLowerCase();

      if (key === ',' && input.control && !input.shift && !input.alt) {
        event.preventDefault();
        windowManager.createSettingsWindow();
        return;
      }

      if (key === 'k' && input.control && !input.shift && !input.alt) {
        event.preventDefault();
        windowManager.createKeybindsWindow();
        return;
      }

      if (key === 'p' && input.control && !input.shift && !input.alt) {
        event.preventDefault();
        windowManager.createProfilesWindow();
        return;
      }

      if (key === 'q' && input.control && input.shift && !input.alt) {
        event.preventDefault();
        windowManager.createQueueWindow();
        return;
      }

      if (key === 'q' && input.control && !input.shift && !input.alt) {
        event.preventDefault();
        const { app } = require('electron');
        app.quit();
        return;
      }
    });
  }

  getKeybinds() {
    const custom = this.ctx.store.get('customKeybinds', {});
    return { ...DEFAULT_KEYBINDS, ...custom };
  }

  getActions() {
    const windowManager = this.ctx.getManager('window');
    const screenshotService = this.ctx.getService('screenshot');
    const playbackService = this.ctx.getService('playback');
    const historyService = this.ctx.getService('history');
    const statsOverlay = this.ctx.getService('statsOverlay');

    return {
      showStats: () => historyService?.showQuickStats(),
      showHistory: () => windowManager?.createHistoryWindow(),
      showQueue: () => windowManager?.createQueueWindow(),
      openSettings: () => windowManager?.createSettingsWindow(),
      openKeybinds: () => windowManager?.createKeybindsWindow(),
      openProfiles: () => windowManager?.createProfilesWindow(),
      toggleAlwaysOnTop: () => this.toggleAlwaysOnTop(),
      quit: () => app.quit(),
      screenshot: () => screenshotService?.capture(),
      screenshotClipboard: () => screenshotService?.captureToClipboard(),
      pictureInPicture: () => playbackService?.togglePictureInPicture(),
      speedIncrease: () => playbackService?.cycleSpeed(1),
      speedDecrease: () => playbackService?.cycleSpeed(-1),
      speedReset: () => playbackService?.setSpeed(1.0),
      resetPlayback: () => playbackService?.reset(),
      toggleDetailedStats: () => statsOverlay?.toggle(),
      exportHistory: () => historyService?.export(),
    };
  }

  toggleAlwaysOnTop() {
    const win = this.ctx.getMainWindow();
    if (!win) return;

    const next = !this.ctx.store.get('alwaysOnTop', false);
    this.ctx.store.set('alwaysOnTop', next);
    win.setAlwaysOnTop(next);

    const NotificationService = require('../utils/notifications');
    const notifier = new NotificationService(this.ctx);
    notifier.notify({
      title: 'Always on Top',
      body: next ? 'Enabled' : 'Disabled',
      priority: 'high',
    });
  }

  unregisterAll() {
    try {
      globalShortcut.unregisterAll();
      this.registered.clear();
      this.conflicts.clear();
      this.ctx.logger.info('All keybinds unregistered');
    } catch (error) {
      this.ctx.logger.error('Failed to unregister keybinds:', error);
    }
  }

  getConflicts() {
    return Array.from(this.conflicts.entries());
  }

  cleanup() {
    this.unregisterAll();
  }
}

module.exports = KeybindManager;
