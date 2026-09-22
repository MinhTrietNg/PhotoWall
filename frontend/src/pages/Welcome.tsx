/**
 * S01 Welcome — DESIGN-D04, route "/".
 * One screen, one promise, one button.
 */
import { useEffect, useState } from 'react';
import { Screen } from '@/components/Screen';
import { ButtonLink } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PartnerLine } from '@/components/PartnerLine';
import { PhotoWallFrame } from '@/features/frames/PhotoWallFrame';
import { useFrames } from '@/features/frames/useFrames';
import { track } from '@/lib/analytics';
import { useBackend } from '@/lib/backend';
import styles from './Welcome.module.css';

/** The three strips fan out like held cards. Rotations are from the artboard. */
const FAN = [
  { id: 'f01-gdgoc', rotate: -15, top: 6 },
  { id: 'f02-aws', rotate: -2, top: 2 },
  { id: 'f03-partners', rotate: 12, top: 0 },
] as const;

export function Welcome() {
  const { registry } = useFrames();
  const backend = useBackend();
  const [approvedCount, setApprovedCount] = useState(128);

  useEffect(() => backend.watchStats((s) => setApprovedCount(s.approvedCount)), [backend]);

  useEffect(() => {
    const source = new URLSearchParams(location.search).get('utm_source');
    track('pw_start', { utm_source: source === 'display' || source === 'qr' ? source : 'direct' });
  }, []);

  return (
    <Screen>
      <div className={styles.partner}>
        <PartnerLine />
      </div>

      {/*
        Decorative only — the whole zone is hidden from assistive tech.
        The inner box keeps the artboard's 290px composition at its original
        coordinates; the outer one scales it down on short phones so the
        collage shrinks as a group instead of being cropped.
      */}
      <div className={styles.decor} aria-hidden="true">
        <div className={styles.decorInner}>
          <div className={`${styles.float} ${styles.f1}`}>
            <span className="u">&lt;/&gt;</span>
          </div>
          <div className={`${styles.float} ${styles.f2}`} />
          <div className={`${styles.float} ${styles.f3}`}>
            <Icon name="bolt" size={20} />
            {approvedCount} trên Wall
          </div>

          <div className={`${styles.float} ${styles.f4}`}>
            {registry?.frames.length
              ? FAN.map(({ id, rotate, top }) => {
                  const frame = registry.frames.find((f) => f.id === id);
                  return frame ? (
                    <span
                      key={id}
                      className={styles.fanCard}
                      style={{ top, transform: `rotate(${rotate}deg)` }}
                    >
                      <PhotoWallFrame frame={frame} width={58} />
                    </span>
                  ) : null;
                })
              : null}
          </div>

          <div className={`${styles.float} ${styles.f5}`} />
          <div className={`${styles.float} ${styles.f6}`}>
            <span style={{ background: 'var(--pw-blue-500)' }} />
            <span style={{ background: 'var(--pw-red-500)' }} />
            <span style={{ background: 'var(--pw-yellow-500)' }} />
            <span style={{ background: 'var(--pw-green-500)' }} />
          </div>
        </div>
      </div>

      <div className={styles.headline}>
        <h1 className={`u ${styles.hero}`}>
          PHOTO
          <br />
          <span className={styles.wall}>WALL</span>
        </h1>
        <p className={styles.promise}>
          Chụp 4 tấm kiểu photobooth.
          <br />
          Để lại một khoảnh khắc.
        </p>
      </div>

      <div className="screen__cta">
        <ButtonLink to="/name" block iconStart={<Icon name="photoCamera" />}>
          Bắt đầu chụp ảnh
        </ButtonLink>
        <p className={styles.helper}>
          <Icon name="monitor" size={16} />
          Dải ảnh của bạn sẽ hiện trên màn hình lớn tại gian hàng
        </p>
      </div>
    </Screen>
  );
}
