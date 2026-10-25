const {
  SKIP_SELECTORS,
  TITLE_SELECTORS,
  META_SELECTORS,
  PLAYER_SELECTORS,
} = require('../../config/selectors');

class AutoSkipper {
  constructor(ctx) {
    this.ctx = ctx;
    this.interval = null;
    this.lastValidation = 0;
    this.lastValidationAttempt = 0;
    this.lastValidationResult = null;
  }

  start() {
    if (this.interval) return;

    this.validateSelectors(true);

    this.interval = setInterval(async () => {
      await this.tick();
      await this.validateSelectors();
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

  // Most of these are transient: a Skip Intro button only exists during the
  // intro, so its absence proves nothing and can't be alerted on. The title
  // block is different — it should be there whenever a video is playing, so
  // if it stops matching the selector has rotted. That is how
  // [data-uia="video-meta"] went stale without anything noticing.
  getSelectorMap() {
    const map = {
      intro: { selector: SKIP_SELECTORS.intro },
      recap: { selector: SKIP_SELECTORS.recap },
      credits: { selector: SKIP_SELECTORS.credits },
      nextEpisode: { selector: SKIP_SELECTORS.nextEpisode },
      continueWatching: { selector: SKIP_SELECTORS.continueWatching },
      playerNextEpisode: { selector: PLAYER_SELECTORS.nextEpisode },
      videoMeta: { selector: META_SELECTORS.videoMeta },
      title: { selector: TITLE_SELECTORS.join(', '), requiredWhilePlaying: true },
    };

    // each title selector on its own too, so the report says which of them
    // still match instead of only that one of them does
    for (const selector of TITLE_SELECTORS) {
      map[`title: ${selector}`] = { selector };
    }

    return map;
  }

  async runSelectorHealthCheck() {
    const win = this.ctx.getMainWindow();
    if (!win) return null;

    const selectorMap = this.getSelectorMap();
    const script = `
      (function() {
        const selectorMap = ${JSON.stringify(selectorMap)};
        const playing =
          Boolean(document.querySelector('video')) &&
          window.location.pathname.indexOf('/watch/') === 0;

        const entries = Object.entries(selectorMap).map(([key, entry]) => {
          const matchCount = document.querySelectorAll(entry.selector).length;
          const required = Boolean(entry.requiredWhilePlaying) && playing;
          return {
            key,
            selector: entry.selector,
            exists: matchCount > 0,
            matchCount,
            required,
            status: matchCount > 0 ? 'ok' : required ? 'missing' : 'absent',
          };
        });

        return { playing, entries };
      })();
    `;

    try {
      const read = await win.webContents.executeJavaScript(script, true);
      const selectors = read.entries;
      const invalid = selectors.filter((entry) => entry.required && !entry.exists);
      const result = {
        checkedAt: new Date().toISOString(),
        playing: read.playing,
        total: selectors.length,
        present: selectors.filter((entry) => entry.exists).length,
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
        playing: false,
        total: 0,
        present: 0,
        valid: 0,
        invalid: 0,
        selectors: [],
        error: error.message,
      };
    }
  }

  async validateSelectors(force = false) {
    const now = Date.now();

    if (!force) {
      if (this.lastValidation && now - this.lastValidation < 3600000) return;
      // reading the page every tick would be wasteful while we wait for
      // playback to start
      if (this.lastValidationAttempt && now - this.lastValidationAttempt < 60000) return;
    }

    this.lastValidationAttempt = now;

    const result = await this.runSelectorHealthCheck();
    if (!result) return;

    // With nothing playing the transient selectors are legitimately absent
    // and the title block isn't rendered, so there is nothing to judge. Leave
    // the throttle alone so the real check happens once playback starts.
    if (!result.playing) return;

    this.lastValidation = now;

    const invalidSelectors = result.selectors
      .filter((entry) => entry.required && !entry.exists)
      .map((entry) => `${entry.key}: ${entry.selector}`);

    if (invalidSelectors.length > 0) {
      this.ctx.logger.warn('Some selectors may be outdated:', invalidSelectors);
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
      this.ctx.logger.debug(
        `Selectors validated: ${result.present}/${result.total} present, none missing`
      );
    }
  }

  cleanup() {
    this.stop();
  }
}

module.exports = AutoSkipper;
