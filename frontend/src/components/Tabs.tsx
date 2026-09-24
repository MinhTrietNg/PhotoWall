/**
 * pw-tabs — DESIGN-D02 / M01. h40, selected bg ink. Only the tab that needs
 * attention carries a count badge ("Chờ duyệt ③", yellow); the others read
 * their count inline — "Đã duyệt · 325", "Đã gỡ · 2".
 * Full `role="tablist"` semantics — Claude-Plan.md §17.
 */
import styles from './Tabs.module.css';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count: number;
  /** Shows the count as the yellow badge instead of " · N". */
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
          {item.tone === 'pending' ? (
            <>
              <span>{item.label}</span>
              <span className={styles.badge}>{item.count}</span>
            </>
          ) : (
            <span>
              {item.label} · {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
