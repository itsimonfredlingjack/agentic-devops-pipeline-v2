const TARGET_SAMPLE_RATE = 16_000;

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let processorNode: ScriptProcessorNode | null = null;
let silenceNode: GainNode | null = null;
let recordedChunks: Float32Array[] = [];
let inputSampleRate = TARGET_SAMPLE_RATE;
let recordingActive = false;

const micLevelListeners = new Set<(rms: number) => void>();

function emitMicLevel(rms: number) {
  for (const listener of micLevelListeners) {
    listener(rms);
  }
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function resampleLinear(input: Float32Array, inputRate: number, outputRate: number) {
  if (input.length === 0 || inputRate === outputRate) {
    return input;
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const baseIndex = Math.floor(position);
    const nextIndex = Math.min(baseIndex + 1, input.length - 1);
    const fraction = position - baseIndex;
    output[index] = input[baseIndex] + (input[nextIndex] - input[baseIndex]) * fraction;
  }

  return output;
}

function convertToInt16Pcm(samples: Float32Array): number[] {
  return Array.from(samples, (sample) =>
    Math.max(-1, Math.min(1, sample)) < 0
      ? Math.round(Math.max(-1, Math.min(1, sample)) * 0x8000)
      : Math.round(Math.max(-1, Math.min(1, sample)) * 0x7fff),
  );
}

function encodeWav(samples: number[], sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeAscii(offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, samples.length * 2, true);

  samples.forEach((sample, index) => {
    view.setInt16(44 + index * 2, sample, true);
  });

  return new Blob([buffer], { type: "audio/wav" });
}

async function postAudio(url: string, wavBlob: Blob) {
  const formData = new FormData();
  formData.append("audio", wavBlob, "recording.wav");

  return fetch(url, {
    method: "POST",
    body: formData,
  });
}

async function parseJsonResponse(response: Response, endpointLabel: string) {
  const result = (await response.json()) as Record<string, unknown>;
  result._endpoint_used = endpointLabel;
  return result;
}

async function cleanupRecordingState() {
  processorNode?.disconnect();
  sourceNode?.disconnect();
  silenceNode?.disconnect();
  mediaStream?.getTracks().forEach((track) => track.stop());

  processorNode = null;
  sourceNode = null;
  silenceNode = null;
  mediaStream = null;

  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }

  emitMicLevel(0);
}

export function subscribeToMicLevels(listener: (rms: number) => void) {
  micLevelListeners.add(listener);
  return () => {
    micLevelListeners.delete(listener);
  };
}

export async function startRecording() {
  if (recordingActive) {
    throw new Error("Already recording");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
  });

  const context = new AudioContext();
  await context.resume();

  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const silence = context.createGain();
  silence.gain.value = 0;

  recordedChunks = [];
  inputSampleRate = context.sampleRate;
  mediaStream = stream;
  audioContext = context;
  sourceNode = source;
  processorNode = processor;
  silenceNode = silence;
  recordingActive = true;

  processor.onaudioprocess = (event) => {
    if (!recordingActive) {
      return;
    }

    const channelData = event.inputBuffer.getChannelData(0);
    const snapshot = new Float32Array(channelData.length);
    snapshot.set(channelData);
    recordedChunks.push(snapshot);

    const sumSquares = snapshot.reduce((sum, value) => sum + value * value, 0);
    const rms = Math.sqrt(sumSquares / snapshot.length);
    emitMicLevel(rms);
  };

  source.connect(processor);
  processor.connect(silence);
  silence.connect(context.destination);
}

export async function stopRecording() {
  if (!recordingActive) {
    throw new Error("Not recording");
  }

  recordingActive = false;
  const samples = mergeChunks(recordedChunks);
  recordedChunks = [];
  await cleanupRecordingState();

  const resampled = resampleLinear(samples, inputSampleRate, TARGET_SAMPLE_RATE);
  return convertToInt16Pcm(resampled);
}

export async function sendAudio(samples: number[], serverUrl: string) {
  const wavBlob = encodeWav(samples, TARGET_SAMPLE_RATE);
  const baseUrl = serverUrl.trim().replace(/\/+$/, "");
  const pipelineUrl = `${baseUrl}/api/pipeline/run/audio`;
  const fallbackUrl = `${baseUrl}/api/transcribe`;

  const pipelineResponse = await postAudio(pipelineUrl, wavBlob);

  if (pipelineResponse.ok) {
    return parseJsonResponse(pipelineResponse, "pipeline_run_audio");
  }

  if (
    pipelineResponse.status !== 404 &&
    pipelineResponse.status !== 405
  ) {
    const body = await pipelineResponse.text();
    throw new Error(
      `Server error ${pipelineResponse.status} on /api/pipeline/run/audio: ${body}`,
    );
  }

  const fallbackResponse = await postAudio(fallbackUrl, wavBlob);

  if (!fallbackResponse.ok) {
    const body = await fallbackResponse.text();
    throw new Error(`Server error ${fallbackResponse.status}: ${body}`);
  }

  return parseJsonResponse(fallbackResponse, "transcribe_fallback");
}
