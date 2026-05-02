const { SKIP_SELECTORS } = require('../../config/selectors');

class AutoSkipper {
  constructor(ctx) {
    this.ctx = ctx;
    this.interval = null;
    this.lastValidation = 0;
    this.lastValidationResult = null;
  }

  start() {
    if (this.interval) return;

    this.validateSelectors(true);

    this.interval = setInterval(async () => {
      await this.tick();
    }, 500);

    this.ctx.logger.info('AutoSkipper started');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.ctx.logger.info('AutoSkipper stopped');
    }
  }

  async tick() {
    const win = this.ctx.getMainWindow();
    if (!win) return;

    const { store } = this.ctx;
    const autoSkipIntro = store.get('autoSkipIntro', true);
    const autoSkipRecap = store.get('autoSkipRecap', true);
    const autoSkipCredits = store.get('autoSkipCredits', false);
    const autoNextEpisode = store.get('autoNextEpisode', false);

    const selectorsToCheck = [];

    if (autoSkipIntro) {
      selectorsToCheck.push(SKIP_SELECTORS.intro);
    }
    if (autoSkipRecap) {
      selectorsToCheck.push(SKIP_SELECTORS.recap);
    }
    if (autoSkipCredits) {
      selectorsToCheck.push(SKIP_SELECTORS.credits);
    }
    if (autoNextEpisode) {
      selectorsToCheck.push(SKIP_SELECTORS.nextEpisode);
    }
    selectorsToCheck.push(SKIP_SELECTORS.continueWatching);

    const script = `
      (function() {
        const selectors = ${JSON.stringify(selectorsToCheck)};
        for (const selector of selectors) {
          const btn = document.querySelector(selector);
          if (btn && btn.offsetParent !== null) {
            btn.click();
            return selector;
          }
        }
        return null;
      })();
    `;

    try {
      const clicked = await win.webContents.executeJavaScript(script, true);
      if (clicked) {
        this.ctx.logger.debug('Auto-clicked:', clicked);
      }
    } catch (error) {
      // netflix DOM changes; failures are expected
      this.ctx.logger.debug('Selector check failed:', error.message);
    }
  }

  getSelectorMap() {
    return {
      intro: SKIP_SELECTORS.intro,
      recap: SKIP_SELECTORS.recap,
      credits: SKIP_SELECTORS.credits,
      nextEpisode: SKIP_SELECTORS.nextEpisode,
      continueWatching: SKIP_SELECTORS.continueWatching,
    };
  }

  async runSelectorHealthCheck() {
    const win = this.ctx.getMainWindow();
    if (!win) return null;

    const selectorMap = this.getSelectorMap();
    const script = `
      (function() {
        const selectorMap = ${JSON.stringify(selectorMap)};
        const entries = Object.entries(selectorMap).map(([key, selector]) => {
          const matchCount = document.querySelectorAll(selector).length;
          return {
            key,
            selector,
            exists: matchCount > 0,
            matchCount
          };
        });
        return entries;
      })();
    `;

    try {
      const selectors = await win.webContents.executeJavaScript(script, true);
      const invalid = selectors.filter((entry) => !entry.exists);
      const result = {
        checkedAt: new Date().toISOString(),
        total: selectors.length,
        valid: selectors.length - invalid.length,
        invalid: invalid.length,
        selectors,
      };
      this.lastValidationResult = result;
      return result;
    } catch (error) {
      this.ctx.logger.error('Selector health check failed:', error);
      return {
        checkedAt: new Date().toISOString(),
        total: 0,
        valid: 0,
        invalid: 0,
        selectors: [],
        error: error.message,
      };
    }
  }

  async validateSelectors(force = false) {
    const now = Date.now();

    if (!force && this.lastValidation && now - this.lastValidation < 3600000) {
      return;
    }

    this.lastValidation = now;

    const result = await this.runSelectorHealthCheck();
    if (!result) return;

    const invalidSelectors = result.selectors
      .filter((entry) => !entry.exists)
      .map((entry) => `${entry.key}: ${entry.selector}`);

    if (invalidSelectors.length > 0) {
      this.ctx.logger.warn('Some skip selectors may be outdated:', invalidSelectors);
      if (this.ctx.store.get('selectorHealthAlerts', true)) {
        const NotificationService = require('../utils/notifications');
        const notifier = new NotificationService(this.ctx);
        notifier.notify({
          title: 'Selector Warning',
          body: `${invalidSelectors.length} selector(s) may be outdated`,
          priority: 'high',
        });
      }
    } else {
      this.ctx.logger.debug('All skip selectors validated successfully');
    }
  }

  cleanup() {
    this.stop();
  }
}

module.exports = AutoSkipper;
