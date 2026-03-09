import { useEffect, useRef, useState } from "react";
import { subscribeToMicLevels } from "../lib/audioCapture";

const BUFFER_SIZE = 20;

export function useMicLevel(active: boolean): number[] {
  const [levels, setLevels] = useState<number[]>([]);
  const bufferRef = useRef<number[]>([]);

  useEffect(() => {
    if (!active) {
      bufferRef.current = [];
      setLevels([]);
      return;
    }

    const unsubscribe = subscribeToMicLevels((rms) => {
      const normalized = Math.min(rms * 8, 1);
      const buf = bufferRef.current;
      buf.push(normalized);
      if (buf.length > BUFFER_SIZE) {
        buf.shift();
      }
      setLevels([...buf]);
    });

    return () => {
      unsubscribe();
      bufferRef.current = [];
      setLevels([]);
    };
  }, [active]);

  return levels;
}
