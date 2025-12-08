const { ipcRenderer } = require('electron');

let lastPlayerState = null;
let errorCount = 0;
const MAX_ERRORS = 10;

window.addEventListener('DOMContentLoaded', () => {
  console.log('[Main Preload] Starting player tracker');

  setInterval(() => {
    try {
      const video = document.querySelector('video');
      if (!video) return;

      const titleEl = document.querySelector(
        'h4.ellipsize-text, [data-uia="video-title"], .video-title h4, .ltr-1wkrbga'
      );

      const playerState = {
        title: titleEl?.textContent?.trim() || document.title,
        duration: video.duration || 0,
        position: video.currentTime || 0,
        playing: !video.paused && !video.ended,
        volume: video.volume,
        muted: video.muted,
        season: extractSeason(),
        episode: extractEpisode(),
        episodeTitle: extractEpisodeTitle(),
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

function extractSeason() {
  try {
    const selectors = ['[data-uia="video-meta"]', '.video-meta', '.player-status-main-title'];

    for (const selector of selectors) {
      const meta = document.querySelector(selector);
      if (!meta) continue;

      const text = meta.textContent || '';
      const match = text.match(/Season\s+(\d+)/i);
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
      const match = text.match(/Episode\s+(\d+)/i);
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
    const selectors = ['.video-title', '[data-uia="video-title"]', '.player-status-sub-title'];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.textContent) {
        return el.textContent.trim();
      }
    }

    return null;
  } catch (error) {
    console.error('[Main Preload] extractEpisodeTitle error:', error);
    return null;
  }
}
