const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('profilesAPI', {
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  addProfile: (data) => ipcRenderer.invoke('add-profile', data),
  deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
  switchProfile: (id) => ipcRenderer.invoke('switch-profile', id),
});
