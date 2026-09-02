const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  whipCrack: () => ipcRenderer.send('whip-crack'),
  hideOverlay: () => ipcRenderer.send('hide-overlay'),
  cycleDisplay: () => ipcRenderer.send('cycle-display'),
  onRageEnter: () => ipcRenderer.send('rage-enter'),
  onSpawnWhip: (fn) => ipcRenderer.on('spawn-whip', (e, data) => fn(data)),
  onDropWhip: (fn) => ipcRenderer.on('drop-whip', () => fn()),
  onDisplayChanged: (fn) => ipcRenderer.on('display-changed', (e, data) => fn(data)),
});
