const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('historyAPI', {
    getHistory: () => ipcRenderer.invoke('get-watch-history'),
    clearHistory: () => ipcRenderer.invoke('clear-watch-history'),
    exportHistory: () => ipcRenderer.invoke('export-history'),
    onUpdated: (callback) => {
      if (typeof callback !== 'function') return;
      const handler = () => callback();
      ipcRenderer.on('history:updated', handler);
    },
    onData: (callback) => {
      if (typeof callback !== 'function') return;
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('history:data', handler);
    },
    requestHistory: () => ipcRenderer.send('history:request'),
  });

  console.log('History API exposed successfully');
  ipcRenderer.send('history:ready');
} catch (error) {
  console.error('Failed to expose history API:', error);
}
