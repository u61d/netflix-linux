const { contextBridge, ipcRenderer } = require('electron');

console.log('[Settings Preload] Loading...');

try {
  contextBridge.exposeInMainWorld('settingsAPI', {
    getSettings: () => {
      console.log('[Settings API] getSettings called');
      return ipcRenderer.invoke('get-settings');
    },
    updateSettings: (updates) => {
      console.log('[Settings API] updateSettings called with:', updates);
      return ipcRenderer.invoke('update-settings', updates);
    },
    chooseScreenshotDir: () => {
      console.log('[Settings API] chooseScreenshotDir called');
      return ipcRenderer.invoke('choose-screenshot-dir');
    },
    validateSetting: (key, value) => {
      console.log('[Settings API] validateSetting called:', key, value);
      return ipcRenderer.invoke('validate-setting', key, value);
    },
    exportSettings: () => {
      console.log('[Settings API] exportSettings called');
      return ipcRenderer.invoke('export-settings');
    },
    importSettings: () => {
      console.log('[Settings API] importSettings called');
      return ipcRenderer.invoke('import-settings');
    },
  });

  console.log('[Settings Preload] API exposed successfully');
} catch (error) {
  console.error('[Settings Preload] Failed to expose API:', error);
}
