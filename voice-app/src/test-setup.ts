import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock localStorage for jsdom
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

Object.defineProperty(window, "sejfaDesktop", {
  value: {
    isElectron: true,
    getAppVersion: vi.fn(async () => "0.1.0"),
    openExternal: vi.fn(async () => true),
  },
  writable: true,
  configurable: true,
});

// Mock AudioContext for AudioPreview tests
class MockAudioContext {
  sampleRate = 16000;
  state: AudioContextState = "running";
  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      getChannelData: () => new Float32Array(length),
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
    };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
  }
  createMediaStreamSource() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createScriptProcessor() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null as ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null,
    };
  }
  createGain() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: {
        value: 1,
      },
    };
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
  get destination() {
    return {};
  }
}

Object.defineProperty(window, "AudioContext", {
  value: MockAudioContext,
  writable: true,
  configurable: true,
});

Object.defineProperty(navigator, "mediaDevices", {
  value: {
    getUserMedia: vi.fn(async () => ({
      getTracks: () => [
        {
          stop: vi.fn(),
        },
      ],
    })),
  },
  configurable: true,
});
