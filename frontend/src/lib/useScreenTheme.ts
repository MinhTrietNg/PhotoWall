/**
 * Keeps the browser's own chrome in step with the screen underneath it.
 *
 * In iOS Safari's normal browsing mode the page never draws under the status
 * bar or the bottom toolbar — those strips are chrome, and Safari tints them
 * from <meta name="theme-color">. index.html ships the cream default, so the
 * dark capture screens were framed top and bottom by two cream bands.
 *
 * Three levers are pulled together because no single one is reliable:
 *
 *  1. theme-color — the documented lever, and the only one that reaches the
 *     toolbars. Safari is inconsistent about noticing a mutated `content`, so
 *     the element is REPLACED rather than edited; that it re-reads.
 *  2. color-scheme — tells the engine which way to render the scroll area and
 *     any native affordance, and is what Chrome and Firefox honour.
 *  3. the background on <html> — the canvas, which fills the overscroll
 *     rubber-band and the home-indicator strip, and which Safari falls back to
 *     sampling when it ignores the meta. Not enough on its own, but it means
 *     the two mechanisms have to BOTH fail for the cream band to come back.
 *
 * Colours are read back from the token custom properties, so this never
 * becomes a second place where a brand hex is written down.
 */
import { useEffect } from 'react';

export type ScreenThemeToken = `--pw-${string}`;

export const DEFAULT_SCREEN_THEME: ScreenThemeToken = '--pw-bg';

/** Cream — the value of --pw-bg, used only if the token cannot be resolved. */
const FALLBACK = '#faf7f2';

function resolve(token: ScreenThemeToken): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || FALLBACK;
}

/** Relative luminance, so the scheme follows the colour instead of a hand-kept list. */
function isDark(color: string): boolean {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

function paint(token: ScreenThemeToken) {
  const color = resolve(token);
  const root = document.documentElement;

  root.style.backgroundColor = color;
  root.style.colorScheme = isDark(color) ? 'dark' : 'light';

  // Replace, never mutate: Safari re-reads a new element, not a new attribute.
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = color;
  document.head.appendChild(meta);
}

/**
 * Used by <Screen>, which is the only caller — a screen cannot render its own
 * background without this running, so the two can never drift apart.
 */
export function useScreenTheme(token: ScreenThemeToken) {
  useEffect(() => {
    paint(token);
    return () => paint(DEFAULT_SCREEN_THEME);
  }, [token]);
}
