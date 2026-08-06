const { ipcMain } = require('electron');
const setupWatchPartyHandlers = require('../../../src/main/handlers/watchparty');

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
  },
}));

describe('Watch Party Handlers', () => {
  let ctx;
  let watchPartyService;
  let storeValues;

  beforeEach(() => {
    jest.clearAllMocks();
    storeValues = { watchPartyDisplayName: '' };

    watchPartyService = {
      start: jest.fn(),
      stop: jest.fn(),
      getCurrentState: jest.fn().mockResolvedValue({ playing: true, currentTime: 1 }),
      applyRemoteCommand: jest.fn().mockResolvedValue({ applied: true }),
    };

    ctx = {
      store: {
        get: jest.fn((key, fallback) =>
          storeValues[key] !== undefined ? storeValues[key] : fallback
        ),
        set: jest.fn((key, value) => {
          storeValues[key] = value;
        }),
      },
      logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      getService: jest.fn((name) => (name === 'watchParty' ? watchPartyService : null)),
    };

    setupWatchPartyHandlers(ctx);
  });

  function getHandle(channel) {
    const call = ipcMain.handle.mock.calls.find(([name]) => name === channel);
    return call ? call[1] : null;
  }

  function getOn(channel) {
    const call = ipcMain.on.mock.calls.find(([name]) => name === channel);
    return call ? call[1] : null;
  }

  describe('watch-party:get-display-name / set-display-name', () => {
    it('returns the stored display name', async () => {
      storeValues.watchPartyDisplayName = 'Alice';
      const result = await getHandle('watch-party:get-display-name')();
      expect(result).toBe('Alice');
    });

    it('sanitizes and truncates the display name before storing it', async () => {
      const longName = `<b>${'x'.repeat(40)}</b>`;
      const result = await getHandle('watch-party:set-display-name')({}, longName);

      expect(result).not.toMatch(/[<>]/);
      expect(result.length).toBeLessThanOrEqual(24);
      expect(storeValues.watchPartyDisplayName).toBe(result);
    });
  });

  describe('watch-party:get-current-state', () => {
    it('delegates to the service', async () => {
      const result = await getHandle('watch-party:get-current-state')();
      expect(result).toEqual({ playing: true, currentTime: 1 });
    });

    it('returns null when the service is unavailable', async () => {
      ctx.getService.mockReturnValue(null);
      const result = await getHandle('watch-party:get-current-state')();
      expect(result).toBeNull();
    });
  });

  describe('watch-party:apply-remote', () => {
    it('delegates action and payload to the service', async () => {
      const result = await getHandle('watch-party:apply-remote')(
        {},
        { action: 'pause', payload: { currentTime: 5 } }
      );

      expect(watchPartyService.applyRemoteCommand).toHaveBeenCalledWith('pause', {
        currentTime: 5,
      });
      expect(result).toEqual({ applied: true });
    });

    it('reports an error when the service is unavailable', async () => {
      ctx.getService.mockReturnValue(null);
      const result = await getHandle('watch-party:apply-remote')({}, { action: 'play' });
      expect(result.applied).toBe(false);
    });
  });

  describe('watch-party:set-active', () => {
    it('starts the service when becoming active', async () => {
      await getOn('watch-party:set-active')({}, true);
      expect(watchPartyService.start).toHaveBeenCalled();
      expect(watchPartyService.stop).not.toHaveBeenCalled();
    });

    it('stops the service when becoming inactive', async () => {
      await getOn('watch-party:set-active')({}, false);
      expect(watchPartyService.stop).toHaveBeenCalled();
    });

    it('does not throw when the service is unavailable', async () => {
      ctx.getService.mockReturnValue(null);
      await expect(getOn('watch-party:set-active')({}, true)).resolves.toBeUndefined();
    });
  });
});
