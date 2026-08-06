const { contextBridge, ipcRenderer, clipboard } = require('electron');

try {
  contextBridge.exposeInMainWorld('watchPartyAPI', {
    getDisplayName: () => ipcRenderer.invoke('watch-party:get-display-name'),
    setDisplayName: (name) => ipcRenderer.invoke('watch-party:set-display-name', name),
    getCurrentState: () => ipcRenderer.invoke('watch-party:get-current-state'),
    applyRemoteCommand: (action, payload) =>
      ipcRenderer.invoke('watch-party:apply-remote', { action, payload }),
    setActive: (isActive) => ipcRenderer.send('watch-party:set-active', isActive),
    copyText: (text) => clipboard.writeText(String(text || '')),
    onLocalEvent: (callback) => {
      if (typeof callback !== 'function') return;
      ipcRenderer.on('watch-party:local-event', (_event, data) => callback(data));
    },
  });

  console.log('Watch Party API exposed successfully');
} catch (error) {
  console.error('Failed to expose Watch Party API:', error);
}
