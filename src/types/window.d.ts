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
      addToQueue: (item: QueueItem) => Promise<boolean>;
      removeFromQueue: (index: number) => Promise<boolean>;
    };
  }
}
export {};