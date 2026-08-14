const { pathToFileURL } = require('url');
const { TITLE_SELECTORS, META_SELECTORS } = require('../../config/selectors');
const { ASSETS } = require('../../config/constants');

class MprisManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.player = null;
    this.interval = null;
    this.active = false;
    this.pollMs = 1000;
    this.lastState = { playing: false, currentTime: 0, duration: 0, title: '', url: '' };
    this.currentTrackKey = null;
  }

  start() {
    if (process.platform !== 'linux') return;
    if (!this.ctx.store.get('mprisEnabled', true)) return;
    if (this.active) return;

    if (!this.player && !this._initPlayer()) return;

    this.active = true;
    this.lastState = { playing: false, currentTime: 0, duration: 0, title: '', url: '' };
    this.currentTrackKey = null;
    this.interval = setInterval(() => this.poll(), this.pollMs);
    this.ctx.logger.info('MPRIS started');
  }

  // doesn't tear down the D-Bus registration, just goes quiet — mpris-service
  // has no documented disconnect, and re-registering risks a name conflict
  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.active = false;
    if (this.player) {
      this.player.playbackStatus = 'Stopped';
    }
  }

  _initPlayer() {
    let Player;
    try {
      Player = require('mpris-service');
    } catch (error) {
      this.ctx.logger.warn('mpris-service unavailable:', error.message);
      return false;
    }

    try {
      this.player = Player({
        name: 'netflix-linux',
        identity: 'Netflix',
        supportedUriSchemes: ['https'],
        supportedMimeTypes: [],
        supportedInterfaces: ['player'],
        desktopEntry: 'Netflix', // the .desktop file electron-builder generates from productName
      });
    } catch (error) {
      this.ctx.logger.warn('MPRIS unavailable (no D-Bus session?):', error.message);
      this.player = null;
      return false;
    }

    // mpris-service re-emits any bus/connection failure as an 'error' event
    // on the player. EventEmitter throws if 'error' has no listener, so this
    // isn't optional — without it a bad D-Bus connection crashes the app.
    this.player.on('error', (error) => {
      this.ctx.logger.warn('MPRIS error:', error?.message || error);
    });

    this.player.canGoNext = false;
    this.player.canGoPrevious = false;
    this.player.getPosition = () => Math.floor((this.lastState.currentTime || 0) * 1e6);

    this._wireEvents();
    return true;
  }

  _wireEvents() {
    const playback = () => this.ctx.getService('playback');

    this.player.on('play', async () => {
      if (!this.active) return;
      try {
        const state = await playback()?.getState();
        if (state && !state.playing) await playback().togglePlayPause();
      } catch (error) {
        this.ctx.logger.warn('MPRIS play error:', error.message);
      }
    });

    this.player.on('pause', async () => {
      if (!this.active) return;
      try {
        const state = await playback()?.getState();
        if (state?.playing) await playback().togglePlayPause();
      } catch (error) {
        this.ctx.logger.warn('MPRIS pause error:', error.message);
      }
    });

    this.player.on('playpause', () => {
      if (this.active) playback()?.togglePlayPause();
    });

    this.player.on('stop', () => {
      if (this.active) playback()?.pauseIfPlaying('mpris');
    });

    this.player.on('seek', (offsetMicros) => {
      if (this.active) playback()?.seek(offsetMicros / 1e6);
    });

    this.player.on('position', ({ position }) => {
      if (!this.active) return;
      const targetSeconds = position / 1e6;
      const delta = targetSeconds - (this.lastState.currentTime || 0);
      playback()?.seek(delta);
    });

    this.player.on('raise', () => {
      const win = this.ctx.getMainWindow();
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    });

    this.player.on('quit', () => {
      this.ctx.getMainWindow()?.close();
    });
  }

  async poll() {
    if (!this.active || !this.player) return;

    const win = this.ctx.getMainWindow();
    if (!win || win.isDestroyed()) return;

    const state = await this._readVideoState(win);
    if (!state) return;

    const previous = this.lastState;
    this.lastState = state;

    try {
      this.player.playbackStatus = state.playing ? 'Playing' : 'Paused';

      const trackKey = state.url || state.title;
      if (trackKey !== this.currentTrackKey) {
        this.currentTrackKey = trackKey;
        this._updateMetadata(state);
      }

      // a jump bigger than normal playback drift means someone seeked
      // outside MPRIS (e.g. dragged Netflix's own scrubber)
      const expectedDelta = this.pollMs / 1000;
      const actualDelta = state.currentTime - previous.currentTime;
      if (Math.abs(actualDelta - expectedDelta) > 1.5) {
        this.player.seeked(Math.floor(state.currentTime * 1e6));
      }
    } catch (error) {
      this.ctx.logger.warn('MPRIS update error:', error.message);
    }
  }

  _updateMetadata(state) {
    const title = state.title
      ? state.episodeInfo
        ? `${state.title} — ${state.episodeInfo}`
        : state.title
      : 'Netflix';

    this.player.metadata = {
      'mpris:trackid': this.player.objectPath(`track/${Date.now()}`),
      'mpris:length': Math.floor((state.duration || 0) * 1e6),
      'mpris:artUrl': pathToFileURL(ASSETS.icon).href,
      'xesam:title': title,
      'xesam:album': state.title || 'Netflix',
      'xesam:artist': ['Netflix'],
    };
  }

  async _readVideoState(win) {
    const script = `
      (function() {
        const video = document.querySelector('video');
        if (!video) return null;

        const titleSelectors = ${JSON.stringify(TITLE_SELECTORS)};
        let title = '';
        for (const sel of titleSelectors) {
          const text = (document.querySelector(sel)?.textContent || '').trim();
          if (text) { title = text; break; }
        }
        if (!title) title = document.title || '';
        title = title.split('\\n')[0].trim().replace(/\\s+-\\s+Netflix$/i, '');

        const episodeInfo = (document.querySelector(${JSON.stringify(META_SELECTORS.videoMeta)})?.textContent || '').trim();

        return {
          playing: !video.paused && !video.ended,
          currentTime: video.currentTime || 0,
          duration: Number.isFinite(video.duration) ? video.duration : 0,
          title,
          episodeInfo,
          url: window.location.href,
        };
      })();
    `;

    try {
      return await win.webContents.executeJavaScript(script, true);
    } catch (error) {
      this.ctx.logger.error('MPRIS state read error:', error);
      return null;
    }
  }

  cleanup() {
    this.stop();
  }
}

module.exports = MprisManager;
