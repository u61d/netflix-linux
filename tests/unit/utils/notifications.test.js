const NotificationService = require('../../../src/main/utils/notifications');
const { Notification } = require('electron');
const notifier = require('node-notifier');

jest.mock('electron', () => ({
  Notification: jest.fn().mockImplementation(() => ({
    show: jest.fn(),
  })),
}));

jest.mock('node-notifier', () => ({
  notify: jest.fn(),
}));

describe('NotificationService', () => {
  let ctx;
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    ctx = {
      store: {
        get: jest.fn(),
      },
    };

    service = new NotificationService(ctx);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('notify', () => {
    it('should show notification when enabled', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'notificationsEnabled') return true;
        if (key === 'quietMode') return false;
      });

      service.notify({
        title: 'Test',
        body: 'Test body',
        priority: 'high',
      });

      jest.advanceTimersByTime(1000);

      expect(Notification).toHaveBeenCalled();
    });

    it('should not show notification when disabled', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'notificationsEnabled') return false;
      });

      service.notify({
        title: 'Test',
        body: 'Test body',
      });

      jest.advanceTimersByTime(1000);

      expect(Notification).not.toHaveBeenCalled();
    });

    it('should respect quiet mode for low priority', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'notificationsEnabled') return true;
        if (key === 'quietMode') return true;
      });

      service.notify({
        title: 'Low priority',
        body: 'Should not show',
        priority: 'low',
      });

      jest.advanceTimersByTime(1000);

      expect(Notification).not.toHaveBeenCalled();
    });

    it('should show high priority in quiet mode', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'notificationsEnabled') return true;
        if (key === 'quietMode') return true;
      });

      service.notify({
        title: 'High priority',
        body: 'Should show',
        priority: 'high',
      });

      jest.advanceTimersByTime(1000);

      expect(Notification).toHaveBeenCalled();
    });

    it('should debounce low priority notifications', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'notificationsEnabled') return true;
        if (key === 'quietMode') return false;
      });
      service.notify({
        title: 'Test',
        body: 'Same message',
        priority: 'low',
      });

      service.notify({
        title: 'Test',
        body: 'Same message',
        priority: 'low',
      });

      service.notify({
        title: 'Test',
        body: 'Same message',
        priority: 'low',
      });

      jest.advanceTimersByTime(500);
      expect(Notification).toHaveBeenCalledTimes(1);
    });

    it('should not debounce high priority notifications', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'notificationsEnabled') return true;
        if (key === 'quietMode') return false;
      });

      service.notify({
        title: 'Critical',
        body: 'First',
        priority: 'high',
      });

      service.notify({
        title: 'Critical',
        body: 'Second',
        priority: 'high',
      });

      jest.advanceTimersByTime(100);

      expect(Notification).toHaveBeenCalledTimes(2);
    });

    it('should include icon when provided', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'notificationsEnabled') return true;
        if (key === 'quietMode') return false;
      });

      service.notify({
        title: 'Test',
        body: 'With icon',
        icon: '../../../assets/icons/icon.png',
        priority: 'high',
      });

      jest.advanceTimersByTime(100);

      const notificationInstance = Notification.mock.results[0].value;
      expect(Notification).toHaveBeenCalledWith(
        expect.objectContaining({
          icon: '../../../assets/icons/icon.png',
        })
      );
    });

    it('should default to silent notifications', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'notificationsEnabled') return true;
        if (key === 'quietMode') return false;
      });

      service.notify({
        title: 'Test',
        body: 'Silent by default',
        priority: 'high',
      });

      jest.advanceTimersByTime(100);

      expect(Notification).toHaveBeenCalledWith(
        expect.objectContaining({
          silent: true,
        })
      );
    });

    it('should fallback to node-notifier on electron error', () => {
      ctx.store.get.mockImplementation((key) => {
        if (key === 'notificationsEnabled') return true;
        if (key === 'quietMode') return false;
      });

      Notification.mockImplementationOnce(() => {
        throw new Error('Electron notification failed');
      });

      service.notify({
        title: 'Fallback',
        body: 'Should use node-notifier',
        priority: 'high',
      });

      jest.advanceTimersByTime(100);

      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Fallback',
          message: 'Should use node-notifier',
        })
      );
    });
  });

  describe('showNotification', () => {
    it('should create Electron notification', () => {
      service.showNotification('Title', 'Body', null, true);

      expect(Notification).toHaveBeenCalledWith({
        title: 'Title',
        body: 'Body',
        silent: true,
      });

      const instance = Notification.mock.results[0].value;
      expect(instance.show).toHaveBeenCalled();
    });

    it('should include icon when provided', () => {
      service.showNotification('Title', 'Body', '/icon.png', false);

      expect(Notification).toHaveBeenCalledWith({
        title: 'Title',
        body: 'Body',
        icon: '/icon.png',
        silent: false,
      });
    });
  });
});
