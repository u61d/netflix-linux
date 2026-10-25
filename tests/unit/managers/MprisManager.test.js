function makePlayer() {
  return {
    on: jest.fn(),
    objectPath: jest.fn((subpath) => `/org/node/mediaplayer/netflix-linux/${subpath}`),
    seeked: jest.fn(),
    getPosition: null,
    playbackStatus: null,
    metadata: null,
    canControl: null,
    canPlay: null,
    canPause: null,
    canSeek: null,
    canGoNext: null,
    canGoPrevious: null,
    canSetFullscreen: null,
    fullscreen: null,
    loopStatus: null,
    shuffle: null,
    rate: null,
    volume: null,
    minimumRate: null,
    maximumRate: null,
  };
}

let mockPlayerInstance = makePlayer();
const mockPlayerFactory = jest.fn(() => mockPlayerInstance);
const mockElectronApp = {
  isPackaged: false,
  getName: jest.fn(() => 'netflix-linux'),
  getPath: jest.fn(() => '/home/user/.config/netflix-linux'),
};
const mockExistsSync = jest.fn().mockReturnValue(true);

jest.mock('mpris-service', () => mockPlayerFactory);
jest.mock('electron', () => ({ app: mockElectronApp }));
jest.mock('fs', () => ({
  existsSync: (...args) => mockExistsSync(...args),
  // selectors.json is real config, not something to stub out
  readFileSync: (...args) => jest.requireActual('fs').readFileSync(...args),
}));

const MprisManager = require('../../../src/main/managers/MprisManager');

function streamClosedError(message = 'Tried to write a message to a closed stream') {
  const error = new Error(message);
  error.stack = `Error: ${message}\n    at node_modules/dbus-next/lib/bus.js:371:22`;
  return error;
}

// what _readPageState() resolves to: a series episode, playing
function pageState(overrides = {}) {
  return {
    hasVideo: true,
    url: 'https://www.netflix.com/watch/123',
    documentTitle: 'Netflix',
    titleLines: ['Stranger Things', 'S2:E5', 'Dig Dug'],
    metaText: 'S2:E5',
    session: null,
    playing: true,
    currentTime: 10,
    duration: 100,
    rate: 1,
    volume: 1,
    muted: false,
    ...overrides,
  };
}

function idlePageState() {
  return {
    hasVideo: false,
    url: 'https://www.netflix.com/browse',
    documentTitle: 'Netflix',
    titleLines: [],
    metaText: '',
    session: null,
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
    mockPlayerInstance = makePlayer();
    mockPlayerFactory.mockImplementation(() => mockPlayerInstance);
    mockElectronApp.isPackaged = false;
    mockElectronApp.getName.mockReturnValue('netflix-linux');
    mockExistsSync.mockReturnValue(true);

    mockWindow = {
      isDestroyed: jest.fn().mockReturnValue(false),
      isMinimized: jest.fn().mockReturnValue(false),
      restore: jest.fn(),
      show: jest.fn(),
      focus: jest.fn(),
      close: jest.fn(),
      loadURL: jest.fn(),
      setFullScreen: jest.fn(),
      webContents: { executeJavaScript: jest.fn().mockResolvedValue(pageState()) },
    };

    playbackService = {
      getState: jest.fn().mockResolvedValue({ playing: false }),
      togglePlayPause: jest.fn().mockResolvedValue({ action: 'play' }),
      pauseIfPlaying: jest.fn().mockResolvedValue({ status: 'paused' }),
      seek: jest.fn().mockResolvedValue({ currentTime: 10 }),
      setVolume: jest.fn().mockResolvedValue({ volume: 0.5 }),
      setSpeed: jest.fn().mockResolvedValue(true),
      nextEpisode: jest.fn().mockResolvedValue({ status: 'clicked' }),
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

  function handlerFor(event) {
    const call = mockPlayerInstance.on.mock.calls.find(([name]) => name === event);
    return call && call[1];
  }

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

    it('registers under the installed .desktop basename so shells can find the icon', () => {
      manager.start();

      expect(mockPlayerFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'netflix-linux',
          identity: 'Netflix',
          desktopEntry: 'netflix-linux',
        })
      );
    });

    it('falls back to a literal desktop entry when app.getName() is unavailable', () => {
      mockElectronApp.getName.mockImplementation(() => {
        throw new Error('too early');
      });

      manager.start();

      expect(mockPlayerFactory).toHaveBeenCalledWith(
        expect.objectContaining({ desktopEntry: 'netflix-linux' })
      );
    });

    it('advertises the rate range playback actually supports', () => {
      manager.start();

      expect(mockPlayerInstance.canControl).toBe(true);
      expect(mockPlayerInstance.canSetFullscreen).toBe(true);
      expect(mockPlayerInstance.minimumRate).toBe(0.25);
      expect(mockPlayerInstance.maximumRate).toBe(4);
      expect(mockPlayerInstance.loopStatus).toBe('None');
      expect(mockPlayerInstance.shuffle).toBe(false);
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
      const onError = handlerFor('error');
      expect(onError).toBeDefined();

      expect(() => onError(new Error('some unrelated error'))).not.toThrow();
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
      await Promise.resolve();
      await Promise.resolve();

      jest.advanceTimersByTime(1000);
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
      handlerFor('error')(streamClosedError());

      expect(ctx.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('D-Bus connection appears closed')
      );
      expect(manager.active).toBe(false);
      expect(manager.player).toBeNull();
    });

    it('does not repeat the stop/log if more closed-stream errors arrive afterward', () => {
      manager.start();
      const onError = handlerFor('error');

      onError(streamClosedError());
      const warnCallsAfterFirst = ctx.logger.warn.mock.calls.length;
      onError(streamClosedError('Cannot send message, stream is closed'));

      expect(ctx.logger.warn.mock.calls.length).toBe(warnCallsAfterFirst);
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
    });

    it('stops touching the player after a metadata write finds the connection dead', async () => {
      manager.start();
      Object.defineProperty(mockPlayerInstance, 'metadata', {
        configurable: true,
        set: () => {
          throw streamClosedError();
        },
        get: () => null,
      });

      await manager.poll();

      expect(manager.active).toBe(false);
      expect(mockPlayerInstance.rate).toBeNull(); // never reached
    });

    it('resets the dead-connection flag on a fresh player after restart', () => {
      manager.start();
      handlerFor('error')(streamClosedError());
      expect(manager._connectionDead).toBe(true);

      manager.start(); // player was nulled, so this creates a fresh one
      expect(manager._connectionDead).toBe(false);
    });

    it('still logs unrelated errors normally, not as a dead connection', () => {
      manager.start();
      handlerFor('error')(new Error('totally different problem'));

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

    it('forgets the published metadata so a restart republishes it', async () => {
      manager.start();
      await manager.poll();
      expect(manager.lastMetadata).not.toBeNull();

      manager.stop();
      expect(manager.lastMetadata).toBeNull();
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
    });
  });

  describe('player event handlers', () => {
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

    it('playpause always toggles', async () => {
      await handlerFor('playpause')();
      expect(playbackService.togglePlayPause).toHaveBeenCalled();
    });

    it('stop calls pauseIfPlaying', async () => {
      await handlerFor('stop')();
      expect(playbackService.pauseIfPlaying).toHaveBeenCalledWith('mpris');
    });

    it('next advances to the next episode', async () => {
      await handlerFor('next')();
      expect(playbackService.nextEpisode).toHaveBeenCalled();
    });

    it('seek converts microseconds to a relative seconds offset', async () => {
      await handlerFor('seek')(5 * 1e6);
      expect(playbackService.seek).toHaveBeenCalledWith(5);
    });

    it('position (absolute) is translated to a relative offset from last known time', async () => {
      manager.lastState.currentTime = 20;
      await handlerFor('position')({ trackId: '/track/0', position: 30 * 1e6 });
      expect(playbackService.seek).toHaveBeenCalledWith(10);
    });

    it('volume is passed straight through to playback', async () => {
      await handlerFor('volume')(0.42);
      expect(playbackService.setVolume).toHaveBeenCalledWith(0.42);
    });

    it('rate is clamped to the supported range', async () => {
      await handlerFor('rate')(9);
      expect(playbackService.setSpeed).toHaveBeenCalledWith(4);

      await handlerFor('rate')(0.01);
      expect(playbackService.setSpeed).toHaveBeenCalledWith(0.25);
    });

    it('open loads a Netflix URL', async () => {
      await handlerFor('open')({ uri: 'https://www.netflix.com/watch/999' });
      expect(mockWindow.loadURL).toHaveBeenCalledWith('https://www.netflix.com/watch/999');
    });

    it('open refuses a URL that is not Netflix', async () => {
      await handlerFor('open')({ uri: 'https://example.com/evil' });
      expect(mockWindow.loadURL).not.toHaveBeenCalled();
      expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('refusing'));
    });

    it('open refuses a host that merely ends in a Netflix-looking string', async () => {
      await handlerFor('open')({ uri: 'https://netflix.com.evil.test/watch/1' });
      expect(mockWindow.loadURL).not.toHaveBeenCalled();
    });

    it('fullscreen toggles the window and reflects the new value back', () => {
      handlerFor('fullscreen')(true);
      expect(mockWindow.setFullScreen).toHaveBeenCalledWith(true);
      expect(mockPlayerInstance.fullscreen).toBe(true);
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

    it('reports Playing and Paused from the page state', async () => {
      manager.start();
      await manager.poll();
      expect(mockPlayerInstance.playbackStatus).toBe('Playing');

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(pageState({ playing: false }));
      await manager.poll();
      expect(mockPlayerInstance.playbackStatus).toBe('Paused');
    });

    it('reports Stopped and drops controls when the page has no video', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockResolvedValue(idlePageState());

      await manager.poll();

      expect(mockPlayerInstance.playbackStatus).toBe('Stopped');
      expect(mockPlayerInstance.canPlay).toBe(false);
      expect(mockPlayerInstance.canSeek).toBe(false);
      expect(manager.lastState.currentTime).toBe(0);
    });

    it('publishes the show, season and episode in the metadata', async () => {
      manager.start();
      await manager.poll();

      const metadata = mockPlayerInstance.metadata;
      expect(metadata['xesam:title']).toBe('S2:E5 · Dig Dug');
      expect(metadata['xesam:artist']).toEqual(['Stranger Things']);
      expect(metadata['xesam:album']).toBe('Season 2');
      expect(metadata['xesam:discNumber']).toBe(2);
      expect(metadata['xesam:trackNumber']).toBe(5);
      expect(metadata['xesam:url']).toBe('https://www.netflix.com/watch/123');
      expect(metadata['mpris:length']).toBe(100 * 1e6);
    });

    it('treats a film as a single track with no season or episode', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockResolvedValue(
        pageState({ titleLines: ['Glass Onion'], metaText: '' })
      );

      await manager.poll();

      const metadata = mockPlayerInstance.metadata;
      expect(metadata['xesam:title']).toBe('Glass Onion');
      expect(metadata['xesam:artist']).toEqual(['Netflix']);
      expect(metadata).not.toHaveProperty('xesam:trackNumber');
      expect(mockPlayerInstance.canGoNext).toBe(false);
    });

    it('allows Next only for a series', async () => {
      manager.start();
      await manager.poll();
      expect(mockPlayerInstance.canGoNext).toBe(true);
      expect(mockPlayerInstance.canGoPrevious).toBe(false);
    });

    it('republishes metadata when the title overlay finally resolves', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        pageState({ titleLines: [], metaText: '' })
      );
      await manager.poll(); // controls hidden: nothing to go on yet
      expect(mockPlayerInstance.metadata['xesam:title']).toBe('Netflix');

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(pageState());
      await manager.poll(); // overlay visible, real title lands
      expect(mockPlayerInstance.metadata['xesam:title']).toBe('S2:E5 · Dig Dug');
    });

    // Netflix drops the title overlay out of the DOM a few seconds after the
    // player controls hide, so most polls while watching resolve nothing
    describe('when the title overlay disappears', () => {
      const hidden = () => pageState({ titleLines: [], metaText: '', documentTitle: 'Netflix' });

      it('keeps the episode on screen instead of falling back to Netflix', async () => {
        manager.start();
        await manager.poll();
        expect(mockPlayerInstance.metadata['xesam:title']).toBe('S2:E5 · Dig Dug');

        mockWindow.webContents.executeJavaScript.mockResolvedValue(hidden());
        await manager.poll();
        await manager.poll();

        expect(mockPlayerInstance.metadata['xesam:title']).toBe('S2:E5 · Dig Dug');
        expect(mockPlayerInstance.metadata['xesam:artist']).toEqual(['Stranger Things']);
        expect(mockPlayerInstance.metadata['xesam:trackNumber']).toBe(5);
      });

      it('keeps the same trackid, so clients do not see a new track', async () => {
        manager.start();
        await manager.poll();
        const trackId = mockPlayerInstance.metadata['mpris:trackid'];

        mockWindow.webContents.executeJavaScript.mockResolvedValue(hidden());
        await manager.poll();

        expect(mockPlayerInstance.metadata['mpris:trackid']).toBe(trackId);
      });

      it('still picks up the next episode when the overlay comes back', async () => {
        manager.start();
        await manager.poll();

        mockWindow.webContents.executeJavaScript.mockResolvedValue(hidden());
        await manager.poll();

        mockWindow.webContents.executeJavaScript.mockResolvedValue(
          pageState({ titleLines: ['Stranger Things', 'S2:E6', 'The Spy'], metaText: 'S2:E6' })
        );
        await manager.poll();

        expect(mockPlayerInstance.metadata['xesam:title']).toBe('S2:E6 · The Spy');
      });

      it('forgets the old episode once a different video is playing', async () => {
        manager.start();
        await manager.poll();

        mockWindow.webContents.executeJavaScript.mockResolvedValue(
          pageState({
            url: 'https://www.netflix.com/watch/999',
            titleLines: [],
            metaText: '',
            documentTitle: 'Netflix',
          })
        );
        await manager.poll();

        expect(mockPlayerInstance.metadata['xesam:title']).toBe('Netflix');
      });

      it('forgets the old episode after a trip back to the browse page', async () => {
        manager.start();
        await manager.poll();

        mockWindow.webContents.executeJavaScript.mockResolvedValue(idlePageState());
        await manager.poll();
        expect(mockPlayerInstance.playbackStatus).toBe('Stopped');

        mockWindow.webContents.executeJavaScript.mockResolvedValue(hidden());
        await manager.poll();

        expect(mockPlayerInstance.metadata['xesam:title']).toBe('Netflix');
      });
    });

    it('reads the run-together overlay text Netflix actually returns', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockResolvedValue(
        pageState({ titleLines: ['Stranger ThingsS2:E5Dig Dug'], metaText: '' })
      );

      await manager.poll();

      expect(mockPlayerInstance.metadata['xesam:title']).toBe('S2:E5 · Dig Dug');
      expect(mockPlayerInstance.metadata['xesam:artist']).toEqual(['Stranger Things']);
    });

    it('reads a show numbered by episode only, with no season', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockResolvedValue(
        pageState({ titleLines: ['LupinE3Chapter 3'], metaText: '' })
      );

      await manager.poll();

      expect(mockPlayerInstance.metadata['xesam:title']).toBe('E3 · Chapter 3');
      expect(mockPlayerInstance.metadata['xesam:artist']).toEqual(['Lupin']);
      expect(mockPlayerInstance.canGoNext).toBe(true);
    });

    it('does not rewrite metadata that has not changed', async () => {
      manager.start();
      await manager.poll();

      mockPlayerInstance.metadata = null;
      await manager.poll(); // same content, one second later

      expect(mockPlayerInstance.metadata).toBeNull();
    });

    it('issues a new trackid when the episode changes without a navigation', async () => {
      manager.start();
      await manager.poll();
      const firstTrackId = mockPlayerInstance.metadata['mpris:trackid'];

      mockWindow.webContents.executeJavaScript.mockResolvedValue(
        pageState({ titleLines: ['Stranger Things', 'S2:E6', 'The Spy'], metaText: 'S2:E6' })
      );
      await manager.poll();

      expect(mockPlayerInstance.metadata['mpris:trackid']).not.toBe(firstTrackId);
      expect(mockPlayerInstance.metadata['xesam:trackNumber']).toBe(6);
    });

    it('keeps the same trackid while the same episode plays on', async () => {
      manager.start();
      await manager.poll();
      const trackId = mockPlayerInstance.metadata['mpris:trackid'];

      mockWindow.webContents.executeJavaScript.mockResolvedValue(
        pageState({ currentTime: 11, duration: 101 })
      );
      await manager.poll();

      expect(mockPlayerInstance.metadata['mpris:trackid']).toBe(trackId);
    });

    it('mirrors the playback rate and the volume', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockResolvedValue(
        pageState({ rate: 1.5, volume: 0.25 })
      );

      await manager.poll();

      expect(mockPlayerInstance.rate).toBe(1.5);
      expect(mockPlayerInstance.volume).toBe(0.25);
    });

    it('reports a muted video as zero volume, since MPRIS has no mute', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockResolvedValue(
        pageState({ volume: 0.8, muted: true })
      );

      await manager.poll();

      expect(mockPlayerInstance.volume).toBe(0);
    });

    it('only offers seeking once a duration is known', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockResolvedValue(pageState({ duration: 0 }));

      await manager.poll();

      expect(mockPlayerInstance.canSeek).toBe(false);
    });

    describe('artUrl', () => {
      it('always publishes the bundled logo', async () => {
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

    describe('seeked', () => {
      it('emits when the position jumps beyond normal playback drift', async () => {
        manager.start();
        await manager.poll(); // currentTime: 10
        mockPlayerInstance.seeked.mockClear();

        mockWindow.webContents.executeJavaScript.mockResolvedValue(pageState({ currentTime: 400 }));
        await manager.poll();

        expect(mockPlayerInstance.seeked).toHaveBeenCalledWith(400 * 1e6);
      });

      it('stays quiet for ordinary one-interval playback progress', async () => {
        manager.start();
        await manager.poll();
        mockPlayerInstance.seeked.mockClear();

        mockWindow.webContents.executeJavaScript.mockResolvedValue(pageState({ currentTime: 11 }));
        await manager.poll();

        expect(mockPlayerInstance.seeked).not.toHaveBeenCalled();
      });

      it('stays quiet while paused, where no progress is the expected progress', async () => {
        manager.start();
        mockWindow.webContents.executeJavaScript.mockResolvedValue(pageState({ playing: false }));
        await manager.poll();
        mockPlayerInstance.seeked.mockClear();

        await manager.poll();

        expect(mockPlayerInstance.seeked).not.toHaveBeenCalled();
      });

      it('accounts for the playback rate before calling it a seek', async () => {
        manager.start();
        mockWindow.webContents.executeJavaScript.mockResolvedValue(
          pageState({ rate: 2, currentTime: 10 })
        );
        await manager.poll();
        mockPlayerInstance.seeked.mockClear();

        mockWindow.webContents.executeJavaScript.mockResolvedValue(
          pageState({ rate: 2, currentTime: 12 }) // one interval at 2x
        );
        await manager.poll();

        expect(mockPlayerInstance.seeked).not.toHaveBeenCalled();
      });

      it('does not emit on the first poll of a new video', async () => {
        manager.start();
        await manager.poll();

        expect(mockPlayerInstance.seeked).not.toHaveBeenCalled();
      });
    });

    it('does nothing when the page read fails', async () => {
      manager.start();
      mockWindow.webContents.executeJavaScript.mockRejectedValueOnce(new Error('gone'));
      await expect(manager.poll()).resolves.toBeUndefined();
      expect(ctx.logger.error).toHaveBeenCalled();
    });

    it('does nothing when the window is gone', async () => {
      manager.start();
      mockWindow.isDestroyed.mockReturnValue(true);
      await manager.poll();
      expect(mockWindow.webContents.executeJavaScript).not.toHaveBeenCalled();
    });
  });

  // mpris-service types every metadata number as a double; the spec says these
  // two are int32, so the manager corrects them on the interface afterwards
  describe('episode numbers on the bus', () => {
    it('retypes the season and episode as int32', async () => {
      const dbus = require('dbus-next');
      const emitted = jest
        .spyOn(dbus.interface.Interface, 'emitPropertiesChanged')
        .mockImplementation(() => {});
      const stored = {
        'xesam:trackNumber': new dbus.Variant('d', 5),
        'xesam:discNumber': new dbus.Variant('d', 2),
      };
      mockPlayerInstance.interfaces = { player: { _Metadata: stored } };

      manager.start();
      await manager.poll();

      expect(stored['xesam:trackNumber']).toMatchObject({ signature: 'i', value: 5 });
      expect(stored['xesam:discNumber']).toMatchObject({ signature: 'i', value: 2 });
      expect(emitted).toHaveBeenCalledWith(
        mockPlayerInstance.interfaces.player,
        expect.objectContaining({ Metadata: stored })
      );

      emitted.mockRestore();
    });

    it('leaves a film alone, since it has no numbers to retype', async () => {
      const dbus = require('dbus-next');
      const emitted = jest
        .spyOn(dbus.interface.Interface, 'emitPropertiesChanged')
        .mockImplementation(() => {});
      mockPlayerInstance.interfaces = { player: { _Metadata: {} } };
      mockWindow.webContents.executeJavaScript.mockResolvedValue(
        pageState({ titleLines: ['Glass Onion'], metaText: '' })
      );

      manager.start();
      await manager.poll();

      expect(emitted).not.toHaveBeenCalled();
      emitted.mockRestore();
    });

    it('still publishes metadata when the library internals are not where it expects', async () => {
      manager.start();
      await expect(manager.poll()).resolves.toBeUndefined();
      expect(mockPlayerInstance.metadata['xesam:trackNumber']).toBe(5);
    });
  });

  // The title block measured on the real app:
  //   <div data-uia="video-title"><h4>Lupin</h4><span>E3</span><span>Chapter 3</span></div>
  // innerText and textContent are both "LupinE3Chapter 3" — no separator at
  // all — so the injected script reads one line per child element.
  describe('reading the title block', () => {
    const leaf = (text) => ({ children: [], textContent: text, innerText: text });

    function titleBlock(...parts) {
      const children = parts.filter(Boolean).map(leaf);
      const glued = children.map((child) => child.textContent).join('');
      return { children, textContent: glued, innerText: glued };
    }

    function readPage(nodes) {
      const script = mockWindow.webContents.executeJavaScript.mock.calls[0][0];
      const run = new Function(
        'document',
        'navigator',
        'window',
        `return eval(${JSON.stringify(script)});`
      );
      return run(
        {
          title: 'Netflix',
          querySelector: (selector) => (nodes[selector] || [])[0] || null,
          querySelectorAll: (selector) => nodes[selector] || [],
        },
        { mediaSession: { metadata: null } },
        { location: { href: 'https://www.netflix.com/watch/80217863' } }
      );
    }

    const video = {
      paused: false,
      ended: false,
      currentTime: 61,
      duration: 3000,
      playbackRate: 1,
      volume: 1,
      muted: false,
    };

    beforeEach(() => {
      manager.start();
      return manager.poll();
    });

    it('splits the children of the title block', () => {
      const read = readPage({
        '[data-uia="video-title"]': [titleBlock('Lupin', 'E3', 'Chapter 3')],
        video: [video],
      });

      expect(read.titleLines).toEqual(['Lupin', 'E3', 'Chapter 3']);
    });

    it('does not let an outer container add the title back as one glued line', () => {
      const block = titleBlock('Lupin', 'E3', 'Chapter 3');
      const read = readPage({
        '[data-uia="video-title"]': [block],
        '.video-title': [{ children: [block], textContent: block.textContent, innerText: '' }],
        video: [video],
      });

      expect(read.titleLines).toEqual(['Lupin', 'E3', 'Chapter 3']);
    });

    it('still reads a block that holds nothing but the title', () => {
      const read = readPage({
        '[data-uia="video-title"]': [titleBlock('Glass Onion')],
        video: [video],
      });

      expect(read.titleLines).toEqual(['Glass Onion']);
    });

    it('falls back to the element text when there are no child elements', () => {
      const read = readPage({
        '[data-uia="video-title"]': [
          { children: [], textContent: 'Wednesday', innerText: 'Wednesday' },
        ],
        video: [video],
      });

      expect(read.titleLines).toEqual(['Wednesday']);
    });

    // measured on the real app: Netflix does not populate it
    it('copes with Media Session metadata being null', () => {
      const read = readPage({
        '[data-uia="video-title"]': [titleBlock('Lupin', 'E3', 'Chapter 3')],
        video: [video],
      });

      expect(read.session).toBeNull();
    });

    it('reports no video when the page has none', () => {
      const read = readPage({});
      expect(read.hasVideo).toBe(false);
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
