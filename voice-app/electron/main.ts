import { app, BrowserWindow, ipcMain, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rendererDistPath = join(__dirname, "../dist/index.html");
const preloadPath = join(__dirname, "preload.cjs");
const isDev = !!process.env.VITE_DEV_SERVER_URL;
const isSmokeTest = process.env.ELECTRON_SMOKE_TEST === "1";

let mainWindow: BrowserWindow | null = null;

function isAllowedOrigin(url: string): boolean {
  return (
    url.startsWith("http://127.0.0.1:5173") ||
    url.startsWith("http://localhost:5173") ||
    url.startsWith("file://")
  );
}

function registerAppHandlers() {
  ipcMain.handle("app:getVersion", () => app.getVersion());
  ipcMain.handle("app:openExternal", async (_event, targetUrl: string) => {
    if (isSmokeTest) {
      return true;
    }

    await shell.openExternal(targetUrl);
    return true;
  });
}

async function runSmokeCheck() {
  if (!mainWindow) return;

  const result = await mainWindow.webContents.executeJavaScript(`
    Promise.resolve().then(async () => {
      if (!window.sejfaDesktop || typeof window.sejfaDesktop.openExternal !== "function") {
        return false;
      }
      return window.sejfaDesktop.openExternal("https://example.com");
    });
  `);

  app.exit(result ? 0 : 1);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      if (permission === "media" && isAllowedOrigin(details.requestingUrl)) {
        callback(true);
        return;
      }
      callback(false);
    },
  );

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedOrigin(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(rendererDistPath);
  }

  if (isSmokeTest) {
    mainWindow.webContents.once("did-finish-load", () => {
      void runSmokeCheck();
    });
  }
}

app.whenReady().then(() => {
  registerAppHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
