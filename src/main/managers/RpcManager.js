const { Client } = require('@xhayper/discord-rpc');
const fs = require('fs');
const path = require('path');
const os = require('os');

class RpcManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.client = null;
    this.ready = false;
    this.lastState = null;
    this.retryTimeout = null;
    this.updateRateLimit = null;
    this.reconnectAttempts = 0;
    this.stopping = false;
    this.missingIpcWarned = false;
    this.lastReconnectReason = null;
    this.lastResolvedState = null;
    this.lastResolvedAt = 0;
    this.activitySession = {
      key: null,
      start: null,
      lastPosition: null,
      lastUpdateAt: 0,
    };
    this.lastSentActivity = null;

    // detect linux distro once on init
    this.distroInfo = this.detectDistro();
  }

  detectDistro() {
    try {
      const fs = require('fs');

      // check for specific distro files first
      const distroFiles = [
        { file: '/etc/arch-release', name: 'Arch Linux', key: 'arch' },
        { file: '/etc/manjaro-release', name: 'Manjaro', key: 'manjaro' },
        { file: '/etc/fedora-release', name: 'Fedora', key: 'fedora' },
        { file: '/etc/gentoo-release', name: 'Gentoo', key: 'gentoo' },
        { file: '/etc/debian_version', name: 'Debian', key: 'debian' },
      ];

      for (const { file, name, key } of distroFiles) {
        if (fs.existsSync(file)) {
          return { name, key };
        }
      }

      // try reading /etc/os-release
      if (fs.existsSync('/etc/os-release')) {
        const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
        const idMatch = osRelease.match(/^ID="?([^"\n]+)"?/m);
        const nameMatch = osRelease.match(/^NAME="?([^"\n]+)"?/m);
        const prettyMatch = osRelease.match(/^PRETTY_NAME="?([^"\n]+)"?/m);

        if (idMatch) {
          const id = idMatch[1].toLowerCase();
          const distroMap = {
            arch: { name: 'Arch Linux', key: 'arch' },
            manjaro: { name: 'Manjaro', key: 'manjaro' },
            ubuntu: { name: 'Ubuntu', key: 'ubuntu' },
            debian: { name: 'Debian', key: 'debian' },
            fedora: { name: 'Fedora', key: 'fedora' },
            opensuse: { name: 'openSUSE', key: 'opensuse' },
            gentoo: { name: 'Gentoo', key: 'gentoo' },
            mint: { name: 'Linux Mint', key: 'mint' },
            pop: { name: 'Pop!_OS', key: 'popos' },
            endeavouros: { name: 'EndeavourOS', key: 'endeavouros' },
            nixos: { name: 'NixOS', key: 'nixos' },
          };

          if (distroMap[id]) {
            return distroMap[id];
          }
        }

        const displayName = prettyMatch?.[1] || nameMatch?.[1] || 'Linux';
        return { name: displayName, key: 'linux' };
      }

      // fallback to lsb_release
      if (fs.existsSync('/etc/lsb-release')) {
        const lsbRelease = fs.readFileSync('/etc/lsb-release', 'utf8');
        const idMatch = lsbRelease.match(/DISTRIB_ID="?([^"\n]+)"?/);
        const descMatch = lsbRelease.match(/DISTRIB_DESCRIPTION="?([^"\n]+)"?/);

        if (idMatch) {
          const id = idMatch[1].toLowerCase();
          if (id === 'ubuntu') return { name: 'Ubuntu', key: 'ubuntu' };
          if (id === 'linuxmint') return { name: 'Linux Mint', key: 'mint' };
        }

        if (descMatch) {
          return { name: descMatch[1], key: 'linux' };
        }
      }
    } catch (error) {
      this.ctx.logger.debug('Could not detect distro:', error.message);
    }

    return { name: 'Linux', key: 'linux' };
  }

  get clientId() {
    return (
      this.ctx.store.get('discordClientId') ||
      process.env.DISCORD_CLIENT_ID ||
      '1437240728987369513'
    );
  }

  start() {
    if (!this.ctx.store.get('discordEnabled')) return;
    if (this.client) return;

    this.stopping = false;
    clearTimeout(this.retryTimeout);
    this.connect();
  }

  findDiscordIpcSocket() {
    if (process.env.NODE_ENV === 'test') return 'test-ipc';

    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    const xdgRuntimeDir = process.env.XDG_RUNTIME_DIR || (uid != null ? `/run/user/${uid}` : null);
    const candidates = [
      xdgRuntimeDir,
      '/tmp',
      uid != null ? `/run/user/${uid}/app/com.discordapp.Discord` : null,
      uid != null ? `/run/user/${uid}/app/com.discordapp.DiscordCanary` : null,
      uid != null ? `/run/user/${uid}/app/com.discordapp.DiscordPTB` : null,
      path.join(os.homedir(), '.config/discord'),
    ].filter(Boolean);

    for (const dir of candidates) {
      for (let i = 0; i < 10; i++) {
        const socketPath = path.join(dir, `discord-ipc-${i}`);
        if (fs.existsSync(socketPath)) return socketPath;
      }
    }
    return null;
  }

  formatRpcError(error) {
    if (!error) return 'unknown error';
    if (typeof error === 'string') return error;
    const parts = [error.message, error.code, error.name].filter(Boolean);
    if (!parts.length) return 'unknown error';
    return parts.join(' | ');
  }

  connect() {
    const socketPath = this.findDiscordIpcSocket();
    if (!socketPath) {
      if (!this.missingIpcWarned) {
        this.ctx.logger.warn('Discord RPC: No Discord IPC socket detected. Is Discord running?');
        this.missingIpcWarned = true;
      }
      this.ready = false;
      this.client = null;
      this.scheduleReconnect('no-ipc');
      return;
    }

    this.ctx.logger.info(`Discord RPC: Connecting (${socketPath})`);
    this.missingIpcWarned = false;
    this.lastReconnectReason = null;

    this.client = new Client({ clientId: this.clientId });

    this.client.on('ready', () => {
      this.ctx.logger.info('Discord RPC: Ready');
      this.ready = true;
      this.reconnectAttempts = 0;

      const latestResolved = this.lastResolvedState || this.resolvePlayerState(this.lastState);
      if (latestResolved) {
        this.lastResolvedState = latestResolved;
        this.lastResolvedAt = Date.now();
        this.applyActivity(latestResolved);
      } else {
        this.setIdleActivity();
      }
    });

    this.client.on('disconnected', () => {
      this.ctx.logger.warn('Discord RPC: Disconnected');
      this.ready = false;
      this.client = null;
      if (this.stopping) return;
      this.scheduleReconnect('disconnected');
    });

    this.client.login().catch((error) => {
      this.ctx.logger.error(`Discord RPC login failed: ${this.formatRpcError(error)}`);
      this.ready = false;
      this.client = null;
      if (this.stopping) return;
      this.scheduleReconnect('login-failed');
    });
  }

  scheduleReconnect(reason = 'retry') {
    if (!this.ctx.store.get('discordEnabled')) return;
    if (this.stopping) return;

    this.reconnectAttempts++;
    const baseDelay = this.ctx.store.get('rpcRetryMs', 7000);
    const maxDelay = reason === 'no-ipc' ? 120000 : 60000;
    const rawDelay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), maxDelay);
    const floorDelay = reason === 'no-ipc' ? Math.max(15000, rawDelay) : rawDelay;
    const jitter = Math.round(floorDelay * (0.9 + Math.random() * 0.2));
    const delay = Math.max(baseDelay, jitter);
    this.lastReconnectReason = reason;

    this.ctx.logger.debug(
      `RPC reconnect in ${delay}ms (attempt ${this.reconnectAttempts}, reason=${reason})`
    );

    clearTimeout(this.retryTimeout);

    this.retryTimeout = setTimeout(() => {
      if (!this.client && this.ctx.store.get('discordEnabled')) {
        this.connect();
      }
    }, delay);
  }

  stop() {
    this.stopping = true;
    clearTimeout(this.retryTimeout);
    clearTimeout(this.updateRateLimit);
    this.ready = false;
    this.retryTimeout = null;
    this.updateRateLimit = null;
    this.reconnectAttempts = 0;
    this.lastReconnectReason = null;
    this.lastSentActivity = null;

    if (this.client) {
      try {
        this.client.destroy();
      } catch (error) {
        this.ctx.logger.error('RPC destroy failed:', error.message);
      }
    }
    this.client = null;
  }

  updateFromPlayer(state) {
    this.lastState = state;
    const resolved = this.resolvePlayerState(state);
    if (!resolved) return;
    this.lastResolvedState = resolved;
    this.lastResolvedAt = Date.now();

    if (!this.ready || !this.client) return;

    const activityFields = this.buildActivityFields(resolved);
    const nextActivity = this.buildActivitySignature(resolved, activityFields);

    if (this.updateRateLimit) {
      const shouldBypassRateLimit =
        !this.lastSentActivity ||
        this.lastSentActivity.key !== nextActivity.key ||
        this.lastSentActivity.playing !== nextActivity.playing;

      if (!shouldBypassRateLimit) return;

      clearTimeout(this.updateRateLimit);
      this.updateRateLimit = null;
    }

    this.updateRateLimit = setTimeout(() => {
      this.updateRateLimit = null;
    }, 5000);

    this.applyActivity(resolved, activityFields);
  }

  setIdleActivity() {
    if (!this.client || !this.client.user) return;

    this.client.user
      .setActivity({
        details: 'Browsing Netflix',
        state: `on ${this.distroInfo.name}`,
        largeImageKey: 'netflix',
        largeImageText: 'Netflix for Linux',
        smallImageKey: this.distroInfo.key,
        smallImageText: this.distroInfo.name,
        instance: false,
      })
      .catch(() => {});
  }

  buildSessionKey(player, details, state) {
    return [
      details || '',
      state || '',
      Number.isInteger(player.season) ? player.season : '',
      Number.isInteger(player.episode) ? player.episode : '',
    ].join('|');
  }

  buildActivityFields(player) {
    const details = this.normalizeText(player.title || 'Netflix');
    let state;

    if (Number.isInteger(player.season) && Number.isInteger(player.episode)) {
      const epTitle = player.episodeTitle ? ` - ${player.episodeTitle}` : '';
      state = `S${player.season}·E${player.episode}${epTitle}`;
    } else if (player.episodeTitle) {
      state = player.episodeTitle;
    } else {
      state = `on ${this.distroInfo.name}`;
    }

    state = this.normalizeActivityState(details, state);

    let normalizedDetails = this.truncateForDiscord(details, 128);
    let normalizedState = this.truncateForDiscord(state, 128);
    if (
      normalizedDetails &&
      normalizedState &&
      normalizedDetails.toLowerCase() === normalizedState.toLowerCase()
    ) {
      normalizedState = `on ${this.distroInfo.name}`;
    }

    return {
      details: normalizedDetails,
      state: normalizedState,
    };
  }

  buildActivitySignature(player, fields) {
    return {
      key: this.buildSessionKey(player, fields.details, fields.state),
      playing: Boolean(player.playing),
    };
  }

  resolveActivityTimestamp(player, details, state) {
    if (!player.playing || !Number.isFinite(player.position) || player.position < 0) {
      return null;
    }

    const now = Date.now();
    const key = this.buildSessionKey(player, details, state);
    const session = this.activitySession;

    if (session.key !== key || !session.start) {
      session.key = key;
      session.start = Math.round(now - player.position * 1000);
      session.lastPosition = player.position;
      session.lastUpdateAt = now;
      return session.start;
    }

    const elapsedSinceLast = Math.max(0, (now - (session.lastUpdateAt || now)) / 1000);
    const posDelta = Number(player.position) - Number(session.lastPosition || 0);
    const likelySeek = Math.abs(posDelta - elapsedSinceLast) > 20;

    if (likelySeek) {
      session.start = Math.round(now - player.position * 1000);
    }

    session.lastPosition = player.position;
    session.lastUpdateAt = now;
    return session.start;
  }

  applyActivity(player, precomputedFields = null) {
    if (!this.client || !this.client.user) return;

    const isPlaying = !!player.playing;
    const activityFields = precomputedFields || this.buildActivityFields(player);
    const { details, state } = activityFields;

    const activity = {
      details,
      state,
      largeImageKey: 'netflix',
      largeImageText: 'Netflix for Linux',
      smallImageKey: this.distroInfo.key,
      smallImageText: this.distroInfo.name,
      instance: false,
    };

    // add timestamp if playing
    if (isPlaying && Number.isFinite(player.position)) {
      const start = this.resolveActivityTimestamp(player, details, state);
      if (start) {
        activity.timestamps = { start };
      }
    } else {
      this.activitySession.lastPosition = Number.isFinite(player.position) ? player.position : null;
      this.activitySession.lastUpdateAt = Date.now();
    }

    this.lastSentActivity = this.buildActivitySignature(player, activityFields);
    this.client.user.setActivity(activity).catch(() => {});
  }

  normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  isGenericNetflixTitle(value) {
    const text = this.normalizeText(value).toLowerCase();
    if (!text) return true;
    if (text === 'netflix') return true;
    if (text === 'startseite – netflix' || text === 'startseite - netflix') return true;
    if (text === 'home - netflix' || text === 'home – netflix') return true;
    if (text.endsWith(' - netflix') || text.endsWith(' – netflix')) return true;
    return false;
  }

  cleanEpisodeTitle(value) {
    const text = this.normalizeText(value)
      .replace(/([A-Za-zÄÖÜäöüß])Flg\./g, '$1 Flg.')
      .replace(/\bFlg\.\s*(\d+)/g, 'Flg. $1')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return '';
    if (this.isGenericNetflixTitle(text)) return '';
    return text;
  }

  splitCombinedEpisodeText(value) {
    const text = this.cleanEpisodeTitle(value);
    if (!text) return { title: '', episodeTitle: '' };

    const patterns = [
      /^(.*?)\s*(?:Flg\.?|Folge|Episode|Ep\.?)\s*[:#.-]?\s*\d+\s*(?:[-:–—]\s*)?(.+)$/iu,
      /^(.*?)\s+S\d+\s*E\d+\s*(?:[-:–—]\s*)?(.+)$/iu,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          title: this.normalizeText(match[1]),
          episodeTitle: this.normalizeText(match[2]),
        };
      }
    }

    return { title: '', episodeTitle: text };
  }

  stripEpisodeFromTitle(title, episodeTitle) {
    const fullTitle = this.cleanEpisodeTitle(title);
    const episode = this.cleanEpisodeTitle(episodeTitle);
    if (!fullTitle || !episode) return fullTitle;

    const titleLower = fullTitle.toLowerCase();
    const episodeLower = episode.toLowerCase();
    const episodeIndex = titleLower.lastIndexOf(episodeLower);
    if (episodeIndex < 0) return fullTitle;

    const baseTitle = fullTitle.slice(0, episodeIndex);
    const cleaned = baseTitle
      .replace(/[\s\-:–—]+$/g, '')
      .replace(/\s*(?:Flg\.?|Folge|Episode|Ep\.?)\s*\d+\s*$/iu, '')
      .replace(/\s*S\d+\s*E\d+\s*$/iu, '')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned || fullTitle;
  }

  normalizeActivityState(details, state) {
    const cleanDetails = this.normalizeText(details);
    let cleanState = this.cleanEpisodeTitle(state);
    if (!cleanState) return cleanState;

    const splitState = this.splitCombinedEpisodeText(cleanState);
    if (splitState.title && splitState.episodeTitle) {
      const splitTitle = this.normalizeText(splitState.title).toLowerCase();
      const detailsText = cleanDetails.toLowerCase();
      if (
        !detailsText ||
        splitTitle === detailsText ||
        splitTitle.includes(detailsText) ||
        detailsText.includes(splitTitle)
      ) {
        cleanState = splitState.episodeTitle;
      }
    }

    const detailsLower = cleanDetails.toLowerCase();
    const stateLower = cleanState.toLowerCase();
    if (detailsLower && stateLower.startsWith(detailsLower)) {
      const stripped = cleanState
        .slice(cleanDetails.length)
        .replace(/^[\s\-:–—]+/g, '')
        .trim();
      if (stripped) {
        cleanState = stripped;
      }
    }

    return cleanState;
  }

  truncateForDiscord(value, max = 128) {
    const text = this.normalizeText(value);
    if (!text) return '';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
  }

  resolvePlayerState(raw) {
    if (!raw || typeof raw !== 'object') return null;

    let title = this.normalizeText(raw.title);
    let episodeTitle = this.cleanEpisodeTitle(raw.episodeTitle);
    const genericTitle = this.isGenericNetflixTitle(title);
    if (!genericTitle && episodeTitle) {
      title = this.stripEpisodeFromTitle(title, episodeTitle);
    }
    const splitFromTitle = this.splitCombinedEpisodeText(title);
    const splitFromEpisode = this.splitCombinedEpisodeText(episodeTitle);

    const hasSeasonEpisode = Number.isInteger(raw.season) && Number.isInteger(raw.episode);
    const hasSpecificContext =
      hasSeasonEpisode ||
      Boolean(episodeTitle || splitFromTitle.episodeTitle || splitFromEpisode.episodeTitle);

    const state = {
      ...raw,
      title,
      episodeTitle,
    };

    // Handle combined strings like "The Night AgentFlg. 7 Es war einmal ..."
    if (splitFromTitle.title && splitFromTitle.episodeTitle) {
      state.title = splitFromTitle.title;
      if (!state.episodeTitle || state.episodeTitle.toLowerCase() === state.title.toLowerCase()) {
        state.episodeTitle = splitFromTitle.episodeTitle;
      }
      episodeTitle = state.episodeTitle;
    } else if (splitFromEpisode.title) {
      const splitTitle = this.normalizeText(splitFromEpisode.title);
      const currentTitle = this.normalizeText(state.title);
      const episodeContainsCurrentTitle =
        currentTitle &&
        this.cleanEpisodeTitle(state.episodeTitle)
          .toLowerCase()
          .startsWith(currentTitle.toLowerCase());
      const shouldUseSplitEpisode =
        genericTitle ||
        !currentTitle ||
        splitTitle.toLowerCase() === currentTitle.toLowerCase() ||
        episodeContainsCurrentTitle;

      if (shouldUseSplitEpisode) {
        if (genericTitle || !currentTitle) {
          state.title = splitTitle;
        }
        if (splitFromEpisode.episodeTitle) {
          state.episodeTitle = splitFromEpisode.episodeTitle;
          episodeTitle = splitFromEpisode.episodeTitle;
        }
      }
    }

    const finalGenericTitle = this.isGenericNetflixTitle(state.title);

    if (!finalGenericTitle) {
      if (
        state.episodeTitle &&
        state.title &&
        state.episodeTitle.toLowerCase() === state.title.toLowerCase()
      ) {
        state.episodeTitle = '';
      }
      return state;
    }

    const lastTitle = this.lastResolvedState?.title;
    const hasUsableLastTitle = lastTitle && !this.isGenericNetflixTitle(lastTitle);
    if (hasSpecificContext && hasUsableLastTitle) {
      state.title = this.lastResolvedState.title;
      return state;
    }

    if (this.lastResolvedState) {
      const ageMs = Date.now() - this.lastResolvedAt;
      if (ageMs < 10 * 60 * 1000) {
        return {
          ...state,
          title: this.lastResolvedState.title,
          season: state.season ?? this.lastResolvedState.season,
          episode: state.episode ?? this.lastResolvedState.episode,
          episodeTitle: state.episodeTitle || this.lastResolvedState.episodeTitle,
          duration: Number.isFinite(state.duration)
            ? state.duration
            : this.lastResolvedState.duration,
          position: Number.isFinite(state.position)
            ? state.position
            : this.lastResolvedState.position,
        };
      }
    }

    if (!hasSpecificContext) {
      return null;
    }

    if (
      state.episodeTitle &&
      state.title &&
      state.episodeTitle.toLowerCase() === state.title.toLowerCase()
    ) {
      state.episodeTitle = '';
    }

    return state;
  }

  cleanup() {
    this.stop();
  }
}

module.exports = RpcManager;
