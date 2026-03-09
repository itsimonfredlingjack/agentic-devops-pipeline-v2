import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendAudio,
  startRecording,
  stopRecording,
  subscribeToMicLevels,
} from "../lib/audioCapture";

describe("audioCapture", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should reject when microphone permission is denied", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new Error("Permission denied"),
    );

    await expect(startRecording()).rejects.toThrow("Permission denied");
  });

  it("should emit mic levels during recording and return samples on stop", async () => {
    const processorInstances: ScriptProcessorNode[] = [];

    class RecordingAudioContext extends AudioContext {
      createScriptProcessor() {
        const processor = super.createScriptProcessor();
        processorInstances.push(processor);
        return processor;
      }
    }

    vi.stubGlobal("AudioContext", RecordingAudioContext);

    const levels: number[] = [];
    const unsubscribe = subscribeToMicLevels((rms) => {
      levels.push(rms);
    });

    await startRecording();
    processorInstances[0]?.onaudioprocess?.({
      inputBuffer: {
        getChannelData: () => new Float32Array([0.25, -0.25, 0.25, -0.25]),
      },
    } as unknown as AudioProcessingEvent);

    const samples = await stopRecording();

    unsubscribe();

    expect(levels.length).toBeGreaterThan(0);
    expect(samples.length).toBeGreaterThan(0);
  });

  it("should upload WAV audio to the pipeline endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ticket_key: "DEV-1" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await sendAudio([0, 1200, -1200, 3000], "http://localhost:8000");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/pipeline/run/audio");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);

    const file = (init.body as FormData).get("audio");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("recording.wav");
    expect((file as File).type).toBe("audio/wav");
  });

  it("should fall back to the transcribe endpoint on 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "hello" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendAudio([1, 2, 3], "http://localhost:8000/");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://localhost:8000/api/transcribe");
    expect(result._endpoint_used).toBe("transcribe_fallback");
  });
});
