// Star topology: the host's peer id is the room code; joiners only talk to
// the host, who relays chat/playback to everyone else. No Node APIs here
// since this loads as a plain <script> in a contextIsolation window (also
// required directly under Jest via the UMD wrapper below).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WatchPartyClient = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  const ROOM_ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/l/i ambiguity
  const PROTOCOL_VERSION = 1;

  function generateRoomId() {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += ROOM_ID_ALPHABET[Math.floor(Math.random() * ROOM_ID_ALPHABET.length)];
    }
    return `nflx-${code}`;
  }

  function normalizeRoomId(input) {
    return String(input || '')
      .trim()
      .toLowerCase();
  }

  class WatchPartyClient {
    constructor(PeerCtor, { displayName, migrationDelayMs = 500 } = {}) {
      this.PeerCtor = PeerCtor;
      this.displayName = displayName || 'Guest';
      this.migrationDelayMs = migrationDelayMs;
      this.peer = null;
      this.isHost = false;
      this.roomId = null;
      this.connections = new Map(); // peerId -> DataConnection
      this.roster = new Map(); // peerId -> displayName
      this.lastKnownState = null; // host-only, answers sync-request
      this.listeners = new Map(); // event -> Set<handler>
      this._leaving = false;
    }

    on(event, handler) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event).add(handler);
      return () => this.listeners.get(event)?.delete(handler);
    }

    emit(event, payload) {
      const handlers = this.listeners.get(event);
      if (!handlers) return;
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (err) {
          if (event !== 'error') this.emit('error', err);
        }
      }
    }

    hostRoom(explicitId = null, { timeoutMs = 8000 } = {}) {
      return new Promise((resolve, reject) => {
        const roomId = explicitId || generateRoomId();
        const peer = new this.PeerCtor(roomId);
        this.peer = peer;
        this.isHost = true;
        this.roomId = roomId;
        this.roster.clear();

        const settle = this._settler(resolve, reject, timeoutMs);

        peer.on('open', (id) => {
          this.roomId = id;
          this.roster.set(id, this.displayName);
          settle.resolve(id);
        });

        peer.on('connection', (conn) => this._acceptIncoming(conn));
        peer.on('error', (err) => {
          this.emit('error', err);
          settle.reject(err);
        });
      });
    }

    joinRoom(rawRoomId, { timeoutMs = 8000 } = {}) {
      const roomId = normalizeRoomId(rawRoomId);

      return new Promise((resolve, reject) => {
        if (!roomId) {
          reject(new Error('Enter a room code'));
          return;
        }

        const peer = new this.PeerCtor();
        this.peer = peer;
        this.isHost = false;
        this.roomId = roomId;

        const settle = this._settler(resolve, reject, timeoutMs);

        peer.on('open', () => {
          const conn = peer.connect(roomId, { reliable: true });
          this._wireConnection(conn, roomId);

          conn.on('open', () => {
            this.connections.set(roomId, conn);
            conn.send(this._envelope('hello', { displayName: this.displayName }));
            settle.resolve(roomId);
          });

          conn.on('error', (err) => {
            this.emit('error', err);
            settle.reject(err);
          });
        });

        peer.on('error', (err) => {
          this.emit('error', err);
          settle.reject(err);
        });
      });
    }

    // wraps resolve/reject so only the first settles, plus a timeout — PeerJS
    // doesn't reliably emit an error for an unreachable/nonexistent room id
    _settler(resolve, reject, timeoutMs) {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error('Connection timed out'));
      }, timeoutMs);

      return {
        resolve: (value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(err);
        },
      };
    }

    sendPlaybackEvent(action, payload = {}) {
      const msg = this._envelope('playback', { action, ...payload });

      if (this.isHost) {
        this.lastKnownState = {
          currentTime: payload.currentTime,
          playing: action !== 'pause',
          title: payload.title,
          url: payload.url,
        };
        this._broadcast(msg);
      } else {
        this.connections.get(this.roomId)?.send(msg);
      }
    }

    sendChat(message) {
      const payload = { message, displayName: this.displayName };
      const msg = this._envelope('chat', payload);

      // local echo, so the sender sees their own message immediately
      this.emit('chat', { ...payload, from: this.peer ? this.peer.id : null, self: true });

      if (this.isHost) {
        this._broadcast(msg);
      } else {
        this.connections.get(this.roomId)?.send(msg);
      }
    }

    requestSync() {
      if (this.isHost) return;
      this.connections.get(this.roomId)?.send(this._envelope('sync-request', {}));
    }

    leave() {
      this._leaving = true;

      for (const conn of this.connections.values()) {
        try {
          conn.close();
        } catch {
          // ignore
        }
      }
      this.connections.clear();
      this.roster.clear();

      if (this.peer) {
        try {
          this.peer.destroy();
        } catch {
          // ignore
        }
      }

      this.emit('left');
    }

    _acceptIncoming(conn) {
      this._wireConnection(conn, conn.peer);
      conn.on('open', () => {
        this.connections.set(conn.peer, conn);
        conn.send(this._envelope('roster', { roster: this._rosterList() }));
        if (this.lastKnownState) {
          conn.send(this._envelope('sync-response', this.lastKnownState));
        }
      });
    }

    _wireConnection(conn, peerId) {
      conn.on('data', (msg) => this._handleMessage(peerId, msg));
      conn.on('close', () => this._handleDisconnect(peerId));
      conn.on('error', (err) => this.emit('error', err));
    }

    _handleDisconnect(peerId) {
      this.connections.delete(peerId);
      const wasKnown = this.roster.delete(peerId);

      if (wasKnown) {
        this.emit('roster-changed', this._rosterList());
        if (this.isHost) {
          this._broadcast(this._envelope('roster', { roster: this._rosterList() }));
        }
      }

      this.emit('peer-left', peerId);

      if (!this.isHost && !this._leaving && peerId === this.roomId) {
        this._attemptMigration();
      }
    }

    // deterministic election: everyone already has the same roster, so
    // "smallest remaining peer id" picks the same winner with no coordination
    _attemptMigration() {
      const candidates = Array.from(this.roster.keys());
      if (candidates.length === 0) {
        this.emit('party-ended');
        return;
      }

      const oldRoomId = this.roomId;
      const newHostId = candidates.sort()[0];
      const iAmNewHost = this.peer && this.peer.id === newHostId;

      this.emit('migrating', { iAmNewHost });

      if (iAmNewHost) {
        this._becomeHostAfterMigration(oldRoomId);
      } else {
        this._reconnectAfterMigration(oldRoomId);
      }
    }

    async _becomeHostAfterMigration(oldRoomId, attempt = 1) {
      const maxAttempts = 4;
      await new Promise((resolve) => setTimeout(resolve, this.migrationDelayMs * attempt));

      try {
        await this.hostRoom(oldRoomId);
        this.emit('migration-complete', { isHost: true, roomId: this.roomId });
      } catch (err) {
        if (attempt >= maxAttempts) {
          this.emit('error', err);
          this.emit('party-ended');
          return;
        }
        this._becomeHostAfterMigration(oldRoomId, attempt + 1);
      }
    }

    async _reconnectAfterMigration(targetRoomId, attempt = 1) {
      const maxAttempts = 5;
      await new Promise((resolve) => setTimeout(resolve, this.migrationDelayMs * 1.4 * attempt));

      try {
        await this.joinRoom(targetRoomId);
        this.emit('migration-complete', { isHost: false, roomId: this.roomId });
      } catch (err) {
        if (attempt >= maxAttempts) {
          this.emit('error', err);
          this.emit('party-ended');
          return;
        }
        this._reconnectAfterMigration(targetRoomId, attempt + 1);
      }
    }

    _handleMessage(peerId, msg) {
      if (!msg || typeof msg !== 'object' || msg.v !== PROTOCOL_VERSION) return;

      switch (msg.type) {
        case 'hello':
          this.roster.set(peerId, msg.payload.displayName || 'Guest');
          this.emit('roster-changed', this._rosterList());
          if (this.isHost) {
            this._broadcast(this._envelope('roster', { roster: this._rosterList() }));
          }
          break;

        case 'roster':
          this.roster = new Map((msg.payload.roster || []).map((r) => [r.id, r.displayName]));
          this.emit('roster-changed', this._rosterList());
          break;

        case 'playback':
          if (this.isHost) {
            this.lastKnownState = {
              currentTime: msg.payload.currentTime,
              playing: msg.payload.action !== 'pause',
              title: msg.payload.title,
              url: msg.payload.url,
            };
            this._broadcast(msg, peerId);
          }
          this.emit('remote-playback', msg.payload);
          break;

        case 'chat':
          if (this.isHost) this._broadcast(msg, peerId);
          this.emit('chat', { ...msg.payload, from: peerId, self: false });
          break;

        case 'sync-request':
          if (this.isHost && this.lastKnownState) {
            this.connections
              .get(peerId)
              ?.send(this._envelope('sync-response', this.lastKnownState));
          }
          break;

        case 'sync-response':
          this.emit('sync-response', msg.payload);
          break;

        default:
          break;
      }
    }

    _envelope(type, payload) {
      return {
        v: PROTOCOL_VERSION,
        type,
        payload,
        from: this.peer ? this.peer.id : null,
        at: Date.now(),
      };
    }

    _rosterList() {
      return Array.from(this.roster.entries()).map(([id, displayName]) => ({ id, displayName }));
    }

    _broadcast(msg, exceptPeerId = null) {
      for (const [id, conn] of this.connections) {
        if (id === exceptPeerId) continue;
        try {
          conn.send(msg);
        } catch (err) {
          this.emit('error', err);
        }
      }
    }
  }

  WatchPartyClient.generateRoomId = generateRoomId;
  WatchPartyClient.normalizeRoomId = normalizeRoomId;

  return WatchPartyClient;
});
