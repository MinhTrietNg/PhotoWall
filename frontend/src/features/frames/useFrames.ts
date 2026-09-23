import { useEffect, useState } from 'react';
import type { FrameRegistry } from '@/types/frame';
import { loadFrames, preloadOverlays } from './frameRegistry';

interface FramesState {
  registry: FrameRegistry | null;
  error: Error | null;
}

/** Loads the frame registry once and warms the overlay images. */
export function useFrames(): FramesState {
  const [state, setState] = useState<FramesState>({ registry: null, error: null });

  useEffect(() => {
    let alive = true;
    loadFrames().then(
      (registry) => {
        if (!alive) return;
        setState({ registry, error: null });
        preloadOverlays(registry.frames);
      },
      (error: Error) => alive && setState({ registry: null, error }),
    );
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
