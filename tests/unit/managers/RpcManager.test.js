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

      jest.advanceTimersByTime(7000);
      expect(mockClient.login).toHaveBeenCalled();
    });
  });
});