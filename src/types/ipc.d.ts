export interface IpcHandlers {
  
  'get-settings': () => Promise<Partial<AppSettings>>;
  'update-settings': (updates: Partial<AppSettings>) => Promise<boolean>;
  'validate-setting': (key: string, value: any) => Promise<ValidationResult>;
  'choose-screenshot-dir': () => Promise<string | null>;

  'get-watch-history': () => Promise<WatchSession[]>;
  'clear-watch-history': () => Promise<boolean>;
  'export-history': () => Promise<boolean>;

  'get-profiles': () => Promise<{ profiles: Record<string, Profile>; current: string }>;
  'add-profile': (data: { id: string; name: string; url: string }) => Promise<boolean>;
  'delete-profile': (id: string) => Promise<boolean>;
  'switch-profile': (id: string) => Promise<boolean>;
  
  'get-keybinds': () => Promise<Record<string, string>>;
  'save-keybinds': (keybinds: Record<string, string>) => Promise<boolean>;
  'reset-keybinds': () => Promise<boolean>;

  'get-watch-queue': () => Promise<QueueItem[]>;
  'add-to-queue': (item: QueueItem) => Promise<boolean>;
  'remove-from-queue': (index: number) => Promise<boolean>;
}
export interface IpcEvents {
  'player:update': (payload: PlayerState) => void;
  'show-stats': () => void;
  'debug-log': (message: string) => void;
}