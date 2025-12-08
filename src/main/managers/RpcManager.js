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
        state: 'Idle',
        largeImageKey: 'netflix',
        largeImageText: 'Netflix for Linux',
        instance: false,
      })
      .catch(() => {});
  }

  applyActivity(player) {
    if (!this.client || !this.client.user) return;

    const isPlaying = !!player.playing;
    let details = player.title || 'Netflix';
    let state;

    if (Number.isInteger(player.season) && Number.isInteger(player.episode)) {
      const epTitle = player.episodeTitle ? ` - ${player.episodeTitle}` : '';
      state = `S${player.season}·E${player.episode}${epTitle}`;
    } else if (player.episodeTitle) {
      state = player.episodeTitle;
    } else {
      state = isPlaying ? 'Watching' : 'Paused';
    }

    const activity = {
      details,
      state,
      largeImageKey: 'netflix',
      largeImageText: 'Netflix for Linux',
      instance: false,
    };

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
