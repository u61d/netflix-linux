const fs = require('fs');
const { shell, clipboard } = require('electron');
const { execSync } = require('child_process');
const ScreenshotService = require('../../../src/main/services/ScreenshotService');

jest.mock('fs');
jest.mock('electron', () => ({
  shell: {
    showItemInFolder: jest.fn(),
    openPath: jest.fn(),
  },
  clipboard: {
    writeImage: jest.fn(),
  },
}));
jest.mock('child_process');

describe('ScreenshotService', () => {
  let ctx;
  let service;
  let mockWindow;
  let mockImage;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockImage = {
      toPNG: jest.fn().mockReturnValue(Buffer.from('fake-png-data')),
    };

    mockWindow = {
      webContents: {
        capturePage: jest.fn().mockResolvedValue(mockImage),
        getTitle: jest.fn().mockResolvedValue('Test Show - S01E01'),
      },
    };

    ctx = {
      store: {
        get: jest.fn((key) => {
          if (key === 'screenshotsDir') return '/home/user/Screenshots';
          if (key === 'screenshotSound') return false;
          if (key === 'screenshotNotification') return true;
          return null;
        }),
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      },
      getMainWindow: jest.fn().mockReturnValue(mockWindow),
    };

    fs.existsSync.mockReturnValue(true);
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});

    service = new ScreenshotService(ctx);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('ensureDirectory', () => {
    it('should return existing directory', () => {
      fs.existsSync.mockReturnValue(true);

      const dir = service.ensureDirectory();

      expect(dir).toBe('/home/user/Screenshots');
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should create missing directory', () => {
      fs.existsSync.mockReturnValue(false);

      const dir = service.ensureDirectory();

      expect(fs.mkdirSync).toHaveBeenCalledWith('/home/user/Screenshots', { recursive: true });
      expect(dir).toBe('/home/user/Screenshots');
    });
  });

  describe('capture', () => {
    it('should capture screenshot successfully', async () => {
      const result = await service.capture();

      expect(result).toBe(true);
      expect(mockWindow.webContents.capturePage).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(ctx.logger.info).toHaveBeenCalledWith('Screenshot saved:', expect.any(String));
    });

    it('should sanitize filename', async () => {
      mockWindow.webContents.getTitle.mockResolvedValue('Test<>Show"/\\*?:|');

      await service.capture();

      const writeCall = fs.writeFileSync.mock.calls[0][0];
      expect(writeCall).not.toContain('<');
      expect(writeCall).not.toContain('>');
      expect(writeCall).not.toContain('"');
      expect(writeCall).not.toContain('*');
    });

    it('should include timestamp in filename', async () => {
      await service.capture();

      const writeCall = fs.writeFileSync.mock.calls[0][0];
      expect(writeCall).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
    });

    it('should show notification when enabled', async () => {
      await service.capture();

      jest.advanceTimersByTime(1000);
      expect(shell.showItemInFolder).toHaveBeenCalled();
    });

    it('should not show notification when disabled', async () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'screenshotsDir') return '/home/user/Screenshots';
        if (key === 'screenshotNotification') return false;
        return false;
      });

      await service.capture();

      jest.advanceTimersByTime(1000);
      expect(shell.showItemInFolder).not.toHaveBeenCalled();
    });

    it('should handle capture errors', async () => {
      mockWindow.webContents.capturePage.mockRejectedValue(new Error('Capture failed'));

      const result = await service.capture();

      expect(result).toBe(false);
      expect(ctx.logger.error).toHaveBeenCalledWith('Screenshot error:', expect.any(Error));
    });

    it('should return false when no window', async () => {
      ctx.getMainWindow.mockReturnValue(null);

      const result = await service.capture();

      expect(result).toBe(false);
    });
  });

  describe('captureToClipboard', () => {
    it('should copy screenshot to clipboard', async () => {
      const result = await service.captureToClipboard();

      expect(result).toBe(true);
      expect(clipboard.writeImage).toHaveBeenCalledWith(mockImage);
      expect(ctx.logger.info).toHaveBeenCalledWith('Screenshot copied to clipboard');
    });

    it('should handle clipboard errors', async () => {
      clipboard.writeImage.mockImplementation(() => {
        throw new Error('Clipboard error');
      });

      const result = await service.captureToClipboard();

      expect(result).toBe(false);
      expect(ctx.logger.error).toHaveBeenCalled();
    });
  });

  describe('playSound', () => {
    it('should not play sound when disabled', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'screenshotSound') return false;
      });

      service.playSound();

      expect(execSync).not.toHaveBeenCalled();
    });

    it('should try paplay first', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'screenshotSound') return true;
      });
      execSync.mockImplementation(() => {});

      service.playSound();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('paplay'),
        expect.any(Object)
      );
      expect(service.soundMethod).toBe('paplay');
    });

    it('should fallback to pw-play if paplay fails', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'screenshotSound') return true;
      });
      execSync
        .mockImplementationOnce(() => {
          throw new Error('paplay not found');
        })
        .mockImplementationOnce(() => {});

      service.playSound();

      expect(service.soundMethod).toBe('pw-play');
    });

    it('should cache successful sound method', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'screenshotSound') return true;
      });
      execSync.mockImplementation(() => {});

      service.playSound();
      execSync.mockClear();
      service.playSound();
      
      expect(execSync).toHaveBeenCalledTimes(1);
    });

    it('should fallback to terminal bell if all methods fail', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'screenshotSound') return true;
      });
      execSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      const stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => {});

      service.playSound();

      expect(stdoutWrite).toHaveBeenCalledWith('\x07');
      expect(service.soundMethod).toBe('bell');

      stdoutWrite.mockRestore();
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove special characters', () => {
      const result = service.sanitizeFilename('Test<>Show"/\\*?:|');

      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('"');
      expect(result).not.toContain('/');
    });

    it('should replace spaces with underscores', () => {
      const result = service.sanitizeFilename('Test Show Name');

      expect(result).toBe('Test_Show_Name');
    });

    it('should truncate to 50 characters', () => {
      const longName = 'A'.repeat(100);
      const result = service.sanitizeFilename(longName);

      expect(result.length).toBe(50);
    });

    it('should preserve alphanumeric and basic characters', () => {
      const result = service.sanitizeFilename('Test-Show_123');

      expect(result).toBe('Test-Show_123');
    });
  });
});