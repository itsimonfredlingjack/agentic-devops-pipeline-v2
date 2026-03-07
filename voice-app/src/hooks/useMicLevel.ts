import { useEffect, useRef, useState } from "react";

const BUFFER_SIZE = 20;
const IS_TAURI = "__TAURI_INTERNALS__" in window;

/**
 * Listen to `mic-level` events from Tauri and maintain a rolling buffer of RMS values.
 * Falls back to empty array in browser mode.
 */
export function useMicLevel(active: boolean): number[] {
  const [levels, setLevels] = useState<number[]>([]);
  const bufferRef = useRef<number[]>([]);

  useEffect(() => {
    if (!active || !IS_TAURI) {
      bufferRef.current = [];
      setLevels([]);
      return;
    }

    let unlisten: (() => void) | null = null;

    // Dynamic import to avoid breaking browser-only dev
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ rms: number }>("mic-level", (event) => {
        // Normalize RMS: typical speech is ~0.01-0.15, clamp to 0-1
        const normalized = Math.min(event.payload.rms * 8, 1);
        const buf = bufferRef.current;
        buf.push(normalized);
        if (buf.length > BUFFER_SIZE) {
          buf.shift();
        }
        setLevels([...buf]);
      }).then((fn) => {
        unlisten = fn;
      });
    });

    return () => {
      unlisten?.();
      bufferRef.current = [];
      setLevels([]);
    };
  }, [active]);

  return levels;
}
