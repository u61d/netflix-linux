const mockAutoUpdater = {
  autoDownload: undefined,
  autoInstallOnAppQuit: undefined,
  channel: undefined,
  allowPrerelease: undefined,
  on: jest.fn(),
  checkForUpdates: jest.fn().mockResolvedValue(undefined),
  downloadUpdate: jest.fn().mockResolvedValue(undefined),
  quitAndInstall: jest.fn(),
};

jest.mock('electron-updater', () => ({ autoUpdater: mockAutoUpdater }));

const mockShowMessageBoxSync = jest.fn();
const mockOpenExternal = jest.fn();
const mockGetVersion = jest.fn(() => '2.1.0');

jest.mock('electron', () => ({
  app: { getVersion: (...args) => mockGetVersion(...args) },
  dialog: { showMessageBoxSync: (...args) => mockShowMessageBoxSync(...args) },
  shell: { openExternal: (...args) => mockOpenExternal(...args) },
}));

const mockNotify = jest.fn();
jest.mock('../../../src/main/utils/notifications', () =>
  jest.fn().mockImplementation(() => ({ notify: mockNotify }))
);

jest.mock('https', () => ({ get: jest.fn() }));
const https = require('https');

const UpdateService = require('../../../src/main/services/UpdateService');

function mockHttpsGet({ statusCode = 200, body = '[]', requestError = null } = {}) {
  https.get.mockImplementation((url, options, callback) => {
    const req = {
      on: jest.fn((event, handler) => {
        if (event === 'error' && requestError) handler(requestError);
        return req;
      }),
      setTimeout: jest.fn(),
      destroy: jest.fn(),
    };

    if (!requestError) {
      const res = { statusCode };
      res.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from(body));
        if (event === 'end') handler();
        return res;
      });
      callback(res);
    }

    return req;
  });
}

describe('UpdateService', () => {
  let ctx;
  let service;
  let mockWindow;
  let storeOverrides;

  beforeEach(() => {
    jest.clearAllMocks();
    storeOverrides = { updateChannel: 'stable', autoCheckUpdates: true };

    mockWindow = { setProgressBar: jest.fn() };

    ctx = {
      store: {
        get: jest.fn((key, fallback) =>
          storeOverrides[key] !== undefined ? storeOverrides[key] : fallback
        ),
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      },
      getMainWindow: jest.fn(() => mockWindow),
    };

    mockHttpsGet();
    service = new UpdateService(ctx);
  });

  describe('constructor / applyChannelSettings', () => {
    it('disables auto-download and configures the stable channel by default', () => {
      expect(mockAutoUpdater.autoDownload).toBe(false);
      expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
      expect(mockAutoUpdater.channel).toBe('latest');
      expect(mockAutoUpdater.allowPrerelease).toBe(false);
    });

    it('switches to the beta channel and allows prereleases', () => {
      storeOverrides.updateChannel = 'beta';

      service.applyChannelSettings();

      expect(mockAutoUpdater.channel).toBe('beta');
      expect(mockAutoUpdater.allowPrerelease).toBe(true);
    });

    it('registers listeners for every autoUpdater event it relies on', () => {
      const events = mockAutoUpdater.on.mock.calls.map(([event]) => event);
      expect(events).toEqual(
        expect.arrayContaining([
          'checking-for-update',
          'update-available',
          'update-not-available',
          'error',
          'download-progress',
          'update-downloaded',
        ])
      );
    });
  });

  describe('autoUpdater event handlers', () => {
    function handlerFor(event) {
      const call = mockAutoUpdater.on.mock.calls.find(([name]) => name === event);
      return call[1];
    }

    it('prompts the user when an update is available', () => {
      jest.spyOn(service, 'promptUpdate').mockImplementation(() => {});

      handlerFor('update-available')({ version: '2.2.0' });

      expect(service.promptUpdate).toHaveBeenCalledWith({ version: '2.2.0' });
    });

    it('updates the taskbar progress bar on download-progress', () => {
      handlerFor('download-progress')({ percent: 42.6 });

      expect(mockWindow.setProgressBar).toHaveBeenCalledWith(0.426);
    });

    it('clears the progress bar and prompts install when download completes', () => {
      jest.spyOn(service, 'promptInstall').mockImplementation(() => {});

      handlerFor('update-downloaded')({ version: '2.2.0' });

      expect(mockWindow.setProgressBar).toHaveBeenCalledWith(-1);
      expect(service.promptInstall).toHaveBeenCalledWith({ version: '2.2.0' });
    });

    it('treats missing update metadata errors as a quiet warning, not an error log', () => {
      handlerFor('error')(new Error('Cannot find latest-linux.yml in the latest release'));

      expect(ctx.logger.warn).toHaveBeenCalled();
      expect(ctx.logger.error).not.toHaveBeenCalled();
    });

    it('logs unrelated errors normally', () => {
      handlerFor('error')(new Error('network unreachable'));

      expect(ctx.logger.error).toHaveBeenCalledWith('Update error:', expect.any(Error));
    });
  });

  describe('checkForUpdates', () => {
    it('sets and clears the checking flag around the update check', async () => {
      const checkPromise = service.checkForUpdates(true);
      expect(service.checking).toBe(true);

      await checkPromise;
      expect(service.checking).toBe(false);
    });

    it('notifies on failure only when the check was manual', async () => {
      mockAutoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('boom'));

      await service.checkForUpdates(false);
      expect(mockNotify).not.toHaveBeenCalled();

      mockAutoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('boom'));
      await service.checkForUpdates(true);
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Update Check Failed' })
      );
    });

    it('warns instead of erroring when release metadata is missing', async () => {
      mockAutoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('beta-linux.yml not found'));

      await service.checkForUpdates(true);

      expect(ctx.logger.error).not.toHaveBeenCalled();
      expect(ctx.logger.warn).toHaveBeenCalled();
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Updater Metadata Missing' })
      );
    });
  });

  describe('warnMissingMetadata', () => {
    it('throttles repeated warnings within 15 seconds', () => {
      jest.useFakeTimers().setSystemTime(20000);
      service.warnMissingMetadata('a');
      service.warnMissingMetadata('b');
      expect(ctx.logger.warn).toHaveBeenCalledTimes(2); // 2 warn lines from the 'a' call only

      jest.setSystemTime(25000);
      service.warnMissingMetadata('c');
      expect(ctx.logger.warn).toHaveBeenCalledTimes(2); // still throttled, only 5s later

      jest.setSystemTime(40000);
      service.warnMissingMetadata('d');
      expect(ctx.logger.warn).toHaveBeenCalledTimes(4); // 15s+ later, warns again

      jest.useRealTimers();
    });
  });

  describe('getUpdateStatus', () => {
    it('reports version, channel, auto-check, and in-progress state', () => {
      storeOverrides.updateChannel = 'beta';
      storeOverrides.autoCheckUpdates = false;
      service.checking = true;

      expect(service.getUpdateStatus()).toEqual({
        currentVersion: '2.1.0',
        channel: 'beta',
        autoCheck: false,
        checking: true,
      });
    });
  });

  describe('listRecentReleases', () => {
    it('fetches and normalizes releases, filtering prereleases on stable', async () => {
      mockHttpsGet({
        body: JSON.stringify([
          {
            tag_name: 'v2.1.0',
            name: '2.1.0',
            prerelease: false,
            published_at: 't1',
            html_url: 'u1',
          },
          {
            tag_name: 'v2.2.0-beta.1',
            name: '2.2.0-beta.1',
            prerelease: true,
            published_at: 't2',
            html_url: 'u2',
          },
        ]),
      });

      const releases = await service.listRecentReleases();

      expect(releases).toEqual([
        { tag: 'v2.1.0', name: '2.1.0', prerelease: false, publishedAt: 't1', url: 'u1' },
      ]);
    });

    it('includes prereleases when the beta channel is active', async () => {
      storeOverrides.updateChannel = 'beta';
      mockHttpsGet({
        body: JSON.stringify([
          {
            tag_name: 'v2.2.0-beta.1',
            name: '2.2.0-beta.1',
            prerelease: true,
            published_at: 't2',
            html_url: 'u2',
          },
        ]),
      });

      const releases = await service.listRecentReleases();
      expect(releases).toHaveLength(1);
    });

    it('caches results for 5 minutes unless forced', async () => {
      mockHttpsGet({
        body: JSON.stringify([
          {
            tag_name: 'v2.1.0',
            name: '2.1.0',
            prerelease: false,
            published_at: 't1',
            html_url: 'u1',
          },
        ]),
      });
      await service.listRecentReleases();
      expect(https.get).toHaveBeenCalledTimes(1);

      await service.listRecentReleases();
      expect(https.get).toHaveBeenCalledTimes(1); // cached, no new request

      await service.listRecentReleases(true);
      expect(https.get).toHaveBeenCalledTimes(2); // forced bypass
    });

    it('rejects on a non-2xx/3xx response', async () => {
      mockHttpsGet({ statusCode: 500, body: 'oops' });
      await expect(service.listRecentReleases()).rejects.toThrow('GitHub API returned 500');
    });

    it('rejects on a malformed (non-array) response body', async () => {
      mockHttpsGet({ body: JSON.stringify({ not: 'an array' }) });
      await expect(service.listRecentReleases()).rejects.toThrow('Invalid releases response');
    });

    it('rejects when the request itself errors out', async () => {
      mockHttpsGet({ requestError: new Error('DNS failure') });
      await expect(service.listRecentReleases()).rejects.toThrow('DNS failure');
    });
  });

  describe('rollbackToVersion', () => {
    it('rejects an empty or non-string tag', async () => {
      await expect(service.rollbackToVersion('')).rejects.toThrow('Invalid rollback target');
      await expect(service.rollbackToVersion(null)).rejects.toThrow('Invalid rollback target');
    });

    it('normalizes a bare version into a v-prefixed tag and opens the release page', async () => {
      const url = await service.rollbackToVersion('2.0.1');

      expect(url).toBe('https://github.com/u61d/netflix-linux/releases/tag/v2.0.1');
      expect(mockOpenExternal).toHaveBeenCalledWith(url);
      expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Rollback' }));
    });

    it('does not double-prefix a tag that already starts with v', async () => {
      const url = await service.rollbackToVersion('v2.0.1');
      expect(url).toBe('https://github.com/u61d/netflix-linux/releases/tag/v2.0.1');
    });
  });

  describe('promptUpdate', () => {
    it('does nothing when there is no main window', () => {
      ctx.getMainWindow.mockReturnValue(null);
      service.promptUpdate({ version: '2.2.0' });
      expect(mockShowMessageBoxSync).not.toHaveBeenCalled();
    });

    it('starts the download when the user picks Download', () => {
      mockShowMessageBoxSync.mockReturnValue(0);
      jest.spyOn(service, 'downloadUpdate').mockImplementation(() => {});

      service.promptUpdate({ version: '2.2.0' });

      expect(service.downloadUpdate).toHaveBeenCalled();
    });

    it('opens release notes when the user picks that option', () => {
      mockShowMessageBoxSync.mockReturnValue(2);

      service.promptUpdate({ version: '2.2.0' });

      expect(mockOpenExternal).toHaveBeenCalledWith(
        'https://github.com/u61d/netflix-linux/releases/tag/v2.2.0'
      );
    });
  });

  describe('downloadUpdate', () => {
    it('notifies on start and lets autoUpdater handle the download', async () => {
      await service.downloadUpdate();

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Downloading Update' })
      );
      expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalled();
    });

    it('notifies failure if the download throws', async () => {
      mockAutoUpdater.downloadUpdate.mockRejectedValueOnce(new Error('disk full'));

      await service.downloadUpdate();

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Download Failed', body: 'disk full' })
      );
    });
  });

  describe('promptInstall', () => {
    it('does nothing when there is no main window', () => {
      ctx.getMainWindow.mockReturnValue(null);
      service.promptInstall({ version: '2.2.0' });
      expect(mockShowMessageBoxSync).not.toHaveBeenCalled();
    });

    it('quits and installs when the user picks Restart Now', () => {
      mockShowMessageBoxSync.mockReturnValue(0);
      service.promptInstall({ version: '2.2.0' });
      expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
    });

    it('does not install when the user picks Later', () => {
      mockShowMessageBoxSync.mockReturnValue(1);
      service.promptInstall({ version: '2.2.0' });
      expect(mockAutoUpdater.quitAndInstall).not.toHaveBeenCalled();
    });
  });

  describe('scheduleStartupCheck', () => {
    it('skips scheduling when auto-check is disabled', () => {
      jest.useFakeTimers();
      storeOverrides.autoCheckUpdates = false;

      service.scheduleStartupCheck();
      jest.advanceTimersByTime(30000);

      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('checks for updates 30 seconds after startup when enabled', () => {
      jest.useFakeTimers();
      jest.spyOn(service, 'checkForUpdates').mockImplementation(() => {});

      service.scheduleStartupCheck();
      jest.advanceTimersByTime(29999);
      expect(service.checkForUpdates).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(service.checkForUpdates).toHaveBeenCalledWith(false);

      jest.useRealTimers();
    });
  });
});
