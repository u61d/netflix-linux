class StatsOverlay {
  constructor(ctx) {
    this.ctx = ctx;
    this.interval = null;
    this.injected = false;
  }

  start() {
    if (this.interval || !this.ctx.store.get('showDetailedStats')) return;

    this.inject();

    this.interval = setInterval(async () => {
      await this.update();
    }, 1000);

    this.ctx.logger.info('Stats overlay started');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.remove();
    this.ctx.logger.info('Stats overlay stopped');
  }

  toggle() {
    const enabled = !this.ctx.store.get('showDetailedStats');
    this.ctx.store.set('showDetailedStats', enabled);

    if (enabled) {
      this.start();
    } else {
      this.stop();
    }

    const NotificationService = require('../utils/notifications');
    const notifier = new NotificationService(this.ctx);
    notifier.notify({
      title: 'Detailed Stats',
      body: enabled ? 'Enabled' : 'Disabled',
      priority: 'high',
    });
  }

  inject() {
    const win = this.ctx.getMainWindow();
    if (!win || this.injected) return;

    const script = `
      (function() {
        if (document.getElementById('netflix-stats-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'netflix-stats-overlay';
        overlay.style.cssText = \`
          position: fixed;
          top: 10px;
          right: 10px;
          background: rgba(0, 0, 0, 0.9);
          color: #00ff00;
          font-family: 'Courier New', monospace;
          font-size: 11px;
          padding: 10px 12px;
          border-radius: 6px;
          z-index: 99999;
          pointer-events: none;
          line-height: 1.5;
          border: 1px solid #00ff00;
          box-shadow: 0 4px 12px rgba(0, 255, 0, 0.2);
          min-width: 200px;
        \`;
        
        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = \`
          position: absolute;
          top: 2px;
          right: 6px;
          background: none;
          border: none;
          color: #00ff00;
          font-size: 18px;
          cursor: pointer;
          pointer-events: auto;
          padding: 0;
          line-height: 1;
        \`;
        closeBtn.onclick = () => overlay.remove();
        
        overlay.appendChild(closeBtn);
        
        const content = document.createElement('div');
        content.id = 'netflix-stats-content';
        content.textContent = 'Loading stats...';
        overlay.appendChild(content);
        
        document.body.appendChild(overlay);
      })();
    `;

    win.webContents.executeJavaScript(script, true);
    this.injected = true;
  }

  async update() {
    const win = this.ctx.getMainWindow();
    if (!win) return;

    const script = `
      (function() {
        const video = document.querySelector('video');
        if (!video) return null;

        const buffered = video.buffered.length > 0 
          ? video.buffered.end(video.buffered.length - 1) 
          : 0;

        const quality = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : {};

        return {
          currentTime: video.currentTime.toFixed(2),
          duration: video.duration.toFixed(2),
          buffered: buffered.toFixed(2),
          playbackRate: video.playbackRate,
          volume: Math.round(video.volume * 100),
          resolution: video.videoWidth + 'x' + video.videoHeight,
          fps: quality.totalVideoFrames || 'N/A',
          dropped: quality.droppedVideoFrames || 0,
        };
      })();
    `;

    try {
      const stats = await win.webContents.executeJavaScript(script, true);
      if (stats) {
        this.render(stats);
      }
    } catch (error) {
      // ignore
    }
  }

  render(stats) {
    const win = this.ctx.getMainWindow();
    if (!win) return;

    const html = `
      Time: ${stats.currentTime}s / ${stats.duration}s
      Buffered: ${stats.buffered}s
      Speed: ${stats.playbackRate}x
      Volume: ${stats.volume}%
      Resolution: ${stats.resolution}
      Frames: ${stats.fps}
      Dropped: ${stats.dropped}
    `.trim();

    const script = `
      (function() {
        const content = document.getElementById('netflix-stats-content');
        if (content) {
          content.textContent = \`${html}\`;
        }
      })();
    `;

    win.webContents.executeJavaScript(script, true);
  }

  remove() {
    const win = this.ctx.getMainWindow();
    if (!win || win.isDestroyed()) {
      this.injected = false;
      return;
    }

    const script = `
      (function() {
        const overlay = document.getElementById('netflix-stats-overlay');
        if (overlay) overlay.remove();
      })();
    `;

    try {
      win.webContents.executeJavaScript(script, true);
    } catch (error) {
      // ignore
    }
    this.injected = false;
  }

  cleanup() {
    this.stop();
  }
}

module.exports = StatsOverlay;
