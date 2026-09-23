/**
 * pw-input with its label / helper / counter row — DESIGN-D02.
 *
 * Error renders border + halo + icon + text, never colour alone (Claude-Plan.md §17).
 */
import { useId, type InputHTMLAttributes } from 'react';
import { Icon } from './Icon';
import styles from './Field.module.css';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'size'> {
  label: string;
  helper?: string;
  error?: string;
  /** Shows "n/maxLength" on the right of the helper row. */
  counter?: boolean;
}

export function Field({ label, helper, error, counter, maxLength, value, ...rest }: FieldProps) {
  const id = useId();
  const describedBy = `${id}-help`;
  const length = typeof value === 'string' ? value.length : 0;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>

      <input
        id={id}
        className="input"
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={helper || error ? describedBy : undefined}
        {...rest}
      />

      {helper || error || counter ? (
        <div className={styles.helperRow} id={describedBy}>
          <span className={error ? styles.error : styles.helper}>
            {error ? <Icon name="errorCircle" size={16} /> : null}
            <span>{error ?? helper}</span>
          </span>
          {counter && maxLength ? (
            <span className={styles.counter}>
              {length}/{maxLength}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
