const fs = require('fs');
const path = require('path');
const { shell, clipboard } = require('electron');
const { execSync } = require('child_process');

class ScreenshotService {
  constructor(ctx) {
    this.ctx = ctx;
    this.soundMethod = null;
  }

  ensureDirectory() {
    const dir = this.ctx.store.get('screenshotsDir');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  playSound() {
    if (!this.ctx.store.get('screenshotSound', false)) return;

    if (this.soundMethod) {
      this.playSoundWithMethod(this.soundMethod);
      return;
    }

    const methods = [
      {
        name: 'paplay',
        cmd: 'paplay /usr/share/sounds/freedesktop/stereo/camera-shutter.oga 2>/dev/null',
      },
      {
        name: 'pw-play',
        cmd: 'pw-play /usr/share/sounds/freedesktop/stereo/camera-shutter.oga 2>/dev/null',
      },
      { name: 'canberra', cmd: 'canberra-gtk-play -i camera-shutter 2>/dev/null' },
      {
        name: 'mpv',
        cmd: 'mpv --no-terminal --volume=60 /usr/share/sounds/freedesktop/stereo/camera-shutter.oga 2>/dev/null &',
      },
    ];

    for (const method of methods) {
      try {
        execSync(method.cmd, { timeout: 500, stdio: 'ignore' });
        this.soundMethod = method.name;
        this.ctx.logger.debug(`Screenshot sound method cached: ${method.name}`);
        return;
      } catch {
        // try next sound method
        continue;
      }
    }

    process.stdout.write('\x07');
    this.soundMethod = 'bell';
    this.ctx.logger.debug('Screenshot sound: using terminal bell fallback');
  }

  playSoundWithMethod(method) {
    const commands = {
      paplay: 'paplay /usr/share/sounds/freedesktop/stereo/camera-shutter.oga 2>/dev/null',
      'pw-play': 'pw-play /usr/share/sounds/freedesktop/stereo/camera-shutter.oga 2>/dev/null',
      canberra: 'canberra-gtk-play -i camera-shutter 2>/dev/null',
      mpv: 'mpv --no-terminal --volume=60 /usr/share/sounds/freedesktop/stereo/camera-shutter.oga 2>/dev/null &',
      bell: null,
    };

    if (method === 'bell') {
      process.stdout.write('\x07');
      return;
    }

    try {
      execSync(commands[method], { timeout: 500, stdio: 'ignore' });
    } catch (error) {
      this.ctx.logger.warn(`Cached sound method failed: ${method}`);
      this.soundMethod = null;
    }
  }

  async capture() {
    const win = this.ctx.getMainWindow();
    if (!win) return false;

    try {
      const image = await win.webContents.capturePage();
      const dir = this.ensureDirectory();

      const title = await win.webContents.getTitle();
      const cleanTitle = this.sanitizeFilename(title);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${cleanTitle}_${timestamp}.png`;
      const filepath = path.join(dir, filename);

      fs.writeFileSync(filepath, image.toPNG());

      this.playSound();

      if (this.ctx.store.get('screenshotNotification', true)) {
        const NotificationService = require('../utils/notifications');
        const notifier = new NotificationService(this.ctx);
        notifier.notify({
          title: 'Screenshot Saved',
          body: filename,
          silent: false,
          priority: 'high',
        });

        setTimeout(() => {
          shell.showItemInFolder(filepath);
        }, 1000);
      }

      this.ctx.logger.info('Screenshot saved:', filepath);
      return true;
    } catch (error) {
      const NotificationService = require('../utils/notifications');
      const notifier = new NotificationService(this.ctx);
      notifier.notify({
        title: 'Screenshot Failed',
        body: error.message,
        priority: 'high',
      });
      this.ctx.logger.error('Screenshot error:', error);
      return false;
    }
  }

  async captureToClipboard() {
    const win = this.ctx.getMainWindow();
    if (!win) return false;

    try {
      const image = await win.webContents.capturePage();
      clipboard.writeImage(image);

      this.playSound();

      const NotificationService = require('../utils/notifications');
      const notifier = new NotificationService(this.ctx);
      notifier.notify({
        title: 'Screenshot Copied',
        body: 'Screenshot copied to clipboard',
        silent: false,
        priority: 'high',
      });

      this.ctx.logger.info('Screenshot copied to clipboard');
      return true;
    } catch (error) {
      const NotificationService = require('../utils/notifications');
      const notifier = new NotificationService(this.ctx);
      notifier.notify({
        title: 'Copy Failed',
        body: error.message,
        priority: 'high',
      });
      this.ctx.logger.error('Copy screenshot error:', error);
      return false;
    }
  }

  sanitizeFilename(title) {
    return title
      .replace(/[^a-z0-9\s\-_]/gi, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  }
}

module.exports = ScreenshotService;
