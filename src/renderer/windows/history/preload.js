const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('historyAPI', {
    getHistory: () => ipcRenderer.invoke('get-watch-history'),
    clearHistory: () => ipcRenderer.invoke('clear-watch-history'),
    exportHistory: () => ipcRenderer.invoke('export-history'),
  });

  console.log('History API exposed successfully');
} catch (error) {
  console.error('Failed to expose history API:', error);
}
