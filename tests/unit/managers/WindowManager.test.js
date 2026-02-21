const { BrowserWindow, session } = require('electron');
const WindowManager = require('../../../src/main/managers/WindowManager');

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  session: {
    fromPartition: jest.fn(),
  },
}));

jest.mock('../../../src/main/utils/environment', () =>
  jest.fn().mockImplementation(() => ({
    isHyprland: () => false,
  }))
);

describe('WindowManager', () => {
  let ctx;
  let manager;
  let mockWindow;
  let mockSession;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSession = {
      webRequest: {
        onBeforeSendHeaders: jest.fn(),
        onHeadersReceived: jest.fn(),
      },
      clearStorageData: jest.fn().mockResolvedValue(undefined),
    };

    session.fromPartition.mockReturnValue(mockSession);

    mockWindow = {
      loadURL: jest.fn().mockResolvedValue(undefined),
      loadFile: jest.fn().mockResolvedValue(undefined),
      show: jest.fn(),
      minimize: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
      isMinimized: jest.fn().mockReturnValue(false),
      close: jest.fn(),
      focus: jest.fn(),
      restore: jest.fn(),
      getBounds: jest.fn().mockReturnValue({ x: 0, y: 0, width: 1280, height: 800 }),
      setBounds: jest.fn(),
      setAlwaysOnTop: jest.fn(),
      on: jest.fn(),
      once: jest.fn((event, callback) => {
        if (event === 'ready-to-show') setTimeout(callback, 0);
      }),
      webContents: {
        session: mockSession,
        setUserAgent: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
      },
    };

    BrowserWindow.mockImplementation(() => mockWindow);
    BrowserWindow.getAllWindows = jest.fn().mockReturnValue([]);

    ctx = {
      store: {
        get: jest.fn((key, fallback) => {
          const defaults = {
            profiles: {
              default: {
                name: 'Default',
                url: 'https://www.netflix.com/',
                color: '#e50914',
                partition: 'persist:default',
              },
            },
            currentProfile: 'default',
            borderless: false,
            alwaysOnTop: false,
            startMinimized: false,
            windowStates: {},
          };
          return defaults[key] !== undefined ? defaults[key] : fallback;
        }),
        set: jest.fn(),
        delete: jest.fn(),
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    };

    manager = new WindowManager(ctx);
  });

  describe('createMainWindow', () => {
    it('should create main window with correct configuration', () => {
      const window = manager.createMainWindow();

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          minWidth: 960,
          minHeight: 540,
          backgroundColor: '#000000',
          autoHideMenuBar: true,
        })
      );
      expect(window).toBe(mockWindow);
    });

    it('should load correct profile URL', () => {
      manager.createMainWindow();

      expect(mockWindow.loadURL).toHaveBeenCalledWith('https://www.netflix.com/');
    });

    it('should configure session headers', () => {
      manager.createMainWindow();

      expect(mockSession.webRequest.onBeforeSendHeaders).toHaveBeenCalled();
      expect(mockSession.webRequest.onHeadersReceived).toHaveBeenCalled();
    });

    it('should handle pending profile switch', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'pendingProfileSwitch') return 'work';
        if (key === 'profiles') {
          return {
            default: { name: 'Default', url: 'https://www.netflix.com/' },
            work: { name: 'Work', url: 'https://www.netflix.com/work', partition: 'persist:work' },
          };
        }
        if (key === 'currentProfile') return 'default';
      });

      manager.createMainWindow();

      expect(ctx.store.delete).toHaveBeenCalledWith('pendingProfileSwitch');
      expect(ctx.store.set).toHaveBeenCalledWith('currentProfile', 'work');
    });

    it('should track window state', () => {
      manager.createMainWindow();

      expect(mockWindow.on).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(mockWindow.on).toHaveBeenCalledWith('move', expect.any(Function));
    });

    it('should start minimized when configured', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'startMinimized') return true;
        if (key === 'profiles') return manager.getDefaultProfiles();
        if (key === 'currentProfile') return 'default';
      });

      manager.createMainWindow();

      const readyCallback = mockWindow.once.mock.calls.find(([event]) => event === 'ready-to-show')?.[1];
      if (readyCallback) readyCallback();

      expect(mockWindow.show).toHaveBeenCalled();
      expect(mockWindow.minimize).toHaveBeenCalled();
    });

    it('should set borderless window when configured', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'borderless') return true;
        if (key === 'profiles') return manager.getDefaultProfiles();
        if (key === 'currentProfile') return 'default';
      });

      manager.createMainWindow();

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          frame: false,
          titleBarStyle: 'hidden',
        })
      );
    });
  });

  describe('createSettingsWindow', () => {
    beforeEach(() => {
      manager.windows.set('main', mockWindow);
    });

    it('should create settings window', () => {
      const settingsWindow = manager.createSettingsWindow();

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 540,
          height: 760,
          resizable: false,
          title: 'Settings',
        })
      );
      expect(settingsWindow).toBe(mockWindow);
    });

    it('should recreate window if destroyed', () => {
      const destroyedWindow = { ...mockWindow, isDestroyed: jest.fn().mockReturnValue(true) };
      manager.windows.set('settings', destroyedWindow);

      const window = manager.createSettingsWindow();

      expect(BrowserWindow).toHaveBeenCalled();
    });
  });

  describe('focusMainWindow', () => {
    it('should restore and focus minimized window', () => {
      mockWindow.isMinimized.mockReturnValue(true);
      manager.windows.set('main', mockWindow);

      manager.focusMainWindow();

      expect(mockWindow.restore).toHaveBeenCalled();
      expect(mockWindow.focus).toHaveBeenCalled();
    });

    it('should focus normal window', () => {
      manager.windows.set('main', mockWindow);

      manager.focusMainWindow();

      expect(mockWindow.restore).not.toHaveBeenCalled();
      expect(mockWindow.focus).toHaveBeenCalled();
    });

    it('should handle missing main window', () => {
      manager.focusMainWindow();

      expect(mockWindow.focus).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should close all windows', () => {
      manager.windows.set('main', mockWindow);
      manager.windows.set('settings', { ...mockWindow, isDestroyed: jest.fn().mockReturnValue(false) });

      manager.cleanup();

      expect(mockWindow.close).toHaveBeenCalledTimes(2);
      expect(manager.windows.size).toBe(0);
    });
  });
});
