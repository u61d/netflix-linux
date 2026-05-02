const { ipcMain } = require('electron');
const ValidationService = require('../utils/validation');
const { registerHandle } = require('../utils/ipcTrace');

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function sortQueue(queue) {
  return [...queue].sort((a, b) => {
    const aPinned = a?.pinned ? 1 : 0;
    const bPinned = b?.pinned ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

module.exports = function setupQueueHandlers(ctx) {
  const validator = new ValidationService();

  registerHandle(ctx, ipcMain, 'get-watch-queue', async () => {
    try {
      const queue = ctx.store.get('watchQueue', []);
      return sortQueue(queue);
    } catch (error) {
      ctx.logger.error('get-watch-queue error:', error);
      return [];
    }
  });

  registerHandle(ctx, ipcMain, 'add-to-queue', async (_event, item) => {
    try {
      if (!item || typeof item !== 'object') {
        throw new Error('Invalid queue item');
      }

      const safeTitle = validator.sanitizeString(item.title || '');
      const safeUrl = item.url ? validator.sanitizeString(item.url) : '';
      if (!safeTitle) {
        throw new Error('Queue item title is required');
      }
      if (safeUrl && !safeUrl.startsWith('https://www.netflix.com')) {
        throw new Error('Queue URL must be a netflix.com URL');
      }

      const queue = ctx.store.get('watchQueue', []);
      const normalizedTitle = normalize(safeTitle);
      const existingIndex = queue.findIndex(
        (entry) =>
          (safeUrl && entry.url === safeUrl) || normalize(entry.title || '') === normalizedTitle
      );

      const nextItem = {
        id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: safeTitle,
        url: safeUrl || 'https://www.netflix.com/',
        addedAt: Date.now(),
        lastPlayedAt: item.lastPlayedAt || null,
        pinned: Boolean(item.pinned),
      };

      if (existingIndex >= 0) {
        const existing = queue[existingIndex];
        queue[existingIndex] = {
          ...existing,
          ...nextItem,
          id: existing.id,
          dedupedAt: Date.now(),
        };
      } else {
        queue.push(nextItem);
      }

      const sorted = sortQueue(queue).map((entry, index) => ({ ...entry, order: index }));
      ctx.store.set('watchQueue', sorted);
      return { added: true, deduped: existingIndex >= 0 };
    } catch (error) {
      ctx.logger.error('add-to-queue error:', error);
      throw error;
    }
  });

  registerHandle(ctx, ipcMain, 'remove-from-queue', async (_event, target) => {
    try {
      const queue = ctx.store.get('watchQueue', []);
      let nextQueue = queue;
      if (typeof target === 'string') {
        nextQueue = queue.filter((entry) => entry.id !== target);
      } else if (typeof target === 'number') {
        nextQueue = queue.filter((_, index) => index !== target);
      } else {
        throw new Error('Invalid queue target');
      }
      ctx.store.set(
        'watchQueue',
        sortQueue(nextQueue).map((entry, index) => ({ ...entry, order: index }))
      );
      return true;
    } catch (error) {
      ctx.logger.error('remove-from-queue error:', error);
      throw error;
    }
  });

  registerHandle(ctx, ipcMain, 'clear-watch-queue', async () => {
    try {
      ctx.store.set('watchQueue', []);
      return true;
    } catch (error) {
      ctx.logger.error('clear-watch-queue error:', error);
      throw error;
    }
  });

  registerHandle(ctx, ipcMain, 'reorder-watch-queue', async (_event, from, to) => {
    try {
      const queue = sortQueue(ctx.store.get('watchQueue', []));
      if (
        !Number.isInteger(from) ||
        !Number.isInteger(to) ||
        from < 0 ||
        to < 0 ||
        from >= queue.length ||
        to >= queue.length
      ) {
        throw new Error('Invalid reorder indexes');
      }
      const [moved] = queue.splice(from, 1);
      queue.splice(to, 0, moved);
      ctx.store.set(
        'watchQueue',
        queue.map((entry, index) => ({ ...entry, order: index }))
      );
      return true;
    } catch (error) {
      ctx.logger.error('reorder-watch-queue error:', error);
      throw error;
    }
  });

  registerHandle(ctx, ipcMain, 'dedupe-watch-queue', async () => {
    try {
      const queue = ctx.store.get('watchQueue', []);
      const deduped = [];
      const seen = new Set();
      for (const entry of queue) {
        const key = entry.url || normalize(entry.title);
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(entry);
      }
      ctx.store.set(
        'watchQueue',
        sortQueue(deduped).map((entry, index) => ({ ...entry, order: index }))
      );
      return { removed: queue.length - deduped.length };
    } catch (error) {
      ctx.logger.error('dedupe-watch-queue error:', error);
      throw error;
    }
  });

  registerHandle(ctx, ipcMain, 'pin-watch-queue-item', async (_event, targetId, pinned = true) => {
    try {
      if (!targetId || typeof targetId !== 'string') {
        throw new Error('Invalid queue target');
      }
      const queue = ctx.store.get('watchQueue', []);
      const nextQueue = queue.map((entry) =>
        entry.id === targetId ? { ...entry, pinned: Boolean(pinned) } : entry
      );
      ctx.store.set(
        'watchQueue',
        sortQueue(nextQueue).map((entry, index) => ({ ...entry, order: index }))
      );
      return true;
    } catch (error) {
      ctx.logger.error('pin-watch-queue-item error:', error);
      throw error;
    }
  });

  registerHandle(ctx, ipcMain, 'play-next-in-queue', async (_event, targetId = null) => {
    try {
      let queue = sortQueue(ctx.store.get('watchQueue', []));
      if (!queue.length) return null;

      let nextItem;
      if (targetId) {
        const index = queue.findIndex((entry) => entry.id === targetId);
        if (index < 0) throw new Error('Queue item not found');
        [nextItem] = queue.splice(index, 1);
      } else {
        [nextItem] = queue.splice(0, 1);
      }

      nextItem.lastPlayedAt = Date.now();
      ctx.store.set(
        'watchQueue',
        queue.map((entry, index) => ({ ...entry, order: index }))
      );

      const win = ctx.getMainWindow();
      if (win && !win.isDestroyed() && nextItem.url) {
        await win.loadURL(nextItem.url);
      }

      return nextItem;
    } catch (error) {
      ctx.logger.error('play-next-in-queue error:', error);
      throw error;
    }
  });

  ctx.logger.debug('Queue handlers registered');
};
