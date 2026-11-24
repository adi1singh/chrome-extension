import { useCallback, useLayoutEffect, useRef } from 'react';

// DOM observers and timers keep one subscription while calling the latest render.
export function useStableCallback(callback) {
  const latest = useRef(callback);
  useLayoutEffect(() => { latest.current = callback; }, [callback]);
  return useCallback((...args) => latest.current(...args), []);
}
