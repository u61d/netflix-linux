const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');

class WatchHistoryService {
  constructor(ctx) {
    this.ctx = ctx;
    this.currentSession = null;
    this.sessionStartTime = null;
    this.lastValidTitle = null;
  }

  trackSession(playerData) {
    if (!playerData) return;

    const title = playerData.title;

    if (!title || title === 'Netflix' || title.trim().length === 0) {
      if (!this.lastValidTitle) return;
      playerData.title = this.lastValidTitle;
    } else {
      this.lastValidTitle = title;
    }

    const now = Date.now();
    const isPlaying = playerData.playing;

    if (isPlaying && !this.currentSession) {
      this.currentSession = {
        title: playerData.title,
        season: playerData.season,
        episode: playerData.episode,
        episodeTitle: playerData.episodeTitle,
        startTime: now,
        startTimestamp: new Date(now).toISOString(),
      };
      this.sessionStartTime = now;
      this.ctx.logger.debug(`Started watching: ${playerData.title}`);
    }

    if (this.currentSession && (!isPlaying || this.currentSession.title !== playerData.title)) {
      const duration = Math.floor((now - this.sessionStartTime) / 1000 / 60);

      if (duration >= 1) {
        const history = this.ctx.store.get('watchHistory', []);

        const sessionData = {
          ...this.currentSession,
          endTime: now,
          endTimestamp: new Date(now).toISOString(),
          duration,
          durationSeconds: Math.floor((now - this.sessionStartTime) / 1000),
        };

        history.unshift(sessionData);

        this.ctx.store.set('watchHistory', history.slice(0, 500));
        this.ctx.logger.info(`✓ Saved session: ${this.currentSession.title} (${duration}m)`);
      }

      this.currentSession = null;
      this.sessionStartTime = null;
    }
  }

  showQuickStats() {
    const NotificationService = require('../utils/notifications');
    const notifier = new NotificationService(this.ctx);

    const win = this.ctx.getMainWindow();
    const title = win ? win.getTitle() : 'Netflix';

    const history = this.ctx.store.get('watchHistory', []);
    const totalMinutes = history.reduce((sum, s) => sum + (s.duration || 0), 0);
    const totalHours = Math.floor(totalMinutes / 60);

    const speed = this.ctx.store.get('playbackSpeed', 1.0);
    const autoSkip = this.ctx.store.get('autoSkipIntro', true);
    const rpcManager = this.ctx.getManager('rpc');
    const rpcConnected = rpcManager?.ready || false;

    const body = `Now Playing: ${title}

Total Watch Time: ${totalHours}h ${totalMinutes % 60}m
Sessions: ${history.length}

Playback Speed: ${speed}x
Auto-Skip: ${autoSkip ? 'ON' : 'OFF'}
Discord: ${rpcConnected ? 'Connected' : 'Disconnected'}`;

    notifier.notify({
      title: 'Netflix Stats',
      body,
      silent: false,
      priority: 'high',
    });

    this.ctx.logger.info('✓ Stats displayed');
  }

  async export() {
    const win = this.ctx.getMainWindow();
    if (!win) return;

    const history = this.ctx.store.get('watchHistory', []);

    if (history.length === 0) {
      const NotificationService = require('../utils/notifications');
      const notifier = new NotificationService(this.ctx);
      notifier.notify({
        title: 'Export History',
        body: 'No history to export',
        priority: 'high',
      });
      return;
    }

    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: 'Export Watch History',
      defaultPath: path.join(app.getPath('documents'), 'netflix-history.json'),
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'CSV', extensions: ['csv'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    });

    if (canceled || !filePath) return;

    const ext = path.extname(filePath).toLowerCase();
    let content;

    if (ext === '.json') {
      content = JSON.stringify(
        {
          exported: new Date().toISOString(),
          totalSessions: history.length,
          totalMinutes: history.reduce((sum, s) => sum + (s.duration || 0), 0),
          sessions: history,
        },
        null,
        2
      );
    } else if (ext === '.csv') {
      const headers = 'Title,Season,Episode,Episode Title,Start Time,End Time,Duration (min)\n';
      const rows = history
        .map((s) => {
          const cols = [
            `"${s.title || ''}"`,
            s.season || '',
            s.episode || '',
            `"${s.episodeTitle || ''}"`,
            s.startTimestamp || '',
            s.endTimestamp || '',
            s.duration || 0,
          ];
          return cols.join(',');
        })
        .join('\n');
      content = headers + rows;
    } else {
      const totalMinutes = history.reduce((sum, s) => sum + (s.duration || 0), 0);
      content = `Netflix Watch History
Exported: ${new Date().toISOString()}
Total Sessions: ${history.length}
Total Time: ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m

${history
  .map((s, i) => {
    let line = `${i + 1}. ${s.title}`;
    if (s.season && s.episode) {
      line += ` S${s.season}E${s.episode}`;
    }
    if (s.episodeTitle) {
      line += ` - ${s.episodeTitle}`;
    }
    line += ` (${s.duration}m)`;
    line += `\n   ${s.startTimestamp}`;
    return line;
  })
  .join('\n\n')}`;
    }

    fs.writeFileSync(filePath, content, 'utf8');

    const NotificationService = require('../utils/notifications');
    const notifier = new NotificationService(this.ctx);
    notifier.notify({
      title: 'History Exported',
      body: `Saved to ${path.basename(filePath)}`,
      priority: 'high',
    });

    this.ctx.logger.info('✓ History exported to:', filePath);

    const { shell } = require('electron');
    setTimeout(() => {
      shell.showItemInFolder(filePath);
    }, 1000);
  }
}

module.exports = WatchHistoryService;
