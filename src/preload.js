'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  crack: () => ipcRenderer.send('crack'),
  hidden: () => ipcRenderer.send('hidden'),
  onSpawn: fn => ipcRenderer.on('spawn', (_e, pos) => fn(pos)),
  onDrop: fn => ipcRenderer.on('drop', () => fn()),
  onDisplayChanged: fn => ipcRenderer.on('display-changed', () => fn()),
});
