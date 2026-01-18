const path = require('path');
const os = require('os');

let picturesPath;
try {
  const { app } = require('electron');
  picturesPath = app.getPath('pictures');
} catch {
  picturesPath = path.join(os.homedir(), 'Pictures');
}

const EnvironmentDetector = require('../main/utils/environment');
const env = new EnvironmentDetector();

const DEFAULT_KEYBINDS = {
  showStats: 'Ctrl+Shift+S',
  showHistory: 'Ctrl+Shift+H',
  showQueue: 'Ctrl+Shift+Q',
  openSettings: 'Ctrl+,',
  openKeybinds: 'Ctrl+K',
  openProfiles: 'Ctrl+P',
  toggleAlwaysOnTop: 'Ctrl+Shift+T',
  quit: 'Ctrl+Q',
  speedIncrease: 'F8',
  speedDecrease: 'F7',
  speedReset: 'F6',
  resetPlayback: 'Ctrl+Shift+R',
  screenshot: 'F12',
  screenshotClipboard: 'Ctrl+Shift+C',
  pictureInPicture: 'F9',
  toggleDetailedStats: 'Ctrl+Shift+D',
  exportHistory: 'Ctrl+Shift+E',
};

const DEFAULTS = {
  discordEnabled: true,
  discordClientId: '1437240728987369513',
  rpcRetryMs: 7000,

  playbackSpeed: 1.0,
  autoSkipIntro: true,
  autoSkipRecap: true,
  autoSkipCredits: false,
  autoNextEpisode: false,
  autoPauseOnBlur: false,

  borderless: env.isTilingWM(),
  alwaysOnTop: false,
  startMinimized: false,
  theme: 'dark',

  watchHistory: [],
  watchQueue: [],

  notificationsEnabled: true,
  quietMode: false,
  showDetailedStats: false,
  sentryEnabled: false,

  screenshotsDir: path.join(picturesPath, 'Netflix Screenshots'),
  screenshotSound: true,
  screenshotNotification: true,
  screenshotFormat: 'png',
  screenshotQuality: 100,

  healthReminder: false,
  reminderInterval: 60,

  currentProfile: 'default',
  profiles: {
    default: {
      name: 'Default',
      url: 'https://www.netflix.com/',
      color: '#e50914',
      partition: 'persist:default',
    },
  },

  customKeybinds: {},
  hardwareAcceleration: true,
  debugMode: false,

  windowStates: {},
};

module.exports = {
  DEFAULTS,
  DEFAULT_KEYBINDS,
};
