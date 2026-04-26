import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { applyPipelineServerResult } from "../utils/pipelineFlow";

export type MicrophonePermissionStatus = "unknown" | "prompt" | "granted" | "denied";

const MIME_TYPE_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }

  return MIME_TYPE_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

export function parsePermissionStatus(value: string | undefined): MicrophonePermissionStatus {
  if (value === "prompt" || value === "granted" || value === "denied") {
    return value;
  }
  return "unknown";
}

export function detectPermissionFromError(error: unknown): MicrophonePermissionStatus {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")) {
    return "denied";
  }
  return "unknown";
}

export function useMicrophone() {
  const voiceUrl = useAppStore((s) => s.voiceUrl);

  const [recording, setRecording] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<MicrophonePermissionStatus>("unknown");
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [inputLevel, setInputLevel] = useState(0);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number>(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const levelRafRef = useRef<number | null>(null);

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputDevices = devices.filter((device) => device.kind === "audioinput");
      setAvailableDevices(inputDevices);
      setSelectedDeviceId((currentId) => {
        if (currentId && inputDevices.some((device) => device.deviceId === currentId)) {
          return currentId;
        }
        return inputDevices[0]?.deviceId ?? "";
      });
    } catch {
      // Ignore device listing failures; we still allow default recording.
    }
  }, []);

  const stopAudioMeter = useCallback(() => {
    if (levelRafRef.current !== null) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }

    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;
    analyserRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setInputLevel(0);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current !== null) {
      window.clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const stopMediaStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const startAudioMeter = useCallback((stream: MediaStream) => {
    stopAudioMeter();

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    const sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNode.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    sourceNodeRef.current = sourceNode;

    const samples = new Uint8Array(analyser.frequencyBinCount);

    const sampleLevel = () => {
      const activeAnalyser = analyserRef.current;
      if (!activeAnalyser) {
        return;
      }

      activeAnalyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (const sample of samples) {
        const normalized = sample / 128 - 1;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      setInputLevel(Math.min(1, rms * 3));

      levelRafRef.current = requestAnimationFrame(sampleLevel);
    };

    sampleLevel();
  }, [stopAudioMeter]);

  const handleRecordingUpload = useCallback(async (blob: Blob) => {
    const store = useAppStore.getState();
    store.setPipelineStatus("processing");
    store.setProcessingStep("Transcribing audio...");

    try {
      const form = new FormData();
      form.append("audio", blob, "recording.webm");

      const response = await fetch(`${voiceUrl}/api/pipeline/run/audio`, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        setErrorMessage(`Voice pipeline returned HTTP ${response.status}`);
        store.setPipelineStatus("error");
        return;
      }

      const data = await response.json();
      const result = applyPipelineServerResult(data, {
        setPipelineStatus: store.setPipelineStatus,
        setProcessingStep: store.setProcessingStep,
        setClarification: store.setClarification,
        setPreview: store.setPreview,
        setTicketKey: store.setTicketKey,
      });

      if (result === "unknown") {
        setErrorMessage("Voice pipeline returned an unknown response shape.");
        store.setPipelineStatus("error");
      }
    } catch {
      setErrorMessage("Failed to upload recording to the voice pipeline.");
      store.setPipelineStatus("error");
    }
  }, [voiceUrl]);

  const startRecording = useCallback(async () => {
    if (recording) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("This environment does not support microphone capture.");
      useAppStore.getState().setPipelineStatus("error");
      return;
    }

    if (!selectedDeviceId && availableDevices.length > 0) {
      setSelectedDeviceId(availableDevices[0].deviceId);
    }

    setErrorMessage(null);
    setRecordingDurationMs(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      });

      setPermissionStatus("granted");
      mediaStreamRef.current = stream;
      startAudioMeter(stream);
      await refreshDevices();

      chunksRef.current = [];

      const mimeType = pickSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setErrorMessage("Recording failed. Please check your microphone and try again.");
        useAppStore.getState().setPipelineStatus("error");
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType ?? "audio/webm" });
        mediaRecorderRef.current = null;

        stopDurationTimer();
        stopAudioMeter();
        stopMediaStream();
        setRecording(false);

        if (blob.size === 0) {
          setErrorMessage("No audio was captured. Hold to record and speak clearly.");
          useAppStore.getState().setPipelineStatus("idle");
          return;
        }

        await handleRecordingUpload(blob);
      };

      recorder.start();
      recordingStartRef.current = Date.now();
      durationIntervalRef.current = window.setInterval(() => {
        setRecordingDurationMs(Date.now() - recordingStartRef.current);
      }, 100);
      setRecording(true);

      const store = useAppStore.getState();
      store.setProcessingStep("");
      store.setPipelineStatus("recording");
    } catch (error) {
      setPermissionStatus(detectPermissionFromError(error));
      setErrorMessage("Could not start recording. Check microphone permissions and selection.");
      useAppStore.getState().setPipelineStatus("error");
    }
  }, [
    availableDevices,
    handleRecordingUpload,
    recording,
    refreshDevices,
    selectedDeviceId,
    startAudioMeter,
    stopAudioMeter,
    stopDurationTimer,
    stopMediaStream,
  ]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      stopDurationTimer();
      stopAudioMeter();
      stopMediaStream();
      setRecording(false);
      return;
    }

    recorder.stop();
  }, [stopAudioMeter, stopDurationTimer, stopMediaStream]);

  useEffect(() => {
    void refreshDevices();

    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      return;
    }

    let cancelled = false;
    let permissionHandle: PermissionStatus | null = null;

    const subscribe = async () => {
      try {
        const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (cancelled) {
          return;
        }

        permissionHandle = permission;
        setPermissionStatus(parsePermissionStatus(permission.state));
        permission.onchange = () => {
          setPermissionStatus(parsePermissionStatus(permission.state));
        };
      } catch {
        // Ignore unsupported permission queries.
      }
    };

    void subscribe();

    return () => {
      cancelled = true;
      if (permissionHandle) {
        permissionHandle.onchange = null;
      }
    };
  }, [refreshDevices]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.addEventListener) {
      return;
    }

    const onDeviceChange = () => {
      void refreshDevices();
    };

    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
    };
  }, [refreshDevices]);

  useEffect(() => {
    return () => {
      stopRecording();
      stopDurationTimer();
      stopAudioMeter();
      stopMediaStream();
    };
  }, [stopAudioMeter, stopDurationTimer, stopMediaStream, stopRecording]);

  return {
    recording,
    permissionStatus,
    availableDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    inputLevel,
    recordingDurationMs,
    errorMessage,
    startRecording,
    stopRecording,
  };
}
