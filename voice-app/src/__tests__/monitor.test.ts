import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSocket, ioMock } = vi.hoisted(() => {
  const socket = {
    on: vi.fn(),
    disconnect: vi.fn(),
  };

  return {
    mockSocket: socket,
    ioMock: vi.fn(() => socket),
  };
});

vi.mock("socket.io-client", () => ({
  io: ioMock,
}));

import { connectMonitorSocket, disconnectMonitorSocket } from "../lib/monitor";

describe("monitor connection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    ioMock.mockClear();
    mockSocket.on.mockClear();
    mockSocket.disconnect.mockClear();
  });

  it("should fall back to localhost:8110 when localhost:8100 is not a SEJFA monitor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (input === "http://localhost:8100/status") {
          return {
            ok: false,
            json: async () => ({}),
          };
        }

        return {
          ok: true,
          json: async () => ({ active: false }),
        };
      }),
    );

    const appendLog = vi.fn();
    const onConnectionChange = vi.fn();
    const onResolvedUrl = vi.fn();

    connectMonitorSocket(() => "http://localhost:8100", {
      appendLog,
      onConnectionChange,
      onResolvedUrl,
      onToolEvent: vi.fn(),
      onCostUpdate: vi.fn(),
      onStuckAlert: vi.fn(),
      onSessionStart: vi.fn(),
      onSessionComplete: vi.fn(),
      onPipelineStage: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(onResolvedUrl).toHaveBeenCalledWith("http://localhost:8110");
      expect(ioMock).toHaveBeenCalledWith("http://localhost:8110/monitor", {
        transports: ["websocket"],
        reconnection: true,
      });
    });

    disconnectMonitorSocket();
  });
});
