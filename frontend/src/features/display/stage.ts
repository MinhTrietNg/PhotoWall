/**
 * The big screen is drawn at 1920x1080 (DESIGN-D18) and every size in this
 * folder is a stage pixel. The page scales the stage by whichever of the two
 * axes is tighter, then gives the stage the window's own shape: a 16:9 window
 * shows the artboard exactly, a wider one (a browser with its toolbar, a
 * 21:9 panel) gets a longer marquee, a taller one gets the extra height as
 * breathing room. Never a letterbox, so the footer strip always runs edge to
 * edge along the bottom of the screen.
 */
import { useEffect, useState } from 'react';

const STAGE_W = 1920;
const STAGE_H = 1080;

export interface Stage {
  /** Stage px -> screen px. */
  scale: number;
  /** In stage px; at least 1920 x 1080, and the window's aspect ratio. */
  width: number;
  height: number;
}

export function fitStage(): Stage {
  const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  // Rounded up: a sub-pixel short stage would leave a hairline of window
  // showing past the footer. The screen clips the overshoot.
  return {
    scale,
    width: Math.ceil(window.innerWidth / scale),
    height: Math.ceil(window.innerHeight / scale),
  };
}

export function useStage(): Stage {
  const [stage, setStage] = useState(fitStage);
  useEffect(() => {
    const onResize = () => setStage(fitStage());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return stage;
}

/** The part of the stage height beyond the artboard's 1080. */
export function extraHeight(stage: Stage): number {
  return Math.max(0, stage.height - STAGE_H);
}

/** `prefers-reduced-motion: reduce` — the marquee becomes a paged slideshow. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
