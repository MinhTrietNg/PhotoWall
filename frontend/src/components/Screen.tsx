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

type ScreenTone = 'light' | 'dark';

const TONE_TOKEN: Record<ScreenTone, ScreenThemeToken> = {
  light: '--pw-bg',
  dark: '--pw-ink',
};

interface ScreenProps {
  /** Drives both the page background and the browser chrome. */
  tone?: ScreenTone;
  /** Renders a <form> instead of a <div>. */
  onSubmit?: FormEventHandler<HTMLFormElement>;
  className?: string;
  children: ReactNode;
}

export function Screen({ tone = 'light', onSubmit, className, children }: ScreenProps) {
  useScreenTheme(TONE_TOKEN[tone]);

  const classes = ['screen', tone === 'dark' && 'screen--dark', className]
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
