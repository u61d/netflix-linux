// A minimal in-memory stand-in for PeerJS, just accurate enough to exercise
// WatchPartyClient's star-topology relay logic end to end without a real
// network. Each FakePeer registers itself in a shared `network` map by id;
// connect() looks up the target and wires up a pair of linked
// FakeDataConnections so that send() on one side fires 'data' on the other.

class MiniEmitter {
  constructor() {
    this.handlers = new Map();
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(handler);
  }

  emit(event, payload) {
    (this.handlers.get(event) || []).forEach((handler) => handler(payload));
  }
}

function createFakePeerNetwork() {
  const registry = new Map(); // id -> FakePeer
  let autoIdCounter = 0;

  class FakeDataConnection extends MiniEmitter {
    constructor(peerId) {
      super();
      this.peer = peerId; // matches real PeerJS: conn.peer === remote peer's id
      this.other = null; // the paired connection on the remote side
      this.closed = false;
    }

    send(data) {
      if (this.closed || !this.other) return;
      Promise.resolve().then(() => {
        if (!this.other.closed) this.other.emit('data', data);
      });
    }

    close() {
      if (this.closed) return;
      this.closed = true;
      this.emit('close');
      if (this.other && !this.other.closed) this.other.close();
    }
  }

  class FakePeer extends MiniEmitter {
    constructor(id) {
      super();
      this.id = id || `auto-${++autoIdCounter}`;
      this.destroyed = false;
      registry.set(this.id, this);
      Promise.resolve().then(() => {
        if (!this.destroyed) this.emit('open', this.id);
      });
    }

    connect(remoteId) {
      const mine = new FakeDataConnection(remoteId);
      const target = registry.get(remoteId);

      Promise.resolve().then(() => {
        if (!target || target.destroyed) {
          mine.emit('error', new Error(`peer ${remoteId} not found`));
          return;
        }
        const theirs = new FakeDataConnection(this.id);
        mine.other = theirs;
        theirs.other = mine;
        target.emit('connection', theirs);
        Promise.resolve().then(() => {
          theirs.emit('open');
          mine.emit('open');
        });
      });

      return mine;
    }

    destroy() {
      this.destroyed = true;
      registry.delete(this.id);
    }
  }

  return FakePeer;
}

module.exports = { createFakePeerNetwork };
