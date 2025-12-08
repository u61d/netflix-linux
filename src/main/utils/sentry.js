const Sentry = require('@sentry/electron/main');
const { app } = require('electron');

class SentryManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.enabled = false;
  }

  init() {
    const userConsent = this.ctx.store.get('sentryEnabled', false);
    const dsn = process.env.SENTRY_DSN;

    if (!dsn) {
      this.ctx.logger.warn('Sentry disabled - missing SENTRY_DSN');
      return;
    }

    if (!userConsent) {
      this.ctx.logger.info('Sentry disabled - user has not opted in');
      return;
    }

    try {
      Sentry.init({
        dsn,
        release: `netflix-linux@${app.getVersion()}`,
        environment: process.env.NODE_ENV || 'production',

        beforeSend: (event) => {
          if (event.user) {
            delete event.user.ip_address;
            delete event.user.email;
            delete event.user.username;
          }

          if (event.breadcrumbs) {
            event.breadcrumbs = event.breadcrumbs.map((crumb) => {
              if (crumb.data) {
                delete crumb.data.url;
                delete crumb.data.headers;
              }
              return crumb;
            });
          }

          if (event.exception && event.exception.values) {
            event.exception.values = event.exception.values.map((exception) => {
              if (exception.stacktrace && exception.stacktrace.frames) {
                exception.stacktrace.frames = exception.stacktrace.frames.map((frame) => {
                  if (frame.filename) {
                    frame.filename = frame.filename
                      .replace(/\/home\/[^/]+/g, '/home/user')
                      .replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\user');
                  }
                  return frame;
                });
              }
              return exception;
            });
          }

          return event;
        },

        sampleRate: 0.1,
        sendDefaultPii: false,

        ignoreErrors: [
          'Non-Error promise rejection captured',
          'ResizeObserver loop limit exceeded',
          'Network request failed',
          'Failed to fetch',
        ],

        maxBreadcrumbs: 30,
      });

      Sentry.setUser({
        id: this.getAnonymousId(),
      });

      Sentry.setTag('platform', process.platform);
      Sentry.setTag('arch', process.arch);
      Sentry.setTag('electron', process.versions.electron);
      Sentry.setTag('chrome', process.versions.chrome);

      this.enabled = true;
      this.ctx.logger.info('Sentry initialized (user opted in)');
    } catch (error) {
      this.ctx.logger.error('Failed to initialize Sentry:', error);
    }
  }

  getAnonymousId() {
    let id = this.ctx.store.get('anonymousId');
    if (!id) {
      id = require('crypto').randomBytes(16).toString('hex');
      this.ctx.store.set('anonymousId', id);
    }
    return id;
  }

  captureException(error, context = {}) {
    if (!this.enabled) {
      this.ctx.logger.error('Error (Sentry disabled):', error);
      return;
    }

    Sentry.captureException(error, {
      contexts: {
        app: {
          version: app.getVersion(),
          ...context,
        },
      },
    });
  }

  captureMessage(message, level = 'info') {
    if (!this.enabled) {
      this.ctx.logger[level](`Message (Sentry disabled): ${message}`);
      return;
    }

    Sentry.captureMessage(message, level);
  }

  addBreadcrumb(breadcrumb) {
    if (!this.enabled) return;

    Sentry.addBreadcrumb({
      ...breadcrumb,
      timestamp: Date.now() / 1000,
    });
  }

  setUserContent(enabled) {
    this.ctx.store.set('sentryEnabled', enabled);

    if (enabled && !this.enabled) {
      this.init();
    } else if (!enabled && this.enabled) {
      Sentry.close();
      this.enabled = false;
      this.ctx.logger.info('Sentry disabled by user');
    }
  }

  async cleanup() {
    if (this.enabled) {
      await Sentry.close();
      this.enabled = false;
    }
  }
}

module.exports = SentryManager;
