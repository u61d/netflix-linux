const { Notification } = require('electron');
const notifier = require('node-notifier');

class NotificationService {
  constructor(ctx) {
    this.ctx = ctx;
    this.debounceTimers = new Map();
  }

  notify({ title, body, icon = null, silent = true, priority = 'low' }) {
    const { store } = this.ctx;

    if (!store.get('notificationsEnabled')) {
      return;
    }

    if (store.get('quietMode') && priority !== 'high') {
      return;
    }

    if (priority === 'low') {
      const key = `${title}:${body}`;

      if (this.debounceTimers.has(key)) {
        clearTimeout(this.debounceTimers.get(key));
      }

      this.debounceTimers.set(
        key,
        setTimeout(() => {
          this.showNotification(title, body, icon, silent);
          this.debounceTimers.delete(key);
        }, 500)
      );
    } else {
      this.showNotification(title, body, icon, silent);
    }
  }

  showNotification(title, body, icon, silent) {
    try {
      const options = { title, body, silent };
      if (icon) options.icon = icon;

      new Notification(options).show();
    } catch (error) {
      const options = { title, message: body, sound: !silent };
      if (icon) options.icon = icon;

      notifier.notify(options);
    }
  }
}

module.exports = NotificationService;
