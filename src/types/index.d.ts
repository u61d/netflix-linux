export interface AppContext {
  store: import('electron-store');
  logger: Logger;
  mainWindow: import('electron').BrowserWindow | null;
  managers: Record<string, any>;
  services: Record<string, any>;
  setMainWindow(window: import('electron').BrowserWindow): void;
  getMainWindow(): import('electron').BrowserWindow | null;
  registerManager(name: string, manager: any): void;
  getManager(name: string): any;
  registerService(name: string, service: any): void;
  getService(name: string): any;
  cleanup(): Promise<void>;
}

export interface Logger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  silent?: boolean;
  priority?: 'low' | 'high';
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}