export interface AppSettings {
  discordEnabled: boolean;
  discordClientId: string;
  rpcRetryMs: number;
  autoCheckUpdates: boolean;
  updateChannel: 'stable' | 'beta';

  playbackSpeed: number;
  autoSkipIntro: boolean;
  autoSkipRecap: boolean;
  autoSkipCredits: boolean;
  autoNextEpisode: boolean;
  autoPauseOnBlur: boolean;
  sessionRestoreEnabled: boolean;

  borderless: boolean;
  alwaysOnTop: boolean;
  startMinimized: boolean;
  theme: string;
  uiTheme: 'netflix-red' | 'ocean' | 'graphite' | 'light';
  compactMode: boolean;

  notificationsEnabled: boolean;
  quietMode: boolean;
  showDetailedStats: boolean;
  networkMetricsEnabled: boolean;
  selectorHealthAlerts: boolean;
  sentryEnabled: boolean;
  crashSafeMode: boolean;
  safeModeActive: boolean;
  crashCount: number;
  lastRunExitedCleanly: boolean;

  screenshotsDir: string;
  screenshotSound: boolean;
  screenshotNotification: boolean;
  screenshotFormat: 'png' | 'jpg' | 'webp';
  screenshotQuality: number;

  healthReminder: boolean;
  reminderInterval: number;

  watchHistory: WatchSession[];
  watchQueue: QueueItem[];
  lastSessionState: {
    title: string;
    season?: number | null;
    episode?: number | null;
    episodeTitle?: string | null;
    duration: number;
    position: number;
    playbackRate: number;
    url?: string | null;
    updatedAt: number;
  } | null;

  currentProfile: string;
  profiles: Record<string, Profile>;

  customKeybinds: Record<string, string>;
  hardwareAcceleration: boolean;
  debugMode: boolean;
  windowStates: Record<string, WindowState>;
}

export interface Profile {
  name: string;
  url: string;
  color: string;
  partition: string;
}

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
}
