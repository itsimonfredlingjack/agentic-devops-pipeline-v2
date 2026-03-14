import { useEffect, useRef } from "react";
import { useAppStore } from "../stores/appStore";

export function useElapsedTimer() {
  const loopActive = useAppStore((s) => s.loopActive);
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    if (loopActive) {
      startTime.current = Date.now();
      const interval = setInterval(() => {
        if (startTime.current) {
          useAppStore.getState().setElapsedMs(Date.now() - startTime.current);
        }
      }, 1000);

      return () => {
        clearInterval(interval);
      };
    } else {
      startTime.current = null;
    }
  }, [loopActive]);
}
