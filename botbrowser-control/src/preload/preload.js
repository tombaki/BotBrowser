const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to renderer
contextBridge.exposeInMainWorld('api', {
  // Profiles
  profiles: {
    getAll: () => ipcRenderer.invoke('profiles:getAll'),
    create: (data) => ipcRenderer.invoke('profiles:create', data),
    update: (id, updates) => ipcRenderer.invoke('profiles:update', { id, updates }),
    delete: (id) => ipcRenderer.invoke('profiles:delete', id),
    deleteMultiple: (ids) => ipcRenderer.invoke('profiles:deleteMultiple', ids),
    duplicate: (id) => ipcRenderer.invoke('profiles:duplicate', id),
  },

  // Browser instances
  browser: {
    launch: (profileId) => ipcRenderer.invoke('browser:launch', profileId),
    stop: (profileId) => ipcRenderer.invoke('browser:stop', profileId),
    stopAll: () => ipcRenderer.invoke('browser:stopAll'),
    getRunning: () => ipcRenderer.invoke('browser:getRunning'),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (data) => ipcRenderer.invoke('settings:set', data),
  },

  // Dialogs
  dialog: {
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
    selectExecutable: () => ipcRenderer.invoke('dialog:selectExecutable'),
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  },

  // Shell
  shell: {
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    showItemInFolder: (p) => ipcRenderer.invoke('shell:showItemInFolder', p),
  },

  // Platform info
  platform: process.platform,

  // Event listeners
  on: (channel, callback) => {
    const validChannels = [
      'navigate', 'action',
      'instance:started', 'instance:stopped', 'instance:error',
      'profile:statusChanged', 'profile:cookiesSaved'
    ];
    if (validChannels.includes(channel)) {
      const sub = (_, ...args) => callback(...args);
      ipcRenderer.on(channel, sub);
      return () => ipcRenderer.removeListener(channel, sub);
    }
  },

  once: (channel, callback) => {
    ipcRenderer.once(channel, (_, ...args) => callback(...args));
  }
});