import { useCallback, useRef, useState } from "react";
import { GlassCard } from "./GlassCard";
import styles from "../styles/components/AudioPreview.module.css";

const SAMPLE_RATE = 16_000;
const WAVE_POINTS = 200;

interface AudioPreviewProps {
  samples: number[];
  onSend: () => void;
  onDiscard: () => void;
}

function downsampleWaveform(samples: number[], points: number): number[] {
  if (samples.length === 0) return [];
  const chunkSize = Math.max(1, Math.floor(samples.length / points));
  const result: number[] = [];
  for (let i = 0; i < points && i * chunkSize < samples.length; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, samples.length);
    let maxAbs = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(samples[j]);
      if (abs > maxAbs) maxAbs = abs;
    }
    // Normalize i16 range to 0-1
    result.push(maxAbs / 32768);
  }
  return result;
}

function formatDuration(sampleCount: number): string {
  const seconds = sampleCount / SAMPLE_RATE;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function AudioPreview({
  samples,
  onSend,
  onDiscard,
}: AudioPreviewProps) {
  const [playing, setPlaying] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const waveform = downsampleWaveform(samples, WAVE_POINTS);
  const duration = formatDuration(samples.length);

  const handlePlay = useCallback(() => {
    if (playing) {
      // Stop
      sourceRef.current?.stop();
      sourceRef.current = null;
      setPlaying(false);
      return;
    }

    const ctx =
      audioCtxRef.current ?? new AudioContext({ sampleRate: SAMPLE_RATE });
    audioCtxRef.current = ctx;

    const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      channelData[i] = samples[i] / 32768;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      setPlaying(false);
      sourceRef.current = null;
    };
    source.start();
    sourceRef.current = source;
    setPlaying(true);
  }, [playing, samples]);

  const svgWidth = 300;
  const svgHeight = 48;
  const barWidth = svgWidth / WAVE_POINTS;

  return (
    <GlassCard className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>Recording Preview</span>
        <span className={styles.duration}>{duration}</span>
      </div>

      <div className={styles.waveformRow}>
        <button
          className={styles.playBtn}
          onClick={handlePlay}
          aria-label={playing ? "Stop playback" : "Play recording"}
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="3" width="4" height="10" rx="1" />
              <rect x="9" y="3" width="4" height="10" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2.5v11l9-5.5z" />
            </svg>
          )}
        </button>

        <svg
          className={styles.waveform}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
        >
          {waveform.map((v, i) => {
            const h = Math.max(2, v * svgHeight);
            const y = (svgHeight - h) / 2;
            return (
              <rect
                key={i}
                x={i * barWidth}
                y={y}
                width={Math.max(1, barWidth - 0.5)}
                height={h}
                rx={0.5}
                fill="var(--blue)"
                opacity={0.7 + v * 0.3}
              />
            );
          })}
        </svg>
      </div>

      <div className={styles.actions}>
        <button className={styles.discardBtn} onClick={onDiscard}>
          Discard
        </button>
        <button className={styles.sendBtn} onClick={onSend}>
          Send
        </button>
      </div>
    </GlassCard>
  );
}
