const { Menu, shell } = require('electron');

class MenuManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.menu = null;
  }

  setup() {
    this.update();
    this.ctx.logger.debug('Menu manager initialized');
  }

  update() {
    const { store } = this.ctx;
    const windowManager = this.ctx.getManager('window');
    const playbackService = this.ctx.getService('playback');
    const screenshotService = this.ctx.getService('screenshot');
    const historyService = this.ctx.getService('history');

    const profiles = store.get('profiles', {});
    const currentProfile = store.get('currentProfile', 'default');

    const profileSubmenu = Object.entries(profiles).map(([id, profile]) => ({
      label: id === currentProfile ? `✓ ${profile.name}` : profile.name,
      click: () => this.switchProfile(id),
    }));

    profileSubmenu.push(
      { type: 'separator' },
      { label: 'Manage Profiles...', click: () => windowManager.createProfilesWindow() }
    );

    const template = [
      {
        label: 'Controls',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          {
            label: 'Settings…',
            accelerator: 'Ctrl+,',
            click: () => windowManager.createSettingsWindow(),
          },
          {
            label: 'Customize Shortcuts...',
            click: () => windowManager.createKeybindsWindow(),
          },
          {
            label: store.get('alwaysOnTop') ? '✓ Always on Top' : 'Always on Top',
            accelerator: 'Ctrl+Shift+T',
            click: () => this.toggleAlwaysOnTop(),
          },
          { type: 'separator' },
          {
            label: 'Show Stats',
            accelerator: 'Ctrl+Shift+S',
            click: () => historyService?.showQuickStats(),
          },
          {
            label: 'Watch History',
            accelerator: 'Ctrl+Shift+H',
            click: () => windowManager.createHistoryWindow(),
          },
          // TODO: Revisit watch queue UX once the feature is stabilized.
          {
            label: 'Clear History',
            click: () => this.clearHistory(),
          },
          { type: 'separator' },
          {
            label: 'Screenshot',
            accelerator: 'F12',
            click: () => screenshotService?.capture(),
          },
          {
            label: 'Open Screenshots Folder',
            click: () => {
              const dir = store.get('screenshotsDir');
              shell.openPath(dir);
            },
          },
          { type: 'separator' },
          {
            label: 'Picture-in-Picture',
            accelerator: 'F9',
            click: () => playbackService?.togglePictureInPicture(),
          },
          { type: 'separator' },
          {
            label: store.get('autoSkipIntro') ? '✓ Auto-Skip Intro' : 'Auto-Skip Intro',
            click: () => this.toggleAutoSkip('autoSkipIntro'),
          },
          {
            label: store.get('autoSkipRecap') ? '✓ Auto-Skip Recap' : 'Auto-Skip Recap',
            click: () => this.toggleAutoSkip('autoSkipRecap'),
          },
          { type: 'separator' },
          {
            label: 'Toggle Discord RPC',
            click: () => this.toggleDiscordRpc(),
          },
          { type: 'separator' },
          {
            label: 'Check for Updates...',
            click: () => {
              const updateService = this.ctx.getService('update');
              if (updateService) {
                updateService.checkForUpdates(true);
              }
            },
          },
        ],
      },
      {
        label: 'Profiles',
        submenu: profileSubmenu,
      },
      {
        label: 'Playback',
        submenu: [
          { label: 'Speed: 0.5x', click: () => playbackService?.setSpeed(0.5) },
          { label: 'Speed: 0.75x', click: () => playbackService?.setSpeed(0.75) },
          {
            label: 'Speed: 1.0x (Normal)',
            accelerator: 'F6',
            click: () => playbackService?.setSpeed(1.0),
          },
          { label: 'Speed: 1.25x', click: () => playbackService?.setSpeed(1.25) },
          { label: 'Speed: 1.5x', click: () => playbackService?.setSpeed(1.5) },
          { label: 'Speed: 2.0x', click: () => playbackService?.setSpeed(2.0) },
          { type: 'separator' },
          {
            label: 'Increase Speed',
            accelerator: 'F8',
            click: () => playbackService?.cycleSpeed(1),
          },
          {
            label: 'Decrease Speed',
            accelerator: 'F7',
            click: () => playbackService?.cycleSpeed(-1),
          },
        ],
      },
    ];

    this.menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(this.menu);
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

    this.update();
  }

  toggleAutoSkip(key = 'autoSkipIntro') {
    const enabled = !this.ctx.store.get(key);
    this.ctx.store.set(key, enabled);
    const title =
      {
        autoSkipIntro: 'Auto-Skip Intro',
        autoSkipRecap: 'Auto-Skip Recap',
      }[key] || 'Auto-Skip';

    const NotificationService = require('../utils/notifications');
    const notifier = new NotificationService(this.ctx);
    notifier.notify({
      title,
      body: enabled ? 'Enabled' : 'Disabled',
    });

    this.update();
  }

  toggleDiscordRpc() {
    const enabled = !this.ctx.store.get('discordEnabled');
    this.ctx.store.set('discordEnabled', enabled);

    const NotificationService = require('../utils/notifications');
    const notifier = new NotificationService(this.ctx);
    notifier.notify({
      title: 'Discord Rich Presence',
      body: enabled ? 'Enabled' : 'Disabled',
    });

    const rpcManager = this.ctx.getManager('rpc');
    if (enabled) {
      rpcManager.start();
    } else {
      rpcManager.stop();
    }
  }

  clearHistory() {
    this.ctx.store.set('watchHistory', []);

    const NotificationService = require('../utils/notifications');
    const notifier = new NotificationService(this.ctx);
    notifier.notify({
      title: 'History Cleared',
      body: 'Watch history reset',
    });
  }

  switchProfile(id) {
    const { ipcMain } = require('electron');
    ipcMain.emit('switch-profile-internal', null, id);
  }
}

module.exports = MenuManager;
