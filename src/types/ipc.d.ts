export interface IpcHandlers {
  'get-settings': () => Promise<Partial<AppSettings>>;
  'update-settings': (updates: Partial<AppSettings>) => Promise<boolean>;
  'validate-setting': (key: string, value: any) => Promise<ValidationResult>;
  'choose-screenshot-dir': () => Promise<string | null>;
  'export-settings': () => Promise<string | null>;
  'import-settings': () => Promise<boolean>;
  'check-selector-health': () => Promise<any>;
  'export-selector-health': () => Promise<string | null>;
  'get-update-status': () => Promise<any>;
  'check-updates-now': () => Promise<boolean>;
  'list-update-releases': () => Promise<any[]>;
  'rollback-version': (tag: string) => Promise<string>;
  'restore-session-now': () => Promise<boolean>;
  'exit-safe-mode': () => Promise<boolean>;

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
  'add-to-queue': (item: QueueItem) => Promise<{ added: boolean; deduped: boolean }>;
  'remove-from-queue': (target: number | string) => Promise<boolean>;
  'clear-watch-queue': () => Promise<boolean>;
  'reorder-watch-queue': (from: number, to: number) => Promise<boolean>;
  'dedupe-watch-queue': () => Promise<{ removed: number }>;
  'pin-watch-queue-item': (targetId: string, pinned: boolean) => Promise<boolean>;
  'play-next-in-queue': (targetId?: string) => Promise<QueueItem | null>;
}
export interface IpcEvents {
  'player:update': (payload: PlayerState) => void;
  'show-stats': () => void;
  'debug-log': (message: string) => void;
}
