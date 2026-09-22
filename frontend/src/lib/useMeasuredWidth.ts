/**
 * The element's laid-out width, tracked live.
 *
 * Needed where a size has to be known in JS but is decided by CSS — a strip
 * sized by the height left over in a flex column, for instance. Returns 0 until
 * the first observation, so callers must cope with that frame.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';

export function useMeasuredWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') {
      setWidth(el.getBoundingClientRect().width);
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      // borderBoxSize is the spec'd path; contentRect is the fallback.
      const next = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
      setWidth((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
