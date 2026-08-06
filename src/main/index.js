const { app, BrowserWindow, dialog } = require('electron');
const AppContext = require('./AppContext');
const WindowManager = require('./managers/WindowManager');
const RpcManager = require('./managers/RpcManager');
const KeybindManager = require('./managers/KeybindManager');
const MenuManager = require('./managers/MenuManager');
const TrayManager = require('./managers/TrayManager');
const { setupIpcHandlers } = require('./handlers');
const AutoSkipper = require('./services/AutoSkipper');
const StatsOverlay = require('./services/StatsOverlay');
const HealthReminder = require('./services/HealthReminder');
const ScreenshotService = require('./services/ScreenshotService');
const PlaybackService = require('./services/PlaybackService');
const WatchHistoryService = require('./services/WatchHistoryService');
const SubtitleStyleService = require('./services/SubtitleStyleService');
const WatchPartyService = require('./services/WatchPartyService');

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
}

const SentryManager = require('./utils/sentry');
const UpdateService = require('./services/UpdateService');

const ctx = new AppContext();
const sentryManager = new SentryManager(ctx);
let fatalShutdownRequested = false;

process.on('uncaughtException', (error) => {
  ctx.logger.error('Fatal error:', error);
  sentryManager.captureException(error);
  fatalShutdownRequested = true;
  app.quit();
});

process.on('unhandledRejection', (reason) => {
  ctx.logger.error('Unhandled promise rejection:', reason);
  sentryManager.captureException(reason);
});

global.appContext = ctx;

function configureCrashRecovery() {
  const enabled = ctx.store.get('crashSafeMode', true);
  const lastRunExitedCleanly = ctx.store.get('lastRunExitedCleanly', true);
  let crashCount = Number(ctx.store.get('crashCount', 0)) || 0;
  let safeModeActive = false;

  if (enabled && !lastRunExitedCleanly) {
    crashCount += 1;
    safeModeActive = crashCount >= 2;
  }

  if (!enabled) {
    crashCount = 0;
  }

  ctx.store.set('crashCount', crashCount);
  ctx.store.set('safeModeActive', safeModeActive);
  ctx.store.set('lastRunExitedCleanly', false);

  if (safeModeActive) {
    ctx.logger.warn(`Crash-safe mode activated after ${crashCount} unclean run(s)`);
  } else if (enabled && crashCount > 0) {
    ctx.logger.warn(`Detected unclean shutdown. Crash counter: ${crashCount}`);
  }

  return {
    enabled,
    safeModeActive,
    crashCount,
  };
}

function promptSessionRestore(mainWindow, playbackService, safeModeActive) {
  if (!mainWindow || !playbackService || safeModeActive) return;
  if (!ctx.store.get('sessionRestoreEnabled', true)) return;

  const lastSession = playbackService.getRestorableSession();
  if (!lastSession) return;

  mainWindow.webContents.once('did-finish-load', () => {
    try {
      const response = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        title: 'Restore Session',
        message: `Resume "${lastSession.title}"?`,
        detail: `Last position: ${Math.round(Number(lastSession.position) || 0)}s`,
        buttons: ['Restore', 'Not now'],
        defaultId: 0,
        cancelId: 1,
      });

      if (response !== 0) return;

      setTimeout(async () => {
        const restored = await playbackService.restorePreviousSession();
        if (!restored) {
          ctx.logger.warn('Session restore was requested but no playable video was found');
        }
      }, 1200);
    } catch (error) {
      ctx.logger.error('Session restore prompt failed:', error);
    }
  });
}

async function initializeApp() {
  ctx.registerManager('sentry', sentryManager);
  sentryManager.init();

  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    const windowManager = ctx.getManager('window');
    if (windowManager) {
      windowManager.focusMainWindow();
    }
  });

  const runtimeSafety = configureCrashRecovery();

  if (app.components && typeof app.components.whenReady === 'function') {
    try {
      await app.components.whenReady();
      ctx.logger.info('Widevine CDM components loaded');
      await waitForCdmReady();
      ctx.logger.info('Widevine CDM ready');
    } catch (error) {
      ctx.logger.error('CDM initialization failed:', error);
    }
  } else {
    ctx.logger.warn('Widevine components not available');
  }

  const windowManager = new WindowManager(ctx);
  const rpcManager = new RpcManager(ctx);
  const keybindManager = new KeybindManager(ctx);
  const menuManager = new MenuManager(ctx);
  const trayManager = new TrayManager(ctx);

  ctx.registerManager('window', windowManager);
  ctx.registerManager('rpc', rpcManager);
  ctx.registerManager('keybind', keybindManager);
  ctx.registerManager('menu', menuManager);
  ctx.registerManager('tray', trayManager);

  const autoSkipper = new AutoSkipper(ctx);
  const statsOverlay = new StatsOverlay(ctx);
  const healthReminder = new HealthReminder(ctx);
  const screenshotService = new ScreenshotService(ctx);
  const playbackService = new PlaybackService(ctx);
  const historyService = new WatchHistoryService(ctx);
  const updateService = new UpdateService(ctx);
  const subtitleStyleService = new SubtitleStyleService(ctx);
  const watchPartyService = new WatchPartyService(ctx);

  ctx.registerService('autoSkipper', autoSkipper);
  ctx.registerService('statsOverlay', statsOverlay);
  ctx.registerService('healthReminder', healthReminder);
  ctx.registerService('screenshot', screenshotService);
  ctx.registerService('playback', playbackService);
  ctx.registerService('history', historyService);
  ctx.registerService('update', updateService);
  ctx.registerService('subtitleStyle', subtitleStyleService);
  ctx.registerService('watchParty', watchPartyService);

  const mainWindow = windowManager.createMainWindow();
  ctx.setMainWindow(mainWindow);
  promptSessionRestore(mainWindow, playbackService, runtimeSafety.safeModeActive);

  mainWindow.webContents.on('did-finish-load', () => {
    subtitleStyleService.apply();
  });

  setupIpcHandlers(ctx);
  updateService.scheduleStartupCheck();

  menuManager.setup();
  trayManager.setup();
  keybindManager.register();

  if (!runtimeSafety.safeModeActive) {
    rpcManager.start();
    autoSkipper.start();
  } else {
    dialog
      .showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Crash-safe mode',
        message: 'Crash-safe mode is active',
        detail:
          'Non-essential features are paused for this run. Close the app normally to clear safe mode.',
      })
      .catch(() => {});
  }

  if (!runtimeSafety.safeModeActive && ctx.store.get('showDetailedStats')) {
    statsOverlay.start();
  }

  if (!runtimeSafety.safeModeActive && ctx.store.get('healthReminder')) {
    healthReminder.start();
  }

  if (ctx.store.get('startMinimized') && mainWindow) {
    mainWindow.minimize();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = windowManager.createMainWindow();
      ctx.setMainWindow(win);
    }
  });
}

async function waitForCdmReady(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const components = app.components;
      if (components && components.status && components.status() === 'ready') {
        return;
      }
    } catch (error) {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

app.whenReady().then(initializeApp);

app.on('will-quit', async (event) => {
  event.preventDefault();

  try {
    if (!fatalShutdownRequested) {
      ctx.store.set('lastRunExitedCleanly', true);
      ctx.store.set('crashCount', 0);
      ctx.store.set('safeModeActive', false);
    }

    const autoSkipper = ctx.getService('autoSkipper');
    const statsOverlay = ctx.getService('statsOverlay');
    const healthReminder = ctx.getService('healthReminder');

    if (autoSkipper) autoSkipper.stop();
    if (statsOverlay) statsOverlay.stop();
    if (healthReminder) healthReminder.stop();

    const rpcManager = ctx.getManager('rpc');
    const keybindManager = ctx.getManager('keybind');

    if (rpcManager) rpcManager.stop();
    if (keybindManager) keybindManager.unregisterAll();

    const sentry = ctx.getManager('sentry');
    if (sentry && sentry.enabled) {
      await sentry.cleanup();
    }

    ctx.logger.info('Cleanup complete');
  } catch (error) {
    ctx.logger.error('Cleanup error:', error);
  }
  app.exit(0);
});

app.on('window-all-closed', () => {
  app.quit();
});
