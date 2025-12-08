export interface WatchSession {
  title: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  startTime: number;
  startTimestamp: string;
  endTime?: number;
  endTimestamp?: string;
  duration: number;
  durationSeconds: number;
}

export interface WatchStats {
  totalMinutes: number;
  totalSessions: number;
  avgSession: number;
  mostWatched: {
    title: string;
    minutes: number;
  } | null;
  recentShows: Array<{
    title: string;
    season?: number;
    episode?: number;
    lastWatched: string;
  }>;
}

export interface QueueItem {
  title: string;
  url?: string;
  addedAt: number;
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'txt';
  filePath: string;
}