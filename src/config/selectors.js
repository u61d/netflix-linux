const fs = require('fs');
const path = require('path');

let cachedSelectors = null;

function loadSelectors() {
  if (cachedSelectors) return cachedSelectors;

  try {
    const selectorPath = path.join(__dirname, 'selectors.json');
    const data = fs.readFileSync(selectorPath, 'utf8');
    const parsed = JSON.parse(data);
    cachedSelectors = parsed.selectors;
    return cachedSelectors;
  } catch (error) {
    console.error('Failed to load selectors:', error);
    return {
      skip: {
        intro: '[data-uia="player-skip-intro"], button[aria-label="Skip Intro"]',
        recap: 'button[aria-label="Skip Recap"]',
        credits: '.skip-credits button, [data-uia="skip-credits"]',
        nextEpisode: '[data-uia="next-episode-seamless-button"]',
        continueWatching: 'button[aria-label="Continue Playing"]',
      },
      title: [
        'h4.ellipsize-text',
        '[data-uia="video-title"]',
        '.video-title h4',
        '.video-title',
        '.ltr-1wkrbga',
        '.player-status-main-title',
      ],
      meta: {
        videoMeta: '[data-uia="video-meta"]',
      },
    };
  }
}

const selectors = loadSelectors();

const SKIP_SELECTORS = selectors.skip;
const TITLE_SELECTORS = selectors.title;
const META_SELECTORS = selectors.meta;

module.exports = {
  SKIP_SELECTORS,
  TITLE_SELECTORS,
  META_SELECTORS,
  reloadSelectors: () => {
    cachedSelectors = null;
    return loadSelectors();
  },
};
