const { ipcMain } = require('electron');
const setupQueueHandlers = require('../../../src/main/handlers/queue');

jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn() },
}));

describe('Queue Handlers', () => {
  let ctx;
  let win;
  let stored;

  beforeEach(() => {
    jest.clearAllMocks();

    stored = {};
    win = {
      loadURL: jest.fn().mockResolvedValue(undefined),
      isDestroyed: jest.fn().mockReturnValue(false),
    };

    ctx = {
      store: {
        // electron-store hands back a deserialized copy, so the handler can
        // never rely on mutating what it read
        get: jest.fn((key, fallback) =>
          key in stored ? JSON.parse(JSON.stringify(stored[key])) : fallback
        ),
        set: jest.fn((key, value) => {
          stored[key] = value;
        }),
      },
      logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn() },
      getMainWindow: jest.fn(() => win),
    };

    setupQueueHandlers(ctx);
  });

  function handler(channel) {
    const call = ipcMain.handle.mock.calls.find(([name]) => name === channel);
    if (!call) throw new Error(`no handler registered for ${channel}`);
    return call[1];
  }

  const add = (item) => handler('add-to-queue')({}, item);
  const queue = () => stored.watchQueue;

  const seed = (...items) => {
    stored.watchQueue = items.map((item, index) => ({
      id: item.id || `id${index}`,
      title: item.title || `Title ${index}`,
      url: item.url || `https://www.netflix.com/title/${index}`,
      order: item.order ?? index,
      pinned: Boolean(item.pinned),
      addedAt: 1000 + index,
    }));
  };

  describe('get-watch-queue', () => {
    it('returns an empty queue when nothing is stored', async () => {
      await expect(handler('get-watch-queue')()).resolves.toEqual([]);
    });

    it('puts pinned items first, then follows order', async () => {
      seed(
        { id: 'a', order: 0 },
        { id: 'b', order: 1, pinned: true },
        { id: 'c', order: 2 },
        { id: 'd', order: 3, pinned: true }
      );

      const result = await handler('get-watch-queue')();

      expect(result.map((entry) => entry.id)).toEqual(['b', 'd', 'a', 'c']);
    });

    it('returns an empty list rather than throwing if the store blows up', async () => {
      ctx.store.get.mockImplementation(() => {
        throw new Error('store corrupt');
      });

      await expect(handler('get-watch-queue')()).resolves.toEqual([]);
      expect(ctx.logger.error).toHaveBeenCalled();
    });
  });

  describe('add-to-queue', () => {
    it('rejects anything that is not an object', async () => {
      await expect(add(null)).rejects.toThrow('Invalid queue item');
      await expect(add('Stranger Things')).rejects.toThrow('Invalid queue item');
    });

    it('requires a title', async () => {
      await expect(add({ url: 'https://www.netflix.com/title/1' })).rejects.toThrow(
        'title is required'
      );
    });

    it('requires a netflix.com URL', async () => {
      await expect(add({ title: 'Evil', url: 'https://evil.test/x' })).rejects.toThrow(
        'must be a netflix.com URL'
      );
      expect(ctx.store.set).not.toHaveBeenCalled();
    });

    it('sanitizes the title', async () => {
      await add({ title: '  <b>Lupin</b>  ' });
      expect(queue()[0].title).toBe('bLupin/b');
    });

    it('fills in a default URL when none is given', async () => {
      await add({ title: 'Lupin' });
      expect(queue()[0].url).toBe('https://www.netflix.com/');
    });

    it('assigns an id and an order', async () => {
      await add({ title: 'Lupin' });

      expect(queue()[0].id).toEqual(expect.any(String));
      expect(queue()[0].order).toBe(0);
    });

    it('appends a second, different item', async () => {
      await add({ title: 'Lupin', url: 'https://www.netflix.com/title/1' });
      await add({ title: 'Dark', url: 'https://www.netflix.com/title/2' });

      expect(queue().map((entry) => entry.title)).toEqual(['Lupin', 'Dark']);
      expect(queue().map((entry) => entry.order)).toEqual([0, 1]);
    });

    it('dedupes on the URL and keeps the original id', async () => {
      await add({ title: 'Lupin', url: 'https://www.netflix.com/title/1' });
      const originalId = queue()[0].id;

      const result = await add({ title: 'Lupin (2021)', url: 'https://www.netflix.com/title/1' });

      expect(result).toEqual({ added: true, deduped: true });
      expect(queue()).toHaveLength(1);
      expect(queue()[0].id).toBe(originalId);
      expect(queue()[0].title).toBe('Lupin (2021)');
      expect(queue()[0].dedupedAt).toEqual(expect.any(Number));
    });

    it('dedupes on the title regardless of case and spacing', async () => {
      await add({ title: 'Stranger Things', url: 'https://www.netflix.com/title/1' });
      const result = await add({ title: '  stranger   THINGS ', url: '' });

      expect(result.deduped).toBe(true);
      expect(queue()).toHaveLength(1);
    });

    it('treats two different shows added without URLs as different items', async () => {
      await add({ title: 'Lupin' });
      const result = await add({ title: 'Dark' });

      expect(result.deduped).toBe(false);
      expect(queue().map((entry) => entry.title)).toEqual(['Lupin', 'Dark']);
    });

    it('keeps a pinned item at the top of the stored order', async () => {
      await add({ title: 'Lupin' });
      await add({ title: 'Dark', url: 'https://www.netflix.com/title/2', pinned: true });

      expect(queue().map((entry) => entry.title)).toEqual(['Dark', 'Lupin']);
      expect(queue().map((entry) => entry.order)).toEqual([0, 1]);
    });
  });

  describe('remove-from-queue', () => {
    beforeEach(() => seed({ id: 'a' }, { id: 'b' }, { id: 'c' }));

    it('removes by id', async () => {
      await expect(handler('remove-from-queue')({}, 'b')).resolves.toBe(true);
      expect(queue().map((entry) => entry.id)).toEqual(['a', 'c']);
    });

    it('removes by index', async () => {
      await handler('remove-from-queue')({}, 0);
      expect(queue().map((entry) => entry.id)).toEqual(['b', 'c']);
    });

    it('renumbers what is left', async () => {
      await handler('remove-from-queue')({}, 'a');
      expect(queue().map((entry) => entry.order)).toEqual([0, 1]);
    });

    it('rejects a target that is neither an id nor an index', async () => {
      await expect(handler('remove-from-queue')({}, null)).rejects.toThrow('Invalid queue target');
      await expect(handler('remove-from-queue')({}, {})).rejects.toThrow('Invalid queue target');
    });

    it('leaves the queue alone when the id is not there', async () => {
      await handler('remove-from-queue')({}, 'nope');
      expect(queue()).toHaveLength(3);
    });
  });

  describe('clear-watch-queue', () => {
    it('empties the queue', async () => {
      seed({ id: 'a' }, { id: 'b' });
      await expect(handler('clear-watch-queue')()).resolves.toBe(true);
      expect(queue()).toEqual([]);
    });
  });

  describe('reorder-watch-queue', () => {
    beforeEach(() => seed({ id: 'a' }, { id: 'b' }, { id: 'c' }));

    it('moves an item down', async () => {
      await expect(handler('reorder-watch-queue')({}, 0, 2)).resolves.toBe(true);
      expect(queue().map((entry) => entry.id)).toEqual(['b', 'c', 'a']);
    });

    it('moves an item up', async () => {
      await handler('reorder-watch-queue')({}, 2, 0);
      expect(queue().map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
    });

    it('renumbers after the move', async () => {
      await handler('reorder-watch-queue')({}, 0, 2);
      expect(queue().map((entry) => entry.order)).toEqual([0, 1, 2]);
    });

    it.each([
      ['non-integers', 0.5, 1],
      ['a negative source', -1, 1],
      ['a negative target', 0, -1],
      ['a source past the end', 9, 0],
      ['a target past the end', 0, 9],
    ])('rejects %s', async (_label, from, to) => {
      await expect(handler('reorder-watch-queue')({}, from, to)).rejects.toThrow(
        'Invalid reorder indexes'
      );
      expect(ctx.store.set).not.toHaveBeenCalled();
    });
  });

  describe('dedupe-watch-queue', () => {
    it('removes repeats and reports how many went', async () => {
      seed(
        { id: 'a', url: 'https://www.netflix.com/title/1' },
        { id: 'b', url: 'https://www.netflix.com/title/1' },
        { id: 'c', url: 'https://www.netflix.com/title/2' }
      );

      await expect(handler('dedupe-watch-queue')()).resolves.toEqual({ removed: 1 });
      expect(queue().map((entry) => entry.id)).toEqual(['a', 'c']);
    });

    // add-to-queue stamps the generic home URL on anything added without one,
    // so keying the dedupe on the URL used to collapse them all into one
    it('does not collapse distinct items that share the generic URL', async () => {
      stored.watchQueue = [
        { id: 'a', title: 'Lupin', url: 'https://www.netflix.com/', order: 0 },
        { id: 'b', title: 'Dark', url: 'https://www.netflix.com/', order: 1 },
        { id: 'c', title: 'Wednesday', url: 'https://www.netflix.com/', order: 2 },
      ];

      await expect(handler('dedupe-watch-queue')()).resolves.toEqual({ removed: 0 });
      expect(queue().map((entry) => entry.title)).toEqual(['Lupin', 'Dark', 'Wednesday']);
    });

    it('still collapses genuine repeats that have no URL', async () => {
      stored.watchQueue = [
        { id: 'a', title: 'Lupin', url: 'https://www.netflix.com/', order: 0 },
        { id: 'b', title: '  lupin ', url: 'https://www.netflix.com/', order: 1 },
      ];

      await expect(handler('dedupe-watch-queue')()).resolves.toEqual({ removed: 1 });
      expect(queue().map((entry) => entry.id)).toEqual(['a']);
    });

    it('reports nothing removed from an already clean queue', async () => {
      seed({ id: 'a' }, { id: 'b' });
      await expect(handler('dedupe-watch-queue')()).resolves.toEqual({ removed: 0 });
    });

    it('keeps the first of a pair and renumbers', async () => {
      seed(
        { id: 'a', url: 'https://www.netflix.com/title/1' },
        { id: 'b', url: 'https://www.netflix.com/title/1' }
      );

      await handler('dedupe-watch-queue')();

      expect(queue()).toEqual([expect.objectContaining({ id: 'a', order: 0 })]);
    });
  });

  describe('pin-watch-queue-item', () => {
    beforeEach(() => seed({ id: 'a' }, { id: 'b' }, { id: 'c' }));

    it('pins an item and floats it to the top', async () => {
      await expect(handler('pin-watch-queue-item')({}, 'c')).resolves.toBe(true);

      expect(queue().map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
      expect(queue()[0].pinned).toBe(true);
    });

    // pinning renumbers, so unpinning leaves the item where the pin put it
    // rather than sending it back to where it came from
    it('unpins without sending the item back down', async () => {
      await handler('pin-watch-queue-item')({}, 'c');
      await handler('pin-watch-queue-item')({}, 'c', false);

      expect(queue().map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
      expect(queue()[0].pinned).toBe(false);
    });

    it('rejects a missing or non-string target', async () => {
      await expect(handler('pin-watch-queue-item')({}, null)).rejects.toThrow(
        'Invalid queue target'
      );
      await expect(handler('pin-watch-queue-item')({}, 7)).rejects.toThrow('Invalid queue target');
    });
  });

  describe('play-next-in-queue', () => {
    it('returns null for an empty queue', async () => {
      await expect(handler('play-next-in-queue')({})).resolves.toBeNull();
      expect(win.loadURL).not.toHaveBeenCalled();
    });

    it('takes the head, loads it, and drops it from the queue', async () => {
      seed({ id: 'a', url: 'https://www.netflix.com/title/1' }, { id: 'b' });

      const played = await handler('play-next-in-queue')({});

      expect(played.id).toBe('a');
      expect(played.lastPlayedAt).toEqual(expect.any(Number));
      expect(win.loadURL).toHaveBeenCalledWith('https://www.netflix.com/title/1');
      expect(queue().map((entry) => entry.id)).toEqual(['b']);
    });

    it('takes a pinned item before an earlier unpinned one', async () => {
      seed({ id: 'a' }, { id: 'b', pinned: true });

      const played = await handler('play-next-in-queue')({});

      expect(played.id).toBe('b');
    });

    it('plays a specific item when given its id', async () => {
      seed({ id: 'a' }, { id: 'b' }, { id: 'c' });

      const played = await handler('play-next-in-queue')({}, 'c');

      expect(played.id).toBe('c');
      expect(queue().map((entry) => entry.id)).toEqual(['a', 'b']);
    });

    it('rejects an id that is not in the queue', async () => {
      seed({ id: 'a' });
      await expect(handler('play-next-in-queue')({}, 'nope')).rejects.toThrow(
        'Queue item not found'
      );
    });

    it('still dequeues when there is no window to load into', async () => {
      seed({ id: 'a' });
      ctx.getMainWindow.mockReturnValue(null);

      await expect(handler('play-next-in-queue')({})).resolves.toMatchObject({ id: 'a' });
      expect(queue()).toEqual([]);
    });

    it('does not load into a destroyed window', async () => {
      seed({ id: 'a' });
      win.isDestroyed.mockReturnValue(true);

      await handler('play-next-in-queue')({});

      expect(win.loadURL).not.toHaveBeenCalled();
    });
  });
});
