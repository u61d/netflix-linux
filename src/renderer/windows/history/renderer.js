let rawHistory = [];
let allHistory = [];
let updatesStarted = false;
let initStarted = false;

function normalizeSeriesTitle(title) {
  if (!title) return 'Unknown Title';
  const cleaned = String(title)
    .replace(/\s+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])([A-Z]\d)/g, '$1 $2')
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
    .trim();

  const match = cleaned.match(/^(.*?)(?:\bS\s*\d+\s*E\s*\d+|\bE\s*\d+|\bEpisode\s*\d+)\b/i);
  if (match && match[1]) {
    return match[1].trim() || 'Unknown Title';
  }

  return cleaned || 'Unknown Title';
}

function groupHistoryByTitle(history) {
  const groups = new Map();

  (history || []).forEach((item) => {
    const title = normalizeSeriesTitle(item.title);
    const endTime = item.endTime || item.startTime || 0;
    const duration = item.duration || 0;

    if (!groups.has(title)) {
      groups.set(title, {
        title,
        duration: 0,
        lastWatched: endTime,
        sessionCount: 0,
      });
    }

    const entry = groups.get(title);
    entry.duration += duration;
    entry.sessionCount += 1;
    if (endTime > entry.lastWatched) {
      entry.lastWatched = endTime;
    }
  });

  return Array.from(groups.values()).sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0));
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatDuration(minutes) {
  if (!minutes || minutes < 1) return '< 1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function renderHistory(history) {
  const container = document.getElementById('historyContainer');

  if (!history || history.length === 0) {
    container.innerHTML = `
          <div class="no-history">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p>No watch history yet</p>
            <div class="hint">Start watching and your history will appear here</div>
          </div>
        `;
    return;
  }

  container.innerHTML = history
    .map((item) => {
      return `
          <div class="history-item enter">
            <div class="title">${item.title || 'Unknown Title'}</div>
            <div class="metadata">
              <span title="Duration">
                <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                ${formatDuration(item.duration)}
              </span>
              <span title="When watched">
                <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                ${formatDate(item.lastWatched || item.endTime || item.startTime)}
              </span>
            </div>
          </div>
        `;
    })
    .join('');
}

function calculateStats(history) {
  if (!history || history.length === 0) {
    return {
      totalMinutes: 0,
      totalSessions: 0,
      avgSession: 0,
      mostWatched: { title: '-', minutes: 0 },
    };
  }

  const totalMinutes = history.reduce((sum, item) => sum + (item.duration || 0), 0);
  const totalSessions = history.length;
  const avgSession = Math.round(totalMinutes / totalSessions);

  const showTimes = {};
  history.forEach((item) => {
    const show = item.title || 'Unknown';
    showTimes[show] = (showTimes[show] || 0) + (item.duration || 0);
  });

  const mostWatchedEntry = Object.entries(showTimes).sort((a, b) => b[1] - a[1])[0];

  const mostWatched = mostWatchedEntry
    ? {
        title: mostWatchedEntry[0],
        minutes: mostWatchedEntry[1],
      }
    : { title: '-', minutes: 0 };

  return { totalMinutes, totalSessions, avgSession, mostWatched };
}

function updateStats(stats) {
  const hours = Math.floor(stats.totalMinutes / 60);
  const minutes = stats.totalMinutes % 60;

  document.getElementById('totalHours').textContent = hours;
  document.getElementById('totalMinutes').textContent = minutes;
  document.getElementById('totalSessions').textContent = stats.totalSessions;
  document.getElementById('avgSession').textContent = stats.avgSession;

  const mostWatchedEl = document.getElementById('mostWatched');
  const mostWatchedTimeEl = document.getElementById('mostWatchedTime');
  mostWatchedEl.textContent = stats.mostWatched.title;
  mostWatchedEl.parentElement.title = stats.mostWatched.title;

  if (stats.mostWatched.minutes > 0) {
    mostWatchedTimeEl.textContent = formatDuration(stats.mostWatched.minutes);
  } else {
    mostWatchedTimeEl.textContent = '';
  }
}

async function loadHistory() {
  try {
    if (!window.historyAPI) {
      throw new Error('History API not available');
    }

    const history = await window.historyAPI.getHistory();
    rawHistory = history || [];
    allHistory = groupHistoryByTitle(rawHistory);
    const stats = calculateStats(rawHistory);

    updateStats(stats);
    renderHistory(allHistory);
  } catch (e) {
    console.error('Load history error:', e);
    document.getElementById('historyContainer').innerHTML = `
          <div class="no-history">
            <p style="color: #f44336;">Failed to load history</p>
            <div class="hint">${e.message}</div>
          </div>
        `;
  }
}

function startHistoryUpdates() {
  if (updatesStarted || !window.historyAPI) return;
  updatesStarted = true;

  if (window.historyAPI.onUpdated) {
    window.historyAPI.onUpdated(() => loadHistory());
  }

  if (window.historyAPI.onData) {
    window.historyAPI.onData((data) => {
      rawHistory = data || [];
      allHistory = groupHistoryByTitle(rawHistory);
      const stats = calculateStats(rawHistory);
      updateStats(stats);
      renderHistory(allHistory);
    });
  }

  setInterval(loadHistory, 15000);
}

async function clearHistory() {
  if (!confirm('Are you sure you want to clear all watch history?\n\nThis cannot be undone.')) {
    return;
  }

  try {
    if (!window.historyAPI) {
      throw new Error('History API not available');
    }

    await window.historyAPI.clearHistory();
    await loadHistory();
  } catch (e) {
    alert('Failed to clear history: ' + e.message);
  }
}

async function exportHistory() {
  try {
    if (!window.historyAPI) {
      throw new Error('History API not available');
    }

    await window.historyAPI.exportHistory();
  } catch (e) {
    alert('Failed to export history: ' + e.message);
  }
}

document.getElementById('exportHistoryBtn').addEventListener('click', exportHistory);
document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);

document.getElementById('searchInput').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();

  if (!query) {
    renderHistory(allHistory);
    return;
  }

  const filtered = allHistory.filter((item) => {
    const title = (item.title || '').toLowerCase();
    return title.includes(query);
  });

  renderHistory(filtered);
});

function ensureHistoryApi(attempt = 0) {
  if (window.historyAPI) {
    startHistoryUpdates();
    loadHistory();
    if (window.historyAPI.requestHistory) {
      window.historyAPI.requestHistory();
    }
    return;
  }

  if (attempt >= 20) {
    document.body.innerHTML = `
          <div style="padding: 20px; color: #f44336; text-align: center;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <h2 style="margin: 0;">Error Loading History</h2>
            </div>
            <p>The history API could not be loaded. Please restart the application.</p>
          </div>
        `;
    return;
  }

  setTimeout(() => ensureHistoryApi(attempt + 1), 100);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    if (initStarted) return;
    initStarted = true;
    ensureHistoryApi();
  });
} else {
  initStarted = true;
  ensureHistoryApi();
}
