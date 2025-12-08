const { SPEEDS } = require('../../config/constants');
const NotificationService = require('../utils/notifications');

class PlaybackService {
  constructor(ctx) {
    this.ctx = ctx;
    this.lastAppliedContent = null;
    this.notifier = new NotificationService(ctx);
    this.speedNotificationTimer = null;
    this.lastSpeedNotification = null;
  }

  async setSpeed(speed) {
    const win = this.ctx.getMainWindow();
    if (!win) {
      this.ctx.logger.error('setSpeed: No main window');
      return false;
    }

    const safeSpeed = Math.max(0.25, Math.min(4, speed));

    const script = `
      (function() {
        const video = document.querySelector('video');
        if (!video) return { error: 'No video element found' };
        
        try {
          video.playbackRate = ${safeSpeed};
          return { 
            success: true,
            speed: video.playbackRate
          };
        } catch (e) {
          return { error: e.message };
        }
      })();
    `;

    try {
      const result = await win.webContents.executeJavaScript(script, true);

      if (result.error) {
        this.ctx.logger.error('Playback speed error:', result.error);
        return false;
      }

      if (result.success) {
        this.ctx.store.set('playbackSpeed', safeSpeed);

        this.scheduleSpeedNotification(safeSpeed, speed);

        this.ctx.logger.info(`Playback speed set to ${safeSpeed}x`);

        const menuManager = this.ctx.getManager('menu');
        if (menuManager) {
          menuManager.update();
        }

        return true;
      }
    } catch (error) {
      this.ctx.logger.error('setSpeed exception:', error);
      return false;
    }
  }

  cycleSpeed(direction = 1) {
    const current = this.ctx.store.get('playbackSpeed', 1.0);
    const currentIndex = SPEEDS.indexOf(current);

    let newIndex;
    if (currentIndex === -1) {
      newIndex = SPEEDS.findIndex((s) => s >= current);
      if (newIndex === -1) newIndex = SPEEDS.length - 1;
    } else {
      newIndex = currentIndex + direction;
      if (newIndex < 0) newIndex = 0;
      if (newIndex >= SPEEDS.length) newIndex = SPEEDS.length - 1;
    }

    return this.setSpeed(SPEEDS[newIndex]);
  }

  autoApplySpeed(playerData) {
    if (!playerData || !playerData.title) return;

    const desiredSpeed = this.ctx.store.get('playbackSpeed', 1.0);
    if (desiredSpeed === 1.0) {
      this.lastAppliedContent = null;
      return;
    }

    const parts = [playerData.title];
    if (Number.isInteger(playerData.season)) parts.push(`S${playerData.season}`);
    if (Number.isInteger(playerData.episode)) parts.push(`E${playerData.episode}`);
    const key = parts.join('|');

    if (!key || key === this.lastAppliedContent) return;

    this.lastAppliedContent = key;

    setTimeout(() => {
      this.setSpeed(desiredSpeed);
    }, 500);
  }

  scheduleSpeedNotification(safeSpeed, requestedSpeed) {
    if (requestedSpeed === 1.0) return;

    if (this.speedNotificationTimer) {
      clearTimeout(this.speedNotificationTimer);
      this.speedNotificationTimer = null;
    }

    if (this.lastSpeedNotification === safeSpeed) return;

    this.speedNotificationTimer = setTimeout(() => {
      this.notifier.notify({
        title: 'Playback Speed',
        body: `${safeSpeed}x`,
        priority: 'low',
      });
      this.lastSpeedNotification = safeSpeed;
      this.speedNotificationTimer = null;
    }, 300);
  }

  async adjustVolume(delta) {
    const win = this.ctx.getMainWindow();
    if (!win) return null;

    const script = `
      (function() {
        const video = document.querySelector('video');
        if (!video) return null;
        video.volume = Math.max(0, Math.min(1, video.volume + ${delta}));
        return { 
          volume: Math.round(video.volume * 100), 
          muted: video.muted 
        };
      })();
    `;

    try {
      const result = await win.webContents.executeJavaScript(script, true);
      if (result) {
        const NotificationService = require('../utils/notifications');
        const notifier = new NotificationService(this.ctx);
        notifier.notify({
          title: 'Volume',
          body: `${result.volume}%`,
          priority: 'low',
        });
      }
      return result;
    } catch (error) {
      this.ctx.logger.error('Volume adjustment error:', error);
      return null;
    }
  }

  async toggleMute() {
    const win = this.ctx.getMainWindow();
    if (!win) return null;

    const script = `
      (function() {
        const video = document.querySelector('video');
        if (!video) return null;
        video.muted = !video.muted;
        return { muted: video.muted, volume: Math.round(video.volume * 100) };
      })();
    `;

    try {
      const result = await win.webContents.executeJavaScript(script, true);
      if (result) {
        const NotificationService = require('../utils/notifications');
        const notifier = new NotificationService(this.ctx);
        notifier.notify({
          title: result.muted ? 'Muted' : 'Unmuted',
          body: `Volume: ${result.volume}%`,
          priority: 'low',
        });
      }
      return result;
    } catch (error) {
      this.ctx.logger.error('Toggle mute error:', error);
      return null;
    }
  }

  async togglePlayPause() {
    const win = this.ctx.getMainWindow();
    if (!win) return null;

    const script = `
      (function() {
        const video = document.querySelector('video');
        if (!video) return null;
        if (video.paused) {
          video.play();
          return { action: 'play' };
        } else {
          video.pause();
          return { action: 'pause' };
        }
      })();
    `;

    try {
      const result = await win.webContents.executeJavaScript(script, true);
      if (result) {
        this.ctx.logger.debug(`Video ${result.action}`);
      }
      return result;
    } catch (error) {
      this.ctx.logger.error('Play/pause error:', error);
      return null;
    }
  }

  async seek(seconds) {
    const win = this.ctx.getMainWindow();
    if (!win) return null;

    const script = `
      (function() {
        const video = document.querySelector('video');
        if (!video) return null;
        const target = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + ${seconds}));
        video.currentTime = target;
        return { currentTime: video.currentTime, duration: video.duration };
      })();
    `;

    try {
      const result = await win.webContents.executeJavaScript(script, true);
      if (result) {
        const NotificationService = require('../utils/notifications');
        const notifier = new NotificationService(this.ctx);
        notifier.notify({
          title: seconds >= 0 ? 'Forward' : 'Backward',
          body: `${seconds >= 0 ? '+' : ''}${seconds}s`,
          priority: 'low',
        });
      }
      return result;
    } catch (error) {
      this.ctx.logger.error('Seek error:', error);
      return null;
    }
  }

  async togglePictureInPicture() {
    const win = this.ctx.getMainWindow();
    if (!win) return null;

    const script = `
      (function() {
        const video = document.querySelector('video');
        if (!video) return { error: 'No video found' };
        
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture();
          return { pip: false };
        } else if (document.pictureInPictureEnabled) {
          video.requestPictureInPicture().catch(e => {
            return { error: e.message };
          });
          return { pip: true };
        }
        return { error: 'PiP not supported' };
      })();
    `;

    try {
      const result = await win.webContents.executeJavaScript(script, true);

      if (result.error) {
        const NotificationService = require('../utils/notifications');
        const notifier = new NotificationService(this.ctx);
        notifier.notify({
          title: 'Picture-in-Picture',
          body: result.error,
          priority: 'high',
        });
        return null;
      }

      if (result.pip !== undefined) {
        const NotificationService = require('../utils/notifications');
        const notifier = new NotificationService(this.ctx);
        notifier.notify({
          title: result.pip ? 'PiP Enabled' : 'PiP Disabled',
          body: result.pip ? 'Picture-in-Picture mode active' : 'Exited PiP mode',
          priority: 'high',
        });
      }

      return result;
    } catch (error) {
      this.ctx.logger.error('PiP error:', error);
      return null;
    }
  }

  async reset() {
    await this.setSpeed(1.0);
    await this.adjustVolume(-999);
    await this.adjustVolume(1.0);

    const NotificationService = require('../utils/notifications');
    const notifier = new NotificationService(this.ctx);
    notifier.notify({
      title: 'Playback Reset',
      body: 'Speed and volume reset to defaults',
      priority: 'high',
    });

    this.ctx.logger.info('Playback settings reset');
  }

  async getState() {
    const win = this.ctx.getMainWindow();
    if (!win) return null;

    const script = `
      (function() {
        const video = document.querySelector('video');
        if (!video) return null;
        
        return {
          playing: !video.paused && !video.ended,
          currentTime: video.currentTime,
          duration: video.duration,
          volume: video.volume,
          muted: video.muted,
          playbackRate: video.playbackRate,
          buffered: video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0
        };
      })();
    `;

    try {
      return await win.webContents.executeJavaScript(script, true);
    } catch (error) {
      this.ctx.logger.error('getState error:', error);
      return null;
    }
  }
}

module.exports = PlaybackService;
