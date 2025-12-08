const WatchHistoryService = require('../../../src/main/services/WatchHistoryService');

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
  },
}));

const setupHistoryHandlers = require('../../../src/main/handlers/history');

function createCtx() {
  const storeData = { watchHistory: [] };

  const store = {
    get: jest.fn((key, fallback) => (key in storeData ? storeData[key] : fallback)),
    set: jest.fn((key, value) => {
      storeData[key] = value;
    }),
  };

  const playbackService = { autoApplySpeed: jest.fn() };
  const rpcManager = { updateFromPlayer: jest.fn() };

  const ctx = {
    store,
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    },
    getService: jest.fn((name) => {
      if (name === 'history') return ctx.historyService;
      if (name === 'playback') return playbackService;
      return null;
    }),
    getManager: jest.fn((name) => {
      if (name === 'rpc') return rpcManager;
      return null;
    }),
  };

  ctx.historyService = new WatchHistoryService(ctx);

  return { ctx, storeData, playbackService, rpcManager };
}

function getHandler(mockHandle, channel) {
  const call = mockHandle.mock.calls.find(([name]) => name === channel);
  return call ? call[1] : null;
}

describe('Watch history IPC and service integration', () => {
  let ctx;
  let storeData;
  let ipcMain;
  let dateNowSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ ctx, storeData } = createCtx());
    ipcMain = require('electron').ipcMain;

    setupHistoryHandlers(ctx);
  });

  afterEach(() => {
    if (dateNowSpy) dateNowSpy.mockRestore();
  });

  it('stores sessions on playback end and clears correctly', async () => {
    const times = [0, 62_000, 130_000, 200_000];
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => times.shift() ?? 200_000);

    const playerUpdateCall = ipcMain.on.mock.calls.find(([name]) => name === 'player:update');
    expect(playerUpdateCall).toBeDefined();
    const playerUpdate = playerUpdateCall[1];

    
    playerUpdate(null, { title: 'Show A', playing: true });
    playerUpdate(null, { title: 'Show A', playing: false });

    
    playerUpdate(null, { title: 'Show B', playing: true });
    playerUpdate(null, { title: 'Show B', playing: false });

    expect(storeData.watchHistory).toHaveLength(2);
    expect(storeData.watchHistory[0].title).toBe('Show B');
    expect(storeData.watchHistory[1].title).toBe('Show A');

    const getHistory = getHandler(ipcMain.handle, 'get-watch-history');
    const clearHistory = getHandler(ipcMain.handle, 'clear-watch-history');

    const history = await getHistory();
    expect(history).toHaveLength(2);

    await clearHistory();
    expect(storeData.watchHistory).toEqual([]);
  });
});