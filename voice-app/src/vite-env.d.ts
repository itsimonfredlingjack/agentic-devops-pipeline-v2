/// <reference types="vite/client" />

interface SejfaDesktopApi {
  isElectron: boolean;
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<boolean>;
}

declare global {
  interface Window {
    sejfaDesktop?: SejfaDesktopApi;
  }
}
