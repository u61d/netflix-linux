const { TITLE_SELECTORS } = require('../../config/selectors');

// AutoSkipper/StatsOverlay have no push-event access into the Netflix page
// (page JS has no ipcRenderer, only executeJavaScript round-trips), so this
// polls the video element the same way. Applying a remote command sets a
// suppression window so the next poll doesn't re-broadcast its own echo.
class WatchPartyService {
  constructor(ctx) {
    this.ctx = ctx;
    this.interval = null;
    this.active = false;
    this.pollMs = 500;
    this.lastLocalState = null;
    this.suppressUntil = 0;
  }

  start() {
    if (this.interval) return;
    this.active = true;
    this.lastLocalState = null;
    this.interval = setInterval(() => this.poll(), this.pollMs);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.active = false;
    this.lastLocalState = null;
  }

  async poll() {
    if (!this.active) return;

    const state = await this.getCurrentState();
    if (!state) return;

    const now = Date.now();
    const previous = this.lastLocalState;
    this.lastLocalState = state;

    if (now < this.suppressUntil) return; // likely our own remote-applied change echoing back
    if (!previous) return; // first sample, nothing to diff against yet

    const action = this._detectChange(previous, state);
    if (action) this._forwardLocal(action, state);
  }

  async getCurrentState() {
    const win = this.ctx.getMainWindow();
    if (!win || win.isDestroyed()) return null;

    const script = `
      (function() {
        const video = document.querySelector('video');
        if (!video) return null;

        const titleEl = document.querySelector(${JSON.stringify(TITLE_SELECTORS.join(', '))});
        const title = (titleEl?.textContent || document.title || '').split('\\n')[0].trim();

        return {
          playing: !video.paused && !video.ended,
          currentTime: video.currentTime,
          duration: video.duration,
          title: title.replace(/\\s+-\\s+Netflix$/i, ''),
          url: window.location.href,
        };
      })();
    `;

    try {
      return await win.webContents.executeJavaScript(script, true);
    } catch (error) {
      this.ctx.logger.error('WatchParty state read error:', error);
      return null;
    }
  }

  _detectChange(previous, next) {
    if (previous.url !== next.url) return 'title-changed';
    if (previous.playing !== next.playing) return next.playing ? 'play' : 'pause';

    // seek: currentTime jumped more than normal playback (or scrubbing) explains
    const pollSeconds = this.pollMs / 1000;
    const delta = next.currentTime - previous.currentTime;

    if (next.playing && Math.abs(delta - pollSeconds) > pollSeconds + 1) return 'seek';
    if (!next.playing && Math.abs(delta) > 0.5) return 'seek';

    return null;
  }

  _forwardLocal(action, state) {
    const partyWindow = this.ctx.getManager('window')?.getWindow('watchparty');
    if (!partyWindow || partyWindow.isDestroyed()) return;

    partyWindow.webContents.send('watch-party:local-event', {
      action,
      currentTime: state.currentTime,
      title: state.title,
      url: state.url,
    });
  }

  async applyRemoteCommand(action, payload = {}) {
    const win = this.ctx.getMainWindow();
    if (!win || win.isDestroyed()) return { applied: false, error: 'No main window' };

    // ignore local-state diffs caused by this very command echoing back through our own poll
    this.suppressUntil = Date.now() + this.pollMs * 2 + 200;

    // compensate for time the message spent in flight, but only while actively playing
    const latencySeconds = payload.at ? Math.max(0, Date.now() - payload.at) / 1000 : 0;
    const targetTime =
      typeof payload.currentTime === 'number'
        ? payload.currentTime + (action === 'play' ? latencySeconds : 0)
        : null;

    const script = `
      (function() {
        const video = document.querySelector('video');
        if (!video) return { error: 'No video element found' };

        try {
          ${
            targetTime !== null
              ? `if (Math.abs(video.currentTime - ${targetTime}) > 2) {
            video.currentTime = ${targetTime};
          }`
              : ''
          }
          ${action === 'play' ? 'video.play().catch(() => {});' : ''}
          ${action === 'pause' ? 'video.pause();' : ''}
          return { success: true, currentTime: video.currentTime };
        } catch (e) {
          return { error: e.message };
        }
      })();
    `;

    try {
      const result = await win.webContents.executeJavaScript(script, true);
      if (result?.error) {
        this.ctx.logger.error('WatchParty applyRemoteCommand error:', result.error);
        return { applied: false, error: result.error };
      }
      return { applied: true, currentTime: result?.currentTime };
    } catch (error) {
      this.ctx.logger.error('WatchParty applyRemoteCommand error:', error);
      return { applied: false, error: error.message };
    }
  }

  cleanup() {
    this.stop();
  }
}

module.exports = WatchPartyService;
