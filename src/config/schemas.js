const VALIDATION_SCHEMAS = {
  playbackSpeed: {
    type: 'number',
    min: 0.25,
    max: 4.0,
  },
  reminderInterval: {
    type: 'number',
    min: 5,
    max: 240,
  },
  screenshotQuality: {
    type: 'number',
    min: 1,
    max: 100,
  },
  screenshotFormat: {
    type: 'string',
    enum: ['png', 'jpg', 'webp'],
  },
  discordEnabled: {
    type: 'boolean',
  },
  autoSkipIntro: {
    type: 'boolean',
  },
  autoSkipRecap: {
    type: 'boolean',
  },
  autoSkipCredits: {
    type: 'boolean',
  },
  autoNextEpisode: {
    type: 'boolean',
  },
  notificationsEnabled: {
    type: 'boolean',
  },
  quietMode: {
    type: 'boolean',
  },
  borderless: {
    type: 'boolean',
  },
  alwaysOnTop: {
    type: 'boolean',
  },
  startMinimized: {
    type: 'boolean',
  },
  autoPauseOnBlur: {
    type: 'boolean',
  },
  screenshotSound: {
    type: 'boolean',
  },
  screenshotNotification: {
    type: 'boolean',
  },
  healthReminder: {
    type: 'boolean',
  },
  showDetailedStats: {
    type: 'boolean',
  },
  debugMode: {
    type: 'boolean',
  },
  sentryEnabled: {
    type: 'boolean',
  },
};

module.exports = { VALIDATION_SCHEMAS };
