/**
 * Big screen kiosk (1920x1080) — DESIGN-D18 / D19, served at /display/.
 *
 * Placeholder. Build in Phase 9: pw-marquee (1236x760 viewport, duplicated
 * track, 70s linear loop), pw-strip-tile at 230x724, pw-counter, pw-qr,
 * pw-arrival-card + the dim layer, and the six-logo footer strip.
 * See Claude/Claude-Plan.md §6 (DESIGN-D18/D19) and §22 Phase 9.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/tokens.css';
import '@/styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <main style={{ padding: 64 }}>
      <h1 className="u" style={{ font: 'var(--pw-type-h1)' }}>
        Photo Wall · Màn hình lớn
      </h1>
      <p style={{ font: 'var(--pw-type-body)', color: 'var(--pw-ink-2)' }}>
        Chưa dựng — xem Claude/Claude-Plan.md §22 Phase 9.
      </p>
    </main>
  </StrictMode>,
);
