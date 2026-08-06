const WatchPartyService = require('../../../src/main/services/WatchPartyService');

describe('WatchPartyService', () => {
  let ctx;
  let service;
  let mockWindow;
  let partyWindow;
  let windowManager;

  function stateResult(overrides = {}) {
    return {
      playing: true,
      currentTime: 10,
      duration: 100,
      title: 'Some Show',
      url: 'https://www.netflix.com/watch/123',
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(0);

    mockWindow = {
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: { executeJavaScript: jest.fn().mockResolvedValue(stateResult()) },
    };

    partyWindow = {
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: { send: jest.fn() },
    };

    windowManager = { getWindow: jest.fn().mockReturnValue(partyWindow) };

    ctx = {
      logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      getMainWindow: jest.fn(() => mockWindow),
      getManager: jest.fn((name) => (name === 'window' ? windowManager : null)),
    };

    service = new WatchPartyService(ctx);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start/stop', () => {
    it('starts polling on a 500ms interval and stop clears it', () => {
      service.start();
      expect(service.active).toBe(true);

      jest.spyOn(service, 'poll').mockResolvedValue();
      jest.advanceTimersByTime(500);
      expect(service.poll).toHaveBeenCalledTimes(1);

      service.stop();
      expect(service.active).toBe(false);
      jest.advanceTimersByTime(1000);
      expect(service.poll).toHaveBeenCalledTimes(1); // no more calls after stop
    });

    it('does nothing if already running', () => {
      service.start();
      const firstInterval = service.interval;
      service.start();
      expect(service.interval).toBe(firstInterval);
    });
  });

  describe('poll', () => {
    it('does nothing while inactive', async () => {
      await service.poll();
      expect(mockWindow.webContents.executeJavaScript).not.toHaveBeenCalled();
    });

    it('takes a first sample without forwarding anything', async () => {
      service.start();
      await service.poll();

      expect(service.lastLocalState).toMatchObject({ currentTime: 10 });
      expect(partyWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('forwards a play transition', async () => {
      service.start();
      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ playing: false })
      );
      await service.poll();

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ playing: true })
      );
      await service.poll();

      expect(partyWindow.webContents.send).toHaveBeenCalledWith(
        'watch-party:local-event',
        expect.objectContaining({ action: 'play' })
      );
    });

    it('forwards a pause transition', async () => {
      service.start();
      await service.poll(); // playing: true (first sample)

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ playing: false })
      );
      await service.poll();

      expect(partyWindow.webContents.send).toHaveBeenCalledWith(
        'watch-party:local-event',
        expect.objectContaining({ action: 'pause' })
      );
    });

    it('forwards a seek when currentTime jumps well beyond normal playback drift', async () => {
      service.start();
      await service.poll(); // currentTime: 10, playing: true

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ currentTime: 400 })
      );
      await service.poll();

      expect(partyWindow.webContents.send).toHaveBeenCalledWith(
        'watch-party:local-event',
        expect.objectContaining({ action: 'seek' })
      );
    });

    it('does not flag ordinary one-interval playback progress as a seek', async () => {
      service.start();
      await service.poll(); // currentTime: 10

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ currentTime: 10.5 }) // exactly one 500ms interval of normal playback
      );
      await service.poll();

      expect(partyWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('forwards title-changed when the url changes', async () => {
      service.start();
      await service.poll();

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ url: 'https://www.netflix.com/watch/999', title: 'Another Show' })
      );
      await service.poll();

      expect(partyWindow.webContents.send).toHaveBeenCalledWith(
        'watch-party:local-event',
        expect.objectContaining({ action: 'title-changed' })
      );
    });

    it('does not forward anything during the post-remote-command suppression window', async () => {
      service.start();
      await service.poll();
      service.suppressUntil = Date.now() + 5000;

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ playing: false })
      );
      await service.poll();

      expect(partyWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('does nothing when there is no watch-party window open', async () => {
      windowManager.getWindow.mockReturnValue(null);
      service.start();
      await service.poll();

      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce(
        stateResult({ playing: false })
      );
      await expect(service.poll()).resolves.toBeUndefined();
    });
  });

  describe('getCurrentState', () => {
    it('returns null without a main window', async () => {
      ctx.getMainWindow.mockReturnValue(null);
      expect(await service.getCurrentState()).toBeNull();
    });

    it('returns null and logs when executeJavaScript throws', async () => {
      mockWindow.webContents.executeJavaScript.mockRejectedValueOnce(new Error('gone'));
      expect(await service.getCurrentState()).toBeNull();
      expect(ctx.logger.error).toHaveBeenCalled();
    });
  });

  describe('applyRemoteCommand', () => {
    it('returns applied:false without a main window', async () => {
      ctx.getMainWindow.mockReturnValue(null);
      const result = await service.applyRemoteCommand('play', { currentTime: 5 });
      expect(result).toEqual({ applied: false, error: 'No main window' });
    });

    it('sets the suppression window before executing the command', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce({
        success: true,
        currentTime: 5,
      });
      await service.applyRemoteCommand('pause', { currentTime: 5 });
      expect(service.suppressUntil).toBeGreaterThan(Date.now());
    });

    it('compensates for latency on play but not on pause', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue({
        success: true,
        currentTime: 12,
      });

      jest.setSystemTime(3000);
      await service.applyRemoteCommand('play', { currentTime: 10, at: 1000 }); // 2s in flight
      let script = mockWindow.webContents.executeJavaScript.mock.calls[0][0];
      expect(script).toContain('video.currentTime - 12'); // 10 + 2s latency

      mockWindow.webContents.executeJavaScript.mockClear();
      await service.applyRemoteCommand('pause', { currentTime: 10, at: 1000 });
      script = mockWindow.webContents.executeJavaScript.mock.calls[0][0];
      expect(script).toContain('video.currentTime - 10'); // no latency compensation on pause
    });

    it('returns applied:false when the page reports an error', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValueOnce({ error: 'no video' });
      const result = await service.applyRemoteCommand('play', { currentTime: 5 });
      expect(result).toEqual({ applied: false, error: 'no video' });
    });

    it('returns applied:false when executeJavaScript rejects', async () => {
      mockWindow.webContents.executeJavaScript.mockRejectedValueOnce(new Error('crashed'));
      const result = await service.applyRemoteCommand('play', { currentTime: 5 });
      expect(result).toEqual({ applied: false, error: 'crashed' });
    });
  });

  describe('cleanup', () => {
    it('stops polling', () => {
      service.start();
      service.cleanup();
      expect(service.active).toBe(false);
      expect(service.interval).toBeNull();
    });
  });
});
