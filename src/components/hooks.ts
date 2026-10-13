import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store/gameStore';

/**
 * A slower-moving copy of the store's `version`, updated at most every `ms`
 * milliseconds. Heavy views (charts, long lists) key their memoised data on
 * it so the interface stays light while the simulation runs at high speed.
 */
export function useThrottledVersion(ms: number): number {
  const version = useGame((s) => s.version);
  const running = useGame((s) => s.running);
  const [slow, setSlow] = useState(version);
  const last = useRef(0);
  useEffect(() => {
    const now = performance.now();
    // When paused, every change is a deliberate action: reflect it at once.
    const wait = running ? ms - (now - last.current) : 0;
    if (wait <= 0) {
      last.current = now;
      setSlow(version);
      return;
    }
    const t = window.setTimeout(() => {
      last.current = performance.now();
      setSlow(version);
    }, wait);
    return () => window.clearTimeout(t);
  }, [version, ms, running]);
  return slow;
}
