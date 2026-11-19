const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petWindow', {
  startDrag: () => ipcRenderer.send('pet-drag-start'),
  moveDrag: () => ipcRenderer.send('pet-drag-move'),
  endDrag: () => ipcRenderer.send('pet-drag-end'),
  showMenu: () => ipcRenderer.send('pet-context-menu'),
  getAssetBytes: (name) => ipcRenderer.invoke('pet-get-asset', name),
  sendAlphaMask: (key, width, height, alpha) =>
    ipcRenderer.send('pet-alpha-mask', key, width, height, alpha),
  setImageKey: (key) => ipcRenderer.send('pet-image-key', key),
});
