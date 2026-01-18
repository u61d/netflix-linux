const { BrowserWindow, session } = require('electron');
const path = require('path');
const { ASSETS } = require('../../config/constants');

class WindowManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.windows = new Map();
    this.windowStates = new Map();
    this.hyprlandPoller = null;
    this.hyprlandState = {
      lastVisible: true,
      windowPid: null,
      hyprctlAvailable: true,
    };
  }

  createMainWindow() {
    const { store, logger } = this.ctx;

    const pendingSwitch = store.get('pendingProfileSwitch');
    if (pendingSwitch) {
      store.delete('pendingProfileSwitch');
      store.set('currentProfile', pendingSwitch);
    }

    const profiles = store.get('profiles', this.getDefaultProfiles());
    const currentProfileId = store.get('currentProfile', 'default');
    const currentProfile = profiles[currentProfileId] || profiles.default;
    const sessionPartition = currentProfile.partition || 'persist:default';

    logger.info(`Creating main window with profile: ${currentProfile.name}`);

    const windowState = this.loadWindowState('main') || {
      width: 1280,
      height: 800,
      x: undefined,
      y: undefined,
    };

    const win = new BrowserWindow({
      ...windowState,
      minWidth: 960,
      minHeight: 540,
      backgroundColor: '#000000',
      title: `Netflix - ${currentProfile.name}`,
      icon: ASSETS.icon,
      autoHideMenuBar: true,
      frame: !store.get('borderless', false),
      titleBarStyle: store.get('borderless', false) ? 'hidden' : 'hiddenInset',
      alwaysOnTop: store.get('alwaysOnTop', false),
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../../renderer/windows/main/preload.js'),
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false,
        spellcheck: false,
        plugins: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        partition: sessionPartition,
      },
    });

    this.configureSession(sessionPartition);

    this.setUserAgent(win);

    this.trackWindowState(win, 'main');

    win.once('ready-to-show', () => {
      win.show();
      if (store.get('startMinimized')) {
        win.minimize();
      }
    });

    const url = currentProfile.url || 'https://www.netflix.com/';
    win.loadURL(url);

    win.webContents.once('did-finish-load', () => {
      logger.info(`Loaded profile "${currentProfile.name}" at ${url}`);
    });

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      logger.error('Main window failed to load', { errorCode, errorDescription, validatedURL });
    });

    const maybeAutoPause = (reason) => {
      if (!store.get('autoPauseOnBlur', false)) return;
      const playbackService = this.ctx.getService('playback');
      if (!playbackService) return;
      playbackService.pauseIfPlaying(reason);
    };

    const maybeAutoResume = (reason) => {
      if (!store.get('autoPauseOnBlur', false)) return;
      const playbackService = this.ctx.getService('playback');
      if (!playbackService) return;
      playbackService.resumeIfAutoPaused(reason);
    };

    win.on('blur', () => maybeAutoPause('blur'));
    win.on('focus', () => maybeAutoResume('focus'));
    win.on('hide', () => maybeAutoPause('hide'));
    win.on('minimize', () => maybeAutoPause('minimize'));
    win.on('restore', () => maybeAutoResume('restore'));
    win.on('show', () => maybeAutoResume('show'));
    this.setupHyprlandAutoPause(win, maybeAutoPause);

    this.windows.set('main', win);
    return win;
  }

  createSettingsWindow() {
    return this.createChildWindow('settings', {
      width: 540,
      height: 760,
      resizable: false,
      title: 'Settings',
      htmlFile: 'settings/index.html',
      preload: 'settings/preload.js',
    });
  }

  createHistoryWindow() {
    return this.createChildWindow('history', {
      width: 700,
      height: 800,
      resizable: true,
      minWidth: 500,
      minHeight: 400,
      title: 'Watch History',
      htmlFile: 'history/index.html',
      preload: 'history/preload.js',
    });
  }

  createProfilesWindow() {
    return this.createChildWindow('profiles', {
      width: 540,
      height: 640,
      resizable: false,
      title: 'Manage Profiles',
      htmlFile: 'profiles/index.html',
      preload: 'profiles/preload.js',
    });
  }

  createKeybindsWindow() {
    return this.createChildWindow('keybinds', {
      width: 640,
      height: 760,
      resizable: false,
      title: 'Customize Shortcuts',
      htmlFile: 'keybinds/index.html',
      preload: 'keybinds/preload.js',
    });
  }

  createQueueWindow() {
    return this.createChildWindow('queue', {
      width: 620,
      height: 740,
      resizable: true,
      minWidth: 400,
      minHeight: 300,
      title: 'Watch Queue',
      htmlFile: 'queue/index.html',
      preload: 'queue/preload.js',
    });
  }

  createChildWindow(name, options) {
    if (this.windows.has(name)) {
      const existing = this.windows.get(name);
      if (!existing.isDestroyed()) {
        existing.focus();
        return existing;
      }
    }

    const mainWindow = this.windows.get('main');
    const windowState = this.loadWindowState(name) || {};

    const win = new BrowserWindow({
      width: options.width,
      height: options.height,
      x: windowState.x,
      y: windowState.y,
      resizable: options.resizable !== false,
      minWidth: options.minWidth,
      minHeight: options.minHeight,
      title: options.title,
      parent: mainWindow,
      modal: false,
      autoHideMenuBar: true,
      backgroundColor: '#0b0b0d',
      webPreferences: {
        preload: path.join(__dirname, '../../renderer/windows', options.preload),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
      },
    });

    win.loadFile(path.join(__dirname, '../../renderer/windows', options.htmlFile));

    if (options.resizable !== false) {
      this.trackWindowState(win, name);
    }

    win.on('closed', () => {
      this.windows.delete(name);
    });

    this.windows.set(name, win);
    return win;
  }

  focusMainWindow() {
    const mainWindow = this.windows.get('main');
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  }

  configureSession(partition) {
    const profileSession = session.fromPartition(partition);
    const chromeVersion = (process.versions.chrome || '120.0.0.0').split('.')[0];

    const filter = { urls: ['https://www.netflix.com/*', 'https://*.netflix.com/*'] };

    profileSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
      const headers = details.requestHeaders;
      headers['sec-ch-ua'] =
        `"Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}"`;
      headers['sec-ch-ua-platform'] = '"Linux"';
      headers['sec-ch-ua-mobile'] = '?0';
      callback({ requestHeaders: headers });
    });

    profileSession.webRequest.onHeadersReceived(filter, (details, callback) => {
      const headers = details.responseHeaders || {};
      delete headers['x-frame-options'];
      delete headers['X-Frame-Options'];
      callback({ responseHeaders: headers });
    });
  }

  setUserAgent(window) {
    const chromeVersion = (process.versions.chrome || '120.0.0.0').split('.')[0];
    const userAgent = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/537.36`;
    window.webContents.setUserAgent(userAgent);
  }

  trackWindowState(window, name) {
    const saveState = () => {
      if (!window.isDestroyed() && !window.isMinimized()) {
        const bounds = window.getBounds();
        this.windowStates.set(name, bounds);
        this.saveWindowState(name, bounds);
      }
    };

    window.on('resize', saveState);
    window.on('move', saveState);
  }

  loadWindowState(name) {
    try {
      const state = this.ctx.store.get(`windowStates.${name}`);
      return state || null;
    } catch {
      return null;
    }
  }

  saveWindowState(name, state) {
    try {
      const states = this.ctx.store.get('windowStates', {});
      states[name] = state;
      this.ctx.store.set('windowStates', states);
    } catch (error) {
      this.ctx.logger.error('Failed to save window state:', error);
    }
  }

  getDefaultProfiles() {
    return {
      default: {
        name: 'Default',
        url: 'https://www.netflix.com/',
        color: '#e50914',
        partition: 'persist:default',
      },
    };
  }

  cleanup() {
    this.windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.close();
      }
    });
    this.windows.clear();
  }

  setupHyprlandAutoPause(win, maybeAutoPause) {
    const EnvironmentDetector = require('../utils/environment');
    const env = new EnvironmentDetector();
    if (!env.isHyprland()) return;

    const { execFile } = require('child_process');

    const queryHyprctl = (args) =>
      new Promise((resolve) => {
        execFile('hyprctl', args, { timeout: 400 }, (error, stdout) => {
          if (error) {
            if (error.code === 'ENOENT') {
              this.hyprlandState.hyprctlAvailable = false;
            }
            return resolve(null);
          }
          try {
            resolve(JSON.parse(stdout));
          } catch {
            resolve(null);
          }
        });
      });

    const updatePid = () => {
      if (win.isDestroyed()) return;
      try {
        const pid = win.webContents.getOSProcessId();
        if (pid) this.hyprlandState.windowPid = pid;
      } catch {
        // ignore
      }
    };

    updatePid();
    win.webContents.on('did-finish-load', updatePid);

    if (this.hyprlandPoller) return;

    const poll = async () => {
      if (win.isDestroyed()) return;
      if (!this.ctx.store.get('autoPauseOnBlur', false)) return;
      if (!this.hyprlandState.hyprctlAvailable) return;

      const windowPid = this.hyprlandState.windowPid;
      if (!windowPid) {
        updatePid();
        return;
      }

      const [activeWorkspace, clients] = await Promise.all([
        queryHyprctl(['activeworkspace', '-j']),
        queryHyprctl(['clients', '-j']),
      ]);

      if (!activeWorkspace || !Array.isArray(clients)) return;

      const client = clients.find((entry) => entry.pid === windowPid);
      if (!client) return;

      const activeId = activeWorkspace.id ?? activeWorkspace.ID ?? activeWorkspace.workspace?.id;
      const clientWsId = client.workspace?.id ?? client.workspace?.ID;
      if (activeId == null || clientWsId == null) return;

      const isVisible = activeId === clientWsId;
      const wasVisible = this.hyprlandState.lastVisible;
      this.hyprlandState.lastVisible = isVisible;

      if (wasVisible && !isVisible) {
        maybeAutoPause('workspace-switch');
      }

      if (!wasVisible && isVisible) {
        const playbackService = this.ctx.getService('playback');
        playbackService?.resumeIfAutoPaused('workspace-switch');
      }
    };

    this.hyprlandPoller = setInterval(poll, 2000);
    win.on('closed', () => {
      clearInterval(this.hyprlandPoller);
      this.hyprlandPoller = null;
    });
  }
}

module.exports = WindowManager;
