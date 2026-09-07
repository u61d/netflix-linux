const mockPlayerInstance = {
  on: jest.fn(),
  objectPath: jest.fn((p) => `/org/mpris/MediaPlayer2/${p}`),
  seeked: jest.fn(),
  playbackStatus: null,
  metadata: null,
  canGoNext: null,
  canGoPrevious: null,
  getPosition: null,
};

const mockPlayerFactory = jest.fn(() => mockPlayerInstance);
const mockElectronApp = { isPackaged: false };
const mockExistsSync = jest.fn().mockReturnValue(true);

jest.mock('mpris-service', () => mockPlayerFactory);
jest.mock('electron', () => ({ app: mockElectronApp }));
jest.mock('fs', () => ({ existsSync: (...args) => mockExistsSync(...args) }));

const MprisManager = require('../../../src/main/managers/MprisManager');

function streamClosedError(message = 'Tried to write a message to a closed stream') {
  const error = new Error(message);
  error.stack = `Error: ${message}\n    at node_modules/dbus-next/lib/bus.js:371:22`;
  return error;
}

function stateResult(overrides = {}) {
  return {
    playing: true,
    currentTime: 10,
    duration: 100,
    title: 'Some Show',
    episodeInfo: '',
    url: 'https://www.netflix.com/watch/123',
    ...overrides,
  };
}

describe('MprisManager', () => {
  let ctx;
  let manager;
  let mockWindow;
  let playbackService;
  let storeValues;
  let originalPlatform;

  beforeAll(() => {
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  });

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    storeValues = { mprisEnabled: true };
    mockPlayerFactory.mockImplementation(() => mockPlayerInstance);
    mockElectronApp.isPackaged = false;
    mockExistsSync.mockReturnValue(true);

    mockWindow = {
      isDestroyed: jest.fn().mockReturnValue(false),
      isMinimized: jest.fn().mockReturnValue(false),
      restore: jest.fn(),
      show: jest.fn(),
      focus: jest.fn(),
      close: jest.fn(),
      webContents: { executeJavaScript: jest.fn().mockResolvedValue(stateResult()) },
    };

    playbackService = {
      getState: jest.fn().mockResolvedValue({ playing: false }),
      togglePlayPause: jest.fn().mockResolvedValue({ action: 'play' }),
      pauseIfPlaying: jest.fn().mockResolvedValue({ status: 'paused' }),
      seek: jest.fn().mockResolvedValue({ currentTime: 10 }),
    };

    ctx = {
      store: {
        get: jest.fn((key, fallback) =>
          storeValues[key] !== undefined ? storeValues[key] : fallback
        ),
      },
      logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      getMainWindow: jest.fn(() => mockWindow),
      getService: jest.fn((name) => (name === 'playback' ? playbackService : null)),
    };

    manager = new MprisManager(ctx);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start', () => {
    it('does nothing on non-Linux platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      manager.start();
      expect(mockPlayerFactory).not.toHaveBeenCalled();
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    });

    it('does nothing when disabled in settings', () => {
      storeValues.mprisEnabled = false;
      manager.start();
      expect(mockPlayerFactory).not.toHaveBeenCalled();
    });

    it('creates the player and disables next/previous', () => {
      manager.start();

      expect(mockPlayerFactory).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'netflix-linux', identity: 'Netflix' })
      );
      expect(mockPlayerInstance.canGoNext).toBe(false);
      expect(mockPlayerInstance.canGoPrevious).toBe(false);
      expect(manager.active).toBe(true);
    });

    it('schedules poll to run after pollMs', () => {
      manager.start();
      jest.spyOn(manager, 'poll').mockResolvedValue();
      jest.advanceTimersByTime(1000);
      expect(manager.poll).toHaveBeenCalledTimes(1);
    });

    it('does nothing if already active', () => {
      manager.start();
      manager.start();
      expect(mockPlayerFactory).toHaveBeenCalledTimes(1);
    });

    it('does not recreate the player on a second start after stop', () => {
      manager.start();
      manager.stop();
      manager.start();
      expect(mockPlayerFactory).toHaveBeenCalledTimes(1);
    });

    it('logs a warning and stays inactive if the player constructor throws', () => {
      mockPlayerFactory.mockImplementationOnce(() => {
        throw new Error('no D-Bus session');
      });

      manager.start();

      expect(ctx.logger.warn).toHaveBeenCalled();
      expect(manager.active).toBe(false);
    });

    it('registers an error listener so a bad D-Bus connection cannot crash the app', () => {
      manager.start();

      const errorHandlerCall = mockPlayerInstance.on.mock.calls.find(
        ([event]) => event === 'error'
      );
      expect(errorHandlerCall).toBeDefined();

      expect(() => errorHandlerCall[1](new Error('some unrelated error'))).not.toThrow();
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        'MPRIS error:',
        expect.stringContaining('some unrelated error')
      );
    });

    it('getPosition reflects the last known state in microseconds', () => {
      manager.start();
      manager.lastState = { ...manager.lastState, currentTime: 12.5 };
      expect(mockPlayerInstance.getPosition()).toBe(12500000);
    });
  });

  describe('poll scheduling (no overlap)', () => {
    it('does not start a second poll until the first one resolves, even past pollMs', async () => {
      let resolveFirst;
      const firstPollPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      manager.start();
      const realPoll = manager.poll.bind(manager);
      let callCount = 0;
      jest.spyOn(manager, 'poll').mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) return firstPollPromise;
        return realPoll();
      });

      jest.advanceTimersByTime(1000); // fires the first poll, which hangs
      expect(callCount).toBe(1);

      jest.advanceTimersByTime(5000); // well past pollMs, but first poll still pending
      expect(callCount).toBe(1); // no second poll started while the first is in flight

      resolveFirst();
      await Promise.resolve(); // let the resolved promise's .then chain run
      await Promise.resolve();

      jest.advanceTimersByTime(1000); // now the next one can be scheduled and fire
      expect(callCount).toBe(2);
    });

    it('stops rescheduling once stop() is called', async () => {
      manager.start();
      jest.spyOn(manager, 'poll').mockResolvedValue();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(manager.poll).toHaveBeenCalledTimes(1);

      manager.stop();
      jest.advanceTimersByTime(5000);
      expect(manager.poll).toHaveBeenCalledTimes(1);
    });
  });

  describe('dead-connection handling', () => {
    it('stops and nulls the player when the error event reports a closed stream', () => {
      manager.start();
      const errorHandlerCall = mockPlayerInstance.on.mock.calls.find(
        ([event]) => event === 'error'
      );

      errorHandlerCall[1](streamClosedError());

      expect(ctx.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('D-Bus connection appears closed')
      );
      expect(manager.active).toBe(false);
      expect(manager.player).toBeNull();
    });

    it('does not repeat the stop/log if more closed-stream errors arrive afterward', () => {
      manager.start();
      const errorHandlerCall = mockPlayerInstance.on.mock.calls.find(
        ([event]) => event === 'error'
      );

      errorHandlerCall[1](streamClosedError());
      const warnCallsAfterFirst = ctx.logger.warn.mock.calls.length;
      errorHandlerCall[1](streamClosedError('Cannot send message, stream is closed'));

      expect(ctx.logger.warn.mock.calls.length).toBe(warnCallsAfterFirst); // no additional warn
    });

    it('also detects a closed-stream error thrown synchronously inside poll()', async () => {
      manager.start();
      Object.defineProperty(mockPlayerInstance, 'playbackStatus', {
        configurable: true,
        set: () => {
          throw streamClosedError();
        },
      });

      await manager.poll();

      expect(manager.active).toBe(false);
      expect(manager.player).toBeNull();
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('D-Bus connection appears closed')
      );

      Object.defineProperty(mockPlayerInstance, 'playbackStatus', {
        configurable: true,
        writable: true,
        value: null,
      });
    });

    it('resets the dead-connection flag on a fresh player after restart', () => {
      manager.start();
      const errorHandlerCall = mockPlayerInstance.on.mock.calls.find(
        ([event]) => event === 'error'
      );
      errorHandlerCall[1](streamClosedError());
      expect(manager._connectionDead).toBe(true);

      manager.start(); // player was nulled, so this creates a fresh one
      expect(manager._connectionDead).toBe(false);
    });

    it('still logs unrelated errors normally, not as a dead connection', () => {
      manager.start();
      const errorHandlerCall = mockPlayerInstance.on.mock.calls.find(
        ([event]) => event === 'error'
      );

      errorHandlerCall[1](new Error('totally different problem'));

      expect(manager.active).toBe(true);
      expect(manager.player).not.toBeNull();
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        'MPRIS error:',
        expect.stringContaining('totally different problem')
      );
    });
  });

  describe('stop', () => {
    it('clears the timer, marks inactive, and reports Stopped', () => {
      manager.start();
      manager.stop();

      expect(manager.active).toBe(false);
      expect(manager.interval).toBeNull();
      expect(mockPlayerInstance.playbackStatus).toBe('Stopped');
    });

    it('does not throw if the connection is already dead when stopping', () => {
      manager.start();
      Object.defineProperty(mockPlayerInstance, 'playbackStatus', {
        configurable: true,
        set: () => {
          throw streamClosedError();
        },
      });

      expect(() => manager.stop()).not.toThrow();

      Object.defineProperty(mockPlayerInstance, 'playbackStatus', {
        configurable: true,
        writable: true,
        value: null,
      });
    });
  });

  describe('player event handlers', () => {
    function handlerFor(event) {
      const call = mockPlayerInstance.on.mock.calls.find(([name]) => name === event);
      return call[1];
    }

    beforeEach(() => {
      manager.start();
    });

    it('play only toggles when currently paused', async () => {
      playbackService.getState.mockResolvedValue({ playing: false });
      await handlerFor('play')();
      expect(playbackService.togglePlayPause).toHaveBeenCalled();
    });

    it('play does nothing when already playing', async () => {
      playbackService.getState.mockResolvedValue({ playing: true });
      await handlerFor('play')();
      expect(playbackService.togglePlayPause).not.toHaveBeenCalled();
    });

    it('play swallows a rejected getState instead of crashing', async () => {
      playbackService.getState.mockRejectedValue(new Error('page gone'));
      await expect(handlerFor('play')()).resolves.toBeUndefined();
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        'MPRIS play error:',
        expect.stringContaining('page gone')
      );
    });

    it('pause only toggles when currently playing', async () => {
      playbackService.getState.mockResolvedValue({ playing: true });
      await handlerFor('pause')();
      expect(playbackService.togglePlayPause).toHaveBeenCalled();
    });

    it('pause does nothing when already paused', async () => {
      playbackService.getState.mockResolvedValue({ playing: false });
      await handlerFor('pause')();
      expect(playbackService.togglePlayPause).not.toHaveBeenCalled();
    });

    it('playpause always toggles', () => {
      handlerFor('playpause')();
      expect(playbackService.togglePlayPause).toHaveBeenCalled();
    });

    it('stop calls pauseIfPlaying', () => {
      handlerFor('stop')();
      expect(playbackService.pauseIfPlaying).toHaveBeenCalledWith('mpris');
    });

    it('seek converts microseconds to a relative seconds offset', () => {
      handlerFor('seek')(5 * 1e6);
      expect(playbackService.seek).toHaveBeenCalledWith(5);
    });

    it('position (absolute) is translated to a relative offset from last known time', () => {
      manager.lastState.currentTime = 20;
      handlerFor('position')({ trackId: '/track/0', position: 30 * 1e6 });
      expect(playbackService.seek).toHaveBeenCalledWith(10);
    });

    it('raise shows, restores if minimized, and focuses the window', () => {
      mockWindow.isMinimized.mockReturnValue(true);
      handlerFor('raise')();
      expect(mockWindow.restore).toHaveBeenCalled();
      expect(mockWindow.show).toHaveBeenCalled();
      expect(mockWindow.focus).toHaveBeenCalled();
    });

    it('quit closes the main window', () => {
      handlerFor('quit')();
      expect(mockWindow.close).toHaveBeenCalled();
    });

    it('ignores commands once stopped', async () => {
      manager.stop();
      await handlerFor('seek')(1e6);
      expect(playbackService.seek).not.toHaveBeenCalled();
    });
  });

  describe('poll', () => {
    it('does nothing before start', async () => {
      await manager.poll();
      expect(mockWindow.webContents.executeJavaScript).not.toHaveBeenCalled();
    });

    it('updates playbackStatus from the page state', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ playing: false })
      );
      await manager.poll();
      expect(mockPlayerInstance.playbackStatus).toBe('Paused');
    });

    it('updates metadata only when the track actually changes', async () => {
      manager.start();
      await manager.poll(); // first poll always sets metadata (currentTrackKey starts null)
      mockPlayerInstance.metadata = null;

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(stateResult());
      await manager.poll(); // same url/title again

      expect(mockPlayerInstance.metadata).toBeNull();
    });

    it('combines title and episode info, sets album/artist/artUrl', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ title: 'Stranger Things', episodeInfo: 'S2:E5 "Dig Dug"' })
      );
      await manager.poll();

      expect(mockPlayerInstance.metadata['xesam:title']).toBe('Stranger Things — S2:E5 "Dig Dug"');
      expect(mockPlayerInstance.metadata['xesam:album']).toBe('Stranger Things');
      expect(mockPlayerInstance.metadata['xesam:artist']).toEqual(['Netflix']);
      expect(mockPlayerInstance.metadata['mpris:artUrl']).toMatch(/^file:\/\/.*icon\.png$/);
    });

    it('falls back to a plain title with no dash when there is no episode info', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ title: 'Some Movie', episodeInfo: '' })
      );
      await manager.poll();

      expect(mockPlayerInstance.metadata['xesam:title']).toBe('Some Movie');
    });

    it('falls back to "Netflix" when no title was found at all', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ title: '', episodeInfo: '' })
      );
      await manager.poll();

      expect(mockPlayerInstance.metadata['xesam:title']).toBe('Netflix');
      expect(mockPlayerInstance.metadata['xesam:album']).toBe('Netflix');
    });

    it('keeps retrying metadata every poll until a real title is found, then stops', async () => {
      manager.start();

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ title: '', episodeInfo: '' })
      );
      await manager.poll(); // title overlay not visible yet
      expect(mockPlayerInstance.metadata['xesam:title']).toBe('Netflix');
      expect(manager.titleResolved).toBe(false);

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ title: 'Real Show Name', episodeInfo: '' })
      );
      await manager.poll(); // overlay now visible, real title lands
      expect(mockPlayerInstance.metadata['xesam:title']).toBe('Real Show Name');
      expect(manager.titleResolved).toBe(true);

      mockPlayerInstance.metadata = null;
      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ title: 'Real Show Name', episodeInfo: '' })
      );
      await manager.poll(); // same track, already resolved — no redundant update
      expect(mockPlayerInstance.metadata).toBeNull();
    });

    it('resets titleResolved when the track changes so a new title can be picked up', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ title: 'First Show' })
      );
      await manager.poll();
      expect(manager.titleResolved).toBe(true);

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ title: '', url: 'https://www.netflix.com/watch/999' })
      );
      await manager.poll();
      expect(manager.titleResolved).toBe(false);
    });

    describe('artUrl (asar vs extraResources)', () => {
      it('uses the local assets path directly in dev (unpackaged)', async () => {
        mockElectronApp.isPackaged = false;
        manager.start();
        await manager.poll();

        expect(mockPlayerInstance.metadata['mpris:artUrl']).toMatch(/^file:\/\/.*icon\.png$/);
      });

      it('uses process.resourcesPath when packaged, since the icon inside app.asar is not readable by external processes', async () => {
        mockElectronApp.isPackaged = true;
        process.resourcesPath = '/opt/Netflix/resources';
        manager.start();
        await manager.poll();

        expect(mockPlayerInstance.metadata['mpris:artUrl']).toBe(
          'file:///opt/Netflix/resources/assets/icons/icon.png'
        );
      });

      it('omits artUrl entirely when packaged and the extraResources copy is missing', async () => {
        mockElectronApp.isPackaged = true;
        process.resourcesPath = '/opt/Netflix/resources';
        mockExistsSync.mockReturnValue(false);
        manager.start();
        await manager.poll();

        expect(mockPlayerInstance.metadata).not.toHaveProperty('mpris:artUrl');
      });
    });

    it('emits seeked when position jumps beyond normal playback drift', async () => {
      manager.start();
      await manager.poll(); // currentTime: 10
      mockPlayerInstance.seeked.mockClear();

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ currentTime: 400 })
      );
      await manager.poll();

      expect(mockPlayerInstance.seeked).toHaveBeenCalledWith(400 * 1e6);
    });

    it('does not emit seeked for ordinary one-interval playback progress', async () => {
      manager.start();
      await manager.poll(); // currentTime: 10 (first poll always seeds a baseline seeked() call)
      mockPlayerInstance.seeked.mockClear();

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ currentTime: 11 }) // exactly one 1000ms interval of normal playback
      );
      await manager.poll();

      expect(mockPlayerInstance.seeked).not.toHaveBeenCalled();
    });

    it('does nothing when the page read fails', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockRejectedValueOnce(new Error('gone'));
      await expect(manager.poll()).resolves.toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('stops the manager', () => {
      manager.start();
      manager.cleanup();
      expect(manager.active).toBe(false);
    });
  });
});
