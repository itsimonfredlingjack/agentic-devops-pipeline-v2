const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sejfa", {
  onGlobalShortcut: (callback) => {
    ipcRenderer.on("global-shortcut", (_event, action) => callback(action));
  },
});
