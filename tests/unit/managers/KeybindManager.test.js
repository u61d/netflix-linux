const { globalShortcut } = require('electron');
const KeybindManager = require('../../../src/main/managers/KeybindManager');

jest.mock('electron', () => ({
  app: {
    quit: jest.fn(),
  },
  globalShortcut: {
    register: jest.fn(),
    unregisterAll: jest.fn(),
  },
}));

describe('KeybindManager', () => {
  let ctx;
  let manager;
  let win;

  beforeEach(() => {
    jest.clearAllMocks();

    win = {
      webContents: {
        on: jest.fn(),
      },
    };

    const mockWindowManager = {
      createSettingsWindow: jest.fn(),
      createKeybindsWindow: jest.fn(),
      createHistoryWindow: jest.fn(),
      createQueueWindow: jest.fn(),
      createProfilesWindow: jest.fn(),
    };

    const mockScreenshotService = {
      capture: jest.fn(),
      captureToClipboard: jest.fn(),
    };

    const mockPlaybackService = {
      togglePictureInPicture: jest.fn(),
      cycleSpeed: jest.fn(),
      setSpeed: jest.fn(),
      reset: jest.fn(),
      togglePlayPause: jest.fn(),
      seek: jest.fn(),
    };

    const mockHistoryService = {
      showQuickStats: jest.fn(),
      export: jest.fn(),
    };

    const mockStatsOverlay = {
      toggle: jest.fn(),
    };

    ctx = {
      store: {
        get: jest.fn((key, fallback) => {
          if (key === 'customKeybinds') return {};
          if (key === 'alwaysOnTop') return false;
          return fallback;
        }),
        set: jest.fn(),
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
      getMainWindow: jest.fn().mockReturnValue(win),
      getManager: jest.fn((name) => {
        if (name === 'window') return mockWindowManager;
        return null;
      }),
      getService: jest.fn((name) => {
        if (name === 'screenshot') return mockScreenshotService;
        if (name === 'playback') return mockPlaybackService;
        if (name === 'history') return mockHistoryService;
        if (name === 'statsOverlay') return mockStatsOverlay;
        return null;
      }),
    };

    manager = new KeybindManager(ctx);
  });

  describe('register', () => {
    it('should register all default keybinds', () => {
      globalShortcut.register.mockReturnValue(true);

      manager.register();

      expect(globalShortcut.register).toHaveBeenCalled();
      expect(manager.registered.size).toBeGreaterThan(0);
      expect(ctx.logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/Registered \d+ global shortcuts/)
      );
    });

    it('should skip keybinds without handlers', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'customKeybinds') {
          return { nonExistentAction: 'Ctrl+Z' };
        }
        return {};
      });

      manager.register();
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/No handler found for action: nonExistentAction/)
      );
    });
  });

  describe('cleanup', () => {
    it('should unregister all on cleanup', () => {
      globalShortcut.register.mockReturnValue(true);
      manager.register();
      const initialSize = manager.registered.size;
      expect(initialSize).toBeGreaterThan(0);

      manager.cleanup();

      expect(globalShortcut.unregisterAll).toHaveBeenCalled();
      expect(manager.registered.size).toBe(0);
    });
  });
});