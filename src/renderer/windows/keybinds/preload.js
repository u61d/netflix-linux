const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keybindsAPI', {
  getKeybinds: () => ipcRenderer.invoke('get-keybinds'),
  saveKeybinds: (keybinds) => ipcRenderer.invoke('save-keybinds', keybinds),
  resetKeybinds: () => ipcRenderer.invoke('reset-keybinds'),
});

console.log('Keybinds API exposed');
