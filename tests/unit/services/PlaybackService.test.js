const PlaybackService = require('../../../src/main/services/PlaybackService');

describe('PlaybackService', () => {
  let ctx;
  let service;
  let mockWindow;

  beforeEach(() => {
    ctx = {
      store: {
        get: jest.fn(),
        set: jest.fn(),
      },
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
      getMainWindow: jest.fn(),
      getManager: jest.fn(),
    };

    mockWindow = {
      webContents: {
        executeJavaScript: jest.fn(),
      },
    };

    ctx.getMainWindow.mockReturnValue(mockWindow);

    service = new PlaybackService(ctx);
  });

  describe('setSpeed', () => {
    it('should set playback speed successfully', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue({
        success: true,
        speed: 1.5,
      });

      const result = await service.setSpeed(1.5);

      expect(result).toBe(true);
      expect(ctx.store.set).toHaveBeenCalledWith('playbackSpeed', 1.5);
      expect(mockWindow.webContents.executeJavaScript).toHaveBeenCalled();
    });

    it('should clamp speed to valid range', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue({
        success: true,
        speed: 4.0,
      });

      await service.setSpeed(10.0);

      const executeCall = mockWindow.webContents.executeJavaScript.mock.calls[0][0];
      expect(executeCall).toContain('4');
    });

    it('should handle errors gracefully', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue({
        error: 'No video element found',
      });

      const result = await service.setSpeed(1.5);

      expect(result).toBe(false);
      expect(ctx.logger.error).toHaveBeenCalled();
    });
  });

  describe('cycleSpeed', () => {
    it('should cycle to next speed', async () => {
      ctx.store.get.mockReturnValue(1.0);
      mockWindow.webContents.executeJavaScript.mockResolvedValue({
        success: true,
        speed: 1.25,
      });

      await service.cycleSpeed(1);

      expect(mockWindow.webContents.executeJavaScript).toHaveBeenCalled();
    });

    it('should not cycle beyond max speed', async () => {
      ctx.store.get.mockReturnValue(4.0);
      mockWindow.webContents.executeJavaScript.mockResolvedValue({
        success: true,
        speed: 4.0,
      });

      await service.cycleSpeed(1);

      const executeCall = mockWindow.webContents.executeJavaScript.mock.calls[0][0];
      expect(executeCall).toContain('4');
    });
  });

  describe('togglePlayPause', () => {
    it('should play paused video', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue({
        action: 'play',
      });

      const result = await service.togglePlayPause();

      expect(result).toEqual({ action: 'play' });
      expect(ctx.logger.debug).toHaveBeenCalledWith('Video play');
    });

    it('should pause playing video', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue({
        action: 'pause',
      });

      const result = await service.togglePlayPause();

      expect(result).toEqual({ action: 'pause' });
      expect(ctx.logger.debug).toHaveBeenCalledWith('Video pause');
    });
  });
  describe('setVolume', () => {
    beforeEach(() => {
      mockWindow.webContents.sendInputEvent = jest.fn();
    });

    it('should set an absolute level without notifying', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue({ volume: 0.4, muted: false });

      const result = await service.setVolume(0.4);

      expect(result).toEqual({ volume: 0.4, muted: false });
      expect(mockWindow.webContents.executeJavaScript.mock.calls[0][0]).toContain(
        'video.volume = 0.4'
      );
    });

    it('should clamp out-of-range levels', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue({ volume: 1, muted: false });

      await service.setVolume(5);
      expect(mockWindow.webContents.executeJavaScript.mock.calls[0][0]).toContain(
        'video.volume = 1'
      );

      await service.setVolume(-2);
      expect(mockWindow.webContents.executeJavaScript.mock.calls[1][0]).toContain(
        'video.volume = 0'
      );
    });

    it('should return null when there is no window', async () => {
      ctx.getMainWindow.mockReturnValue(null);
      expect(await service.setVolume(0.5)).toBeNull();
    });

    it('should swallow a page error', async () => {
      mockWindow.webContents.executeJavaScript.mockRejectedValue(new Error('gone'));

      expect(await service.setVolume(0.5)).toBeNull();
      expect(ctx.logger.error).toHaveBeenCalled();
    });
  });

  describe('nextEpisode', () => {
    beforeEach(() => {
      mockWindow.webContents.sendInputEvent = jest.fn();
    });

    it('should click the next-episode control when it is on screen', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue({ status: 'clicked' });

      const result = await service.nextEpisode();

      expect(result).toEqual({ status: 'clicked' });
      expect(mockWindow.webContents.sendInputEvent).not.toHaveBeenCalled();
    });

    it('should fall back to Shift+N when the control is hidden', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue({ status: 'unavailable' });

      const result = await service.nextEpisode();

      expect(result).toEqual({ status: 'keyboard' });
      expect(mockWindow.webContents.sendInputEvent).toHaveBeenCalledTimes(3);
      expect(mockWindow.webContents.sendInputEvent).toHaveBeenCalledWith({
        type: 'keyDown',
        keyCode: 'N',
        modifiers: ['shift'],
      });
    });

    it('should swallow a page error', async () => {
      mockWindow.webContents.executeJavaScript.mockRejectedValue(new Error('gone'));

      expect(await service.nextEpisode()).toBeNull();
      expect(ctx.logger.error).toHaveBeenCalled();
    });
  });
});
