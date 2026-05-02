const RpcManager = require('../../../src/main/managers/RpcManager');

const mockClient = {
  on: jest.fn(),
  login: jest.fn(),
  destroy: jest.fn(),
  user: null,
};

jest.mock('@xhayper/discord-rpc', () => ({
  Client: jest.fn(() => mockClient),
}));

describe('RpcManager', () => {
  let ctx;
  let manager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockClient.on.mockClear();
    mockClient.login.mockClear().mockResolvedValue(undefined);
    mockClient.destroy.mockClear();
    mockClient.user = null;

    ctx = {
      store: {
        get: jest.fn((key, fallback) => {
          const defaults = {
            discordEnabled: true,
            discordClientId: 'test-client-id',
            rpcRetryMs: 7000,
          };
          return defaults[key] !== undefined ? defaults[key] : fallback;
        }),
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    };

    manager = new RpcManager(ctx);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('reconnection', () => {
    it('should use exponential backoff', () => {
      jest.spyOn(manager, 'findDiscordIpcSocket').mockReturnValue('/tmp/discord-ipc-0');

      manager.start();
      const disconnectHandler = mockClient.on.mock.calls.find(([event]) => event === 'disconnected')?.[1];

      disconnectHandler();
      expect(manager.reconnectAttempts).toBe(1);

      mockClient.login.mockClear();
    
      manager.client = null;
      manager.connect();
      
      const disconnectHandler2 = mockClient.on.mock.calls.find(([event]) => event === 'disconnected')?.[1];
      disconnectHandler2();
      expect(manager.reconnectAttempts).toBe(2);

      mockClient.login.mockClear();
      
      jest.advanceTimersByTime(7000);
      expect(mockClient.login).not.toHaveBeenCalled();

      jest.advanceTimersByTime(9000);
      expect(mockClient.login).toHaveBeenCalled();
    });
  });

  describe('state resolution', () => {
    it('should reuse last meaningful title when raw title is generic Netflix', () => {
      manager.lastResolvedState = {
        title: 'The Night Agent',
        episodeTitle: 'Episode 7',
        season: 1,
        episode: 7,
        playing: true,
      };
      manager.lastResolvedAt = Date.now();

      const resolved = manager.resolvePlayerState({
        title: 'Netflix',
        episodeTitle: 'Es war einmal ...',
        season: 1,
        episode: 7,
        playing: true,
      });

      expect(resolved).toBeTruthy();
      expect(resolved.title).toBe('The Night Agent');
      expect(resolved.episodeTitle).toBe('Es war einmal ...');
    });

    it('should ignore generic Netflix updates with no context', () => {
      const resolved = manager.resolvePlayerState({
        title: 'Netflix',
        episodeTitle: '',
        playing: true,
      });

      expect(resolved).toBeNull();
    });

    it('should split combined german episode text when title is generic', () => {
      const resolved = manager.resolvePlayerState({
        title: 'Netflix',
        episodeTitle: 'The Night AgentFlg. 7 Es war einmal ...',
        playing: true,
      });

      expect(resolved).toBeTruthy();
      expect(resolved.title).toBe('The Night Agent');
      expect(resolved.episodeTitle).toBe('Es war einmal ...');
    });

    it('should strip duplicated episode context from title when episodeTitle already exists', () => {
      const resolved = manager.resolvePlayerState({
        title: 'The Night AgentFlg.7 Es war einmal ...',
        episodeTitle: 'Es war einmal ...',
        playing: true,
      });

      expect(resolved).toBeTruthy();
      expect(resolved.title).toBe('The Night Agent');
      expect(resolved.episodeTitle).toBe('Es war einmal ...');
    });

    it('should split combined episodeTitle even when title is already clean', () => {
      const resolved = manager.resolvePlayerState({
        title: 'The Night Agent',
        episodeTitle: 'The Night AgentFlg. 7 Es war einmal ...',
        playing: true,
      });

      expect(resolved).toBeTruthy();
      expect(resolved.title).toBe('The Night Agent');
      expect(resolved.episodeTitle).toBe('Es war einmal ...');
    });
  });

  describe('activity timestamp', () => {
    it('should keep a stable start timestamp for the same session', () => {
      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy
        .mockReturnValueOnce(1_000_000)
        .mockReturnValueOnce(1_005_000)
        .mockReturnValueOnce(1_010_000);

      const first = manager.resolveActivityTimestamp(
        { playing: true, position: 100, season: 1, episode: 1 },
        'Show',
        'S1·E1'
      );
      const second = manager.resolveActivityTimestamp(
        { playing: true, position: 105, season: 1, episode: 1 },
        'Show',
        'S1·E1'
      );

      expect(first).toBeTruthy();
      expect(second).toBe(first);
      nowSpy.mockRestore();
    });

    it('should include timestamps while playing even without duration', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(2_000_000);
      const setActivity = jest.fn().mockResolvedValue(undefined);
      mockClient.user = { setActivity };
      manager.client = mockClient;

      manager.applyActivity({
        title: 'The Night Agent',
        episodeTitle: 'Es war einmal ...',
        playing: true,
        position: 12,
      });

      const payload = setActivity.mock.calls[0][0];
      expect(payload.timestamps).toBeTruthy();
      expect(payload.timestamps.start).toBe(1_988_000);
      nowSpy.mockRestore();
    });

    it('should omit timestamps when paused', () => {
      const setActivity = jest.fn().mockResolvedValue(undefined);
      mockClient.user = { setActivity };
      manager.client = mockClient;

      manager.applyActivity({
        title: 'Breaking Bad',
        episodeTitle: 'Half Measures',
        playing: false,
        position: 42,
      });

      const payload = setActivity.mock.calls[0][0];
      expect(payload.timestamps).toBeUndefined();
    });

    it('should bypass rate limiting when playback state changes to paused', () => {
      const setActivity = jest.fn().mockResolvedValue(undefined);
      mockClient.user = { setActivity };
      manager.client = mockClient;
      manager.ready = true;

      manager.updateFromPlayer({
        title: 'BAKI-DOU: The Invincible Samurai',
        episodeTitle: 'Der Herzschlag',
        playing: true,
        position: 6,
      });

      manager.updateFromPlayer({
        title: 'BAKI-DOU: The Invincible Samurai',
        episodeTitle: 'Der Herzschlag',
        playing: false,
        position: 6,
      });

      expect(setActivity).toHaveBeenCalledTimes(2);
      expect(setActivity.mock.calls[0][0].timestamps).toBeTruthy();
      expect(setActivity.mock.calls[1][0].timestamps).toBeUndefined();
    });
  });

  describe('activity formatting', () => {
    it('should avoid duplicating show title in activity state', () => {
      const setActivity = jest.fn().mockResolvedValue(undefined);
      mockClient.user = { setActivity };
      manager.client = mockClient;

      manager.applyActivity({
        title: 'The Night Agent',
        episodeTitle: 'The Night Agent Flg.7 Es war einmal ...',
        playing: true,
        position: 5,
      });

      const payload = setActivity.mock.calls[0][0];
      expect(payload.details).toBe('The Night Agent');
      expect(payload.state.toLowerCase()).not.toContain('the night agent');
      expect(payload.state).toContain('Es war einmal');
    });
  });
});
