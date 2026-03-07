import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// CSS modules are handled by vitest.config.ts css.modules configuration.
// No regex vi.mock needed.

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Mock @tauri-apps/api/event
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

// Mock @tauri-apps/plugin-shell
vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: {
    create: vi.fn(),
  },
  open: vi.fn(),
}));

// Provide __TAURI_INTERNALS__ as undefined by default (non-Tauri env)
// Individual tests can override this when needed
if (!("__TAURI_INTERNALS__" in window)) {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

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

// Mock AudioContext for AudioPreview tests
class MockAudioContext {
  sampleRate = 16000;
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
  get destination() {
    return {};
  }
}

Object.defineProperty(window, "AudioContext", {
  value: MockAudioContext,
  writable: true,
});
