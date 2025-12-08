export interface AppSettings {
  discordEnabled: boolean;
  discordClientId: string;
  rpcRetryMs: number;

  playbackSpeed: number;
  autoSkipIntro: boolean;
  autoSkipCredits: boolean;
  autoNextEpisode: boolean;
  autoPauseOnBlur: boolean;

  borderless: boolean;
  alwaysOnTop: boolean;
  startMinimized: boolean;
  theme: string;

  notificationsEnabled: boolean;
  quietMode: boolean;
  showDetailedStats: boolean;
  sentryEnabled: boolean;

  screenshotsDir: string;
  screenshotSound: boolean;
  screenshotNotification: boolean;
  screenshotFormat: 'png' | 'jpg' | 'webp';
  screenshotQuality: number;

  healthReminder: boolean;
  reminderInterval: number;

  watchHistory: WatchSession[];
  watchQueue: QueueItem[];

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