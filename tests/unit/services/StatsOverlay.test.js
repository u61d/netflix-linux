const mockNotify = jest.fn();
jest.mock('../../../src/main/utils/notifications', () =>
  jest.fn().mockImplementation(() => ({ notify: mockNotify }))
);

const StatsOverlay = require('../../../src/main/services/StatsOverlay');

describe('StatsOverlay', () => {
  let ctx;
  let overlay;
  let mockWindow;
  let storeOverrides;
  let storeValues;
  let playbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    storeValues = { showDetailedStats: true, networkMetricsEnabled: true };
    storeOverrides = storeValues;

    mockWindow = {
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: {
        executeJavaScript: jest.fn().mockResolvedValue(null),
        on: jest.fn(),
        removeListener: jest.fn(),
      },
    };

    playbackService = { getNetworkMetrics: jest.fn().mockResolvedValue(null) };

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
      getService: jest.fn((name) => (name === 'playback' ? playbackService : null)),
    };

    overlay = new StatsOverlay(ctx);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start/stop', () => {
    it('does nothing when the setting is disabled', () => {
      storeValues.showDetailedStats = false;
      overlay.start();
      expect(overlay.interval).toBeNull();
      expect(mockWindow.webContents.executeJavaScript).not.toHaveBeenCalled();
    });

    it('injects the overlay, attaches listeners, and polls every second', () => {
      overlay.start();

      expect(mockWindow.webContents.executeJavaScript).toHaveBeenCalledTimes(1);
      expect(mockWindow.webContents.on).toHaveBeenCalledWith('dom-ready', expect.any(Function));

      jest.spyOn(overlay, 'update').mockResolvedValue();
      jest.advanceTimersByTime(1000);
      expect(overlay.update).toHaveBeenCalledTimes(1);
    });

    it('does nothing if already running', () => {
      overlay.start();
      overlay.start();
      expect(mockWindow.webContents.executeJavaScript).toHaveBeenCalledTimes(1);
    });

    it('stop clears the interval, removes the overlay, and detaches listeners', () => {
      overlay.start();
      overlay.stop();

      expect(overlay.interval).toBeNull();
      expect(mockWindow.webContents.removeListener).toHaveBeenCalledTimes(4);
      expect(overlay.injected).toBe(false);
      expect(overlay.listenersAttached).toBe(false);
    });
  });

  describe('toggle', () => {
    it('turns the overlay on and notifies when it was off', () => {
      storeValues.showDetailedStats = false;
      overlay.toggle();

      expect(storeValues.showDetailedStats).toBe(true);
      expect(overlay.interval).not.toBeNull();
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Detailed Stats', body: 'Enabled' })
      );
    });

    it('turns the overlay off and notifies when it was on', () => {
      overlay.start();
      overlay.toggle();

      expect(storeValues.showDetailedStats).toBe(false);
      expect(overlay.interval).toBeNull();
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Detailed Stats', body: 'Disabled' })
      );
    });
  });

  describe('inject', () => {
    it('does nothing without a main window', () => {
      ctx.getMainWindow.mockReturnValue(null);
      overlay.inject();
      expect(overlay.injected).toBe(false);
    });

    it('does not inject twice', () => {
      overlay.inject();
      overlay.inject();
      expect(mockWindow.webContents.executeJavaScript).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleNavigation', () => {
    it('re-injects on navigation when stats are enabled', () => {
      overlay.inject();
      overlay.handleNavigation();

      expect(mockWindow.webContents.executeJavaScript).toHaveBeenCalledTimes(2);
    });

    it('does nothing when stats are disabled', () => {
      storeValues.showDetailedStats = false;
      overlay.handleNavigation();
      expect(mockWindow.webContents.executeJavaScript).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('does nothing without a main window', async () => {
      ctx.getMainWindow.mockReturnValue(null);
      await overlay.update();
      expect(playbackService.getNetworkMetrics).not.toHaveBeenCalled();
    });

    it('does not render when the page reports no video', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue(null);
      jest.spyOn(overlay, 'render');

      await overlay.update();

      expect(overlay.render).not.toHaveBeenCalled();
    });

    it('fetches network metrics and renders when stats and network are available', async () => {
      const stats = { currentTime: '1.00', duration: '10.00' };
      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(stats);
      playbackService.getNetworkMetrics.mockResolvedValue({ effectiveType: '4g' });
      jest.spyOn(overlay, 'render').mockImplementation(() => {});

      await overlay.update();

      expect(playbackService.getNetworkMetrics).toHaveBeenCalled();
      expect(overlay.render).toHaveBeenCalledWith(stats, { effectiveType: '4g' });
    });

    it('skips network metrics when disabled in settings', async () => {
      storeValues.networkMetricsEnabled = false;
      const stats = { currentTime: '1.00', duration: '10.00' };
      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(stats);
      jest.spyOn(overlay, 'render').mockImplementation(() => {});

      await overlay.update();

      expect(playbackService.getNetworkMetrics).not.toHaveBeenCalled();
      expect(overlay.render).toHaveBeenCalledWith(stats, null);
    });

    it('swallows errors from executeJavaScript', async () => {
      mockWindow.webContents.executeJavaScript.mockRejectedValueOnce(new Error('page gone'));
      await expect(overlay.update()).resolves.toBeUndefined();
    });
  });

  describe('render', () => {
    it('writes basic stats to the overlay content element', () => {
      overlay.render({
        currentTime: '1.00',
        duration: '10.00',
        buffered: '2.00',
        playbackRate: 1,
        volume: 80,
        resolution: '1920x1080',
        fps: 60,
        dropped: 0,
      });

      const script = mockWindow.webContents.executeJavaScript.mock.calls[0][0];
      expect(script).toContain('Time: 1.00s / 10.00s');
      expect(script).toContain('Resolution: 1920x1080');
    });

    it('includes connection details when network metrics are passed', () => {
      overlay.render(
        {
          currentTime: '1.00',
          duration: '10.00',
          buffered: '2.00',
          playbackRate: 1,
          volume: 80,
          resolution: '1920x1080',
          fps: 60,
          dropped: 0,
        },
        { effectiveType: '4g', downlink: 10, rtt: 50, decodedFrames: 100, droppedFrames: 5 }
      );

      const script = mockWindow.webContents.executeJavaScript.mock.calls[0][0];
      expect(script).toContain('Connection: 4g (10Mbps)');
      expect(script).toContain('RTT: 50ms');
      expect(script).toContain('Drop rate: 5.00%');
    });

    it('does nothing without a main window', () => {
      ctx.getMainWindow.mockReturnValue(null);
      expect(() => overlay.render({ currentTime: '0', duration: '0' })).not.toThrow();
    });
  });

  describe('remove', () => {
    it('resets injected without touching the page when there is no window', () => {
      ctx.getMainWindow.mockReturnValue(null);
      overlay.injected = true;
      overlay.remove();
      expect(overlay.injected).toBe(false);
    });

    it('resets injected without touching the page when the window is destroyed', () => {
      mockWindow.isDestroyed.mockReturnValue(true);
      overlay.injected = true;
      overlay.remove();
      expect(overlay.injected).toBe(false);
      expect(mockWindow.webContents.executeJavaScript).not.toHaveBeenCalled();
    });

    it('swallows synchronous errors from executeJavaScript', () => {
      mockWindow.webContents.executeJavaScript.mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => overlay.remove()).not.toThrow();
      expect(overlay.injected).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('stops the overlay', () => {
      overlay.start();
      overlay.cleanup();
      expect(overlay.interval).toBeNull();
    });
  });
});
