const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('queueAPI', {
  getQueue: () => ipcRenderer.invoke('get-watch-queue'),
  addToQueue: (item) => ipcRenderer.invoke('add-to-queue', item),
  removeFromQueue: (index) => ipcRenderer.invoke('remove-from-queue', index),
});
