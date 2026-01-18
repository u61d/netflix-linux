const { ipcRenderer } = require('electron');

let lastPlayerState = null;
let errorCount = 0;
const MAX_ERRORS = 10;
let lastVisibilityState = document.visibilityState;

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
  console.log('[Main Preload] Starting player tracker');

  setInterval(() => {
    try {
      const video = document.querySelector('video');
      if (!video) return;

      const titleInfo = extractTitleInfo();
      const episodeTitle = extractEpisodeTitle() || titleInfo.episodeTitle;

      const playerState = {
        title: titleInfo.title || document.title,
        duration: video.duration || 0,
        position: video.currentTime || 0,
        playing: !video.paused && !video.ended,
        volume: video.volume,
        muted: video.muted,
        season: extractSeason(),
        episode: extractEpisode(),
        episodeTitle,
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

function extractTitleInfo() {
  try {
    const titleEl = document.querySelector(
      'h4.ellipsize-text, [data-uia="video-title"], .video-title h4, .ltr-1wkrbga'
    );
    if (!titleEl) return { title: null, episodeTitle: null };

    const rawText = titleEl.innerText || titleEl.textContent || '';
    const lines = splitLines(rawText);

    if (lines.length >= 2) {
      return {
        title: lines[0] || null,
        episodeTitle: lines[lines.length - 1] || null,
      };
    }

    if (lines.length === 1) {
      return splitTitleAndEpisode(lines[0]);
    }

    return { title: null, episodeTitle: null };
  } catch (error) {
    console.error('[Main Preload] extractTitleInfo error:', error);
    return { title: null, episodeTitle: null };
  }
}

function extractSeason() {
  try {
    const selectors = ['[data-uia="video-meta"]', '.video-meta', '.player-status-main-title'];

    for (const selector of selectors) {
      const meta = document.querySelector(selector);
      if (!meta) continue;

      const text = meta.textContent || '';
      const match = text.match(/Season\s*(\d+)/i) || text.match(/\bS\s*(\d+)\b/i);
      if (match) return parseInt(match[1], 10);
    }

    return null;
  } catch (error) {
    console.error('[Main Preload] extractSeason error:', error);
    return null;
  }
}

function extractEpisode() {
  try {
    const selectors = ['[data-uia="video-meta"]', '.video-meta', '.player-status-main-title'];

    for (const selector of selectors) {
      const meta = document.querySelector(selector);
      if (!meta) continue;

      const text = meta.textContent || '';
      const match = text.match(/(?:Episode|Ep)\s*(\d+)/i) || text.match(/\bE\s*(\d+)\b/i);
      if (match) return parseInt(match[1], 10);
    }

    return null;
  } catch (error) {
    console.error('[Main Preload] extractEpisode error:', error);
    return null;
  }
}

function extractEpisodeTitle() {
  try {
    const selectors = [
      '[data-uia="episode-title"]',
      '.video-title',
      '[data-uia="video-title"]',
      '.player-status-sub-title',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const rawText = el?.innerText || el?.textContent;
      const lines = splitLines(rawText);
      if (lines.length > 0) {
        if (lines.length === 1) {
          const parsed = splitTitleAndEpisode(lines[0]);
          return parsed.episodeTitle || lines[0];
        }
        return lines[lines.length - 1];
      }
    }

    return null;
  } catch (error) {
    console.error('[Main Preload] extractEpisodeTitle error:', error);
    return null;
  }
}

function normalizeText(value) {
  if (!value) return null;
  return value
    .replace(/\s+/g, ' ')
    .replace(/([a-zA-Z])([A-Z]\d)/g, '$1 $2')
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
    .trim();
}

function splitLines(value) {
  if (!value) return [];
  return value
    .split('\n')
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function splitTitleAndEpisode(text) {
  const cleaned = normalizeText(text);
  if (!cleaned) return { title: null, episodeTitle: null };

  const match = cleaned.match(/^(.*?)(?:\bS\s*\d+\s*E\s*\d+|\bE\s*\d+)\s*(.*)$/i);
  if (match) {
    const title = match[1].trim();
    const episodeTitle = match[2].replace(/^[-–—:.\s]+/, '').trim();
    return {
      title: title || null,
      episodeTitle: episodeTitle || null,
    };
  }

  return { title: cleaned, episodeTitle: null };
}
