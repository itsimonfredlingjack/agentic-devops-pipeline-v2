interface SejfaBridge {
  onGlobalShortcut: (callback: (action: string) => void) => void;
}

interface Window {
  sejfa?: SejfaBridge;
}
