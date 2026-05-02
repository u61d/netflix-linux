const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('queueAPI', {
  getQueue: () => ipcRenderer.invoke('get-watch-queue'),
  addToQueue: (item) => ipcRenderer.invoke('add-to-queue', item),
  removeFromQueue: (index) => ipcRenderer.invoke('remove-from-queue', index),
  clearQueue: () => ipcRenderer.invoke('clear-watch-queue'),
  reorderQueue: (from, to) => ipcRenderer.invoke('reorder-watch-queue', from, to),
  dedupeQueue: () => ipcRenderer.invoke('dedupe-watch-queue'),
  pinItem: (id, pinned) => ipcRenderer.invoke('pin-watch-queue-item', id, pinned),
  playNext: (targetId) => ipcRenderer.invoke('play-next-in-queue', targetId),
});
