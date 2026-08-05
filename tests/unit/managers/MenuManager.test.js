const mockMenuBuildFromTemplate = jest.fn((template) => ({ template }));
const mockSetApplicationMenu = jest.fn();
const mockShellOpenPath = jest.fn();
const mockIpcMainEmit = jest.fn();

jest.mock('electron', () => ({
  Menu: {
    buildFromTemplate: (...args) => mockMenuBuildFromTemplate(...args),
    setApplicationMenu: (...args) => mockSetApplicationMenu(...args),
  },
  shell: { openPath: (...args) => mockShellOpenPath(...args) },
  ipcMain: { emit: (...args) => mockIpcMainEmit(...args) },
}));

const mockNotify = jest.fn();
jest.mock('../../../src/main/utils/notifications', () =>
  jest.fn().mockImplementation(() => ({ notify: mockNotify }))
);

const MenuManager = require('../../../src/main/managers/MenuManager');

function getTemplate() {
  return mockMenuBuildFromTemplate.mock.calls.at(-1)[0];
}
function submenuFor(topLabel) {
  return getTemplate().find((item) => item.label === topLabel).submenu;
}
function findItem(items, label) {
  return items.find((item) => item.label === label);
}

describe('MenuManager', () => {
  let ctx;
  let manager;
  let mockWindow;
  let windowManager;
  let playbackService;
  let screenshotService;
  let historyService;
  let updateService;
  let rpcManager;
  let storeOverrides;

  beforeEach(() => {
    jest.clearAllMocks();

    storeOverrides = {
      profiles: { default: { name: 'Default' }, kid: { name: 'Kids' } },
      currentProfile: 'default',
      alwaysOnTop: false,
      autoSkipIntro: false,
      autoSkipRecap: false,
      discordEnabled: false,
      watchQueue: [],
      screenshotsDir: '/home/user/Screenshots',
    };

    mockWindow = {
      setAlwaysOnTop: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: {
        executeJavaScript: jest
          .fn()
          .mockResolvedValue({ title: 'Some Show', url: 'https://www.netflix.com/watch/123' }),
        getURL: jest.fn().mockReturnValue('https://www.netflix.com/watch/123'),
      },
    };

    windowManager = {
      createSettingsWindow: jest.fn(),
      createKeybindsWindow: jest.fn(),
      createHistoryWindow: jest.fn(),
      createQueueWindow: jest.fn(),
      createProfilesWindow: jest.fn(),
    };
    playbackService = {
      togglePictureInPicture: jest.fn(),
      setSpeed: jest.fn(),
      cycleSpeed: jest.fn(),
    };
    screenshotService = { capture: jest.fn() };
    historyService = { showQuickStats: jest.fn() };
    updateService = { checkForUpdates: jest.fn() };
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
        if (name === 'update') return updateService;
        return null;
      }),
    };

    manager = new MenuManager(ctx);
  });

  describe('setup', () => {
    it('builds the initial menu', () => {
      manager.setup();
      expect(mockMenuBuildFromTemplate).toHaveBeenCalled();
      expect(mockSetApplicationMenu).toHaveBeenCalled();
    });
  });

  describe('update - Profiles menu', () => {
    it('marks the current profile and appends a manage-profiles entry', () => {
      manager.update();
      const profiles = submenuFor('Profiles');

      expect(findItem(profiles, '✓ Default')).toBeDefined();
      expect(findItem(profiles, 'Kids')).toBeDefined();
      expect(profiles.at(-1).label).toBe('Manage Profiles...');

      profiles.at(-1).click();
      expect(windowManager.createProfilesWindow).toHaveBeenCalled();
    });

    it('switches profile via the internal ipc event when an entry is clicked', () => {
      manager.update();
      const profiles = submenuFor('Profiles');

      findItem(profiles, 'Kids').click();
      expect(mockIpcMainEmit).toHaveBeenCalledWith('switch-profile-internal', null, 'kid');
    });
  });

  describe('update - Controls menu', () => {
    it('wires window-opening items to the window manager', () => {
      manager.update();
      const controls = submenuFor('Controls');

      findItem(controls, 'Settings…').click();
      expect(windowManager.createSettingsWindow).toHaveBeenCalled();

      findItem(controls, 'Customize Shortcuts...').click();
      expect(windowManager.createKeybindsWindow).toHaveBeenCalled();

      findItem(controls, 'Watch History').click();
      expect(windowManager.createHistoryWindow).toHaveBeenCalled();

      findItem(controls, 'Open Queue').click();
      expect(windowManager.createQueueWindow).toHaveBeenCalled();
    });

    it('opens the screenshots folder via shell.openPath', () => {
      manager.update();
      const controls = submenuFor('Controls');

      findItem(controls, 'Open Screenshots Folder').click();
      expect(mockShellOpenPath).toHaveBeenCalledWith('/home/user/Screenshots');
    });

    it('checks for updates when the update service is available', () => {
      manager.update();
      const controls = submenuFor('Controls');

      findItem(controls, 'Check for Updates...').click();
      expect(updateService.checkForUpdates).toHaveBeenCalledWith(true);
    });

    it('does not throw when the update service is missing', () => {
      ctx.getService.mockImplementation((name) => (name === 'update' ? null : null));
      manager.update();
      const controls = submenuFor('Controls');

      expect(() => findItem(controls, 'Check for Updates...').click()).not.toThrow();
    });

    it('shows a checkmark once always-on-top/auto-skip settings are enabled', () => {
      storeOverrides.alwaysOnTop = true;
      storeOverrides.autoSkipIntro = true;
      storeOverrides.autoSkipRecap = true;
      manager.update();
      const controls = submenuFor('Controls');

      expect(findItem(controls, '✓ Always on Top')).toBeDefined();
      expect(findItem(controls, '✓ Auto-Skip Intro')).toBeDefined();
      expect(findItem(controls, '✓ Auto-Skip Recap')).toBeDefined();
    });
  });

  describe('update - Playback menu', () => {
    it('wires each speed option to setSpeed', () => {
      manager.update();
      const playback = submenuFor('Playback');

      findItem(playback, 'Speed: 1.5x').click();
      expect(playbackService.setSpeed).toHaveBeenCalledWith(1.5);

      findItem(playback, 'Speed: 1.0x (Normal)').click();
      expect(playbackService.setSpeed).toHaveBeenCalledWith(1.0);
    });

    it('wires increase/decrease speed to cycleSpeed', () => {
      manager.update();
      const playback = submenuFor('Playback');

      findItem(playback, 'Increase Speed').click();
      expect(playbackService.cycleSpeed).toHaveBeenCalledWith(1);

      findItem(playback, 'Decrease Speed').click();
      expect(playbackService.cycleSpeed).toHaveBeenCalledWith(-1);
    });
  });

  describe('toggleAlwaysOnTop', () => {
    it('flips the setting, applies it, notifies, and rebuilds the menu', () => {
      manager.toggleAlwaysOnTop();

      expect(storeOverrides.alwaysOnTop).toBe(true);
      expect(mockWindow.setAlwaysOnTop).toHaveBeenCalledWith(true);
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Always on Top', body: 'Enabled' })
      );
      expect(mockMenuBuildFromTemplate).toHaveBeenCalled();
    });

    it('does nothing without a main window', () => {
      ctx.getMainWindow.mockReturnValue(null);
      manager.toggleAlwaysOnTop();
      expect(storeOverrides.alwaysOnTop).toBe(false);
    });
  });

  describe('toggleAutoSkip', () => {
    it('uses the correct display title for known keys', () => {
      manager.toggleAutoSkip('autoSkipRecap');
      expect(storeOverrides.autoSkipRecap).toBe(true);
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Auto-Skip Recap', body: 'Enabled' })
      );
    });

    it('falls back to a generic title for an unrecognized key', () => {
      manager.toggleAutoSkip('autoSkipSomethingElse');
      expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Auto-Skip' }));
    });

    it('defaults to autoSkipIntro when no key is given', () => {
      manager.toggleAutoSkip();
      expect(storeOverrides.autoSkipIntro).toBe(true);
    });
  });

  describe('toggleDiscordRpc', () => {
    it('starts rpc when enabling and notifies', () => {
      manager.toggleDiscordRpc();

      expect(storeOverrides.discordEnabled).toBe(true);
      expect(rpcManager.start).toHaveBeenCalled();
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Discord Rich Presence', body: 'Enabled' })
      );
    });

    it('stops rpc when disabling', () => {
      storeOverrides.discordEnabled = true;
      manager.toggleDiscordRpc();
      expect(rpcManager.stop).toHaveBeenCalled();
    });
  });

  describe('clearHistory', () => {
    it('resets watch history and notifies', () => {
      manager.clearHistory();
      expect(storeOverrides.watchHistory).toEqual([]);
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'History Cleared' })
      );
    });
  });

  describe('addCurrentToQueue', () => {
    it('does nothing without a main window', async () => {
      ctx.getMainWindow.mockReturnValue(null);
      await manager.addCurrentToQueue();
      expect(storeOverrides.watchQueue).toEqual([]);
    });

    it('does nothing when the window is destroyed', async () => {
      mockWindow.isDestroyed.mockReturnValue(true);
      await manager.addCurrentToQueue();
      expect(mockWindow.webContents.executeJavaScript).not.toHaveBeenCalled();
    });

    it('adds a new item and notifies "Added to Queue"', async () => {
      await manager.addCurrentToQueue();

      expect(storeOverrides.watchQueue).toHaveLength(1);
      expect(storeOverrides.watchQueue[0]).toMatchObject({
        title: 'Some Show',
        url: 'https://www.netflix.com/watch/123',
        order: 0,
      });
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Added to Queue', body: 'Some Show' })
      );
    });

    it('rejects and logs when not on a netflix.com URL', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue({
        title: 'Something',
        url: 'https://example.com/not-netflix',
      });

      await manager.addCurrentToQueue();

      expect(storeOverrides.watchQueue).toEqual([]);
      expect(ctx.logger.error).toHaveBeenCalledWith('addCurrentToQueue error:', expect.any(Error));
    });

    it('dedupes an existing entry by URL and notifies "Queue Updated" instead', async () => {
      storeOverrides.watchQueue = [
        {
          id: 'existing-id',
          title: 'Some Show',
          url: 'https://www.netflix.com/watch/123',
          pinned: false,
          order: 0,
        },
      ];

      await manager.addCurrentToQueue();

      expect(storeOverrides.watchQueue).toHaveLength(1);
      expect(storeOverrides.watchQueue[0].id).toBe('existing-id');
      expect(storeOverrides.watchQueue[0].dedupedAt).toEqual(expect.any(Number));
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Queue Updated', body: 'Some Show' })
      );
    });

    it('keeps pinned items ahead of unpinned ones after adding', async () => {
      storeOverrides.watchQueue = [
        {
          id: 'pinned-1',
          title: 'Pinned Show',
          url: 'https://www.netflix.com/watch/999',
          pinned: true,
          order: 0,
        },
      ];

      await manager.addCurrentToQueue();

      expect(storeOverrides.watchQueue[0].title).toBe('Pinned Show');
      expect(storeOverrides.watchQueue[1].title).toBe('Some Show');
    });
  });

  describe('switchProfile', () => {
    it('emits the internal switch-profile event with the given id', () => {
      manager.switchProfile('kid');
      expect(mockIpcMainEmit).toHaveBeenCalledWith('switch-profile-internal', null, 'kid');
    });
  });
});
