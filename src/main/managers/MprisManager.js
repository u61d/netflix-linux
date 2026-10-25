const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { TITLE_SELECTORS, META_SELECTORS } = require('../../config/selectors');
const { ASSETS } = require('../../config/constants');
const { isBenignDbusStreamError } = require('../utils/errorFilters');
const { buildMetadata, isEpisode, mergeTrack, resolveTrack } = require('../utils/mediaMetadata');

// same clamp as PlaybackService, so a client can't pick a rate we'd reject
const MIN_RATE = 0.25;
const MAX_RATE = 4;

// more drift than this in one interval means someone seeked outside MPRIS
const SEEK_DRIFT_SECONDS = 1.5;

// Don't use mpris-service's objectPath(): it splices the player name into the
// path, and the hyphen in "netflix-linux" is illegal in a D-Bus object path.
// The bus drops the connection on the malformed message, which is what used
// to kill MPRIS the moment metadata was set.
const TRACK_ID_ROOT = '/org/node/mediaplayer/netflix_linux/track';

const IDLE_STATE = {
  hasVideo: false,
  playing: false,
  currentTime: 0,
  duration: 0,
  rate: 1,
  volume: 1,
  muted: false,
  url: '',
};

// MPRIS consumers are separate processes and can't read inside app.asar, so
// artUrl has to point at the extraResources copy of the icon.
function externalIconPath() {
  if (!app.isPackaged) return ASSETS.icon; // dev mode: no asar involved at all
  const candidate = path.join(process.resourcesPath, 'assets', 'icons', 'icon.png');
  return fs.existsSync(candidate) ? candidate : null;
}

// /watch/81234567 identifies the video; query params come and go.
function watchKey(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url || '';
  }
}

// dbus-next errors aren't always Error instances; some are plain objects or
// error replies with no .message, which logged as blank.
function describeError(error) {
  if (!error) return String(error);
  if (error instanceof Error) return error.stack || error.message || error.toString();
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

class MprisManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.player = null;
    this.interval = null;
    this.active = false;
    this.pollMs = 1000;
    this.lastState = { ...IDLE_STATE };
    this.currentTrackKey = null;
    this.resolvedTrack = null;
    this.videoKey = null;
    this.trackSequence = 0;
    this.lastMetadata = null;
    this._connectionDead = false;
  }

  start() {
    if (process.platform !== 'linux') return;
    if (!this.ctx.store.get('mprisEnabled', true)) return;
    if (this.active) return;

    if (!this.player && !this._initPlayer()) return;

    this.active = true;
    this._resetTrackState();
    this._scheduleNextPoll();
    this.ctx.logger.info('MPRIS started');
  }

  // executeJavaScript can take longer than pollMs on a page as heavy as
  // Netflix, and setInterval would then run two polls at once. Chaining the
  // next one off the previous rules out overlapping D-Bus writes.
  _scheduleNextPoll() {
    this.interval = setTimeout(async () => {
      await this.poll();
      if (this.active) this._scheduleNextPoll();
    }, this.pollMs);
  }

  // doesn't tear down the D-Bus registration, just goes quiet — mpris-service
  // has no documented disconnect, and re-registering risks a name conflict
  stop() {
    if (this.interval) clearTimeout(this.interval);
    this.interval = null;
    this.active = false;
    this._resetTrackState();
    if (this.player) {
      try {
        this.player.playbackStatus = 'Stopped';
      } catch {
        // connection may already be dead; nothing more to do
      }
    }
  }

  _resetTrackState() {
    this.lastState = { ...IDLE_STATE };
    this.currentTrackKey = null;
    this.resolvedTrack = null;
    this.videoKey = null;
    this.lastMetadata = null;
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
        // Shells use this to find the .desktop file, and from it the name and
        // icon. electron-builder names that file after package.json's `name`,
        // which is what app.getName() gives us.
        desktopEntry: this._desktopEntry(),
      });
    } catch (error) {
      this.ctx.logger.warn('MPRIS unavailable (no D-Bus session?):', error.message);
      this.player = null;
      return false;
    }

    this._connectionDead = false;

    // Not optional: mpris-service re-emits bus failures as 'error', and an
    // EventEmitter with no 'error' listener throws.
    this.player.on('error', (error) => {
      if (this._handleIfConnectionDead(error)) return;
      this.ctx.logger.warn('MPRIS error:', describeError(error));
    });

    this.player.canControl = true;
    this.player.canSetFullscreen = true;
    this.player.minimumRate = MIN_RATE;
    this.player.maximumRate = MAX_RATE;
    this.player.loopStatus = 'None';
    this.player.shuffle = false;
    this.player.canGoNext = false;
    this.player.canGoPrevious = false;
    this.player.getPosition = () => Math.floor((this.lastState.currentTime || 0) * 1e6);

    this._wireEvents();
    return true;
  }

  _desktopEntry() {
    try {
      return app.getName() || 'netflix-linux';
    } catch {
      return 'netflix-linux';
    }
  }

  // A dead connection shows up either on the 'error' event or inside poll().
  // Returns true once it has handled (and stopped for) one.
  _handleIfConnectionDead(error) {
    if (!isBenignDbusStreamError(error)) return false;
    if (this._connectionDead) return true; // already handled this session

    this._connectionDead = true;
    this.ctx.logger.warn('MPRIS: D-Bus connection appears closed, stopping until next app start.');
    this.stop();
    this.player = null;
    return true;
  }

  // Every property write goes through here; any of them can hit a dead
  // connection, and the caller just needs to know whether to carry on.
  _write(label, apply) {
    try {
      apply();
      return true;
    } catch (error) {
      if (this._handleIfConnectionDead(error)) return false;
      this.ctx.logger.warn(`MPRIS ${label} error:`, describeError(error));
      return false;
    }
  }

  _wireEvents() {
    const playback = () => this.ctx.getService('playback');

    const guard =
      (label, handler) =>
      async (...args) => {
        if (!this.active) return;
        try {
          await handler(...args);
        } catch (error) {
          this.ctx.logger.warn(`MPRIS ${label} error:`, describeError(error));
        }
      };

    this.player.on(
      'play',
      guard('play', async () => {
        const state = await playback()?.getState();
        if (state && !state.playing) await playback().togglePlayPause();
      })
    );

    this.player.on(
      'pause',
      guard('pause', async () => {
        const state = await playback()?.getState();
        if (state?.playing) await playback().togglePlayPause();
      })
    );

    this.player.on(
      'playpause',
      guard('playpause', () => playback()?.togglePlayPause())
    );

    this.player.on(
      'stop',
      guard('stop', () => playback()?.pauseIfPlaying('mpris'))
    );

    this.player.on(
      'next',
      guard('next', () => playback()?.nextEpisode())
    );

    this.player.on(
      'seek',
      guard('seek', (offsetMicros) => playback()?.seek(offsetMicros / 1e6))
    );

    this.player.on(
      'position',
      guard('position', ({ position }) => {
        const targetSeconds = position / 1e6;
        const delta = targetSeconds - (this.lastState.currentTime || 0);
        return playback()?.seek(delta);
      })
    );

    this.player.on(
      'volume',
      guard('volume', (level) => playback()?.setVolume(level))
    );

    this.player.on(
      'rate',
      guard('rate', (rate) => {
        const safeRate = Math.max(MIN_RATE, Math.min(MAX_RATE, Number(rate) || 1));
        return playback()?.setSpeed(safeRate);
      })
    );

    this.player.on(
      'open',
      guard('open', ({ uri }) => this._openUri(uri))
    );

    this.player.on('fullscreen', (value) => {
      const win = this.ctx.getMainWindow();
      if (!win || win.isDestroyed()) return;
      win.setFullScreen(Boolean(value));
      this._write('fullscreen', () => {
        this.player.fullscreen = Boolean(value);
      });
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

  _openUri(uri) {
    const win = this.ctx.getMainWindow();
    if (!win || win.isDestroyed()) return;

    let parsed;
    try {
      parsed = new URL(String(uri));
    } catch {
      this.ctx.logger.warn(`MPRIS open: not a URL (${uri})`);
      return;
    }

    const isNetflix =
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'netflix.com' || parsed.hostname.endsWith('.netflix.com'));

    if (!isNetflix) {
      this.ctx.logger.warn(`MPRIS open: refusing non-Netflix URL (${parsed.origin})`);
      return;
    }

    win.loadURL(parsed.href);
  }

  async poll() {
    if (!this.active || !this.player) return;

    const win = this.ctx.getMainWindow();
    if (!win || win.isDestroyed()) return;

    const raw = await this._readPageState(win);
    if (!raw) return;

    if (!raw.hasVideo) {
      this._applyIdle();
      return;
    }

    const previous = this.lastState;
    const state = {
      hasVideo: true,
      playing: Boolean(raw.playing),
      currentTime: Number(raw.currentTime) || 0,
      duration: Number(raw.duration) || 0,
      rate: Number(raw.rate) || 1,
      volume: Number.isFinite(raw.volume) ? raw.volume : 1,
      muted: Boolean(raw.muted),
      url: raw.url || '',
    };
    this.lastState = state;

    if (
      !this._write('playbackStatus', () => {
        this.player.playbackStatus = state.playing ? 'Playing' : 'Paused';
      })
    ) {
      return;
    }
    if (!this.active) return;

    this._applyTrack(raw, state);
    if (!this.active) return;

    this._applyPlaybackProperties(state);
    if (!this.active) return;

    this._emitSeekIfJumped(previous, state);
  }

  // No <video> at all means browsing, not watching. Reporting "Paused" here
  // leaves a stale entry sitting in every media widget.
  _applyIdle() {
    this._resetTrackState();
    this._write('playbackStatus', () => {
      this.player.playbackStatus = 'Stopped';
    });
    if (!this.active) return;
    this._write('capabilities', () => {
      this.player.canPlay = false;
      this.player.canPause = false;
      this.player.canSeek = false;
      this.player.canGoNext = false;
      this.player.canGoPrevious = false;
    });
  }

  _applyTrack(raw, state) {
    // a different video is the one point where forgetting is correct
    const videoKey = watchKey(state.url);
    if (videoKey !== this.videoKey) {
      this.videoKey = videoKey;
      this.resolvedTrack = null;
    }

    const track = mergeTrack(this.resolvedTrack, resolveTrack(raw));
    this.resolvedTrack = track;

    // New trackid whenever the content changes, not just the URL: Netflix
    // rolls into the next episode without navigating, and clients that cache
    // per trackid would keep showing the old episode.
    const trackKey = [videoKey, track.show, track.season, track.episode, track.episodeTitle].join(
      '|'
    );
    if (trackKey !== this.currentTrackKey) {
      this.currentTrackKey = trackKey;
      this.trackSequence += 1;
    }

    const metadata = buildMetadata(track, {
      trackId: `${TRACK_ID_ROOT}/${this.trackSequence}`,
      lengthMicros: (state.duration || 0) * 1e6,
      url: state.url,
      artUrl: this._artUrl(),
    });

    // Republish on every change, not once per track: the title and the
    // numbers turn up at different times.
    const serialized = JSON.stringify(metadata);
    if (serialized === this.lastMetadata) return;

    const published = this._write('metadata', () => {
      this.player.metadata = metadata;
    });
    if (!published) return;
    this._retypeEpisodeNumbers();
    this.lastMetadata = serialized;

    // the raw reading goes in too: when a title comes out wrong it is the
    // only way to tell a selector problem from a parsing one
    this.ctx.logger.debug(
      `MPRIS metadata: "${metadata['xesam:title']}" artist="${metadata['xesam:artist'][0]}" ` +
        `lines=${JSON.stringify(raw.titleLines)} meta=${JSON.stringify(raw.metaText)}`
    );
  }

  // mpris-service guesses a signature per metadata value and types every
  // number as a double, but these two are int32 in the spec (playerctl prints
  // "5.0" otherwise). No hook for it, so retype them on the interface and
  // re-announce. If the internals move, the catch leaves the doubles alone.
  _retypeEpisodeNumbers() {
    try {
      const dbus = require('dbus-next');
      const iface = this.player.interfaces?.player;
      const stored = iface?._Metadata;
      if (!stored) return;

      let changed = false;
      for (const key of ['xesam:trackNumber', 'xesam:discNumber']) {
        const entry = stored[key];
        if (!entry || entry.signature !== 'd') continue;
        stored[key] = new dbus.Variant('i', Math.round(entry.value));
        changed = true;
      }

      if (changed) {
        dbus.interface.Interface.emitPropertiesChanged(iface, { Metadata: stored });
      }
    } catch (error) {
      this.ctx.logger.debug(`MPRIS could not retype episode numbers: ${error.message}`);
    }
  }

  // The bundled logo. Netflix's own artwork isn't reachable from the watch
  // page: Media Session metadata is null, there is no og:image, and no
  // /dnm/api/ image is in the DOM. Never leave this empty, or widgets draw a
  // blank square.
  _artUrl() {
    const iconPath = externalIconPath();
    return iconPath ? pathToFileURL(iconPath).href : '';
  }

  _applyPlaybackProperties(state) {
    const series = Boolean(this.resolvedTrack && isEpisode(this.resolvedTrack));

    this._write('capabilities', () => {
      this.player.canPlay = true;
      this.player.canPause = true;
      this.player.canSeek = state.duration > 0;
      // Next means next episode, so series only. Going by the on-screen
      // button instead would flicker with the control overlay.
      this.player.canGoNext = series;
      this.player.canGoPrevious = false;
    });
    if (!this.active) return;

    this._write('rate', () => {
      this.player.rate = Math.max(MIN_RATE, Math.min(MAX_RATE, state.rate));
    });
    if (!this.active) return;

    // no mute property in MPRIS; muted just reads as zero volume
    this._write('volume', () => {
      this.player.volume = state.muted ? 0 : Math.max(0, Math.min(1, state.volume));
    });
  }

  _emitSeekIfJumped(previous, state) {
    if (!previous.hasVideo) return;

    const expectedDelta = (this.pollMs / 1000) * (state.playing ? state.rate : 0);
    const actualDelta = state.currentTime - previous.currentTime;
    if (Math.abs(actualDelta - expectedDelta) <= SEEK_DRIFT_SECONDS) return;

    this._write('seeked', () => {
      this.player.seeked(Math.floor(state.currentTime * 1e6));
    });
  }

  _readPageState(win) {
    const script = `
      (function() {
        const result = {
          hasVideo: false,
          url: window.location.href,
          documentTitle: document.title || '',
          titleLines: [],
          metaText: '',
          session: null,
        };

        const video = document.querySelector('video');
        if (!video) return result;

        result.hasVideo = true;
        result.playing = !video.paused && !video.ended;
        result.currentTime = video.currentTime || 0;
        result.duration = Number.isFinite(video.duration) ? video.duration : 0;
        result.rate = video.playbackRate || 1;
        result.volume = Number.isFinite(video.volume) ? video.volume : 1;
        result.muted = Boolean(video.muted);

        // The title block is
        //   <div data-uia="video-title"><h4>Lupin</h4><span>E3</span><span>Chapter 3</span></div>
        // and innerText comes back as "LupinE3Chapter 3" with no separator of
        // any kind, so take one line per child element rather than splitting
        // text that has nothing to split on.
        function linesOf(element) {
          const lines = [];
          for (const child of element.children || []) {
            const text = (child.textContent || '').trim();
            if (text) lines.push(text);
          }
          if (lines.length) return lines;

          const own = (element.innerText || element.textContent || '').trim();
          return own
            .split('\\n')
            .map(function (line) {
              return line.trim();
            })
            .filter(Boolean);
        }

        // First element giving more than one piece wins. Taking every match
        // would let an outer container add the whole title back as one glued
        // line, which then reads as the episode name.
        const singles = [];
        for (const selector of ${JSON.stringify(TITLE_SELECTORS)}) {
          for (const element of document.querySelectorAll(selector)) {
            const lines = linesOf(element);
            if (lines.length > 1) {
              result.titleLines = lines;
              break;
            }
            if (lines.length === 1) singles.push(lines[0]);
          }
          if (result.titleLines.length) break;
        }
        if (!result.titleLines.length) result.titleLines = singles;

        const meta = document.querySelector(${JSON.stringify(META_SELECTORS.videoMeta)});
        result.metaText = (meta && (meta.innerText || meta.textContent) || '').trim();

        // Media Session is null on the watch page, measured on the real app,
        // but it costs nothing to use if Netflix ever starts setting it.
        try {
          const metadata = navigator.mediaSession && navigator.mediaSession.metadata;
          if (metadata) {
            result.session = {
              title: metadata.title || '',
              artist: metadata.artist || '',
              album: metadata.album || '',
            };
          }
        } catch (error) {
          result.session = null;
        }

        return result;
      })();
    `;

    return win.webContents.executeJavaScript(script, true).catch((error) => {
      this.ctx.logger.error('MPRIS state read error:', error);
      return null;
    });
  }

  cleanup() {
    this.stop();
  }
}

module.exports = MprisManager;
