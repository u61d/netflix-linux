const SubtitleStyleService = require('../../../src/main/services/SubtitleStyleService');

describe('SubtitleStyleService', () => {
  let ctx;
  let service;
  let mockWindow;
  let storeValues;

  beforeEach(() => {
    storeValues = {
      subtitleCustomizationEnabled: true,
      subtitleFontSize: 'large',
      subtitleFontFamily: 'sans',
      subtitleTextColor: '#ffff00',
      subtitleBackgroundColor: '#000000',
      subtitleBackgroundOpacity: 50,
      subtitleEdgeStyle: 'outline',
      subtitleVerticalOffset: -20,
    };

    ctx = {
      store: {
        get: jest.fn((key, fallback) =>
          storeValues[key] !== undefined ? storeValues[key] : fallback
        ),
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
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: {
        insertCSS: jest.fn().mockResolvedValue('css-key-1'),
        removeInsertedCSS: jest.fn().mockResolvedValue(undefined),
        executeJavaScript: jest.fn(),
      },
    };

    ctx.getMainWindow.mockReturnValue(mockWindow);
    service = new SubtitleStyleService(ctx);
  });

  it('does nothing (but succeeds) when customization is disabled', async () => {
    storeValues.subtitleCustomizationEnabled = false;

    const result = await service.apply();

    expect(result).toBe(true);
    expect(mockWindow.webContents.insertCSS).not.toHaveBeenCalled();
  });

  it('builds CSS using the configured colors, size, and offset', async () => {
    await service.apply();

    expect(mockWindow.webContents.insertCSS).toHaveBeenCalledTimes(1);
    const css = mockWindow.webContents.insertCSS.mock.calls[0][0];

    expect(css).toContain('.player-timedtext-text-container');
    expect(css).toContain('translateY(-20px)');
    expect(css).toContain('font-size: 36px'); // large
    expect(css).toContain('color: #ffff00');
    expect(css).toContain('rgba(0, 0, 0, 0.5)'); // 50% opacity black background
  });

  it('removes previously inserted CSS before inserting new CSS', async () => {
    await service.apply();
    expect(service.insertedKey).toBe('css-key-1');

    mockWindow.webContents.insertCSS.mockResolvedValueOnce('css-key-2');
    await service.apply();

    expect(mockWindow.webContents.removeInsertedCSS).toHaveBeenCalledWith('css-key-1');
    expect(service.insertedKey).toBe('css-key-2');
  });

  it('returns false and logs when insertCSS throws', async () => {
    mockWindow.webContents.insertCSS.mockRejectedValueOnce(new Error('boom'));

    const result = await service.apply();

    expect(result).toBe(false);
    expect(ctx.logger.error).toHaveBeenCalled();
  });

  it('returns false when there is no main window', async () => {
    ctx.getMainWindow.mockReturnValue(null);

    const result = await service.apply();

    expect(result).toBe(false);
  });

  it('checkSelectorHealth reports found counts from the page', async () => {
    mockWindow.webContents.executeJavaScript.mockResolvedValue({
      containerFound: 1,
      textContainerFound: 2,
    });

    const result = await service.checkSelectorHealth();

    expect(result.containerFound).toBe(1);
    expect(result.textContainerFound).toBe(2);
    expect(result.note).toContain('found subtitle elements');
  });

  it('checkSelectorHealth flags zero matches with a helpful note', async () => {
    mockWindow.webContents.executeJavaScript.mockResolvedValue({
      containerFound: 0,
      textContainerFound: 0,
    });

    const result = await service.checkSelectorHealth();

    expect(result.note).toMatch(/turned on/i);
  });
});
