/**
 * D01 Màn hình lớn — DESIGN-D18, and D02 ảnh vừa lên — DESIGN-D19. Served at
 * /display/ as its own app: no app chrome, no router, no sign-in.
 *
 * The centrepiece at the booth. It never stops moving and never needs a human:
 * the marquee runs forever, new strips announce themselves, the cursor is
 * hidden, and the page reloads itself every six hours.
 *
 * Drawn on a stage in artboard pixels, scaled to the window and given the
 * window's shape (see stage.ts), so every measurement below is the design's
 * own and a 16:9 screen shows the artboard exactly.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { Counter } from '@/features/display/Counter';
import { PartnerLogos } from '@/features/display/PartnerLogos';
import { QrCard } from '@/features/display/QrCard';
import { Wall } from '@/features/display/Wall';
import { extraHeight, useReducedMotion, useStage } from '@/features/display/stage';
import { useKioskReload } from '@/features/display/useKioskReload';
import { useDisplayBackend, type DisplayConfig } from '@/lib/backend';
import styles from './Display.module.css';

/** Until config/app is read: the design's defaults, with the QR on this very site. */
const FALLBACK_CONFIG: DisplayConfig = {
  showNames: true,
  arrivalCard: true,
  marqueePxPerSec: null,
  qrUrl: `${location.origin}/`,
  reloadRequestedAtMs: null,
};

export function Display() {
  const api = useDisplayBackend();
  const stage = useStage();
  const reduced = useReducedMotion();
  const [config, setConfig] = useState<DisplayConfig | null>(null);
  const [approvedCount, setApprovedCount] = useState<number | null>(null);

  useEffect(() => api.watchConfig(setConfig), [api]);
  useEffect(() => api.watchStats((s) => setApprovedCount(s.approvedCount)), [api]);
  useKioskReload(config?.reloadRequestedAtMs);

  const shown = config ?? FALLBACK_CONFIG;

  return (
    <div className={styles.screen}>
      <div
        className={styles.stage}
        style={
          {
            width: stage.width,
            height: stage.height,
            '--pw-stage-scale': stage.scale,
            '--pw-stage-extra-y': `${extraHeight(stage) / 2}px`,
          } as CSSProperties
        }
      >
        <header className={styles.header}>
          <h1 className={`u ${styles.title}`}>
            PHOTO <span className={styles.wall}>WALL</span>
          </h1>
          <span className={styles.dots} aria-hidden="true">
            <span style={{ background: 'var(--pw-blue-500)' }} />
            <span style={{ background: 'var(--pw-red-500)' }} />
            <span style={{ background: 'var(--pw-yellow-500)' }} />
            <span style={{ background: 'var(--pw-green-500)' }} />
          </span>
        </header>

        <main className={styles.body}>
          <Wall config={shown} reduced={reduced} />
          <aside className={styles.side}>
            <Counter value={approvedCount} />
            <QrCard url={shown.qrUrl} />
          </aside>
        </main>

        <footer className={styles.footer}>
          <PartnerLogos />
        </footer>
      </div>
    </div>
  );
}
