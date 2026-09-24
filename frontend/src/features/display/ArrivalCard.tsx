/**
 * pw-arrival-card — "Vừa lên Wall!". DESIGN-D19.
 *
 * Only the card itself: its phases are driven by Wall, which also owns the dim
 * layer and the strip that flies from here to the head of the track. `stripRef`
 * is how Wall finds where that flight starts.
 */
import type { Ref } from 'react';
import { useDisplayBackend, type Photo } from '@/lib/backend';
import { itemPhotos, type ArrivalItem } from './arrivalQueue';
import { shownName } from './shownName';
import { useStripSrc } from './stripSrc';
import styles from './ArrivalCard.module.css';

export type CardPhase = 'rise' | 'hold' | 'fly';

/**
 * DESIGN-D19's seven chips: [left, top, size, colour, radius, rotate]. Four sit
 * where drawn. Three landed on the name or the copy once the text is centred
 * and a name runs to four lines, so they move out of its way: the green at
 * (540, 150) up above the name, the red at (520, 380) and the green at
 * (470, 560) down into the free corner under the text.
 */
const CONFETTI = [
  [20, 30, 26, 'red', '6px', 20],
  [500, 24, 22, 'blue', '50%', 0],
  [540, 84, 30, 'green', '8px', -15],
  [40, 240, 18, 'yellow', '50%', 0],
  [536, 596, 24, 'red', '6px', 35],
  [30, 480, 30, 'blue', '50%', 0],
  [462, 636, 16, 'green', '4px', 10],
] as const;

function Strip({ photo, className, ref }: { photo: Photo; className?: string; ref?: Ref<HTMLDivElement> }) {
  const src = useStripSrc(useDisplayBackend(), photo.id);
  return (
    <div
      ref={ref}
      className={[styles.strip, src ? null : styles.stripLoading, className].filter(Boolean).join(' ')}
    >
      {src ? <img src={src} alt="" draggable={false} /> : null}
    </div>
  );
}

function momentLabel(photos: readonly Photo[]): string | null {
  const numbers = photos.map((p) => p.momentNo).filter((n): n is number => n !== undefined);
  if (numbers.length === 0) return null;
  const lo = Math.min(...numbers);
  const hi = Math.max(...numbers);
  return lo === hi ? `Khoảnh khắc #${lo}` : `Khoảnh khắc #${lo}–#${hi}`;
}

export function ArrivalCard({
  item,
  phase,
  showNames,
  stripRef,
}: {
  item: ArrivalItem;
  phase: CardPhase;
  showNames: boolean;
  stripRef: Ref<HTMLDivElement>;
}) {
  const photos = itemPhotos(item);
  const moment = momentLabel(photos);

  return (
    <div className={`${styles.card} ${phase === 'fly' ? styles.leaving : ''}`} role="status">
      {CONFETTI.map(([left, top, size, colour, radius, rotate], i) => (
        <span
          key={i}
          className={styles.chip}
          style={{
            left,
            top,
            width: size,
            height: size,
            borderRadius: radius,
            background: `var(--pw-${colour}-500)`,
            transform: `rotate(${rotate}deg)`,
          }}
          aria-hidden="true"
        />
      ))}

      <div className={`${styles.stack} ${phase === 'fly' ? styles.flown : ''}`}>
        {/* A merged card fans the first three strips; the front one is the one that flies. */}
        {photos
          .slice(0, 3)
          .reverse()
          .map((photo, i, fan) => (
            <Strip
              key={photo.id}
              photo={photo}
              ref={i === fan.length - 1 ? stripRef : undefined}
              className={i < fan.length - 1 ? styles[`behind${fan.length - 1 - i}`] : undefined}
            />
          ))}
      </div>

      <div className={styles.text}>
        <span className={styles.livePill}>Vừa lên Wall!</span>
        {item.kind === 'photo' ? (
          <>
            <p className={`u ${styles.name}`}>{shownName(item.photo, showNames)}</p>
            <p className={styles.body}>
              Dải ảnh của bạn đang bay vào Wall — tìm nó ở đầu hàng bên phải nhé.
            </p>
          </>
        ) : (
          <>
            <p className={`u ${styles.name}`}>+{item.photos.length} dải ảnh mới</p>
            <p className={styles.body}>
              Các dải ảnh đang bay vào Wall — tìm chúng ở đầu hàng bên phải nhé.
            </p>
          </>
        )}
        {moment ? <span className={styles.momentPill}>{moment}</span> : null}
      </div>
    </div>
  );
}
