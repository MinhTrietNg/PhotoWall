/**
 * pw-button — DESIGN-D02.
 *
 * Rules from the design:
 *  - exactly ONE primary per screen;
 *  - `success` only for "Dùng ảnh này" and "Duyệt";
 *  - `text` never stands alone as the CTA.
 * Sizes L/M/S map to 56/48/40. Claude-Plan.md §7.9.
 */
import { Link } from 'react-router-dom';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tonal'
  | 'success'
  | 'destructive'
  | 'text';

export type ButtonSize = 'l' | 'm' | 's';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Mobile CTAs fill the gutter width. */
  block?: boolean;
  /** Renders the red text treatment used by "Gỡ dải ảnh của tôi". */
  dangerText?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  children: ReactNode;
  className?: string;
}

function classes({ variant = 'primary', size = 'l', block, dangerText, className }: CommonProps) {
  return [
    'btn',
    `btn--${variant}`,
    size !== 'l' && `btn--${size}`,
    block && 'btn--block',
    dangerText && 'btn--danger-text',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>;

export function Button({
  variant,
  size,
  block,
  dangerText,
  iconStart,
  iconEnd,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classes({ variant, size, block, dangerText, className, children })}
      {...rest}
    >
      {iconStart}
      <span>{children}</span>
      {iconEnd}
    </button>
  );
}

export type ButtonLinkProps = CommonProps & {
  to: string;
  replace?: boolean;
  state?: unknown;
  'aria-label'?: string;
};

export function ButtonLink({
  to,
  replace,
  state,
  variant,
  size,
  block,
  dangerText,
  iconStart,
  iconEnd,
  children,
  className,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      to={to}
      replace={replace}
      state={state}
      className={classes({ variant, size, block, dangerText, className, children })}
      {...rest}
    >
      {iconStart}
      <span>{children}</span>
      {iconEnd}
    </Link>
  );
}
