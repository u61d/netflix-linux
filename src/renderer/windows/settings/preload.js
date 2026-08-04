const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('settingsAPI', {
    getSettings: () => ipcRenderer.invoke('get-settings'),
    updateSettings: (updates) => ipcRenderer.invoke('update-settings', updates),
    chooseScreenshotDir: () => ipcRenderer.invoke('choose-screenshot-dir'),
    validateSetting: (key, value) => ipcRenderer.invoke('validate-setting', key, value),
    exportSettings: () => ipcRenderer.invoke('export-settings'),
    importSettings: () => ipcRenderer.invoke('import-settings'),
    checkSelectorHealth: () => ipcRenderer.invoke('check-selector-health'),
    exportSelectorHealth: () => ipcRenderer.invoke('export-selector-health'),
    getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
    checkUpdatesNow: () => ipcRenderer.invoke('check-updates-now'),
    listUpdateReleases: (force) => ipcRenderer.invoke('list-update-releases', force),
    rollbackVersion: (tag) => ipcRenderer.invoke('rollback-version', tag),
    restoreSessionNow: () => ipcRenderer.invoke('restore-session-now'),
    exitSafeMode: () => ipcRenderer.invoke('exit-safe-mode'),
    reapplySubtitleStyle: () => ipcRenderer.invoke('reapply-subtitle-style'),
    checkSubtitleSelectors: () => ipcRenderer.invoke('check-subtitle-selectors'),
  });
} catch (error) {
  console.error('[Settings Preload] Failed to expose API:', error);
}
