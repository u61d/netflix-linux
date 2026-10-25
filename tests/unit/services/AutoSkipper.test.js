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
    mockWindow.webContents.executeJavaScript.mockResolvedValue({
      playing: true,
      entries: [
        { key: 'title', selector: 'h4', exists: false, matchCount: 0, required: true },
        { key: 'intro', selector: '.intro', exists: true, matchCount: 1, required: false },
        { key: 'recap', selector: '.recap', exists: false, matchCount: 0, required: false },
      ],
    });

    const result = await service.runSelectorHealthCheck();

    expect(result.total).toBe(3);
    expect(result.present).toBe(1);
    expect(result.invalid).toBe(1); // only the required one counts
    expect(result.valid).toBe(2);
    expect(result.playing).toBe(true);
  });

  // a Skip Intro button is only in the DOM during the intro, so its absence
  // is not a broken selector
  it('runSelectorHealthCheck does not count transient selectors as invalid', async () => {
    mockWindow.webContents.executeJavaScript.mockResolvedValue({
      playing: true,
      entries: [
        { key: 'intro', selector: '.intro', exists: false, matchCount: 0, required: false },
        { key: 'recap', selector: '.recap', exists: false, matchCount: 0, required: false },
      ],
    });

    const result = await service.runSelectorHealthCheck();

    expect(result.invalid).toBe(0);
  });

  it('asks the page about the title selectors too, not just the skip ones', async () => {
    mockWindow.webContents.executeJavaScript.mockResolvedValue({ playing: false, entries: [] });

    await service.runSelectorHealthCheck();

    const script = mockWindow.webContents.executeJavaScript.mock.calls[0][0];
    expect(script).toContain('video-title');
    expect(script).toContain('video-meta');
    expect(script).toContain('requiredWhilePlaying');
  });

  it('validateSelectors warns when a required selector is missing', async () => {
    jest.spyOn(service, 'runSelectorHealthCheck').mockResolvedValue({
      checkedAt: new Date().toISOString(),
      playing: true,
      total: 2,
      present: 1,
      valid: 1,
      invalid: 1,
      selectors: [
        { key: 'title', selector: 'h4', exists: false, matchCount: 0, required: true },
        { key: 'recap', selector: '.recap', exists: true, matchCount: 1, required: false },
      ],
    });

    await service.validateSelectors(true);

    expect(ctx.logger.warn).toHaveBeenCalledWith(
      'Some selectors may be outdated:',
      expect.arrayContaining(['title: h4'])
    );
  });

  // this is what used to fire a warning on every launch
  it('validateSelectors says nothing when no video is playing', async () => {
    jest.spyOn(service, 'runSelectorHealthCheck').mockResolvedValue({
      checkedAt: new Date().toISOString(),
      playing: false,
      total: 8,
      present: 0,
      valid: 8,
      invalid: 0,
      selectors: [],
    });

    await service.validateSelectors(true);

    expect(ctx.logger.warn).not.toHaveBeenCalled();
    expect(service.lastValidation).toBe(0); // throttle untouched, so it retries
  });

  it('validateSelectors retries once playback starts', async () => {
    const run = jest
      .spyOn(service, 'runSelectorHealthCheck')
      .mockResolvedValue({
        playing: false,
        total: 0,
        present: 0,
        valid: 0,
        invalid: 0,
        selectors: [],
      });

    await service.validateSelectors(true);
    service.lastValidationAttempt = 0; // as if a minute had passed
    await service.validateSelectors();

    expect(run).toHaveBeenCalledTimes(2);
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
