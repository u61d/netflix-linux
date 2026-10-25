const { ipcRenderer } = require('electron');
const { readTrack } = require('../../../shared/mediaMetadata');
const { TITLE_SELECTORS, META_SELECTORS } = require('../../../config/selectors');

let lastPlayerState = null;
let errorCount = 0;
const MAX_ERRORS = 10;
let lastVisibilityState = document.visibilityState;
const QUEUE_BUTTON_ATTR = 'data-netflix-linux-queue-button';
let queueButtonObserver = null;

const notifyAutoPause = (reason) => {
  ipcRenderer.send('playback:auto-pause', reason);
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && lastVisibilityState !== 'hidden') {
    notifyAutoPause('visibility-hidden');
  } else if (document.visibilityState === 'visible' && lastVisibilityState === 'hidden') {
    ipcRenderer.send('playback:auto-resume', 'visibility-visible');
  }
  lastVisibilityState = document.visibilityState;
});

window.addEventListener('DOMContentLoaded', () => {
  installQueueHoverButton();

  setInterval(() => {
    try {
      const video = document.querySelector('video');
      if (!video) return;

      const track = readTrack(document, TITLE_SELECTORS, META_SELECTORS.videoMeta);

      const playerState = {
        title: track.show || document.title,
        duration: video.duration || 0,
        position: video.currentTime || 0,
        playing: !video.paused && !video.ended,
        volume: video.volume,
        muted: video.muted,
        playbackRate: video.playbackRate || 1,
        season: track.season,
        episode: track.episode,
        episodeTitle: track.episodeTitle,
        url: window.location.href,
      };

      const stateStr = JSON.stringify(playerState);
      if (stateStr !== lastPlayerState) {
        ipcRenderer.send('player:update', playerState);
        lastPlayerState = stateStr;
      }

      errorCount = 0;
    } catch (error) {
      errorCount++;
      console.error('[Main Preload] Player update error:', error);

      if (errorCount >= MAX_ERRORS) {
        console.error('[Main Preload] Too many errors, stopping tracker');
        return;
      }
    }
  }, 1000);
});

function installQueueHoverButton() {
  const applyButtons = () => {
    const controlRows = document.querySelectorAll(
      [
        '.previewModal--button_container',
        '.buttonControls--container',
        '[class*="buttonControls--container"]',
        '[class*="previewModal--button_container"]',
      ].join(', ')
    );

    controlRows.forEach((row) => {
      const controls = resolveControlsRow(row);
      if (!controls || controls.querySelector(`[${QUEUE_BUTTON_ATTR}]`)) return;

      const card = resolveHoverCard(controls);
      const item = extractQueueItem(card);
      if (!item) return;

      const templateButton = controls.querySelector('button, [role="button"]');
      const queueButton = document.createElement('button');
      queueButton.type = 'button';
      queueButton.setAttribute(QUEUE_BUTTON_ATTR, 'true');
      queueButton.setAttribute('aria-label', 'Add to queue');
      queueButton.setAttribute('title', 'Add to queue');
      queueButton.className = templateButton?.className || '';
      queueButton.style.display = 'inline-flex';
      queueButton.style.alignItems = 'center';
      queueButton.style.justifyContent = 'center';
      queueButton.style.flexShrink = '0';
      queueButton.innerHTML = getQueueButtonIcon();

      queueButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (queueButton.dataset.busy === '1') return;
        queueButton.dataset.busy = '1';

        try {
          const latestItem = extractQueueItem(card) || item;
          const result = await ipcRenderer.invoke('add-to-queue', latestItem);
          queueButton.dataset.state = result?.deduped ? 'updated' : 'added';
          queueButton.style.opacity = '1';
        } catch (error) {
          queueButton.dataset.state = 'error';
          console.error('[Main Preload] add-to-queue failed:', error);
        } finally {
          window.setTimeout(() => {
            delete queueButton.dataset.busy;
          }, 600);
        }
      });

      controls.appendChild(queueButton);
    });
  };

  applyButtons();

  if (queueButtonObserver) {
    queueButtonObserver.disconnect();
  }

  queueButtonObserver = new MutationObserver(() => {
    applyButtons();
  });

  if (document.body) {
    queueButtonObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}

function resolveControlsRow(node) {
  if (!node || !(node instanceof HTMLElement)) return null;
  if (
    node.matches(
      '.previewModal--button_container, .buttonControls--container, [class*="buttonControls--container"], [class*="previewModal--button_container"]'
    )
  ) {
    return node;
  }
  return node.closest(
    '.previewModal--button_container, .buttonControls--container, [class*="buttonControls--container"], [class*="previewModal--button_container"]'
  );
}

function resolveHoverCard(node) {
  if (!node || !(node instanceof HTMLElement)) return null;
  return (
    node.closest(
      '[data-uia="previewModal"], .previewModal--container, [class*="previewModal"], .bob-card, .jawBoneContainer'
    ) || node
  );
}

function extractQueueItem(card) {
  if (!card) return null;

  const title = extractHoverTitle(card);
  const url = extractHoverUrl(card);
  if (!title || !url || !url.startsWith('https://www.netflix.com')) {
    return null;
  }

  return {
    title,
    url,
  };
}

function extractHoverTitle(card) {
  const candidates = [
    '[data-uia="previewModal-title"]',
    '[data-uia="title-card-title"]',
    'img[alt]',
    'h3',
    'h4',
    '[class*="title"]',
    '[class*="logo"]',
  ];

  for (const selector of candidates) {
    const nodes = card.querySelectorAll(selector);
    for (const node of nodes) {
      const title =
        normalizeText(node.getAttribute?.('alt')) ||
        normalizeText(node.textContent) ||
        normalizeText(node.getAttribute?.('aria-label'));
      if (!title) continue;
      if (title.toLowerCase() === 'netflix') continue;
      if (title.length < 2) continue;
      return title.replace(/\s+-\s+netflix$/i, '');
    }
  }

  return null;
}

function extractHoverUrl(card) {
  const links = card.querySelectorAll('a[href]');
  for (const link of links) {
    const href = String(link.href || '').trim();
    if (!href) continue;
    if (
      href.startsWith('https://www.netflix.com/watch/') ||
      href.startsWith('https://www.netflix.com/title/') ||
      href.startsWith('https://www.netflix.com/browse')
    ) {
      return href;
    }
  }

  const playButton = card.querySelector('[data-uia*="play"], [aria-label*="Play"]');
  const href = playButton?.closest('a')?.href;
  return href ? String(href).trim() : null;
}

function getQueueButtonIcon() {
  return `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h10M4 12h10M4 17h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M18 10v8M14 14h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;
}

// Only used for hover-card titles now. It used to insert spaces at every
// letter/digit boundary to pull apart the run-together player title, which
// turned "Se7en" into "Se 7 en" and "F1: The Movie" into "F 1: The Movie" in
// the queue. The metadata module does that job properly now.
function normalizeText(value) {
  if (!value) return null;
  return value.replace(/\s+/g, ' ').trim();
}
