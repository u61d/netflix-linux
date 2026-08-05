const mockNotify = jest.fn();
jest.mock('../../../src/main/utils/notifications', () =>
  jest.fn().mockImplementation(() => ({ notify: mockNotify }))
);

const HealthReminder = require('../../../src/main/services/HealthReminder');

describe('HealthReminder', () => {
  let ctx;
  let reminder;
  let playbackService;
  let storeOverrides;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(0);

    storeOverrides = { healthReminder: true, reminderInterval: 60 };
    playbackService = { getState: jest.fn().mockResolvedValue({ playing: true }) };

    ctx = {
      store: {
        get: jest.fn((key, fallback) =>
          storeOverrides[key] !== undefined ? storeOverrides[key] : fallback
        ),
      },
      logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      getService: jest.fn((name) => (name === 'playback' ? playbackService : null)),
    };

    reminder = new HealthReminder(ctx);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start', () => {
    it('does nothing when the setting is disabled', () => {
      storeOverrides.healthReminder = false;
      reminder.start();
      expect(reminder.interval).toBeNull();
    });

    it('does nothing if already running', () => {
      reminder.start();
      const firstInterval = reminder.interval;
      reminder.start();
      expect(reminder.interval).toBe(firstInterval);
    });

    it('resets tracking state and starts a 60s poll', () => {
      reminder.start();
      expect(reminder.totalWatchTime).toBe(0);
      expect(reminder.isPaused).toBe(false);
      expect(reminder.interval).not.toBeNull();

      jest.spyOn(reminder, 'check').mockImplementation(() => {});
      jest.advanceTimersByTime(60000);
      expect(reminder.check).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('clears the interval and resets watch time', () => {
      reminder.start();
      reminder.stop();

      expect(reminder.interval).toBeNull();
      expect(reminder.watchStartTime).toBeNull();
      expect(reminder.totalWatchTime).toBe(0);
    });

    it('is a no-op when not running', () => {
      expect(() => reminder.stop()).not.toThrow();
    });
  });

  describe('check', () => {
    it('does nothing when there is no playback service', async () => {
      ctx.getService.mockReturnValue(null);
      reminder.start();

      await expect(reminder.check()).resolves.toBeUndefined();
    });

    it('does nothing when playback state is unavailable', async () => {
      playbackService.getState.mockResolvedValue(null);
      reminder.start();

      await reminder.check();
      expect(reminder.totalWatchTime).toBe(0);
    });

    it('accumulates elapsed time while playing', async () => {
      reminder.start();
      jest.setSystemTime(30000);

      await reminder.check();

      expect(reminder.totalWatchTime).toBe(30000);
      expect(reminder.isPaused).toBe(false);
    });

    it('marks paused and stops accumulating when not playing', async () => {
      playbackService.getState.mockResolvedValue({ playing: false });
      reminder.start();
      jest.setSystemTime(30000);

      await reminder.check();

      expect(reminder.totalWatchTime).toBe(0);
      expect(reminder.isPaused).toBe(true);
    });

    it('fires a notification once total watched minutes hits the interval', async () => {
      storeOverrides.reminderInterval = 1;
      reminder.start();

      jest.setSystemTime(60000);
      await reminder.check();

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Health Reminder' })
      );
    });

    it('does not fire again for a minute that is not a multiple of the interval', async () => {
      storeOverrides.reminderInterval = 60;
      reminder.start();

      jest.setSystemTime(30 * 60000); // 30 minutes elapsed, interval is 60
      await reminder.check();

      expect(mockNotify).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('clears accumulated watch time and pause state', () => {
      reminder.start();
      reminder.totalWatchTime = 12345;
      reminder.isPaused = true;

      reminder.reset();

      expect(reminder.totalWatchTime).toBe(0);
      expect(reminder.isPaused).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('stops the reminder', () => {
      reminder.start();
      reminder.cleanup();
      expect(reminder.interval).toBeNull();
    });
  });
});
