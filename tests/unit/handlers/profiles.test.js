const { ipcMain } = require('electron');
const setupProfilesHandlers = require('../../../src/main/handlers/profiles');

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
  },
}));

describe('Profiles Handlers', () => {
  let ctx;
  let win;

  beforeEach(() => {
    jest.clearAllMocks();

    win = {
      loadURL: jest.fn().mockResolvedValue(undefined),
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: {
        session: {
          clearStorageData: jest.fn().mockResolvedValue(undefined),
        },
      },
    };

    ctx = {
      store: {
        get: jest.fn(),
        set: jest.fn(),
      },
      logger: {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      },
      getMainWindow: jest.fn().mockReturnValue(win),
    };

    setupProfilesHandlers(ctx);
  });

  function getHandler(channel) {
    const call = ipcMain.handle.mock.calls.find(([name]) => name === channel);
    return call ? call[1] : null;
  }

  describe('switch-profile', () => {
    beforeEach(() => {
      ctx.store.get.mockImplementation((key, fallback) => {
        if (key === 'profiles') {
          return {
            default: { name: 'Default', url: 'https://www.netflix.com/' },
            work: { name: 'Work', url: 'https://www.netflix.com/work' },
          };
        }
        if (key === 'currentProfile') return 'default';
        return fallback;
      });
    });

    it('should reject non-existent profile', async () => {
      const handler = getHandler('switch-profile');

      await expect(handler(null, 'nonexistent')).rejects.toThrow(
        /Profile "nonexistent" not found\. Available profiles:/
      );
    });

    it('should sanitize profile ID', async () => {
      const handler = getHandler('switch-profile');
      await expect(
        handler(null, 'work<script>alert(1)</script>')
      ).rejects.toThrow(/Profile .* not found\. Available profiles:/);
    });
  });
});