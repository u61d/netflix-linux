const { SKIP_SELECTORS } = require('../../config/selectors');

class AutoSkipper {
  constructor(ctx) {
    this.ctx = ctx;
    this.interval = null;
    this.selectorCache = null;
    this.lastValidation = 0;
  }

  start() {
    if (this.interval) return;

    this.validateSelectors();

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
    const autoSkipCredits = store.get('autoSkipCredits', false);
    const autoNextEpisode = store.get('autoNextEpisode', false);

    const selectorsToCheck = [];

    if (autoSkipIntro) {
      selectorsToCheck.push(SKIP_SELECTORS.intro, SKIP_SELECTORS.recap);
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

  async validateSelectors() {
    const now = Date.now();

    if (this.lastValidation && now - this.lastValidation < 3600000) {
      return;
    }

    this.lastValidation = now;

    const win = this.ctx.getMainWindow();
    if (!win) return;

    const script = `
      (function() {
        const selectors = ${JSON.stringify(Object.values(SKIP_SELECTORS))};
        const results = {};
        for (const selector of selectors) {
          results[selector] = document.querySelectorAll(selector).length > 0;
        }
        return results;
      })();
    `;

    try {
      const results = await win.webContents.executeJavaScript(script, true);
      const invalid = Object.entries(results)
        .filter(([_, exists]) => !exists)
        .map(([selector]) => selector);

      if (invalid.length > 0) {
        this.ctx.logger.warn('Some skip selectors may be outdated:', invalid);
      } else {
        this.ctx.logger.debug('All skip selectors validated successfully');
      }
    } catch (error) {
      this.ctx.logger.error('Selector validation failed:', error);
    }
  }

  cleanup() {
    this.stop();
  }
}

module.exports = AutoSkipper;
