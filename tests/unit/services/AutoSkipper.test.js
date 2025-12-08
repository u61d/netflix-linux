const AutoSkipper = require('../../../src/main/services/AutoSkipper');

describe('AutoSkipper', () => {
  let ctx;
  let service;
  let mockWindow;

  beforeEach(() => {
    jest.useFakeTimers();

    ctx = {
      store: {
        get: jest.fn(),
      },
      logger: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      getMainWindow: jest.fn(),
    };

    mockWindow = {
      webContents: {
        executeJavaScript: jest.fn(),
      },
    };

    ctx.getMainWindow.mockReturnValue(mockWindow);

    service = new AutoSkipper(ctx);
  });

  afterEach(() => {
    jest.useRealTimers();
    if (service.interval) {
      service.stop();
    }
  });

  describe('start', () => {
    it('should start interval successfully', () => {
      service.start();

      expect(service.interval).not.toBeNull();
      expect(ctx.logger.info).toHaveBeenCalledWith('AutoSkipper started');
    });

    it('should not start multiple intervals', () => {
      service.start();
      const firstInterval = service.interval;

      service.start();
      expect(service.interval).toBe(firstInterval);
    });
  });

  describe('stop', () => {
    it('should stop interval', () => {
      service.start();
      expect(service.interval).not.toBeNull();

      service.stop();
      expect(service.interval).toBeNull();
      expect(ctx.logger.info).toHaveBeenCalledWith('AutoSkipper stopped');
    });

    it('should handle stopping when not started', () => {
      service.stop();
      expect(service.interval).toBeNull();
    });
  });

  describe('tick', () => {
    beforeEach(() => {
      ctx.store.get.mockImplementation((key, defaultValue) => {
        const settings = {
          autoSkipIntro: true,
          autoSkipCredits: false,
          autoNextEpisode: false,
        };
        return settings[key] !== undefined ? settings[key] : defaultValue;
      });
    });

    it('should click intro skip button when found', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue(
        '[data-uia="player-skip-intro"]'
      );

      service.start();
      jest.advanceTimersByTime(500);

      await Promise.resolve();

      expect(mockWindow.webContents.executeJavaScript).toHaveBeenCalled();
      expect(ctx.logger.debug).toHaveBeenCalledWith(
        'Auto-clicked:',
        expect.any(String)
      );
    });

    it('should not click if no buttons found', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue(null);

      service.start();
      jest.advanceTimersByTime(500);

      await Promise.resolve();

      expect(ctx.logger.debug).not.toHaveBeenCalledWith(
        'Auto-clicked:',
        expect.any(String)
      );
    });

    it('should check all selectors based on settings', async () => {
      ctx.store.get.mockImplementation((key) => {
        return key === 'autoSkipIntro' || key === 'autoSkipCredits';
      });

      mockWindow.webContents.executeJavaScript.mockResolvedValue(null);

      service.start();
      jest.advanceTimersByTime(500);

      await Promise.resolve();

      const call = mockWindow.webContents.executeJavaScript.mock.calls[0][0];
      expect(call).toContain('player-skip-intro');
      expect(call).toContain('skip-credits');
    });

    it('should handle executeJavaScript errors gracefully', async () => {
      mockWindow.webContents.executeJavaScript.mockRejectedValue(
        new Error('Navigation failed')
      );

      service.start();
      jest.advanceTimersByTime(500);

      await Promise.resolve();
      expect(service.interval).not.toBeNull();
    });

    it('should return early if no main window', async () => {
      ctx.getMainWindow.mockReturnValue(null);

      service.start();
      jest.advanceTimersByTime(500);

      await Promise.resolve();

      expect(mockWindow.webContents.executeJavaScript).not.toHaveBeenCalled();
    });
  });

  describe('validateSelectors', () => {
    it('should validate selectors periodically', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue({
        '[data-uia="player-skip-intro"]': true,
        'button[aria-label="Skip Intro"]': true,
      });

      await service.validateSelectors();

      expect(mockWindow.webContents.executeJavaScript).toHaveBeenCalled();
      expect(ctx.logger.debug).toHaveBeenCalledWith(
        'All skip selectors validated successfully'
      );
    });

    it('should warn about invalid selectors', async () => {
      mockWindow.webContents.executeJavaScript.mockResolvedValue({
        '[data-uia="player-skip-intro"]': false,
        'button[aria-label="Skip Intro"]': false,
      });

      await service.validateSelectors();

      expect(ctx.logger.warn).toHaveBeenCalledWith(
        'Some skip selectors may be outdated:',
        expect.any(Array)
      );
    });

    it('should not validate more than once per hour', async () => {
      const now = Date.now();
      service.lastValidation = now - 1000;

      await service.validateSelectors();

      expect(mockWindow.webContents.executeJavaScript).not.toHaveBeenCalled();
    });

    it('should validate after 1 hour', async () => {
      const now = Date.now();
      service.lastValidation = now - 3600001;

      mockWindow.webContents.executeJavaScript.mockResolvedValue({});

      await service.validateSelectors();

      expect(mockWindow.webContents.executeJavaScript).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should stop service on cleanup', () => {
      service.start();
      expect(service.interval).not.toBeNull();

      service.cleanup();

      expect(service.interval).toBeNull();
    });
  });
});