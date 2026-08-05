const mockTrayInstance = {
  setToolTip: jest.fn(),
  setContextMenu: jest.fn(),
  setImage: jest.fn(),
  destroy: jest.fn(),
};
const mockTrayConstructor = jest.fn(() => mockTrayInstance);
const mockMenuBuildFromTemplate = jest.fn((template) => ({ template }));
const mockNativeImageCreateFromPath = jest.fn((p) => ({ path: p }));

jest.mock('electron', () => ({
  Tray: mockTrayConstructor,
  Menu: { buildFromTemplate: mockMenuBuildFromTemplate },
  nativeImage: { createFromPath: mockNativeImageCreateFromPath },
}));

const { ASSETS } = require('../../../src/config/constants');
const TrayManager = require('../../../src/main/managers/TrayManager');

function findItem(template, label) {
  return template.find((item) => item.label === label);
}

describe('TrayManager', () => {
  let ctx;
  let manager;
  let mockWindow;
  let windowManager;
  let playbackService;
  let screenshotService;
  let historyService;
  let rpcManager;
  let storeOverrides;

  beforeEach(() => {
    jest.clearAllMocks();

    storeOverrides = {
      alwaysOnTop: false,
      playbackSpeed: 1.0,
      autoSkipIntro: false,
      discordEnabled: false,
    };

    mockWindow = { setAlwaysOnTop: jest.fn() };
    windowManager = {
      createHistoryWindow: jest.fn(),
      createSettingsWindow: jest.fn(),
    };
    playbackService = { togglePictureInPicture: jest.fn(), setSpeed: jest.fn() };
    screenshotService = { capture: jest.fn() };
    historyService = { showQuickStats: jest.fn() };
    rpcManager = { start: jest.fn(), stop: jest.fn() };

    ctx = {
      store: {
        get: jest.fn((key, fallback) =>
          storeOverrides[key] !== undefined ? storeOverrides[key] : fallback
        ),
        set: jest.fn((key, value) => {
          storeOverrides[key] = value;
        }),
      },
      logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      getMainWindow: jest.fn(() => mockWindow),
      getManager: jest.fn((name) => {
        if (name === 'window') return windowManager;
        if (name === 'rpc') return rpcManager;
        return null;
      }),
      getService: jest.fn((name) => {
        if (name === 'playback') return playbackService;
        if (name === 'screenshot') return screenshotService;
        if (name === 'history') return historyService;
        return null;
      }),
    };

    manager = new TrayManager(ctx);
  });

  describe('setup', () => {
    it('creates the tray, sets the tooltip, and builds the initial menu', () => {
      manager.setup();

      expect(mockTrayConstructor).toHaveBeenCalledTimes(1);
      expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith('Netflix');
      expect(mockTrayInstance.setContextMenu).toHaveBeenCalled();
    });

    it('logs an error instead of throwing if tray creation fails', () => {
      mockTrayConstructor.mockImplementationOnce(() => {
        throw new Error('no display');
      });

      expect(() => manager.setup()).not.toThrow();
      expect(ctx.logger.error).toHaveBeenCalledWith('Tray setup failed:', expect.any(Error));
    });
  });

  describe('update', () => {
    it('does nothing before the tray exists', () => {
      manager.update();
      expect(mockMenuBuildFromTemplate).not.toHaveBeenCalled();
    });

    it('wires each menu item to its service action', () => {
      manager.setup();
      const template = mockMenuBuildFromTemplate.mock.calls.at(-1)[0];

      findItem(template, 'Show Stats').click();
      expect(historyService.showQuickStats).toHaveBeenCalled();

      findItem(template, 'Watch History').click();
      expect(windowManager.createHistoryWindow).toHaveBeenCalled();

      findItem(template, 'Screenshot').click();
      expect(screenshotService.capture).toHaveBeenCalled();

      findItem(template, 'Settings…').click();
      expect(windowManager.createSettingsWindow).toHaveBeenCalled();

      findItem(template, 'Picture-in-Picture').click();
      expect(playbackService.togglePictureInPicture).toHaveBeenCalled();
    });

    it('shows a checkmark on toggleable items once enabled', () => {
      storeOverrides.alwaysOnTop = true;
      storeOverrides.autoSkipIntro = true;
      storeOverrides.discordEnabled = true;
      manager.setup();

      const template = mockMenuBuildFromTemplate.mock.calls.at(-1)[0];
      expect(findItem(template, '✓ Always on Top')).toBeDefined();
      expect(findItem(template, '✓ Auto-Skip Intro')).toBeDefined();
      expect(findItem(template, '✓ Discord RPC')).toBeDefined();
    });

    it('builds a speed submenu that calls setSpeed with each value', () => {
      manager.setup();
      const template = mockMenuBuildFromTemplate.mock.calls.at(-1)[0];
      const speedItem = findItem(template, 'Speed: 1x');

      speedItem.submenu.find((s) => s.label === '1.5x').click();
      expect(playbackService.setSpeed).toHaveBeenCalledWith(1.5);
    });

    it('tolerates missing optional services without throwing', () => {
      ctx.getService.mockReturnValue(null);
      manager.setup();
      const template = mockMenuBuildFromTemplate.mock.calls.at(-1)[0];

      expect(() => findItem(template, 'Show Stats').click()).not.toThrow();
      expect(() => findItem(template, 'Screenshot').click()).not.toThrow();
    });
  });

  describe('toggleAlwaysOnTop', () => {
    it('flips the setting, applies it to the window, and rebuilds the menu', () => {
      manager.setup();
      mockMenuBuildFromTemplate.mockClear();

      manager.toggleAlwaysOnTop();

      expect(storeOverrides.alwaysOnTop).toBe(true);
      expect(mockWindow.setAlwaysOnTop).toHaveBeenCalledWith(true);
      expect(mockMenuBuildFromTemplate).toHaveBeenCalled();
    });

    it('does nothing without a main window', () => {
      ctx.getMainWindow.mockReturnValue(null);
      manager.toggleAlwaysOnTop();
      expect(storeOverrides.alwaysOnTop).toBe(false);
    });
  });

  describe('toggleDiscordRpc', () => {
    it('starts RPC when enabling', () => {
      manager.setup();
      manager.toggleDiscordRpc();

      expect(storeOverrides.discordEnabled).toBe(true);
      expect(rpcManager.start).toHaveBeenCalled();
      expect(rpcManager.stop).not.toHaveBeenCalled();
    });

    it('stops RPC when disabling', () => {
      storeOverrides.discordEnabled = true;
      manager.setup();
      manager.toggleDiscordRpc();

      expect(storeOverrides.discordEnabled).toBe(false);
      expect(rpcManager.stop).toHaveBeenCalled();
    });
  });

  describe('updateIcon', () => {
    it('does nothing before the tray exists', () => {
      manager.updateIcon(true);
      expect(mockTrayInstance.setImage).not.toHaveBeenCalled();
    });

    it('swaps to the playing icon', () => {
      manager.setup();
      mockNativeImageCreateFromPath.mockClear();
      manager.updateIcon(true);
      expect(mockNativeImageCreateFromPath).toHaveBeenCalledWith(ASSETS.iconPlaying);
    });

    it('swallows errors from setImage', () => {
      manager.setup();
      mockTrayInstance.setImage.mockImplementationOnce(() => {
        throw new Error('bad image');
      });
      expect(() => manager.updateIcon(false)).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('destroys the tray and clears the reference', () => {
      manager.setup();
      manager.cleanup();

      expect(mockTrayInstance.destroy).toHaveBeenCalled();
      expect(manager.tray).toBeNull();
    });

    it('is a no-op when there is no tray', () => {
      expect(() => manager.cleanup()).not.toThrow();
    });
  });
});
