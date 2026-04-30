interface SejfaBridge {
  config?: {
    voiceUrl: string;
    monitorUrl: string;
    apiToken: string;
  };
  onGlobalShortcut: (
    callback: (
      action:
        | "start-voice-recording"
        | "stop-voice-recording"
        | "toggle-voice",
    ) => void,
  ) => void;
}

interface Window {
  sejfa?: SejfaBridge;
}
