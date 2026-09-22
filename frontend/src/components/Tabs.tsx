/**
 * pw-tabs — DESIGN-D02. h40, selected bg ink, count badge tinted per tab.
 * Full `role="tablist"` semantics — Claude-Plan.md §17.
 */
import styles from './Tabs.module.css';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count: number;
  /** Tints the count badge, e.g. yellow for "Chờ duyệt". */
  tone?: 'pending';
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div role="tablist" className={styles.list}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          className={`${styles.tab} ${item.value === value ? styles.selected : ''}`}
          onClick={() => onChange(item.value)}
        >
          <span>{item.label}</span>
          <span className={`${styles.badge} ${item.tone === 'pending' ? styles.pending : ''}`}>
            {item.count}
          </span>
        </button>
      ))}
    </div>
  );
}
