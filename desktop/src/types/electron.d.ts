interface SejfaBridge {
  config?: {
    voiceUrl: string;
    monitorUrl: string;
  };
  onGlobalShortcut: (callback: (action: string) => void) => void;
}

interface Window {
  sejfa?: SejfaBridge;
}
