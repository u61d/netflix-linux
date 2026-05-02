declare global {
  interface Window {
    
    electronAPI?: {
      showStats: () => void;
      showWatchHistory: () => void;
      openSettings: () => void;
      toggleAlwaysOnTop: () => void;
      setDiscordEnabled: (enabled: boolean) => void;
      debugLog: (...args: any[]) => void;
    };

    settingsAPI?: {
      getSettings: () => Promise<Partial<AppSettings>>;
      updateSettings: (updates: Partial<AppSettings>) => Promise<boolean>;
      chooseScreenshotDir: () => Promise<string | null>;
      validateSetting: (key: string, value: any) => Promise<ValidationResult>;
      exportSettings: () => Promise<string | null>;
      importSettings: () => Promise<boolean>;
      checkSelectorHealth: () => Promise<any>;
      exportSelectorHealth: () => Promise<string | null>;
      getUpdateStatus: () => Promise<any>;
      checkUpdatesNow: () => Promise<boolean>;
      listUpdateReleases: (force?: boolean) => Promise<any[]>;
      rollbackVersion: (tag: string) => Promise<string>;
      restoreSessionNow: () => Promise<boolean>;
      exitSafeMode: () => Promise<boolean>;
    };

    historyAPI?: {
      getHistory: () => Promise<WatchSession[]>;
      clearHistory: () => Promise<boolean>;
      exportHistory: () => Promise<boolean>;
    };

    profilesAPI?: {
      getProfiles: () => Promise<{ profiles: Record<string, Profile>; current: string }>;
      addProfile: (data: { id: string; name: string; url: string }) => Promise<boolean>;
      deleteProfile: (id: string) => Promise<boolean>;
      switchProfile: (id: string) => Promise<boolean>;
    };

    keybindsAPI?: {
      getKeybinds: () => Promise<Record<string, string>>;
      saveKeybinds: (keybinds: Record<string, string>) => Promise<boolean>;
      resetKeybinds: () => Promise<boolean>;
    };

    queueAPI?: {
      getQueue: () => Promise<QueueItem[]>;
      addToQueue: (item: QueueItem) => Promise<{ added: boolean; deduped: boolean }>;
      removeFromQueue: (target: number | string) => Promise<boolean>;
      clearQueue: () => Promise<boolean>;
      reorderQueue: (from: number, to: number) => Promise<boolean>;
      dedupeQueue: () => Promise<{ removed: number }>;
      pinItem: (id: string, pinned: boolean) => Promise<boolean>;
      playNext: (targetId?: string) => Promise<QueueItem | null>;
    };
  }
}
export {};
