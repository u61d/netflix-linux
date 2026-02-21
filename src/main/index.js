const { app, BrowserWindow } = require('electron');
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

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
}

const SentryManager = require('./utils/sentry');
const UpdateService = require('./services/UpdateService');

const ctx = new AppContext();
const sentryManager = new SentryManager(ctx);

process.on('uncaughtException', (error) => {
  ctx.logger.error('Fatal error:', error);
  sentryManager.captureException(error);
  app.quit();
});

process.on('unhandledRejection', (reason) => {
  ctx.logger.error('Unhandled promise rejection:', reason);
  sentryManager.captureException(reason);
});

global.appContext = ctx;

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

  ctx.registerService('autoSkipper', autoSkipper);
  ctx.registerService('statsOverlay', statsOverlay);
  ctx.registerService('healthReminder', healthReminder);
  ctx.registerService('screenshot', screenshotService);
  ctx.registerService('playback', playbackService);
  ctx.registerService('history', historyService);
  ctx.registerService('update', updateService);

  const mainWindow = windowManager.createMainWindow();
  ctx.setMainWindow(mainWindow);

  setupIpcHandlers(ctx);
  updateService.scheduleStartupCheck();

  menuManager.setup();
  trayManager.setup();
  keybindManager.register();

  rpcManager.start();
  autoSkipper.start();

  if (ctx.store.get('showDetailedStats')) {
    statsOverlay.start();
  }

  if (ctx.store.get('healthReminder')) {
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
