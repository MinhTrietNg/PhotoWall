/**
 * The shell every guest screen renders into.
 *
 * It exists so that a screen cannot declare a background without also telling
 * the browser about it. The dark capture screens used to be a bare
 * `<div className="screen screen--dark">`, which painted the page but left
 * Safari's status bar and toolbar cream — the class and the chrome tint were
 * two separate things to remember, and one of them was always forgotten.
 * Here they are one prop.
 */
import type { FormEventHandler, ReactNode } from 'react';
import { useScreenTheme, type ScreenThemeToken } from '@/lib/useScreenTheme';

export type ScreenTone = 'light' | 'dark';

const TONE_TOKEN: Record<ScreenTone, ScreenThemeToken> = {
  light: '--pw-bg',
  dark: '--pw-ink',
};

export interface ScreenProps {
  /** Drives both the page background and the browser chrome. */
  tone?: ScreenTone;
  /**
   * The design lets the capture flow run without scrolling; /me is the one
   * screen expected to scroll on short devices.
   */
  scroll?: boolean;
  /** Renders a <form> instead of a <div>. */
  onSubmit?: FormEventHandler<HTMLFormElement>;
  className?: string;
  children: ReactNode;
}

export function Screen({ tone = 'light', scroll, onSubmit, className, children }: ScreenProps) {
  useScreenTheme(TONE_TOKEN[tone]);

  const classes = [
    'screen',
    tone === 'dark' && 'screen--dark',
    scroll && 'screen--scroll',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (onSubmit) {
    return (
      <form className={classes} onSubmit={onSubmit}>
        {children}
      </form>
    );
  }

  return <div className={classes}>{children}</div>;
}
