const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const setupSettingsHandlers = require('../../../src/main/handlers/settings');

const mockNotify = jest.fn();

jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn() },
  dialog: {
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
  },
  app: { getVersion: jest.fn(() => '2.2.0') },
}));

jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
}));

jest.mock('../../../src/main/utils/notifications', () =>
  jest.fn().mockImplementation(() => ({ notify: mockNotify }))
);

describe('Settings Handlers', () => {
  let ctx;
  let win;
  let stored;
  let managers;
  let services;

  beforeEach(() => {
    jest.clearAllMocks();

    stored = {};
    win = {
      setAlwaysOnTop: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
    };

    managers = {
      rpc: { start: jest.fn(), stop: jest.fn() },
      mpris: { start: jest.fn(), stop: jest.fn() },
      window: { applyAppearanceToAllWindows: jest.fn() },
      sentry: { setUserContent: jest.fn() },
    };

    services = {
      statsOverlay: { start: jest.fn(), stop: jest.fn() },
      healthReminder: { start: jest.fn(), stop: jest.fn() },
      update: {
        applyChannelSettings: jest.fn(),
        getUpdateStatus: jest.fn(() => ({ status: 'idle' })),
        checkForUpdates: jest.fn().mockResolvedValue(undefined),
        listRecentReleases: jest.fn().mockResolvedValue([]),
        rollbackToVersion: jest.fn().mockResolvedValue(true),
      },
      subtitleStyle: {
        apply: jest.fn().mockResolvedValue(true),
        checkSelectorHealth: jest.fn().mockResolvedValue({ ok: true }),
      },
      playback: { restorePreviousSession: jest.fn().mockResolvedValue(true) },
      autoSkipper: {
        runSelectorHealthCheck: jest
          .fn()
          .mockResolvedValue({ playing: true, total: 14, present: 2, valid: 14, invalid: 0 }),
      },
    };

    ctx = {
      store: {
        get: jest.fn((key, fallback) => (key in stored ? stored[key] : fallback)),
        set: jest.fn((key, value) => {
          stored[key] = value;
        }),
      },
      logger: {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        setLevel: jest.fn(),
      },
      getMainWindow: jest.fn(() => win),
      getManager: jest.fn((name) => managers[name]),
      getService: jest.fn((name) => services[name]),
    };

    setupSettingsHandlers(ctx);
  });

  function handler(channel) {
    const call = ipcMain.handle.mock.calls.find(([name]) => name === channel);
    if (!call) throw new Error(`no handler registered for ${channel}`);
    return call[1];
  }

  const update = (updates) => handler('update-settings')({}, updates);

  describe('get-settings', () => {
    it('falls back to the documented defaults on an empty store', async () => {
      const settings = await handler('get-settings')();

      expect(settings).toMatchObject({
        discordEnabled: true,
        mprisEnabled: true,
        updateChannel: 'stable',
        playbackSpeed: 1.0,
        autoSkipCredits: false,
        uiTheme: 'netflix-red',
        reminderInterval: 60,
        subtitleFontSize: 'medium',
      });
    });

    it('returns what is stored over the default', async () => {
      stored.mprisEnabled = false;
      stored.uiTheme = 'ocean';

      const settings = await handler('get-settings')();

      expect(settings.mprisEnabled).toBe(false);
      expect(settings.uiTheme).toBe('ocean');
    });
  });

  describe('validate-setting', () => {
    it('accepts a value inside the schema', async () => {
      expect(await handler('validate-setting')({}, 'playbackSpeed', 1.5)).toEqual({ valid: true });
    });

    it('rejects one outside it', async () => {
      const result = await handler('validate-setting')({}, 'playbackSpeed', 99);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/at most/);
    });
  });

  describe('update-settings', () => {
    it('rejects anything that is not an object', async () => {
      await expect(update(null)).rejects.toThrow('Invalid settings object');
      await expect(update('nope')).rejects.toThrow('Invalid settings object');
    });

    // validation runs as its own pass before any write, so one bad value in a
    // batch must not leave the others applied
    it('writes nothing at all when one value in the batch is invalid', async () => {
      await expect(update({ mprisEnabled: false, playbackSpeed: 99 })).rejects.toThrow(
        /playbackSpeed/
      );

      expect(ctx.store.set).not.toHaveBeenCalled();
      expect(managers.mpris.stop).not.toHaveBeenCalled();
    });

    it('stores each value and reports success', async () => {
      await expect(update({ quietMode: true, reminderInterval: 30 })).resolves.toBe(true);

      expect(ctx.store.set).toHaveBeenCalledWith('quietMode', true);
      expect(ctx.store.set).toHaveBeenCalledWith('reminderInterval', 30);
    });

    it('sanitizes strings before storing them', async () => {
      await update({ screenshotsDir: '  /home/<user>/"shots"  ' });
      expect(ctx.store.set).toHaveBeenCalledWith('screenshotsDir', '/home/user/shots');
    });

    it('refuses a value outside the schema enum', async () => {
      await expect(update({ uiTheme: 'midnight' })).rejects.toThrow(/uiTheme/);
      expect(ctx.store.set).not.toHaveBeenCalled();
    });

    it('skips keys explicitly set to undefined', async () => {
      await update({ quietMode: undefined, borderless: true });

      expect(ctx.store.set).toHaveBeenCalledTimes(1);
      expect(ctx.store.set).toHaveBeenCalledWith('borderless', true);
    });

    describe('side effects', () => {
      it('starts and stops MPRIS with the toggle', async () => {
        await update({ mprisEnabled: true });
        expect(managers.mpris.start).toHaveBeenCalled();

        stored.mprisEnabled = true;
        await update({ mprisEnabled: false });
        expect(managers.mpris.stop).toHaveBeenCalled();
      });

      it('starts and stops Discord RPC with the toggle', async () => {
        await update({ discordEnabled: true });
        expect(managers.rpc.start).toHaveBeenCalled();

        stored.discordEnabled = true;
        await update({ discordEnabled: false });
        expect(managers.rpc.stop).toHaveBeenCalled();
      });

      it('starts and stops the stats overlay', async () => {
        await update({ showDetailedStats: true });
        expect(services.statsOverlay.start).toHaveBeenCalled();

        stored.showDetailedStats = true;
        await update({ showDetailedStats: false });
        expect(services.statsOverlay.stop).toHaveBeenCalled();
      });

      it('starts and stops the health reminder', async () => {
        await update({ healthReminder: true });
        expect(services.healthReminder.start).toHaveBeenCalled();

        stored.healthReminder = true;
        await update({ healthReminder: false });
        expect(services.healthReminder.stop).toHaveBeenCalled();
      });

      it('pins the window on top', async () => {
        await update({ alwaysOnTop: true });
        expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true);
      });

      it('restyles open windows when the theme or density changes', async () => {
        await update({ uiTheme: 'ocean' });
        expect(managers.window.applyAppearanceToAllWindows).toHaveBeenCalledTimes(1);

        await update({ compactMode: true });
        expect(managers.window.applyAppearanceToAllWindows).toHaveBeenCalledTimes(2);
      });

      it('moves the log level with debug mode', async () => {
        await update({ debugMode: true });
        expect(ctx.logger.setLevel).toHaveBeenCalledWith('debug');

        stored.debugMode = true;
        await update({ debugMode: false });
        expect(ctx.logger.setLevel).toHaveBeenCalledWith('info');
      });

      it('passes the Sentry consent through', async () => {
        await update({ sentryEnabled: true });
        expect(managers.sentry.setUserContent).toHaveBeenCalledWith(true);
      });

      it('clears the crash counters when crash-safe mode is switched off', async () => {
        stored.crashSafeMode = true;
        stored.crashCount = 3;
        stored.safeModeActive = true;

        await update({ crashSafeMode: false });

        expect(ctx.store.set).toHaveBeenCalledWith('safeModeActive', false);
        expect(ctx.store.set).toHaveBeenCalledWith('crashCount', 0);
      });

      it('leaves the crash counters alone when it is switched on', async () => {
        stored.crashSafeMode = false;
        await update({ crashSafeMode: true });

        expect(ctx.store.set).not.toHaveBeenCalledWith('crashCount', 0);
      });

      it('reapplies the update channel when either update setting changes', async () => {
        await update({ updateChannel: 'beta' });
        expect(services.update.applyChannelSettings).toHaveBeenCalledTimes(1);

        await update({ autoCheckUpdates: false });
        expect(services.update.applyChannelSettings).toHaveBeenCalledTimes(2);
      });

      it('reapplies subtitle styling when any subtitle setting changes', async () => {
        await update({ subtitleFontSize: 'large' });
        expect(services.subtitleStyle.apply).toHaveBeenCalledTimes(1);

        await update({ subtitleVerticalOffset: 10 });
        expect(services.subtitleStyle.apply).toHaveBeenCalledTimes(2);
      });

      // every side effect hangs off hasChanged(), so writing the value it
      // already has must not restart anything
      it('does nothing when the value submitted is the one already stored', async () => {
        stored.mprisEnabled = true;
        stored.discordEnabled = true;
        stored.uiTheme = 'netflix-red';
        stored.debugMode = false;

        await update({
          mprisEnabled: true,
          discordEnabled: true,
          uiTheme: 'netflix-red',
          debugMode: false,
        });

        expect(managers.mpris.start).not.toHaveBeenCalled();
        expect(managers.mpris.stop).not.toHaveBeenCalled();
        expect(managers.rpc.start).not.toHaveBeenCalled();
        expect(managers.window.applyAppearanceToAllWindows).not.toHaveBeenCalled();
        expect(ctx.logger.setLevel).not.toHaveBeenCalled();
      });

      it('survives a missing window and missing optional managers', async () => {
        ctx.getMainWindow.mockReturnValue(null);
        delete managers.mpris;
        delete managers.window;
        delete services.update;
        delete services.subtitleStyle;

        await expect(
          update({
            alwaysOnTop: true,
            mprisEnabled: true,
            uiTheme: 'graphite',
            updateChannel: 'beta',
          })
        ).resolves.toBe(true);
      });
    });
  });

  describe('choose-screenshot-dir', () => {
    it('stores the chosen folder', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/pictures/shots'] });

      await expect(handler('choose-screenshot-dir')()).resolves.toBe('/pictures/shots');
      expect(ctx.store.set).toHaveBeenCalledWith('screenshotsDir', '/pictures/shots');
    });

    it('stores nothing when the dialog is cancelled', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

      await expect(handler('choose-screenshot-dir')()).resolves.toBeNull();
      expect(ctx.store.set).not.toHaveBeenCalled();
    });

    it('returns null when there is no window to attach the dialog to', async () => {
      ctx.getMainWindow.mockReturnValue(null);
      await expect(handler('choose-screenshot-dir')()).resolves.toBeNull();
      expect(dialog.showOpenDialog).not.toHaveBeenCalled();
    });
  });

  describe('export-settings', () => {
    it('writes a versioned file', async () => {
      dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/settings.json' });
      stored.mprisEnabled = false;

      await expect(handler('export-settings')()).resolves.toBe('/tmp/settings.json');

      const [path, contents] = fs.writeFileSync.mock.calls[0];
      expect(path).toBe('/tmp/settings.json');
      const payload = JSON.parse(contents);
      expect(payload.version).toBe(1);
      expect(payload.settings.mprisEnabled).toBe(false);
    });

    it('writes nothing when cancelled', async () => {
      dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

      await expect(handler('export-settings')()).resolves.toBeNull();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('import-settings', () => {
    it('applies every key in the file', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/in.json'] });
      fs.readFileSync.mockReturnValue(
        JSON.stringify({ version: 1, settings: { mprisEnabled: false, uiTheme: 'ocean' } })
      );

      await expect(handler('import-settings')()).resolves.toBe(true);

      expect(ctx.store.set).toHaveBeenCalledWith('mprisEnabled', false);
      expect(ctx.store.set).toHaveBeenCalledWith('uiTheme', 'ocean');
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Settings Imported' })
      );
    });

    it('refuses a file without a version or settings block', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/in.json'] });
      fs.readFileSync.mockReturnValue(JSON.stringify({ hello: 'world' }));

      await expect(handler('import-settings')()).rejects.toThrow('Invalid settings file');
      expect(ctx.store.set).not.toHaveBeenCalled();
    });

    it('refuses a file that is not JSON', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/in.json'] });
      fs.readFileSync.mockReturnValue('{ not json');

      await expect(handler('import-settings')()).rejects.toThrow();
      expect(ctx.store.set).not.toHaveBeenCalled();
    });

    it('does nothing when cancelled', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

      await expect(handler('import-settings')()).resolves.toBe(false);
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });

  describe('update service passthroughs', () => {
    it('reports the update status', async () => {
      await expect(handler('get-update-status')()).resolves.toEqual({ status: 'idle' });
    });

    it('returns null for the status when the service is missing', async () => {
      delete services.update;
      await expect(handler('get-update-status')()).resolves.toBeNull();
    });

    it.each([
      ['check-updates-now', []],
      ['list-update-releases', [{}, true]],
      ['rollback-version', [{}, 'v2.1.0']],
      ['restore-session-now', []],
      ['reapply-subtitle-style', []],
      ['check-subtitle-selectors', []],
    ])('%s fails loudly when its service is unavailable', async (channel, args) => {
      services = {};
      await expect(handler(channel)(...args)).rejects.toThrow(/unavailable/);
    });

    it('forces an update check', async () => {
      await handler('check-updates-now')();
      expect(services.update.checkForUpdates).toHaveBeenCalledWith(true);
    });

    it('passes the rollback tag through', async () => {
      await handler('rollback-version')({}, 'v2.1.0');
      expect(services.update.rollbackToVersion).toHaveBeenCalledWith('v2.1.0');
    });
  });

  describe('selector diagnostics', () => {
    it('returns the health check result', async () => {
      await expect(handler('check-selector-health')()).resolves.toMatchObject({ invalid: 0 });
    });

    it('fails loudly when AutoSkipper is unavailable', async () => {
      delete services.autoSkipper;
      await expect(handler('check-selector-health')()).rejects.toThrow(/unavailable/);
      expect(ctx.logger.error).toHaveBeenCalled();
    });

    it('writes a report with the app and selector versions in it', async () => {
      dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/sel.json' });
      stored.autoSkipIntro = true;
      stored.autoNextEpisode = false;

      await expect(handler('export-selector-health')()).resolves.toBe('/tmp/sel.json');

      const payload = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(payload.appVersion).toBe('2.2.0');
      expect(payload.selectorsVersion).toBe(require('../../../src/config/selectors.json').version);
      expect(payload.diagnostics.invalid).toBe(0);
      expect(payload.settings).toHaveProperty('autoSkipIntro');
    });

    it('writes nothing when the save dialog is cancelled', async () => {
      dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

      await expect(handler('export-selector-health')()).resolves.toBeNull();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('returns null with no window to attach the dialog to', async () => {
      ctx.getMainWindow.mockReturnValue(null);
      await expect(handler('export-selector-health')()).resolves.toBeNull();
    });
  });

  describe('exit-safe-mode', () => {
    it('clears every crash flag', async () => {
      await expect(handler('exit-safe-mode')()).resolves.toBe(true);

      expect(ctx.store.set).toHaveBeenCalledWith('safeModeActive', false);
      expect(ctx.store.set).toHaveBeenCalledWith('crashCount', 0);
      expect(ctx.store.set).toHaveBeenCalledWith('lastRunExitedCleanly', true);
    });
  });
});
