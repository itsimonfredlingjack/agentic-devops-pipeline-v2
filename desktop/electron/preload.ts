import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sejfa", {
  onGlobalShortcut: (callback: (action: string) => void) => {
    ipcRenderer.on("global-shortcut", (_event, action) => callback(action));
  },
});
