// Ponte segura entre o app (página) e o processo principal do Electron.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dquestsDesktop', {
  version: () => ipcRenderer.invoke('app:version'),
  installUpdate: (url, token, onProgress) => {
    const listener = (_e, pct) => onProgress(pct);
    ipcRenderer.on('update:progress', listener);
    return ipcRenderer.invoke('update:install', { url, token }).finally(() => ipcRenderer.removeListener('update:progress', listener));
  },
  netGet: (url, as) => ipcRenderer.invoke('net:get', url, as),
  // A janela só fecha depois que o app termina (salvar na nuvem)
  onClose: fn => ipcRenderer.on('app:closing', () => {
    Promise.resolve().then(fn).catch(() => {}).finally(() => ipcRenderer.send('app:close-ready'));
  }),
  store: {
    get: key => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value),
    remove: key => ipcRenderer.invoke('store:remove', key),
    keys: () => ipcRenderer.invoke('store:keys'),
  },
});
