const { Client } = require('@xhayper/discord-rpc');

class RpcManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.client = null;
    this.ready = false;
    this.lastState = null;
    this.retryTimeout = null;
    this.updateRateLimit = null;
    this.reconnectAttempts = 0;

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

    this.connect();
  }

  connect() {
    this.ctx.logger.info('Discord RPC: Connecting');

    this.client = new Client({ clientId: this.clientId });

    this.client.on('ready', () => {
      this.ctx.logger.info('Discord RPC: Ready');
      this.ready = true;
      this.reconnectAttempts = 0;

      if (this.lastState) {
        this.applyActivity(this.lastState);
      } else {
        this.setIdleActivity();
      }
    });

    this.client.on('disconnected', () => {
      this.ctx.logger.warn('Discord RPC: Disconnected');
      this.ready = false;
      this.client = null;
      this.scheduleReconnect();
    });

    this.client.login().catch((error) => {
      this.ctx.logger.error('Discord RPC login failed:', error.message);
      this.ready = false;
      this.client = null;
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (!this.ctx.store.get('discordEnabled')) return;

    this.reconnectAttempts++;
    const baseDelay = this.ctx.store.get('rpcRetryMs', 7000);
    const maxDelay = 60000;
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), maxDelay);

    this.ctx.logger.debug(`RPC reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    clearTimeout(this.retryTimeout);

    this.retryTimeout = setTimeout(() => {
      if (!this.client && this.ctx.store.get('discordEnabled')) {
        this.connect();
      }
    }, delay);
  }

  stop() {
    clearTimeout(this.retryTimeout);
    clearTimeout(this.updateRateLimit);
    this.ready = false;

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

    if (!this.ready || !this.client) return;

    if (this.updateRateLimit) return;

    this.updateRateLimit = setTimeout(() => {
      this.updateRateLimit = null;
    }, 5000);

    this.applyActivity(state);
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

  applyActivity(player) {
    if (!this.client || !this.client.user) return;

    const isPlaying = !!player.playing;
    let details = player.title || 'Netflix';
    let state;

    // build the episode info string
    if (Number.isInteger(player.season) && Number.isInteger(player.episode)) {
      const epTitle = player.episodeTitle ? ` - ${player.episodeTitle}` : '';
      state = `S${player.season}·E${player.episode}${epTitle}`;
    } else if (player.episodeTitle) {
      state = player.episodeTitle;
    } else {
      state = `on ${this.distroInfo.name}`;
    }

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
    if (isPlaying && player.duration > 0 && Number.isFinite(player.position)) {
      const start = Math.round(Date.now() - player.position * 1000);
      activity.timestamps = { start };
    }

    this.client.user.setActivity(activity).catch(() => {});
  }

  cleanup() {
    this.stop();
  }
}

module.exports = RpcManager;
