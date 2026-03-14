import { app, BrowserWindow, globalShortcut } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow = null;
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
}
app.whenReady().then(() => {
    createWindow();
    globalShortcut.register("CommandOrControl+Shift+V", () => {
        mainWindow?.webContents.send("global-shortcut", "toggle-voice");
    });
});
app.on("will-quit", () => {
    globalShortcut.unregisterAll();
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
