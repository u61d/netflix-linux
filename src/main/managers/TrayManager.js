const { Tray, Menu, nativeImage } = require('electron');
const { ASSETS } = require('../../config/constants');

class TrayManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.tray = null;
  }

  setup() {
    try {
      this.tray = new Tray(nativeImage.createFromPath(ASSETS.icon));
      this.tray.setToolTip('Netflix');
      this.update();
      this.ctx.logger.debug('Tray manager initialized');
    } catch (error) {
      this.ctx.logger.error('Tray setup failed:', error);
    }
  }

  update() {
    if (!this.tray) return;

    const { store } = this.ctx;
    const windowManager = this.ctx.getManager('window');
    const playbackService = this.ctx.getService('playback');
    const screenshotService = this.ctx.getService('screenshot');
    const historyService = this.ctx.getService('history');

    const menu = Menu.buildFromTemplate([
      {
        label: 'Show Stats',
        click: () => historyService?.showQuickStats(),
      },
      {
        label: 'Watch History',
        click: () => windowManager.createHistoryWindow(),
      },
      {
        label: 'Screenshot',
        click: () => screenshotService?.capture(),
      },
      { type: 'separator' },
      {
        label: 'Settings…',
        click: () => windowManager.createSettingsWindow(),
      },
      {
        label: store.get('alwaysOnTop') ? '✓ Always on Top' : 'Always on Top',
        click: () => this.toggleAlwaysOnTop(),
      },
      { type: 'separator' },
      {
        label: 'Picture-in-Picture',
        click: () => playbackService?.togglePictureInPicture(),
      },
      { type: 'separator' },
      {
        label: `Speed: ${store.get('playbackSpeed', 1.0)}x`,
        submenu: [
          { label: '0.5x', click: () => playbackService?.setSpeed(0.5) },
          { label: '0.75x', click: () => playbackService?.setSpeed(0.75) },
          { label: '1.0x', click: () => playbackService?.setSpeed(1.0) },
          { label: '1.25x', click: () => playbackService?.setSpeed(1.25) },
          { label: '1.5x', click: () => playbackService?.setSpeed(1.5) },
          { label: '2.0x', click: () => playbackService?.setSpeed(2.0) },
        ],
      },
      { type: 'separator' },
      {
        label: store.get('autoSkipIntro') ? '✓ Auto-Skip Intro' : 'Auto-Skip Intro',
        click: () => this.toggleAutoSkip(),
      },
      {
        label: store.get('discordEnabled') ? '✓ Discord RPC' : 'Discord RPC',
        click: () => this.toggleDiscordRpc(),
      },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' },
    ]);

    this.tray.setContextMenu(menu);
  }

  toggleAlwaysOnTop() {
    const win = this.ctx.getMainWindow();
    if (!win) return;

    const next = !this.ctx.store.get('alwaysOnTop', false);
    this.ctx.store.set('alwaysOnTop', next);
    win.setAlwaysOnTop(next);
    this.update();
  }

  toggleAutoSkip() {
    const enabled = !this.ctx.store.get('autoSkipIntro');
    this.ctx.store.set('autoSkipIntro', enabled);
    this.update();
  }

  toggleDiscordRpc() {
    const enabled = !this.ctx.store.get('discordEnabled');
    this.ctx.store.set('discordEnabled', enabled);

    const rpcManager = this.ctx.getManager('rpc');
    if (enabled) {
      rpcManager.start();
    } else {
      rpcManager.stop();
    }
    this.update();
  }

  updateIcon(playing = false) {
    if (!this.tray) return;

    const icon = playing ? ASSETS.iconPlaying : ASSETS.iconPaused;
    try {
      this.tray.setImage(nativeImage.createFromPath(icon));
    } catch (error) {
      //
    }
  }

  cleanup() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = TrayManager;
