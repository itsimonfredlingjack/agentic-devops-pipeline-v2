import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow = null;
let voiceShortcutActive = false;
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 720,
        minWidth: 800,
        minHeight: 500,
        frame: false,
        titleBarStyle: "hiddenInset",
        trafficLightPosition: { x: 16, y: 18 },
        backgroundColor: "#0a0a0f",
        vibrancy: "under-window",
        visualEffectState: "active",
        webPreferences: {
            preload: path.join(__dirname, "../electron/preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    }
    else {
        mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
    }
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
    mainWindow.webContents.on("before-input-event", (event, input) => {
        const isVoiceShortcut = (input.meta || input.control) && input.shift && input.key.toLowerCase() === "v";
        if (input.type === "keyDown" && isVoiceShortcut && !voiceShortcutActive) {
            voiceShortcutActive = true;
            event.preventDefault();
            mainWindow?.webContents.send("global-shortcut", "start-voice-recording");
            return;
        }
        if (voiceShortcutActive &&
            input.type === "keyUp" &&
            ["v", "V", "Meta", "Control", "Shift"].includes(input.key)) {
            voiceShortcutActive = false;
            event.preventDefault();
            mainWindow?.webContents.send("global-shortcut", "stop-voice-recording");
        }
    });
    mainWindow.on("blur", () => {
        if (!voiceShortcutActive)
            return;
        voiceShortcutActive = false;
        mainWindow?.webContents.send("global-shortcut", "stop-voice-recording");
    });
}
app.whenReady().then(() => {
    createWindow();
});
app.on("will-quit", () => {
    voiceShortcutActive = false;
});
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
app.on("activate", () => {
    if (mainWindow === null) {
        createWindow();
    }
});
