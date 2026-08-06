const { createFakePeerNetwork } = require('./fakePeerNetwork');
const WatchPartyClient = require('../../../src/renderer/windows/watchparty/watchPartyClient');

const flush = () => new Promise((resolve) => setImmediate(resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('WatchPartyClient', () => {
  describe('generateRoomId / normalizeRoomId', () => {
    it('generates a friendly nflx-xxxxx code', () => {
      const id = WatchPartyClient.generateRoomId();
      expect(id).toMatch(/^nflx-[a-z2-9]{5}$/);
    });

    it('normalizes whitespace and casing when joining', () => {
      expect(WatchPartyClient.normalizeRoomId('  NFLX-Ab12c  ')).toBe('nflx-ab12c');
    });
  });

  describe('event emitter', () => {
    it('lets handlers unsubscribe via the returned function', () => {
      const client = new WatchPartyClient(class {});
      const handler = jest.fn();
      const unsubscribe = client.on('chat', handler);

      client.emit('chat', { message: 'hi' });
      unsubscribe();
      client.emit('chat', { message: 'again' });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('reroutes a throwing handler into an error event instead of crashing', () => {
      const client = new WatchPartyClient(class {});
      const errorHandler = jest.fn();
      client.on('error', errorHandler);
      client.on('chat', () => {
        throw new Error('bad handler');
      });

      expect(() => client.emit('chat', {})).not.toThrow();
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('joinRoom validation', () => {
    it('rejects an empty room code without touching the Peer constructor', async () => {
      const PeerCtor = jest.fn();
      const client = new WatchPartyClient(PeerCtor);

      await expect(client.joinRoom('   ')).rejects.toThrow('Enter a room code');
      expect(PeerCtor).not.toHaveBeenCalled();
    });
  });

  describe('host + joiner scenarios (simulated network)', () => {
    let FakePeer;

    beforeEach(() => {
      FakePeer = createFakePeerNetwork();
    });

    async function makeHost(displayName) {
      const client = new WatchPartyClient(FakePeer, { displayName, migrationDelayMs: 5 });
      const roomId = await client.hostRoom();
      return { client, roomId };
    }

    async function makeJoiner(roomId, displayName) {
      const client = new WatchPartyClient(FakePeer, { displayName, migrationDelayMs: 5 });
      await client.joinRoom(roomId);
      return client;
    }

    it('resolves hostRoom with a generated room id', async () => {
      const { roomId } = await makeHost('Host');
      expect(roomId).toMatch(/^nflx-/);
    });

    it('lets a joiner connect and updates both rosters', async () => {
      const { client: host, roomId } = await makeHost('Host');
      const joiner = await makeJoiner(roomId, 'Friend');
      await flush();
      await flush();

      const hostRoster = host
        ._rosterList()
        .map((r) => r.displayName)
        .sort();
      const joinerRoster = joiner
        ._rosterList()
        .map((r) => r.displayName)
        .sort();

      expect(hostRoster).toEqual(['Friend', 'Host']);
      expect(joinerRoster).toEqual(['Friend', 'Host']);
    });

    it('relays chat from one joiner to the other, but not back to the sender', async () => {
      const { client: host, roomId } = await makeHost('Host');
      const alice = await makeJoiner(roomId, 'Alice');
      const bob = await makeJoiner(roomId, 'Bob');
      await flush();
      await flush();

      const aliceReceived = [];
      const bobReceived = [];
      const hostReceived = [];
      alice.on('chat', (msg) => aliceReceived.push(msg));
      bob.on('chat', (msg) => bobReceived.push(msg));
      host.on('chat', (msg) => hostReceived.push(msg));

      alice.sendChat('hello everyone');
      await flush();
      await flush();

      // Alice sees her own message locally (self echo), not a second time from the relay
      expect(aliceReceived).toHaveLength(1);
      expect(aliceReceived[0]).toMatchObject({ message: 'hello everyone', self: true });

      // Bob and the host, who didn't send it, receive it as a remote message
      expect(bobReceived).toHaveLength(1);
      expect(bobReceived[0]).toMatchObject({ message: 'hello everyone', self: false });
      expect(hostReceived).toHaveLength(1);
    });

    it('lets the host broadcast chat to every joiner', async () => {
      const { client: host, roomId } = await makeHost('Host');
      const alice = await makeJoiner(roomId, 'Alice');
      const bob = await makeJoiner(roomId, 'Bob');
      await flush();
      await flush();

      const received = { alice: [], bob: [] };
      alice.on('chat', (msg) => received.alice.push(msg));
      bob.on('chat', (msg) => received.bob.push(msg));

      host.sendChat('welcome');
      await flush();
      await flush();

      expect(received.alice[0]).toMatchObject({ message: 'welcome', self: false });
      expect(received.bob[0]).toMatchObject({ message: 'welcome', self: false });
    });

    it('relays playback events and tracks last known state on the host', async () => {
      const { client: host, roomId } = await makeHost('Host');
      const alice = await makeJoiner(roomId, 'Alice');
      const bob = await makeJoiner(roomId, 'Bob');
      await flush();
      await flush();

      const bobEvents = [];
      bob.on('remote-playback', (payload) => bobEvents.push(payload));

      alice.sendPlaybackEvent('pause', { currentTime: 42.5, title: 'Some Show' });
      await flush();
      await flush();

      expect(bobEvents).toHaveLength(1);
      expect(bobEvents[0]).toMatchObject({ action: 'pause', currentTime: 42.5 });
      expect(host.lastKnownState).toMatchObject({ playing: false, currentTime: 42.5 });
    });

    it('sends the current state to a newly joined peer via sync-response', async () => {
      const { client: host, roomId } = await makeHost('Host');
      host.sendPlaybackEvent('play', { currentTime: 10, title: 'Show A', url: 'https://x/1' });

      const joiner = new WatchPartyClient(FakePeer, { displayName: 'Latecomer' });
      const syncEvents = [];
      joiner.on('sync-response', (payload) => syncEvents.push(payload));

      await joiner.joinRoom(roomId);
      await flush();
      await flush();

      expect(syncEvents).toHaveLength(1);
      expect(syncEvents[0]).toMatchObject({ currentTime: 10, playing: true, title: 'Show A' });
    });

    it('lets a joiner explicitly request a resync', async () => {
      const { client: host, roomId } = await makeHost('Host');
      const joiner = await makeJoiner(roomId, 'Alice');
      await flush();
      await flush();

      host.sendPlaybackEvent('seek', { currentTime: 99, title: 'Show A' });
      await flush();

      const syncEvents = [];
      joiner.on('sync-response', (payload) => syncEvents.push(payload));
      joiner.requestSync();
      await flush();
      await flush();

      expect(syncEvents).toHaveLength(1);
      expect(syncEvents[0]).toMatchObject({ currentTime: 99 });
    });

    it('promotes the lone remaining joiner to host, reusing the same room code', async () => {
      const { client: host, roomId } = await makeHost('Host');
      const alice = await makeJoiner(roomId, 'Alice');
      await flush();
      await flush();

      const migrating = jest.fn();
      const migrationComplete = jest.fn();
      alice.on('migrating', migrating);
      alice.on('migration-complete', migrationComplete);

      host.leave();
      await wait(30);
      await flush();
      await flush();

      expect(migrating).toHaveBeenCalledWith({ iAmNewHost: true });
      expect(migrationComplete).toHaveBeenCalledWith({ isHost: true, roomId });
      expect(alice.isHost).toBe(true);
      expect(alice.roomId).toBe(roomId);
    });

    it('elects the lexicographically smallest remaining peer and reconnects everyone else to them', async () => {
      const { client: host, roomId } = await makeHost('Host');
      const alice = await makeJoiner(roomId, 'Alice');
      const bob = await makeJoiner(roomId, 'Bob');
      await flush();
      await flush();

      const [winner, loser] = [alice, bob].sort((a, b) => (a.peer.id < b.peer.id ? -1 : 1));

      host.leave();
      await wait(40);
      await flush();
      await flush();
      await flush();

      expect(winner.isHost).toBe(true);
      expect(winner.roomId).toBe(roomId);
      expect(loser.isHost).toBe(false);
      expect(loser.roomId).toBe(roomId);

      // confirm the reconnected loser is actually wired to the new host, not just idle
      const received = [];
      loser.on('chat', (msg) => received.push(msg));
      winner.sendChat('still here');
      await flush();
      await flush();

      expect(received[0]).toMatchObject({ message: 'still here' });
    });

    it('does not attempt migration when a joiner leaves intentionally', async () => {
      const { client: host, roomId } = await makeHost('Host');
      const alice = await makeJoiner(roomId, 'Alice');
      await flush();
      await flush();

      const migrating = jest.fn();
      alice.on('migrating', migrating);
      const migrateSpy = jest.spyOn(alice, '_attemptMigration');

      alice.leave();
      await wait(20);
      await flush();

      expect(migrateSpy).not.toHaveBeenCalled();
      expect(migrating).not.toHaveBeenCalled();
      expect(host._rosterList().map((r) => r.displayName)).not.toContain('Alice');
    });

    it('ends the party if no candidates remain to become the new host', async () => {
      const { client: host, roomId } = await makeHost('Host');
      const alice = await makeJoiner(roomId, 'Alice');
      await flush();
      await flush();

      alice.roster.clear(); // simulate a corrupted/never-synced roster
      const partyEnded = jest.fn();
      alice.on('party-ended', partyEnded);

      host.leave();
      await flush();

      expect(partyEnded).toHaveBeenCalledTimes(1);
    });

    it('removes a disconnected joiner from the host roster without ending the party', async () => {
      const { client: host, roomId } = await makeHost('Host');
      const alice = await makeJoiner(roomId, 'Alice');
      await makeJoiner(roomId, 'Bob');
      await flush();
      await flush();

      const hostPartyEnded = jest.fn();
      host.on('party-ended', hostPartyEnded);

      alice.leave();
      await flush();
      await flush();

      expect(hostPartyEnded).not.toHaveBeenCalled();
      expect(host._rosterList().map((r) => r.displayName)).not.toContain('Alice');
      expect(host._rosterList().map((r) => r.displayName)).toContain('Bob');
    });
  });
});
