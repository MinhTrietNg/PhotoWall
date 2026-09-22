/**
 * pw-icon-button — DESIGN-D02.
 * `label` is mandatory and becomes aria-label: every icon-only control in the
 * design carries one. Claude-Plan.md §17.
 */
import { Link } from 'react-router-dom';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type IconButtonTone = 'light' | 'dark' | 'on-ink';
export type IconButtonSize = 's' | 'm' | 'l';

interface Common {
  /** Becomes aria-label. Required. */
  label: string;
  tone?: IconButtonTone;
  /** s = 40, m = 48 (default), l = 56. */
  size?: IconButtonSize;
  children: ReactNode;
  className?: string;
}

function classes({ tone = 'light', size = 'm', className }: Common) {
  return [
    'ibtn',
    size !== 'm' && `ibtn--${size}`,
    tone === 'dark' && 'ibtn--dark',
    tone === 'on-ink' && 'ibtn--on-ink',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export type IconButtonProps = Common &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>;

export function IconButton({
  label,
  tone,
  size,
  children,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={classes({ label, tone, size, className, children })}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButtonLink({
  to,
  label,
  tone,
  size,
  children,
  className,
}: Common & { to: string }) {
  return (
    <Link to={to} aria-label={label} className={classes({ label, tone, size, className, children })}>
      {children}
    </Link>
  );
}
