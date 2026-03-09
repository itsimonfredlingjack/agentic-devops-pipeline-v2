import { contextBridge, ipcRenderer } from "electron";

const desktopApi = {
  isElectron: true,
  getAppVersion: () => ipcRenderer.invoke("app:getVersion") as Promise<string>,
  openExternal: (url: string) =>
    ipcRenderer.invoke("app:openExternal", url) as Promise<boolean>,
};

contextBridge.exposeInMainWorld("sejfaDesktop", desktopApi);
