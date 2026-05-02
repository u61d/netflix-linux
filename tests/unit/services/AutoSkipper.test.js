const AutoSkipper = require('../../../src/main/services/AutoSkipper');

jest.mock('../../../src/main/utils/notifications', () => {
  return jest.fn().mockImplementation(() => ({
    notify: jest.fn(),
  }));
});

describe('AutoSkipper', () => {
  let ctx;
  let service;
  let mockWindow;

  beforeEach(() => {
    jest.useFakeTimers();

    ctx = {
      store: {
        get: jest.fn((key, fallback) => {
          const settings = {
            autoSkipIntro: true,
            autoSkipRecap: true,
            autoSkipCredits: false,
            autoNextEpisode: false,
            selectorHealthAlerts: true,
          };
          return settings[key] !== undefined ? settings[key] : fallback;
        }),
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
    service.stop();
  });

  it('starts once and schedules ticking', () => {
    const validateSpy = jest.spyOn(service, 'validateSelectors').mockResolvedValue(undefined);

    service.start();
    const first = service.interval;
    service.start();

    expect(first).not.toBeNull();
    expect(service.interval).toBe(first);
    expect(validateSpy).toHaveBeenCalledWith(true);
  });

  it('stops cleanly', () => {
    service.start();
    expect(service.interval).not.toBeNull();

    service.stop();

    expect(service.interval).toBeNull();
    expect(ctx.logger.info).toHaveBeenCalledWith('AutoSkipper stopped');
  });

  it('tick checks enabled selectors and clicks matching button', async () => {
    mockWindow.webContents.executeJavaScript.mockResolvedValue('[data-uia="player-skip-intro"]');

    await service.tick();

    expect(mockWindow.webContents.executeJavaScript).toHaveBeenCalled();
    const script = mockWindow.webContents.executeJavaScript.mock.calls[0][0];
    expect(script).toContain('player-skip-intro');
    expect(script).toContain('player-skip-recap');
    expect(script).toContain('Continue Playing');
  });

  it('runSelectorHealthCheck returns diagnostic summary', async () => {
    mockWindow.webContents.executeJavaScript.mockResolvedValue([
      { key: 'intro', selector: '.intro', exists: true, matchCount: 1 },
      { key: 'recap', selector: '.recap', exists: false, matchCount: 0 },
    ]);

    const result = await service.runSelectorHealthCheck();

    expect(result.total).toBe(2);
    expect(result.valid).toBe(1);
    expect(result.invalid).toBe(1);
    expect(Array.isArray(result.selectors)).toBe(true);
  });

  it('validateSelectors warns when invalid selectors are found', async () => {
    jest.spyOn(service, 'runSelectorHealthCheck').mockResolvedValue({
      checkedAt: new Date().toISOString(),
      total: 2,
      valid: 1,
      invalid: 1,
      selectors: [
        { key: 'intro', selector: '.intro', exists: false, matchCount: 0 },
        { key: 'recap', selector: '.recap', exists: true, matchCount: 1 },
      ],
    });

    await service.validateSelectors(true);

    expect(ctx.logger.warn).toHaveBeenCalledWith(
      'Some skip selectors may be outdated:',
      expect.arrayContaining(['intro: .intro'])
    );
  });

  it('validateSelectors throttles checks to once per hour unless forced', async () => {
    const runSpy = jest.spyOn(service, 'runSelectorHealthCheck').mockResolvedValue({
      checkedAt: new Date().toISOString(),
      total: 0,
      valid: 0,
      invalid: 0,
      selectors: [],
    });

    service.lastValidation = Date.now() - 1000;
    await service.validateSelectors();
    expect(runSpy).not.toHaveBeenCalled();

    await service.validateSelectors(true);
    expect(runSpy).toHaveBeenCalledTimes(1);
  });
});
