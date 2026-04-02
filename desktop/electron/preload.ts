import { contextBridge, ipcRenderer } from "electron";

const runtimeConfig = {
  voiceUrl: process.env.SEJFA_VOICE_URL ?? "http://localhost:8000",
  monitorUrl:
    process.env.SEJFA_MONITOR_API_URL ??
    process.env.SEJFA_MONITOR_URL ??
    "http://localhost:8100",
};

contextBridge.exposeInMainWorld("sejfa", {
  config: runtimeConfig,
  onGlobalShortcut: (
    callback: (
      action:
        | "start-voice-recording"
        | "stop-voice-recording"
        | "toggle-voice",
    ) => void,
  ) => {
    ipcRenderer.on("global-shortcut", (_event, action) => callback(action));
  },
});
